-- ============================================================================
-- 20261029171000_mis_compras_corregir_un_gasto.sql — CAYLA V2 · ADR-0572 (Mis compras: corregir un gasto de «otra cosa»)
-- La compradora corrige un gasto que anotó con «Gasté en otra cosa» (Comida, Taxi, Saco Piñata…) mientras Compras no lo revise y su ronda siga
-- abierta (Felipe, 2026-10-29: «se deben poder editar, igual que ya se pueden corregir las compras ya anotadas»).
--
-- EL PROBLEMA PRIMERO. Un gasto anotado desde el celular no se podía tocar: `fn_compra_gastos_inmutable` congela concepto, nota, monto y foto, y la única
-- puerta era pedirle a Compras que lo arreglara al revisarlo. Quien anotaba «Comida S/ 4» y era «S/ 14», o «Otro: Saco Piñata» y era «Otro: Saco de
-- piñata», tenía el error adentro de «Tienes para comprar» hasta que Compras lo viera.
--
-- POR QUÉ LA PLATA VUELVE SOLA (como en ADR-0561). Mientras el gasto está «por completar», su monto NO está en el libro de dinero: sale de restar
-- `compra_gastos.monto` de lo que tiene (`fn_mi_plata_tiene`) y de sumar lo gastado de la ronda (`fn_ronda_compras_de`, `fn_ronda_compras_cuenta`, que
-- leen el monto vivo). Corregir el monto recalcula la cuenta de la compradora y el cuaderno de su ronda sin escribir ningún movimiento. Al revisarlo
-- Compras (`revisar_gasto_compra`), el gasto pasa a los libros (que no se editan): por eso la corrección TERMINA ahí.
--
-- QUÉ HACE
--   1. `compra_gasto_correcciones`: el rastro. Una fila por dato cambiado (concepto, nota, monto o foto: antes y ahora), con quién y cuándo, agrupadas
--      por `lote` (un guardado). Append-only (disparador): no se cambia ni se borra.
--   2. `fn_compra_gastos_inmutable` deja cambiar concepto, nota, monto y foto SOLO dentro de `corregir_gasto_rapido` (una marca de la transacción:
--      `retail.gasto_corrigiendo` = el id del gasto). Quién lo anotó, su fecha, su ronda y su huella no cambian nunca; un gasto sigue sin borrarse.
--   3. `fn_compra_gasto_corregible(gasto)`: por qué un gasto ya no se puede corregir (revisado por Compras, anulado, sin ronda, de una ronda cerrada) o
--      NULL si se puede. Una sola regla para leer y guardar.
--   4. `fn_gasto_para_corregir(gasto)`: lo que la hoja necesita para dibujarse (concepto, nota, monto, si tiene foto) y si se puede corregir.
--   5. `corregir_gasto_rapido(gasto, lote, concepto, nota, monto, foto)`: valida todo con las mismas reglas de `registrar_gasto_rapido` y escribe todo
--      o nada. `foto` nula deja la que tenía (se puede sumar o cambiar, no quitar: lo que ya se subió queda en el depósito y en el rastro).
--   6. `fn_gasto_correcciones(gasto)`: el rastro, para leerlo (quien lo anotó o quien tiene Revisar compras).
--
-- CUÁNDO SE PUEDE (la base lo exige, no la pantalla): solo quien anotó el gasto; solo mientras está `por_completar` (Compras todavía no lo revisó); solo
-- si su ronda sigue abierta. Si la cerró, primero la reabre (ADR-0569, `reabrir_ronda_compras`): así el cierre (qué hace con lo que le sobró) se rehace
-- con el gasto ya corregido y nunca queda un cierre con una cifra vieja. Un gasto sin ronda (anotado antes de que existieran las rondas) no se corrige.
--
-- CANDADOS (el orden importa para que nunca se crucen): la ronda de la compradora (la MISMA clave `compra_ronda:` de abrir, cerrar, reabrir y anotar),
-- después el del gasto (la MISMA clave `compra_gasto:` de anotarlo) y la fila del gasto `for update`, que es también lo primero que toma
-- `revisar_gasto_compra`: si Compras lo revisa a la vez, uno espera al otro; si gana Compras, la corrección ve «revisado» y no escribe nada.
--
-- DESCARTÉ
--   · Corregir un gasto ya revisado: ya está en los libros (gasto del viaje con su papel); cambiarlo exigiría un asiento que compense. Se avisa «Avísale
--     a Compras».
--   · Cambiar la fecha o la ronda del gasto: son de cuándo y dónde se anotó; mover un gasto de ronda descuadraría el cierre de las dos.
--   · Quitar la foto: «nada se borra»; si se subió una equivocada, se cambia por la buena y la vieja queda en el rastro.
--   · Una corrección sobre una ronda cerrada recalculando su cierre: el cierre ya pudo mover plata (devolver, que le deban). Reabrir la ronda es el
--     camino que ya existe y cubre también cambiar de idea sobre lo que hace con lo que le sobró.
--   · Reusar `compra_correcciones` (el rastro de las compras): su `papel_id` es una llave a `compra_papeles` y su `campo` un conjunto cerrado de las
--     prendas y el papel; mezclar gastos ahí habría exigido un `alter table` de una tabla de otra función.
--
-- LO QUE NO TOCA. Ningún gasto anotado antes, ningún movimiento de dinero, `registrar_gasto_rapido`, `revisar_gasto_compra`, `terminar_dia_compras`, ni
-- las funciones que suman la ronda. No depende de 20261027231000 ni de 20261029012000: toma los candados con sus claves, sin llamar a sus funciones.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261029150000). UNA sola parte: una tabla nueva (vacía) con su RLS, una función de
-- disparador reemplazada y funciones nuevas; sin `alter` de tablas en uso, sin políticas ni `drop trigger` (ADR-0195). `create or replace` y
-- `if not exists` en todo: idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El rastro de lo que se corrigió ----------
create table if not exists retail.compra_gasto_correcciones (
  id uuid primary key default gen_random_uuid(),
  -- Un guardado de la hoja = un lote: todas sus filas comparten este identificador (y es lo que evita corregir dos veces con dos toques).
  lote uuid not null,
  gasto_id uuid not null references retail.compra_gastos (id),
  campo text not null check (campo in ('concepto', 'nota', 'monto', 'foto')),
  -- Para la foto, la ruta del depósito (o nada si no tenía); para el resto, el valor tal cual.
  antes text,
  despues text,
  corregida_por uuid not null references public.personas (id),
  corregida_en timestamptz not null default now(),
  constraint compra_gasto_correcciones_cambia check (antes is distinct from despues)
);
comment on table retail.compra_gasto_correcciones is
  'ADR-0572: el rastro de las correcciones de un gasto de «otra cosa» anotado desde el celular: qué dato cambió, cuánto valía antes y ahora, quién y cuándo. No se cambia ni se borra.';
create index if not exists compra_gasto_correcciones_gasto on retail.compra_gasto_correcciones (gasto_id, corregida_en);
create unique index if not exists compra_gasto_correcciones_lote_dato on retail.compra_gasto_correcciones (lote, gasto_id, campo);

alter table retail.compra_gasto_correcciones enable row level security;
revoke all on retail.compra_gasto_correcciones from anon, authenticated;

create or replace function retail.fn_compra_gasto_correcciones_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El rastro de una corrección no se cambia ni se borra.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_compra_gasto_correcciones_inmutable() from public, anon, authenticated;
create or replace trigger compra_gasto_correcciones_inmutable
  before update or delete on retail.compra_gasto_correcciones
  for each row execute function retail.fn_compra_gasto_correcciones_inmutable();

-- ---------- 2. Lo que anotó la compradora no cambia, salvo al corregir ----------
-- Se reescribe entera (no por reemplazo anclado): sin 20261023114000 aplicada, no existe; con ella, queda igual salvo la excepción nueva.
create or replace function retail.fn_compra_gastos_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_corrige boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Un gasto anotado no se borra.' using errcode = 'P0001';
  end if;
  -- Quién lo anotó, cuándo, su identificador y su huella (la de lo que se anotó al principio: reintentar el mismo guardado devuelve lo que ya quedó)
  -- no cambian nunca.
  if (new.id, new.persona_id, new.fecha, new.huella, new.registrado_por, new.created_at)
     is distinct from (old.id, old.persona_id, old.fecha, old.huella, old.registrado_por, old.created_at) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al revisarlo.' using errcode = 'P0001';
  end if;
  -- El concepto, la nota, el monto y la foto solo cambian cuando la compradora corrige su gasto (`corregir_gasto_rapido`, que pone la marca de este
  -- gasto y solo de este).
  v_corrige := coalesce(current_setting('retail.gasto_corrigiendo', true), '') = old.id::text;
  if not v_corrige and (new.concepto, new.nota, new.monto, new.foto_ruta) is distinct from (old.concepto, old.nota, old.monto, old.foto_ruta) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al revisarlo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function retail.fn_compra_gastos_inmutable() from public, anon, authenticated;

-- ---------- 3. Por qué un gasto ya no se puede corregir ----------
create or replace function retail.fn_compra_gasto_corregible(p_gasto_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when g.id is null then 'no_existe'
    when g.estado = 'completado' then 'revisado'
    when g.estado <> 'por_completar' then 'anulado'
    when g.ronda_id is null then 'sin_ronda'
    when exists (select 1 from retail.compra_rondas r where r.id = g.ronda_id and r.cerrada_en is not null) then 'ronda_cerrada'
    else null
  end
  from (select 1) uno left join retail.compra_gastos g on g.id = p_gasto_id
$$;
revoke all on function retail.fn_compra_gasto_corregible(uuid) from public, anon, authenticated;

-- ---------- 4. Lo que la hoja de corregir necesita ----------
create or replace function retail.fn_gasto_para_corregir(p_gasto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_g retail.compra_gastos%rowtype;
  v_motivo text;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Corregir un gasto necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién corrige el gasto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  for v_g in select * from retail.compra_gastos g where g.id = p_gasto_id and g.persona_id = v_actor loop
    exit;
  end loop;
  if v_g.id is null then
    raise exception 'No encontramos ese gasto entre los tuyos' using errcode = 'P0001', hint = 'gasto_corregir_ajeno';
  end if;
  v_motivo := retail.fn_compra_gasto_corregible(v_g.id);
  return jsonb_build_object(
    'gasto', jsonb_build_object('id', v_g.id, 'concepto', v_g.concepto, 'nota', v_g.nota, 'monto', v_g.monto,
                                'con_foto', v_g.foto_ruta is not null, 'fecha', v_g.fecha),
    'se_puede', v_motivo is null,
    'motivo', v_motivo);
end $$;
revoke all on function retail.fn_gasto_para_corregir(uuid) from public, anon;
grant execute on function retail.fn_gasto_para_corregir(uuid) to authenticated;

-- ---------- 5. Corregir el gasto ----------
-- Se manda lo que queda (concepto, nota, monto): lo que no cambia, igual. `p_foto_ruta` nula deja la foto que tenía. `p_lote` lo genera la hoja al
-- abrirse; el mismo lote dos veces devuelve lo que ya quedó.
create or replace function retail.corregir_gasto_rapido(
  p_gasto_id uuid,
  p_lote uuid,
  p_concepto text,
  p_nota text,
  p_monto numeric,
  p_foto_ruta text default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_g retail.compra_gastos%rowtype;
  v_motivo text;
  v_concepto text := lower(btrim(coalesce(p_concepto, '')));
  v_nota text := nullif(btrim(retail.fn_sin_invisibles(coalesce(p_nota, ''))), '');
  v_monto numeric := round(p_monto, 2);
  v_foto text := nullif(btrim(coalesce(p_foto_ruta, '')), '');
  v_foto_final text;
  v_n integer := 0;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Corregir un gasto necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién corrige el gasto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_gasto_id is null or p_lote is null then
    raise exception 'Falta el identificador de la corrección: vuelve a abrir el gasto' using errcode = 'P0001', hint = 'gasto_corregir_sin_id';
  end if;

  -- Candados, siempre en este orden: la ronda (la clave de abrir y cerrarla), el gasto (la clave de anotarlo) y su fila.
  perform pg_advisory_xact_lock(hashtextextended('compra_ronda:' || v_actor::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('compra_gasto:' || p_gasto_id::text, 0));
  for v_g in select * from retail.compra_gastos g where g.id = p_gasto_id and g.persona_id = v_actor for update loop
    exit;
  end loop;
  if v_g.id is null then
    raise exception 'No encontramos ese gasto entre los tuyos' using errcode = 'P0001', hint = 'gasto_corregir_ajeno';
  end if;

  -- El mismo guardado otra vez (doble clic, o un reintento tras un corte): devuelve lo que ya quedó, sin corregir de nuevo.
  if exists (select 1 from retail.compra_gasto_correcciones c where c.lote = p_lote and c.gasto_id = p_gasto_id) then
    return jsonb_build_object('gasto_id', p_gasto_id, 'lote', p_lote, 'ya_estaba', true, 'monto', v_g.monto, 'tiene', retail.fn_mi_plata_tiene(v_actor));
  end if;
  if exists (select 1 from retail.compra_gasto_correcciones c where c.lote = p_lote) then
    raise exception 'Esa corrección ya se guardó en otro gasto: vuelve a abrir el gasto' using errcode = 'P0001', hint = 'gasto_corregir_otro_lote';
  end if;

  v_motivo := retail.fn_compra_gasto_corregible(p_gasto_id);
  if v_motivo is not null then
    raise exception '%', case v_motivo
      when 'revisado' then 'Compras ya revisó este gasto: ya no se corrige desde aquí. Avísale a Compras.'
      when 'ronda_cerrada' then 'Este gasto es de una ronda que ya cerraste: reábrela para corregirlo.'
      when 'sin_ronda' then 'Este gasto no es de ninguna ronda: avísale a Compras.'
      else 'Este gasto ya no se puede corregir.' end
      using errcode = 'P0001', hint = 'gasto_corregir_' || v_motivo;
  end if;

  -- Las mismas reglas de anotarlo (`registrar_gasto_rapido`): todo se valida antes de escribir.
  if v_concepto not in ('taxi', 'cargador', 'comida', 'envio', 'bolsas', 'otro') then
    raise exception 'Elige en qué gastaste' using errcode = 'P0001', hint = 'gasto_rapido_concepto';
  end if;
  if v_concepto = 'otro' and v_nota is null then
    raise exception 'Con «Otro», escribe en qué gastaste' using errcode = 'P0001', hint = 'gasto_rapido_sin_nota';
  end if;
  if v_nota is not null and char_length(v_nota) > 120 then
    raise exception 'Lo que escribiste es muy largo: hasta 120 letras' using errcode = 'P0001', hint = 'gasto_rapido_nota_larga';
  end if;
  if not retail.fn_monto_valido(p_monto) or v_monto <= 0 or v_monto > 100000 then
    raise exception 'Escribe cuánto gastaste: un monto mayor que cero' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_foto is not null and (v_foto not like 'gastos/%' or char_length(v_foto) > 300) then
    raise exception 'La foto del papel no se subió bien: vuelve a tomarla' using errcode = 'P0001', hint = 'gasto_rapido_foto';
  end if;
  v_foto_final := coalesce(v_foto, v_g.foto_ruta);

  if (v_concepto, v_nota, v_monto, v_foto_final) is not distinct from (v_g.concepto, v_g.nota, v_g.monto, v_g.foto_ruta) then
    raise exception 'No cambiaste nada' using errcode = 'P0001', hint = 'gasto_corregir_sin_cambios';
  end if;

  -- La marca que el disparador exige: vale solo en esta transacción y solo para este gasto.
  perform set_config('retail.gasto_corrigiendo', v_g.id::text, true);
  update retail.compra_gastos set concepto = v_concepto, nota = v_nota, monto = v_monto, foto_ruta = v_foto_final where id = v_g.id;
  perform set_config('retail.gasto_corrigiendo', '', true);

  if v_concepto <> v_g.concepto then
    insert into retail.compra_gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (p_lote, v_g.id, 'concepto', v_g.concepto, v_concepto, v_actor);
    v_n := v_n + 1;
  end if;
  if v_nota is distinct from v_g.nota then
    insert into retail.compra_gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (p_lote, v_g.id, 'nota', v_g.nota, v_nota, v_actor);
    v_n := v_n + 1;
  end if;
  if v_monto <> v_g.monto then
    insert into retail.compra_gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (p_lote, v_g.id, 'monto', v_g.monto::text, v_monto::text, v_actor);
    v_n := v_n + 1;
  end if;
  if v_foto_final is distinct from v_g.foto_ruta then
    insert into retail.compra_gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
    values (p_lote, v_g.id, 'foto', v_g.foto_ruta, v_foto_final, v_actor);
    v_n := v_n + 1;
  end if;

  -- Actividad (ADR-0207), sin montos. Si falla, la corrección igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'gasto_rapido_corregido',
      'corrigió un gasto de ' || case v_concepto when 'taxi' then 'taxi' when 'cargador' then 'cargador' when 'comida' then 'comida'
                                                 when 'envio' then 'envío' when 'bolsas' then 'bolsas' else coalesce(v_nota, 'otra cosa') end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_gastos', p_gasto_id::text, now(),
      jsonb_build_object('gasto_id', p_gasto_id, 'lote', p_lote, 'datos', v_n), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección del gasto %: %', p_gasto_id, sqlerrm;
  end;

  return jsonb_build_object('gasto_id', p_gasto_id, 'lote', p_lote, 'ya_estaba', false, 'datos', v_n, 'monto', v_monto,
                            'tiene', retail.fn_mi_plata_tiene(v_actor));
end $$;
comment on function retail.corregir_gasto_rapido(uuid, uuid, text, text, numeric, text) is
  'ADR-0572: corrige el concepto, la nota, el monto y la foto de un gasto de «otra cosa», mientras Compras no lo revise y su ronda siga abierta. Deja el rastro.';
revoke all on function retail.corregir_gasto_rapido(uuid, uuid, text, text, numeric, text) from public, anon;
grant execute on function retail.corregir_gasto_rapido(uuid, uuid, text, text, numeric, text) to authenticated;

-- Firma sin combo con la cuenta de una persona (desde una terminal, el combo), como anotar el gasto.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('gasto_corregir', 'Corregir un gasto de otra cosa que anotaste desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 6. El rastro de un gasto, para leerlo ----------
-- Lo ve quien lo anotó (con «Mi plata para compras») y quien revisa compras (módulo `fondos`): cada corrección (un lote = un guardado) con quién,
-- cuándo y qué cambió, de la más nueva a la más vieja. Del mismo formato que `fn_compra_correcciones`. No escribe nada. La foto no manda su ruta:
-- solo dice si había.
create or replace function retail.fn_gasto_correcciones(p_gasto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
  v_duena uuid;
begin
  v_duena := (select g.persona_id from retail.compra_gastos g where g.id = p_gasto_id);
  if v_duena is null then
    return '[]'::jsonb;
  end if;
  if not (retail.fn_ve_modulo('fondos') is true or (retail.fn_ve_modulo('ordenes_compra') is true and v_yo is not null and v_yo = v_duena)) then
    raise exception 'Ver las correcciones de un gasto necesita ser quien lo anotó o tener el módulo Revisar compras' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(l.fila order by l.cuando desc)
      from (
        select max(c.corregida_en) as cuando,
               jsonb_build_object(
                 'lote', c.lote,
                 'cuando', max(c.corregida_en),
                 'quien', (select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = min(c.corregida_por::text)::uuid),
                 'cambios', jsonb_agg(jsonb_build_object(
                              'campo', c.campo,
                              'antes', case when c.campo = 'foto' then case when c.antes is null then null else 'foto' end else c.antes end,
                              'despues', case when c.campo = 'foto' then case when c.despues is null then null else 'foto' end else c.despues end,
                              'prenda', null)
                            order by c.corregida_en, c.id)) as fila
          from retail.compra_gasto_correcciones c
         where c.gasto_id = p_gasto_id
         group by c.lote
      ) l), '[]'::jsonb);
end $$;
revoke all on function retail.fn_gasto_correcciones(uuid) from public, anon;
grant execute on function retail.fn_gasto_correcciones(uuid) to authenticated;

notify pgrst, 'reload schema';

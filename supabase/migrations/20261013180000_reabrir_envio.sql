-- ADR-0393 · actividad 4, primer paso: reabrir un envío ya recibido para cuadrarlo, mientras Compras no haya resuelto lo que faltó.
--
-- EL PROBLEMA PRIMERO. Una sede cierra el conteo con «faltan 2» y media hora después encuentra las 2 blusas al fondo de otra bolsa. Hoy
-- cerrado es final: la deuda de 2 queda en «Nos debe» aunque las prendas están en la tienda, y alguien le reclama al proveedor lo que sí
-- mandó. La decisión 5 de Felipe: se puede reabrir para cuadrar, hasta que Compras resuelva la diferencia. Reabrir no puede tocar lo que
-- ya entró al stock (eso ya se vendió, se colgó o se trasladó), ni borrar nada.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despacho_diferencias.vigente` y la vista `despacho_diferencias_vigentes`: al reabrir, lo que faltó o sobró deja de valer (no se
--      borra: queda como historia) y el nuevo cierre escribe lo suyo. Los únicos «una diferencia por línea» pasan a «una VIGENTE por
--      línea» (invariante 4 del ADR). Las ocho lecturas de «Nos debe» y del detalle del envío (de Compras, REEMPLAZOS ANCLADOS) y las dos
--      del cierre leen la vista: el mismo cambio mecánico en todas (`from retail.despacho_diferencias x` → `…_vigentes x`).
--   2. `despacho_cierres`: el rastro de cada cierre (con lo que respondió) y de cada reapertura (quién, cuándo y por qué).
--   3. `reabrir_envio`: cerrado → abierto, con su motivo, mientras ninguna diferencia vigente tenga una resolución en «Nos debe» y lo de
--      más del envío no haya saldado otra deuda (invariante 5). Lo pendiente vuelve al borrador de su línea; lo que entró no se toca.
--   4. Lo contado no baja de lo que ya entró: `guardar_conteo_envio` (REEMPLAZO ANCLADO) lo dice con palabras, y el candado diferido
--      de 20261013172000 se extiende a `despacho_conteos` (la base no lo deja aunque se escriba a mano).
--   5. `fn_despachos_camino` (REEMPLAZO ANCLADO) deja pasar cerrado → abierto solo desde reabrir_envio; `recibir_despacho` (REEMPLAZO
--      ANCLADO) no cierra un envío reabierto (volvería a meter lo que ya entró); `fn_envio_conteos` suma el rastro y si se puede reabrir.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Dos diferencias vigentes de la misma línea → únicos parciales `despacho_diferencias_*_vigente_unica`.
--   · Un envío reabierto cuya deuda ya empezó a saldarse → reabrir_envio, con las diferencias vigentes tomadas FOR UPDATE (las mismas
--     filas que toman resolver_deuda_proveedor y la reposición de otra recepción: se ponen en fila).
--   · Una diferencia que vuelve a valer, o que cambia otra cosa → disparador `despacho_diferencias_fija` (solo vigente true → false, y
--     solo desde reabrir_envio).
--   · Lo contado por debajo de lo que ya entró al stock → candado diferido `despacho_conteos_cuadra`.
--   · Un rastro que cambia o se borra → disparador `despacho_cierres_fija`.
--
-- CONTRATO de reabrir_envio
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (que no hizo ninguna de sus órdenes, decisión 17), y con el motivo,
--            deja el envío abierto: lo que faltó o sobró deja de valer (sale de «Nos debe»), lo pendiente vuelve al borrador de su línea
--            (anulado como pendiente) y queda el rastro. Lo que entró al stock queda donde está. Todo o nada. Mismo token: responde sin
--            reabrir dos veces.
--   ASUME:   el envío está cerrado y la pantalla dice la versión que vio.
--   NO HACE: no deshace stock ni costo, no toca lo que Compras ya resolvió (por eso se niega), no cierra (eso es cerrar_conteo_envio).
--
-- DESCARTÉ:
--   · Agregar `cierre` a cada diferencia y que cada lector filtre «la del último cierre» (lo que decía el ADR): ocho funciones de Compras
--     con una condición propia cada una, y la próxima lectura la olvida y muestra dos deudas de la misma línea. Una vista de las vigentes
--     y un cambio mecánico de su FROM: un lector nuevo que lea la tabla se nota en revisión.
--   · Calcular «vigente» en la vista uniendo con `despachos` (sin columna): bloquear una deuda bloquearía también la fila del envío, y
--     reabrir (envío → deudas) y resolver una deuda (deuda → envío) podrían esperarse en cruz.
--   · Mover las diferencias viejas a otra tabla: es borrar (CLAUDE.md: nunca DELETE; se archiva con una columna).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013173000: una columna nueva en `despacho_diferencias` (0
-- filas en producción, la escriben solo las funciones de la recepción), dos índices que se cambian (`drop index` no toma las tablas de
-- auth y storage), una tabla nueva sin políticas, disparadores con `create or replace trigger` y el diferido con «si no existe»; sin
-- `drop trigger` ni políticas (ADR-0195) y sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos anclados abortan
-- sin tocar nada si una definición viva cambió y no hacen nada si ya están. Se puede pegar dos veces. El bloque final comprueba todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Lo que faltó o sobró deja de valer al reabrir: no se borra ----------
alter table retail.despacho_diferencias add column if not exists vigente boolean not null default true;
comment on column retail.despacho_diferencias.vigente is
  'ADR-0393: false si el envío se reabrió después de anotarla (la reemplaza la del cierre siguiente). Nunca vuelve a true. Se lee por '
  'la vista despacho_diferencias_vigentes.';
drop index if exists retail.despacho_diferencias_linea_unica;
drop index if exists retail.despacho_diferencias_extra_unica;
create unique index if not exists despacho_diferencias_linea_vigente_unica on retail.despacho_diferencias (despacho_id, despacho_item_id)
  where despacho_item_id is not null and vigente;
create unique index if not exists despacho_diferencias_extra_vigente_unica on retail.despacho_diferencias (despacho_id, extra_posicion)
  where extra_posicion is not null and vigente;

-- Lo que vale hoy. Lo leen «Nos debe», el detalle del envío y el cierre; se escribe en la tabla. `select *`: si la tabla gana una columna,
-- se vuelve a crear esta vista (create or replace la agrega al final).
create or replace view retail.despacho_diferencias_vigentes as
  select * from retail.despacho_diferencias where vigente;
comment on view retail.despacho_diferencias_vigentes is
  'ADR-0393: las diferencias que valen hoy (las de un envío reabierto dejan de valer hasta el cierre siguiente). Lectura de «Nos debe», '
  'del detalle del envío y del cierre; se puede tomar FOR UPDATE (bloquea la fila de despacho_diferencias). Solo funciones.';
revoke all on table retail.despacho_diferencias_vigentes from anon, authenticated;

-- Lo recibido y lo que faltó o sobró no cambian ni se borran; la única excepción: reabrir_envio deja de dar por válida una diferencia.
create or replace function retail.fn_recepcion_despacho_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- Anidado a propósito: `vigente` solo existe en despacho_diferencias, y OLD no existe al insertar.
  if tg_op = 'UPDATE' and tg_table_name = 'despacho_diferencias' and current_setting('retail.reabriendo', true) = 'si' then
    if (to_jsonb(old) ->> 'vigente')::boolean and not (to_jsonb(new) ->> 'vigente')::boolean
       and (to_jsonb(new) - 'vigente') = (to_jsonb(old) - 'vigente') then
      return new;
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró'
      using errcode = '42501', hint = 'recepcion_inmutable';
  end if;
  -- Al cerrar, con el envío abierto. ADR-0393: lo que entra por un pendiente (o lo que se separa después) se anota con el envío ya
  -- cerrado, y solo desde resolver_pendiente_envio, que lo avisa con `retail.resolviendo_pendiente`. Lo que faltó o sobró, nunca después.
  if not exists (select 1 from retail.despachos d
                  where d.id = new.despacho_id
                    and (d.estado = 'abierto'
                         or (d.estado = 'cerrado' and tg_table_name = 'despacho_recibidos'
                             and current_setting('retail.resolviendo_pendiente', true) = 'si'))) then
    raise exception 'Solo se anota lo que llegó de un envío abierto' using errcode = '23514', hint = 'recepcion_envio_no_abierto';
  end if;
  if new.despacho_item_id is not null and not exists (
    select 1 from retail.despacho_items di where di.id = new.despacho_item_id and di.despacho_id = new.despacho_id
  ) then
    raise exception 'Esa línea no es de este envío' using errcode = '23514', hint = 'recepcion_linea_ajena';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_recepcion_despacho_fija() from public, anon, authenticated;

-- ---------- 2. Las lecturas leen lo que vale (reemplazos anclados: el mismo cambio en todas) ----------
do $do$
declare
  v_f record;
begin
  for v_f in
    select * from (values
      ('retail.fn_envio_detalle(uuid)', 1),
      ('retail.fn_nos_debe_del_envio(uuid)', 1),
      ('retail.fn_nos_debe_deuda(uuid)', 1),
      ('retail.fn_nos_debe_pendiente(uuid,uuid,uuid,uuid)', 1),
      ('retail.fn_nos_debe_resumen()', 1),
      ('retail.fn_proveedor_deuda_resoluciones_candado()', 2),
      ('retail.fn_proveedor_nos_debe(uuid)', 1),
      ('retail.resolver_deuda_proveedor(uuid,text,integer,text,uuid)', 1),
      ('retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)', 3),
      ('retail.fn_recepcion_resultado(uuid)', 2)
    ) as t(firma, veces)
  loop
    perform pg_temp.reemplazar(v_f.firma, 'from retail.despacho_diferencias x', 'from retail.despacho_diferencias_vigentes x', v_f.veces);
  end loop;
end;
$do$;

-- ---------- 3. El rastro de cada cierre y cada reapertura ----------
create table if not exists retail.despacho_cierres (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  tipo text not null check (tipo in ('cierre', 'reapertura')),
  -- Por qué se reabrió («encontramos las 2 que faltaban»).
  motivo text check (motivo is null or length(motivo) between 3 and 300),
  -- Lo que respondió el cierre (fn_recepcion_resultado) y su nota: cómo quedó esa vez. Al reabrir, el envío los olvida; aquí quedan.
  resultado jsonb,
  nota text check (nota is null or length(nota) <= 500),
  -- El token del cierre o de la reapertura: un doble clic no repite nada.
  token uuid unique,
  hecho_por uuid not null references public.personas (id),
  -- La hora real de cada fila (no la de la transacción): el rastro se lee en orden aunque un cierre y una reapertura caigan juntos.
  hecho_en timestamptz not null default clock_timestamp(),
  constraint despacho_cierres_motivo check ((tipo = 'reapertura') = (motivo is not null)),
  constraint despacho_cierres_resultado check ((tipo = 'cierre') = (resultado is not null)),
  constraint despacho_cierres_nota check (tipo = 'cierre' or nota is null)
);
create index if not exists despacho_cierres_despacho_idx on retail.despacho_cierres (despacho_id);
comment on table retail.despacho_cierres is
  'ADR-0393: el rastro de un envío: cada cierre (con lo que respondió) y cada reapertura (con su motivo), quién y cuándo. No se cambia ni '
  'se borra. Solo se lee y escribe por funciones (RLS sin políticas).';
alter table retail.despacho_cierres enable row level security;
revoke all on table retail.despacho_cierres from anon, authenticated;

create or replace function retail.fn_despacho_cierres_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El rastro de un envío no se cambia ni se borra' using errcode = '42501', hint = 'rastro_inmutable';
end;
$$;
revoke all on function retail.fn_despacho_cierres_fija() from public, anon, authenticated;
create or replace trigger despacho_cierres_fija
  before update or delete on retail.despacho_cierres
  for each row execute function retail.fn_despacho_cierres_fija();

-- Cada cierre deja su fila (reemplazo anclado sobre el cierre único de 20261013172000).
select pg_temp.reemplazar(
  'retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)',
  $v$  v_res := retail.fn_recepcion_resultado(p_despacho_id);$v$,
  $v$  v_res := retail.fn_recepcion_resultado(p_despacho_id);
  -- ADR-0393: el rastro del envío (un cierre, con cómo quedó; al reabrir, otra fila).
  insert into retail.despacho_cierres (despacho_id, tipo, resultado, nota, token, hecho_por)
  values (p_despacho_id, 'cierre', v_res, v_nota, p_token, v_actor);$v$,
  1);

-- ---------- 4. Lo contado no baja de lo que ya entró ----------
-- La base: el candado diferido de cada línea mira también lo contado (con el envío reabierto se puede cambiar).
do $do$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_conteos'::regclass and t.tgname = 'despacho_conteos_cuadra') then
    create constraint trigger despacho_conteos_cuadra
      after update on retail.despacho_conteos
      deferrable initially deferred
      for each row execute function retail.fn_envio_linea_cuadra();
  end if;
end;
$do$;

-- Con palabras, al guardar (reemplazo anclado sobre 20261013171000): lo contado no baja de lo que entró, y lo separado es lo que falta.
select pg_temp.reemplazar(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$  v_total := retail.fn_envio_total_separado(v_sep);
  if v_total > p_contadas then$v$,
  $v$  v_total := retail.fn_envio_total_separado(v_sep);
  -- ADR-0393 (reabrir): lo que ya entró al stock de esta línea no se toca. Lo contado no baja de eso, y lo separado es lo que falta.
  declare
    v_en_stock integer := coalesce((select sum(r.cantidad) from retail.despacho_recibidos r
                                     where r.despacho_id = p_despacho_id
                                       and r.despacho_item_id is not distinct from p_despacho_item_id
                                       and r.extra_posicion is not distinct from p_extra_posicion), 0);
  begin
    if p_contadas < v_en_stock then
      raise exception 'De % ya entraron % al stock: lo contado no puede ser menos', v_donde, v_en_stock using hint = 'conteo_menos_que_stock';
    end if;
    if v_total > p_contadas - v_en_stock then
      raise exception 'De % ya entraron % al stock y separaste %: queda % por separar', v_donde, v_en_stock, v_total,
        p_contadas - v_en_stock using hint = 'conteo_separado_de_mas';
    end if;
  end;
  if v_total > p_contadas then$v$,
  1);

-- ---------- 5. Cerrado → abierto, solo desde reabrir_envio; el formulario de la fase 4 no cierra un envío reabierto ----------
select pg_temp.reemplazar(
  'retail.fn_despachos_camino()',
  $v$              or (old.estado = 'abierto' and new.estado = 'cerrado')) then$v$,
  $v$              or (old.estado = 'abierto' and new.estado = 'cerrado')
              -- ADR-0393: reabrir un envío ya recibido, solo desde reabrir_envio (lo avisa con retail.reabriendo).
              or (old.estado = 'cerrado' and new.estado = 'abierto' and current_setting('retail.reabriendo', true) = 'si')) then$v$,
  1);
select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;$v$,
  $v$  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  -- ADR-0393: un envío reabierto ya tiene stock adentro; este formulario lo volvería a meter. Se cierra desde el conteo.
  if exists (select 1 from retail.despacho_cierres c where c.despacho_id = p_despacho_id) then
    raise exception 'Este envío se reabrió: ciérralo desde el conteo' using hint = 'envio_reabierto';
  end if;$v$,
  1);

-- Cómo se recibió un envío se escribe al cerrarlo y no se cambia; ADR-0393: reabrir lo borra del envío (queda en despacho_cierres),
-- y solo eso, solo desde reabrir_envio. Reescrita entera (era de 20261013001000, la recepción de la fase 4): su texto de siempre más
-- el primer bloque.
create or replace function retail.fn_despachos_recepcion_fija()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if old.estado = 'cerrado' and new.estado = 'abierto' and current_setting('retail.reabriendo', true) = 'si' then
    if new.abierto_por is distinct from old.abierto_por or new.abierto_en is distinct from old.abierto_en
       or new.cerrado_por is not null or new.cerrado_en is not null
       or new.nota_recepcion is not null or new.recepcion_token is not null or new.recepcion_huella is not null then
      raise exception 'Reabrir un envío solo borra cómo se cerró' using errcode = '23514', hint = 'recepcion_inmutable';
    end if;
    return new;
  end if;
  if (new.nota_recepcion is distinct from old.nota_recepcion
      or new.recepcion_token is distinct from old.recepcion_token
      or new.recepcion_huella is distinct from old.recepcion_huella)
     and not (old.estado = 'abierto' and new.estado = 'cerrado') then
    raise exception 'Cómo se recibió un envío se escribe al cerrarlo y ya no se cambia' using errcode = '23514', hint = 'recepcion_inmutable';
  end if;
  if old.estado = 'cerrado'
     and (new.abierto_por is distinct from old.abierto_por or new.abierto_en is distinct from old.abierto_en
          or new.cerrado_por is distinct from old.cerrado_por or new.cerrado_en is distinct from old.cerrado_en) then
    raise exception 'Quién y cuándo abrió y recibió un envío ya recibido no se cambia' using errcode = '23514', hint = 'recepcion_inmutable';
  end if;
  return new;
end;
$$;

-- ---------- 6. ¿Se puede reabrir? Una sola regla, para la función y para la pantalla ----------
-- NULL si se puede; si no, la pista: Compras ya resolvió parte de lo que faltó (deuda_resuelta) o lo de más de este envío ya saldó lo
-- que el proveedor debía de otro (reposicion_saldo).
create or replace function retail.fn_envio_reabrir_bloqueo(p_despacho_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when exists (select 1 from retail.proveedor_deuda_resoluciones r
                   join retail.despacho_diferencias_vigentes x on x.id = r.diferencia_id
                  where x.despacho_id = p_despacho_id) then 'reabrir_deuda_resuelta'
    when exists (select 1 from retail.proveedor_deuda_resoluciones r
                   join retail.despacho_diferencias_vigentes x on x.id = r.sobrante_id
                  where x.despacho_id = p_despacho_id) then 'reabrir_reposicion_saldo'
  end;
$$;
comment on function retail.fn_envio_reabrir_bloqueo(uuid) is
  'ADR-0393 (decisión 5): por qué un envío cerrado ya no se reabre (reabrir_deuda_resuelta | reabrir_reposicion_saldo), o NULL. Interna.';
revoke all on function retail.fn_envio_reabrir_bloqueo(uuid) from public, anon, authenticated;

-- ---------- 7. Reabrir ----------
create or replace function retail.reabrir_envio(
  p_despacho_id uuid,
  p_version integer,
  p_motivo text,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_previa retail.despacho_cierres;
  v_bloqueo text;
  v_vueltas integer;
  v_version integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Reabrir un envío necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados en el orden de siempre (ADR-0190): el envío → lo que faltó o sobró (las mismas filas que toman resolver_deuda_proveedor y la
  -- reposición de otra recepción: si una de ellas llegó primero, aquí se ve lo que dejó).
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: la misma reapertura responde sin reabrir dos veces.
  if p_token is not null then
    select c.* into v_previa from retail.despacho_cierres c where c.token = p_token;
    if found then
      if v_previa.despacho_id = p_despacho_id and v_previa.motivo is not distinct from v_motivo then
        return jsonb_build_object('despacho_id', p_despacho_id, 'numero', v_envio, 'estado', v_despacho.estado,
                                  'version', v_despacho.version, 'repetido', true);
      end if;
      raise exception 'Eso ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
  end if;

  if v_despacho.estado = 'abierto' then
    raise exception 'Este envío ya está abierto: cuéntalo y ciérralo' using hint = 'envio_ya_abierto';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío: recarga' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Escribe por qué lo reabres (por ejemplo, «encontramos las que faltaban»)' using hint = 'reabrir_motivo';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'reabrir_motivo';
  end if;

  -- Decisión 5: hasta que Compras resuelva la diferencia. Las diferencias vigentes se toman antes de mirar.
  perform 1 from retail.despacho_diferencias_vigentes x where x.despacho_id = p_despacho_id order by x.id for update;
  v_bloqueo := retail.fn_envio_reabrir_bloqueo(p_despacho_id);
  if v_bloqueo = 'reabrir_deuda_resuelta' then
    raise exception 'Compras ya resolvió parte de lo que faltó en %: ya no se reabre', v_envio using hint = v_bloqueo;
  end if;
  if v_bloqueo = 'reabrir_reposicion_saldo' then
    raise exception 'Lo de más de % ya saldó lo que el proveedor debía de otro envío: ya no se reabre', v_envio using hint = v_bloqueo;
  end if;

  -- Lo que faltó o sobró deja de valer (sale de «Nos debe»); el próximo cierre escribe lo suyo.
  perform set_config('retail.reabriendo', 'si', true);
  begin
    update retail.despacho_diferencias x set vigente = false where x.despacho_id = p_despacho_id and x.vigente;
    update retail.despachos d
       set estado = 'abierto', cerrado_por = null, cerrado_en = null, nota_recepcion = null, recepcion_token = null, recepcion_huella = null
     where d.id = p_despacho_id;
  exception when others then
    perform set_config('retail.reabriendo', '', true);
    raise;
  end;
  perform set_config('retail.reabriendo', '', true);

  -- El borrador de CADA línea pasa a ser lo que todavía no está en el stock: lo que no entró de cada «detalle» (por prenda) y de cada
  -- «crear». Lo que ya entró sale del borrador (si no, el próximo cierre lo metería dos veces); lo sin separar no es fila: sigue siendo
  -- lo que sobra de lo contado.
  with abiertos as (
    select x.id, x.despacho_item_id, x.extra_posicion, x.tipo, x.producto_id, x.descripcion, x.anotado_en,
           x.cantidad - coalesce((select sum(r.cantidad) from retail.despacho_recibidos r where r.pendiente_id = x.id), 0)::integer as quedan
      from retail.despacho_pendientes x
     where x.despacho_id = p_despacho_id and x.estado = 'pendiente'
  )
  update retail.despacho_conteos k
     set separado = jsonb_build_object(
           'prendas', coalesce((select jsonb_agg(jsonb_build_object('producto_id', g.producto_id, 'cantidad', g.quedan, 'variantes', null)
                                                 order by g.primero)
                                  from (select b.producto_id, sum(b.quedan)::integer as quedan, min(b.anotado_en) as primero
                                          from abiertos b
                                         where b.tipo = 'detalle' and b.quedan > 0
                                           and b.despacho_item_id is not distinct from k.despacho_item_id
                                           and b.extra_posicion is not distinct from k.extra_posicion
                                         group by b.producto_id) g), '[]'::jsonb),
           'nuevas', coalesce((select jsonb_agg(jsonb_build_object('cantidad', b.quedan, 'descripcion', b.descripcion) order by b.anotado_en, b.id)
                                 from abiertos b
                                where b.tipo = 'crear' and b.quedan > 0
                                  and b.despacho_item_id is not distinct from k.despacho_item_id
                                  and b.extra_posicion is not distinct from k.extra_posicion), '[]'::jsonb)),
         version = k.version + 1
   where k.despacho_id = p_despacho_id;
  update retail.despacho_pendientes x
     set estado = 'anulado', resuelto_por = v_actor, resuelto_en = now()
   where x.despacho_id = p_despacho_id and x.estado = 'pendiente';
  get diagnostics v_vueltas = row_count;

  insert into retail.despacho_cierres (despacho_id, tipo, motivo, token, hecho_por)
  values (p_despacho_id, 'reapertura', v_motivo, p_token, v_actor);
  v_version := (select d.version from retail.despachos d where d.id = p_despacho_id);

  -- Actividad (ADR-0207): «reabrió ENV-000061: encontramos las 2 que faltaban». Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_reabierto', 'reabrió ' || v_envio || ': ' || v_motivo,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'motivo', v_motivo, 'pendientes_vueltos', v_vueltas),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la reapertura del envío % (%)', v_envio, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'numero', v_envio, 'estado', 'abierto', 'version', v_version,
                            'pendientes_vueltos', v_vueltas, 'repetido', false);
end;
$$;
comment on function retail.reabrir_envio(uuid, integer, text, uuid) is
  'ADR-0393 (decisión 5): cerrado → abierto para cuadrar, con motivo (3 a 300 letras), mientras Compras no haya resuelto lo que faltó '
  '(hint reabrir_deuda_resuelta) ni lo de más haya saldado otra deuda (reabrir_reposicion_saldo). Lo que faltó o sobró deja de valer, '
  'lo pendiente vuelve al borrador de su línea, lo que entró al stock no se toca y queda el rastro. Módulo Recibir, su sede y la decisión '
  '17; firma el responsable. Versión vieja: PT409. Token. Devuelve {despacho_id, numero, estado, version, pendientes_vueltos, repetido}.';
revoke all on function retail.reabrir_envio(uuid, integer, text, uuid) from public, anon;
grant execute on function retail.reabrir_envio(uuid, integer, text, uuid) to authenticated, service_role;

-- ---------- 8. Lo contado de un envío, con su rastro y si se puede reabrir ----------
create or replace function retail.fn_envio_conteos(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_estado text;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;
  select d.estado into v_estado from retail.despachos d where d.id = p_despacho_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'despacho_id', p_despacho_id,
    'estado', v_estado,
    'conteos', coalesce((
      select jsonb_agg(retail.fn_envio_conteo_json(k) order by k.extra_posicion nulls first, o.numero, i.posicion)
        from retail.despacho_conteos k
        left join retail.despacho_items di on di.id = k.despacho_item_id
        left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        left join retail.ordenes_compra o on o.id = i.orden_compra_id
       where k.despacho_id = p_despacho_id), '[]'::jsonb),
    -- ADR-0393 (actividad 4): «Cerrado a las 10:58 por Mariana · reabierto: encontramos las 2 que faltaban».
    'cierres', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'motivo', c.motivo, 'resultado', c.resultado,
                                          'hecho_por', retail.fn_envio_persona(c.hecho_por), 'hecho_en', c.hecho_en)
                       order by c.hecho_en, c.id)
        from retail.despacho_cierres c where c.despacho_id = p_despacho_id), '[]'::jsonb),
    -- Si se puede reabrir (cerrado y Compras sin tocar lo que faltó) y, si no, por qué (la pista de reabrir_envio).
    'reabrir', case when v_estado = 'cerrado'
                    then jsonb_build_object('se_puede', retail.fn_envio_reabrir_bloqueo(p_despacho_id) is null,
                                            'por_que_no', retail.fn_envio_reabrir_bloqueo(p_despacho_id)) end);
end;
$$;
comment on function retail.fn_envio_conteos(uuid) is
  'ADR-0393: lo contado de un envío, línea por línea (y lo de fuera de la guía): {despacho_id, estado, conteos: [como fn_envio_conteo_json], '
  'cierres: [{tipo, motivo, resultado, hecho_por, hecho_en}], reabrir: {se_puede, por_que_no} (solo si está cerrado)}. NULL si el envío '
  'no existe. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envio_conteos(uuid) from public, anon;
grant execute on function retail.fn_envio_conteos(uuid) to authenticated, service_role;

-- ---------- 9. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'despacho_diferencias' and column_name = 'vigente') then
    raise exception 'falta despacho_diferencias.vigente';
  end if;
  if to_regclass('retail.despacho_diferencias_linea_unica') is not null or to_regclass('retail.despacho_diferencias_extra_unica') is not null
     or to_regclass('retail.despacho_diferencias_linea_vigente_unica') is null or to_regclass('retail.despacho_diferencias_extra_vigente_unica') is null then
    raise exception 'los únicos de despacho_diferencias tienen que ser «una vigente por línea»';
  end if;
  if to_regclass('retail.despacho_diferencias_vigentes') is null
     or has_table_privilege('authenticated', 'retail.despacho_diferencias_vigentes', 'select')
     or has_table_privilege('anon', 'retail.despacho_diferencias_vigentes', 'select') then
    raise exception 'falta la vista despacho_diferencias_vigentes, o la leen anon o authenticated';
  end if;
  -- Ninguna función de retail lee la tabla con el alias de siempre: todas leen lo que vale.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.prokind = 'f'
                and position('from retail.despacho_diferencias x' in pg_get_functiondef(p.oid)) > 0) then
    raise exception 'quedó una función que lee despacho_diferencias sin filtrar las vigentes: %',
      (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'retail' and p.prokind = 'f' and position('from retail.despacho_diferencias x' in pg_get_functiondef(p.oid)) > 0);
  end if;
  if to_regclass('retail.despacho_cierres') is null
     or not coalesce((select c.relrowsecurity from pg_class c where c.oid = 'retail.despacho_cierres'::regclass), false)
     or exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despacho_cierres')
     or has_table_privilege('authenticated', 'retail.despacho_cierres', 'select') then
    raise exception 'retail.despacho_cierres: con RLS, sin políticas y sin lectura directa';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despacho_cierres'::regclass and t.tgname = 'despacho_cierres_fija')
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despacho_conteos'::regclass and t.tgname = 'despacho_conteos_cuadra'
                       and t.tgdeferrable and t.tginitdeferred) then
    raise exception 'faltan los disparadores despacho_cierres_fija o despacho_conteos_cuadra';
  end if;
  v_funcion := 'retail.reabrir_envio(uuid,integer,text,uuid)';
  if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure)
     or has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
    raise exception '%: security definer, la ejecuta authenticated y no anon', v_funcion;
  end if;
  foreach v_funcion in array array['retail.fn_envio_reabrir_bloqueo(uuid)', 'retail.fn_despacho_cierres_fija()'] loop
    if has_function_privilege('authenticated', v_funcion, 'execute') or has_function_privilege('anon', v_funcion, 'execute') then
      raise exception '% es interna: ni authenticated ni anon la ejecutan', v_funcion;
    end if;
  end loop;
  if position($t$current_setting('retail.reabriendo', true) = 'si'$t$ in pg_get_functiondef('retail.fn_despachos_camino()'::regprocedure)) = 0
     or position($t$current_setting('retail.reabriendo', true) = 'si'$t$ in pg_get_functiondef('retail.fn_despachos_recepcion_fija()'::regprocedure)) = 0
     or position('envio_reabierto' in pg_get_functiondef('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure)) = 0
     or position('conteo_menos_que_stock' in pg_get_functiondef(
          'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)'::regprocedure)) = 0
     or position('insert into retail.despacho_cierres' in pg_get_functiondef(
          'retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)'::regprocedure)) = 0 then
    raise exception 'falta uno de los reemplazos: reabrir en el camino del envío, el freno de recibir_despacho, el de guardar o el rastro del cierre';
  end if;
end;
$$;

reset lock_timeout;

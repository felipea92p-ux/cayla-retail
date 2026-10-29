-- ============================================================================
-- 20261029150000_mis_compras_reabrir_la_ultima_ronda.sql — CAYLA V2 · ADR-0569 (Mis compras: reabrir la última ronda)
--
-- EL PROBLEMA PRIMERO. Una compradora cierra su ronda (RC-000012) y se da cuenta de que se le olvidó anotar un gasto de S/ 4 en bebidas, o de que
-- eligió «me quedo la plata para mi próxima ronda» cuando en realidad la va a devolver. Hoy no puede: una ronda cerrada no cambia nunca
-- (`fn_compra_rondas_fija`), anotar un gasto exige una ronda abierta («Abre tu ronda de compras antes de anotar») y el cierre se guarda una sola vez.
-- Lo único posible era abrir OTRA ronda, y el gasto quedaba en la ronda que no era.
--
-- LO QUE SE DECIDIÓ (Felipe, 2026-10-29): en vez de dos funciones nuevas (agregar un gasto a una ronda cerrada y cambiar el cierre), UNA sola:
-- REABRIR LA ÚLTIMA RONDA. Con la ronda abierta otra vez, todo lo de siempre funciona (anotar el gasto, corregir una compra, cambiar la decisión al
-- cerrarla de nuevo) sin tocar ninguna otra regla.
--
-- CUÁNDO SE PUEDE (el candado es de la base, no de la pantalla):
--   · Solo es de quien la cerró, y solo la ÚLTIMA ronda cerrada, y solo si no tiene otra ronda abierta (una sola abierta a la vez).
--   · Solo mientras Compras no haya recibido su cierre (`resuelto_en` nulo). Lo que devolvió o le pagaron ya movió plata de verdad: ahí no se reabre.
--     «Me lo quedo» nunca lo recibe Compras, así que esa ronda se puede reabrir hasta que abra la siguiente.
--
-- QUÉ PASA AL REABRIR. La ronda vuelve a estar abierta con el mismo número (RC-…) y la misma fecha de apertura; sigue teniendo todo lo que anotó. Su cierre
-- (qué decidió y cuánto) sale del libro de cierres, que Compras mira, y se GUARDA en `compra_cierres_reabiertos` (nunca se borra un historial sin
-- dejarlo archivado). Al cerrarla otra vez nace un cierre nuevo con lo que de verdad tiene en ese momento. Se anota en Actividad.
-- Dos toques seguidos (respuesta perdida): el segundo devuelve la misma ronda con `ya_estaba: true`.
--
-- CÓMO LO HACE POSIBLE SIN ABRIR HUECOS. Dos disparadores que prohibían cualquier cambio a una ronda o cierre cerrados ganan UNA excepción, y solo
-- la función de abajo puede usarla: una marca de la transacción (`retail.reabriendo_ronda` = el id de la ronda) que solo ella pone. Fuera de ella,
-- una ronda cerrada sigue sin cambiar y un cierre sigue sin borrarse. La marca se retira al terminar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA sola parte: una tabla nueva (con su RLS y su revoke, sin políticas), dos funciones de disparador
-- reemplazadas, una función nueva y una fila de datos. Sin `alter` de tablas en uso, sin políticas, sin `drop trigger` (ADR-0195). Idempotente.
-- Orden: después de 20261029012000 (la última de Mis compras).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Dónde se guarda el cierre que se reabrió ----------
create table if not exists retail.compra_cierres_reabiertos (
  id uuid primary key,                                  -- el id que tenía el cierre en `compra_cierres`
  persona_id uuid not null references public.personas (id),
  ronda_id uuid not null references retail.compra_rondas (id),
  fecha date not null,
  decision text not null check (decision in ('se_queda', 'devuelve', 'le_deben')),
  monto numeric(12, 2) not null check (monto >= 0),
  cerrado_en timestamptz not null,
  reabierto_en timestamptz not null default now(),
  reabierto_por uuid not null references public.personas (id)
);
comment on table retail.compra_cierres_reabiertos is
  'ADR-0569: el cierre de una ronda que su compradora reabrió (qué había decidido y cuánto), archivado en vez de borrado. Solo lo escribe reabrir_ronda_compras.';
create index if not exists compra_cierres_reabiertos_ronda on retail.compra_cierres_reabiertos (ronda_id);
alter table retail.compra_cierres_reabiertos enable row level security;
revoke all on retail.compra_cierres_reabiertos from anon, authenticated;

-- ---------- 2. Las dos excepciones de los disparadores (solo con la marca de la función) ----------
-- Una ronda cerrada no cambia, salvo que quien la reabre lo diga con la marca y deje todo lo demás igual: vuelve a estar abierta, sin cierre.
create or replace function retail.fn_compra_rondas_fija()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una ronda de compras no se borra.' using errcode = 'P0001';
  end if;
  if old.cerrada_en is not null then
    -- ADR-0569: reabrirla. Solo `reabrir_ronda_compras` pone la marca, y lo único que cambia es que vuelve a estar abierta y sin cierre.
    if coalesce(current_setting('retail.reabriendo_ronda', true), '') = old.id::text
       and new.cerrada_en is null and new.cierre_id is null
       and (new.id, new.numero, new.persona_id, new.abierta_en, new.abierta_por)
           is not distinct from (old.id, old.numero, old.persona_id, old.abierta_en, old.abierta_por) then
      return new;
    end if;
    raise exception 'Esta ronda ya se cerró: no cambia.' using errcode = 'P0001', hint = 'compra_ronda_cerrada';
  end if;
  if (new.id, new.numero, new.persona_id, new.abierta_en, new.abierta_por)
     is distinct from (old.id, old.numero, old.persona_id, old.abierta_en, old.abierta_por) then
    raise exception 'De quién es una ronda, su número y cuándo se abrió no cambian.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Un cierre no se borra, salvo el de una ronda que se reabre (con la marca) y que Compras todavía no recibió.
create or replace function retail.fn_compra_cierres_resuelto_fijo()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    if old.resuelto_en is null and old.ronda_id is not null
       and coalesce(current_setting('retail.reabriendo_ronda', true), '') = old.ronda_id::text then
      return old;
    end if;
    raise exception 'Un cierre del día no se borra.' using errcode = 'P0001';
  end if;
  if old.resuelto_en is not null then
    raise exception 'Compras ya recibió este cierre: no cambia.' using errcode = 'P0001', hint = 'compra_cierre_resuelto';
  end if;
  if (new.id, new.persona_id, new.fecha) is distinct from (old.id, old.persona_id, old.fecha) then
    raise exception 'De quién y de qué día es un cierre no cambia.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 3. Reabrir la última ronda ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('compra_ronda_reabrir', 'Reabrir tu última ronda de compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

create or replace function retail.reabrir_ronda_compras()
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_id uuid;
  v_numero integer;
  v_cierre uuid;
  v_k retail.compra_cierres%rowtype;
  v_ya_abierta uuid;
  v_hace_poco boolean := false;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Reabrir una ronda de compras necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién reabre su ronda' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- El mismo candado que abrir y cerrar: reabrir y cerrar a la vez se ponen en fila.
  perform pg_advisory_xact_lock(hashtextextended('compra_ronda:' || v_actor::text, 0));

  -- Si ya hay una abierta: o es la que acaba de reabrir (la respuesta se perdió y toca otra vez) o no se puede.
  for v_ya_abierta in select r.id from retail.compra_rondas r where r.persona_id = v_actor and r.cerrada_en is null loop
    exit;
  end loop;
  if v_ya_abierta is not null then
    v_hace_poco := exists (
      select 1 from retail.compra_cierres_reabiertos x
       where x.ronda_id = v_ya_abierta and x.reabierto_en > now() - interval '2 minutes');
    if not v_hace_poco then
      raise exception 'Ya tienes una ronda abierta: ciérrala antes de reabrir otra' using errcode = 'P0001', hint = 'compra_ronda_ya_abierta';
    end if;
    return jsonb_build_object('id', v_ya_abierta, 'numero', (select r.numero from retail.compra_rondas r where r.id = v_ya_abierta),
                              'texto', retail.fn_ronda_compras_texto(v_ya_abierta), 'ya_estaba', true);
  end if;

  -- La última ronda que cerró.
  for v_id, v_numero, v_cierre in
    select r.id, r.numero, r.cierre_id from retail.compra_rondas r
     where r.persona_id = v_actor and r.cerrada_en is not null
     order by r.cerrada_en desc, r.numero desc limit 1
  loop
    exit;
  end loop;
  if v_id is null then
    raise exception 'No tienes una ronda cerrada para reabrir' using errcode = 'P0001', hint = 'compra_ronda_nada_que_reabrir';
  end if;

  -- Su cierre, bloqueado: si Compras lo está recibiendo justo ahora, uno de los dos espera y ve lo que hizo el otro.
  for v_k in select * from retail.compra_cierres k where k.id = v_cierre for update loop
    exit;
  end loop;
  if v_k.id is null then
    raise exception 'No tienes una ronda cerrada para reabrir' using errcode = 'P0001', hint = 'compra_ronda_nada_que_reabrir';
  end if;
  if v_k.resuelto_en is not null then
    raise exception 'Compras ya recibió el cierre de esta ronda: ya no se puede reabrir' using errcode = 'P0001', hint = 'compra_ronda_cierre_resuelto';
  end if;

  -- La marca que los dos disparadores exigen: vale solo en esta transacción y solo para esta ronda.
  perform set_config('retail.reabriendo_ronda', v_id::text, true);
  update retail.compra_rondas set cerrada_en = null, cierre_id = null where id = v_id;
  insert into retail.compra_cierres_reabiertos (id, persona_id, ronda_id, fecha, decision, monto, cerrado_en, reabierto_por)
  values (v_k.id, v_k.persona_id, v_id, v_k.fecha, v_k.decision, v_k.monto, v_k.cerrado_en, v_actor);
  delete from retail.compra_cierres where id = v_k.id;
  perform set_config('retail.reabriendo_ronda', '', true);

  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'ronda_compras_reabierta',
      'reabrió la ronda de compras ' || retail.fn_ronda_compras_numero_texto(v_numero),
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_rondas', v_id::text, now(),
      jsonb_build_object('numero', v_numero, 'decision_anterior', v_k.decision), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la ronda reabierta: %', sqlerrm;
  end;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'texto', retail.fn_ronda_compras_numero_texto(v_numero),
                            'decision_anterior', v_k.decision, 'ya_estaba', false);
end $$;
revoke all on function retail.reabrir_ronda_compras() from public, anon;
grant execute on function retail.reabrir_ronda_compras() to authenticated;

notify pgrst, 'reload schema';

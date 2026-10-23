-- ============================================================================
-- 20261023183000_compras_simple_ronda_de_compras.sql — CAYLA V2 · ADR-0480 (Compras simple), rediseño
-- La RONDA DE COMPRAS: la compradora la abre, anota en ella varias compras (y sus gastos) y al final la cierra (Felipe, 2026-10-23).
--
-- EL PROBLEMA PRIMERO. Hasta hoy las compras de una compradora eran una lista suelta y el cierre era «por día» («Terminé por hoy», uno por
-- persona y fecha). Pero un viaje a Gamarra dura tres días, y una vuelta por los proveedores de Lima puede ser una tarde: lo que Compras
-- necesita revisar es «todo lo de este viaje», con su principio y su final, no «todo lo del martes». Felipe lo dijo así: «se abre, se hacen
-- varias compras y cuando se termina se cierra; para otra ronda, se abre otra».
--
-- QUÉ HACE
--   1. `compra_rondas`: cada ronda con su número (la base guarda el número; se dice «RC-000001», como «OC-000129» en las órdenes de compra,
--      decisión de Felipe: «que no diga Ronda 3, que tenga su serie y número»). Una compradora tiene a lo más UNA abierta (índice único
--      parcial: dos toques a la vez no abren dos).
--   2. `abrir_ronda_compras()`: la abre la compradora desde su celular (decisión de Felipe). Si ya tiene una abierta, devuelve esa.
--   3. Las compras y los gastos nuevos quedan dentro de su ronda abierta (un disparador pone `ronda_id`): sin ronda abierta, la base dice
--      «Abre tu ronda de compras» (`compra_ronda_sin_abrir`). «Me dieron plata» NO la exige (Compras a veces manda la plata antes de que
--      salga): si hay una abierta, queda en ella; si no, sin ronda. Lo anotado antes de hoy queda sin ronda: no se inventan rondas viejas.
--   4. Cerrar la ronda REEMPLAZA a «Terminé por hoy» (decisión de Felipe): `terminar_dia_compras(p_decision)` conserva su nombre (la web
--      publicada antes que esta migración la sigue llamando) pero ahora cierra la ronda abierta: el cierre dice de qué ronda es, y se
--      suelta el candado de «un cierre por día» (se pueden cerrar dos rondas el mismo día). Lo que sobra sigue con ella a la próxima ronda,
--      como hasta hoy: la plata es de la persona, la ronda solo agrupa.
--   5. Las lecturas (`fn_mi_plata_compras`, `fn_revisar_compras`) dicen la ronda de cada cosa, y Mi plata la ronda abierta con lo que lleva.
--   Nada se borra: las columnas nuevas son nulas en lo de antes, y la ronda de una fila no cambia una vez puesta.
--
-- Se pega tal cual en producción: idempotente, sin políticas (las tablas nuevas solo se leen por funciones security definer, ADR-0195).
-- Orden: después de 20261023180000 y 20261023181000.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. La ronda ----------
create sequence if not exists retail.compra_rondas_numero_seq;

create table if not exists retail.compra_rondas (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('retail.compra_rondas_numero_seq'),
  persona_id uuid not null references public.personas (id),
  abierta_en timestamptz not null default now(),
  abierta_por uuid not null references public.personas (id),
  cerrada_en timestamptz,
  -- El cierre (qué hizo con lo que le quedó). Va junto con `cerrada_en`: una ronda cerrada siempre dice cómo cerró.
  cierre_id uuid unique references retail.compra_cierres (id),
  constraint compra_rondas_cerrada_con_cierre check ((cerrada_en is null) = (cierre_id is null))
);
alter sequence retail.compra_rondas_numero_seq owned by retail.compra_rondas.numero;
comment on table retail.compra_rondas is
  'ADR-0480: la ronda de compras de una compradora (RC-000001): la abre ella, anota sus compras y gastos, y la cierra (reemplaza a «Terminé por hoy»).';

create unique index if not exists compra_rondas_una_abierta on retail.compra_rondas (persona_id) where cerrada_en is null;
create index if not exists compra_rondas_persona on retail.compra_rondas (persona_id, abierta_en desc);

alter table retail.compra_rondas enable row level security;
revoke all on retail.compra_rondas from anon, authenticated;
revoke all on sequence retail.compra_rondas_numero_seq from anon, authenticated;

-- Una ronda no se borra; cerrada, no cambia; abierta, solo se cierra.
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
    raise exception 'Esta ronda ya se cerró: no cambia.' using errcode = 'P0001', hint = 'compra_ronda_cerrada';
  end if;
  if (new.id, new.numero, new.persona_id, new.abierta_en, new.abierta_por)
     is distinct from (old.id, old.numero, old.persona_id, old.abierta_en, old.abierta_por) then
    raise exception 'De quién es una ronda, su número y cuándo se abrió no cambian.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger compra_rondas_fija
  before update or delete on retail.compra_rondas
  for each row execute function retail.fn_compra_rondas_fija();

-- «RC-000001»: el número como se dice (el prefijo es presentación; la base guarda el número).
create or replace function retail.fn_ronda_compras_numero_texto(p_numero integer) returns text
language sql immutable as $$
  select 'RC-' || lpad(p_numero::text, 6, '0');
$$;

create or replace function retail.fn_ronda_compras_texto(p_ronda_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select retail.fn_ronda_compras_numero_texto(r.numero) from retail.compra_rondas r where r.id = p_ronda_id;
$$;
revoke all on function retail.fn_ronda_compras_texto(uuid) from public, anon;

-- ---------- 2. Lo que se anota queda en su ronda ----------
alter table retail.compra_papeles add column if not exists ronda_id uuid references retail.compra_rondas (id);
alter table retail.compra_gastos add column if not exists ronda_id uuid references retail.compra_rondas (id);
alter table retail.fondo_plata_anotada add column if not exists ronda_id uuid references retail.compra_rondas (id);
alter table retail.compra_cierres add column if not exists ronda_id uuid unique references retail.compra_rondas (id);
create index if not exists compra_papeles_ronda on retail.compra_papeles (ronda_id) where ronda_id is not null;
create index if not exists compra_gastos_ronda on retail.compra_gastos (ronda_id) where ronda_id is not null;
create index if not exists fondo_plata_anotada_ronda on retail.fondo_plata_anotada (ronda_id) where ronda_id is not null;

-- La compra y el gasto exigen la ronda abierta de quien compró; la plata, si la hay. La pone la base (nunca la pantalla).
create or replace function retail.fn_compra_en_su_ronda()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  new.ronda_id := (select r.id from retail.compra_rondas r where r.persona_id = new.persona_id and r.cerrada_en is null);
  if new.ronda_id is null and tg_table_name <> 'fondo_plata_anotada' then
    raise exception 'Abre tu ronda de compras antes de anotar' using errcode = 'P0001', hint = 'compra_ronda_sin_abrir';
  end if;
  return new;
end $$;

-- La ronda de una fila no cambia una vez puesta.
create or replace function retail.fn_ronda_id_fija()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.ronda_id is distinct from old.ronda_id then
    raise exception 'De qué ronda es no cambia.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger compra_papeles_en_su_ronda before insert on retail.compra_papeles
  for each row execute function retail.fn_compra_en_su_ronda();
create or replace trigger compra_gastos_en_su_ronda before insert on retail.compra_gastos
  for each row execute function retail.fn_compra_en_su_ronda();
create or replace trigger fondo_plata_anotada_en_su_ronda before insert on retail.fondo_plata_anotada
  for each row execute function retail.fn_compra_en_su_ronda();

create or replace trigger compra_papeles_ronda_fija before update on retail.compra_papeles
  for each row execute function retail.fn_ronda_id_fija();
create or replace trigger compra_gastos_ronda_fija before update on retail.compra_gastos
  for each row execute function retail.fn_ronda_id_fija();
create or replace trigger fondo_plata_anotada_ronda_fija before update on retail.fondo_plata_anotada
  for each row execute function retail.fn_ronda_id_fija();
create or replace trigger compra_cierres_ronda_fija before update on retail.compra_cierres
  for each row execute function retail.fn_ronda_id_fija();

-- ---------- 3. Abrir la ronda (la compradora) ----------
-- Firma sin combo con la cuenta de una persona (desde una terminal, el combo), como las demás de Compras simple. «Cerrar» usa la clave de
-- siempre (`compra_terminar_dia`), con su texto al día.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('compra_ronda_abrir', 'Abrir tu ronda de compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('compra_terminar_dia', 'Cerrar tu ronda de compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

create or replace function retail.abrir_ronda_compras()
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_id uuid;
  v_numero integer;
  v_abierta timestamptz;
  v_ya boolean := true;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Abrir una ronda de compras necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién abre su ronda' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- Dos toques a la vez se ponen en fila: el segundo ve la ronda del primero y la devuelve.
  perform pg_advisory_xact_lock(hashtextextended('compra_ronda:' || v_actor::text, 0));
  for v_id, v_numero, v_abierta in
    select r.id, r.numero, r.abierta_en from retail.compra_rondas r where r.persona_id = v_actor and r.cerrada_en is null
  loop
    exit;
  end loop;
  if v_id is null then
    v_ya := false;
    insert into retail.compra_rondas (persona_id, abierta_por) values (v_actor, v_actor)
    returning id, numero, abierta_en into v_id, v_numero, v_abierta;
    begin
      perform retail.fn_actividad_anotar('ordenes_compra', 'ronda_compras_abierta',
        'abrió la ronda de compras ' || retail.fn_ronda_compras_numero_texto(v_numero),
        v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_rondas', v_id::text, now(),
        jsonb_build_object('numero', v_numero), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó la ronda abierta: %', sqlerrm;
    end;
  end if;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'texto', retail.fn_ronda_compras_numero_texto(v_numero),
                            'abierta_en', v_abierta, 'ya_estaba', v_ya);
end $$;
revoke all on function retail.abrir_ronda_compras() from public, anon;
grant execute on function retail.abrir_ronda_compras() to authenticated;

-- ---------- 4. Cerrar la ronda (reemplaza a «Terminé por hoy») ----------
alter table retail.compra_cierres drop constraint if exists compra_cierres_uno_por_dia;

create or replace function retail.terminar_dia_compras(p_decision text)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_tiene numeric;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_hoy date := retail.fn_hoy_lima();
  v_ronda uuid;
  v_numero integer;
  v_cierre uuid;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Cerrar la ronda necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién cierra su ronda' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- El mismo candado que abrir: abrir y cerrar a la vez se ponen en fila.
  perform pg_advisory_xact_lock(hashtextextended('compra_ronda:' || v_actor::text, 0));
  for v_ronda, v_numero in
    select r.id, r.numero from retail.compra_rondas r where r.persona_id = v_actor and r.cerrada_en is null
  loop
    exit;
  end loop;
  if v_ronda is null then
    raise exception 'No tienes una ronda de compras abierta' using errcode = 'P0001', hint = 'compra_ronda_sin_abrir';
  end if;

  -- Lo que tiene lo calcula la base, no la pantalla: el cierre dice lo que había de verdad al tocar el botón.
  v_tiene := retail.fn_mi_plata_tiene(v_actor);
  if v_tiene < 0 then
    v_decision := 'le_deben';
  elsif v_tiene = 0 then
    v_decision := 'se_queda';
  elsif v_decision not in ('se_queda', 'devuelve') then
    raise exception 'Elige qué haces con lo que te queda' using errcode = 'P0001', hint = 'compra_cierre_decision';
  end if;

  insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id)
  values (v_actor, v_hoy, v_decision, abs(v_tiene), v_actor, v_ronda)
  returning id into v_cierre;
  update retail.compra_rondas set cerrada_en = now(), cierre_id = v_cierre where id = v_ronda;

  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'dia_compras_terminado',
      'cerró la ronda de compras ' || retail.fn_ronda_compras_numero_texto(v_numero)
        || case v_decision when 'devuelve' then ' y devuelve lo que le sobró' when 'le_deben' then ': puso de su bolsillo' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_cierres', v_cierre::text, now(),
      jsonb_build_object('decision', v_decision, 'ronda', v_numero), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cierre de la ronda: %', sqlerrm;
  end;
  return jsonb_build_object('decision', v_decision, 'monto', abs(v_tiene), 'fecha', v_hoy,
                            'ronda', retail.fn_ronda_compras_numero_texto(v_numero));
end $$;

-- ---------- 5. Lo que lleva la ronda abierta, y cómo cerró la última ----------
create or replace function retail.fn_ronda_compras_de(p_persona uuid)
returns jsonb
language sql stable security definer set search_path = retail, public, extensions as $$
  select jsonb_build_object(
    'abierta', (
      select jsonb_build_object(
               'id', r.id, 'numero', r.numero, 'texto', retail.fn_ronda_compras_numero_texto(r.numero), 'abierta_en', r.abierta_en,
               'compras', (select count(*) from retail.compra_papeles c where c.ronda_id = r.id and c.estado <> 'anulado'),
               'compraste', coalesce((select sum(c.pagado) from retail.compra_papeles c where c.ronda_id = r.id and c.estado <> 'anulado'), 0),
               'gastaste', coalesce((select sum(g.monto) from retail.compra_gastos g where g.ronda_id = r.id and g.estado <> 'anulado'), 0),
               'dieron', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.ronda_id = r.id), 0),
               'prendas', coalesce((select sum(i.cantidad) from retail.compra_papeles c join retail.ordenes_compra o on o.papel_id = c.id
                                     join retail.orden_compra_items i on i.orden_compra_id = o.id
                                    where c.ronda_id = r.id and c.estado <> 'anulado'), 0))
        from retail.compra_rondas r where r.persona_id = p_persona and r.cerrada_en is null),
    'ultima_cerrada', (
      select jsonb_build_object(
               'texto', retail.fn_ronda_compras_numero_texto(r.numero), 'cerrada_en', r.cerrada_en,
               'decision', k.decision, 'monto', k.monto, 'resuelto', k.resuelto_en is not null)
        from retail.compra_rondas r join retail.compra_cierres k on k.id = r.cierre_id
       where r.persona_id = p_persona and r.cerrada_en is not null
       order by r.cerrada_en desc limit 1));
$$;
revoke all on function retail.fn_ronda_compras_de(uuid) from public, anon;

-- ---------- 6. Las lecturas dicen la ronda ----------
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$    'persona', true,
$v$,
$v$    'persona', true,
    -- La ronda abierta y cómo cerró la última (20261023183000).
    'ronda', retail.fn_ronda_compras_de(v_persona),
$v$, 1);
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$'id', a.id, 'medio', a.medio,$v$,
$v$'id', a.id, 'ronda_id', a.ronda_id, 'ronda', retail.fn_ronda_compras_texto(a.ronda_id), 'medio', a.medio,$v$, 1);
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$'id', c.id, 'proveedor', pr.nombre,$v$,
$v$'id', c.id, 'ronda_id', c.ronda_id, 'ronda', retail.fn_ronda_compras_texto(c.ronda_id), 'proveedor', pr.nombre,$v$, 1);
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$'id', g.id, 'concepto', g.concepto,$v$,
$v$'id', g.id, 'ronda_id', g.ronda_id, 'ronda', retail.fn_ronda_compras_texto(g.ronda_id), 'concepto', g.concepto,$v$, 1);

-- Sin el candado de «un cierre por día», el cierre de hoy puede ser más de uno (dos rondas cerradas el mismo día): se lee el último.
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$from retail.compra_cierres k where k.persona_id = v_persona and k.fecha = v_hoy)$v$,
$v$from retail.compra_cierres k where k.persona_id = v_persona and k.fecha = v_hoy order by k.cerrado_en desc limit 1)$v$, 1);

select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'id', cp.id, 'persona_id', cp.persona_id,$v$,
$v$'id', cp.id, 'persona_id', cp.persona_id, 'ronda', retail.fn_ronda_compras_texto(cp.ronda_id),$v$, 1);
select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'id', g.id, 'persona_id', g.persona_id,$v$,
$v$'id', g.id, 'persona_id', g.persona_id, 'ronda', retail.fn_ronda_compras_texto(g.ronda_id),$v$, 1);
select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'id', k.id, 'persona_id', k.persona_id,$v$,
$v$'id', k.id, 'persona_id', k.persona_id, 'ronda', retail.fn_ronda_compras_texto(k.ronda_id),$v$, 1);

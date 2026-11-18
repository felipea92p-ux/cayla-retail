-- ============================================================================
-- Mis compras · los gastos que no son ropa pasan SOLOS a los gastos del viaje al cerrar la ronda (ADR-0574, actividad 5 de 7).
--
-- EL PROBLEMA PRIMERO. Un taxi, un cargador, la encomienda… la compradora lo anotaba («Gasté en otra cosa») y quedaba «por revisar» hasta que una
-- persona de Compras le decía qué papel le dieron, le copiaba la serie y el RUC y lo pasaba a los gastos del viaje (`revisar_gasto_compra`).
-- Felipe, 2026-10-29: «Compras solo lo puede ver como historial, no tiene que estar confirmándolo a cada rato». La compradora SABE qué papel le
-- dieron, así que lo dice al anotar; y el gasto pasa solo cuando ella cierra su ronda (hasta entonces puede corregirlo, ADR-0572).
--
-- QUÉ HACE.
--   1. `compra_gastos.papel` y `.ruc` (nulos: lo de antes no los tiene) y `.pasa_sola_error` (por qué no pasó solo).
--   2. `registrar_gasto_rapido` recibe dos parámetros más, `p_papel` (boleta, factura, ticket o planilla_movilidad) y `p_ruc` (11 números, solo con
--      papel). Las mismas reglas que al revisarlo: sin papel solo se acepta el taxi y el cargador (decisión 55 de ADR-0362). De fábrica null: una
--      pantalla de antes sigue anotando, y ese gasto lo revisa Compras como hasta hoy. El cuerpo de siempre queda como `fn_registrar_gasto_rapido_base`.
--   3. `revisar_gasto_compra` en modo «pasa solo» (la configuración `retail.gasto_pasa_solo`, solo dentro de `fn_gasto_pasa_solo`): sin el módulo
--      «Revisar compras» y a nombre de la propia compradora, sin «nadie revisa sus propios gastos». Todo lo demás es la función de siempre: el
--      mismo gasto del viaje, pagado desde su fondo, a su compra de ese día (o la más cercana).
--   4. `terminar_dia_compras`: al cerrar la ronda, cada gasto suyo con papel intenta pasar solo. Si falla (todavía no hay una compra a la que ir, el
--      papel no vale para ese concepto…), el cierre NO se cae: el gasto queda por revisar con su motivo en `pasa_sola_error`, y Compras lo corrige.
--
-- Sin tablas nuevas, políticas ni disparadores sobre tablas en uso, salvo uno BEFORE INSERT en `compra_gastos` (`create or replace trigger`,
-- ADR-0195). Idempotente.
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

-- ---------- 1. Las columnas ----------
alter table retail.compra_gastos add column if not exists papel text;
alter table retail.compra_gastos add column if not exists ruc text;
alter table retail.compra_gastos add column if not exists pasa_sola_error text;
comment on column retail.compra_gastos.papel is 'ADR-0574: qué papel le dieron por este gasto (boleta, factura, ticket o planilla_movilidad), como lo dijo la compradora. Nulo en lo anotado antes: Compras lo elige al revisar.';
comment on column retail.compra_gastos.ruc is 'ADR-0574: el RUC del papel, si lo escribió (con una factura separa el IGV).';
comment on column retail.compra_gastos.pasa_sola_error is 'ADR-0574: por qué el gasto no pasó solo a los gastos del viaje al cerrar la ronda. Nulo si pasó o si todavía no le tocaba.';

-- El gasto nace con el papel y el RUC que dice la función que lo registra (como el pago de una compra): `retail.gasto_papel`.
create or replace function retail.fn_compra_gasto_papel_al_nacer()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_dato jsonb := nullif(current_setting('retail.gasto_papel', true), '')::jsonb;
begin
  if new.papel is null and v_dato is not null then
    new.papel := v_dato ->> 'papel';
    new.ruc := v_dato ->> 'ruc';
  end if;
  return new;
end $$;
revoke all on function retail.fn_compra_gasto_papel_al_nacer() from public, anon, authenticated;
create or replace trigger compra_gastos_papel_al_nacer before insert on retail.compra_gastos
  for each row execute function retail.fn_compra_gasto_papel_al_nacer();

-- Lo que dijo no cambia (si ya lo dijo).
select pg_temp.reemplazar('retail.fn_compra_gastos_inmutable()',
$v$  return new;$v$,
$v$  if (old.papel is not null and new.papel is distinct from old.papel) or (old.ruc is not null and new.ruc is distinct from old.ruc) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al revisarlo.' using errcode = 'P0001';
  end if;
  return new;$v$, 1);

-- ---------- 2. Anotar el gasto con su papel ----------
-- El cuerpo de siempre pasa a ser interno; el nombre público lo toma la función con el papel. (Idempotente: si ya se renombró, no hace nada.)
do $mig$
begin
  if to_regprocedure('retail.registrar_gasto_rapido(uuid,text,text,numeric,text)') is not null
     and to_regprocedure('retail.fn_registrar_gasto_rapido_base(uuid,text,text,numeric,text)') is null then
    alter function retail.registrar_gasto_rapido(uuid, text, text, numeric, text) rename to fn_registrar_gasto_rapido_base;
  end if;
end
$mig$;
revoke all on function retail.fn_registrar_gasto_rapido_base(uuid, text, text, numeric, text) from public, anon, authenticated;

create or replace function retail.registrar_gasto_rapido(
  p_id uuid,
  p_concepto text,
  p_nota text,
  p_monto numeric,
  p_foto_ruta text,
  p_papel text default null,
  p_ruc text default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_concepto text := lower(btrim(coalesce(p_concepto, '')));
  v_papel text := nullif(lower(btrim(coalesce(p_papel, ''))), '');
  v_ruc text := nullif(btrim(coalesce(p_ruc, '')), '');
  v_dato jsonb := null;
  v_id uuid;
begin
  if v_papel is not null then
    if v_papel not in ('boleta', 'factura', 'ticket', 'planilla_movilidad') then
      raise exception 'Elige qué papel te dieron' using errcode = 'P0001', hint = 'gasto_rapido_papel';
    end if;
    -- Sin papel solo se acepta el taxi y el cargador (decisión 55 de ADR-0362): lo demás necesita su boleta, factura o ticket.
    if v_papel = 'planilla_movilidad' and v_concepto not in ('taxi', 'cargador') then
      raise exception 'Solo un taxi o un cargador pueden ir sin papel: lo demás necesita su boleta, factura o ticket' using errcode = 'P0001', hint = 'gasto_rapido_papel';
    end if;
    if v_ruc is not null and (v_papel = 'planilla_movilidad' or v_ruc !~ '^[0-9]{11}$') then
      raise exception 'El RUC tiene 11 números' using errcode = 'P0001', hint = 'gasto_rapido_ruc';
    end if;
    v_dato := jsonb_build_object('papel', v_papel, 'ruc', v_ruc);
  end if;

  perform set_config('retail.gasto_papel', coalesce(v_dato::text, ''), true);
  v_id := retail.fn_registrar_gasto_rapido_base(p_id, p_concepto, p_nota, p_monto, p_foto_ruta);
  perform set_config('retail.gasto_papel', '', true);

  -- Un reintento con el mismo identificador devuelve lo que ya quedó: si quedó con otro papel, lo dice (como con otros datos).
  if v_dato is not null and exists (select 1 from retail.compra_gastos g where g.id = p_id and g.papel is not null
                                      and (g.papel, g.ruc) is distinct from (v_papel, v_ruc)) then
    raise exception 'Ese gasto ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'gasto_rapido_otros_datos';
  end if;
  return v_id;
end $$;
comment on function retail.registrar_gasto_rapido(uuid, text, text, numeric, text, text, text) is
  'ADR-0480/0574: anota un gasto que no es ropa, con el papel que le dieron y su RUC; sin ellos, Compras los elige al revisarlo.';
revoke all on function retail.registrar_gasto_rapido(uuid, text, text, numeric, text, text, text) from public, anon;
grant execute on function retail.registrar_gasto_rapido(uuid, text, text, numeric, text, text, text) to authenticated;

-- ---------- 3. Revisar, en modo «pasa solo» ----------
select pg_temp.reemplazar('retail.revisar_gasto_compra(uuid,text,text,text)',
$v$  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Revisar un gasto necesita el módulo Revisar compras en tu rol.' using errcode = '42501';$v$,
$v$  -- Pasa solo (ADR-0574): `fn_gasto_pasa_solo` avisa con esta configuración, solo dentro de su propia transacción, que es ESTE gasto.
  if not retail.fn_ve_modulo('fondos') and coalesce(current_setting('retail.gasto_pasa_solo', true), '') <> p_gasto_id::text then
    raise exception 'Revisar un gasto necesita el módulo Revisar compras en tu rol.' using errcode = '42501';$v$, 1);

select pg_temp.reemplazar('retail.revisar_gasto_compra(uuid,text,text,text)',
$v$  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién revisa el gasto.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_g.persona_id, v_actor, 'Nadie revisa sus propios gastos');$v$,
$v$  if coalesce(current_setting('retail.gasto_pasa_solo', true), '') = v_g.id::text then
    -- Pasa solo (ADR-0574): firma la propia compradora y no hay quien «revise» lo suyo.
    v_actor := v_g.persona_id;
  else
    v_actor := retail.fn_actor_persona_id(true);
    if v_actor is null then
      raise exception 'Elige quién revisa el gasto.' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    perform retail.fn_fondo_exigir_otra_persona(v_g.persona_id, v_actor, 'Nadie revisa sus propios gastos');
  end if;$v$, 1);

select pg_temp.reemplazar('retail.revisar_gasto_compra(uuid,text,text,text)',
$v$  update retail.compra_gastos set estado = 'completado' where id = v_g.id;$v$,
$v$  update retail.compra_gastos set estado = 'completado', pasa_sola_error = null where id = v_g.id;$v$, 1);

-- ---------- 4. Pasar un gasto solo, y los de una compradora ----------
-- Interna. Verdadero si el gasto quedó en los gastos del viaje.
create or replace function retail.fn_gasto_pasa_solo(p_gasto_id uuid)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_g retail.compra_gastos%rowtype;
  v_motivo text;
begin
  for v_g in select * from retail.compra_gastos g where g.id = p_gasto_id and g.estado = 'por_completar' for update loop
    exit;
  end loop;
  -- Sin el papel que dijo la compradora (un gasto de antes), lo revisa Compras como siempre.
  if v_g.id is null or v_g.papel is null then
    return false;
  end if;

  perform set_config('retail.gasto_pasa_solo', v_g.id::text, true);
  begin
    perform retail.revisar_gasto_compra(v_g.id, v_g.papel, null, v_g.ruc);
  exception when others then
    v_motivo := left(sqlerrm, 300);
  end;
  perform set_config('retail.gasto_pasa_solo', '', true);

  if v_motivo is not null then
    update retail.compra_gastos set pasa_sola_error = v_motivo where id = v_g.id;
    return false;
  end if;
  return true;
end $$;
revoke all on function retail.fn_gasto_pasa_solo(uuid) from public, anon, authenticated;

create or replace function retail.fn_gastos_pasan_solos(p_persona uuid)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in select g.id from retail.compra_gastos g where g.persona_id = p_persona and g.estado = 'por_completar' and g.papel is not null order by g.created_at loop
    begin
      if retail.fn_gasto_pasa_solo(v_id) then
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning 'gasto: no pasó solo % (%)', v_id, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;
revoke all on function retail.fn_gastos_pasan_solos(uuid) from public, anon, authenticated;

-- Al cerrar la ronda, sus gastos pasan (el cierre nunca se cae por esto).
select pg_temp.reemplazar('retail.terminar_dia_compras(text,uuid)',
$v$  update retail.compra_rondas set cerrada_en = now(), cierre_id = v_cierre where id = v_ronda;
$v$,
$v$  update retail.compra_rondas set cerrada_en = now(), cierre_id = v_cierre where id = v_ronda;

  -- Al cerrar la ronda, sus gastos con papel pasan solos a los gastos del viaje (ADR-0574). Lo que falle queda por revisar para Compras.
  begin
    perform retail.fn_gastos_pasan_solos(v_actor);
  exception when others then
    raise warning 'gastos: no pasaron solos al cerrar la ronda: %', sqlerrm;
  end;
$v$, 1);

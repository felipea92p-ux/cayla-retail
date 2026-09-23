-- ============================================================================
-- 20260922160000_compras_tienda_gestora.sql — CAYLA V2 · ADR-0151 (F3: la tienda que gestiona una factura)
--
-- PROBLEMA. F1 y F2 dejaron al comprador de tienda LEER el dinero de las facturas de su tienda y saber cuánto le toca de
-- una repartida, pero todavía no puede REGISTRAR una factura ni anularla: `registrar_compra`, `anular_compra` y los
-- adjuntos preguntan «¿es líder?». Y una factura repartida entre tiendas no dice QUIÉN responde por ella: el papel
-- se queda en una tienda (ADR-0151, respuesta 12) y esa tienda no está escrita en ningún lado.
--
-- QUÉ HACE
--   1. `compras.ubicacion_gestion_id`: la TIENDA QUE GESTIONA la factura (donde queda el papel). Obligatoria para toda
--      factura vigente. NO es el destino de la mercadería (ese sigue siendo el reparto por línea; una segunda verdad
--      sobre el destino fue justo lo que ADR-0139 eliminó): dice quién la registra, la edita, la anula y la adjunta.
--      Lo que ya existía se rellena con la tienda que más unidades recibe (empate: la de menor id).
--   2. INVARIANTE en la base, no solo en la RPC (principio 2): la gestora TIENE QUE tener parte en el reparto. Si no,
--      un comprador estaría registrando deuda de otra tienda. Es un candado diferido (se mira al cerrar la transacción,
--      como `compra_item_destinos_cuadra`) para que `registrar_compra` pueda escribir cabecera, líneas y reparto en orden.
--   3. `registrar_compra` ahora la registra: la gestora es el parámetro `p_ubicacion_destino_id` que ya existía (y que la
--      web ya manda: la tienda elegida, o la primera del reparto). Se REUSA en vez de agregar un parámetro porque una
--      lista de parámetros distinta crearía una sobrecarga (la lección del 2026-09-19: `registrar_compra` ya tuvo dos
--      firmas vivas y la pantalla quedó ambigua). El nombre queda algo torcido; F5 le pone etiqueta en la pantalla.
--        · Un COMPRADOR de tienda registra solo con SU tienda como gestora, y la gestora tiene que estar en el reparto
--          (puede repartir hacia otras tiendas: los encargados lo acuerdan entre ellos, ADR-0151 respuesta 12).
--        · Un comprador registra SIN PAGO (al crédito): pagar es F4, y hoy un pago al registrar sale de la cuenta de la
--          empresa por el total. El líder sigue registrando con o sin pago, como siempre.
--   4. `anular_compra`, `registrar_adjunto_compra` y `archivar_adjunto_compra`: además del líder, las hace el comprador
--      de la tienda GESTORA (no el de otra tienda con parte en la factura). Las reglas de fondo no cambian: no se anula
--      con pagos, mercadería recibida, notas de crédito ni faltantes cerrados.
--   5. La lectura de F1 se amplía: la gestora ve la factura ENTERA (todas sus líneas y todo su reparto), porque la
--      edita y la anula. Antes solo veía facturas enteramente suyas. El comprador de otra tienda con parte en la factura
--      sigue sin verla hasta F3-b (una vista que le muestre solo SU parte: hoy la fila de la cabecera trae el total de
--      todas, y enseñársela sería enseñarle la deuda de la otra).
--   6. `cambiar_tienda_gestora_compra(compra, tienda)`: solo el líder; la tienda tiene que tener parte. Existe porque el
--      candado del punto 2 impediría reasignar TODO el reparto de la gestora (`reasignar_reparto_compra`) sin poder
--      cambiar antes quién gestiona.
--
-- QUÉ NO HACE. No pagar ni parar el pago por tienda (F4); no notas de crédito (F6); no la pantalla (F5: `/compras` sigue
-- redirigiendo a quien no es líder); no la vista «solo mi parte» de quien no gestiona (F3-b). `fn_puede_registrar_compras()`
-- NO cambia: sigue siendo solo del líder y siguen dependiendo de ella los pagos, las notas de crédito y el reparto.
--
-- CÓMO. Las cuatro funciones se parchan sobre su definición VIVA (`pg_get_functiondef`), no sobre una copia: cada parche
-- exige cuántas veces aparece lo que reemplaza y, si la base cambió por debajo, aborta sin tocar nada. No cambia la lista
-- de parámetros de ninguna, así que no puede crear una sobrecarga.
--
-- VOLVER ATRÁS: soltar los disparadores y `ubicacion_gestion_id` no basta si ya hay facturas; se vuelve a las funciones
-- de ADR-0132/ADR-0126 (ver 20260921130000 y 20260919160000). Nada de esto está en producción.
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`; no hace falta el prefijo `retail.`. Re-pegable. Va DESPUÉS de
-- 20260922120000 y 20260922130000.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 0. guardas ====================
do $$
begin
  if to_regprocedure('retail.fn_compra_es_de_mis_tiendas(uuid)') is null or to_regprocedure('retail.fn_puede_comprar_en(uuid)') is null then
    raise exception 'Faltan 20260922120000 y 20260922130000 (el permiso y la lectura por tienda): aplícalas antes que esta migración';
  end if;
  if to_regclass('retail.compra_item_destinos') is null then
    raise exception 'Falta el reparto por tienda (ADR-0139): aplícalo antes que esta migración';
  end if;
end;
$$;

-- ==================== 1. la columna ====================
alter table retail.compras add column if not exists ubicacion_gestion_id uuid references retail.ubicaciones(id);

comment on column retail.compras.ubicacion_gestion_id is
  'ADR-0151 (F3). La tienda que GESTIONA la factura: donde queda el papel y cuyo comprador la registra, edita, anula y adjunta. No es el destino de la mercadería (ese es el reparto por línea, compra_item_destinos). Tiene que tener parte en el reparto.';

-- Lo que ya había: la tienda que más unidades recibe (empate: la de menor id).
update retail.compras c
   set ubicacion_gestion_id = x.ubicacion_id
  from (
    select distinct on (t.compra_id) t.compra_id, t.ubicacion_id
    from (
      select i.compra_id, d.ubicacion_id, sum(d.cantidad) as unidades
      from retail.compra_items i
      join retail.compra_item_destinos d on d.compra_item_id = i.id
      group by i.compra_id, d.ubicacion_id
    ) t
    order by t.compra_id, t.unidades desc, t.ubicacion_id
  ) x
 where c.id = x.compra_id and c.ubicacion_gestion_id is null;

-- Obligatoria para toda factura vigente. Una anulada vieja sin líneas (residuo de pruebas) no la tiene y no molesta.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_gestora_obligatoria' and conrelid = 'retail.compras'::regclass) then
    alter table retail.compras add constraint compras_gestora_obligatoria
      check (estado <> 'vigente' or ubicacion_gestion_id is not null) not valid;
  end if;
  begin
    alter table retail.compras validate constraint compras_gestora_obligatoria;
  exception when check_violation then
    raise notice 'compras_gestora_obligatoria queda NOT VALID: hay facturas vigentes sin líneas ni reparto de las que no se puede sacar la tienda gestora. Revísalas: select id, documento from retail.compras where estado = ''vigente'' and ubicacion_gestion_id is null;';
  end;
end;
$$;

create index if not exists compras_gestora_idx on retail.compras (ubicacion_gestion_id);

-- ==================== 2. la gestora tiene parte en el reparto (candado diferido) ====================
create or replace function retail.fn_gestora_con_parte()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra uuid;
begin
  if tg_table_name = 'compras' then
    v_compra := new.id;
  else
    select i.compra_id into v_compra from compra_items i where i.id = coalesce(new.compra_item_id, old.compra_item_id);
  end if;
  if v_compra is null then
    return null;
  end if;
  if exists (
    select 1 from compras c
    where c.id = v_compra
      and c.estado = 'vigente'
      and c.ubicacion_gestion_id is not null
      -- Solo si la factura ya tiene líneas: la cabecera se escribe antes que sus líneas y su reparto.
      and exists (select 1 from compra_items i where i.compra_id = c.id)
      and not exists (
        select 1 from compra_items i
        join compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = c.id and d.ubicacion_id = c.ubicacion_gestion_id
      )
  ) then
    raise exception 'La tienda que gestiona la factura tiene que conservar parte de la mercadería. Cambia primero la tienda gestora (cambiar_tienda_gestora_compra) o deja parte en el reparto.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists compras_gestora_con_parte on retail.compras;
create constraint trigger compras_gestora_con_parte
  after insert or update of ubicacion_gestion_id, estado on retail.compras
  deferrable initially deferred
  for each row execute function retail.fn_gestora_con_parte();

drop trigger if exists compra_item_destinos_gestora_con_parte on retail.compra_item_destinos;
create constraint trigger compra_item_destinos_gestora_con_parte
  after update or delete on retail.compra_item_destinos
  deferrable initially deferred
  for each row execute function retail.fn_gestora_con_parte();

-- ==================== 3. quién gestiona ====================
create or replace function retail.fn_puede_gestionar_compra(p_compra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    retail.fn_es_lider()
    or exists (
      select 1 from compras c
      where c.id = p_compra_id and c.ubicacion_gestion_id in (select retail.fn_compras_ubicaciones())
    ),
    false);
$$;

comment on function retail.fn_puede_gestionar_compra(uuid) is
  'ADR-0151 (F3). ¿Puede quien consulta registrar/anular/adjuntar sobre esta factura? Líder: siempre. Comprador: solo si su tienda es la GESTORA de la factura (no basta tener parte). NULL → false.';

create or replace function retail.fn_puede_gestionar_compra_de_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    retail.fn_es_lider()
    or exists (
      select 1 from compra_items i join compras c on c.id = i.compra_id
      where i.id = p_item_id and c.ubicacion_gestion_id in (select retail.fn_compras_ubicaciones())
    ),
    false);
$$;

comment on function retail.fn_puede_gestionar_compra_de_item(uuid) is
  'ADR-0151 (F3). Como fn_puede_gestionar_compra pero desde una línea de la factura (para las políticas de compra_item_destinos y compra_item_cierres).';

-- La lectura de F1 se amplía: la gestora ve la factura ENTERA (la edita y la anula).
create or replace function retail.fn_compra_es_de_mis_tiendas(p_compra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    retail.fn_es_lider()
    -- La gestora la ve entera, aunque traiga mercadería para otras tiendas.
    or exists (
      select 1 from compras c
      where c.id = p_compra_id and c.ubicacion_gestion_id in (select retail.fn_compras_ubicaciones())
    )
    -- Sin gestora (facturas viejas) o para el resto: solo si TODA ella va a tiendas suyas.
    or (
      exists (
        select 1 from compra_items i
        join compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = p_compra_id
          and d.ubicacion_id in (select retail.fn_compras_ubicaciones())
      )
      and not exists (
        select 1 from compra_items i
        join compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = p_compra_id
          and d.ubicacion_id not in (select retail.fn_compras_ubicaciones())
      )
    ),
    false);
$$;

comment on function retail.fn_compra_es_de_mis_tiendas(uuid) is
  'ADR-0151 (F1 + F3). ¿Puede quien consulta ver el DINERO de esta factura? Líder: siempre. Comprador de tienda: si su tienda la GESTIONA, o si toda ella va a tiendas suyas. NO es fn_puede_ver_compra (esa es por la SEDE en que está fijo el integrante y sirve para recibir). NULL → false.';

-- El reparto y los faltantes de una factura que gestiono los veo TODOS (si no, «Repartida: …» y la vista de partes salen incompletos).
drop policy if exists compra_item_destinos_select on retail.compra_item_destinos;
create policy compra_item_destinos_select on retail.compra_item_destinos
  for select using (
    retail.fn_puede_operar_ubicacion(ubicacion_id)
    or retail.fn_puede_comprar_en(ubicacion_id)
    or retail.fn_puede_gestionar_compra_de_item(compra_item_id)
  );

drop policy if exists compra_item_cierres_select on retail.compra_item_cierres;
create policy compra_item_cierres_select on retail.compra_item_cierres
  for select using (
    retail.fn_puede_operar_ubicacion(ubicacion_id)
    or retail.fn_puede_comprar_en(ubicacion_id)
    or retail.fn_puede_gestionar_compra_de_item(compra_item_id)
  );

-- ==================== 4. cambiar la tienda gestora (solo el líder) ====================
create or replace function retail.cambiar_tienda_gestora_compra(p_compra_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede cambiar la tienda que gestiona una factura' using errcode = '42501';
  end if;
  if not exists (select 1 from compras where id = p_compra_id) then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa tienda no existe o está inactiva';
  end if;
  if not exists (
    select 1 from compra_items i join compra_item_destinos d on d.compra_item_id = i.id
    where i.compra_id = p_compra_id and d.ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'La tienda que gestiona la factura tiene que recibir parte de la mercadería';
  end if;
  update compras set ubicacion_gestion_id = p_ubicacion_id where id = p_compra_id;
end;
$$;

comment on function retail.cambiar_tienda_gestora_compra(uuid, uuid) is
  'ADR-0151 (F3). Solo líder. Cambia la tienda que gestiona una factura a otra que tenga parte en su reparto.';

revoke all on function retail.fn_gestora_con_parte() from public, anon, authenticated;
revoke all on function retail.fn_puede_gestionar_compra(uuid) from public, anon;
revoke all on function retail.fn_puede_gestionar_compra_de_item(uuid) from public, anon;
revoke all on function retail.cambiar_tienda_gestora_compra(uuid, uuid) from public, anon;
grant execute on function retail.fn_puede_gestionar_compra(uuid) to authenticated;
grant execute on function retail.fn_puede_gestionar_compra_de_item(uuid) to authenticated;
grant execute on function retail.cambiar_tienda_gestora_compra(uuid, uuid) to authenticated;

-- ==================== 5. parchar las funciones sobre su definición viva ====================
-- `p_ya_esta`: si la definición ya lo contiene y lo buscado ya no aparece, no hace nada (re-pegable).
-- `p_veces`: cuántas veces DEBE aparecer lo buscado; si no, aborta con un mensaje claro y no toca nada.
create or replace function pg_temp.parchar_gestora(p_firma text, p_buscar text, p_poner text, p_ya_esta text, p_veces integer)
returns void
language plpgsql
as $$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  select count(*) into v_n from regexp_matches(v_def, p_buscar, 'g');
  if v_n = 0 and position(p_ya_esta in v_def) > 0 then
    return;
  end if;
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaba % vez/veces «%» y hay %. Revísala a mano antes de seguir.', p_firma, p_veces, p_buscar, v_n;
  end if;
  execute regexp_replace(v_def, p_buscar, p_poner, 'g');
end;
$$;

-- 5.1 registrar_compra: quién puede, con qué gestora, y guardarla.
select pg_temp.parchar_gestora(
  'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)',
  $r$if not (retail\.)?fn_puede_registrar_compras\(\) then(\s+)raise exception 'No tienes permiso para registrar compras';$r$,
  $r$if not (fn_puede_registrar_compras() or fn_puede_comprar_en(p_ubicacion_destino_id)) then\2raise exception 'No tienes permiso para registrar compras';$r$,
  'fn_puede_comprar_en(p_ubicacion_destino_id)', 1);

select pg_temp.parchar_gestora(
  'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)',
  $r$(\s+)select id into v_persona from personas where auth_user_id = auth\.uid\(\);$r$,
  $r$\1-- ADR-0151 (F3): la tienda que gestiona la factura es `p_ubicacion_destino_id` y tiene que tener parte en el reparto.\1if p_ubicacion_destino_id is null then\1  raise exception 'Elige la tienda que gestiona la factura';\1end if;\1if not exists (\1  select 1 from unnest(v_repartos) r cross join lateral jsonb_array_elements(r) d\1  where (d ->> 'ubicacion_id')::uuid = p_ubicacion_destino_id\1) then\1  raise exception 'La tienda que gestiona la factura tiene que recibir parte de la mercadería';\1end if;\1-- Un comprador de tienda registra SIN pago: pagar es de la fase de pagos por tienda (F4).\1if not fn_puede_registrar_compras() and p_pago is not null then\1  raise exception 'Un comprador de tienda registra la factura sin pago: el pago se hace después';\1end if;\1select id into v_persona from personas where auth_user_id = auth.uid();$r$,
  'La tienda que gestiona la factura tiene que recibir parte', 1);

select pg_temp.parchar_gestora(
  'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)',
  $r$token_cliente, fecha_estimada_llegada(\s*)\) values \($r$,
  $r$token_cliente, fecha_estimada_llegada, ubicacion_gestion_id\1) values ($r$,
  'fecha_estimada_llegada, ubicacion_gestion_id', 1);

select pg_temp.parchar_gestora(
  'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)',
  $r$p_token, p_fecha_estimada_llegada(\s*)\) returning id into v_compra_id;$r$,
  $r$p_token, p_fecha_estimada_llegada, p_ubicacion_destino_id\1) returning id into v_compra_id;$r$,
  'p_fecha_estimada_llegada, p_ubicacion_destino_id', 1);

-- 5.2 anular y adjuntar: además del líder, el comprador de la tienda gestora.
select pg_temp.parchar_gestora(
  'retail.anular_compra(uuid,text)',
  $r$if not (retail\.)?fn_puede_registrar_compras\(\) then$r$,
  $r$if not (fn_puede_registrar_compras() or fn_puede_gestionar_compra(p_compra_id)) then$r$,
  'fn_puede_gestionar_compra(p_compra_id)', 1);

select pg_temp.parchar_gestora(
  'retail.registrar_adjunto_compra(uuid,text,text,text,integer,uuid)',
  $r$if not (retail\.)?fn_puede_registrar_compras\(\) then$r$,
  $r$if not (retail.fn_puede_registrar_compras() or retail.fn_puede_gestionar_compra(p_compra_id)) then$r$,
  'fn_puede_gestionar_compra(p_compra_id)', 1);

select pg_temp.parchar_gestora(
  'retail.archivar_adjunto_compra(uuid)',
  $r$if not (retail\.)?fn_puede_registrar_compras\(\) then$r$,
  $r$if not (retail.fn_puede_registrar_compras() or retail.fn_puede_gestionar_compra((select a.compra_id from retail.compra_adjuntos a where a.id = p_adjunto_id))) then$r$,
  'fn_puede_gestionar_compra((select a.compra_id', 1);

-- ==================== 6. comprobación final (aborta si algo quedó a medias) ====================
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)'::regprocedure);
  if position('fn_puede_comprar_en(p_ubicacion_destino_id)' in v_def) = 0
     or position('ubicacion_gestion_id' in v_def) = 0
     or position('Un comprador de tienda registra la factura sin pago' in v_def) = 0 then
    raise exception 'registrar_compra no quedó completa con la tienda gestora';
  end if;
  -- UNA sola firma de cada función parchada: nunca dos versiones vivas a la vez.
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('registrar_compra', 'anular_compra', 'registrar_adjunto_compra', 'archivar_adjunto_compra')
    group by p.proname having count(*) > 1
  ) then
    raise exception 'Alguna función de Compras quedó con dos firmas';
  end if;
end;
$$;

-- ============================================================================
-- 20260919172000_reparto_compra_por_tienda.sql — CAYLA V2 · ADR-0132 (parte 1 de 2)
--
-- Un comprobante de proveedor puede traer mercadería para varias tiendas y cada tienda
-- recibe lo suyo. Hasta hoy la factura tenía UN destino (`compras.ubicacion_destino_id`) y
-- `recibir_compras` topaba lo recibido de cada línea sumando TODAS las ubicaciones: una
-- tienda podía gastarse la parte de otra, y un integrante de la otra ni veía el comprobante.
--
-- QUÉ HACE (todo aditivo o compatible: la web de hoy sigue funcionando entre pegar esto y
-- desplegar la nueva):
--   1. `compra_item_destinos` (línea × tienda × cantidad): el REPARTO. La línea sigue siendo el
--      papel tal como llegó. Su suma por línea es igual a la cantidad facturada — lo hace
--      cumplir la base con un candado diferido, no la pantalla.
--   2. `compra_reasignaciones`: bitácora append-only de cada vez que un líder mueve lo aún no
--      recibido de una tienda a otra (con motivo).
--   3. `compra_item_cierres.ubicacion_id`: el faltante es de una tienda concreta.
--   4. `fn_puede_ver_compra(id)`: reemplaza al candado «el destino único de la factura».
--   5. `recibir_compras`: tope POR TIENDA (lo que le tocó menos lo que ya recibió y cerró).
--      `recibir_envio` le pasa la tienda a los cierres y valida el reparto en vez del destino.
--   6. `registrar_compra`: cada línea puede traer `destinos: [{ubicacion_id, cantidad}]`; sin
--      ellos la línea va entera a `p_ubicacion_destino_id` (mismo firma que hoy). La base SIEMPRE
--      guarda reparto, aunque sea de una sola tienda: cero casos especiales al leer.
--   7. `cerrar_linea_compra(…, p_ubicacion_id)`, `reasignar_reparto_compra`,
--      `lineas_compra_operativo(…, p_ubicacion_id)` y `listar_compras_operativo(…, p_ubicacion_id)`
--      devuelven «lo que le toca a mi tienda» (asignado_aqui, recibido_aqui, cerrado_aqui,
--      pendiente_aqui) — sin dinero (ADR-0126).
--   8. La vista `compras_resumen` gana `ubicaciones_destino`; vista nueva `compra_item_reparto_resumen`.
--
-- La columna vieja `compras.ubicacion_destino_id` queda SIN USO (y ya sin NOT NULL). La parte 2
-- (20260919173000) re-llave las funciones que aún la leen y la elimina.
--
-- RELLENO. Cada línea existente recibe su reparto desde lo que ya pasó: lo recibido y lo cerrado en
-- cada tienda queda cubierto, y el resto va al destino que tenía la factura. Los cierres viejos se
-- atribuyen al destino de la factura (era la única tienda a la que podían pertenecer).
--
-- PARCHES. `recibir_compras` y `recibir_envio` se parchan sobre su definición VIVA (no se copian
-- cuerpos: en producción se pega a mano en cualquier orden y copiar pisaría a otra sesión).
-- Cada parche verifica que su ancla exista y aborta con un error claro si alguien la cambió.
--
-- RE-PEGABLE: todo lo que se puede repetir sin error (`if not exists`, `drop … if exists`, parches
-- que se saltan solos si ya están puestos).
--
-- ORDEN EN PRODUCCIÓN: después de las migraciones de Compras de ADR-0111/0113/0126, y ANTES de
-- desplegar la web nueva. Se pega sin prefijo `retail.` (lleva `set search_path`).
-- SE ROMPE SI: alguien escribe directo en `compra_item_destinos` (solo RPC), o agrega una RPC que
-- lee `compras`/`compra_items` sin `fn_puede_ver_compra` (una función `security definer` no pasa por RLS).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 0. Guardas: lo que esta migración da por sentado ====================
do $$
declare v_def text;
begin
  if to_regclass('retail.compra_item_cierres') is null or to_regprocedure('retail.fn_libro_compras_es_inmutable()') is null then
    raise exception 'Falta el libro de cierres de ADR-0111 (compra_item_cierres): aplica primero las migraciones de Compras de main';
  end if;
  if to_regprocedure('retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)') is null then
    raise exception 'Falta recibir_envio (ADR-0113): aplica primero las migraciones de Recibir de main';
  end if;
  if to_regprocedure('retail.fn_puede_ver_dinero_de_compras()') is null then
    raise exception 'Falta el candado de dinero de Compras (ADR-0126): aplica primero sus dos migraciones';
  end if;
  select pg_get_functiondef(to_regprocedure('retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)')) into v_def;
  if v_def is null then
    raise exception 'registrar_compra no tiene la firma esperada (15 parámetros, con token y llegada estimada)';
  end if;
  if v_def not like '%compra_item_destinos%'
     and (v_def not like '%fn_consumir_saldo_favor%' or v_def not like '%token_cliente%' or v_def not like '%fecha_estimada_llegada%') then
    raise exception 'registrar_compra cambió desde que se escribió esta migración (ADR-0132): reescríbela sobre la definición viva';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'compras_resumen')
     not in (32, 33) then
    raise exception 'compras_resumen cambió de forma desde que se escribió esta migración (ADR-0132): revisa sus columnas';
  end if;
end $$;

-- ==================== 1. El reparto y su bitácora ====================
create table if not exists compra_item_destinos (
  compra_item_id uuid not null references compra_items (id),
  ubicacion_id   uuid not null references ubicaciones (id),
  cantidad       integer not null,
  created_at     timestamptz not null default now(),
  constraint compra_item_destinos_pkey primary key (compra_item_id, ubicacion_id),
  constraint compra_item_destinos_cantidad_check check (cantidad > 0)
);
create index if not exists compra_item_destinos_ubicacion_idx on compra_item_destinos (ubicacion_id, compra_item_id);

create table if not exists compra_reasignaciones (
  id                 uuid primary key default gen_random_uuid(),
  compra_item_id     uuid not null references compra_items (id),
  desde_ubicacion_id uuid not null references ubicaciones (id),
  hacia_ubicacion_id uuid not null references ubicaciones (id),
  cantidad           integer not null,
  motivo             text not null,
  nota               text,
  usuario_id         uuid references personas (id),
  created_at         timestamptz not null default now(),
  constraint compra_reasignaciones_cantidad_check check (cantidad > 0),
  constraint compra_reasignaciones_motivo_check check (motivo in ('llego_de_mas', 'error_de_tienda', 'otro')),
  constraint compra_reasignaciones_distintas_check check (desde_ubicacion_id <> hacia_ubicacion_id)
);
create index if not exists compra_reasignaciones_item_idx on compra_reasignaciones (compra_item_id);

alter table compra_item_destinos enable row level security;
alter table compra_reasignaciones enable row level security;

-- Lo que le toca a una tienda lo ve quien opera esa tienda (un líder, todas). Sin políticas de
-- escritura: solo las RPC (`security definer`) escriben aquí.
drop policy if exists compra_item_destinos_select on compra_item_destinos;
create policy compra_item_destinos_select on compra_item_destinos
  for select using (fn_puede_operar_ubicacion(ubicacion_id));
drop policy if exists compra_reasignaciones_select on compra_reasignaciones;
create policy compra_reasignaciones_select on compra_reasignaciones
  for select using (fn_puede_operar_ubicacion(desde_ubicacion_id) or fn_puede_operar_ubicacion(hacia_ubicacion_id));

revoke insert, update, delete, truncate on compra_item_destinos from authenticated, anon;
revoke insert, update, delete, truncate on compra_reasignaciones from authenticated, anon;
grant select on compra_item_destinos, compra_reasignaciones to authenticated;

-- La bitácora nunca se edita ni se borra (mismo criterio que el libro de cierres, con su propio mensaje).
create or replace function fn_compra_reasignaciones_inmutable() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception
    'Las reasignaciones del reparto no se editan ni se borran. '
    'Para corregir un error, haz otra reasignación — así queda constancia de qué pasó.';
end;
$$;
drop trigger if exists compra_reasignaciones_inmutables on compra_reasignaciones;
create trigger compra_reasignaciones_inmutables
  before update or delete on compra_reasignaciones
  for each row execute function fn_compra_reasignaciones_inmutable();

comment on table compra_item_destinos is 'ADR-0132: el reparto de una línea de comprobante entre tiendas (cuánto de la línea le toca a cada una). La suma por línea es igual a la cantidad facturada; solo lo escriben las RPC.';
comment on column compra_item_destinos.cantidad is 'Unidades de la línea que le tocan a esa tienda. Lo recibido y lo cerrado allí nunca supera esto.';
comment on table compra_reasignaciones is 'ADR-0132: bitácora append-only de lo que un líder movió, sin recibir aún, de una tienda a otra dentro de una línea de comprobante.';

-- ==================== 2. El faltante es de una tienda ====================
alter table compra_item_cierres add column if not exists ubicacion_id uuid references ubicaciones (id);
comment on column compra_item_cierres.ubicacion_id is 'ADR-0132: de qué tienda es lo que faltó (la parte de la línea que le tocaba a esa tienda).';

-- La cabecera deja de ser la fuente del destino; la parte 2 la elimina.
alter table compras alter column ubicacion_destino_id drop not null;

-- ==================== 3. Relleno: cada línea existente recibe su reparto ====================
-- Lo recibido (`movimientos.compra_item_id`) y lo cerrado en cada tienda queda cubierto; el resto
-- de la línea va al destino que tenía la factura. Los cierres viejos se atribuyen a ese destino.
with mov as (
  select m.compra_item_id, m.ubicacion_id, sum(m.cantidad)::integer as cant
  from movimientos m
  where m.compra_item_id is not null
  group by 1, 2
), cie as (
  select k.compra_item_id, coalesce(k.ubicacion_id, c.ubicacion_destino_id) as ubicacion_id, sum(k.cantidad)::integer as cant
  from compra_item_cierres k
  join compra_items i on i.id = k.compra_item_id
  join compras c on c.id = i.compra_id
  group by 1, 2
), usado as (
  select x.compra_item_id, x.ubicacion_id, sum(x.cant)::integer as cant
  from (select * from mov union all select * from cie) x
  where x.ubicacion_id is not null
  group by 1, 2
), base as (
  select i.id as compra_item_id, i.cantidad, c.ubicacion_destino_id as h,
         coalesce((select sum(u.cant) from usado u where u.compra_item_id = i.id), 0)::integer as total_usado
  from compra_items i
  join compras c on c.id = i.compra_id
  where c.ubicacion_destino_id is not null
    and not exists (select 1 from compra_item_destinos d where d.compra_item_id = i.id)
), reparto as (
  select b.compra_item_id, u.ubicacion_id,
         u.cant + case when u.ubicacion_id = b.h then b.cantidad - b.total_usado else 0 end as cantidad
  from base b
  join usado u on u.compra_item_id = b.compra_item_id
  union all
  select b.compra_item_id, b.h, b.cantidad - b.total_usado
  from base b
  where not exists (select 1 from usado u where u.compra_item_id = b.compra_item_id and u.ubicacion_id = b.h)
)
insert into compra_item_destinos (compra_item_id, ubicacion_id, cantidad)
select r.compra_item_id, r.ubicacion_id, r.cantidad
from reparto r
where r.cantidad > 0
on conflict (compra_item_id, ubicacion_id) do nothing;

-- Los cierres viejos: a la tienda a la que estaba destinada la factura. El libro es inmutable, así que
-- su candado se levanta SOLO para este relleno y se vuelve a poner.
alter table compra_item_cierres disable trigger compra_item_cierres_inmutables;
update compra_item_cierres k
   set ubicacion_id = c.ubicacion_destino_id
  from compra_items i
  join compras c on c.id = i.compra_id
 where k.compra_item_id = i.id
   and k.ubicacion_id is null;
alter table compra_item_cierres enable trigger compra_item_cierres_inmutables;

do $$
declare v_malas integer;
begin
  select count(*) into v_malas
  from compra_items i
  where i.cantidad <> coalesce((select sum(d.cantidad) from compra_item_destinos d where d.compra_item_id = i.id), 0);
  if v_malas > 0 then
    raise exception 'El reparto inicial no cuadra en % línea(s) de comprobante: revisa movimientos y cierres de esas líneas antes de seguir', v_malas;
  end if;
  if exists (select 1 from compra_item_cierres where ubicacion_id is null) then
    raise exception 'Quedaron cierres sin tienda: su comprobante no tiene destino de cabecera';
  end if;
end $$;

alter table compra_item_cierres alter column ubicacion_id set not null;
create index if not exists compra_item_cierres_ubicacion_idx on compra_item_cierres (ubicacion_id, compra_item_id);

-- Los cierres los ve quien opera la tienda del faltante.
drop policy if exists compra_item_cierres_select on compra_item_cierres;
create policy compra_item_cierres_select on compra_item_cierres
  for select using (fn_puede_operar_ubicacion(ubicacion_id));

-- ==================== 4. «¿Esta tienda tiene algo de este comprobante?» ====================
-- Un líder ve todo; un integrante, los comprobantes con alguna línea repartida a su tienda.
-- `security definer` porque `compra_items` es solo del líder desde ADR-0126.
create or replace function fn_puede_ver_compra(p_compra_id uuid) returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    fn_es_lider()
    or exists (
      select 1
      from compra_items i
      join compra_item_destinos d on d.compra_item_id = i.id
      where i.compra_id = p_compra_id
        and d.ubicacion_id = fn_ubicacion_actual_persona()
    ),
    false);
$$;
revoke all on function fn_puede_ver_compra(uuid) from public, anon;
grant execute on function fn_puede_ver_compra(uuid) to authenticated;
comment on function fn_puede_ver_compra(uuid) is 'ADR-0132: ¿el comprobante tiene algo repartido a mi tienda (o soy líder)? Reemplaza al candado por el destino único de la factura.';

-- ==================== 5. Candados diferidos: el reparto siempre cuadra ====================
-- (a) la suma de lo asignado a una línea es igual a lo que trae la línea;
-- (b) ninguna tienda queda con menos asignado que lo que ya recibió y cerró.
-- Diferidos: se validan al confirmar la transacción, así `registrar_compra` inserta línea y reparto juntos.
create or replace function fn_compra_item_reparto_cuadra() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_item uuid; v_ub uuid; v_cant integer; v_suma integer; v_asig integer; v_recibido bigint; v_cerrado bigint;
begin
  if tg_table_name = 'compra_items' then
    v_item := new.id;
  else
    v_item := case when tg_op = 'DELETE' then old.compra_item_id else new.compra_item_id end;
  end if;

  select i.cantidad into v_cant from compra_items i where i.id = v_item;
  if not found then return null; end if;

  select coalesce(sum(d.cantidad), 0) into v_suma from compra_item_destinos d where d.compra_item_id = v_item;
  if v_suma <> v_cant then
    raise exception 'El reparto de la línea % suma % pero la línea trae %: el reparto entre tiendas tiene que sumar lo facturado', v_item, v_suma, v_cant
      using errcode = '23514';
  end if;

  if tg_table_name = 'compra_item_destinos' then
    v_ub := case when tg_op = 'DELETE' then old.ubicacion_id else new.ubicacion_id end;
    select coalesce(sum(m.cantidad), 0) into v_recibido from movimientos m where m.compra_item_id = v_item and m.ubicacion_id = v_ub;
    select coalesce(sum(k.cantidad), 0) into v_cerrado from compra_item_cierres k where k.compra_item_id = v_item and k.ubicacion_id = v_ub;
    select coalesce(d.cantidad, 0) into v_asig from compra_item_destinos d where d.compra_item_id = v_item and d.ubicacion_id = v_ub;
    if not found then v_asig := 0; end if;
    if v_recibido + v_cerrado > v_asig then
      raise exception 'A la tienda % de la línea % le quedarían % asignadas pero ya recibió % y cerró %: no se puede repartir menos de lo ya recibido o cerrado', v_ub, v_item, v_asig, v_recibido, v_cerrado
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists compra_items_reparto_cuadra on compra_items;
create constraint trigger compra_items_reparto_cuadra
  after insert or update of cantidad on compra_items
  deferrable initially deferred
  for each row execute function fn_compra_item_reparto_cuadra();

drop trigger if exists compra_item_destinos_cuadra on compra_item_destinos;
create constraint trigger compra_item_destinos_cuadra
  after insert or update or delete on compra_item_destinos
  deferrable initially deferred
  for each row execute function fn_compra_item_reparto_cuadra();

-- ==================== 6. Vistas ====================
-- Por línea y por tienda: lo asignado, lo recibido, lo cerrado y lo que falta. Lo recibido sale de
-- `movimientos` (una sola fuente de verdad: el núcleo de stock no se toca).
create or replace view compra_item_reparto_resumen with (security_invoker = true) as
select d.compra_item_id,
       i.compra_id,
       d.ubicacion_id,
       d.cantidad as asignado,
       mv.recibido,
       ci.cerrado,
       (d.cantidad - mv.recibido - ci.cerrado)::bigint as pendiente
from compra_item_destinos d
join compra_items i on i.id = d.compra_item_id
cross join lateral (
  select coalesce(sum(m.cantidad), 0)::bigint as recibido
  from movimientos m where m.compra_item_id = d.compra_item_id and m.ubicacion_id = d.ubicacion_id
) mv
cross join lateral (
  select coalesce(sum(k.cantidad), 0)::bigint as cerrado
  from compra_item_cierres k where k.compra_item_id = d.compra_item_id and k.ubicacion_id = d.ubicacion_id
) ci;
grant select on compra_item_reparto_resumen to authenticated;
comment on view compra_item_reparto_resumen is 'ADR-0132: por línea de comprobante y tienda — asignado, recibido, cerrado y pendiente. Lo recibido sale de movimientos.';

-- compras_resumen: mismas columnas de hoy y, al final, las tiendas del reparto.
create or replace view compras_resumen with (security_invoker = true) as
 SELECT c.id,
    c.proveedor_id,
    p.nombre AS proveedor_nombre,
    p.ruc AS proveedor_ruc,
    c.tipo,
    c.serie,
    c.numero,
    c.documento,
    c.fecha_emision,
    c.condicion,
    c.fecha_vencimiento,
    c.ubicacion_destino_id,
    c.subtotal,
    c.igv,
    c.total,
    c.estado,
    c.nota,
    c.created_at,
    c.pagado,
    c.saldo,
    c.estado_pago,
    c.facturado_cantidad,
    c.recibido_cantidad,
    c.estado_recepcion,
    c.estado = 'vigente'::text AND c.saldo > 0::numeric AND c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < retail.fn_hoy_lima() AS vencida,
    c.fecha_estimada_llegada,
    c.estado = 'vigente'::text AND (c.estado_recepcion = ANY (ARRAY['sin_recibir'::text, 'parcial'::text])) AND retail.fn_hoy_lima() > COALESCE(c.fecha_estimada_llegada, c.fecha_emision + 7) AS recepcion_atrasada,
    p.telefono AS proveedor_telefono,
    p.banco AS proveedor_banco,
    p.cuenta_bancaria AS proveedor_cuenta_bancaria,
    c.notas_credito,
    c.cerrado_cantidad,
    (select array_agg(distinct d.ubicacion_id order by d.ubicacion_id)
       from retail.compra_items ci2
       join retail.compra_item_destinos d on d.compra_item_id = ci2.id
      where ci2.compra_id = c.id) AS ubicaciones_destino
   FROM retail.compras c
     JOIN retail.proveedores p ON p.id = c.proveedor_id;

-- ==================== 7. registrar_compra: cada línea puede traer su reparto (parche sobre la definición viva) ====================
-- Misma firma de 15 parámetros (una web vieja sigue funcionando). `p_ubicacion_destino_id` pasa a significar
-- «a qué tienda va lo que no traiga su propio reparto»; la cabecera ya no se escribe.
-- Es un PARCHE (no una copia del cuerpo): otra sesión endurece los pagos de esta misma función (ADR-0135) y en
-- producción se pega a mano en cualquier orden; copiarla entera pisaría lo del otro. Cada ancla se verifica.
do $do$
declare
  v_oid oid := to_regprocedure('retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)');
  v_def text;
  v_nuevo text;
  v_n integer;
  v_declaraciones text;
  v_validacion text;
  v_reparto text;
begin
  v_def := pg_get_functiondef(v_oid);
  if v_def like '%compra_item_destinos%' then return; end if;  -- ya parchada: re-pegable

  v_declaraciones := $b$v_constraint text;
  -- reparto por tienda (ADR-0132)
  v_n integer := 0; v_n2 integer := 0; v_item_id uuid;
  v_destinos jsonb; v_dest jsonb; v_suma_dest integer; v_vistos uuid[];
  v_repartos jsonb[] := '{}';$b$;

  v_validacion := $b$-- Reparto por tienda (ADR-0132): sin `destinos`, la línea va entera a `p_ubicacion_destino_id`.
    v_n := v_n + 1;
    v_destinos := case
      when jsonb_typeof(v_item -> 'destinos') = 'array' and jsonb_array_length(v_item -> 'destinos') > 0
        then v_item -> 'destinos'
      when p_ubicacion_destino_id is not null
        then jsonb_build_array(jsonb_build_object('ubicacion_id', p_ubicacion_destino_id, 'cantidad', (v_item ->> 'cantidad')::integer))
      else null end;
    if v_destinos is null then
      raise exception 'La línea % necesita saber a qué tienda va: elige el destino del comprobante o reparte la línea entre tiendas', v_n;
    end if;
    v_suma_dest := 0;
    v_vistos := '{}';
    for v_dest in select * from jsonb_array_elements(v_destinos) loop
      if (v_dest ->> 'ubicacion_id') is null
         or not exists (select 1 from ubicaciones where id = (v_dest ->> 'ubicacion_id')::uuid and activo) then
        raise exception 'La línea %: una de las tiendas del reparto no existe o está inactiva', v_n;
      end if;
      if coalesce((v_dest ->> 'cantidad')::integer, 0) <= 0 then
        raise exception 'La línea %: cada tienda del reparto necesita una cantidad mayor a cero', v_n;
      end if;
      if (v_dest ->> 'ubicacion_id')::uuid = any (v_vistos) then
        raise exception 'La línea %: una tienda aparece dos veces en el reparto', v_n;
      end if;
      v_vistos := v_vistos || (v_dest ->> 'ubicacion_id')::uuid;
      v_suma_dest := v_suma_dest + (v_dest ->> 'cantidad')::integer;
    end loop;
    if v_suma_dest <> (v_item ->> 'cantidad')::integer then
      raise exception 'La línea % trae % unidades pero el reparto entre tiendas suma %: tiene que sumar lo facturado', v_n, (v_item ->> 'cantidad')::integer, v_suma_dest;
    end if;
    v_repartos := array_append(v_repartos, v_destinos);
    $b$;

  v_reparto := $b$
      )
      returning id into v_item_id;

    for v_dest in select * from jsonb_array_elements(v_repartos[v_n2]) loop
      insert into compra_item_destinos (compra_item_id, ubicacion_id, cantidad)
        values (v_item_id, (v_dest ->> 'ubicacion_id')::uuid, (v_dest ->> 'cantidad')::integer);
    end loop;$b$;

  -- (a) las variables del reparto, junto a la última que ya declara
  v_nuevo := replace(v_def, 'v_constraint text;', v_declaraciones);
  if v_nuevo = v_def or (length(v_def) - length(replace(v_def, 'v_constraint text;', ''))) / length('v_constraint text;') <> 1 then
    raise exception 'registrar_compra: no encontré (o no es única) la declaración de v_constraint (ADR-0132)';
  end if;
  v_def := v_nuevo;

  -- (b) la validación del reparto, antes de acumular el subtotal de cada línea
  if (length(v_def) - length(replace(v_def, 'v_subtotal := v_subtotal + (v_item ->> ''cantidad'')::integer * (v_item ->> ''costo_unitario'')::numeric;', ''))) > 0
     and (length(v_def) - length(replace(v_def, 'v_subtotal := v_subtotal + (v_item ->> ''cantidad'')::integer * (v_item ->> ''costo_unitario'')::numeric;', '')))
         / length('v_subtotal := v_subtotal + (v_item ->> ''cantidad'')::integer * (v_item ->> ''costo_unitario'')::numeric;') = 1 then
    v_nuevo := replace(v_def,
      'v_subtotal := v_subtotal + (v_item ->> ''cantidad'')::integer * (v_item ->> ''costo_unitario'')::numeric;',
      v_validacion || 'v_subtotal := v_subtotal + (v_item ->> ''cantidad'')::integer * (v_item ->> ''costo_unitario'')::numeric;');
  else
    raise exception 'registrar_compra: no encontré (o no es única) la línea que acumula el subtotal (ADR-0132)';
  end if;
  v_def := v_nuevo;

  -- (c) la cabecera ya no lleva destino
  v_nuevo := replace(v_def, 'ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada',
                            'subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada');
  if v_nuevo = v_def then raise exception 'registrar_compra: no encontré la lista de columnas del insert en compras (ADR-0132)'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, 'p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_token, p_fecha_estimada_llegada',
                            'v_subtotal, v_igv, v_total, p_nota, v_persona, p_token, p_fecha_estimada_llegada');
  if v_nuevo = v_def then raise exception 'registrar_compra: no encontré los valores del insert en compras (ADR-0132)'; end if;
  v_def := v_nuevo;

  -- (d) cada línea guarda su reparto
  v_nuevo := replace(v_def,
    'insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)',
    'v_n2 := v_n2 + 1;' || E'\n    ' || 'insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)');
  if v_nuevo = v_def then raise exception 'registrar_compra: no encontré el insert en compra_items (ADR-0132)'; end if;
  v_def := v_nuevo;
  select count(*) into v_n from regexp_matches(v_def, '\(v_item ->> ''costo_unitario''\)::numeric\s*\)\s*;', 'g');
  if v_n <> 1 then raise exception 'registrar_compra: esperaba UN cierre del insert en compra_items y encontré % (ADR-0132)', v_n; end if;
  v_nuevo := regexp_replace(v_def, '\(v_item ->> ''costo_unitario''\)::numeric\s*\)\s*;',
                            replace('(v_item ->> ''costo_unitario'')::numeric', '\', '\\') || v_reparto);
  if v_nuevo = v_def then raise exception 'registrar_compra: no pude cerrar el insert en compra_items con el reparto (ADR-0132)'; end if;

  execute v_nuevo;
end $do$;

-- ==================== 8. recibir_compras: tope POR TIENDA (parche sobre la definición viva) ====================
do $$
declare
  v_oid oid := to_regprocedure('retail.recibir_compras(uuid,jsonb,text,text)');
  v_def text;
  v_nuevo text;
begin
  if v_oid is null then raise exception 'recibir_compras no tiene la firma esperada'; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def like '%compra_item_destinos%' then return; end if;  -- ya parchada: re-pegable

  v_nuevo := replace(v_def,
    'v_agregado jsonb; v_con_factura boolean := false;',
    'v_agregado jsonb; v_con_factura boolean := false;' || E'\n  v_asignado integer; v_recibido_aqui bigint; v_cerrado_aqui bigint; v_tienda text;');
  if v_nuevo = v_def then raise exception 'recibir_compras: no encontré dónde declarar las variables del reparto (ADR-0132)'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    'if v_recibido + v_cerrado + v_cantidad > v_linea.cantidad then',
    E'-- Reparto por tienda (ADR-0132): cada tienda recibe lo suyo. Además del tope de la línea, esta\n'
    || E'    -- tienda no recibe más de lo que le tocó menos lo que ya recibió y lo que ya cerró como faltante.\n'
    || E'    v_asignado := coalesce((select d.cantidad from compra_item_destinos d where d.compra_item_id = v_linea.id and d.ubicacion_id = p_ubicacion_id), 0);\n'
    || E'    v_recibido_aqui := (select coalesce(sum(m.cantidad), 0) from movimientos m where m.compra_item_id = v_linea.id and m.ubicacion_id = p_ubicacion_id);\n'
    || E'    v_cerrado_aqui := (select coalesce(sum(k.cantidad), 0) from compra_item_cierres k where k.compra_item_id = v_linea.id and k.ubicacion_id = p_ubicacion_id);\n'
    || E'    if v_recibido_aqui + v_cerrado_aqui + v_cantidad > v_asignado then\n'
    || E'      select u.nombre into v_tienda from ubicaciones u where u.id = p_ubicacion_id;\n'
    || E'      if v_asignado = 0 then\n'
    || E'        raise exception ''Factura %-%: esta línea no tiene mercadería asignada a %: pide a un líder que la reasigne antes de recibirla ahí'', v_compra.serie, v_compra.numero, v_tienda;\n'
    || E'      end if;\n'
    || E'      raise exception ''Factura %-%: a % le tocan % de esta línea, ya recibió % y cerró %; se intenta recibir % más'', v_compra.serie, v_compra.numero, v_tienda, v_asignado, v_recibido_aqui, v_cerrado_aqui, v_cantidad;\n'
    || E'    end if;\n'
    || E'    if v_recibido + v_cerrado + v_cantidad > v_linea.cantidad then');
  if v_nuevo = v_def then raise exception 'recibir_compras: no encontré dónde poner el tope por tienda (ADR-0132)'; end if;

  execute v_nuevo;
end $$;

-- ==================== 9. cerrar_linea_compra: el faltante es de una tienda ====================
-- Una firma nueva (5.º parámetro con default): `drop` de la vieja para no dejar dos sobrecargas vivas
-- (PostgREST respondería «could not choose the best candidate function»).
drop function if exists cerrar_linea_compra(uuid, integer, text, text);
create or replace function cerrar_linea_compra(p_compra_item_id uuid, p_cantidad integer, p_motivo text, p_nota text default null, p_ubicacion_id uuid default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_linea compra_items%rowtype;
  v_compra compras%rowtype;
  v_persona uuid;
  v_ub uuid;
  v_n integer;
  v_asignado integer;
  v_recibido bigint;
  v_cerrado bigint;
  v_pendiente bigint;
  v_cierre_id uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a cerrar debe ser mayor a cero';
  end if;
  if coalesce(p_motivo, '') not in ('no_llego', 'danada', 'error_proveedor') then
    raise exception 'Motivo de cierre no reconocido: %', coalesce(p_motivo, '(vacío)');
  end if;

  select * into v_linea from compra_items where id = p_compra_item_id;
  if not found then
    raise exception 'La línea de comprobante % no existe', p_compra_item_id;
  end if;

  -- La tienda del faltante: la que se indica; sin indicar, la única a la que está repartida la línea.
  v_ub := p_ubicacion_id;
  if v_ub is null then
    select count(*), (array_agg(d.ubicacion_id))[1] into v_n, v_ub
    from compra_item_destinos d where d.compra_item_id = v_linea.id;
    if v_n <> 1 then
      raise exception 'Esta línea está repartida entre % tiendas: indica en cuál se cierra el faltante', v_n;
    end if;
  end if;

  -- permiso antes de bloquear nada
  if not fn_puede_operar_ubicacion(v_ub) then
    raise exception 'No tienes permiso para cerrar líneas de este comprobante en esa tienda';
  end if;

  -- candados: línea y después comprobante (mismo orden que recibir_compras)
  select * into v_linea from compra_items where id = p_compra_item_id for update;
  select * into v_compra from compras where id = v_linea.compra_id for update;
  if v_compra.estado <> 'vigente' then
    raise exception 'El comprobante %-% está anulado, no acepta cierres', v_compra.serie, v_compra.numero;
  end if;

  v_asignado := coalesce((select d.cantidad from compra_item_destinos d where d.compra_item_id = v_linea.id and d.ubicacion_id = v_ub), 0);
  if v_asignado = 0 then
    raise exception 'Esta línea no tiene mercadería asignada a esa tienda: no hay nada que cerrar ahí';
  end if;
  select coalesce(sum(m.cantidad), 0) into v_recibido from movimientos m where m.compra_item_id = v_linea.id and m.ubicacion_id = v_ub;
  select coalesce(sum(k.cantidad), 0) into v_cerrado from compra_item_cierres k where k.compra_item_id = v_linea.id and k.ubicacion_id = v_ub;
  v_pendiente := v_asignado - v_recibido - v_cerrado;
  if v_pendiente <= 0 then
    raise exception 'La línea ya no tiene unidades pendientes en esa tienda: no hay nada que cerrar';
  end if;
  if p_cantidad > v_pendiente then
    raise exception 'A esa tienda le quedan % unidades pendientes de esta línea: no se pueden cerrar %', v_pendiente, p_cantidad;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compra_item_cierres (compra_item_id, ubicacion_id, cantidad, motivo, nota, usuario_id)
    values (v_linea.id, v_ub, p_cantidad, p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_persona)
    returning id into v_cierre_id;

  return v_cierre_id;
end;
$function$;
revoke all on function cerrar_linea_compra(uuid, integer, text, text, uuid) from public, anon;
grant execute on function cerrar_linea_compra(uuid, integer, text, text, uuid) to authenticated;

-- ==================== 10. recibir_envio: valida el reparto y pasa la tienda a los cierres ====================
do $$
declare
  v_oid oid := to_regprocedure('retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)');
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef(v_oid);
  if v_def like '%compra_item_destinos%' then return; end if;  -- ya parchada: re-pegable

  -- (a) un colaborador solo recibe líneas con reparto para SU sede
  v_nuevo := replace(v_def,
    'where c.ubicacion_destino_id is distinct from p_ubicacion_id',
    'where not exists (select 1 from compra_item_destinos d where d.compra_item_id = ci.id and d.ubicacion_id = p_ubicacion_id)');
  if v_nuevo = v_def then raise exception 'recibir_envio: no encontré la validación por destino de la cabecera (ADR-0132)'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def,
    'Ese comprobante está destinado a otra sede: solo un líder puede recibirlo aquí',
    'Esa línea no tiene mercadería asignada a esta sede: solo un líder puede recibirla aquí (o pide que la reasignen)');
  if v_nuevo = v_def then raise exception 'recibir_envio: no encontré el mensaje de la validación por destino (ADR-0132)'; end if;
  v_def := v_nuevo;

  -- (b) cada cierre queda a nombre de la tienda que recibe
  if (length(v_def) - length(replace(v_def, 'v_cierre ->> ''nota''', ''))) / length('v_cierre ->> ''nota''') <> 1 then
    raise exception 'recibir_envio: esperaba UNA llamada a cerrar_linea_compra con v_cierre ->> nota (ADR-0132)';
  end if;
  v_nuevo := replace(v_def, 'v_cierre ->> ''nota''', 'v_cierre ->> ''nota'',' || E'\n      p_ubicacion_id');
  execute v_nuevo;
end $$;

-- ==================== 11. reasignar_reparto_compra: corregir el reparto sin anular el comprobante ====================
-- Solo lo que la tienda de origen aún no recibió ni cerró. Solo líder (mismo permiso que registrar).
create or replace function reasignar_reparto_compra(
  p_compra_item_id uuid, p_desde uuid, p_hacia uuid, p_cantidad integer, p_motivo text, p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_linea compra_items%rowtype;
  v_compra compras%rowtype;
  v_persona uuid;
  v_asig integer; v_recibido bigint; v_cerrado bigint; v_pendiente bigint;
  v_id uuid; v_tienda text;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para reasignar el reparto de un comprobante';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a reasignar debe ser mayor a cero';
  end if;
  if coalesce(p_motivo, '') not in ('llego_de_mas', 'error_de_tienda', 'otro') then
    raise exception 'Motivo de reasignación no reconocido: %', coalesce(p_motivo, '(vacío)');
  end if;
  if p_desde is null or p_hacia is null or p_desde = p_hacia then
    raise exception 'La reasignación necesita dos tiendas distintas';
  end if;
  if not exists (select 1 from ubicaciones where id = p_hacia and activo) then
    raise exception 'La tienda de destino no existe o está inactiva';
  end if;

  -- candados: línea y después comprobante (mismo orden que recibir_compras y cerrar_linea_compra)
  select * into v_linea from compra_items where id = p_compra_item_id for update;
  if not found then
    raise exception 'La línea de comprobante % no existe', p_compra_item_id;
  end if;
  select * into v_compra from compras where id = v_linea.compra_id for update;
  if v_compra.estado <> 'vigente' then
    raise exception 'El comprobante %-% está anulado, no se puede reasignar', v_compra.serie, v_compra.numero;
  end if;

  select d.cantidad into v_asig from compra_item_destinos d where d.compra_item_id = v_linea.id and d.ubicacion_id = p_desde;
  if v_asig is null then
    raise exception 'Esa línea no tiene mercadería repartida a la tienda de origen';
  end if;
  select coalesce(sum(m.cantidad), 0) into v_recibido from movimientos m where m.compra_item_id = v_linea.id and m.ubicacion_id = p_desde;
  select coalesce(sum(k.cantidad), 0) into v_cerrado from compra_item_cierres k where k.compra_item_id = v_linea.id and k.ubicacion_id = p_desde;
  v_pendiente := v_asig - v_recibido - v_cerrado;
  if p_cantidad > v_pendiente then
    select u.nombre into v_tienda from ubicaciones u where u.id = p_desde;
    raise exception 'A % le quedan % unidades pendientes de esa línea: no se pueden reasignar % (solo se mueve lo que aún no recibió ni cerró)', v_tienda, v_pendiente, p_cantidad;
  end if;

  if p_cantidad = v_asig then
    delete from compra_item_destinos where compra_item_id = v_linea.id and ubicacion_id = p_desde;
  else
    update compra_item_destinos set cantidad = cantidad - p_cantidad where compra_item_id = v_linea.id and ubicacion_id = p_desde;
  end if;
  insert into compra_item_destinos (compra_item_id, ubicacion_id, cantidad)
    values (v_linea.id, p_hacia, p_cantidad)
    on conflict (compra_item_id, ubicacion_id) do update set cantidad = compra_item_destinos.cantidad + excluded.cantidad;

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into compra_reasignaciones (compra_item_id, desde_ubicacion_id, hacia_ubicacion_id, cantidad, motivo, nota, usuario_id)
    values (v_linea.id, p_desde, p_hacia, p_cantidad, p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_persona)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text) to authenticated;
comment on function reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text) is 'ADR-0132: mueve, de una tienda a otra, lo que aún no recibió ni cerró dentro de una línea de comprobante. Solo líder; deja rastro en compra_reasignaciones.';

-- ==================== 12. Lo que lee un integrante: «lo que le toca a mi tienda» (sin dinero) ====================
drop function if exists lineas_compra_operativo(uuid[]);
create or replace function lineas_compra_operativo(p_compra_ids uuid[], p_ubicacion_id uuid default null)
 RETURNS TABLE(id uuid, compra_id uuid, producto_id uuid, variante_id uuid, descripcion text,
               cantidad integer, cantidad_facturada integer, recibido bigint, cerrado bigint, pendiente bigint,
               asignado_aqui integer, recibido_aqui bigint, cerrado_aqui bigint, pendiente_aqui bigint, otras_tiendas jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  with ctx as (
    select fn_es_lider() as es_lider,
           fn_ubicacion_actual_persona() as mi_ub,
           coalesce(p_ubicacion_id, fn_ubicacion_actual_persona()) as ub
  )
  select r.id, r.compra_id, r.producto_id, r.variante_id, r.descripcion,
         r.cantidad, r.cantidad,
         r.recibido, r.cerrado, r.pendiente,
         coalesce(mi.asignado, 0)::integer,
         coalesce(mi.recibido, 0)::bigint,
         coalesce(mi.cerrado, 0)::bigint,
         (coalesce(mi.asignado, 0) - coalesce(mi.recibido, 0) - coalesce(mi.cerrado, 0))::bigint,
         case when ctx.es_lider then (
           select coalesce(jsonb_agg(jsonb_build_object(
                    'ubicacion_id', o.ubicacion_id, 'nombre', u.nombre,
                    'asignado', o.asignado, 'recibido', o.recibido, 'cerrado', o.cerrado, 'pendiente', o.pendiente
                  ) order by u.nombre), '[]'::jsonb)
           from compra_item_reparto_resumen o
           join ubicaciones u on u.id = o.ubicacion_id
           where o.compra_item_id = r.id and o.ubicacion_id is distinct from ctx.ub
         ) end
  from compra_items_resumen r
  cross join ctx
  left join compra_item_reparto_resumen mi on mi.compra_item_id = r.id and mi.ubicacion_id = ctx.ub
  where auth.uid() is not null
    and r.compra_id = any(p_compra_ids)
    -- un colaborador solo mira su propia tienda y solo las líneas con reparto para ella
    and (ctx.es_lider or (ctx.ub is not distinct from ctx.mi_ub and mi.compra_item_id is not null));
$function$;
revoke all on function lineas_compra_operativo(uuid[], uuid) from public, anon;
grant execute on function lineas_compra_operativo(uuid[], uuid) to authenticated;
comment on function lineas_compra_operativo(uuid[], uuid) is 'ADR-0132: líneas de comprobante SIN dinero. cantidad/recibido/cerrado/pendiente son de toda la línea; *_aqui, de la tienda indicada (o la de la persona). Un colaborador solo recibe las líneas con reparto para su tienda; un líder recibe todas y, en otras_tiendas, cómo va el resto.';

drop function if exists listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text);
create or replace function listar_compras_operativo(
  p_limite integer default 50,
  p_cursor_fecha date default null,
  p_cursor_creado_en timestamptz default null,
  p_cursor_id uuid default null,
  p_busqueda text default null,
  p_proveedor_id uuid default null,
  p_estado_recepcion text default null,
  p_por_recibir boolean default false,
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null,
  p_ubicacion_id uuid default null
)
 RETURNS TABLE(id uuid, proveedor_id uuid, proveedor_nombre text, proveedor_ruc text, tipo text, documento text,
               fecha_emision date, ubicaciones_destino uuid[], estado text, nota text, created_at timestamptz,
               facturado_cantidad integer, recibido_cantidad integer, estado_recepcion text,
               fecha_estimada_llegada date, recepcion_atrasada boolean, cerrado_cantidad integer,
               asignado_aqui bigint, recibido_aqui bigint, cerrado_aqui bigint, pendiente_aqui bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
  v_es_lider boolean := fn_es_lider();
  v_mi_ub uuid := fn_ubicacion_actual_persona();
  v_ub uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  -- La tienda desde la que se mira. Un colaborador solo mira la suya.
  v_ub := coalesce(p_ubicacion_id, case when v_es_lider then null else v_mi_ub end);
  if not v_es_lider and v_ub is distinct from v_mi_ub then
    return;
  end if;
  if v_busqueda is not null then
    select coalesce(array_agg(pr.id), '{}') into v_proveedores from proveedores pr where pr.nombre ilike '%' || v_busqueda || '%';
  end if;
  return query
    select r.id, r.proveedor_id, r.proveedor_nombre, r.proveedor_ruc, r.tipo, r.documento, r.fecha_emision,
           case when v_es_lider then r.ubicaciones_destino
                else (select array_agg(x) from unnest(r.ubicaciones_destino) x where x = v_mi_ub) end,
           r.estado, r.nota, r.created_at, r.facturado_cantidad, r.recibido_cantidad,
           r.estado_recepcion, r.fecha_estimada_llegada, r.recepcion_atrasada, r.cerrado_cantidad,
           t.asignado, t.recibido, t.cerrado, t.pendiente
    from compras_resumen r
    left join lateral (
      select sum(rs.asignado)::bigint as asignado, sum(rs.recibido)::bigint as recibido,
             sum(rs.cerrado)::bigint as cerrado, sum(rs.pendiente)::bigint as pendiente
      from compra_item_reparto_resumen rs
      where rs.compra_id = r.id and rs.ubicacion_id = v_ub
    ) t on v_ub is not null
    where fn_puede_ver_compra(r.id)
      -- con una tienda de por medio: solo comprobantes con reparto para ella
      and (v_ub is null or t.asignado is not null)
      and (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
      and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
      and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
      and (p_tipo is null or r.tipo = p_tipo)
      and (not p_por_recibir or (r.estado = 'vigente' and (
            case when v_ub is null then r.estado_recepcion in ('sin_recibir', 'parcial')
                 else coalesce(t.pendiente, 0) > 0 end)))
      and (p_desde is null or r.fecha_emision >= p_desde)
      and (p_hasta is null or r.fecha_emision <= p_hasta)
      and (p_cursor_id is null or (r.fecha_emision, r.created_at, r.id) < (p_cursor_fecha, p_cursor_creado_en, p_cursor_id))
    order by r.fecha_emision desc, r.created_at desc, r.id desc
    limit v_limite;
end;
$function$;
revoke all on function listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text, uuid) from public, anon;
grant execute on function listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text, uuid) to authenticated;
comment on function listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text, uuid) is 'ADR-0132: lista de comprobantes SIN dinero, vista desde una tienda. Con p_ubicacion_id (o la del colaborador) solo trae los que tienen reparto para ella y suma su asignado/recibido/cerrado/pendiente; con p_por_recibir, los que aún le faltan.';

-- ==================== 13. Autoverificación ====================
do $$
begin
  if exists (
    select 1 from compra_items i
    where i.cantidad <> coalesce((select sum(d.cantidad) from compra_item_destinos d where d.compra_item_id = i.id), 0)
  ) then
    raise exception 'Autoverificación: hay líneas de comprobante cuyo reparto no suma lo facturado';
  end if;
  if to_regprocedure('retail.cerrar_linea_compra(uuid,integer,text,text,uuid)') is null
     or to_regprocedure('retail.cerrar_linea_compra(uuid,integer,text,text)') is not null then
    raise exception 'Autoverificación: cerrar_linea_compra debe quedar con UNA sola firma (la de 5 parámetros)';
  end if;
  if to_regprocedure('retail.lineas_compra_operativo(uuid[])') is not null
     or to_regprocedure('retail.listar_compras_operativo(integer,date,timestamptz,uuid,text,uuid,text,boolean,date,date,text)') is not null then
    raise exception 'Autoverificación: quedó una sobrecarga vieja de las lecturas operativas';
  end if;
end $$;

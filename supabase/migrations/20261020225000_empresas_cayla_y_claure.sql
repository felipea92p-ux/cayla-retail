-- ============================================================================
-- 20261020225000 — Empresas: CAYLA y CLAURE, y a cuál pertenece cada producto (ADR-0463)
--
-- EL NOMBRE. En la base y el código se llama «empresa»: «tienda» ya es la sede (Tienda TRU/AQP/LIM, `ubicaciones`) y «Tienda web» es la
-- tienda online. En pantalla el alta dice «Tienda» por ahora (así lo pidió Felipe); si él prefiere «Empresa», es solo una etiqueta.
--
-- QUÉ ES ESTO
--   Felipe (2026-10-20): llega una segunda empresa, CLAURE, que es un negocio distinto de CAYLA. Comparten sede solo en
--   Lima, y las boletas y facturas de Claure salen con el RUC de CAYLA (un solo emisor: SUNAT/Lucode no cambian).
--   Esta migración solo agrega el DATO: cada producto dice a qué empresa pertenece. El alta de producto lo pregunta ANTES
--   de la categoría, y SOLO desde una sede donde operan las dos empresas (hoy Lima): Trujillo y Arequipa guardan siempre
--   como CAYLA y ni ven la pregunta. No crea sedes nuevas ni toca stock, caja, ventas ni comprobantes.
--
-- LO QUE AGREGA
--   1. `empresas` (cayla, claure) — con ids fijos, para que el valor de fábrica de la columna sea una constante.
--   2. `productos.empresa_id`, obligatoria, con CAYLA de fábrica: todo lo que existe hoy es de CAYLA, y cualquier alta que
--      no sepa de empresas (la web vieja, la hoja de «Llegó mercadería», el censo) sigue funcionando y nace en CAYLA.
--   3. `empresa_sedes`: qué empresas operan en cada sede (CAYLA en todas; CLAURE solo en Lima). Es el dato que decide si el alta
--      pregunta la empresa: con una sola, no se pregunta. Una sede nueva sin filas se trata como solo-CAYLA.
--      `fn_empresas_de_sede(sede)` entrega esa lista a la pantalla (las tablas no tienen políticas: solo se leen por función).
--   4. `crear_producto_con_empresa(...)`: `crear_producto_con_stock_inicial` + la empresa, en la MISMA transacción. Es una
--      función NUEVA que llama a la de siempre: no se reescribe ni se rompe la firma de ninguna (las altas que esperan
--      sin conexión en un navegador con la web vieja siguen subiendo).
--   4b. `fn_empresas()` + `empresas.web = 'tienda.cayla.pe'`: lo que las etiquetas impresas leen (nombre, logo solo de CAYLA y el link).
--   5. La hora declarada (`x-momento`) vale también en `crear_producto_con_empresa`: la web la encola sin conexión, como a
--      `crear_producto_con_stock_inicial`. La lista que `fn_actor_persona_id` lee por `request.path` queda así:
--      /rpc/(registrar_venta|recibir_lote|recibir_envio|crear_producto_con_stock_inicial|crear_producto_con_empresa|crear_producto_con_variantes)$
--      Se suma con un reemplazo anclado por TEXTO (el mismo de 20261013155000): si la lista cambió y no aparece exactamente
--      una vez, aborta sin tocar nada. Sin esto, un alta hecha sin internet por quien ya marcó su salida se rechazaría al
--      subir. Lo vigila `apps/web/lib/cola-hora-declarada.test.ts`.
--
-- ESTADOS IMPOSIBLES QUE CIERRA
--   · Un producto sin empresa, o con una empresa que no existe — not null + llave foránea.
--   · Un alta con una empresa desactivada o inexistente, o una empresa que no opera en la sede desde donde se registra
--     (CLAURE desde Trujillo) — la función lo rechaza ANTES de crear nada.
--   · Dos empresas con el mismo código — único.
--   · Leer o escribir `empresas` por fuera de las funciones — RLS sin políticas y revoke.
--
-- LO QUE NO HACE (queda para cuando Felipe lo decida)
--   · No obliga a que el STOCK de Claure esté solo en la sede de Lima (un traslado a otra sede lo movería): `empresa_sedes`
--     ya tiene el dato, pero usarlo en Existencias, Traslados y la carga inicial es otro cambio.
--   · No filtra Productos, Análisis ni Existencias por empresa; ni separa categorías por empresa.
--
-- CÓMO SE PEGA EN PRODUCCIÓN
--   Una sola ejecución: no crea políticas (no hay riesgo de deadlock con el Asesor de seguridad) y el `alter table` es
--   solo de metadatos (columna con valor de fábrica constante). Tiene `lock_timeout` de 3 s: si `productos` está tomada
--   en ese instante, falla sin aplicar nada y se vuelve a pegar. Es idempotente.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 1. Las empresas ------------------------------------------------------------
create table if not exists retail.empresas (
  id uuid primary key,
  clave text not null unique check (clave ~ '^[a-z0-9_]+$'),
  nombre text not null check (btrim(nombre) <> ''),
  -- Para la etiqueta de precio y la tienda online (otra sesión las llena): null = el colibrí de CAYLA / sin la línea de la web.
  logo_url text,
  web text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table retail.empresas is
  'ADR-0463: los negocios que venden con el ERP (CAYLA, CLAURE). Una empresa NO es una sede (`ubicaciones`): CAYLA y CLAURE comparten la sede de Lima. Las boletas de todas salen con el RUC de CAYLA. Solo se lee por `fn_empresas_de_sede()`.';

alter table retail.empresas enable row level security;  -- sin políticas a propósito: solo `security definer`
revoke all on retail.empresas from public, anon, authenticated;

insert into retail.empresas (id, clave, nombre, orden) values
  ('ca71a000-0000-4000-8000-000000000001', 'cayla',  'CAYLA',  1),
  ('c1a07e00-0000-4000-8000-000000000002', 'claure', 'CLAURE', 2)
on conflict (id) do nothing;

-- Qué empresas operan en cada sede. CAYLA, en todas; CLAURE, solo en Lima (Felipe, 2026-10-20: «solo aplica para registros desde
-- la tienda de Lima; Trujillo y Arequipa guardan con CAYLA siempre»). Con una sola empresa en la sede, el alta no pregunta nada.
create table if not exists retail.empresa_sedes (
  empresa_id uuid not null references retail.empresas (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  primary key (empresa_id, ubicacion_id)
);

comment on table retail.empresa_sedes is
  'ADR-0463: qué empresas (CAYLA, CLAURE) operan en cada sede. Decide si «Nuevo producto» pregunta la empresa (solo si la sede tiene más de una). Una sede sin filas se trata como solo-CAYLA. Solo se lee por `fn_empresas_de_sede()`.';

alter table retail.empresa_sedes enable row level security;  -- sin políticas a propósito: solo `security definer`
revoke all on retail.empresa_sedes from public, anon, authenticated;

-- CAYLA en todas las sedes que hay hoy; CLAURE en Lima. Lima se reconoce por su nombre como lo hace 20261019190000 («Tienda LIM» en
-- producción, «Tienda Lima» en un banco local). Si esta base no tiene Lima (un banco de pruebas), CLAURE no queda en ninguna sede
-- y el alta no pregunta nada: se avisa, no se rompe. Una sede NUEVA se suma a mano a esta tabla.
insert into retail.empresa_sedes (empresa_id, ubicacion_id)
select 'ca71a000-0000-4000-8000-000000000001', u.id from retail.ubicaciones u
on conflict do nothing;

insert into retail.empresa_sedes (empresa_id, ubicacion_id)
select 'c1a07e00-0000-4000-8000-000000000002', u.id from retail.ubicaciones u where u.nombre in ('Tienda LIM', 'Tienda Lima')
on conflict do nothing;

do $aviso$
begin
  if not exists (select 1 from retail.empresa_sedes where empresa_id = 'c1a07e00-0000-4000-8000-000000000002') then
    raise notice 'ADR-0463: esta base no tiene la sede de Lima: CLAURE no opera en ninguna sede todavía (agrégala a retail.empresa_sedes).';
  end if;
end
$aviso$;

-- 2. De qué empresa es cada producto ----------------------------------------
-- La empresa «de la casa»: la de fábrica de todo lo que no sabe de empresas (la web vieja, el censo, «Es nueva» al recibir). Función y no
-- un uuid suelto en la columna: si algún día la casa cambia, se cambia aquí y no en cada tabla.
-- SECURITY DEFINER a propósito: el valor de fábrica de `productos.empresa_id` lo evalúa QUIEN inserta (un `INSERT` directo de una cuenta
-- autenticada incluido), y esa cuenta no puede leer `empresas` (sin políticas). Sin esto, `permission denied for table empresas`
-- (lo vio `pruebas:temporadas` en el CI de #1222; en producción se corrigió el mismo día).
create or replace function retail.fn_empresa_casa_id()
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select id from retail.empresas where clave = 'cayla' $$;

alter table retail.productos
  add column if not exists empresa_id uuid not null
    default retail.fn_empresa_casa_id()
    references retail.empresas (id);

comment on column retail.productos.empresa_id is
  'ADR-0463: la empresa a la que pertenece el producto (CAYLA de fábrica). Se elige en el alta, antes de la categoría. No cambia el stock ni los comprobantes.';

-- 3. La lista para el combo --------------------------------------------------
create or replace function retail.fn_empresas_de_sede(p_sede_id uuid)
returns table (id uuid, clave text, nombre text, orden integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Las empresas que operan en la sede. Una sede sin filas (nueva, sin sumar a `empresa_sedes`) es solo-CAYLA: nunca queda sin empresa.
  select t.id, t.clave, t.nombre, t.orden
    from retail.empresas t
   where t.activo
     and (exists (select 1 from retail.empresa_sedes ts where ts.empresa_id = t.id and ts.ubicacion_id = p_sede_id)
          or (t.id = 'ca71a000-0000-4000-8000-000000000001'
              and not exists (select 1 from retail.empresa_sedes ts where ts.ubicacion_id = p_sede_id)))
   order by t.orden, t.nombre;
$$;

-- 3b. La web de cada empresa y la lista completa (las etiquetas impresas: nombre, logo y link). --------------------------------
-- Felipe (2026-10-20): el link del papel es «tienda.cayla.pe» (la tienda online), no «cayla.pe». Solo se llena si está vacío: si otra
-- sesión o un líder ya puso otra web, no se pisa. El colibrí del papel es solo de CAYLA (`clave = 'cayla'`), no depende de `logo_url`.
update retail.empresas set web = 'tienda.cayla.pe' where web is null;

create or replace function retail.fn_empresas()
returns table (id uuid, clave text, nombre text, logo_url text, web text, orden integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id, e.clave, e.nombre, e.logo_url, e.web, e.orden from retail.empresas e where e.activo order by e.orden, e.nombre;
$$;

-- 4. El alta con empresa ------------------------------------------------------
create or replace function retail.crear_producto_con_empresa(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_empresa_id uuid,
  p_sede_id uuid,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false,
  p_etiqueta_ids uuid[] default null,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null,
  p_ubicacion_id uuid default null,
  p_al_piso boolean default false,
  p_temporada text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto uuid;
begin
  -- 1. La empresa, ANTES de crear nada: una empresa que no existe o está desactivada no deja ni un producto a medias.
  if p_empresa_id is null or not exists (select 1 from retail.empresas where id = p_empresa_id and activo) then
    raise exception 'Elige una tienda que exista.' using hint = 'empresa_invalida';
  end if;
  -- 1b. Y que opere en la sede desde donde se registra: CLAURE solo desde Lima. Trujillo y Arequipa guardan con CAYLA.
  if not exists (select 1 from retail.fn_empresas_de_sede(p_sede_id) t where t.id = p_empresa_id) then
    raise exception 'Esa tienda no opera en esta sede.' using hint = 'empresa_fuera_de_sede';
  end if;

  -- 2. El alta de siempre, con TODOS sus candados (permisos de catálogo, nombre único, marca y proveedor, tallas, tejido,
  --    stock inicial). Si algo falla, no se crea nada y la empresa tampoco se toca.
  v_producto := retail.crear_producto_con_stock_inicial(
    p_referencia, p_categoria_id, p_variantes, p_descripcion, p_token, p_tejido_id, p_patron_id, p_confirmo_distinto,
    p_etiqueta_ids, p_marca_id, p_proveedor_id, p_ubicacion_id, p_al_piso, p_temporada);

  -- 3. La empresa, en la misma transacción. Un reintento del mismo token devuelve el mismo producto: esto no cambia nada.
  update retail.productos set empresa_id = p_empresa_id
   where id = v_producto and empresa_id is distinct from p_empresa_id;

  return v_producto;
end;
$$;

comment on function retail.crear_producto_con_empresa(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text) is
  'ADR-0463: crear_producto_con_stock_inicial + la empresa del producto (obligatoria y de una empresa que opere en `p_sede_id`, la sede desde donde se registra), todo o nada. Mismos candados y mismo token que la de siempre; un producto sin empresa sigue naciendo en CAYLA.';

revoke all on function retail.fn_empresa_casa_id() from public, anon;
revoke all on function retail.fn_empresas() from public, anon;
revoke all on function retail.fn_empresas_de_sede(uuid) from public, anon;
revoke all on function retail.crear_producto_con_empresa(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text) from public, anon;
grant execute on function retail.fn_empresa_casa_id() to authenticated;
grant execute on function retail.fn_empresas() to authenticated;
grant execute on function retail.fn_empresas_de_sede(uuid) to authenticated;
grant execute on function retail.crear_producto_con_empresa(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text) to authenticated;

-- 5. La hora declarada también vale en el alta con empresa. --------------------------------------------------------------------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-ejecutable: el texto nuevo contiene al viejo, así que si ya está puesto no se vuelve a parchear.
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

-- Solo si `fn_actor_persona_id` ya tiene la lista (20261013155000 pegada). Si todavía no —producción el 2026-10-20—, la hora declarada vale en
-- TODAS las funciones y no hay nada que sumar. Pero al pegar 20261013155000 después, su lista no trae `crear_producto_con_empresa`: hay que
-- VOLVER A PEGAR esta migración (es repetible) para sumarla; si no, una alta con empresa hecha sin internet firmaría con la hora de subida.
do $lista$
begin
  if position('request.path' in pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure)) = 0 then
    raise notice 'ADR-0463: fn_actor_persona_id no tiene aún la lista de la hora declarada (20261013155000): nada que sumar. Vuelve a pegar esta migración después de esa.';
  else
    perform pg_temp.reemplazar(
      'retail.fn_actor_persona_id(boolean)',
      'crear_producto_con_stock_inicial|crear_producto_con_variantes)$',
      'crear_producto_con_stock_inicial|crear_producto_con_empresa|crear_producto_con_variantes)$',
      1
    );
  end if;
end
$lista$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261020225000 · empresas CAYLA y CLAURE' as parte,
       case when to_regclass('retail.empresas') is not null
             and (select count(*) from retail.empresas) >= 2
             and to_regclass('retail.empresa_sedes') is not null
             and exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'empresa_id')
             and to_regprocedure('retail.crear_producto_con_empresa(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text)') is not null
             and (pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure) like '%crear_producto_con_empresa%'
                  or position('request.path' in pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure)) = 0)
            then 'QUEDÓ BIEN' else 'REVISAR: falta la tabla, la columna, la función o la hora declarada' end as resultado;

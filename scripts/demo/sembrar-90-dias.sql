-- ============================================================================
-- scripts/demo/sembrar-90-dias.sql
-- Historia sintética de 90 días para el ERP de CAYLA (ver plan y ADR-01NN
-- en docs/adr/, y docs/demo-90-dias/QUE-MIRAR.md para verificar).
--
-- Un generador determinista: misma semilla = mismos datos. Corre dentro de
-- una sola transacción, con INSERT directo y fechas históricas explícitas.
-- Se ensaya con ROLLBACK; el COMMIT final lo pega Felipe en el SQL Editor
-- de producción con:
--     set search_path to retail, public;
-- antes de pegar este archivo (el archivo mismo NO lleva el prefijo
-- `retail.`, para no romper `npx supabase db reset` local — ver CLAUDE.md).
--
-- Todo id sembrado empieza en 5eed (overlay de un md5 determinista) — así
-- se puede filtrar y deshacer sin tocar los 45 productos / 16 ventas reales.
--
-- FASE 1 de 7 — Catálogo: productos, variantes, fotos, campañas demo.
-- (El SKU manual de las variantes queda vacío: el trigger igual les asigna
-- código y código de barras, y ninguna pantalla ni RPC exige SKU.)
-- Fases 2-7 (demanda, inventario/compras, ventas/caja, postventa/taller,
-- cierre, ensayo completo) se agregan en pasos siguientes — no encadenar.
-- ============================================================================

begin;
set local statement_timeout = 0;
set local search_path to retail, public, extensions;

-- ---------------------------------------------------------------------------
-- Parámetros (todo lo que cambia entre corridas vive aquí arriba)
-- ---------------------------------------------------------------------------
do $$
declare
  pv_fin date := (now() at time zone 'America/Lima')::date;  -- último día de la ventana (día Lima, no UTC)
  pv_dias int := 90;
  pv_semilla double precision := 0.5726;     -- setseed(): misma semilla = mismos datos
  pv_escala numeric := 1;                    -- volumen de ventas: 1 = ~7.000 boletas; 0.05 para ensayos chicos
begin
  perform set_config('cayla_seed.semilla', pv_semilla::text, true);
  perform set_config('cayla_seed.escala', pv_escala::text, true);
  perform set_config('cayla_seed.fin', pv_fin::text, true);
  perform set_config('cayla_seed.inicio', (pv_fin - (pv_dias - 1))::text, true);
  perform set_config('cayla_seed.carga_inicial', (pv_fin - pv_dias)::text, true);
  perform setseed(pv_semilla);
end $$;

-- ---------------------------------------------------------------------------
-- Impersonar un líder para toda la transacción: los triggers de alta
-- (`productos_estado_alta_biut`, `etiquetas_estado_biut`) miran auth.uid()
-- y solo un líder (retail.colaboradores.rol = 'lider') deja el alta aprobada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_lider_auth uuid;
begin
  select p.auth_user_id into v_lider_auth
    from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where c.rol = 'lider' and p.estado = 'activo' and p.auth_user_id is not null
    order by p.id
    limit 1;

  if v_lider_auth is null then
    raise exception 'No hay ningún líder con auth_user_id activo — no se puede sembrar el catálogo aprobado.';
  end if;

  perform set_config('request.jwt.claim.sub', v_lider_auth::text, true);
end $$;

-- =============================================================================
-- FASE 1 — CATÁLOGO
-- =============================================================================

-- ---- 1.1 Reparto de 220 productos por categoría, con su banda de precio (S/) ----
-- Mezcla según las compras reales: Polos+Tops = 22 % (48), Complementos = 21 %
-- (46, repartidos entre accesorios y bisutería), Camisas y Blusas = 9 % (20) y
-- el resto entre el catálogo vigente. Cantidades fijas, no proporcionales: así
-- el redondeo no desvía el reparto.
create temp table tmp_categorias (categoria text, n int, lo int, hi int) on commit drop;
insert into tmp_categorias (categoria, n, lo, hi) values
  ('Polos', 18, 49, 79), ('Tops', 30, 59, 89),
  ('Camisas y Blusas', 20, 69, 109),
  ('Bolsos y Carteras', 8, 89, 179), ('Cinturones', 4, 49, 79), ('Aretes', 6, 49, 59), ('Collares', 5, 49, 69),
  ('Pulseras', 5, 49, 69), ('Anillos', 4, 49, 59), ('Gorros y Sombreros', 4, 49, 79), ('Lentes de sol', 4, 59, 99),
  ('Pañuelos y Pañoletas', 3, 49, 69), ('Mochilas', 2, 99, 159), ('Riñoneras', 1, 59, 89),
  ('Jeans', 8, 129, 179), ('Pantalones', 8, 119, 159), ('Vestidos', 12, 149, 249), ('Faldas', 8, 89, 129),
  ('Shorts', 6, 69, 99), ('Casacas', 6, 169, 249), ('Blazers', 4, 179, 249), ('Conjuntos', 8, 139, 199),
  ('Enterizos', 4, 149, 219), ('Poleras', 6, 89, 129), ('Chompas', 10, 99, 149), ('Chalecos', 3, 99, 139),
  ('Bodys', 3, 49, 69), ('Ropa interior/Lencería', 3, 49, 89), ('Zapatillas', 6, 149, 229),
  ('Sandalias', 4, 79, 129), ('Botas', 2, 189, 249), ('Botines', 2, 159, 229), ('Bailarinas', 1, 79, 119),
  ('Mocasines', 1, 99, 149), ('Zapatos formales', 1, 129, 199);

create temp table tmp_categoria_cuenta (categoria_id uuid, categoria text, n int, lo int, hi int) on commit drop;
insert into tmp_categoria_cuenta
select c.id, t.categoria, t.n, t.lo, t.hi
from tmp_categorias t
join retail.categorias c on c.nombre = t.categoria and c.activo;

do $$
declare v_total int; v_cats int;
begin
  select sum(n), count(*) into v_total, v_cats from tmp_categoria_cuenta;
  if v_total <> 220 or v_cats <> (select count(*) from tmp_categorias) then
    raise exception 'El reparto por categoría suma % en % categorías (se esperaban 220 y %): falta o sobra alguna categoría en retail.categorias',
      v_total, v_cats, (select count(*) from tmp_categorias);
  end if;
end $$;

-- ---- 1.2 Pools de nombres por categoría (sustantivo × estilo × detalle) ----
create temp table tmp_pool_specs (categoria text, sustantivo text, estilos text[], detalles text[]) on commit drop;
insert into tmp_pool_specs (categoria, sustantivo, estilos, detalles) values
  ('Polos', 'Polo', array['Básico','Oversize','Slim Fit','Manga Larga','Cuello Redondo','Cuello V','Rayado','Estampado','Piqué'], array['Algodón Pima','Jersey','Waffle','Orgánico']),
  ('Tops', 'Top', array['Crop','Halter','Strapless','Escote Cruzado','Tirantes','Básico','Cuello Alto','Asimétrico'], array['Licra','Algodón','Modal','Rib']),
  ('Camisas y Blusas', 'Blusa', array['Manga Larga','Manga Corta','Cuello Camisero','Estampada','Lisa','Satinada','Oversize'], array['Viscosa','Seda Sintética','Lino','Popelina']),
  ('Jeans', 'Jean', array['Skinny','Mom','Recto','Wide Leg','Bota Campana','Tiro Alto'], array['Denim Clásico','Denim Stretch']),
  ('Pantalones', 'Pantalón', array['Palazzo','Recto','Jogger','Sastre','Culotte','Cargo'], array['Lino','Drill','Tencel']),
  ('Vestidos', 'Vestido', array['Midi','Corto','Camisero','Cruzado','Corte A','Ajustado','Evasé'], array['Algodón','Viscosa','Punto']),
  ('Faldas', 'Falda', array['Midi','Corta','Lápiz','Plisada','Wrap'], array['Denim','Punto','Satinada']),
  ('Shorts', 'Short', array['Denim','Deportivo','Sastre','Cargo'], array['Algodón','Drill']),
  ('Casacas', 'Casaca', array['Bomber','Denim','Acolchada','Rompeviento'], array['Poliéster','Denim']),
  ('Blazers', 'Blazer', array['Clásico','Oversize','Cruzado'], array['Lino','Punto']),
  ('Conjuntos', 'Conjunto', array['Top y Short','Blusa y Falda','Crop y Pantalón','Dos Piezas'], array['Algodón','Punto']),
  ('Enterizos', 'Enterizo', array['Palazzo','Short','Cruzado'], array['Lino','Viscosa']),
  ('Poleras', 'Polera', array['Básica','Oversize','Capucha','Crop'], array['Algodón','Frisa']),
  ('Chompas', 'Chompa', array['Cuello Redondo','Cuello V','Tejida','Oversize','Cropped'], array['Lana','Acrílico','Alpaca']),
  ('Chalecos', 'Chaleco', array['Tejido','Sastre','Acolchado'], array['Lana','Plumón']),
  ('Bodys', 'Body', array['Manga Larga','Sin Manga','Escote V'], array['Licra','Algodón']),
  ('Ropa interior/Lencería', 'Conjunto Lencería', array['Encaje','Básico','Deportivo'], array['Algodón','Encaje']),
  ('Zapatillas', 'Zapatilla', array['Urbana','Deportiva','Plataforma'], array['Cuero Sintético','Textil']),
  ('Sandalias', 'Sandalia', array['Plana','Taco','Plataforma'], array['Cuero','Sintético']),
  ('Botas', 'Bota', array['Caña Alta','Caña Corta','Texana'], array['Cuero','Sintético']),
  ('Botines', 'Botín', array['Taco','Plano','Chelsea'], array['Cuero','Sintético']),
  ('Bailarinas', 'Bailarina', array['Clásica','Punta Fina'], array['Cuero Sintético']),
  ('Mocasines', 'Mocasín', array['Clásico','Plataforma'], array['Cuero Sintético']),
  ('Zapatos formales', 'Zapato', array['Taco Alto','Taco Medio','Punta Fina'], array['Charol','Cuero Sintético']),
  ('Bolsos y Carteras', 'Bolso', array['Tote','Crossbody','Mini','Shopper','Clutch'], array['Cuero Sintético','Textil']),
  ('Cinturones', 'Cinturón', array['Ancho','Delgado','Trenzado'], array['Cuero Sintético','Texturizado']),
  ('Aretes', 'Arete', array['Argolla','Colgante','Stud','Geométrico'], array['Metal Dorado','Metal Plateado']),
  ('Collares', 'Collar', array['Cadena Fina','Choker','Colgante','Capas'], array['Metal Dorado','Metal Plateado']),
  ('Pulseras', 'Pulsera', array['Cadena','Dije','Set'], array['Metal Dorado','Metal Plateado']),
  ('Anillos', 'Anillo', array['Ajustable','Set','Delgado'], array['Metal Dorado','Metal Plateado']),
  ('Gorros y Sombreros', 'Gorro', array['Bucket','Beanie','Pescador'], array['Algodón','Lana']),
  ('Lentes de sol', 'Lentes de Sol', array['Redondos','Cuadrados','Ojo de Gato'], array['Acetato','Acetato Mate']),
  ('Pañuelos y Pañoletas', 'Pañoleta', array['Estampada','Lisa','Seda Sintética'], array['Seda Sintética','Algodón']),
  ('Mochilas', 'Mochila', array['Urbana','Mini'], array['Textil']),
  ('Riñoneras', 'Riñonera', array['Urbana','Deportiva'], array['Textil']);

create temp table tmp_nombres_candidatos (categoria text, referencia text) on commit drop;
insert into tmp_nombres_candidatos (categoria, referencia)
select s.categoria, s.sustantivo || ' ' || estilo || ' ' || detalle
from tmp_pool_specs s, unnest(s.estilos) estilo, unnest(s.detalles) detalle;

-- ---- 1.3 Elegir N nombres por categoría, sin chocar con productos existentes ----
create temp table tmp_productos_nuevos (
  id uuid, categoria_id uuid, referencia text, marca_id uuid, proveedor_id uuid,
  tejido_id uuid, patron_id uuid, temporada text, stock_minimo int, creado_en timestamptz, estado text
) on commit drop;

with candidatos_numerados as (
  select cc.categoria_id, cc.categoria, cc.n, cand.referencia,
         row_number() over (partition by cc.categoria order by random()) rn
  from tmp_nombres_candidatos cand
  join tmp_categoria_cuenta cc on cc.categoria = cand.categoria
  where not exists (
    select 1 from retail.productos p2
    where retail.fn_clave_referencia(p2.referencia) = retail.fn_clave_referencia(cand.referencia)
  )
),
elegidos as (
  select categoria_id, categoria, referencia,
         row_number() over (order by random()) as orden_global
  from candidatos_numerados
  where rn <= n
),
-- 40 productos (mezclados entre categorías) nacen como colección Primavera-Verano
-- el 5-8 sep; los otros 180 ya existían antes de la ventana.
fechas as (
  select e.*,
    case when orden_global <= 40 then 'Primavera-Verano' else 'Otoño-Invierno' end as temporada,
    case
      when orden_global <= 40 then
        (least(greatest(make_date(extract(year from current_setting('cayla_seed.fin')::date)::int, 9, 5), current_setting('cayla_seed.inicio')::date), current_setting('cayla_seed.fin')::date)
          + (orden_global % 4) * interval '1 day')::date
      else current_setting('cayla_seed.carga_inicial')::date - ((orden_global % 20)::int)
    end as fecha_alta
  from elegidos e
)
insert into tmp_productos_nuevos
select
  overlay(md5('seed:productos:' || f.orden_global::text) placing '5eed' from 1 for 4)::uuid,
  f.categoria_id,
  f.referencia,
  mp.marca_id,
  mp.proveedor_id,
  (select ct.tejido_id from retail.categoria_tejidos ct where ct.categoria_id = f.categoria_id order by random() limit 1),
  (select cp.patron_id from retail.categoria_patrones cp where cp.categoria_id = f.categoria_id order by random() limit 1),
  f.temporada,
  (3 + (f.orden_global % 5))::int,
  (f.fecha_alta::timestamptz + (f.orden_global % 12) * interval '1 hour' + (f.orden_global % 60) * interval '1 minute'),
  -- A14: una prenda de las viejas (la 41, fuera de las 40 nuevas) ya está descontinuada y conserva stock
  case when f.orden_global = 41 then 'descontinuado' else 'activo' end
from fechas f
-- marca/proveedor: la pareja depende de cada producto (si no, Postgres evalúa el
-- subselect una sola vez y todas las prendas salen de la misma marca) y se
-- concentra en pocas marcas, como el negocio real (r² sesga hacia las primeras).
cross join lateral (
  select t.marca_id, t.proveedor_id
  from (
    select marca_id, proveedor_id,
           row_number() over (order by marca_id) as rn,
           count(*) over () as total
    from retail.marca_proveedores
  ) t
  where t.rn = 1 + floor(power((('x' || substr(md5('marca:' || f.orden_global::text), 1, 6))::bit(24)::bigint)::numeric / 16777216, 2) * t.total)::int
) mp;

do $$
declare v_n int;
begin
  select count(*) into v_n from tmp_productos_nuevos;
  if v_n <> 220 then
    raise exception 'Se esperaban 220 productos nuevos y salieron %: revisar pools de nombres (¿se agotaron combinaciones en alguna categoría?)', v_n;
  end if;
end $$;

insert into retail.productos (id, categoria_id, referencia, estado, created_at, stock_minimo, temporada,
  permitir_venta_sin_stock, tejido_id, patron_id, marca_id, proveedor_id)
select id, categoria_id, referencia, estado, creado_en, stock_minimo, temporada,
  false, tejido_id, patron_id, marca_id, proveedor_id
from tmp_productos_nuevos;

-- el trigger productos_estado_alta_biut puso aprobado_en = now(): se corrige a
-- la fecha real de alta (historial_producto_cambios no audita esta columna —
-- confirmado leyendo fn_registrar_cambio_producto en el preflight)
update retail.productos p
  set aprobado_en = tp.creado_en
  from tmp_productos_nuevos tp
  where p.id = tp.id;

-- ---- 1.4 Variantes: color × talla por producto (grilla completa, como el catálogo real) ----
create temp table tmp_variantes_nuevas (
  id uuid, producto_id uuid, color_codigo text, talla_id uuid, precio numeric, costo numeric, activo boolean, creado_en timestamptz
) on commit drop;

-- Todo se decide con un hash del id del producto (no con random()): las
-- subconsultas dependen de cada producto, así que se evalúan por producto y no
-- una sola vez, y la misma semilla da siempre el mismo catálogo.
with base as (
  select tp.id as producto_id, tp.categoria_id, tp.creado_en, cat.lo, cat.hi,
         (('x' || substr(md5('ncol:'   || tp.id::text), 1, 6))::bit(24)::bigint)::numeric / 16777216 as r_colores,
         (('x' || substr(md5('ntalla:' || tp.id::text), 1, 6))::bit(24)::bigint)::numeric / 16777216 as r_tallas,
         (('x' || substr(md5('precio:' || tp.id::text), 1, 6))::bit(24)::bigint)                     as h_precio,
         (('x' || substr(md5('costo:'  || tp.id::text), 1, 6))::bit(24)::bigint)                     as h_costo
  from tmp_productos_nuevos tp
  join tmp_categoria_cuenta cat on cat.categoria_id = tp.categoria_id
),
colores_por_producto as (
  -- 1-3 colores por producto (30/45/25 %), de los colores activos y aprobados
  select b.producto_id,
         (select array_agg(codigo) from (
            select codigo from retail.colores where activo and estado = 'aprobado'
            order by md5(b.producto_id::text || codigo)
            limit case when b.r_colores < 0.30 then 1 when b.r_colores < 0.75 then 2 else 3 end
          ) c) as colores
  from base b
),
tallas_por_producto as (
  -- 2-5 tallas de las de su categoría, las habituales primero
  select b.producto_id,
         (select array_agg(talla_id) from (
            select ct.talla_id
            from retail.categoria_tallas ct
            where ct.categoria_id = b.categoria_id
            order by ct.habitual desc, md5(b.producto_id::text || ct.talla_id::text)
            limit case when b.r_tallas < 0.30 then 2 else 3 + floor((b.r_tallas - 0.30) / 0.70 * 3)::int end
          ) t) as tallas
  from base b
)
insert into tmp_variantes_nuevas
select
  overlay(md5('seed:variantes:' || b.producto_id::text || ':' || col || ':' || tal::text) placing '5eed' from 1 for 4)::uuid,
  b.producto_id, col, tal,
  -- precio dentro de la banda de su categoría, terminado en .90 y el mismo para
  -- todos los colores/tallas del producto; costo = 38-48 % del precio
  ((b.lo + (b.h_precio % (b.hi - b.lo)))::numeric + 0.90),
  round(((b.lo + (b.h_precio % (b.hi - b.lo)))::numeric + 0.90) * (0.38::numeric + (b.h_costo % 1000)::numeric / 10000.0), 2),
  true,
  b.creado_en
from base b
join colores_por_producto cp on cp.producto_id = b.producto_id
join tallas_por_producto tpx on tpx.producto_id = b.producto_id
cross join lateral unnest(cp.colores) as col
cross join lateral unnest(tpx.tallas) as tal;

-- ORDER BY: el trigger asigna el correlativo de código en el orden en que entra
-- cada fila; ordenando por fecha de alta, un producto más nuevo nunca recibe un
-- número menor que uno más viejo de su misma categoría.
insert into retail.variantes (id, producto_id, color_codigo, talla_id, precio, costo, activo, created_at)
select id, producto_id, color_codigo, talla_id, precio, costo, activo, creado_en
from tmp_variantes_nuevas
order by creado_en, producto_id, color_codigo, talla_id;

-- variantes_asignar_codigo (AFTER INSERT) ya corrió por cada fila y asignó el
-- código (y su código de barras) — nada más que hacer acá.
do $$
declare v_sin_codigo int;
begin
  select count(*) into v_sin_codigo from retail.variantes v join tmp_variantes_nuevas t on t.id = v.id where v.codigo is null;
  if v_sin_codigo > 0 then
    raise exception '% variantes sembradas se quedaron sin código — el trigger fn_variantes_asignar_codigo no corrió como se esperaba', v_sin_codigo;
  end if;
end $$;

-- ---- 1.5 Fotos: isotipo de CAYLA, una por color (la primera es la principal) ----
-- El `?p=<código>` no cambia la imagen: evita que los traslados deduplicen las
-- miniaturas de productos distintos por tener la misma URL.
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo)
select
  x.producto_id, '/cayla-isotipo.png?p=' || x.codigo, x.orden,
  (x.orden = 0), x.color_codigo
from (
  select p.id as producto_id, p.codigo,
         v.color_codigo,
         row_number() over (partition by v.producto_id order by v.color_codigo) - 1 as orden
  from (select distinct producto_id, color_codigo from retail.variantes where producto_id in (select id from tmp_productos_nuevos)) v
  join retail.productos p on p.id = v.producto_id
) x;

-- ---- 1.6 Campañas demo (etiquetas de temporada pasada, con su descuento) ----
-- Las tres campañas reales (Fiestas Patrias, Día Internacional del Gato y del
-- Perro) ya existen sin descuento ni variantes; no se tocan. Estas son nuevas y
-- llevan «(demo)» en el nombre para distinguirlas y poder retirarlas.
create temp table tmp_etiquetas_campana (id uuid, nombre text, vigente_desde date, vigente_hasta date) on commit drop;
insert into tmp_etiquetas_campana (id, nombre, vigente_desde, vigente_hasta) values
  (overlay(md5('seed:etiquetas:fiestas-patrias') placing '5eed' from 1 for 4)::uuid, 'Fiestas Patrias 2026 (demo)', date_trunc('year', current_setting('cayla_seed.fin')::date)::date + interval '6 months 13 days', date_trunc('year', current_setting('cayla_seed.fin')::date)::date + interval '6 months 28 days'),
  (overlay(md5('seed:etiquetas:dia-del-gato') placing '5eed' from 1 for 4)::uuid, 'Día del Gato 2026 (demo)', date_trunc('year', current_setting('cayla_seed.fin')::date)::date + interval '6 months 24 days', date_trunc('year', current_setting('cayla_seed.fin')::date)::date + interval '7 months 7 days'),
  (overlay(md5('seed:etiquetas:dia-del-perro') placing '5eed' from 1 for 4)::uuid, 'Día del Perro 2026 (demo)', date_trunc('year', current_setting('cayla_seed.fin')::date)::date + interval '7 months 11 days', date_trunc('year', current_setting('cayla_seed.fin')::date)::date + interval '7 months 25 days');

insert into retail.etiquetas (id, nombre, activo, estado, estilo, descuento_pct, vigente_desde, vigente_hasta, notas, created_at)
select id, nombre, true, 'aprobado', 'campana', 15, vigente_desde, vigente_hasta,
  'Campaña demo — historia sintética de 90 días (deshacer-90-dias.sql la retira).',
  vigente_desde::timestamptz - interval '3 days'
from tmp_etiquetas_campana;

-- ~10 % de las variantes nuevas (mezcla de categorías) llevan alguna de las 3 campañas
insert into retail.variante_etiquetas (variante_id, etiqueta_id, created_at)
select v.id, e.id, e.vigente_desde::timestamptz
from (
  select id, row_number() over (order by md5(id::text)) rn, count(*) over () total
  from tmp_variantes_nuevas
) v
cross join lateral (
  select id, vigente_desde from tmp_etiquetas_campana order by md5(v.id::text || id::text) limit 1
) e
where v.rn <= round(v.total * 0.10);

-- =============================================================================
-- Chequeos de la Fase 1: cualquier falla aborta la transacción entera
-- =============================================================================
do $$
declare
  v_productos int; v_variantes int; v_sin_principal int; v_codigos_dup int;
  v_sin_aprobar int; v_inversiones int; v_marcas int; v_colores int;
begin
  select count(*) into v_productos from retail.productos where id::text like '5eed%';
  if v_productos <> 220 then
    raise exception '[check catálogo] % productos 5eed, se esperaban 220', v_productos;
  end if;

  select count(*) into v_sin_aprobar from retail.productos where id::text like '5eed%' and estado_alta <> 'aprobado';
  if v_sin_aprobar > 0 then
    raise exception '[check catálogo] % productos sembrados no quedaron aprobados', v_sin_aprobar;
  end if;

  select count(*) into v_variantes from retail.variantes where producto_id::text like '5eed%';

  select count(distinct codigo) into v_codigos_dup from retail.variantes where producto_id::text like '5eed%';
  if v_codigos_dup <> v_variantes then
    raise exception '[check catálogo] códigos de variante repetidos: % variantes, % códigos únicos', v_variantes, v_codigos_dup;
  end if;

  select count(*) into v_sin_principal
  from tmp_productos_nuevos tp
  where not exists (select 1 from retail.producto_fotos f where f.producto_id = tp.id and f.es_principal);
  if v_sin_principal > 0 then
    raise exception '[check catálogo] % productos sembrados sin foto principal', v_sin_principal;
  end if;

  -- correlativos al día: dentro de un prefijo, un producto más nuevo nunca tiene número menor
  select count(*) into v_inversiones from (
    select p.created_at,
           lag(p.created_at) over (partition by split_part(p.codigo, '-', 1) order by split_part(p.codigo, '-', 2)::int) as anterior
    from retail.productos p where p.id::text like '5eed%'
  ) x where x.anterior > x.created_at;
  if v_inversiones > 0 then
    raise exception '[check catálogo] % productos con correlativo de código fuera de orden cronológico', v_inversiones;
  end if;

  -- variedad: si todo saliera de una sola marca o de dos colores, el catálogo no serviría para probar filtros
  select count(distinct marca_id) into v_marcas from retail.productos where id::text like '5eed%';
  select count(distinct color_codigo) into v_colores from retail.variantes where producto_id::text like '5eed%';
  if v_marcas < 10 or v_colores < 15 then
    raise exception '[check catálogo] poca variedad: % marcas y % colores distintos', v_marcas, v_colores;
  end if;

  if (select count(*) from retail.productos where id::text like '5eed%' and estado = 'descontinuado') <> 1 then
    raise exception '[check catálogo] se esperaba exactamente 1 producto descontinuado (A14)';
  end if;

  raise notice '[check catálogo] OK — % productos, % variantes, % marcas, % colores', v_productos, v_variantes, v_marcas, v_colores;
end $$;

-- =============================================================================
-- FASE 2 — DEMANDA (solo tablas temporales: no escribe en ninguna tabla real)
-- Genera los tickets y sus líneas: cuánto se vende, dónde, cuándo y qué. De
-- aquí saldrán (fases 3-4) el abastecimiento —el stock no puede quedar negativo
-- porque primero se decide la demanda y luego se compra lo que la cubre— y las
-- ventas reales con sus pagos, cajas y comprobantes.
-- =============================================================================

-- Número al azar determinista en [0,1): misma semilla + misma clave = mismo valor.
create function pg_temp.h(k text) returns numeric language sql stable as
$f$ select (('x' || substr(md5(current_setting('cayla_seed.semilla') || ':' || k), 1, 6))::bit(24)::bigint)::numeric / 16777216 $f$;

-- ---- 2.1 Ventana, tiendas y calendario ----
create temp table tmp_ventana on commit drop as
select current_setting('cayla_seed.inicio')::date as inicio,
       current_setting('cayla_seed.fin')::date    as fin,
       (current_setting('cayla_seed.fin')::date - current_setting('cayla_seed.inicio')::date + 1) as dias,
       round(7000 * current_setting('cayla_seed.escala')::numeric)::int as n_total,
       -- el último día es un turno cerrado: las ventas llegan solo hasta hace 15 min
       (now() - interval '15 minutes') as corte;

-- reparto por tienda «como las ventas 2026»; LIM es tienda nueva y crece (rampa)
create temp table tmp_tiendas on commit drop as
select u.id as ubicacion_id, x.codigo, x.share, x.ramp_ini, x.ramp_fin
from retail.ubicaciones u
join (values ('Tienda TRU', 'TRU', 0.68, 1.0, 1.0),
             ('Tienda AQP', 'AQP', 0.27, 1.0, 1.0),
             ('Tienda LIM', 'LIM', 0.05, 0.3, 1.7)) x(nombre, codigo, share, ramp_ini, ramp_fin)
  on x.nombre = u.nombre;

do $$
begin
  if (select count(*) from tmp_tiendas) <> 3 then
    raise exception 'No se encontraron las 3 tiendas (TRU, AQP, LIM) en retail.ubicaciones';
  end if;
end $$;

-- calendario: horario de tienda (10-21; domingo 11-20) y peso del día
create temp table tmp_dias on commit drop as
select d.fecha, extract(isodow from d.fecha)::int as dow, (d.fecha - v.inicio) as idx,
       case when extract(isodow from d.fecha) = 7 then time '11:00' else time '10:00' end as abre,
       case when extract(isodow from d.fecha) = 7 then time '20:00' else time '21:00' end as cierra,
       -- día de la semana (lunes flojo, sábado fuerte)
       (case extract(isodow from d.fecha)::int when 1 then 0.75 when 2 then 0.90 when 3 then 0.95 when 4 then 1.00
                                               when 5 then 1.15 when 6 then 1.35 else 1.10 end)
       -- quincena: días 14-16 y 29-31
       * (case when extract(day from d.fecha) in (14, 15, 16, 29, 30, 31) then 1.25 else 1.0 end)
       -- julio es «mes bueno» (Fiestas Patrias); pico el 28-29 jul; 30 ago sube un poco
       * (case when extract(month from d.fecha) = 7 and extract(day from d.fecha) in (28, 29) then 2.0
               when extract(month from d.fecha) = 7 then 1.4
               when extract(month from d.fecha) = 8 and extract(day from d.fecha) = 30 then 1.3
               else 1.0 end)
       -- tendencia suave (+8 % a lo largo de la ventana)
       * (0.96 + 0.08 * (d.fecha - v.inicio) / greatest(v.dias - 1, 1)) as factor
from tmp_ventana v
cross join lateral (select (v.inicio + i)::date as fecha from generate_series(0, v.dias - 1) i) d;

-- fracción del último día que ya transcurrió (0 si aún no abre)
create temp table tmp_dia_tienda on commit drop as
with base as (
  select d.fecha, d.dow, d.abre, d.cierra, t.ubicacion_id, t.codigo,
         t.share * d.factor
           * (t.ramp_ini + (t.ramp_fin - t.ramp_ini) * d.idx / greatest(v.dias - 1, 1))
           * (0.88 + 0.24 * pg_temp.h('ruido:' || t.codigo || ':' || d.fecha))
           * (case when d.fecha = v.fin then
                greatest(0, least(1, extract(epoch from (v.corte - ((d.fecha + d.abre) at time zone 'America/Lima')))
                                    / extract(epoch from (((d.fecha + d.cierra) at time zone 'America/Lima') - ((d.fecha + d.abre) at time zone 'America/Lima')))))
              else 1 end) as w
  from tmp_dias d cross join tmp_tiendas t cross join tmp_ventana v
)
select b.*, round(b.w / sum(b.w) over () * v.n_total)::int as n
from base b cross join tmp_ventana v;

-- ---- 2.2 Vida de cada producto: cuándo empieza y cuándo deja de venderse ----
-- Popularidad tipo Zipf; las prendas baratas rotan bastante más (exponente 1,3 de
-- precio, calibrado para que 7.000 boletas sumen ≈ S/900.000). A8: 15 prendas
-- viejas y de baja rotación dejan de venderse a propósito (6 hace 60+ días, 9 hace
-- 30+ días); con las que la Zipf deja sin venta por sí solas salen ≈ 25 sin venta en 30 días.
-- A14: la descontinuada dejó de venderse hace ~40 días.
create temp table tmp_producto_vida on commit drop as
with p as (
  select tp.id as producto_id, tp.temporada, tp.estado, tp.creado_en,
         (select max(v.precio) from tmp_variantes_nuevas v where v.producto_id = tp.id) as precio,
         row_number() over (order by pg_temp.h('rango:' || tp.id)) as rango
  from tmp_productos_nuevos tp
),
muertos as (
  select producto_id, row_number() over (order by pg_temp.h('muerto:' || producto_id)) as orden
  from p where temporada = 'Otoño-Invierno' and estado = 'activo' and rango >= 100
)
select p.producto_id, p.precio, p.rango,
       power(p.rango::numeric, -0.7) * power(100.0 / p.precio, 1.3) as w_pop,
       case when p.temporada = 'Primavera-Verano'
            then ((p.creado_en at time zone 'America/Lima')::date + 1)
            else v.inicio end as vende_desde,
       case when p.estado = 'descontinuado' then v.fin - 40
            when m.orden <= 6 then v.fin - 61
            when m.orden <= 15 then v.fin - 31
            else v.fin end as vende_hasta
from p cross join tmp_ventana v
left join muertos m on m.producto_id = p.producto_id;

-- épocas: tramos en los que no cambia el surtido vendible (nace o muere alguna prenda)
create temp table tmp_epocas on commit drop as
with cortes as (
  select v.inicio as d from tmp_ventana v
  union select vende_desde from tmp_producto_vida, tmp_ventana v where vende_desde > v.inicio and vende_desde <= v.fin
  union select vende_hasta + 1 from tmp_producto_vida, tmp_ventana v where vende_hasta < v.fin and vende_hasta >= v.inicio
)
select d as ini, coalesce(lead(d) over (order by d), (select fin from tmp_ventana) + 1) - 1 as fin from cortes;

-- ---- 2.3 Peso de cada variante en cada tienda y época (para sortear qué se vende) ----
create temp table tmp_pesos on commit drop as
with w as (
  select e.ini as epoca_ini, t.ubicacion_id, v.id as variante_id,
         pv.w_pop
           * (0.6 + 0.8 * pg_temp.h('tienda:' || t.codigo || ':' || v.producto_id))                 -- gusto propio de cada tienda
           * (case ta.valor when 'M' then 1.4 when 'S' then 1.0 when 'L' then 1.0 when 'XL' then 0.5
                            when 'XS' then 0.4 when 'XXL' then 0.25 when 'Estándar' then 0.9
                            when '30' then 1.3 when '28' then 1.1 when '32' then 1.1 when '26' then 0.7 when '34' then 0.5
                            when '37' then 1.4 when '38' then 1.4 when '36' then 1.1 when '39' then 1.1 else 1.0 end)
           * (case v.color_codigo when 'NEG' then 1.7 when 'BLA' then 1.5 when 'BEI' then 1.2 when 'AZM' then 1.1 else 1.0 end)
           * (0.6 + 0.8 * pg_temp.h('color:' || v.producto_id || ':' || v.color_codigo)) as peso
  from tmp_epocas e
  cross join tmp_tiendas t
  join tmp_variantes_nuevas v on true
  join tmp_producto_vida pv on pv.producto_id = v.producto_id and pv.vende_desde <= e.ini and pv.vende_hasta >= e.fin
  join retail.tallas ta on ta.id = v.talla_id
)
select epoca_ini, ubicacion_id, variante_id,
       sum(peso) over (partition by ubicacion_id, epoca_ini order by variante_id) as cum_hi,
       sum(peso) over (partition by ubicacion_id, epoca_ini order by variante_id) - peso as cum_lo,
       sum(peso) over (partition by ubicacion_id, epoca_ini) as total
from w;
create index on tmp_pesos (ubicacion_id, epoca_ini, cum_hi);

-- ---- 2.4 Tickets: hora del día con pico de 16 a 20 ----
create temp table tmp_horas on commit drop as
select tipo, hora, peso,
       sum(peso) over (partition by tipo order by hora) as cum_hi,
       sum(peso) over (partition by tipo order by hora) - peso as cum_lo,
       sum(peso) over (partition by tipo) as total
from (values ('sem', 10, 0.55), ('sem', 11, 0.75), ('sem', 12, 0.90), ('sem', 13, 0.90), ('sem', 14, 0.80),
             ('sem', 15, 1.00), ('sem', 16, 1.40), ('sem', 17, 1.60), ('sem', 18, 1.80), ('sem', 19, 1.70), ('sem', 20, 1.00),
             ('dom', 11, 0.80), ('dom', 12, 1.00), ('dom', 13, 1.00), ('dom', 14, 0.90), ('dom', 15, 1.10),
             ('dom', 16, 1.40), ('dom', 17, 1.50), ('dom', 18, 1.40), ('dom', 19, 1.00)) x(tipo, hora, peso);

create temp table tmp_tickets on commit drop as
with t as (
  select overlay(md5('seed:ventas:' || dt.codigo || ':' || dt.fecha || ':' || g) placing '5eed' from 1 for 4)::uuid as ticket_id,
         dt.ubicacion_id, dt.codigo, dt.fecha, dt.dow, dt.abre, dt.cierra, g as k,
         (select max(e.ini) from tmp_epocas e where e.ini <= dt.fecha) as epoca_ini
  from tmp_dia_tienda dt cross join lateral generate_series(1, dt.n) g
),
h as (
  select t.*,
         pg_temp.h('hora:' || t.ticket_id) as u_hora,
         pg_temp.h('min:'  || t.ticket_id) as u_min,
         pg_temp.h('lin:'  || t.ticket_id) as u_lin
  from t
)
select h.ticket_id, h.ubicacion_id, h.codigo, h.fecha, h.epoca_ini,
       case when h.fecha = v.fin then
              -- último día: uniforme entre la apertura y el corte
              ((h.fecha + h.abre) at time zone 'America/Lima')
                + h.u_min * (v.corte - ((h.fecha + h.abre) at time zone 'America/Lima'))
            else
              ((h.fecha
                + make_interval(hours => (select hh.hora from tmp_horas hh
                                          where hh.tipo = case when h.dow = 7 then 'dom' else 'sem' end
                                            and h.u_hora * hh.total >= hh.cum_lo and h.u_hora * hh.total < hh.cum_hi))
                + make_interval(mins => floor(h.u_min * 60)::int, secs => floor(pg_temp.h('seg:' || h.ticket_id) * 60)::int))
               at time zone 'America/Lima')
       end as ts,
       -- 1 línea 62 %, 2 líneas 28 %, 3 líneas 8 %, 4 líneas 2 %
       case when h.u_lin < 0.62 then 1 when h.u_lin < 0.90 then 2 when h.u_lin < 0.98 then 3 else 4 end as nlineas,
       row_number() over (partition by h.ubicacion_id order by h.fecha, h.u_hora, h.ticket_id) as orden_tmp
from h cross join tmp_ventana v;

-- número correlativo de boleta dentro de la tienda, en orden de hora (lo usará la Fase 4)
alter table tmp_tickets add column seq int;
update tmp_tickets t set seq = x.seq
from (select ticket_id, row_number() over (partition by ubicacion_id order by ts, ticket_id) as seq from tmp_tickets) x
where x.ticket_id = t.ticket_id;

-- ---- 2.5 Líneas: qué variante y cuántas unidades ----
create temp table tmp_lineas_brutas on commit drop as
select t.ticket_id, t.ubicacion_id, t.fecha, l,
       pick.variante_id,
       case when pg_temp.h('qty:' || t.ticket_id || ':' || l) < 0.06 then 2 else 1 end as cantidad
from tmp_tickets t
cross join lateral generate_series(1, t.nlineas) l
cross join lateral (
  select w.variante_id
  from tmp_pesos w
  where w.ubicacion_id = t.ubicacion_id and w.epoca_ini = t.epoca_ini
    and w.cum_hi > pg_temp.h('var:' || t.ticket_id || ':' || l) * w.total
  order by w.cum_hi
  limit 1
) pick;

-- una misma prenda repetida en el ticket se junta en una sola línea
create temp table tmp_lineas on commit drop as
with juntas as (
  select ticket_id, ubicacion_id, fecha, variante_id, sum(cantidad)::int as cantidad, min(l) as l
  from tmp_lineas_brutas group by ticket_id, ubicacion_id, fecha, variante_id
),
con_campana as (
  select j.*, v.precio, v.costo, camp.etiqueta_id, camp.pct
  from juntas j
  join tmp_variantes_nuevas v on v.id = j.variante_id
  left join lateral (
    select e.id as etiqueta_id, e.descuento_pct as pct
    from retail.variante_etiquetas ve
    join retail.etiquetas e on e.id = ve.etiqueta_id
    where ve.variante_id = j.variante_id and e.descuento_pct is not null
      and j.fecha between e.vigente_desde and e.vigente_hasta
    order by e.descuento_pct desc, e.id
    limit 1
  ) camp on true
),
con_manual as (
  select c.*,
         -- descuento manual en el 6 % de las líneas sin campaña (R-45): 5-20 % lo da el líder solo,
         -- 25-35 % siempre con argumento; nunca más de 35 %
         (c.etiqueta_id is null and pg_temp.h('desc:' || c.ticket_id || ':' || c.variante_id) < 0.06) as manual,
         case when pg_temp.h('pct:' || c.ticket_id || ':' || c.variante_id) < 0.60
              then 5 + 5 * floor(pg_temp.h('pct2:' || c.ticket_id || ':' || c.variante_id) * 4)
              else 25 + 5 * floor(pg_temp.h('pct2:' || c.ticket_id || ':' || c.variante_id) * 3) end as pct_manual,
         pg_temp.h('mot:' || c.ticket_id || ':' || c.variante_id) as u_motivo
  from con_campana c
)
select m.ticket_id, m.ubicacion_id, m.fecha, m.variante_id, m.cantidad, m.l,
       m.precio as precio_unitario, m.costo as costo_unitario,
       case when m.etiqueta_id is not null then round(m.precio * m.pct / 100, 2)
            when m.manual then round(m.precio * m.pct_manual / 100, 2)
            else 0 end as descuento_unitario,
       case when m.etiqueta_id is not null then 'campana'
            when m.manual then (case when m.u_motivo < 0.40 then 'cerrar_venta' when m.u_motivo < 0.65 then 'liquidacion_temporada'
                                     when m.u_motivo < 0.80 then 'cumpleanos_clienta_top' when m.u_motivo < 0.92 then 'prenda_con_desperfecto'
                                     else 'otro' end)
            end as motivo_descuento,
       case when m.manual and m.u_motivo >= 0.92 then 'Acuerdo con la clienta por llevar varias prendas' end as motivo_descuento_detalle,
       case when m.manual and m.pct_manual > 20
            then (array['Clienta frecuente, lleva varias prendas','Última unidad de la talla, con pequeño detalle',
                        'Cierra la venta hoy, no alcanzaba con el descuento anterior','Compra por mayor a la habitual'])
                 [1 + floor(pg_temp.h('arg:' || m.ticket_id || ':' || m.variante_id) * 4)::int] end as argumento_descuento,
       m.etiqueta_id as descuento_etiqueta_id,
       m.manual
from con_manual m;

-- ---- 2.6 Chequeos de la Fase 2 ----
do $$
declare
  v_n int; v_n_esp int; v_sin_lineas int; v_fuera_hora int; v_futuro int; v_no_disponible int; v_dup int;
  v_campana_mal int; v_desc_mal int; v_share record; v_pico numeric; v_mediana numeric;
begin
  select count(*) into v_n from tmp_tickets;
  select n_total into v_n_esp from tmp_ventana;
  if abs(v_n - v_n_esp) > greatest(5, v_n_esp * 0.01) then
    raise exception '[check demanda] % tickets, se esperaban ~%', v_n, v_n_esp;
  end if;

  select count(*) into v_sin_lineas from tmp_tickets t where not exists (select 1 from tmp_lineas l where l.ticket_id = t.ticket_id);
  if v_sin_lineas > 0 then raise exception '[check demanda] % tickets sin líneas', v_sin_lineas; end if;

  -- dentro del horario de su tienda (domingo 11-20, resto 10-21) y nunca después del corte
  select count(*) into v_fuera_hora from tmp_tickets t join tmp_dias d on d.fecha = t.fecha
   where (t.ts at time zone 'America/Lima')::time < d.abre or (t.ts at time zone 'America/Lima')::time >= d.cierra
      or (t.ts at time zone 'America/Lima')::date <> t.fecha;
  if v_fuera_hora > 0 then raise exception '[check demanda] % tickets fuera de horario', v_fuera_hora; end if;
  select count(*) into v_futuro from tmp_tickets t, tmp_ventana v where t.ts > v.corte;
  if v_futuro > 0 then raise exception '[check demanda] % tickets después del corte (futuro)', v_futuro; end if;

  -- ninguna línea de una prenda que ese día no se vendía (aún no nacida o ya retirada)
  select count(*) into v_no_disponible from tmp_lineas l
    join tmp_variantes_nuevas v on v.id = l.variante_id
    join tmp_producto_vida pv on pv.producto_id = v.producto_id
   where l.fecha < pv.vende_desde or l.fecha > pv.vende_hasta;
  if v_no_disponible > 0 then raise exception '[check demanda] % líneas de prendas no disponibles ese día', v_no_disponible; end if;

  select count(*) into v_dup from (select ticket_id, variante_id from tmp_lineas group by 1, 2 having count(*) > 1) x;
  if v_dup > 0 then raise exception '[check demanda] % prendas repetidas dentro de un ticket', v_dup; end if;

  -- campaña: toda línea de una prenda con campaña vigente lleva exactamente su descuento (registrar_venta lo exige)
  select count(*) into v_campana_mal from tmp_lineas l
   where (l.motivo_descuento = 'campana') <> (l.descuento_etiqueta_id is not null)
      or exists (select 1 from retail.variante_etiquetas ve join retail.etiquetas e on e.id = ve.etiqueta_id
                  where ve.variante_id = l.variante_id and e.descuento_pct is not null and l.fecha between e.vigente_desde and e.vigente_hasta
                    and l.descuento_etiqueta_id is distinct from e.id);
  if v_campana_mal > 0 then raise exception '[check demanda] % líneas con la campaña mal aplicada', v_campana_mal; end if;

  -- descuento manual: ≤ 35 %, > 20 % con argumento, nunca bajo el costo
  select count(*) into v_desc_mal from tmp_lineas l
   where l.descuento_unitario > 0 and l.motivo_descuento <> 'campana'
     and (l.descuento_unitario > round(l.precio_unitario * 0.35, 2) + 0.01
          or (l.descuento_unitario > round(l.precio_unitario * 0.20, 2) + 0.01 and coalesce(l.argumento_descuento, '') = '')
          or l.precio_unitario - l.descuento_unitario < l.costo_unitario);
  if v_desc_mal > 0 then raise exception '[check demanda] % líneas con descuento manual fuera de regla', v_desc_mal; end if;

  -- reparto por tienda
  for v_share in
    select t.codigo, count(*)::numeric / v_n as p from tmp_tickets t group by t.codigo
  loop
    if (v_share.codigo = 'TRU' and v_share.p not between 0.64 and 0.72)
    or (v_share.codigo = 'AQP' and v_share.p not between 0.23 and 0.31)
    or (v_share.codigo = 'LIM' and v_share.p not between 0.03 and 0.08) then
      raise exception '[check demanda] reparto fuera de rango en %: %', v_share.codigo, round(v_share.p, 3);
    end if;
  end loop;

  -- feriado: el pico del 28-29 jul debe superar claramente un día típico (si cae en la ventana)
  if exists (select 1 from tmp_dias where extract(month from fecha) = 7 and extract(day from fecha) = 28) then
    select max(c) into v_pico from (select fecha, count(*) c from tmp_tickets where extract(month from fecha) = 7 and extract(day from fecha) in (28, 29) group by fecha) x;
    select percentile_cont(0.5) within group (order by c) into v_mediana from (select fecha, count(*) c from tmp_tickets group by fecha) y;
    if v_pico < 1.5 * v_mediana then
      raise exception '[check demanda] el pico del 28-29 jul (%) no supera 1,5 veces el día típico (%)', v_pico, v_mediana;
    end if;
  end if;

  raise notice '[check demanda] OK — % tickets, % líneas', v_n, (select count(*) from tmp_lineas);
end $$;

-- ---------------------------------------------------------------------------
-- Ensayo: ROLLBACK. Para la corrida definitiva, Felipe cambia esta última
-- línea por COMMIT (y antepone `set search_path to retail, public;`).
-- ---------------------------------------------------------------------------
rollback;

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
  pv_fin date := current_date;              -- último día de la ventana (Lima)
  pv_dias int := 90;
  pv_semilla double precision := 0.5726;     -- setseed(): misma semilla = mismos datos
begin
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
  tejido_id uuid, patron_id uuid, temporada text, stock_minimo int, creado_en timestamptz
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
  (f.fecha_alta::timestamptz + (f.orden_global % 12) * interval '1 hour' + (f.orden_global % 60) * interval '1 minute')
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
select id, categoria_id, referencia, 'activo', creado_en, stock_minimo, temporada,
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

  raise notice '[check catálogo] OK — % productos, % variantes, % marcas, % colores', v_productos, v_variantes, v_marcas, v_colores;
end $$;

-- ---------------------------------------------------------------------------
-- Ensayo: ROLLBACK. Para la corrida definitiva, Felipe cambia esta última
-- línea por COMMIT (y antepone `set search_path to retail, public;`).
-- ---------------------------------------------------------------------------
rollback;

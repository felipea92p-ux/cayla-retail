-- ============================================================================
-- scripts/demo/sembrar-90-dias.sql
-- Historia sintética de 90 días para el ERP de CAYLA (ver plan y ADR-01NN
-- en docs/adr/, y docs/demo-90-dias/QUE-MIRAR.md para verificar).
--
-- Un generador determinista: misma semilla (y mismo «ahora») = mismos datos. Nada se decide con random():
-- todo sale de hashes de la semilla y del id de cada fila. Corre dentro de
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
-- Fases 1-3 de 7 — catálogo, demanda, inventario inicial y abastecimiento.
-- (El SKU manual de las variantes queda vacío: el trigger igual les asigna
-- código y código de barras, y ninguna pantalla ni RPC exige SKU.)
-- Hecho: fase 1 (catálogo), 2 (demanda) y 3 (inventario inicial y abastecimiento).
-- Pendiente: 4 (ventas, caja y comprobantes), 5 (postventa, gastos y Taller), 6 (stock
-- derivado y cierre), 7 (ensayo completo y prueba de reversibilidad) — no encadenar.
-- ============================================================================

begin;
set local statement_timeout = 0;
set local search_path to retail, public, extensions;

-- ---------------------------------------------------------------------------
-- Parámetros (todo lo que cambia entre corridas vive aquí arriba)
-- ---------------------------------------------------------------------------
do $$
declare
  -- «ahora»: el reloj de la base, salvo que se fije `set cayla_seed.ahora = '2026-09-21 21:00:00+00';` antes del begin (sirve
  -- para reproducir una carga exacta: el último día llega hasta hace 15 minutos, así que depende de la hora)
  pv_ahora timestamptz := coalesce(nullif(current_setting('cayla_seed.ahora', true), '')::timestamptz, now());
  pv_fin date := (pv_ahora at time zone 'America/Lima')::date;  -- último día de la ventana (día Lima, no UTC)
  pv_dias int := 90;
  pv_semilla double precision := 0.5726;     -- setseed(): misma semilla = mismos datos
  pv_escala numeric := 1;                    -- volumen de ventas: 1 = ~7.000 boletas; 0.05 para ensayos chicos
begin
  perform set_config('cayla_seed.ahora_efectiva', pv_ahora::text, true);
  perform set_config('cayla_seed.semilla', pv_semilla::text, true);
  -- Corrida DEFINITIVA (no ensayo): sin esto, el setval() de más abajo no corre. NO es un interruptor para ir probando:
  -- setval() NO es transaccional en Postgres (comprobado: un ROLLBACK no lo deshace, a diferencia de todo INSERT de
  -- este script), así que activarlo en CUALQUIER corrida que no termine en COMMIT deja la secuencia real de
  -- transferencias corrida sin ningún dato que la respalde — inofensivo en la base local de ensayos, pero un daño
  -- real y permanente si se hiciera contra producción. Se usa UNA SOLA VEZ: Felipe agrega
  -- `set cayla_seed.definitivo = 'true';` como primera línea del pegado JUNTO con cambiar la última línea a COMMIT,
  -- nunca por separado ni antes de estar listo para el COMMIT real.
  perform set_config('cayla_seed.definitivo',
    coalesce(nullif(current_setting('cayla_seed.definitivo', true), ''), 'false'), true);
  perform set_config('cayla_seed.escala', pv_escala::text, true);
  perform set_config('cayla_seed.fin', pv_fin::text, true);
  perform set_config('cayla_seed.inicio', (pv_fin - (pv_dias - 1))::text, true);
  perform set_config('cayla_seed.carga_inicial', (pv_fin - pv_dias)::text, true);
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
         row_number() over (partition by cc.categoria order by md5('nom:' || cand.referencia)) rn
  from tmp_nombres_candidatos cand
  join tmp_categoria_cuenta cc on cc.categoria = cand.categoria
  where not exists (
    select 1 from retail.productos p2
    where retail.fn_clave_referencia(p2.referencia) = retail.fn_clave_referencia(cand.referencia)
  )
),
elegidos as (
  select categoria_id, categoria, referencia,
         row_number() over (order by md5('orden:' || referencia)) as orden_global
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
  (select ct.tejido_id from retail.categoria_tejidos ct where ct.categoria_id = f.categoria_id order by md5(f.referencia || ct.tejido_id::text) limit 1),
  (select cp.patron_id from retail.categoria_patrones cp where cp.categoria_id = f.categoria_id order by md5(f.referencia || cp.patron_id::text) limit 1),
  f.temporada,
  (3 + (f.orden_global % 5))::int,
  -- Hora de alta EXPLÍCITA en Lima (no la de la sesión): las 40 de Primavera-Verano nacen entre 07:00 y
  -- 08:29 del día de alta (su primera compra llega ese mismo día y venden desde el siguiente); las 180
  -- viejas entre 08:00 y 10:59 (la carga inicial entra a las 12:30 de su día, siempre después).
  case when f.orden_global <= 40
       then ((f.fecha_alta + time '07:00') at time zone 'America/Lima') + (f.orden_global % 90) * interval '1 minute'
       else ((f.fecha_alta + time '08:00') at time zone 'America/Lima') + (f.orden_global % 3) * interval '1 hour' + (f.orden_global % 60) * interval '1 minute'
  end,
  -- A14: una prenda de las viejas (la 41, fuera de las 40 nuevas) ya está descontinuada y conserva stock
  case when f.orden_global = 41 then 'descontinuado' else 'activo' end
from fechas f
-- marca/proveedor: la pareja depende de cada producto (si no, Postgres evalúa el
-- subselect una sola vez y todas las prendas salen de la misma marca) y se
-- concentra en pocas marcas, como el negocio real (r² sesga hacia las primeras).
cross join lateral (
  select t.marca_id, t.proveedor_id
  from (
    select mp0.marca_id, mp0.proveedor_id,
           row_number() over (order by mp0.marca_id) as rn,
           count(*) over () as total
    from retail.marca_proveedores mp0
    -- solo proveedores activos: las compras de la Fase 3 usan productos.proveedor_id y no se le compra a un proveedor dado de baja
    join retail.proveedores pr0 on pr0.id = mp0.proveedor_id and pr0.activo
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
       (current_setting('cayla_seed.ahora_efectiva')::timestamptz - interval '15 minutes') as corte;

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

-- =============================================================================
-- FASE 3 — INVENTARIO INICIAL Y ABASTECIMIENTO
-- Demanda primero: de las ventas de la Fase 2 se DERIVA todo lo que tiene que haber
-- llegado para poder venderlas —carga inicial, compras a proveedores, traslados del
-- Taller a Lima y subidas del almacén al piso— de modo que ningún saldo pueda
-- quedar negativo por construcción. Lo que llega se fija con la regla «cubrir la
-- demanda hasta la siguiente llegada» y una simulación día a día lo comprueba.
-- =============================================================================

-- uuid determinista y marcado (5eed) por tabla y clave
create function pg_temp.sid(t text, k text) returns uuid language sql immutable as
$f$ select overlay(md5('seed:' || t || ':' || k) placing '5eed' from 1 for 4)::uuid $f$;

-- ---- 3.0 Contexto: ventana, ubicaciones y quién puede firmar cada cosa ----
create temp table tmp_v3 on commit drop as
select inicio, fin, dias, corte, inicio - 1 as carga from tmp_ventana;

-- tiendas con su almacén y su piso; el Taller no tiene sububicaciones
create temp table tmp_ubic on commit drop as
select t.codigo, t.ubicacion_id,
       (select s.id from sububicaciones s where s.ubicacion_id = t.ubicacion_id and s.tipo = 'almacen_tienda') as sub_almacen,
       (select s.id from sububicaciones s where s.ubicacion_id = t.ubicacion_id and s.tipo = 'piso_venta') as sub_piso
from tmp_tiendas t
union all
select 'TAL', u.id, null::uuid, null::uuid from ubicaciones u where u.nombre = 'Taller';

do $$
begin
  if (select count(*) from tmp_ubic) <> 4
     or exists (select 1 from tmp_ubic where codigo <> 'TAL' and (sub_almacen is null or sub_piso is null)) then
    raise exception '[fase 3] faltan ubicaciones o sububicaciones: se esperaban TRU, AQP, LIM (con almacén y piso) y Taller';
  end if;
end $$;

-- Firmantes: un líder (retail.colaboradores.rol = 'lider') o un colaborador asignado a esa ubicación, y solo si ya
-- había ingresado ese día (personas.fecha_ingreso). Compras, pagos y notas de crédito: solo líder. LIM no tiene
-- colaboradores: ahí firman líderes. La elección depende de la fila (hash), no de random().
create temp table tmp_firmantes on commit drop as
select p.id as persona_id, c.rol, c.ubicacion_asignada_id as ubicacion_id, coalesce(p.fecha_ingreso, date '2000-01-01') as ingreso
from colaboradores c join public.personas p on p.id = c.persona_id
where p.estado = 'activo';

create function pg_temp.firmante(p_ubic uuid, p_fecha date, p_solo_lider boolean, p_clave text) returns uuid
language sql stable as
$f$ select f.persona_id from tmp_firmantes f
    where f.ingreso <= p_fecha and (f.rol = 'lider' or (not p_solo_lider and f.ubicacion_id = p_ubic))
    order by md5(p_clave || f.persona_id::text) limit 1 $f$;

do $$
begin
  if exists (select 1 from tmp_ubic u where pg_temp.firmante(u.ubicacion_id, (select carga from tmp_v3), false, 'pool') is null)
     or pg_temp.firmante(null, (select carga from tmp_v3), true, 'pool') is null then
    raise exception '[fase 3] no hay ningún firmante elegible (líder o colaborador) al inicio de la ventana en alguna ubicación';
  end if;
end $$;

-- ---- 3.1 La demanda por día y los pares (variante, tienda) ----
create temp table tmp_dem on commit drop as
select variante_id, ubicacion_id, fecha, sum(cantidad)::int as cant from tmp_lineas group by 1, 2, 3;
create unique index on tmp_dem (ubicacion_id, variante_id, fecha);

create temp table tmp_par on commit drop as
select v.id as variante_id, v.producto_id, tp.proveedor_id, tp.temporada, tp.estado as estado_prod,
       (pv.vende_hasta < w.fin) as muerto, t.ubicacion_id, t.codigo as tienda,
       coalesce(d.tot, 0)::int as total, d.primero, d.ultimo,
       false as a6, false as a7, false as agot, 0 as sin_venta_stock, 0::numeric as vel
from tmp_variantes_nuevas v
join tmp_productos_nuevos tp on tp.id = v.producto_id
join tmp_producto_vida pv on pv.producto_id = v.producto_id
cross join tmp_tiendas t
cross join tmp_v3 w
left join (select variante_id, ubicacion_id, sum(cant)::int as tot, min(fecha) as primero, max(fecha) as ultimo
           from tmp_dem group by 1, 2) d on d.variante_id = v.id and d.ubicacion_id = t.ubicacion_id;

update tmp_par set vel = case when total > 0 then total::numeric / greatest(ultimo - primero + 1, 14) else 0 end;

-- A7: 6 variantes de las 30 más vendidas en TRU quedan agotadas del todo (la oferta iguala a la demanda, sin colchón)
update tmp_par set a7 = true
where variante_id in (select variante_id from (select variante_id from tmp_par where tienda = 'TRU' and total > 0
                                                order by total desc limit 30) top
                      order by pg_temp.h('a7:' || variante_id) limit 6);

-- agotadas con demanda: ~2,5 % de los pares con 3+ ventas terminan en 0 (sin colchón ni sobrante)
update tmp_par set agot = true
where total >= 3 and not muerto and not a7 and pg_temp.h('ag:' || variante_id || ':' || tienda) < 0.025;

-- A6: 8 pares de TRU cuyo piso queda en 0 con stock en el almacén (solo suben del almacén lo que se vende ese día)
update tmp_par set a6 = true
where (variante_id, ubicacion_id) in (select variante_id, ubicacion_id from tmp_par, tmp_v3 w
                                      where tienda = 'TRU' and total between 6 and 30 and ultimo <= w.fin - 5
                                        and not muerto and not a7
                                      order by pg_temp.h('a6:' || variante_id) limit 8);

-- prendas con stock y sin ventas (colas de curva): TRU 50 %, AQP 20 %, LIM 5 % de sus variantes sin venta (1-3 unidades)
update tmp_par set sin_venta_stock = 1 + floor(pg_temp.h('svq:' || variante_id || ':' || tienda) * 3)::int
where total = 0
  and pg_temp.h('sv:' || variante_id || ':' || tienda) < (case tienda when 'TRU' then 0.50 when 'AQP' then 0.20 else 0.05 end);

-- ---- 3.2 Calendario de compras: una llegada tras otra por proveedor ----
create temp table tmp_prov on commit drop as
select tp.proveedor_id, count(*)::int as n_prods, (pr.ruc is not null) as tiene_ruc
from tmp_productos_nuevos tp join proveedores pr on pr.id = tp.proveedor_id
group by tp.proveedor_id, pr.ruc;

create temp table tmp_evento (
  evento_id uuid, proveedor_id uuid, tipo_evento text, k int, emision date, recepcion date,
  creado_en timestamptz, credito boolean default false, plazo int, forzado text, dos_guias boolean default false
) on commit drop;

-- eventos regulares: cuantos más productos tiene el proveedor, más compras (1 + 0,2·productos + 0,2); espaciados en la
-- ventana; se emiten en día laborable y llegan de 1 a 10 días después (nunca en domingo)
insert into tmp_evento (evento_id, proveedor_id, tipo_evento, k, emision, recepcion, dos_guias)
select pg_temp.sid('evento', b.proveedor_id || ':' || b.k), b.proveedor_id, 'regular', b.k, b.emision,
       b.emision + b.lead + (case when extract(isodow from b.emision + b.lead) = 7 then 1 else 0 end),
       pg_temp.h('dg:' || b.proveedor_id || ':' || b.k) < 0.12
from (
  select x.proveedor_id, x.k, x.em0 + (case when extract(isodow from x.em0) = 7 then 1 else 0 end) as emision,
         (case when x.u < 0.50 then 1 + floor(x.u2 * 3) when x.u < 0.85 then 4 + floor(x.u2 * 4) else 8 + floor(x.u2 * 3) end)::int as lead
  from (
    select p.proveedor_id, g as k,
           (w.inicio + 1 + floor(((g - 1 + 0.15 + 0.7 * pg_temp.h('ev:' || p.proveedor_id || ':' || g))
                                  / (1 + round(0.2 * p.n_prods + 0.2)::int)) * (w.dias - 20))::int) as em0,
           pg_temp.h('ld:' || p.proveedor_id || ':' || g) as u, pg_temp.h('ld2:' || p.proveedor_id || ':' || g) as u2
    from tmp_prov p cross join tmp_v3 w
    cross join lateral generate_series(1, 1 + round(0.2 * p.n_prods + 0.2)::int) g
  ) x
) b;

-- eventos de la colección Primavera-Verano: la compra se emite y se recibe el día de alta de sus prendas
insert into tmp_evento (evento_id, proveedor_id, tipo_evento, k, emision, recepcion)
select pg_temp.sid('evento', 'pv:' || x.proveedor_id || ':' || x.alta), x.proveedor_id, 'pv', 0, x.alta, x.alta
from (select proveedor_id, (creado_en at time zone 'America/Lima')::date as alta
      from tmp_productos_nuevos where temporada = 'Primavera-Verano' group by 1, 2) x;

-- A4: 5 facturas a crédito (1 vencida hace >30 días, 2 vencidas hace 8-30, 2 por vencer en ≤7); se mueven 5 llegadas
-- regulares de proveedores con RUC y varias prendas a las fechas exactas que piden sus vencimientos.
-- A5 (una compra con recepción parcial + cierre + nota de crédito) usa un sexto proveedor: se arma más abajo.
create temp table tmp_a4 (n int, prov uuid, off_emision int, plazo int) on commit drop;
insert into tmp_a4 (n, prov, off_emision, plazo)
select o.n, s.proveedor_id, o.off_emision, o.plazo
from (values (1, -72, 30), (2, -54, 30), (3, -41, 30), (4, -28, 30), (5, -40, 45), (6, -21, 30)) o(n, off_emision, plazo)
join (select proveedor_id, row_number() over (order by (n_prods >= 4) desc, pg_temp.h('a4:' || proveedor_id)) as rn
      from tmp_prov where tiene_ruc) s on s.rn = o.n;

do $$
begin
  if (select count(*) from tmp_a4) <> 6 then
    raise exception '[fase 3] no hay 6 proveedores con RUC para los escenarios A4/A5';
  end if;
end $$;

update tmp_evento e
set emision = w.fin + x.off_emision, recepcion = w.fin + x.off_emision + 1 + floor(pg_temp.h('a4l:' || e.evento_id) * 3)::int,
    credito = true, plazo = x.plazo, forzado = 'A4-' || x.n, dos_guias = false
from (select distinct on (a.n) a.n, ev.evento_id, a.off_emision, a.plazo
      from tmp_a4 a join tmp_evento ev on ev.proveedor_id = a.prov and ev.tipo_evento = 'regular', tmp_v3 w
      where a.n <= 5
      order by a.n, abs(ev.emision - (w.fin + a.off_emision))) x,
     tmp_v3 w
where e.evento_id = x.evento_id;

-- hora de creación de la compra: 09:00-17:00 del día de emisión (las de la colección nueva, 09:00-09:40)
update tmp_evento set creado_en = ((emision + time '09:00') at time zone 'America/Lima')
  + (case when tipo_evento = 'pv' then floor(pg_temp.h('cr:' || evento_id) * 40) else floor(pg_temp.h('cr:' || evento_id) * 480) end)::int * interval '1 minute';

-- qué productos entran en cada llegada (y cuáles llegan en una segunda guía unos días después)
create temp table tmp_evprod on commit drop as
-- (la compra de la colección nueva llega el día de alta aunque sea domingo: si se corriera, llegaría después de su primera venta)
select y.evento_id, y.producto_id, y.arribo0 + (case when y.tipo_evento = 'regular' and extract(isodow from y.arribo0) = 7 then 1 else 0 end) as arribo
from (
  select e.evento_id, e.tipo_evento, tp.id as producto_id,
         (case when e.dos_guias and pg_temp.h('dg:' || e.evento_id || tp.id) < 0.5
               then e.recepcion + 2 + floor(pg_temp.h('dg2:' || e.evento_id || tp.id) * 3)::int else e.recepcion end) as arribo0
  from tmp_evento e
  join tmp_productos_nuevos tp on tp.proveedor_id = e.proveedor_id
  where (e.tipo_evento = 'regular'
         and (tp.temporada = 'Otoño-Invierno' or e.emision > (tp.creado_en at time zone 'America/Lima')::date))
     or (e.tipo_evento = 'pv' and tp.temporada = 'Primavera-Verano'
         and (tp.creado_en at time zone 'America/Lima')::date = e.emision)
) y;

-- las llegadas de cada variante en orden: la primera (carga inicial de las viejas, compra del día de alta en las de
-- temporada) y luego las compras regulares posteriores
create temp table tmp_av on commit drop as
with primeras as (
  select v.id as variante_id, v.producto_id,
         case when tp.temporada = 'Primavera-Verano' then pvx.arribo else w.carga end as fecha,
         case when tp.temporada = 'Primavera-Verano' then pvx.evento_id end as evento_id,
         case when tp.temporada = 'Primavera-Verano' then 'compra' else 'carga' end as kind
  from tmp_variantes_nuevas v
  join tmp_productos_nuevos tp on tp.id = v.producto_id
  cross join tmp_v3 w
  left join lateral (select ep.arribo, ep.evento_id from tmp_evprod ep join tmp_evento e on e.evento_id = ep.evento_id
                     where e.tipo_evento = 'pv' and ep.producto_id = v.producto_id) pvx on true
),
todas as (
  select variante_id, fecha, evento_id, kind from primeras
  union all
  select p.variante_id, ep.arribo, ep.evento_id, 'compra'
  from primeras p
  join tmp_evprod ep on ep.producto_id = p.producto_id
  join tmp_evento e on e.evento_id = ep.evento_id and e.tipo_evento = 'regular'
  where ep.arribo > p.fecha
)
select variante_id, fecha, evento_id, kind,
       row_number() over (partition by variante_id order by fecha, evento_id nulls first) as seq,
       lead(fecha) over (partition by variante_id order by fecha, evento_id nulls first) as sig_fecha,
       (lead(fecha) over (partition by variante_id order by fecha, evento_id nulls first)) is null as es_ultima
from todas;

-- ---- 3.3 Cuánto tiene que llegar en TRU y AQP: la demanda hasta la siguiente llegada + un colchón ----
-- (los días que quedan por vender entre una llegada y la siguiente; lo que llega el día X se puede subir al piso
-- desde la mañana de X+1). Colchón de 0-15 % por tramo; al final de la ventana queda un sobrante de 5-25 % de lo
-- vendido (al menos 1 unidad: sin eso casi toda la cola de poca venta quedaría agotada). Las prendas que dejaron de venderse (A8) y la descontinuada (A14) arrancan
-- con 8+ unidades de sobra; A7 no lleva colchón ni sobrante; A6 lleva 3-7 unidades al final en el almacén.
create temp table tmp_arribo on commit drop as
with base as (
  select av.variante_id, p.ubicacion_id, p.tienda, av.seq, av.fecha, av.evento_id, av.kind, av.es_ultima,
         p.total, p.muerto, p.a6, (p.a7 or p.agot) as a7, p.sin_venta_stock, p.agot as agot,
         (select coalesce(sum(d.cant), 0) from tmp_dem d
           where d.variante_id = av.variante_id and d.ubicacion_id = p.ubicacion_id
             and d.fecha > av.fecha and d.fecha <= coalesce(av.sig_fecha, w.fin))::int as cov
  from tmp_av av
  join tmp_par p on p.variante_id = av.variante_id and p.tienda in ('TRU', 'AQP')
  cross join tmp_v3 w
)
select b.variante_id, b.ubicacion_id, b.tienda, b.seq, b.fecha, b.evento_id, b.kind, b.es_ultima, b.cov,
       (b.cov + round(b.cov * case when b.a7 then 0 else 0.15 * pg_temp.h('slk:' || b.variante_id || ':' || b.tienda || ':' || b.seq) end)
        + case when b.es_ultima and b.total > 0 and not b.muerto and not b.a7 and not b.a6
               then greatest(1, round(b.total * (0.05 + 0.20 * pg_temp.h('efin:' || b.variante_id || ':' || b.tienda)))) else 0 end
        + case when b.es_ultima and b.a6 then 3 + floor(pg_temp.h('e6:' || b.variante_id) * 5) else 0 end
        + case when b.seq = 1 and b.muerto then (case when b.tienda = 'TRU' then 5 + round(0.2 * b.total) else 3 + round(0.1 * b.total) end) else 0 end
        + case when b.seq = 1 and b.total = 0 then b.sin_venta_stock else 0 end)::int as q
from base b;

-- ---- 3.4 Lima se surte desde el Taller: olas martes y viernes (y el día de alta de la colección nueva) ----
create temp table tmp_ola_dias on commit drop as
select o.fecha, coalesce(lead(o.fecha) over (order by o.fecha), w.fin) as sig_fecha,
       (lead(o.fecha) over (order by o.fecha)) is null as es_ultima
from (select d.fecha from tmp_dias d, tmp_v3 w where d.dow in (2, 5) and d.fecha between w.inicio + 1 and w.fin - 1
      union
      select (tp.creado_en at time zone 'America/Lima')::date from tmp_productos_nuevos tp, tmp_v3 w
       where tp.temporada = 'Primavera-Verano' and (tp.creado_en at time zone 'America/Lima')::date between w.inicio + 1 and w.fin - 1) o
cross join tmp_v3 w;

-- carga inicial de LIM: cubre las ventas hasta la primera ola (las de temporada nueva entran por su ola)
create temp table tmp_carga_lim on commit drop as
select p.variante_id, p.ubicacion_id,
       (c.cov0 + round(c.cov0 * 0.15 * pg_temp.h('slk0:' || p.variante_id))
        + case when p.muerto then 2 + round(0.1 * p.total) else 0 end
        + case when p.total = 0 then p.sin_venta_stock else 0 end)::int as cant
from tmp_par p
cross join (select min(fecha) as w1 from tmp_ola_dias) o
cross join lateral (select coalesce(sum(d.cant), 0) as cov0 from tmp_dem d
                    where d.variante_id = p.variante_id and d.ubicacion_id = p.ubicacion_id and d.fecha <= o.w1) c
where p.tienda = 'LIM' and p.temporada = 'Otoño-Invierno';

-- inventario inicial de las tiendas (TRU, AQP y LIM)
create temp table tmp_carga on commit drop as
select variante_id, ubicacion_id, q as cant from tmp_arribo where kind = 'carga' and q > 0
union all
select variante_id, ubicacion_id, cant from tmp_carga_lim where cant > 0;

-- llegadas por compra de TRU y AQP (a las que después se suman traslados y olas)
create temp table tmp_llegadas (variante_id uuid, ubicacion_id uuid, fecha date, cant int, origen text, ref uuid) on commit drop;
insert into tmp_llegadas (variante_id, ubicacion_id, fecha, cant, origen, ref)
select variante_id, ubicacion_id, fecha, q, 'compra', evento_id from tmp_arribo where kind = 'compra' and q > 0;

-- ---- 3.5 Traslados del Taller a las tiendas ----
-- Un traslado entre ubicaciones son DOS movimientos (salida al crearlo, entrada al cerrarlo). Estados reales de
-- retail.transferencias: en_transito, recibido_con_diferencia y cerrada (recibida completa o con la diferencia ya
-- cerrada por un líder). Las olas de Lima se calculan en la simulación; aquí van los traslados «de reposición» a TRU y
-- AQP (extras: no cubren demanda, solo suman stock) y los estados que la pantalla debe mostrar (A2 y A3).
create temp table tmp_tras (
  traslado_id uuid, tipo text, destino text, estado text, f_salida date, eta_dias int, f_entrada date,
  dif boolean default false, created_ts timestamptz, eta_ts timestamptz, conf_ts timestamptz, cierre_ts timestamptz
) on commit drop;
create temp table tmp_tras_lin (traslado_id uuid, variante_id uuid, cant int, cant_recibida int) on commit drop;

-- 10 a TRU y 10 a AQP repartidos por la ventana; ~10 % llega con 1-2 unidades de menos y un líder lo cierra al día siguiente
insert into tmp_tras (traslado_id, tipo, destino, estado, f_salida, eta_dias, dif)
select y.traslado_id, 'extra', y.cod, 'cerrada',
       y.f0 + (case when extract(isodow from y.f0) = 7 then 1 else 0 end),
       y.eta, pg_temp.h('dif:' || y.traslado_id) < 0.10
from (
  select pg_temp.sid('tras', 'extra:' || c.cod || ':' || g) as traslado_id, c.cod,
         (w.inicio + 6 + floor(((g - 0.5) / 10) * (w.dias - 24))::int) as f0,
         (case when c.cod = 'TRU' then 1 + floor(pg_temp.h('eta:' || c.cod || ':' || g) * 3) else 2 + floor(pg_temp.h('eta:' || c.cod || ':' || g) * 3) end)::int as eta
  from (values ('TRU'), ('AQP')) c(cod) cross join tmp_v3 w cross join generate_series(1, 10) g
) y;

insert into tmp_tras_lin (traslado_id, variante_id, cant, cant_recibida)
select t.traslado_id, s.variante_id, s.cant,
       case when t.dif and s.rn = 1 then s.cant - (1 + floor(pg_temp.h('dl:' || t.traslado_id) * 2)::int) else s.cant end
from tmp_tras t
cross join lateral (
  select p.variante_id, 4 + floor(pg_temp.h('tq:' || t.traslado_id || p.variante_id) * 5)::int as cant,
         row_number() over (order by md5(t.traslado_id::text || p.variante_id::text)) as rn
  from tmp_par p
  where p.tienda = t.destino and p.total > 0 and p.temporada = 'Otoño-Invierno'
  order by md5(t.traslado_id::text || p.variante_id::text)
  limit (2 + floor(pg_temp.h('tn:' || t.traslado_id) * 4)::int)
) s
where t.tipo = 'extra';

-- A2: uno en tránsito hace 9 días con la fecha estimada vencida, y dos en tránsito a tiempo
insert into tmp_tras (traslado_id, tipo, destino, estado, f_salida, eta_dias)
select pg_temp.sid('tras', 'A2:' || x.n), 'A2', x.cod, 'en_transito', w.fin - x.dias_atras, x.eta
from tmp_v3 w, (values (1, 'AQP', 9, 2), (2, 'TRU', 1, 2), (3, 'AQP', 2, 3)) x(n, cod, dias_atras, eta);

-- A3: recibido con diferencia y sin cerrar (contaron menos de lo que salió; ningún movimiento de entrada todavía)
insert into tmp_tras (traslado_id, tipo, destino, estado, f_salida, eta_dias)
select pg_temp.sid('tras', 'A3:1'), 'A3', 'TRU', 'recibido_con_diferencia', w.fin - 5, 2 from tmp_v3 w;

insert into tmp_tras_lin (traslado_id, variante_id, cant, cant_recibida)
select t.traslado_id, s.variante_id, s.cant,
       case when t.tipo = 'A3' and s.rn = 1 then s.cant - 2 else s.cant end
from tmp_tras t
cross join lateral (
  select p.variante_id, 8 + floor(pg_temp.h('tq:' || t.traslado_id || p.variante_id) * 5)::int as cant,
         row_number() over (order by md5(t.traslado_id::text || p.variante_id::text)) as rn
  from tmp_par p
  where p.tienda = t.destino and p.total > 0 and p.temporada = 'Otoño-Invierno'
  order by md5(t.traslado_id::text || p.variante_id::text)
  limit (case when t.tipo = 'A3' then 3 else 4 end)
) s
where t.tipo in ('A2', 'A3');

-- horas de cada traslado (salida 10:30-12:00 en el Taller; conteo 10:00-15:00 al llegar; cierre a los 3-40 min)
update tmp_tras t set
  created_ts = ((t.f_salida + time '10:30') at time zone 'America/Lima') + floor(pg_temp.h('ts1:' || t.traslado_id) * 90)::int * interval '1 minute',
  f_entrada = case when t.tipo in ('extra') and t.dif then t.f_salida + t.eta_dias + 1
                   when t.tipo in ('extra') then t.f_salida + t.eta_dias
                   when t.tipo = 'A3' then t.f_salida + t.eta_dias end;
update tmp_tras t set
  eta_ts = t.created_ts + (t.eta_dias * 24) * interval '1 hour',
  conf_ts = case when t.tipo in ('extra', 'A3')
                 then (((t.f_salida + t.eta_dias) + time '10:00') at time zone 'America/Lima') + floor(pg_temp.h('ts2:' || t.traslado_id) * 300)::int * interval '1 minute' end;
update tmp_tras t set
  cierre_ts = case when t.tipo = 'extra' and not t.dif then t.conf_ts + (3 + floor(pg_temp.h('ts3:' || t.traslado_id) * 38)::int) * interval '1 minute'
                   when t.tipo = 'extra' and t.dif then ((t.f_entrada + time '09:30') at time zone 'America/Lima') + floor(pg_temp.h('ts3:' || t.traslado_id) * 90)::int * interval '1 minute' end;

-- las llegadas de esos traslados (lo recibido entra al almacén de la tienda el día del cierre)
insert into tmp_llegadas (variante_id, ubicacion_id, fecha, cant, origen, ref)
select l.variante_id, u.ubicacion_id, (t.cierre_ts at time zone 'America/Lima')::date, l.cant_recibida, 'traslado', t.traslado_id
from tmp_tras t join tmp_tras_lin l on l.traslado_id = t.traslado_id
join tmp_ubic u on u.codigo = t.destino
where t.tipo = 'extra' and l.cant_recibida > 0;

-- ---- 3.6 Compras que no vienen de la simulación: A5, las sin recibir y la anulada ----
-- Se arman como «eventos» aparte con su propio reparto (no cubren demanda: suman stock o quedan en papel).
-- A5: una factura a crédito con recepción parcial, un faltante cerrado y una nota de crédito, del sexto proveedor
-- con RUC. Tres líneas de tres productos suyos: L1 60 u (TRU 40, AQP 20) llega completa; L2 40 u (TRU 30, AQP 10)
-- llega completa a TRU y a AQP le llegan 4 y se cierran 6 (dañadas); L3 24 u (TRU) sigue sin llegar.
create temp table tmp_extra_ev (
  evento_id uuid, proveedor_id uuid, tipo_evento text, emision date, creado_en timestamptz,
  credito boolean, plazo int, fecha_estimada date, forzado text
) on commit drop;
create temp table tmp_extra_lin (evento_id uuid, producto_id uuid, ubicacion_id uuid, asignado int, recibido int, cerrado int, f_recepcion date) on commit drop;

insert into tmp_extra_ev (evento_id, proveedor_id, tipo_evento, emision, creado_en, credito, plazo, fecha_estimada, forzado)
select pg_temp.sid('evento', 'A5'), a.prov, 'a5', w.fin - 21,
       ((w.fin - 21 + time '10:00') at time zone 'America/Lima'), true, 30, w.fin - 14, 'A5'
from tmp_a4 a, tmp_v3 w where a.n = 6;

-- productos de ese proveedor (los que tienen más variantes primero) para las tres líneas
create temp table tmp_a5_prod on commit drop as
select tp.id as producto_id, row_number() over (order by (select count(*) from tmp_variantes_nuevas v where v.producto_id = tp.id) desc, tp.id) as ln
from tmp_productos_nuevos tp
where tp.proveedor_id = (select prov from tmp_a4 where n = 6) and tp.temporada = 'Otoño-Invierno';

do $$
begin
  if (select count(*) from tmp_a5_prod) < 3 then
    raise exception '[fase 3] el proveedor del escenario A5 tiene menos de 3 productos de Otoño-Invierno';
  end if;
end $$;

insert into tmp_extra_lin (evento_id, producto_id, ubicacion_id, asignado, recibido, cerrado, f_recepcion)
select pg_temp.sid('evento', 'A5'), pr.producto_id, u.ubicacion_id, x.asignado, x.recibido, x.cerrado, w.fin - x.dias_atras
from (values (1, 'TRU', 40, 40, 0, 17), (1, 'AQP', 20, 20, 0, 16),
             (2, 'TRU', 30, 30, 0, 17), (2, 'AQP', 10, 4, 6, 16),
             (3, 'TRU', 24, 0, 0, 0)) x(ln, cod, asignado, recibido, cerrado, dias_atras)
join tmp_a5_prod pr on pr.ln = x.ln
join tmp_ubic u on u.codigo = x.cod
cross join tmp_v3 w;

-- recepciones de A5: se reparte lo recibido entre las variantes del producto (a partes iguales, sobrando a las primeras)
create temp table tmp_a5_recep on commit drop as
select l.evento_id, l.producto_id, vv.variante_id, l.ubicacion_id, l.f_recepcion as fecha,
       (l.recibido / vv.nv + case when vv.rn <= l.recibido % vv.nv then 1 else 0 end)::int as cant
from tmp_extra_lin l
join (select v.id as variante_id, v.producto_id, row_number() over (partition by v.producto_id order by v.id) as rn,
             count(*) over (partition by v.producto_id) as nv from tmp_variantes_nuevas v) vv on vv.producto_id = l.producto_id
where l.evento_id = pg_temp.sid('evento', 'A5') and l.recibido > 0
  and (l.recibido / vv.nv + case when vv.rn <= l.recibido % vv.nv then 1 else 0 end) > 0;

-- lo de A5 también es stock que llega a esas tiendas (la simulación lo tiene que ver)
insert into tmp_llegadas (variante_id, ubicacion_id, fecha, cant, origen, ref)
select variante_id, ubicacion_id, fecha, cant, 'compra', evento_id from tmp_a5_recep;

-- cinco compras recientes (últimos 3-9 días) que aún no llegaron; dos con la fecha estimada ya vencida
insert into tmp_extra_ev (evento_id, proveedor_id, tipo_evento, emision, creado_en, credito, fecha_estimada, forzado)
select pg_temp.sid('evento', 'SR:' || g), s.proveedor_id, 'sin_recibir', w.fin - (3 + (g * 1.4)::int),
       ((w.fin - (3 + (g * 1.4)::int) + time '11:00') at time zone 'America/Lima') + (g * 7) * interval '1 minute',
       false, case when g <= 2 then w.fin - (3 + (g * 1.4)::int) + 3 else w.fin - (3 + (g * 1.4)::int) + 8 end, 'SR'
from generate_series(1, 5) g
cross join tmp_v3 w
join (select proveedor_id, row_number() over (order by pg_temp.h('sr:' || proveedor_id)) as rn from tmp_prov where n_prods >= 3) s on s.rn = g;

-- una compra anulada por error de digitación (sin pagos, sin recepción)
insert into tmp_extra_ev (evento_id, proveedor_id, tipo_evento, emision, creado_en, credito, forzado)
select pg_temp.sid('evento', 'ANU'), s.proveedor_id, 'anulada', w.inicio + 40,
       ((w.inicio + 40 + time '15:20') at time zone 'America/Lima'), false, 'ANU'
from tmp_v3 w
join (select proveedor_id, row_number() over (order by pg_temp.h('anu:' || proveedor_id)) as rn from tmp_prov where n_prods >= 2) s on s.rn = 1;

-- líneas de las compras sin recibir y de la anulada: 2-3 productos del proveedor, 6-24 unidades repartidas TRU 70 % / AQP 30 %
insert into tmp_extra_lin (evento_id, producto_id, ubicacion_id, asignado, recibido, cerrado, f_recepcion)
select e.evento_id, p.producto_id, u.ubicacion_id,
       case u.codigo when 'TRU' then 6 * (1 + floor(pg_temp.h('xq:' || e.evento_id || p.producto_id) * 3))::int
                     else 6 * (1 + floor(pg_temp.h('xq2:' || e.evento_id || p.producto_id) * 2))::int end,
       0, 0, null
from tmp_extra_ev e
cross join lateral (select tp.id as producto_id from tmp_productos_nuevos tp
                    where tp.proveedor_id = e.proveedor_id and tp.temporada = 'Otoño-Invierno'
                    order by md5(e.evento_id::text || tp.id::text) limit (2 + floor(pg_temp.h('xn:' || e.evento_id) * 2)::int)) p
join tmp_ubic u on u.codigo in ('TRU', 'AQP')
where e.tipo_evento in ('sin_recibir', 'anulada');

-- ---- 3.7 Simulación día a día: subidas al piso, olas de Lima y saldos ----
-- Regla de la tienda (inventario-reglas.ts): si el piso tiene 7 o menos y hay en el almacén, subir lo que cubra 7 días de
-- venta (mínimo 6, tope lo que haya); la subida se hace antes de abrir. Lo que llega un día se puede subir desde la
-- mañana siguiente. Si con eso el piso no alcanza para el día, la simulación se detiene con el detalle: es un error del
-- plan de compras, no algo que se tape.
create temp table tmp_est on commit drop as
select p.variante_id, p.ubicacion_id, p.tienda, coalesce(c.cant, 0)::int as alm, 0 as piso, p.vel, p.a6
from tmp_par p
left join (select variante_id, ubicacion_id, sum(cant)::int as cant from tmp_carga group by 1, 2) c
       on c.variante_id = p.variante_id and c.ubicacion_id = p.ubicacion_id
where p.total > 0 or coalesce(c.cant, 0) > 0
   or exists (select 1 from tmp_llegadas l where l.variante_id = p.variante_id and l.ubicacion_id = p.ubicacion_id);
create unique index on tmp_est (variante_id, ubicacion_id);

create temp table tmp_moves (variante_id uuid, ubicacion_id uuid, fecha date, cant int, ts timestamptz) on commit drop;
create temp table tmp_dia (variante_id uuid, ubicacion_id uuid, q int, dem int, ts timestamptz) on commit drop;

do $$
declare
  d date; v_ini date; v_fin date; v_corte timestamptz; r record; v_lim uuid; v_tras uuid;
begin
  select inicio, fin, corte into v_ini, v_fin, v_corte from tmp_v3;
  select ubicacion_id into v_lim from tmp_ubic where codigo = 'LIM';

  for d in select g::date from generate_series(v_ini::timestamp, v_fin::timestamp, interval '1 day') g loop

    -- (a) ola de Lima: sale del Taller por la mañana y llega el mismo día; cubre las ventas hasta la siguiente ola
    if exists (select 1 from tmp_ola_dias o where o.fecha = d) then
      v_tras := pg_temp.sid('tras', 'ola:' || d);
      insert into tmp_tras_lin (traslado_id, variante_id, cant, cant_recibida)
      select v_tras, q.variante_id, q.cant, q.cant
      from (
        select e.variante_id,
               (greatest(0, cov.s + round(cov.s * 0.15 * pg_temp.h('slw:' || e.variante_id || ':' || d)) - (e.alm + e.piso - coalesce(hoy.cant, 0)))
                + case when o.es_ultima and p.total > 0 and not p.muerto and not p.a7 and not p.agot
                       then greatest(1, round(p.total * (0.05 + 0.20 * pg_temp.h('efl:' || e.variante_id)))) else 0 end)::int as cant
        from tmp_est e
        join tmp_par p on p.variante_id = e.variante_id and p.ubicacion_id = e.ubicacion_id
        join tmp_ola_dias o on o.fecha = d
        left join tmp_dem hoy on hoy.variante_id = e.variante_id and hoy.ubicacion_id = e.ubicacion_id and hoy.fecha = d
        cross join lateral (select coalesce(sum(dd.cant), 0) as s from tmp_dem dd
                            where dd.variante_id = e.variante_id and dd.ubicacion_id = e.ubicacion_id
                              and dd.fecha > d and dd.fecha <= o.sig_fecha) cov
        where e.ubicacion_id = v_lim and p.total > 0
      ) q
      where q.cant > 0;

      if exists (select 1 from tmp_tras_lin where traslado_id = v_tras) then
        insert into tmp_tras (traslado_id, tipo, destino, estado, f_salida, eta_dias, f_entrada, created_ts, eta_ts, conf_ts, cierre_ts)
        select v_tras, 'ola', 'LIM', 'cerrada', d, 0, d,
               ((d + time '10:30') at time zone 'America/Lima') + floor(pg_temp.h('ts1:' || v_tras) * 90)::int * interval '1 minute',
               ((d + time '17:00') at time zone 'America/Lima'),
               ((d + time '14:00') at time zone 'America/Lima') + floor(pg_temp.h('ts2:' || v_tras) * 120)::int * interval '1 minute',
               ((d + time '14:00') at time zone 'America/Lima') + (125 + floor(pg_temp.h('ts3:' || v_tras) * 30)::int) * interval '1 minute';
        insert into tmp_llegadas (variante_id, ubicacion_id, fecha, cant, origen, ref)
        select l.variante_id, v_lim, d, l.cant_recibida, 'traslado', v_tras from tmp_tras_lin l where l.traslado_id = v_tras;
      end if;
    end if;

    -- (b) subidas del almacén al piso, antes de abrir
    truncate tmp_dia;
    insert into tmp_dia (variante_id, ubicacion_id, q, dem, ts)
    select e.variante_id, e.ubicacion_id, x.q0 + greatest(0, coalesce(dd.cant, 0) - e.piso - x.q0), coalesce(dd.cant, 0),
           ((d + time '08:30') at time zone 'America/Lima')
             + floor(pg_temp.h('mm:' || e.variante_id || ':' || e.ubicacion_id || ':' || d) * 60)::int * interval '1 minute'
    from tmp_est e
    left join tmp_dem dd on dd.variante_id = e.variante_id and dd.ubicacion_id = e.ubicacion_id and dd.fecha = d
    cross join lateral (select case when not e.a6 and e.alm > 0 and e.piso <= 7
                                    then least(e.alm, greatest(ceil(e.vel * 7)::int - e.piso, 6)) else 0 end) x(q0);
    update tmp_dia set q = 0 where ts > v_corte;

    select t.variante_id, t.ubicacion_id, t.q, t.dem, e.alm, e.piso into r
    from tmp_dia t join tmp_est e on e.variante_id = t.variante_id and e.ubicacion_id = t.ubicacion_id
    where t.q > e.alm or e.piso + t.q < t.dem limit 1;
    if found then
      raise exception '[fase 3] día %: variante % en % sin stock para subir/vender (almacén %, piso %, sube %, vende %)',
        d, r.variante_id, r.ubicacion_id, r.alm, r.piso, r.q, r.dem;
    end if;

    insert into tmp_moves (variante_id, ubicacion_id, fecha, cant, ts)
    select variante_id, ubicacion_id, d, q, ts from tmp_dia where q > 0;

    -- (c) las ventas del día bajan el piso; (d) lo que llegó hoy entra al almacén
    update tmp_est e set alm = e.alm - t.q, piso = e.piso + t.q - t.dem
    from tmp_dia t where t.variante_id = e.variante_id and t.ubicacion_id = e.ubicacion_id and (t.q <> 0 or t.dem <> 0);
    update tmp_est e set alm = e.alm + l.s
    from (select variante_id, ubicacion_id, sum(cant)::int as s from tmp_llegadas where fecha = d group by 1, 2) l
    where l.variante_id = e.variante_id and l.ubicacion_id = e.ubicacion_id;
  end loop;

  if exists (select 1 from tmp_est where alm < 0 or piso < 0) then
    raise exception '[fase 3] la simulación dejó un saldo negativo';
  end if;
  if exists (select 1 from tmp_llegadas l where not exists (select 1 from tmp_est e where e.variante_id = l.variante_id and e.ubicacion_id = l.ubicacion_id)) then
    raise exception '[fase 3] hay llegadas a un par (variante, tienda) que la simulación no conoce';
  end if;
end $$;

-- el Taller arranca con lo que después despacha (olas, reposición y traslados en curso) más un colchón de producto terminado
create temp table tmp_taller_carga on commit drop as
select l.variante_id,
       sum(l.cant)::int + (case when pg_temp.h('tc:' || l.variante_id) < 0.7 then floor(pg_temp.h('tc2:' || l.variante_id) * 7)::int else 0 end) as cant
from tmp_tras_lin l group by l.variante_id;

-- ---- 3.8 Las compras: cabeceras, líneas y reparto por tienda ----
-- Cada línea es un producto (como en la pantalla de Recibir); su cantidad es la suma de lo que llega de sus variantes en
-- todas las tiendas y el costo es el costo declarado de la prenda (constante: no toca el costo ni deja historial).
create temp table tmp_recep (
  evento_id uuid, producto_id uuid, variante_id uuid, ubicacion_id uuid, fecha date, cant int
) on commit drop;

-- recepciones que salen de la simulación (TRU y AQP)
insert into tmp_recep (evento_id, producto_id, variante_id, ubicacion_id, fecha, cant)
select a.evento_id, v.producto_id, a.variante_id, a.ubicacion_id, a.fecha, a.q
from tmp_arribo a join tmp_variantes_nuevas v on v.id = a.variante_id
where a.kind = 'compra' and a.q > 0;

-- recepciones de A5 (armadas en 3.7)
insert into tmp_recep (evento_id, producto_id, variante_id, ubicacion_id, fecha, cant)
select evento_id, producto_id, variante_id, ubicacion_id, fecha, cant from tmp_a5_recep;

-- reparto asignado por (evento, producto, tienda)
create temp table tmp_dest on commit drop as
select r.evento_id, r.producto_id, r.ubicacion_id, sum(r.cant)::int as asignado
from tmp_recep r where r.evento_id <> pg_temp.sid('evento', 'A5') group by 1, 2, 3
union all
select l.evento_id, l.producto_id, l.ubicacion_id, l.asignado from tmp_extra_lin l where l.asignado > 0;

-- todos los eventos que tienen al menos una línea
create temp table tmp_compra on commit drop as
select e.evento_id, e.proveedor_id, e.tipo_evento, e.emision, e.creado_en, e.credito, e.plazo, e.forzado, null::date as fecha_estimada
from tmp_evento e where exists (select 1 from tmp_dest d where d.evento_id = e.evento_id)
union all
select x.evento_id, x.proveedor_id, x.tipo_evento, x.emision, x.creado_en, x.credito, x.plazo, x.forzado, x.fecha_estimada from tmp_extra_ev x;

create temp table tmp_item on commit drop as
select pg_temp.sid('item', d.evento_id || ':' || d.producto_id) as item_id, d.evento_id, d.producto_id,
       sum(d.asignado)::int as cantidad,
       (select min(v.costo) from tmp_variantes_nuevas v where v.producto_id = d.producto_id) as costo,
       (select tp.referencia from tmp_productos_nuevos tp where tp.id = d.producto_id) as referencia
from tmp_dest d group by d.evento_id, d.producto_id;

-- tipo de comprobante: proveedores sin RUC y los chicos (≤ 3 productos) entregan casi siempre nota de venta o boleta
-- (R-07: más del 30 % de las compras llega sin factura); A4 y A5 son facturas con RUC
create temp table tmp_cab on commit drop as
select c.*, s.sub,
       case when c.forzado in ('A4-1','A4-2','A4-3','A4-4','A4-5','A5') then 'factura'
            when not pr.tiene_ruc or (pr.n_prods <= 3 and pg_temp.h('inf:' || c.evento_id) < 0.40) or pg_temp.h('inf2:' || c.evento_id) < 0.05
                 then (case when pg_temp.h('nv:' || c.evento_id) < 0.6 then 'nota_venta' else 'boleta' end)
            else 'factura' end as tipo
from tmp_compra c
join tmp_prov pr on pr.proveedor_id = c.proveedor_id
join (select i.evento_id, sum(i.cantidad * i.costo) as sub from tmp_item i group by 1) s on s.evento_id = c.evento_id;

-- serie y número: serie de demostración inconfundible (FD01 / BD01 / NV9) y correlativo por proveedor y serie en orden de fecha
create temp table tmp_cab2 on commit drop as
select c.*, (case c.tipo when 'factura' then 'FD01' when 'boleta' then 'BD01' else 'NV9' end) as serie,
       lpad(row_number() over (partition by c.proveedor_id, c.tipo order by c.emision, c.evento_id)::text, 8, '0') as numero,
       case when c.tipo = 'factura' then round(c.sub * 0.18, 2) else 0 end as igv
from tmp_cab c;

-- ---- 3.9 Inserción: compras, líneas, reparto ----
insert into compras (id, proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
                     subtotal, igv, total, estado, motivo_anulacion, nota, usuario_id, created_at, fecha_estimada_llegada)
select c.evento_id, c.proveedor_id, c.tipo, c.serie, c.numero, c.emision,
       case when c.credito then 'credito' else 'contado' end,
       case when c.credito then c.emision + c.plazo end,
       c.sub, c.igv, c.sub + c.igv,
       case when c.tipo_evento = 'anulada' then 'anulada' else 'vigente' end,
       case when c.tipo_evento = 'anulada' then 'Error de digitación: se emitió por equivocación' end,
       null, pg_temp.firmante(null, c.emision, true, 'compra:' || c.evento_id), c.creado_en,
       coalesce(c.fecha_estimada, c.emision + 4 + floor(pg_temp.h('fe:' || c.evento_id) * 7)::int)
from tmp_cab2 c;

insert into compra_items (id, compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)
select i.item_id, i.evento_id, i.producto_id, null, i.referencia, i.cantidad, i.costo from tmp_item i;

insert into compra_item_destinos (compra_item_id, ubicacion_id, cantidad, created_at)
select i.item_id, d.ubicacion_id, d.asignado, c.creado_en
from tmp_dest d
join tmp_item i on i.evento_id = d.evento_id and i.producto_id = d.producto_id
join tmp_compra c on c.evento_id = d.evento_id;

-- se comprueban ya los dos constraint triggers diferidos de reparto (en un ROLLBACK de ensayo nunca correrían)
set constraints all immediate;
set constraints all deferred;

-- ---- 3.10 Llegadas: envío (una guía por tienda y día), lote (un proveedor por envío) y entradas al almacén ----
-- Hora de llegada 10:00-17:00 de Lima: siempre después de las subidas de esa mañana (08:30-09:30) y en el mismo día UTC
-- (así el lead time que calcula fn_productos, que corta por día UTC, sale bien).
create temp table tmp_envio on commit drop as
select pg_temp.sid('envio', r.ubicacion_id || '|' || r.fecha) as envio_id, r.ubicacion_id, r.fecha,
       ((r.fecha + time '10:00') at time zone 'America/Lima')
         + floor(pg_temp.h('rc:' || r.ubicacion_id || '|' || r.fecha) * 420)::int * interval '1 minute' as ts,
       pg_temp.firmante(r.ubicacion_id, r.fecha, false, 'rcv:' || r.ubicacion_id || '|' || r.fecha) as recibido_por,
       'T001-' || lpad((row_number() over (partition by r.ubicacion_id order by r.fecha))::text, 6, '0') as guia
from (select distinct ubicacion_id, fecha from tmp_recep) r;

insert into envios (id, ubicacion_id, numero_guia, nota, recibido_por, fecha_recepcion)
select e.envio_id, e.ubicacion_id, e.guia, null, e.recibido_por, e.ts from tmp_envio e;

create temp table tmp_lote on commit drop as
select pg_temp.sid('lote', r.ubicacion_id || '|' || r.fecha || '|' || c.proveedor_id) as lote_id, e.envio_id, r.ubicacion_id, r.fecha, c.proveedor_id
from (select distinct evento_id, ubicacion_id, fecha from tmp_recep) r
join tmp_compra c on c.evento_id = r.evento_id
join tmp_envio e on e.ubicacion_id = r.ubicacion_id and e.fecha = r.fecha
group by 1, 2, 3, 4, 5;

insert into lotes (id, ubicacion_id, proveedor_id, numero_guia, fecha_recepcion, recibido_por, nota, envio_id)
select l.lote_id, l.ubicacion_id, l.proveedor_id, e.guia, e.ts, e.recibido_por, null, l.envio_id
from tmp_lote l join tmp_envio e on e.envio_id = l.envio_id;

insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id, usuario_id, created_at)
select pg_temp.sid('mov', 'rec:' || r.evento_id || ':' || r.variante_id || ':' || r.ubicacion_id || ':' || r.fecha),
       r.variante_id, r.ubicacion_id, u.sub_almacen, 'entrada', r.cant, 'recepcion',
       l.lote_id, i.item_id, e.recibido_por, e.ts
from tmp_recep r
join tmp_compra c on c.evento_id = r.evento_id
join tmp_envio e on e.ubicacion_id = r.ubicacion_id and e.fecha = r.fecha
join tmp_lote l on l.envio_id = e.envio_id and l.proveedor_id = c.proveedor_id
join tmp_item i on i.evento_id = r.evento_id and i.producto_id = r.producto_id
join tmp_ubic u on u.ubicacion_id = r.ubicacion_id;

-- ---- 3.11 A5: el faltante cerrado y la nota de crédito ----
insert into compra_item_cierres (id, compra_item_id, ubicacion_id, cantidad, motivo, nota, usuario_id, created_at)
select pg_temp.sid('cierre', 'A5'), i.item_id, l.ubicacion_id, l.cerrado, 'danada', 'Llegaron dañadas; el proveedor no las repone',
       pg_temp.firmante(l.ubicacion_id, w.fin - 12, false, 'cierreA5'),
       ((w.fin - 12 + time '11:00') at time zone 'America/Lima')
from tmp_extra_lin l
join tmp_item i on i.evento_id = l.evento_id and i.producto_id = l.producto_id
cross join tmp_v3 w
where l.evento_id = pg_temp.sid('evento', 'A5') and l.cerrado > 0;

-- nota de crédito por lo cerrado (motivo «devolucion»: la compra no está resuelta, así que «faltante» no aplica).
-- Réplica de fn_insertar_nota_credito_compra con created_at histórico (la función deja now() en una tabla inmutable).
insert into compra_notas_credito (id, compra_id, cierre_id, serie_numero, fecha, subtotal, igv, monto, motivo, nota, usuario_id, created_at, aplicado)
select pg_temp.sid('nc', 'A5'), c.evento_id, pg_temp.sid('cierre', 'A5'), 'FC01-00000001', w.fin - 10,
       n.monto - n.igv_nota, n.igv_nota, n.monto, 'devolucion', 'Nota de crédito por las 6 unidades dañadas', pg_temp.firmante(null, w.fin - 10, true, 'ncA5'),
       ((w.fin - 10 + time '11:30') at time zone 'America/Lima'), n.monto
from tmp_cab2 c
cross join tmp_v3 w
cross join lateral (
  select round(l.cerrado * i.costo * 1.18, 2) as monto,
         round(round(l.cerrado * i.costo * 1.18, 2) * c.igv / (c.sub + c.igv), 2) as igv_nota
  from tmp_extra_lin l join tmp_item i on i.evento_id = l.evento_id and i.producto_id = l.producto_id
  where l.evento_id = c.evento_id and l.cerrado > 0
) n
where c.evento_id = pg_temp.sid('evento', 'A5');

-- ---- 3.12 Pagos ----
-- Contado: se paga el día de la emisión (a contra entrega), casi todo por transferencia (R-02: > 75 %); el efectivo de
-- S/ 2.000 o más pierde el crédito fiscal (ley 28194) y solo ocurre en 2 casos. Crédito: solo A4-3 tiene un pago parcial.
create temp table tmp_pago on commit drop as
with base as (
  select c.evento_id, c.emision, c.creado_en, c.sub + c.igv as total, (c.tipo <> 'factura') as informal,
         pg_temp.h('pg:' || c.evento_id) as u_medio, pg_temp.h('pg2:' || c.evento_id) as u_dos
  from tmp_cab2 c where not c.credito and c.tipo_evento <> 'anulada'
),
partes as (
  select b.*, p.n as parte,
         case when b.u_dos < 0.08 then (case when p.n = 1 then round(b.total * 0.6, 2) else b.total - round(b.total * 0.6, 2) end) else b.total end as monto
  from base b cross join lateral generate_series(1, case when b.u_dos < 0.08 then 2 else 1 end) p(n)
),
medio as (
  select pa.*,
         case when (pa.u_medio + 0.37 * (pa.parte - 1)) % 1 < (case when pa.informal then 0.55 else 0.92 end) then 'transferencia'
              when (pa.u_medio + 0.37 * (pa.parte - 1)) % 1 < (case when pa.informal then 0.80 else 0.96 end) then 'efectivo'
              when (pa.u_medio + 0.37 * (pa.parte - 1)) % 1 < (case when pa.informal then 0.92 else 0.98 end) then 'yape'
              else 'plin' end as metodo0
  from partes pa
)
select m.evento_id, m.parte, m.emision, m.creado_en, m.monto,
       case when m.metodo0 = 'efectivo' and m.monto >= 2000
                 and row_number() over (partition by (m.metodo0 = 'efectivo' and m.monto >= 2000) order by pg_temp.h('ef:' || m.evento_id || m.parte)) > 2
            then 'transferencia' else m.metodo0 end as metodo
from medio m;

insert into compra_pagos (id, compra_id, fecha, monto, metodo, referencia, usuario_id, created_at)
select pg_temp.sid('pago', p.evento_id || ':' || p.parte), p.evento_id, p.emision, p.monto, p.metodo,
       case when p.metodo = 'transferencia' then 'OP-' || lpad((floor(pg_temp.h('op:' || p.evento_id || p.parte) * 99999999))::text, 8, '0') end,
       pg_temp.firmante(null, p.emision, true, 'pago:' || p.evento_id),
       p.creado_en + (5 + floor(pg_temp.h('pt:' || p.evento_id || p.parte) * 80)::int) * interval '1 minute'
from tmp_pago p;

-- A4-3 (vencida hace 11 días): se pagó el 40 % por transferencia diez días después de emitirla
insert into compra_pagos (id, compra_id, fecha, monto, metodo, referencia, usuario_id, created_at)
select pg_temp.sid('pago', c.evento_id || ':parcial'), c.evento_id, c.emision + 10, round((c.sub + c.igv) * 0.4, 2), 'transferencia',
       'OP-' || lpad((floor(pg_temp.h('op:' || c.evento_id) * 99999999))::text, 8, '0'),
       pg_temp.firmante(null, c.emision + 10, true, 'pagoA43'),
       ((c.emision + 10 + time '12:00') at time zone 'America/Lima')
from tmp_cab2 c where c.forzado = 'A4-3';

-- ---- 3.13 Inventario inicial, traslados del Taller y subidas al piso ----
-- carga_inicial: entrada al almacén de la tienda (al Taller, sin sububicación), sin usuario ni lote, como las 219 reales;
-- a las 12:30 del día anterior a la ventana (después de dar de alta cada prenda, que es antes de las 11:00).
insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, created_at)
select pg_temp.sid('mov', 'carga:' || c.variante_id || ':' || c.ubicacion_id), c.variante_id, c.ubicacion_id, u.sub_almacen, 'entrada', c.cant, 'carga_inicial', null::uuid,
       ((w.carga + time '12:30') at time zone 'America/Lima') + (case u.codigo when 'TRU' then 0 when 'AQP' then 6 else 12 end) * interval '1 minute'
from tmp_carga c join tmp_ubic u on u.ubicacion_id = c.ubicacion_id cross join tmp_v3 w
where c.cant > 0
union all
select pg_temp.sid('mov', 'carga:' || t.variante_id || ':taller'), t.variante_id, u.ubicacion_id, null::uuid, 'entrada', t.cant, 'carga_inicial', null::uuid,
       -- las prendas de la colección nueva entran al Taller el día de su alta (09:35-09:55, después de darlas de alta y antes de la ola de las 10:30)
       case when tp.temporada = 'Primavera-Verano'
            then (((tp.creado_en at time zone 'America/Lima')::date + time '09:35') at time zone 'America/Lima') + floor(pg_temp.h('tal:' || t.variante_id) * 20)::int * interval '1 minute'
            else ((w.carga + time '12:30') at time zone 'America/Lima') + interval '18 minutes' end
from tmp_taller_carga t join tmp_ubic u on u.codigo = 'TAL' cross join tmp_v3 w
join tmp_variantes_nuevas v on v.id = t.variante_id join tmp_productos_nuevos tp on tp.id = v.producto_id;

-- traslados: transferencia -> ítems -> salida del Taller -> recepciones -> entrada al almacén de la tienda
create temp table tmp_tras2 on commit drop as
select t.*, tal.ubicacion_id as origen_id, d.ubicacion_id as destino_id,
       row_number() over (order by t.created_ts, t.traslado_id) as rn,
       pg_temp.firmante(tal.ubicacion_id, t.f_salida, false, 'tc:' || t.traslado_id) as creado_por,
       case when t.estado <> 'en_transito' then pg_temp.firmante(d.ubicacion_id, (t.conf_ts at time zone 'America/Lima')::date, false, 'tf:' || t.traslado_id) end as confirmado_por,
       case when t.dif and t.estado = 'cerrada' then pg_temp.firmante(d.ubicacion_id, (t.cierre_ts at time zone 'America/Lima')::date, true, 'tl:' || t.traslado_id) end as lider_cierra
from tmp_tras t
join tmp_ubic tal on tal.codigo = 'TAL'
join tmp_ubic d on d.codigo = t.destino;

-- número explícito y creciente con la fecha (no por nextval: así el orden coincide con la fecha, no con el orden de inserción).
-- El setval que sincroniza transferencias_numero_seq va en la sección de chequeos, DENTRO de esta misma transacción — nunca
-- quedó como paso aparte para Felipe: sin él, el primer «Iniciar traslado» real después del COMMIT chocaría con una fila
-- sembrada (transferencias_numero_unique) porque nextval() seguiría devolviendo los números que este INSERT ya usó a mano.
insert into transferencias (id, ubicacion_origen_id, ubicacion_destino_id, estado, creado_por, nota, created_at, fecha_estimada_llegada,
                            confirmado_por, confirmado_en, cerrado_por, cerrado_en, nota_cierre, numero)
select t.traslado_id, t.origen_id, t.destino_id, t.estado, t.creado_por,
       case t.tipo when 'ola' then 'Reposición de Lima' when 'extra' then 'Reposición de la tienda' else null end,
       t.created_ts, t.eta_ts,
       t.confirmado_por, t.conf_ts,
       case when t.estado = 'cerrada' then coalesce(t.lider_cierra, t.confirmado_por) end,
       case when t.estado = 'cerrada' then t.cierre_ts end,
       case when t.dif and t.estado = 'cerrada' then 'Se cerró la diferencia: lo que faltó no llegó' end,
       (select coalesce(max(numero), 0) from transferencias where id::text not like '5eed%') + t.rn
from tmp_tras2 t;

insert into transferencia_items (id, transferencia_id, variante_id, cantidad)
select pg_temp.sid('ti', l.traslado_id || ':' || l.variante_id), l.traslado_id, l.variante_id, l.cant from tmp_tras_lin l;

insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_item_id, usuario_id, created_at)
select pg_temp.sid('mov', 'sal:' || l.traslado_id || ':' || l.variante_id), l.variante_id, t.origen_id, null, 'salida', l.cant, 'traslado_salida',
       pg_temp.sid('ti', l.traslado_id || ':' || l.variante_id), t.creado_por, t.created_ts
from tmp_tras_lin l join tmp_tras2 t on t.traslado_id = l.traslado_id;

update transferencia_items ti set movimiento_id = pg_temp.sid('mov', 'sal:' || ti.transferencia_id || ':' || ti.variante_id)
where ti.id::text like '5eed%';

-- recepciones (contaron todo lo que llegó; en A3 y en las que cierran con diferencia, menos de lo que salió)
insert into transferencia_recepciones (id, transferencia_id, variante_id, cantidad_recibida, registrado_por, created_at)
select pg_temp.sid('tr', l.traslado_id || ':' || l.variante_id), l.traslado_id, l.variante_id, l.cant_recibida, t.confirmado_por,
       t.conf_ts + (row_number() over (partition by l.traslado_id order by l.variante_id) - 1) * interval '3 seconds'
from tmp_tras_lin l join tmp_tras2 t on t.traslado_id = l.traslado_id
where t.estado in ('cerrada', 'recibido_con_diferencia');

insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id, created_at)
select pg_temp.sid('mov', 'ent:' || l.traslado_id || ':' || l.variante_id), l.variante_id, t.destino_id, u.sub_almacen, 'entrada', l.cant_recibida, 'traslado_entrada',
       pg_temp.sid('tr', l.traslado_id || ':' || l.variante_id), coalesce(t.lider_cierra, t.confirmado_por), t.cierre_ts
from tmp_tras_lin l
join tmp_tras2 t on t.traslado_id = l.traslado_id and t.estado = 'cerrada'
join tmp_ubic u on u.ubicacion_id = t.destino_id
where l.cant_recibida > 0;

update transferencia_recepciones tr set movimiento_id = pg_temp.sid('mov', 'ent:' || tr.transferencia_id || ':' || tr.variante_id)
where tr.id::text like '5eed%' and tr.cantidad_recibida > 0 and exists (select 1 from tmp_tras2 t where t.traslado_id = tr.transferencia_id and t.estado = 'cerrada');

-- subidas del almacén al piso (lo que hace mover_interno: un solo movimiento tipo «traslado» dentro de la tienda)
insert into movimientos (id, variante_id, ubicacion_id, ubicacion_destino_id, sububicacion_id, sububicacion_destino_id, tipo, cantidad, motivo, usuario_id, created_at)
select pg_temp.sid('mov', 'int:' || m.variante_id || ':' || m.ubicacion_id || ':' || m.fecha), m.variante_id, m.ubicacion_id, m.ubicacion_id, u.sub_almacen, u.sub_piso,
       'traslado', m.cant, 'movimiento_interno', pg_temp.firmante(m.ubicacion_id, m.fecha, false, 'int:' || m.variante_id || ':' || m.fecha), m.ts
from tmp_moves m join tmp_ubic u on u.ubicacion_id = m.ubicacion_id
where m.cant > 0;

-- flush de los constraint triggers diferidos del reparto (compra_item_destinos_cuadra / compra_items_reparto_cuadra): solo
-- reevalúan lo que de verdad se tocó en compra_items/compra_item_destinos desde el primer flush — en esta fase, nada; el
-- candado de «ninguna tienda recibe o cierra más de lo que le tocó» lo pone recibir_compras() con un RAISE propio sobre
-- movimientos/compra_item_cierres, no un trigger, así que este flush no lo cubre (queda como check (13) más abajo).
set constraints all immediate;
set constraints all deferred;

-- =============================================================================
-- Chequeos de la Fase 3: cualquier falla aborta la transacción entera
-- =============================================================================
-- El libro completo de la Fase 3 (todo lo sembrado en movimientos) más las ventas de la Fase 2 como salidas del piso, que
-- la Fase 4 insertará de verdad: así se comprueba ya que ninguna venta queda sin stock.
create temp table tmp_ev on commit drop as
select m.variante_id, m.ubicacion_id, m.sububicacion_id as sub, m.created_at as ts, m.id as ref,
       case m.tipo when 'entrada' then m.cantidad when 'ajuste' then m.cantidad else -m.cantidad end as d
from movimientos m where m.id::text like '5eed%'
union all
select m.variante_id, m.ubicacion_destino_id, m.sububicacion_destino_id, m.created_at, m.id, m.cantidad
from movimientos m where m.id::text like '5eed%' and m.tipo = 'traslado'
union all
select l.variante_id, l.ubicacion_id, u.sub_piso, t.ts, l.ticket_id, -l.cantidad
from tmp_lineas l join tmp_tickets t on t.ticket_id = l.ticket_id join tmp_ubic u on u.ubicacion_id = l.ubicacion_id;

do $$
declare
  v_n int; v_cnt int; v_max timestamptz; v_corte timestamptz; r record;
begin
  select corte into v_corte from tmp_v3;

  -- (1) saldo corrido: ningún bucket (variante, ubicación, sububicación) baja de 0 en ningún instante
  select count(*) into v_n from (
    select variante_id, ubicacion_id, sub, min(saldo) as minimo from (
      select variante_id, ubicacion_id, sub,
             sum(d) over (partition by variante_id, ubicacion_id, sub order by ts, (d < 0)::int, ref rows unbounded preceding) as saldo
      from tmp_ev) x
    group by 1, 2, 3 having min(saldo) < 0) y;
  if v_n > 0 then raise exception '[check abastecimiento] % buckets con saldo negativo en algún momento', v_n; end if;

  -- (2) entrada y salida del mismo bucket en el mismo instante: el orden (created_at, id) las mezclaría al azar
  select count(*) into v_n from (select 1 from tmp_ev group by variante_id, ubicacion_id, sub, ts having bool_or(d > 0) and bool_or(d < 0)) x;
  if v_n > 0 then raise exception '[check abastecimiento] % buckets con una entrada y una salida en el mismo instante', v_n; end if;

  -- (3) lo que dejó la simulación coincide con el libro sembrado (tiendas: almacén + piso por variante y tienda)
  select count(*) into v_n from (
    select e.variante_id, e.ubicacion_id from tmp_est e
    left join (select variante_id, ubicacion_id, sum(d)::int as neto from tmp_ev group by 1, 2) b on b.variante_id = e.variante_id and b.ubicacion_id = e.ubicacion_id
    where e.alm + e.piso <> coalesce(b.neto, 0)) z;
  if v_n > 0 then raise exception '[check abastecimiento] % pares donde el libro sembrado no coincide con la simulación', v_n; end if;

  -- (4) nada de lo sembrado está fechado después del corte (última jornada: hasta hace 15 minutos)
  select greatest((select max(created_at) from movimientos where id::text like '5eed%'),
                  (select max(created_at) from compras where id::text like '5eed%'),
                  (select max(created_at) from compra_pagos where id::text like '5eed%'),
                  (select max(fecha_recepcion) from envios where id::text like '5eed%'),
                  (select max(created_at) from transferencias where id::text like '5eed%'),
                  (select max(coalesce(cerrado_en, confirmado_en)) from transferencias where id::text like '5eed%'))
    into v_max;
  if v_max > v_corte then raise exception '[check abastecimiento] hay filas fechadas en el futuro (%, corte %)', v_max, v_corte; end if;

  -- (5) firmantes: nadie firma antes de haber ingresado, y compras, pagos y notas de crédito son de líder
  select count(*) into v_n from (
    select m.id from movimientos m join public.personas p on p.id = m.usuario_id where m.id::text like '5eed%' and p.fecha_ingreso > (m.created_at at time zone 'America/Lima')::date
    union all select e.id from envios e join public.personas p on p.id = e.recibido_por where e.id::text like '5eed%' and p.fecha_ingreso > (e.fecha_recepcion at time zone 'America/Lima')::date
    union all select c.id from compras c join public.personas p on p.id = c.usuario_id where c.id::text like '5eed%' and p.fecha_ingreso > c.fecha_emision
    union all select x.id from compra_pagos x join public.personas p on p.id = x.usuario_id where x.id::text like '5eed%' and p.fecha_ingreso > x.fecha
    union all select t.id from transferencias t join public.personas p on p.id in (t.creado_por, t.confirmado_por, t.cerrado_por) where t.id::text like '5eed%'
              and p.fecha_ingreso > (coalesce(t.cerrado_en, t.confirmado_en, t.created_at) at time zone 'America/Lima')::date) f;
  if v_n > 0 then raise exception '[check abastecimiento] % firmas anteriores al ingreso de quien firma', v_n; end if;
  select count(*) into v_n from (
    select c.id from compras c where c.id::text like '5eed%' and not exists (select 1 from colaboradores k where k.persona_id = c.usuario_id and k.rol = 'lider')
    union all select x.id from compra_pagos x where x.id::text like '5eed%' and not exists (select 1 from colaboradores k where k.persona_id = x.usuario_id and k.rol = 'lider')
    union all select n.id from compra_notas_credito n where n.id::text like '5eed%' and not exists (select 1 from colaboradores k where k.persona_id = n.usuario_id and k.rol = 'lider')) f;
  if v_n > 0 then raise exception '[check abastecimiento] % compras, pagos o notas de crédito firmados por alguien que no es líder', v_n; end if;

  -- (6) compras: proveedor activo y el del producto de cada línea; creadas después de existir el producto; llegan de 0 a 14 días después
  select count(*) into v_n from (
    select c.id from compras c join retail.proveedores pr on pr.id = c.proveedor_id where c.id::text like '5eed%' and not pr.activo
    union all select c.id from compras c join compra_items i on i.compra_id = c.id join productos p on p.id = i.producto_id
               where c.id::text like '5eed%' and p.proveedor_id is distinct from c.proveedor_id
    union all select c.id from compras c join compra_items i on i.compra_id = c.id join productos p on p.id = i.producto_id
               where c.id::text like '5eed%' and c.created_at < p.created_at
    union all select c.id from compras c join compra_items i on i.compra_id = c.id join movimientos m on m.compra_item_id = i.id join lotes l on l.id = m.lote_id
               where c.id::text like '5eed%' and ((l.fecha_recepcion at time zone 'America/Lima')::date < c.fecha_emision
                                                  or (l.fecha_recepcion at time zone 'America/Lima')::date - c.fecha_emision > 14
                                                  or l.fecha_recepcion < c.created_at)) z;
  if v_n > 0 then raise exception '[check abastecimiento] % compras con proveedor, fecha o plazo incoherente', v_n; end if;

  -- (7) contadores que llevan los triggers y estados que salen solos
  select count(*) into v_n from compras c where c.id::text like '5eed%'
    and (c.facturado_cantidad <> (select coalesce(sum(i.cantidad), 0) from compra_items i where i.compra_id = c.id)
      or c.recibido_cantidad <> (select coalesce(sum(m.cantidad), 0) from movimientos m join compra_items i on i.id = m.compra_item_id where i.compra_id = c.id)
      or c.pagado <> (select coalesce(sum(p.monto), 0) from compra_pagos p where p.compra_id = c.id));
  if v_n > 0 then raise exception '[check abastecimiento] % compras con contadores distintos de lo insertado', v_n; end if;
  select count(*) into v_n from compras where id::text like '5eed%' and estado = 'vigente' and condicion = 'contado' and estado_pago <> 'pagada';
  if v_n > 0 then raise exception '[check abastecimiento] % compras al contado sin pagar', v_n; end if;

  -- (8) mezcla de las compras (R-01, R-02, R-07, R-09)
  select count(*) into v_cnt from compras where id::text like '5eed%';
  if v_cnt < 130 or v_cnt > 190 then raise exception '[check abastecimiento] % compras (se esperaban 130-190)', v_cnt; end if;
  select round(100.0 * count(*) filter (where tipo <> 'factura') / count(*)) into v_n from compras where id::text like '5eed%';
  if v_n < 26 or v_n > 40 then raise exception '[check abastecimiento] % %% de compras sin factura (R-07 pide 30-35 %%)', v_n; end if;
  select round(100.0 * count(*) filter (where metodo = 'transferencia') / count(*)) into v_n from compra_pagos where id::text like '5eed%';
  if v_n < 75 then raise exception '[check abastecimiento] solo % %% de pagos por transferencia (R-02 pide > 75 %%)', v_n; end if;
  select count(*) into v_n from compra_pagos where id::text like '5eed%' and metodo = 'efectivo' and monto >= 2000;
  if v_n > 2 then raise exception '[check abastecimiento] % pagos en efectivo de S/ 2.000 o más (R-09: como mucho 2)', v_n; end if;

  -- (9) A4: 3 vencidas (1 hace más de 30 días, 2 hace 8-30) y 2 por vencer en ≤ 7 días; A5 parcial con su nota
  select * into r from (
    select count(*) filter (where c.fecha_vencimiento < w.fin - 30) as v30,
           count(*) filter (where c.fecha_vencimiento between w.fin - 30 and w.fin - 8) as v8_30,
           count(*) filter (where c.fecha_vencimiento between w.fin and w.fin + 7) as por_vencer
    from compras c, tmp_v3 w where c.id::text like '5eed%' and c.condicion = 'credito' and c.saldo > 0 and c.estado = 'vigente') a4;
  if r.v30 <> 1 or r.v8_30 <> 2 or r.por_vencer <> 2 then
    raise exception '[check abastecimiento] A4: vencidas >30 d = %, vencidas 8-30 d = %, por vencer = % (se esperaban 1, 2 y 2)', r.v30, r.v8_30, r.por_vencer;
  end if;
  select count(*) into v_n from compras c where c.id = pg_temp.sid('evento', 'A5')
    and c.estado_recepcion = 'parcial' and c.cerrado_cantidad = 6 and c.notas_credito > 0 and c.estado_pago = 'pendiente';
  if v_n <> 1 then raise exception '[check abastecimiento] A5 no quedó como se diseñó (parcial, 6 cerradas, con nota de crédito)'; end if;
  select count(*) into v_n from compras where id::text like '5eed%' and estado_recepcion = 'sin_recibir' and estado = 'vigente';
  if v_n <> 5 then raise exception '[check abastecimiento] % compras sin recibir (se esperaban 5, dos con la fecha estimada vencida)', v_n; end if;

  -- (10) traslados: coherencia de estados, de números y de lo recibido contra lo que salió
  select count(*) into v_n from transferencias t where t.id::text like '5eed%'
    and ((t.estado = 'cerrada' and (t.cerrado_por is null or t.cerrado_en is null or t.confirmado_en is null))
      or (t.estado = 'en_transito' and (t.confirmado_en is not null or t.cerrado_en is not null))
      or (t.estado = 'recibido_con_diferencia' and (t.confirmado_en is null or t.cerrado_en is not null))
      or t.fecha_estimada_llegada <= t.created_at or t.confirmado_en < t.created_at or t.cerrado_en < t.confirmado_en);
  if v_n > 0 then raise exception '[check abastecimiento] % traslados con estado o fechas incoherentes', v_n; end if;
  select count(*) into v_n from transferencias t where t.id::text like '5eed%' and t.estado = 'cerrada'
    and (select coalesce(sum(m.cantidad), 0) from movimientos m join transferencia_recepciones tr on tr.id = m.transferencia_recepcion_id where tr.transferencia_id = t.id)
        <> (select coalesce(sum(tr.cantidad_recibida), 0) from transferencia_recepciones tr where tr.transferencia_id = t.id);
  if v_n > 0 then raise exception '[check abastecimiento] % traslados cerrados cuya entrada no es lo recibido', v_n; end if;
  select count(*) into v_n from (select numero from transferencias group by numero having count(*) > 1) z;
  if v_n > 0 then raise exception '[check abastecimiento] números de traslado repetidos'; end if;
  select count(*) into v_n from transferencia_items ti where ti.id::text like '5eed%' and ti.movimiento_id is null;
  if v_n > 0 then raise exception '[check abastecimiento] % líneas de traslado sin su movimiento de salida', v_n; end if;

  -- (11) forma de la carga inicial: entrada, sin usuario, lote ni compra; al almacén de la tienda o sin sububicación en el Taller
  select count(*) into v_n from movimientos m join ubicaciones u on u.id = m.ubicacion_id left join sububicaciones s on s.id = m.sububicacion_id
    join variantes v on v.id = m.variante_id
    where m.id::text like '5eed%' and m.motivo = 'carga_inicial'
      and (m.tipo <> 'entrada' or m.usuario_id is not null or m.lote_id is not null or m.compra_item_id is not null
           or (u.tipo = 'tienda' and s.tipo is distinct from 'almacen_tienda') or (u.tipo = 'taller' and m.sububicacion_id is not null)
           or m.created_at < v.created_at + interval '1 hour');
  if v_n > 0 then raise exception '[check abastecimiento] % cargas iniciales mal formadas', v_n; end if;

  -- (12) las subidas al piso siempre llevan persona, van dentro de la tienda y antes de abrir
  select count(*) into v_n from movimientos m where m.id::text like '5eed%' and m.motivo = 'movimiento_interno'
    and (m.usuario_id is null or m.ubicacion_destino_id <> m.ubicacion_id or m.sububicacion_id = m.sububicacion_destino_id
         or (m.created_at at time zone 'America/Lima')::time >= time '10:00');
  if v_n > 0 then raise exception '[check abastecimiento] % subidas al piso mal formadas', v_n; end if;

  -- (13) reparto por tienda: ninguna tienda recibe + cierra más de lo que le tocó (candado real de recibir_compras(),
  -- que NINGÚN trigger diferido revisa cuando se inserta directo en movimientos/compra_item_cierres — ver comentario
  -- de más arriba, junto al segundo `set constraints all immediate`)
  select count(*) into v_n from (
    select d.compra_item_id, d.ubicacion_id, d.cantidad as asignado,
           coalesce((select sum(m.cantidad) from movimientos m
                      where m.compra_item_id = d.compra_item_id and m.ubicacion_id = d.ubicacion_id), 0) as recibido,
           coalesce((select sum(k.cantidad) from compra_item_cierres k
                      where k.compra_item_id = d.compra_item_id and k.ubicacion_id = d.ubicacion_id), 0) as cerrado
    from compra_item_destinos d
    join compra_items i on i.id = d.compra_item_id
    where i.compra_id::text like '5eed%') x
  where x.recibido + x.cerrado > x.asignado;
  if v_n > 0 then raise exception '[check abastecimiento] % reparto(s) por tienda reciben/cierran más de lo asignado (recibir_compras() real lo habría rechazado)', v_n; end if;

  raise notice '[check abastecimiento] OK — % compras, % movimientos, % traslados',
    (select count(*) from compras where id::text like '5eed%'), (select count(*) from movimientos where id::text like '5eed%'),
    (select count(*) from transferencias where id::text like '5eed%');
end $$;

-- =============================================================================
-- FASE 4 — VENTAS, CAJA Y COMPROBANTES
-- Convierte la demanda de la Fase 2 (tmp_tickets/tmp_lineas) en ventas reales: cada tienda abre y cierra caja todos los
-- días de la ventana (una caja la abre un colaborador o un líder, la cierra SIEMPRE un líder — candado D-13, ya aplicado
-- en producción); las ventas del día cuelgan de esa caja; los pagos y los comprobantes siguen las reglas de
-- registrar_venta / emitir_comprobante, pero por INSERT directo (ninguna RPC acepta fecha).
-- =============================================================================

-- ---- 4.1 Medio de pago de cada ticket (efectivo 48 %, yape 24 %, plin 14 %, tarjeta 10 %, transferencia 5 %; el 8 % de
-- los tickets paga con dos medios, en vez de uno) ----
create temp table tmp_pago4 (ticket_id uuid, metodo text, monto numeric, recibido numeric) on commit drop;

create temp table tmp_ticket_total on commit drop as
select l.ticket_id, sum((l.precio_unitario - l.descuento_unitario) * l.cantidad) as total
from tmp_lineas l group by l.ticket_id;

create function pg_temp.metodo_por_umbral(u numeric) returns text language sql immutable as
$f$ select case when u < 0.48 then 'efectivo' when u < 0.72 then 'yape' when u < 0.86 then 'plin' when u < 0.96 then 'tarjeta' else 'transferencia' end $f$;

insert into tmp_pago4 (ticket_id, metodo, monto)
select t.ticket_id, m.metodo, m.monto
from tmp_ticket_total t
cross join lateral (
  select pg_temp.metodo_por_umbral(pg_temp.h('pago:' || t.ticket_id)) as metodo, t.total as monto
  where pg_temp.h('mix:' || t.ticket_id) >= 0.08
  union all
  select pg_temp.metodo_por_umbral(pg_temp.h('pagoA:' || t.ticket_id)),
         round(t.total * (0.35 + 0.30 * pg_temp.h('split:' || t.ticket_id)), 2)
  where pg_temp.h('mix:' || t.ticket_id) < 0.08
  union all
  select pg_temp.metodo_por_umbral(pg_temp.h('pagoB:' || t.ticket_id) * 0.8 + 0.2),  -- desplazado para que casi siempre salga distinto del medio A
         t.total - round(t.total * (0.35 + 0.30 * pg_temp.h('split:' || t.ticket_id)), 2)
  where pg_temp.h('mix:' || t.ticket_id) < 0.08
) m;

-- si el sorteo dejó los dos medios del ticket mixto iguales (raro, pero posible), se funden en una sola fila para no
-- violar ninguna regla de negocio (no es un error: simplemente ese ticket paga con un solo medio). El `recibido` se
-- calcula AQUÍ, sobre el monto ya fusionado — calcularlo antes (por mitad) y luego tomar el máximo podía dejarlo por
-- debajo del monto total una vez sumado, violando el CHECK real de venta_pagos.
create temp table tmp_pago4b on commit drop as
select ticket_id, metodo, sum(monto) as monto,
  -- redondeado al billete de S/10 más cercano por arriba (simplificación: no arma vuelto exacto con la denominación
  -- real de billetes/monedas; alcanza para que `recibido >= monto`, que es lo único que exige la base)
  case when metodo = 'efectivo' then ceil(sum(monto) / 10) * 10 end as recibido
from tmp_pago4 group by ticket_id, metodo;

do $$
declare v_n int;
begin
  select count(*) into v_n from (select ticket_id from tmp_pago4b group by ticket_id having count(*) > 2) x;
  if v_n > 0 then raise exception '[check ventas] % tickets con más de 2 medios de pago', v_n; end if;
end $$;

-- ---- 4.2 Cajas: una por tienda y día de la ventana (270 en el ensayo completo). Apertura S/150; el último día cierra
-- en el corte (turno cerrado), no a la hora normal, y si el corte cae antes de abrir, esa tienda no llega a abrir hoy ----
create temp table tmp_cajas on commit drop as
select pg_temp.sid('caja', t.codigo || ':' || d.fecha) as caja_id, t.ubicacion_id, t.codigo, d.fecha,
       ((d.fecha + d.abre) at time zone 'America/Lima') as abierta_en,
       least(((d.fecha + d.cierra) at time zone 'America/Lima'), w.corte) as cerrada_en
from tmp_tiendas t cross join tmp_dias d cross join tmp_v3 w
where least(((d.fecha + d.cierra) at time zone 'America/Lima'), w.corte) > ((d.fecha + d.abre) at time zone 'America/Lima');

do $$
declare v_n int; v_esp int;
begin
  select count(*) into v_n from tmp_cajas;
  select (select dias from tmp_v3) * 3 into v_esp;
  if v_n < v_esp - 3 or v_n > v_esp then
    raise exception '[check ventas] % cajas planificadas, se esperaban ~% (3 tiendas × días de la ventana)', v_n, v_esp;
  end if;
end $$;

-- ---- 4.3 Ventas: quién firma cada una (líder si el ticket lleva descuento manual — registrar_venta exige líder o
-- código de descuento y aquí no se siembra ningún código; el resto, cualquiera que opere esa tienda ese día) ----
create temp table tmp_venta_cab on commit drop as
select t.ticket_id, t.ubicacion_id, t.codigo, t.fecha, t.ts, c.caja_id,
       bool_or(l.manual) as necesita_lider
from tmp_tickets t
join tmp_cajas c on c.ubicacion_id = t.ubicacion_id and c.fecha = t.fecha
join tmp_lineas l on l.ticket_id = t.ticket_id
group by t.ticket_id, t.ubicacion_id, t.codigo, t.fecha, t.ts, c.caja_id;

do $$
declare v_n int;
begin
  select count(*) into v_n from tmp_tickets t where not exists (select 1 from tmp_venta_cab v where v.ticket_id = t.ticket_id);
  if v_n > 0 then raise exception '[check ventas] % tickets sin caja abierta ese día (la ventana de la caja no cubre su hora)', v_n; end if;
end $$;

alter table tmp_venta_cab add column usuario_id uuid;
update tmp_venta_cab v set usuario_id = pg_temp.firmante(v.ubicacion_id, v.fecha, v.necesita_lider, 'venta:' || v.ticket_id);

do $$
declare v_n int;
begin
  select count(*) into v_n from tmp_venta_cab where usuario_id is null;
  if v_n > 0 then raise exception '[check ventas] % ventas sin firmante elegible', v_n; end if;
end $$;

-- Las cajas se insertan ANTES que las ventas (ventas.caja_id las referencia por FK): apertura + efectivo de sus ventas
-- (todavía no hay ingresos/egresos ni cambios: eso es la Fase 5) — misma fórmula que cerrar_caja(). A1: una caja de TRU
-- cierra con faltante de S/38,50 y una de AQP con sobrante de S/12 (el líder contó distinto de lo que dice el sistema;
-- ninguna otra caja tiene diferencia).
create temp table tmp_caja_cierre on commit drop as
select c.caja_id, c.ubicacion_id, c.codigo, c.fecha, c.abierta_en, c.cerrada_en,
       150::numeric as apertura,
       150::numeric + coalesce((select sum(p.monto) from tmp_pago4b p join tmp_venta_cab v on v.ticket_id = p.ticket_id
                                where v.caja_id = c.caja_id and p.metodo = 'efectivo'), 0) as sistema,
       pg_temp.firmante(c.ubicacion_id, c.fecha, false, 'aperturacaja:' || c.caja_id) as abierta_por,
       pg_temp.firmante(c.ubicacion_id, c.fecha, true, 'cierrecaja:' || c.caja_id) as cerrada_por,
       row_number() over (partition by c.codigo order by c.fecha) as n_dia
from tmp_cajas c;

do $$
declare v_n int;
begin
  select count(*) into v_n from tmp_caja_cierre where abierta_por is null or cerrada_por is null;
  if v_n > 0 then raise exception '[check ventas] % cajas sin firmante elegible para abrir o cerrar', v_n; end if;
end $$;

insert into cajas (id, ubicacion_id, estado, monto_apertura, abierta_por, abierta_en, monto_cierre_sistema,
                   monto_cierre_real, diferencia, cerrada_por, cerrada_en)
select caja_id, ubicacion_id, 'cerrada', apertura, abierta_por, abierta_en, sistema,
       case when codigo = 'TRU' and n_dia = 45 then sistema - 38.50
            when codigo = 'AQP' and n_dia = 20 then sistema + 12
            else sistema end,
       case when codigo = 'TRU' and n_dia = 45 then -38.50
            when codigo = 'AQP' and n_dia = 20 then 12
            else 0 end,
       cerrada_por, cerrada_en
from tmp_caja_cierre;

insert into ventas (id, ubicacion_id, usuario_id, created_at, caja_id, estado)
select ticket_id, ubicacion_id, usuario_id, ts, caja_id, 'completada' from tmp_venta_cab;

-- ---- 4.4 Líneas de venta (de tmp_lineas, ya con sus descuentos calculados en la Fase 2) ----
insert into venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                         motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id)
select pg_temp.sid('vi', l.ticket_id || ':' || l.variante_id), l.ticket_id, l.variante_id, l.cantidad, l.precio_unitario,
       l.descuento_unitario, l.costo_unitario, l.motivo_descuento, l.motivo_descuento_detalle, l.argumento_descuento,
       l.descuento_etiqueta_id
from tmp_lineas l;

-- ---- 4.5 Movimientos de la venta: salida del piso de venta de esa tienda ----
insert into movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id, created_at)
select pg_temp.sid('mov', 'venta:' || l.ticket_id || ':' || l.variante_id), l.variante_id, v.ubicacion_id, u.sub_piso,
       'salida', l.cantidad, 'venta', pg_temp.sid('vi', l.ticket_id || ':' || l.variante_id), v.usuario_id, v.ts
from tmp_lineas l
join tmp_venta_cab v on v.ticket_id = l.ticket_id
join tmp_ubic u on u.ubicacion_id = v.ubicacion_id;

-- ---- 4.6 Pagos ----
insert into venta_pagos (id, venta_id, metodo, monto, recibido)
select pg_temp.sid('pago', p.ticket_id || ':' || p.metodo), p.ticket_id, p.metodo, p.monto, p.recibido from tmp_pago4b p;

do $$
declare v_n int;
begin
  select count(*) into v_n from (
    select t.ticket_id, t.total, sum(p.monto) pagado from tmp_ticket_total t join tmp_pago4b p on p.ticket_id = t.ticket_id
    group by t.ticket_id, t.total) x
  where round(x.total, 2) <> round(x.pagado, 2);
  if v_n > 0 then raise exception '[check ventas] % ventas donde los pagos no cuadran con el total', v_n; end if;
end $$;

-- ---- 4.7 Comprobantes: boleta o factura, solo TRU y AQP (LIM no tiene ninguna serie registrada — hallazgo previo del
-- preflight, no algo que este seed deba resolver). aceptado + sandbox, jamás pendiente/rechazado. El correlativo sale de
-- fn_reservar_numero_serie() en orden cronológico, la misma función que usa emitir_comprobante(): avanza de verdad
-- series_comprobantes.siguiente_numero (una fila normal, no una secuencia de Postgres — a diferencia del setval() de
-- transferencias, esto SÍ es transaccional y un ROLLBACK lo deshace sin dejar rastro).
do $$
declare
  r record; v_serie text; v_numero int; v_tipo text; v_items jsonb; v_sub numeric; v_igv numeric;
  v_doc_tipo text; v_doc_num text; v_doc_nombre text;
begin
  for r in
    select v.ticket_id, v.ubicacion_id, v.ts, v.usuario_id, t.total
    from tmp_venta_cab v join tmp_ticket_total t on t.ticket_id = v.ticket_id
    where v.codigo in ('TRU', 'AQP')
    order by v.ts, v.ticket_id
  loop
    if pg_temp.h('doc:' || r.ticket_id) < 0.04 then
      v_tipo := 'factura';
      v_doc_tipo := 'ruc';
      v_doc_num := '20' || lpad((abs(hashtext(r.ticket_id::text)) % 100000000)::text, 8, '0');
      v_doc_nombre := 'Empresa Demo ' || upper(substr(r.ticket_id::text, 1, 6));
    elsif pg_temp.h('dni:' || r.ticket_id) < 0.35 then
      v_tipo := 'boleta';
      v_doc_tipo := 'dni';
      v_doc_num := lpad((10000000 + abs(hashtext(r.ticket_id::text)) % 80000000)::text, 8, '0');
      v_doc_nombre := 'Clienta Demo ' || upper(substr(r.ticket_id::text, 1, 6));
    else
      v_tipo := 'boleta';
      v_doc_tipo := 'sin_documento';
      v_doc_num := null;
      v_doc_nombre := null;
    end if;

    select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(r.ubicacion_id, v_tipo);

    v_igv := round(r.total - r.total / 1.18, 2);
    v_sub := round(r.total - v_igv, 2);

    select jsonb_agg(jsonb_build_object('variante_id', vi.variante_id, 'cantidad', vi.cantidad,
             'precio_unitario', vi.precio_unitario, 'descuento_unitario', vi.descuento_unitario) order by vi.id)
      into v_items from venta_items vi where vi.venta_id = r.ticket_id;

    insert into comprobantes (id, venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
      cliente_nombre, moneda, subtotal, igv, total, estado, usuario_id, items, entorno_transmision, respuesta_sunat,
      created_at, enviado_at)
    values (pg_temp.sid('comp', r.ticket_id::text), r.ticket_id, r.ubicacion_id, v_tipo, v_serie, v_numero, v_doc_tipo,
      v_doc_num, v_doc_nombre, 'PEN', v_sub, v_igv, r.total, 'aceptado', r.usuario_id, v_items, 'sandbox',
      '{"seed": true}'::jsonb, r.ts, r.ts);
  end loop;
end $$;

-- ---- 4.8 Chequeos ----
do $$
declare v_productos int; v_n int; v_ventas int; v_comp int; v_cajas int;
begin
  select count(*) into v_ventas from ventas where id::text like '5eed%';
  select count(*) into v_comp from comprobantes where id::text like '5eed%';
  select count(*) into v_cajas from cajas where id::text like '5eed%';

  -- (1) ninguna venta llegó sin sus líneas, sus pagos o su movimiento de salida
  select count(*) into v_n from ventas v where v.id::text like '5eed%'
    and (not exists (select 1 from venta_items i where i.venta_id = v.id)
      or not exists (select 1 from venta_pagos p where p.venta_id = v.id)
      or not exists (select 1 from movimientos m where m.venta_item_id in (select id from venta_items i where i.venta_id = v.id)));
  if v_n > 0 then raise exception '[check ventas] % ventas incompletas (sin líneas, sin pago o sin movimiento)', v_n; end if;

  -- (2) los pagos de cada venta suman su total (igual que exige registrar_venta)
  select count(*) into v_n from (
    select v.id, round(coalesce((select sum(i.subtotal) from venta_items i where i.venta_id = v.id), 0), 2) as total,
           round(coalesce((select sum(p.monto) from venta_pagos p where p.venta_id = v.id), 0), 2) as pagado
    from ventas v where v.id::text like '5eed%') x
  where x.total <> x.pagado;
  if v_n > 0 then raise exception '[check ventas] % ventas donde Σ pagos ≠ Σ líneas', v_n; end if;

  -- (3) toda venta cae dentro del horario y de la caja de su ubicación (nunca fuera del rango abierta_en..cerrada_en)
  select count(*) into v_n from ventas v join cajas c on c.id = v.caja_id
    where v.id::text like '5eed%' and (v.created_at < c.abierta_en or v.created_at > c.cerrada_en or v.ubicacion_id <> c.ubicacion_id);
  if v_n > 0 then raise exception '[check ventas] % ventas fuera del horario o la ubicación de su caja', v_n; end if;

  -- (4) comprobante = total de la venta; ningún comprobante pendiente/rechazado; correlativos contiguos y sin huecos por serie
  select count(*) into v_n from comprobantes c join ventas v on v.id = c.venta_id
    where c.id::text like '5eed%' and round(c.total, 2) <> round((select sum(i.subtotal) from venta_items i where i.venta_id = v.id), 2);
  if v_n > 0 then raise exception '[check ventas] % comprobantes cuyo total no es el de su venta', v_n; end if;
  select count(*) into v_n from comprobantes where id::text like '5eed%' and estado not in ('aceptado');
  if v_n > 0 then raise exception '[check ventas] % comprobantes sembrados en un estado que no es aceptado', v_n; end if;
  select count(*) into v_n from (
    select tipo, serie, numero, count(*) from comprobantes where tipo in ('boleta', 'factura') group by 1, 2, 3 having count(*) > 1) z;
  if v_n > 0 then raise exception '[check ventas] números de comprobante repetidos'; end if;
  select count(*) into v_n from (
    select serie, numero, numero - lag(numero) over (partition by tipo, serie order by numero) as salto
    from comprobantes where tipo in ('boleta', 'factura')) x where salto > 1;
  if v_n > 0 then raise exception '[check ventas] % huecos en la numeración de comprobantes', v_n; end if;

  -- (5) ninguna venta sembrada con comprobante en Lima (no hay serie: si esto falla, alguien la agregó y hay que revisar)
  select count(*) into v_n from comprobantes c join ventas v on v.id = c.venta_id join ubicaciones u on u.id = v.ubicacion_id
    where c.id::text like '5eed%' and u.nombre = 'Tienda LIM';
  if v_n > 0 then raise exception '[check ventas] % comprobantes en LIM (esa tienda no tiene serie registrada)', v_n; end if;

  -- (6) firmantes: nadie firma antes de haber ingresado; cierre de caja y ventas con descuento manual, siempre líder
  select count(*) into v_n from (
    select v.id from ventas v join public.personas p on p.id = v.usuario_id
     where v.id::text like '5eed%' and p.fecha_ingreso > (v.created_at at time zone 'America/Lima')::date
    union all select c.id from cajas c join public.personas p on p.id in (c.abierta_por, c.cerrada_por)
     where c.id::text like '5eed%' and p.fecha_ingreso > (c.cerrada_en at time zone 'America/Lima')::date) f;
  if v_n > 0 then raise exception '[check ventas] % firmas anteriores al ingreso de quien firma', v_n; end if;
  select count(*) into v_n from cajas c where c.id::text like '5eed%'
    and not exists (select 1 from colaboradores k where k.persona_id = c.cerrada_por and k.rol = 'lider');
  if v_n > 0 then raise exception '[check ventas] % cierres de caja que no firmó un líder (candado D-13)', v_n; end if;
  select count(*) into v_n from tmp_venta_cab v where v.necesita_lider
    and not exists (select 1 from colaboradores k where k.persona_id = v.usuario_id and k.rol = 'lider');
  if v_n > 0 then raise exception '[check ventas] % ventas con descuento manual que no firmó un líder', v_n; end if;

  -- (7) cierre de caja = fórmula de cerrar_caja() (apertura + efectivo de sus ventas), y diferencia = real - sistema
  select count(*) into v_n from cajas c where c.id::text like '5eed%'
    and c.monto_cierre_sistema <> c.monto_apertura + coalesce((select sum(p.monto) from venta_pagos p join ventas v on v.id = p.venta_id
                                                                where v.caja_id = c.id and p.metodo = 'efectivo'), 0);
  if v_n > 0 then raise exception '[check ventas] % cajas cuyo cierre no sigue la fórmula de cerrar_caja()', v_n; end if;
  select count(*) into v_n from cajas where id::text like '5eed%' and round(diferencia, 2) <> round(monto_cierre_real - monto_cierre_sistema, 2);
  if v_n > 0 then raise exception '[check ventas] % cajas con diferencia mal calculada', v_n; end if;
  select count(*) into v_n from cajas where id::text like '5eed%' and diferencia <> 0;
  if v_n <> 2 then raise exception '[check ventas] % cajas con diferencia (se esperaban exactamente 2: A1)', v_n; end if;

  -- (8) mezcla de pagos (R-02-ish: transferencia baja, efectivo predominante) y de documento
  select round(100.0 * count(*) filter (where metodo = 'efectivo') / count(*)) into v_n from venta_pagos where id::text like '5eed%';
  if v_n < 40 or v_n > 56 then raise exception '[check ventas] % %% de pagos en efectivo (se esperaba 40-56 %%)', v_n; end if;
  select round(100.0 * count(*) filter (where cliente_tipo_doc = 'dni') / count(*)) into v_n from comprobantes where id::text like '5eed%' and tipo = 'boleta';
  if v_n < 28 or v_n > 42 then raise exception '[check ventas] % %% de boletas con DNI (se esperaba ~35 %%)', v_n; end if;
  select round(100.0 * count(*) filter (where tipo = 'factura') / count(*)) into v_n from comprobantes where id::text like '5eed%';
  if v_n < 1 or v_n > 8 then raise exception '[check ventas] % %% de comprobantes son factura (se esperaba ~4 %%)', v_n; end if;

  -- (9) no hay dos eventos del mismo bucket en el mismo instante (una venta y la subida que la abastece)
  select count(*) into v_n from (
    select variante_id, ubicacion_id, sububicacion_id, created_at from movimientos
    where id::text like '5eed%' and motivo in ('venta', 'movimiento_interno')
    group by 1, 2, 3, 4 having count(*) > 1) z;
  if v_n > 0 then raise exception '[check ventas] % instantes con dos movimientos del mismo bucket (venta/reposición)', v_n; end if;

  raise notice '[check ventas] OK — % ventas, % comprobantes, % cajas', v_ventas, v_comp, v_cajas;
end $$;

-- Sincroniza transferencias_numero_seq con el número más alto que quedó sembrado. Un INSERT con `numero` explícito nunca
-- llama a nextval(): sin esto, el primer «Iniciar traslado» real después del COMMIT pediría un número que una fila
-- sembrada ya ocupa (transferencias_numero_unique). SOLO corre si `cayla_seed.definitivo = 'true'` (ver el parámetro al
-- inicio): setval() no es transaccional, así que en cualquier ensayo con ROLLBACK esto debe quedar apagado.
do $$
begin
  if current_setting('cayla_seed.definitivo')::boolean then
    perform setval('transferencias_numero_seq', (select max(numero) from transferencias), true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ensayo: ROLLBACK. Para la corrida definitiva, Felipe cambia esta última
-- línea por COMMIT (y antepone `set search_path to retail, public;`).
-- ---------------------------------------------------------------------------
rollback;

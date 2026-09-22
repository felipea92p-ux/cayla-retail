-- ============================================================================
-- SEED LOCAL — CAYLA V2. Corre SOLO en `supabase db reset` / `supabase start`.
-- Datos 100% ficticios (adaptados de lab/retail-db/seeds/01_seed.sql).
--
-- CÓMO SE LLAMAN LAS RPC ACÁ SIN UNA SESIÓN HTTP REAL
-- Las funciones de V2 resuelven "quién soy" con auth.uid(), que lee la
-- variable de sesión request.jwt.claim.sub — normalmente la pone
-- PostgREST a partir del JWT real. Acá no hay JWT: se simula con
-- `set local request.jwt.claim.sub` dentro de una transacción, así las
-- mismas RPC que usa la app (registrar_venta, recibir_lote...) se prueban
-- de punta a punta desde el propio seed, no solo con INSERT directo.
-- ============================================================================

-- ==================== 1. usuario para entrar ====================
-- Mismo patrón que V1 (ver git tag cayla-v1-pre-retail-v2): credenciales
-- de desarrollo, a propósito obvias: felipe@cayla.local / cayla-local
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-000000000001',
  'authenticated', 'authenticated', 'felipe@cayla.local',
  extensions.crypt('cayla-local', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '22222222-2222-4222-8222-000000000002',
  '22222222-2222-4222-8222-000000000001',
  '22222222-2222-4222-8222-000000000001',
  '{"sub":"22222222-2222-4222-8222-000000000001","email":"felipe@cayla.local","email_verified":true}'::jsonb,
  'email', now(), now(), now()
) on conflict (id) do nothing;

-- ==================== 2. catálogo base (INSERT directo, sin RPC) ====================
-- `public.sedes`/`public.personas` son el STUB local de Dynamic
-- (0000_local_stub_dynamic.sql, fuera de git) — imitan lo que en
-- producción ya existe de verdad. Se siembran acá, con las mismas
-- credenciales obvias de siempre, para que fn_es_lider()/
-- fn_ubicacion_actual_persona() (0009_integracion_dynamic.sql) tengan
-- algo real que resolver.
insert into public.sedes (codigo, nombre, tipo, ciudad) values
  ('LIM', 'Tienda LIM', 'tienda', 'Lima'),
  ('TRU', 'Tienda TRU', 'tienda', 'Trujillo');

-- El Taller es tipo 'taller' desde 20260915130000_produccion_del_taller.sql:
-- es la única ubicación donde se abren órdenes de producción.
insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id)
select 'Taller', 'taller', null
union all
select 'Tienda Lima', 'tienda', id from public.sedes where codigo = 'LIM'
union all
select 'Tienda Trujillo', 'tienda', id from public.sedes where codigo = 'TRU';

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select id, 'Rack A', 'rack' from retail.ubicaciones where nombre = 'Taller'
union all
select id, 'Rack B', 'rack' from retail.ubicaciones where nombre = 'Taller';

-- Piso/almacén (20260914210000_inventario_piso_almacen.sql): solo las
-- tiendas los usan — Taller sigue con sus racks, sin esta distinción.
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select id, 'Piso de venta', 'piso_venta' from retail.ubicaciones where tipo = 'tienda'
union all
select id, 'Almacén de tienda', 'almacen_tienda' from retail.ubicaciones where tipo = 'tienda';

-- Cuarentena (20260917095000_cuarentena_prendas_danadas.sql): mismo criterio
-- que piso/almacén — solo tiendas, porque solo una tienda puede recibir una
-- devolución dañada (el Taller no vende a clientas).
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select id, 'Cuarentena', 'cuarentena' from retail.ubicaciones where tipo = 'tienda';

-- Series de boleta/factura por tienda — sin esto, `registrar_venta` revienta la
-- venta ENTERA en cuanto se pide un comprobante ("No hay una serie registrada
-- para boleta en esta ubicación"), porque emite el comprobante en la misma
-- transacción (0011_venta_con_comprobante.sql). Visto el 2026-09-12 al probar
-- Vender de punta a punta: ninguna tienda tenía serie, así que ninguna venta
-- con boleta o factura podía completarse en local. En producción esto lo carga
-- un Líder desde Facturación (RPC `registrar_serie`); acá se siembra directo
-- para no depender de esa pantalla solo para poder vender en desarrollo.
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
select u.id, s.tipo, s.serie, 1
from retail.ubicaciones u
cross join (values ('boleta', 'B001'), ('factura', 'F001')) as s(tipo, serie)
where u.tipo = 'tienda';

-- Felipe: 'admin' en el stub de Dynamic — fn_es_lider() lo mapea a líder
-- de retail (0009_integracion_dynamic.sql).
insert into public.personas (auth_user_id, nombres, apellidos, rol, sede_base_id)
select '22222222-2222-4222-8222-000000000001', 'Felipe', 'Alvarez', 'admin', id
from public.sedes where codigo = 'LIM'
on conflict (auth_user_id) do nothing;

-- Segunda persona, integrante (no líder) en OTRA ubicación — sin esto no
-- hay forma real de probar que RLS de verdad acota por ubicación y no
-- solo "funciona porque todo el mundo es líder". Mismo patrón de
-- credenciales obvias: micaela@cayla.local / cayla-local
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-000000000003',
  'authenticated', 'authenticated', 'micaela@cayla.local',
  extensions.crypt('cayla-local', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '22222222-2222-4222-8222-000000000004',
  '22222222-2222-4222-8222-000000000003',
  '22222222-2222-4222-8222-000000000003',
  '{"sub":"22222222-2222-4222-8222-000000000003","email":"micaela@cayla.local","email_verified":true}'::jsonb,
  'email', now(), now(), now()
) on conflict (id) do nothing;

-- Micaela: 'integrante' en el stub — fn_es_lider() la deja como
-- integrante de retail, acotada a su propia ubicación.
insert into public.personas (auth_user_id, nombres, apellidos, rol, sede_base_id)
select '22222222-2222-4222-8222-000000000003', 'Micaela', 'Vendedora', 'integrante', id
from public.sedes where codigo = 'TRU'
on conflict (auth_user_id) do nothing;

-- Colaboradores autorizados (0013): sin esto, NINGUNA de las dos cuentas
-- de prueba locales puede entrar — fn_tiene_acceso_retail() exige estar en
-- esta tabla, no solo activo en Dynamic. Producción tiene su propia lista
-- real (Felipe la definió, 2026-09-13), completamente aparte de este seed.
--
-- Roles (0016): Felipe queda Líder. Micaela queda Colaborador, fija a
-- Tienda Trujillo — es justo el caso que el comentario de arriba ya pedía
-- probar ("que RLS de verdad acota por ubicación y no solo funciona porque
-- todo el mundo es líder"), y que "control total temporal" (0012) había
-- vuelto imposible de probar hasta ahora.
insert into retail.colaboradores (persona_id, rol)
select id, 'lider' from public.personas where auth_user_id = '22222222-2222-4222-8222-000000000001'
on conflict (persona_id) do nothing;

insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id)
select p.id, 'colaborador', u.id
from public.personas p, retail.ubicaciones u
where p.auth_user_id = '22222222-2222-4222-8222-000000000003' and u.nombre = 'Tienda Trujillo'
on conflict (persona_id) do nothing;

insert into retail.proveedores (nombre, ruc, contacto) values
  ('Textiles Andina SAC', '20512345678', 'Jorge Ramos'),
  ('Confecciones del Sur EIRL', '20498765432', 'Lucía Paredes');

-- `on conflict do nothing`: el vocabulario cerrado real (20260912235500_vocabulario_cerrado.sql)
-- ya trae "Blusas", "Vestidos", "Pantalones", "Faldas" y los 5 colores de abajo con su
-- código real — este seed es solo demo local, no pisa esas filas si ya existen.
-- ON CONFLICT apunta al índice normalizado (20260915160000_categorias_editar_desactivar.sql):
-- el viejo `categorias_nombre_key` (unique plano) se eliminó porque no bloqueaba
-- duplicados por acento/mayúscula.
insert into retail.categorias (nombre) values
  ('Blusas'), ('Vestidos'), ('Pantalones'), ('Faldas'), ('Casacas')
  on conflict (retail.fn_clave_texto(nombre)) do nothing;

insert into retail.colores (codigo, nombre, hex) values
  ('NEG', 'Negro', '#1a1a18'),
  ('BLA', 'Blanco', '#f5f0e8'),
  ('BEI', 'Beige', '#d8c3a5'),
  ('AZM', 'Azul Marino', '#1f3a5f'),
  ('ROS', 'Rosa', '#e8a5b0')
  on conflict (codigo) do nothing;

-- `retail.clientas` (ficha de clienta v1, D-76/D-77, 20260922140000): un solo
-- campo de documento, sin distinguir dni/ruc/sin_documento (la tabla vieja
-- `retail.clientes` que esto reemplazaba sí lo hacía; la nueva no, a
-- propósito — decisión de Felipe de no ser invasivos). Sin consentimiento de
-- WhatsApp sembrado: sería inventar un permiso que nadie dio.
insert into retail.clientas (dni, nombre, telefono_whatsapp) values
  ('45612378', 'Valeria Chávez', '987111222'),
  ('41278965', 'Camila Torres', '987222333'),
  ('47891234', 'Daniela Ríos', '987333444'),
  ('40123987', 'Fernanda Quispe', '987444555'),
  ('48765123', 'Gabriela Salas', '987555666'),
  ('42987654', 'Andrea Cárdenas', '987666777'),
  ('46123789', 'Paola Mendoza', '987777888'),
  ('43219876', 'Rosa Delgado', '987888999'),
  ('20601234567', 'Boutique Mía SAC', '014567890');

-- ---------- tallas (vocabulario cerrado desde 20260917100000/100500) ----------
-- Nacen 'aprobado' directo, igual que los 30 colores de 20260912235500: son
-- datos de seed reales, no propuestas de un colaborador de prueba.
insert into retail.tallas (valor, estado) values
  ('S', 'aprobado'), ('M', 'aprobado'), ('L', 'aprobado'),
  ('28', 'aprobado'), ('30', 'aprobado'), ('32', 'aprobado'), ('34', 'aprobado')
on conflict do nothing;

-- ---------- productos + variantes (10 productos, ~48 variantes) ----------
insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Blusa Emma', 'Blusa manga larga, cuello redondo', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Camisas y Blusas';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'BLU-EMMA-' || c.codigo || '-' || t.valor, 79.90, 32.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Blusa Emma' and c.codigo in ('NEG', 'BEI') and t.valor in ('S', 'M', 'L');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Blusa Valentina', 'Blusa cropped manga corta', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Camisas y Blusas';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'BLU-VALE-' || c.codigo || '-' || t.valor, 69.90, 28.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Blusa Valentina' and c.codigo in ('BLA', 'ROS') and t.valor in ('S', 'M', 'L');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Vestido Sofía', 'Vestido midi con cinturón', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Vestidos';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'VES-SOFI-' || c.codigo || '-' || t.valor, 149.90, 58.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Vestido Sofía' and c.codigo in ('NEG', 'AZM') and t.valor in ('S', 'M', 'L');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Vestido Antonella', 'Vestido corto de tiras', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Vestidos';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'VES-ANTO-' || c.codigo || '-' || t.valor, 129.90, 50.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Vestido Antonella' and c.codigo = 'ROS' and t.valor in ('S', 'M', 'L');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Pantalón Carla', 'Pantalón recto tiro alto', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Pantalones';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'PAN-CARL-' || c.codigo || '-' || t.valor, 99.90, 40.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Pantalón Carla' and c.codigo in ('NEG', 'BEI') and t.valor in ('28', '30', '32', '34');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Pantalón Mía', 'Pantalón wide leg', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Pantalones';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'PAN-MIA-' || c.codigo || '-' || t.valor, 109.90, 44.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Pantalón Mía' and c.codigo = 'AZM' and t.valor in ('28', '30', '32');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Falda Renata', 'Falda midi plisada', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Faldas';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'FAL-RENA-' || c.codigo || '-' || t.valor, 74.90, 30.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Falda Renata' and c.codigo in ('NEG', 'BEI') and t.valor in ('S', 'M', 'L');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Falda Ariana', 'Falda corta acampanada', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Faldas';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'FAL-ARIA-' || c.codigo || '-' || t.valor, 64.90, 26.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Falda Ariana' and c.codigo = 'ROS' and t.valor in ('S', 'M');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Casaca Ximena', 'Casaca acolchada', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Casacas';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'CAS-XIME-' || c.codigo || '-' || t.valor, 179.90, 72.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Casaca Ximena' and c.codigo in ('NEG', 'AZM') and t.valor in ('S', 'M', 'L');

insert into retail.productos (categoria_id, referencia, descripcion, marca_id, proveedor_id)
select id, 'Casaca Luciana', 'Casaca de jean oversize', (select id from retail.marcas where nombre = 'CAYLA'), (select id from retail.proveedores where nombre = 'CAYLA SAC') from retail.categorias where nombre = 'Casacas';
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, c.codigo, t.id, 'CAS-LUCI-' || c.codigo || '-' || t.valor, 159.90, 64.00
from retail.productos p, retail.colores c, retail.tallas t
where p.referencia = 'Casaca Luciana' and c.codigo = 'BEI' and t.valor in ('M', 'L');

insert into retail.codigos_barras (variante_id, codigo, origen)
select v.id, '77501' || lpad((row_number() over (order by v.sku))::text, 8, '0'), 'fabrica'
from retail.variantes v join retail.productos p on p.id = v.producto_id
where p.referencia in ('Blusa Emma', 'Vestido Sofía');

-- ==================== 3. operación real, vía las MISMAS RPC que usa la app ====================
-- Se simula la sesión de Felipe (lider) para que fn_es_lider()/
-- fn_puede_operar_ubicacion() resuelvan igual que con una sesión real.
begin;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-000000000001';

do $$
declare
  ubic_almacen uuid; ubic_lima uuid; ubic_trujillo uuid;
  prov_andina uuid; prov_sur uuid;
  compra1_id uuid; compra2_id uuid; compra3_id uuid;
  venta1_id uuid; venta2_id uuid; venta3_id uuid;
  vi_vestido uuid; vi_pantalon uuid; vi_blusa_emma uuid;
  devolucion1_id uuid; conteo1_id uuid; cambio1_id uuid;
  caja_lima uuid; caja_trujillo uuid;
  sku_blu_emma_neg_m uuid; sku_blu_emma_neg_l uuid; sku_ves_sofi_neg_m uuid; sku_pan_carl_neg_30 uuid;
  sku_fal_rena_bei_m uuid; sku_cas_luci_bei_m uuid;
  cli_valeria uuid; cli_camila uuid;
  sub_piso_lima uuid; sub_almacen_lima uuid; sub_piso_trujillo uuid; sub_almacen_trujillo uuid;
  traslado1_id uuid; traslado2_id uuid; traslado1_items jsonb; traslado2_items jsonb; v_linea jsonb;
begin
  select id into ubic_almacen from retail.ubicaciones where nombre = 'Taller';
  select id into ubic_lima from retail.ubicaciones where nombre = 'Tienda Lima';
  select id into ubic_trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo';
  select id into prov_andina from retail.proveedores where nombre = 'Textiles Andina SAC';
  select id into prov_sur from retail.proveedores where nombre = 'Confecciones del Sur EIRL';
  select id into sub_piso_lima from retail.sububicaciones where ubicacion_id = ubic_lima and tipo = 'piso_venta';
  select id into sub_almacen_lima from retail.sububicaciones where ubicacion_id = ubic_lima and tipo = 'almacen_tienda';
  select id into sub_piso_trujillo from retail.sububicaciones where ubicacion_id = ubic_trujillo and tipo = 'piso_venta';
  select id into sub_almacen_trujillo from retail.sububicaciones where ubicacion_id = ubic_trujillo and tipo = 'almacen_tienda';

  -- ---------- compras: la factura es el eje (migración compras_desde_factura) ----------
  -- Factura 1 (Textiles Andina, AL CONTADO, líneas DETALLADAS por variante):
  -- el pago va en la misma llamada — al contado es obligatorio.
  select retail.registrar_compra(
    prov_andina, 'F001', '000210', 'contado', ubic_almacen,
    (select jsonb_agg(jsonb_build_object('producto_id', p.id, 'variante_id', v.id, 'cantidad', 20, 'costo_unitario', v.costo))
       from retail.variantes v join retail.productos p on p.id = v.producto_id
       where p.referencia in ('Blusa Emma', 'Blusa Valentina')),
    p_pago => jsonb_build_object('monto', (
        select round(sum(20 * v.costo) * 1.18, 2)
          from retail.variantes v join retail.productos p on p.id = v.producto_id
          where p.referencia in ('Blusa Emma', 'Blusa Valentina')),
      'metodo', 'transferencia', 'referencia', 'BCP-7781'),
    p_nota => 'Factura al contado, detallada por talla/color'
  ) into compra1_id;
  -- recepción completa de la factura 1, con su guía
  perform retail.recibir_compras(ubic_almacen,
    (select jsonb_agg(jsonb_build_object('compra_item_id', ci.id, 'variante_id', ci.variante_id, 'cantidad', ci.cantidad))
       from retail.compra_items ci where ci.compra_id = compra1_id),
    'GUIA-001-2026', 'Recepción completa F001-000210');

  -- Factura 2 (Confecciones del Sur, AL CRÉDITO a 30 días, líneas AGRUPADAS por
  -- modelo: el proveedor factura "Vestido Sofía x 30" sin desglosar talla/color).
  -- Sin pago: cae en "Por pagar".
  select retail.registrar_compra(
    prov_sur, 'F002', '001045', 'credito', ubic_almacen,
    (select jsonb_agg(jsonb_build_object('producto_id', x.id, 'descripcion', x.referencia || ' surtido', 'cantidad', 30 * x.n, 'costo_unitario', x.costo))
       from (select p.id, p.referencia, min(v.costo) as costo, count(v.id) as n
               from retail.productos p join retail.variantes v on v.producto_id = p.id
               where p.referencia in ('Vestido Sofía', 'Vestido Antonella', 'Casaca Ximena', 'Casaca Luciana')
               group by p.id, p.referencia) x),
    p_fecha_vencimiento => current_date + 30,
    p_nota => 'Factura al crédito, agrupada por modelo'
  ) into compra2_id;
  -- recepción PARCIAL de la factura 2: de cada modelo llega la mitad (15 por
  -- talla/color de 30), repartida por variante — acá se hace el desglose que
  -- la factura no trajo
  perform retail.recibir_compras(ubic_almacen,
    (select jsonb_agg(jsonb_build_object('compra_item_id', ci.id, 'variante_id', v.id, 'cantidad', 15))
       from retail.compra_items ci
       join retail.variantes v on v.producto_id = ci.producto_id
       where ci.compra_id = compra2_id),
    'GUIA-014-2026', 'Primera entrega F002-001045, falta la mitad');

  -- Factura 3 (Textiles Andina, crédito ya VENCIDO, sin recibir): para que
  -- "Por pagar" muestre una vencida desde el primer día.
  select retail.registrar_compra(
    prov_andina, 'F001', '000198', 'credito', ubic_lima,
    (select jsonb_agg(jsonb_build_object('producto_id', p.id, 'variante_id', v.id, 'cantidad', 10, 'costo_unitario', v.costo))
       from retail.variantes v join retail.productos p on p.id = v.producto_id
       where p.referencia in ('Pantalón Carla', 'Pantalón Mía')),
    p_fecha_emision => current_date - 45,
    p_fecha_vencimiento => current_date - 15,
    p_nota => 'Crédito vencido, pendiente de recibir'
  ) into compra3_id;
  -- un pago parcial contra la factura 3
  perform retail.registrar_pago_compra(compra3_id, 200.00, 'yape', 'YAPE-3391');

  -- mercadería sin factura (producción propia / ajuste): sigue existiendo recibir_lote
  perform retail.recibir_lote(ubic_almacen, prov_andina,
    (select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 18, 'costo_unitario', v.costo))
       from retail.variantes v join retail.productos p on p.id = v.producto_id
       where p.referencia in ('Pantalón Carla', 'Pantalón Mía', 'Falda Renata', 'Falda Ariana')),
    'GUIA-002-SIN-FACTURA', 'Mercadería adicional, sin factura');

  -- ---------- traslados (20260916150000_traslados_dos_fases.sql): dos fases,
  -- envío + confirmación limpia en el mismo momento — el seed no simula el
  -- viaje de 20 horas, deja el traslado ya "cerrado" para que el resto del
  -- guion (reposición de piso, ventas) siga viendo el stock en el almacén de
  -- destino como antes. iniciar_traslado() entrega al almacén de la tienda
  -- destino, nunca directo al piso — una venta necesita reposición explícita
  -- primero, igual que en la operación real.
  select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 6))
    into traslado1_items
    from retail.variantes v join retail.productos p on p.id = v.producto_id
    where p.referencia in ('Blusa Emma', 'Vestido Sofía', 'Pantalón Carla', 'Falda Renata', 'Casaca Ximena');
  traslado1_id := retail.iniciar_traslado(ubic_almacen, ubic_lima, traslado1_items, now() + interval '2 days', 'Reposición semanal Tienda Lima');
  for v_linea in select * from jsonb_array_elements(traslado1_items) loop
    perform retail.registrar_recepcion_traslado(traslado1_id, (v_linea ->> 'variante_id')::uuid, (v_linea ->> 'cantidad')::integer);
  end loop;
  perform retail.confirmar_traslado(traslado1_id);

  select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 5))
    into traslado2_items
    from retail.variantes v join retail.productos p on p.id = v.producto_id
    where p.referencia in ('Blusa Valentina', 'Vestido Antonella', 'Pantalón Mía', 'Falda Ariana', 'Casaca Luciana');
  traslado2_id := retail.iniciar_traslado(ubic_almacen, ubic_trujillo, traslado2_items, now() + interval '2 days', 'Primer envío Tienda Trujillo');
  for v_linea in select * from jsonb_array_elements(traslado2_items) loop
    perform retail.registrar_recepcion_traslado(traslado2_id, (v_linea ->> 'variante_id')::uuid, (v_linea ->> 'cantidad')::integer);
  end loop;
  perform retail.confirmar_traslado(traslado2_id);

  -- ---------- reposición de piso (20260914210000_inventario_piso_almacen.sql):
  -- deja 2 en piso / 4 en almacén por SKU (Trujillo: 2/3) para que la
  -- pantalla de Inventario tenga algo real que mostrar en ambas columnas.
  select id into sku_blu_emma_neg_m from retail.variantes where sku = 'BLU-EMMA-NEG-M';
  select id into sku_blu_emma_neg_l from retail.variantes where sku = 'BLU-EMMA-NEG-L';
  select id into sku_ves_sofi_neg_m from retail.variantes where sku = 'VES-SOFI-NEG-M';
  select id into sku_pan_carl_neg_30 from retail.variantes where sku = 'PAN-CARL-NEG-30';
  select id into sku_fal_rena_bei_m from retail.variantes where sku = 'FAL-RENA-BEI-M';
  select id into sku_cas_luci_bei_m from retail.variantes where sku = 'CAS-LUCI-BEI-M';

  perform retail.mover_interno(ubic_lima, sku_blu_emma_neg_m, 2, sub_almacen_lima, sub_piso_lima, 'Reposición de apertura');
  perform retail.mover_interno(ubic_lima, sku_blu_emma_neg_l, 2, sub_almacen_lima, sub_piso_lima, 'Reposición de apertura');
  perform retail.mover_interno(ubic_lima, sku_ves_sofi_neg_m, 2, sub_almacen_lima, sub_piso_lima, 'Reposición de apertura');
  perform retail.mover_interno(ubic_lima, sku_pan_carl_neg_30, 2, sub_almacen_lima, sub_piso_lima, 'Reposición de apertura');
  perform retail.mover_interno(ubic_lima, sku_fal_rena_bei_m, 2, sub_almacen_lima, sub_piso_lima, 'Reposición de apertura');
  perform retail.mover_interno(ubic_trujillo, sku_cas_luci_bei_m, 2, sub_almacen_trujillo, sub_piso_trujillo, 'Reposición de apertura');

  -- ---------- caja: se abre ANTES de vender (0008_caja_y_pagos.sql exige
  -- caja abierta) — Lima queda abierta a propósito (para probar "ver
  -- resumen"/"cerrar caja" con datos reales), Trujillo se cierra más abajo
  -- (para probar el flujo "abrir caja" desde cero como Micaela). ----------
  caja_lima := retail.abrir_caja(ubic_lima, 100.00);
  caja_trujillo := retail.abrir_caja(ubic_trujillo, 80.00);

  -- ---------- ventas (los sku_* ya se resolvieron arriba, para la reposición) ----------
  select id into cli_valeria from retail.clientas where nombre = 'Valeria Chávez';
  select id into cli_camila from retail.clientas where nombre = 'Camila Torres';

  -- Con boleta a propósito (las series se sembraron arriba): así el historial de
  -- Movimientos tiene una venta con comprobante que mostrar, no solo «Sin comprobante».
  venta1_id := retail.registrar_venta(ubic_lima,
    jsonb_build_array(jsonb_build_object('variante_id', sku_blu_emma_neg_m, 'cantidad', 1, 'precio_unitario', 79.90, 'descuento_unitario', 0)),
    jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 79.90)),
    cli_valeria, gen_random_uuid(), 'boleta');

  -- Pago MIXTO a propósito — es el caso que venta_pagos existe para resolver.
  venta2_id := retail.registrar_venta(ubic_lima,
    jsonb_build_array(
      -- motivo_descuento obligatorio desde 20260915140000_descuento_motivo_y_escalonado.sql
      jsonb_build_object('variante_id', sku_ves_sofi_neg_m, 'cantidad', 1, 'precio_unitario', 149.90, 'descuento_unitario', 15.00, 'motivo_descuento', 'cerrar_venta'),
      jsonb_build_object('variante_id', sku_pan_carl_neg_30, 'cantidad', 1, 'precio_unitario', 99.90, 'descuento_unitario', 0),
      jsonb_build_object('variante_id', sku_fal_rena_bei_m, 'cantidad', 1, 'precio_unitario', 74.90, 'descuento_unitario', 0)
    ),
    jsonb_build_array(
      jsonb_build_object('metodo', 'efectivo', 'monto', 100.00),
      jsonb_build_object('metodo', 'yape', 'monto', 209.70)
    ), cli_camila, gen_random_uuid());

  venta3_id := retail.registrar_venta(ubic_trujillo,
    jsonb_build_array(jsonb_build_object('variante_id', sku_cas_luci_bei_m, 'cantidad', 1, 'precio_unitario', 159.90, 'descuento_unitario', 10.00, 'motivo_descuento', 'liquidacion_temporada')),
    jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 149.90)),
    null, gen_random_uuid());

  -- ---------- caja: un ingreso, un egreso (retiro), y el cierre de Trujillo ----------
  perform retail.registrar_movimiento_caja(caja_lima, 'ingreso', 50.00, 'Vuelto adicional traído de casa');
  perform retail.registrar_movimiento_caja(caja_lima, 'egreso', 20.00, 'Retiro: compra de bolsas para empaque');
  perform retail.cerrar_caja(caja_trujillo, 219.90);
  -- 80 apertura + 149.90 tarjeta (no suma al efectivo) = 80.00 esperado en
  -- efectivo; se cuenta 219.90 a propósito para dejar una diferencia real
  -- de +139.90 y poder probar que el cuadre la detecta.

  -- ---------- cambio de talla: la blusa comprada en venta1 (M) se cambia por L ----------
  select id into vi_blusa_emma from retail.venta_items where venta_id = venta1_id and variante_id = sku_blu_emma_neg_m;
  cambio1_id := retail.registrar_cambio(vi_blusa_emma, ubic_lima, sku_blu_emma_neg_l, 1, null, gen_random_uuid());

  -- ---------- devolución parcial, con dos condiciones ----------
  select id into vi_vestido from retail.venta_items where venta_id = venta2_id and variante_id = sku_ves_sofi_neg_m;
  select id into vi_pantalon from retail.venta_items where venta_id = venta2_id and variante_id = sku_pan_carl_neg_30;

  devolucion1_id := retail.crear_devolucion(venta2_id, ubic_lima,
    jsonb_build_array(
      jsonb_build_object('venta_item_id', vi_vestido, 'cantidad', 1, 'condicion', 'vendible'),
      jsonb_build_object('venta_item_id', vi_pantalon, 'cantidad', 1, 'condicion', 'danada_reparacion')
    ), 'Clienta indicó talla incorrecta; el pantalón llegó con una costura suelta');
  perform retail.aprobar_devolucion(devolucion1_id, 149.90 - 15.00, 'yape');

  -- ---------- conteo con diferencia real, acotado al piso (Lima separa
  -- piso/almacén desde 20260914210000_inventario_piso_almacen.sql — un
  -- conteo de "toda la ubicación" ya no es válido ahí, hay que elegir) ----------
  conteo1_id := retail.abrir_conteo(ubic_lima, sub_piso_lima);
  perform retail.conteo_contar(conteo1_id, s.variante_id, s.cantidad)
    from retail.stock s
    where s.ubicacion_id = ubic_lima and s.sububicacion_id = sub_piso_lima and s.variante_id <> sku_blu_emma_neg_m;
  perform retail.conteo_contar(conteo1_id, sku_blu_emma_neg_m,
    (select cantidad - 1 from retail.stock
       where ubicacion_id = ubic_lima and sububicacion_id = sub_piso_lima and variante_id = sku_blu_emma_neg_m));
  perform retail.cerrar_conteo(conteo1_id);
end $$;

-- ---------- "Para liquidar" — UNA sola, global (corregido 2026-09-18) ----------
-- Versión anterior: una fila por sede con `sedes_permitidas` fija a esa
-- sede — mal diseño, no solo "visualmente confuso" (Felipe lo notó en la
-- pantalla: "por qué existen 4, uno solo y elegimos"). `sedes_permitidas`
-- NO es cosmético: `fn_variante_permitida_en_sede`, usada por
-- `registrar_venta`/`transferir`, BLOQUEA la venta/traslado de esa
-- variante en cualquier sede que no esté en la lista. "Para liquidar —
-- Tienda TRU" habría bloqueado sin querer la venta de esa misma prenda en
-- Tienda AQP, aunque AQP tuviera su propio stock fresco — mezclaba dos
-- problemas distintos (exclusividad real de venta vs. aviso informativo
-- de liquidación). Verificado antes de corregir: 0 variantes tenían
-- alguna de las 4 aplicada todavía, así que no hay nada que migrar.
-- Costo aceptado de ir a una sola etiqueta global: es puramente
-- cosmético — una prenda puede mostrarse "para liquidar" en una sede
-- donde en realidad no lo está. Se afina con vigencia/estilo visual más
-- adelante si hace falta, nunca con un candado de venta.
alter table retail.etiquetas disable trigger etiquetas_estado_biut;

insert into retail.etiquetas (nombre, estado, activo, notas)
values (
  'Para liquidar', 'aprobado', true,
  'Global a propósito — sedes_permitidas es un candado real que bloquea venta/traslado (ver registrar_venta/transferir), no algo cosmético. No restringir por sede acá: mezclaría "avisar que se liquida" con "prohibir vender en otra sede".'
)
on conflict (retail.fn_clave_texto(nombre)) do nothing;

alter table retail.etiquetas enable trigger etiquetas_estado_biut;

-- Estilo visual (20260918060000): esa migración clasifica "Para liquidar"
-- por nombre, pero corre ANTES que este seed (migraciones primero, seed
-- después) — acá todavía no existía la fila. Mismo criterio, aplicado
-- después de crearla.
update retail.etiquetas set estilo = 'urgencia' where nombre = 'Para liquidar';

commit;

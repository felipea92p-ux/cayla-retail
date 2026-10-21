-- Solo la pila propia cayla-pila-tienda-a (56122): datos para MIRAR el rediseño A. Nunca en la compartida ni en producción.
begin;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-000000000001';
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000001","role":"authenticated"}';
update retail.ubicaciones set whatsapp_numero = '967924072' where nombre = 'Tienda Trujillo';
update retail.ubicaciones set whatsapp_numero = '953585537' where nombre = 'Tienda Lima';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, horario, mostrar)
select id, 'Trujillo', 'Sinchi Roca 1043', 'Lunes a sábado, 08:30 a 20:15 · domingos, 09:30 a 18:15', true from retail.ubicaciones where nombre = 'Tienda Trujillo'
union all
select id, 'Lima', 'Av. de ejemplo 123', 'Lunes a sábado, 10:00 a 21:00', true from retail.ubicaciones where nombre = 'Tienda Lima'
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, horario = excluded.horario, mostrar = true;
-- Fotos públicas del almacén de producción (las mismas de las maquetas), por tipo de prenda.
with f(ref, uuid, orden) as (values
  ('Blusa Emma', '9afb4280-1866-466c-bad1-8a635f45bdea', 0),
  ('Blusa Valentina', '05de55d0-1588-4d45-b740-772a65d3b083', 0),
  ('Falda Ariana', '7704cde3-6d48-43d6-ae0d-89ab9aedf5af', 0),
  ('Falda Renata', 'eeb109f1-d55d-48dc-bfea-e2b5c469b740', 0),
  ('Falda Renata', '25f986b5-ed42-4923-bb39-4a08c1888f99', 1),
  ('Pantalón Carla', '6e022b5c-51ae-4ef1-87b5-10b4d69a5d20', 0),
  ('Pantalón Mía', '984f73d6-ce8f-45f2-b7b3-c42ae98f4f06', 0),
  ('Casaca Luciana', '396af535-07f0-4023-af93-d7edc6d6b5d8', 0)
)
insert into retail.producto_fotos (producto_id, url, orden, es_principal)
select p.id, 'https://vovjyyiafkxteijimpuy.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/' || f.uuid || '.jpg', f.orden, f.orden = 0
  from f join retail.productos p on p.referencia = f.ref
 where not exists (select 1 from retail.producto_fotos x where x.producto_id = p.id and x.url like '%' || f.uuid || '%');
select retail.vitrina_mostrar(array(select id from retail.productos where referencia <> 'Prenda sin Registrar'), true);
commit;
select jsonb_array_length(retail.tienda_catalogo(null) -> 'prendas') as prendas_en_la_web, jsonb_array_length(retail.tienda_sedes() -> 'sedes') as sedes_web;

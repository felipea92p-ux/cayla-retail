-- prueba-estados-imposibles.sql — acompaña a migracion-borrador-taxonomia-ideal.sql
-- Cómo se corre: sobre una base VACÍA donde ya corrió el borrador, con psql,
-- conectado por TCP a 127.0.0.1 sin contraseña (los casos de concurrencia abren
-- una segunda sesión con dblink). Al final imprime cuántos casos pasaron y
-- lista los que no. Cada caso anota una fila en `resultados`:
--   debe_fallar -> ok si la base lo rechaza (y muestra por qué)
--   debe_pasar  -> ok si la base lo acepta
--   verificar   -> ok si la condición es verdadera
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create extension if not exists dblink;

create temp table resultados (n serial, etiqueta text, ok boolean, detalle text);

create function pg_temp.debe_fallar(p_etiqueta text, p_sql text[]) returns void
language plpgsql as $f$
declare s text;
begin
  begin
    foreach s in array p_sql loop execute s; end loop;
    set constraints all immediate;
    raise exception 'NO_FALLO';
  exception when others then
    insert into resultados (etiqueta, ok, detalle)
    values (p_etiqueta, sqlerrm <> 'NO_FALLO',
            case when sqlerrm = 'NO_FALLO' then 'la base lo aceptó' else sqlerrm end);
  end;
end $f$;

create function pg_temp.debe_pasar(p_etiqueta text, p_sql text[]) returns void
language plpgsql as $f$
declare s text;
begin
  foreach s in array p_sql loop execute s; end loop;
  set constraints all immediate;
  insert into resultados (etiqueta, ok) values (p_etiqueta, true);
exception when others then
  insert into resultados (etiqueta, ok, detalle) values (p_etiqueta, false, sqlerrm);
end $f$;

create function pg_temp.verificar(p_etiqueta text, p_ok boolean) returns void
language sql as $f$
  insert into resultados (etiqueta, ok, detalle) values (p_etiqueta, coalesce(p_ok, false), case when p_ok then null else 'condición falsa' end);
$f$;

-- ---------------------------------------------------------------- fixture
insert into escalas_talla (id,codigo,nombre,sistema) values
 ('00000000-0000-0000-0000-000000000001','LETRAS','Letras','letras'),
 ('00000000-0000-0000-0000-000000000002','CALZADO_EU','Calzado','calzado_eu'),
 ('00000000-0000-0000-0000-000000000003','CONTENIDO','Contenido','contenido');
insert into tallas (id,escala_id,codigo,etiqueta,orden,es_clave) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','S','S',20,false),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001','M','M',30,true),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000001','L','L',40,false),
 ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-000000000001','XXL','XXL',60,false),
 ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-000000000002','37','37',37,false);
insert into tallas_sinonimos (escala_id,texto,talla_id) values
 ('00000000-0000-0000-0000-000000000001','2XL','00000000-0000-0000-0000-0000000000a4');
insert into colores values ('VIN','Vino','rojo','#7B1E2B',10,true),('BLA','Blanco','neutro','#FFFFFF',1,true);
insert into estampados values ('FLO','Floral',10,true);
insert into marcas (id,nombre,es_propia) values ('00000000-0000-0000-0000-0000000000b1','CAYLA',true);
insert into materiales_textiles values ('ALG','Algodon',false),('ELA','Elastano',true),('POL','Poliester',false);
insert into categorias (id,familia,nombre,prefijo,escala_talla_id,requiere_etiqueta_textil) values
 ('00000000-0000-0000-0000-0000000000c1','indumentaria','Vestidos','VES','00000000-0000-0000-0000-000000000001',true),
 ('00000000-0000-0000-0000-0000000000c3','indumentaria','Blusas','BLU','00000000-0000-0000-0000-000000000001',true),
 ('00000000-0000-0000-0000-0000000000c5','indumentaria','Faldas','FAL','00000000-0000-0000-0000-000000000001',true),
 ('00000000-0000-0000-0000-0000000000c7','indumentaria','Tops','TOP','00000000-0000-0000-0000-000000000001',true),
 ('00000000-0000-0000-0000-0000000000c9','indumentaria','Polos','PLO','00000000-0000-0000-0000-000000000001',true);
-- La hija dice 'calzado' a propósito: la base le pone la familia del padre.
insert into categorias (id,familia,nombre,prefijo,escala_talla_id,requiere_etiqueta_textil,categoria_padre_id) values
 ('00000000-0000-0000-0000-0000000000c2','calzado','Largos','VEL','00000000-0000-0000-0000-000000000001',true,'00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c6','indumentaria','Cortas','FAC','00000000-0000-0000-0000-000000000001',true,'00000000-0000-0000-0000-0000000000c5');
select pg_temp.verificar('la hija hereda la familia del padre', (select familia = 'indumentaria' from categorias where id='00000000-0000-0000-0000-0000000000c2'));

insert into productos (id,codigo,referencia,categoria_id,escala_talla_id,publico,marca_id,origen,tipo_surtido) values
 ('00000000-0000-0000-0000-0000000000d1','VEL-0001','Vestido Aurora','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','basico'),
 ('00000000-0000-0000-0000-0000000000d2','BLU-0001','Blusa Lino','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','basico');
insert into producto_colores (id,producto_id,codigo,nombre_comercial,color_principal,color_secundario_1,estampado_codigo) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','FLV','Flores vino','VIN','BLA','FLO');
insert into producto_colores (id,producto_id,codigo,nombre_comercial,color_principal) values
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','BLA','Blanco','BLA');
-- Sin código: lo compone la base.
insert into variantes (id,producto_id,producto_color_id,escala_talla_id,talla_id) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2');
select pg_temp.verificar('el código de variante lo compone la base', (select codigo = 'VEL-0001-FLV-S' from variantes where id='00000000-0000-0000-0000-0000000000f1'));

insert into sedes_dynamic (id,codigo,nombre,tipo) values
 ('00000000-0000-0000-0000-000000000101','TRU','Trujillo','tienda'),
 ('00000000-0000-0000-0000-000000000102','AQP','Arequipa','tienda'),
 ('00000000-0000-0000-0000-000000000103','LIM','Taller Lima','fabrica');
insert into ubicaciones (id,sede_dynamic_id,nombre,tipo) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000101','Tienda TRU','tienda'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000102','Tienda AQP','tienda'),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000103','Taller','taller');
insert into sububicaciones (id,ubicacion_id,tipo,nombre) values
 ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000012','piso_venta','Piso AQP'),
 ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000012','almacen_tienda','Almacen AQP'),
 ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000012','no_vendible','Fallas AQP'),
 ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000011','piso_venta','Piso TRU'),
 ('00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000013','general','General Taller');
insert into motivos_movimiento (codigo,nombre,tipos_permitidos,sunat_tabla12,lleva_costo,es_sistema,origen_requerido) values
 ('carga_inicial','Carga inicial',array['entrada'],'16',false,true,'ninguno'),
 ('compra','Compra',array['entrada'],'02',true,true,'compra_item'),
 ('venta','Venta',array['salida'],'01',false,true,'venta_item'),
 ('movimiento_interno','Interno',array['traslado'],null,false,true,'ninguno'),
 ('danada_piso','Dañada en piso',array['traslado'],null,false,false,'ninguno'),
 ('merma','Merma',array['ajuste'],null,false,false,'ninguno');
insert into precios (variante_id,tipo,monto,vigencia) values
 ('00000000-0000-0000-0000-0000000000f1','regular',89.90,tstzrange(now() - interval '30 days',null)),
 ('00000000-0000-0000-0000-0000000000f2','regular',89.90,tstzrange(now() - interval '30 days',null));

-- ---------------------------------------------------------------- A · catálogo e identidad
select pg_temp.debe_fallar('producto colgado de una categoría con subcategorías', array[
 $q$insert into productos (codigo,referencia,categoria_id,escala_talla_id,publico,marca_id,origen,tipo_surtido) values ('VES-0001','Vestido X','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','basico')$q$]);
select pg_temp.debe_fallar('código de producto con el prefijo de otra categoría', array[
 $q$insert into productos (codigo,referencia,categoria_id,escala_talla_id,publico,marca_id,origen,tipo_surtido) values ('ZZZ-0001','Vestido Z','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','basico')$q$]);
select pg_temp.debe_fallar('misma combinación de colores con otro código de opción', array[
 $q$insert into producto_colores (producto_id,codigo,nombre_comercial,color_principal,color_secundario_1,estampado_codigo) values ('00000000-0000-0000-0000-0000000000d1','FLX','Flores vino 2','VIN','BLA','FLO')$q$]);
select pg_temp.debe_fallar('variante duplicada (misma opción y talla)', array[
 $q$insert into variantes (producto_id,producto_color_id,escala_talla_id,talla_id) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a2')$q$]);
select pg_temp.debe_fallar('código de variante que dice L para una talla S', array[
 $q$insert into variantes (producto_id,producto_color_id,escala_talla_id,talla_id,codigo) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','VEL-0001-FLV-S')$q$]);
select pg_temp.debe_fallar('código de variante de otro modelo (ZZZ-9999-BLA-L)', array[
 $q$insert into variantes (producto_id,producto_color_id,escala_talla_id,talla_id,codigo) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a3','ZZZ-9999-BLA-L')$q$]);
select pg_temp.debe_fallar('cambiar la talla de una variante', array[
 $q$update variantes set talla_id='00000000-0000-0000-0000-0000000000a3' where id='00000000-0000-0000-0000-0000000000f2'$q$]);
select pg_temp.debe_fallar('cambiar el prefijo de una categoría con productos', array[
 $q$update categorias set prefijo='VLG' where id='00000000-0000-0000-0000-0000000000c2'$q$]);
select pg_temp.debe_fallar('cambiar la familia del PADRE cuando una hija tiene productos', array[
 $q$update categorias set familia='calzado' where id='00000000-0000-0000-0000-0000000000c1'$q$]);
select pg_temp.debe_pasar('cambiar la familia de un padre sin productos en sus hijas', array[
 $q$update categorias set familia='accesorios' where id='00000000-0000-0000-0000-0000000000c5'$q$]);
select pg_temp.verificar('la familia nueva se propaga a la hija', (select familia = 'accesorios' from categorias where id='00000000-0000-0000-0000-0000000000c6'));
select pg_temp.debe_fallar('QR cayla_corto que no es el código de su variante', array[
 $q$insert into codigos_barras (variante_id,codigo,tipo) values ('00000000-0000-0000-0000-0000000000f1','VEL-0001-FLV-M','cayla_corto')$q$]);
select pg_temp.debe_pasar('QR cayla_corto igual al código de su variante', array[
 $q$insert into codigos_barras (variante_id,codigo,tipo,es_principal) values ('00000000-0000-0000-0000-0000000000f1','VEL-0001-FLV-S','cayla_corto',true)$q$]);
select pg_temp.debe_fallar('EAN-13 con dígito verificador malo', array[
 $q$insert into codigos_barras (variante_id,codigo,tipo) values ('00000000-0000-0000-0000-0000000000f2','7750100000007','ean13')$q$]);
select pg_temp.debe_pasar('EAN-13 válido', array[
 $q$insert into codigos_barras (variante_id,codigo,tipo) values ('00000000-0000-0000-0000-0000000000f2','7750100000006','ean13')$q$]);
select pg_temp.debe_fallar('el mismo GTIN registrado como 14 dígitos', array[
 $q$insert into codigos_barras (variante_id,codigo,tipo) values ('00000000-0000-0000-0000-0000000000f1','07750100000006','gtin14')$q$]);
select pg_temp.debe_fallar('RCN 04 guardado como EAN-13', array[
 $q$insert into codigos_barras (variante_id,codigo,tipo) values ('00000000-0000-0000-0000-0000000000f1','0400000000009','ean13')$q$]);

-- ---------------------------------------------------------------- B · tallas y temporadas
select pg_temp.debe_fallar('2XL como talla nueva cuando ya es sinónimo de XXL', array[
 $q$insert into tallas (escala_id,codigo,etiqueta,orden) values ('00000000-0000-0000-0000-000000000001','2XL','2XL',61)$q$]);
select pg_temp.debe_fallar('código de talla con separador (10-12)', array[
 $q$insert into tallas (escala_id,codigo,etiqueta,orden) values ('00000000-0000-0000-0000-000000000001','10-12','10-12',70)$q$]);
select pg_temp.debe_pasar('talla 1012 que se lee "10-12" y talla 50ML de contenido', array[
 $q$insert into tallas (escala_id,codigo,etiqueta,orden) values ('00000000-0000-0000-0000-000000000001','1012','10-12',70)$q$,
 $q$insert into tallas (escala_id,codigo,etiqueta,orden) values ('00000000-0000-0000-0000-000000000003','50ML','50 ml',50)$q$]);
select pg_temp.debe_fallar('mover de puesto en la curva una talla que ya tiene prendas', array[
 $q$update tallas set orden = 25 where id='00000000-0000-0000-0000-0000000000a1'$q$]);
insert into temporadas (id,codigo,nombre,anio,tipo,inicio_venta,fin_venta) values
 ('00000000-0000-0000-0000-000000000061','PV27','Primavera-verano 2027',2027,'verano','2027-01-01','2027-03-31');
insert into productos (id,codigo,referencia,categoria_id,escala_talla_id,publico,marca_id,origen,tipo_surtido,temporada_lanzamiento_id) values
 ('00000000-0000-0000-0000-0000000000d3','VEL-0002','Vestido Brisa','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','temporada','00000000-0000-0000-0000-000000000061');
select pg_temp.debe_fallar('mover el inicio de venta de una temporada con productos', array[
 $q$update temporadas set inicio_venta='2027-01-15' where id='00000000-0000-0000-0000-000000000061'$q$]);
select pg_temp.debe_pasar('mover el fin de venta (es plan)', array[
 $q$update temporadas set fin_venta='2027-04-15' where id='00000000-0000-0000-0000-000000000061'$q$]);

-- ---------------------------------------------------------------- C · composición y etiqueta textil
select pg_temp.debe_fallar('composición que suma 90%', array[
 $q$insert into composiciones (producto_id,material_codigo,porcentaje) values ('00000000-0000-0000-0000-0000000000d1','ALG',90)$q$]);
select pg_temp.debe_pasar('composición 95 + 5 en principal y 100 en forro', array[
 $q$insert into composiciones (producto_id,material_codigo,porcentaje) values ('00000000-0000-0000-0000-0000000000d1','ALG',95),('00000000-0000-0000-0000-0000000000d1','ELA',5)$q$,
 $q$insert into composiciones (producto_id,parte,material_codigo,porcentaje) values ('00000000-0000-0000-0000-0000000000d1','forro','POL',100)$q$]);
select pg_temp.debe_fallar('mover el elastano del principal al forro (principal queda en 95)', array[
 $q$update composiciones set parte='forro', porcentaje=5 where material_codigo='ELA'$q$,
 $q$update composiciones set porcentaje=95 where parte='forro' and material_codigo='POL'$q$]);
select pg_temp.debe_fallar('composición de color y de modelo para la misma pieza y parte', array[
 $q$insert into composiciones (producto_id,producto_color_id,material_codigo,porcentaje) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','POL',100)$q$]);
select pg_temp.debe_fallar('modelo vigente de categoría con etiqueta textil sin composición', array[
 $q$update productos set estado='vigente' where id='00000000-0000-0000-0000-0000000000d2'$q$]);
select pg_temp.debe_pasar('modelo vigente con composición de su única opción', array[
 $q$insert into composiciones (producto_id,producto_color_id,material_codigo,porcentaje) values ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000e2','ALG',100)$q$,
 $q$update productos set estado='vigente' where id='00000000-0000-0000-0000-0000000000d2'$q$]);
select pg_temp.debe_fallar('opción nueva sin composición en un modelo vigente', array[
 $q$insert into producto_colores (producto_id,codigo,nombre_comercial,color_principal) values ('00000000-0000-0000-0000-0000000000d2','VIN','Vino','VIN')$q$]);

-- ---------------------------------------------------------------- D · precios
select pg_temp.debe_fallar('segundo precio regular encimado', array[
 $q$insert into precios (variante_id,tipo,monto,vigencia) values ('00000000-0000-0000-0000-0000000000f2','regular',99.90,tstzrange(now(),null))$q$]);
select pg_temp.debe_fallar('precio regular de una sola sede', array[
 $q$insert into precios (variante_id,ubicacion_id,tipo,monto,vigencia) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000012','regular',79.90,tstzrange(now() + interval '60 days',null))$q$]);
select pg_temp.debe_fallar('"rebaja" mayor que el regular vigente', array[
 $q$insert into precios (variante_id,tipo,monto,vigencia,motivo) values ('00000000-0000-0000-0000-0000000000f2','rebaja',99.90,tstzrange(now() - interval '1 day', now() + interval '5 days'),'x')$q$]);
select pg_temp.debe_pasar('rebaja nacional menor que el regular', array[
 $q$insert into precios (variante_id,tipo,monto,vigencia,motivo) values ('00000000-0000-0000-0000-0000000000f2','rebaja',59.90,tstzrange(now() - interval '1 day', now() + interval '5 days'),'fin de temporada')$q$]);
select pg_temp.debe_pasar('liquidación en AQP y en TRU a la vez', array[
 $q$insert into precios (variante_id,ubicacion_id,tipo,monto,vigencia,motivo) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','liquidacion',69.90,tstzrange(now() + interval '10 days', now() + interval '20 days'),'sobran')$q$,
 $q$insert into precios (variante_id,ubicacion_id,tipo,monto,vigencia,motivo) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000011','liquidacion',69.90,tstzrange(now() + interval '10 days', now() + interval '20 days'),'sobran')$q$]);
select pg_temp.debe_fallar('dos descuentos encimados en la misma sede', array[
 $q$insert into precios (variante_id,ubicacion_id,tipo,monto,vigencia,motivo) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','rebaja',65.00,tstzrange(now() + interval '12 days', now() + interval '15 days'),'x')$q$]);
select pg_temp.debe_fallar('rebaja nacional encimada con una liquidación de sede', array[
 $q$insert into precios (variante_id,tipo,monto,vigencia,motivo) values ('00000000-0000-0000-0000-0000000000f1','rebaja',65.00,tstzrange(now() + interval '11 days', now() + interval '13 days'),'x')$q$]);
select pg_temp.debe_fallar('editar el monto de un precio', array[
 $q$update precios set monto=1 where variante_id='00000000-0000-0000-0000-0000000000f1' and tipo='regular'$q$]);
select pg_temp.debe_fallar('cerrar un precio con fecha pasada', array[
 $q$update precios set vigencia=tstzrange(lower(vigencia), now() - interval '10 days') where variante_id='00000000-0000-0000-0000-0000000000f1' and tipo='regular'$q$]);
select pg_temp.debe_pasar('cerrar un precio desde hoy en adelante', array[
 $q$update precios set vigencia=tstzrange(lower(vigencia), now() + interval '40 days') where variante_id='00000000-0000-0000-0000-0000000000f1' and tipo='regular'$q$]);

-- ---------------------------------------------------------------- E · línea de venta
insert into ventas (id,ubicacion_id,ocurrido_en) values
 ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000012', now() - interval '1 hour'),
 ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000012', now() - interval '30 minutes'),
 ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000012', now() - interval '20 minutes');
select pg_temp.debe_fallar('línea de la variante S que dice talla M', array[
 $q$insert into venta_items (venta_id,tipo_linea,variante_id,talla_id,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000031','prenda','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2',1,'NIU','10',0.18,76.19,13.71)$q$]);
select pg_temp.debe_fallar('línea con el precio de otra prenda', array[
 $q$insert into venta_items (venta_id,tipo_linea,variante_id,precio_id,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) select '00000000-0000-0000-0000-000000000031','prenda','00000000-0000-0000-0000-0000000000f1',p.id,1,'NIU','10',0.18,76.19,13.71 from precios p where p.variante_id='00000000-0000-0000-0000-0000000000f2' and p.tipo='regular'$q$]);
select pg_temp.debe_fallar('línea con la categoría padre en vez de la hoja', array[
 $q$insert into venta_items (venta_id,tipo_linea,variante_id,categoria_id,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000031','prenda','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1',1,'NIU','10',0.18,76.19,13.71)$q$]);
select pg_temp.debe_fallar('línea con un monto a 9,90 cuando la etiqueta dice 89,90', array[
 $q$insert into venta_items (venta_id,tipo_linea,variante_id,precio_unitario,precio_regular_unitario,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000031','prenda','00000000-0000-0000-0000-0000000000f1',9.90,9.90,1,'NIU','10',0.18,8.39,1.51)$q$]);
select pg_temp.debe_pasar('línea de prenda: la copia congelada la escribe la base', array[
 $q$insert into venta_items (id,venta_id,tipo_linea,variante_id,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000031','prenda','00000000-0000-0000-0000-0000000000f1',1,'NIU','10',0.18,76.19,13.71)$q$,
 $q$insert into venta_items (id,venta_id,tipo_linea,variante_id,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000032','prenda','00000000-0000-0000-0000-0000000000f2',1,'NIU','10',0.18,50.76,9.14)$q$,
 $q$insert into venta_items (id,venta_id,tipo_linea,variante_id,cantidad,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000043','00000000-0000-0000-0000-000000000033','prenda','00000000-0000-0000-0000-0000000000f1',1,'NIU','10',0.18,76.19,13.71)$q$]);
select pg_temp.verificar('copia de la S: talla S, hoja Largos, padre Vestidos, indumentaria, regular 89,90',
 (select t.codigo = 'S' and vi.categoria_id = '00000000-0000-0000-0000-0000000000c2' and vi.categoria_padre_id = '00000000-0000-0000-0000-0000000000c1'
         and vi.familia = 'indumentaria' and vi.tipo_precio = 'regular' and vi.precio_unitario = 89.90 and vi.descripcion_impresa = 'Vestido Aurora Flores vino S'
  from venta_items vi join tallas t on t.id = vi.talla_id where vi.id = '00000000-0000-0000-0000-000000000041'));
select pg_temp.verificar('copia de la M en rebaja: tipo rebaja, 59,90, regular de referencia 89,90',
 (select tipo_precio = 'rebaja' and precio_unitario = 59.90 and precio_regular_unitario = 89.90 from venta_items where id = '00000000-0000-0000-0000-000000000042'));
select pg_temp.debe_pasar('línea de cargo sin variante', array[
 $q$insert into venta_items (venta_id,tipo_linea,cantidad,descripcion_impresa,precio_regular_unitario,precio_unitario,costo_unitario,motivo_descuento,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto) values ('00000000-0000-0000-0000-000000000031','cargo',1,'Cargo especial',10,10,0,'monto manual','NIU','10',0.18,8.47,1.53)$q$]);
select pg_temp.debe_fallar('GTIN-13 declarado con 12 dígitos', array[
 $q$insert into venta_items (venta_id,tipo_linea,cantidad,descripcion_impresa,precio_regular_unitario,precio_unitario,costo_unitario,motivo_descuento,unidad_sunat,tipo_afectacion_igv,igv_tasa,base_imponible,igv_monto,gtin_esquema,gtin_codigo) values ('00000000-0000-0000-0000-000000000031','cargo',1,'x',10,10,0,'x','NIU','10',0.18,8.47,1.53,'GTIN-13','775010000006')$q$]);
select pg_temp.debe_fallar('cerrar hacia atrás el regular de la M, por debajo de una venta ya cobrada', array[
 $q$update precios set vigencia=tstzrange(lower(vigencia), now() - interval '2 hours') where variante_id='00000000-0000-0000-0000-0000000000f2' and tipo='regular'$q$]);

-- ---------------------------------------------------------------- F · devoluciones y demanda
insert into motivos_devolucion (codigo,nombre,senala_horma) values ('talla_grande','Le quedó grande',true);
insert into devoluciones (id,venta_id,ubicacion_id) values
 ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000012'),
 ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000012');
select pg_temp.debe_pasar('devolver la única unidad vendida', array[
 $q$insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo,escala_talla_id,talla_sugerida_id) values ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000041',1,'vendible','talla_grande','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1')$q$]);
select pg_temp.debe_fallar('devolver otra vez la misma unidad en otra devolución', array[
 $q$insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo) values ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000041',5,'vendible','talla_grande')$q$]);
select pg_temp.debe_fallar('devolver en la venta 1 una línea de la venta 2', array[
 $q$insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo) values ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000042',1,'vendible','talla_grande')$q$]);
select pg_temp.debe_fallar('talla sugerida de calzado para un vestido', array[
 $q$insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo,escala_talla_id,talla_sugerida_id) values ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000041',1,'vendible','talla_grande','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a9')$q$]);
select pg_temp.debe_fallar('talla sugerida 37 declarada como si fuera de la escala de letras', array[
 $q$insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo,escala_talla_id,talla_sugerida_id) values ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000041',1,'vendible','talla_grande','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a9')$q$]);
select pg_temp.debe_fallar('demanda no atendida de talla 37 declarada en la escala del vestido', array[
 $q$insert into demanda_no_atendida (ubicacion_id,producto_id,producto_color_id,escala_talla_id,talla_id) values ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a9')$q$]);
select pg_temp.debe_fallar('demanda no atendida de talla 37 en un vestido', array[
 $q$insert into demanda_no_atendida (ubicacion_id,producto_id,producto_color_id,escala_talla_id,talla_id) values ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a9')$q$]);

-- ---------------------------------------------------------------- G · libro de movimientos
select pg_temp.debe_fallar('motivo creado a mano como salida ("venta_pos")', array[
 $q$insert into motivos_movimiento (codigo,nombre,tipos_permitidos,es_sistema,origen_requerido) values ('venta_pos','Venta POS',array['salida'],false,'ninguno')$q$]);
select pg_temp.debe_pasar('carga inicial de 4 S en el piso de AQP', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','entrada',4,'carga_inicial',now())$q$]);
select pg_temp.debe_fallar('salida por venta sin línea de venta', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','salida',1,'venta',now())$q$]);
select pg_temp.debe_fallar('merma pegada a una línea de venta', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en,venta_item_id) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','ajuste',-1,'merma',now(),'00000000-0000-0000-0000-000000000041')$q$]);
select pg_temp.debe_fallar('compra sin ítem de compra', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000022','entrada',4,'compra',now())$q$]);
select pg_temp.debe_fallar('compra con ítem pero sin capa de costo (al cerrar la transacción)', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en,compra_item_id) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000022','entrada',4,'compra',now(),gen_random_uuid())$q$]);
select pg_temp.debe_pasar('compra con ítem y su fila en costo_historial', array[
 $q$insert into movimientos (id,variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en,compra_item_id) values ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000022','entrada',4,'compra',now(),gen_random_uuid())$q$,
 $q$insert into costo_historial (variante_id,stock_previo,costo_anterior,cantidad_nueva,costo_unitario_nuevo,costo_resultante,origen,movimiento_id) values ('00000000-0000-0000-0000-0000000000f1',4,30,4,32,31,'compra','00000000-0000-0000-0000-000000000081')$q$]);
select pg_temp.debe_fallar('traslado instantáneo del piso de AQP al piso de TRU', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,sububicacion_destino_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000023','traslado',1,'movimiento_interno',now())$q$]);
select pg_temp.debe_fallar('editar una composición de prendas que ya se movieron', array[
 $q$delete from composiciones where producto_id='00000000-0000-0000-0000-0000000000d1' and parte='forro'$q$]);

-- Saldo en el tiempo (M en AQP): 4 al piso, 2 al almacén, 2 a fallas.
select pg_temp.debe_pasar('movimientos de la M: 4 al piso, 2 al almacén, 2 a no vendible', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','entrada',4,'carga_inicial',now() - interval '3 minutes')$q$,
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,sububicacion_destino_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022','traslado',2,'movimiento_interno',now() - interval '2 minutes')$q$,
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,sububicacion_destino_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000024','traslado',2,'danada_piso',now() - interval '1 minute')$q$]);
select pg_temp.verificar('saldo: piso 0 y vendible 2 después de mandar 2 a no vendible',
 (select bool_and(case serie when 'piso' then saldo = 0 when 'vendible' then saldo = 2 end) and count(*) = 2
  from v_saldo_en_el_tiempo where variante_id='00000000-0000-0000-0000-0000000000f2' and ubicacion_id='00000000-0000-0000-0000-000000000012' and hasta is null));
select pg_temp.debe_pasar('las 2 reparadas vuelven del no vendible al piso', array[
 $q$insert into movimientos (variante_id,ubicacion_id,sububicacion_id,sububicacion_destino_id,tipo,cantidad,motivo_codigo,ocurrido_en) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000021','traslado',2,'movimiento_interno',now())$q$]);
select pg_temp.verificar('saldo: piso 2 y vendible 4 después de volver del no vendible',
 (select bool_and(case serie when 'piso' then saldo = 2 when 'vendible' then saldo = 4 end) and count(*) = 2
  from v_saldo_en_el_tiempo where variante_id='00000000-0000-0000-0000-0000000000f2' and ubicacion_id='00000000-0000-0000-0000-000000000012' and hasta is null));

-- ---------------------------------------------------------------- H · surtido, stock, reservas, alertas, producción
insert into stock (variante_id,ubicacion_id,sububicacion_id,cantidad) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021',4);
select pg_temp.debe_pasar('surtido del vino en AQP con fecha de lanzamiento', array[
 $q$insert into surtido (producto_color_id,ubicacion_id,lanzamiento_en,minimo_presentacion) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000012',current_date - 10,3)$q$]);
select pg_temp.debe_fallar('mover la fecha de lanzamiento ya fijada', array[
 $q$update surtido set lanzamiento_en = current_date where producto_color_id='00000000-0000-0000-0000-0000000000e1'$q$]);
select pg_temp.debe_pasar('cambiar el mínimo de presentación', array[
 $q$update surtido set minimo_presentacion = 2 where producto_color_id='00000000-0000-0000-0000-0000000000e1'$q$]);
select pg_temp.verificar('el surtido guardó 2 eventos', (select count(*) = 2 from surtido_eventos));
select pg_temp.verificar('talla rota: la M (clave) en 0 en el piso de AQP con la S en 4',
 (select count(*) = 1 from v_tallas_rotas where talla = 'M' and ubicacion_id = '00000000-0000-0000-0000-000000000012'));
select pg_temp.debe_pasar('reservar las 4 S de AQP', array[
 $q$insert into reservas (variante_id,ubicacion_id,cantidad,vence_en) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012',4,now() + interval '2 days')$q$]);
select pg_temp.debe_fallar('reservar una quinta S en AQP', array[
 $q$insert into reservas (variante_id,ubicacion_id,cantidad,vence_en) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000012',1,now() + interval '2 days')$q$]);
insert into producciones (id,ubicacion_id,producto_id) values
 ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-0000000000d1');
select pg_temp.debe_fallar('producir con destino al propio Taller', array[
 $q$insert into produccion_lineas (produccion_id,variante_id,cantidad_plan,ubicacion_destino_id) values ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-0000000000f2',5,'00000000-0000-0000-0000-000000000013')$q$]);
select pg_temp.debe_pasar('producir 3 M para AQP y 2 M para TRU en la misma orden', array[
 $q$insert into produccion_lineas (produccion_id,variante_id,cantidad_plan,ubicacion_destino_id) values ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-0000000000f2',3,'00000000-0000-0000-0000-000000000012'),('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-0000000000f2',2,'00000000-0000-0000-0000-000000000011')$q$]);
select pg_temp.debe_fallar('recomendar "comprar" por sede', array[
 $q$insert into recomendaciones_reposicion (variante_id,ubicacion_id,accion,cantidad_sugerida,posicion_proyectada,velocidad_dia_con_stock,dias_con_stock,lead_time_dias,lead_time_origen,insumos) values ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000012','comprar',3,0,0.2,10,14,'supuesto','{"tallas_clave":["M"],"lanzamiento_en":"2026-09-06","estado_surtido":"vigente"}')$q$]);

-- ---------------------------------------------------------------- I · sedes
select pg_temp.debe_fallar('una tienda sin su sede de Dynamic', array[
 $q$insert into ubicaciones (nombre,tipo) values ('Tienda Lima','tienda')$q$]);
select pg_temp.debe_fallar('dos ubicaciones para la misma sede de Dynamic', array[
 $q$insert into ubicaciones (sede_dynamic_id,nombre,tipo) values ('00000000-0000-0000-0000-000000000102','AQP 2','tienda')$q$]);
select pg_temp.verificar('el Taller se encuentra por tipo y su código se lee de Dynamic (LIM)',
 (select sede_codigo = 'LIM' from v_ubicaciones where tipo = 'taller'));

-- ---------------------------------------------------------------- J · IA
select pg_temp.debe_fallar('auto-aceptar la categoría propuesta por la IA', array[
 $q$insert into propuestas_clasificacion (entidad,entidad_id,campo,valor_propuesto,modelo,version_prompt,acuerdo_k,acuerdo_n,puerta) values ('producto','00000000-0000-0000-0000-0000000000d1','categoria_id','x','m','v1',3,3,'auto_unanime')$q$]);
select pg_temp.debe_fallar('saltarse la puerta humana llamando "color" al campo', array[
 $q$insert into propuestas_clasificacion (entidad,entidad_id,campo,valor_propuesto,modelo,version_prompt,acuerdo_k,acuerdo_n,puerta) values ('producto_color','00000000-0000-0000-0000-0000000000e1','color','VIN','m','v1',3,3,'auto_unanime')$q$]);
select pg_temp.debe_fallar('campo fuera de la lista cerrada ("color"), aun con puerta humana', array[
 $q$insert into propuestas_clasificacion (entidad,entidad_id,campo,valor_propuesto,modelo,version_prompt,acuerdo_k,acuerdo_n,puerta) values ('producto_color','00000000-0000-0000-0000-0000000000e1','color','VIN','m','v1',3,3,'humana')$q$]);
select pg_temp.debe_fallar('auto-aceptar el nombre comercial', array[
 $q$insert into propuestas_clasificacion (entidad,entidad_id,campo,valor_propuesto,modelo,version_prompt,acuerdo_k,acuerdo_n,puerta) values ('producto_color','00000000-0000-0000-0000-0000000000e1','nombre_comercial','Flores','m','v1',3,3,'auto_unanime')$q$]);
select pg_temp.debe_pasar('auto-aceptar el tejido con unanimidad', array[
 $q$insert into propuestas_clasificacion (entidad,entidad_id,campo,valor_propuesto,modelo,version_prompt,acuerdo_k,acuerdo_n,puerta) values ('producto','00000000-0000-0000-0000-0000000000d1','tejido','lino','m','v1',3,3,'auto_unanime')$q$]);

-- ---------------------------------------------------------------- K · concurrencia (dos sesiones reales)
select dblink_connect('otra', format('host=127.0.0.1 port=%s dbname=%s user=%s', current_setting('port'), current_database(), current_user));

-- K1. La otra sesión le crea una hija a "Tops" y tarda; esta cuelga un producto de "Tops".
select dblink_send_query('otra', $q$do $d$ begin
  insert into categorias (id,familia,nombre,prefijo,escala_talla_id,requiere_etiqueta_textil,categoria_padre_id) values ('00000000-0000-0000-0000-0000000000c8','indumentaria','Manga larga','TML','00000000-0000-0000-0000-000000000001',true,'00000000-0000-0000-0000-0000000000c7');
  perform pg_sleep(1.5);
end $d$$q$);
select pg_sleep(0.4);
select pg_temp.debe_fallar('concurrencia: producto en una hoja mientras otra sesión le crea una hija', array[
 $q$insert into productos (codigo,referencia,categoria_id,escala_talla_id,publico,marca_id,origen,tipo_surtido) values ('TOP-0001','Top','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','basico')$q$]);
select * from dblink_get_result('otra') as t(estado text);
select * from dblink_get_result('otra') as t(estado text);

-- K2. La otra sesión cuelga un producto de "Polos" y tarda; esta le crea una hija a "Polos".
select dblink_send_query('otra', $q$do $d$ begin
  insert into productos (codigo,referencia,categoria_id,escala_talla_id,publico,marca_id,origen,tipo_surtido) values ('PLO-0001','Polo','00000000-0000-0000-0000-0000000000c9','00000000-0000-0000-0000-000000000001','mujer','00000000-0000-0000-0000-0000000000b1','taller_propio','basico');
  perform pg_sleep(1.5);
end $d$$q$);
select pg_sleep(0.4);
select pg_temp.debe_fallar('concurrencia: hija para una categoría mientras otra sesión le cuelga un producto', array[
 $q$insert into categorias (familia,nombre,prefijo,escala_talla_id,requiere_etiqueta_textil,categoria_padre_id) values ('indumentaria','Polo manga corta','PMC','00000000-0000-0000-0000-000000000001',true,'00000000-0000-0000-0000-0000000000c9')$q$]);
select * from dblink_get_result('otra') as t(estado text);
select * from dblink_get_result('otra') as t(estado text);
select pg_temp.verificar('ninguna categoría quedó con hijas y productos a la vez',
 (select count(*) = 0 from categorias c
  where exists (select 1 from categorias h where h.categoria_padre_id = c.id)
    and exists (select 1 from productos p where p.categoria_id = c.id)));

-- K3. La otra sesión devuelve la única unidad de una línea y tarda; esta devuelve la misma unidad.
insert into devoluciones (id,venta_id,ubicacion_id) values
 ('00000000-0000-0000-0000-000000000053','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000012'),
 ('00000000-0000-0000-0000-000000000054','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000012');
select dblink_send_query('otra', $q$do $d$ begin
  insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo) values ('00000000-0000-0000-0000-000000000053','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000043',1,'vendible','talla_grande');
  perform pg_sleep(1.5);
end $d$$q$);
select pg_sleep(0.4);
select pg_temp.debe_fallar('concurrencia: dos devoluciones simultáneas de la misma unidad', array[
 $q$insert into devolucion_items (devolucion_id,venta_id,venta_item_id,cantidad,condicion,motivo_codigo) values ('00000000-0000-0000-0000-000000000054','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000043',1,'vendible','talla_grande')$q$]);
select * from dblink_get_result('otra') as t(estado text);
select * from dblink_get_result('otra') as t(estado text);
select dblink_disconnect('otra');

-- ---------------------------------------------------------------- L · historia que no se vacía ni se salta (ADR-0070)
select pg_temp.debe_fallar('borrar un movimiento', array[$q$delete from movimientos$q$]);
select pg_temp.debe_fallar('borrar un movimiento en modo réplica', array[
 $q$set local session_replication_role = replica$q$, $q$delete from movimientos$q$]);
select pg_temp.debe_fallar('TRUNCATE en cascada de movimientos, devoluciones y líneas de venta', array[
 $q$truncate movimientos, devolucion_items, venta_items cascade$q$]);
select pg_temp.debe_fallar('TRUNCATE en cascada desde variantes', array[$q$truncate variantes cascade$q$]);
select pg_temp.debe_fallar('TRUNCATE de precios', array[$q$truncate precios cascade$q$]);
select pg_temp.debe_fallar('TRUNCATE de sunat_mapeo_categoria', array[$q$truncate sunat_mapeo_categoria$q$]);
select pg_temp.debe_fallar('TRUNCATE de demanda_no_atendida', array[$q$truncate demanda_no_atendida$q$]);
select pg_temp.verificar('el libro sigue entero', (select count(*) = 6 from movimientos));

-- ---------------------------------------------------------------- resumen
\echo
\echo ==== RESUMEN ====
select count(*) filter (where ok) as casos_ok, count(*) filter (where not ok) as casos_fallidos, count(*) as total from resultados;
\echo ==== CASOS FALLIDOS (debe estar vacío) ====
select n, etiqueta, detalle from resultados where not ok order by n;
\echo ==== DETALLE ====
select n, case when ok then 'ok' else 'FALLO' end as r, etiqueta, left(coalesce(detalle, ''), 110) as por_que from resultados order by n;

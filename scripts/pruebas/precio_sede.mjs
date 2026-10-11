#!/usr/bin/env node
/**
 * Prueba del precio propio por sede (`20261010100000_precio_propio_por_sede.sql`, Felipe 2026-10-09; desde el 2026-10-10 el
 * precio es de la PRENDA en la tienda: `20261011100000_precio_de_tienda_por_prenda.sql`).
 *
 * QUÉ CUBRE
 *   · poner un precio en una sede cambia `fn_precio_en_sede` SOLO ahí; las demás siguen con el general;
 *   · cada variante deja su fila `precio_sede` en el historial, firmada;
 *   · volver a poner el mismo precio no cambia nada; poner el precio general no se guarda como excepción;
 *   · cambiar el precio archiva el anterior (la tabla guarda los dos) y quitarlo vuelve al general;
 *   · quien ve «Productos» solo toca SU tienda; sin el módulo, nada; el Taller no tiene precio propio;
 *   · la tabla no se borra, no se edita y no se lee directo con una sesión;
 *   · (2026-10-10) una talla nueva o reactivada vale el precio de la tienda sin escribir nada; un precio de tienda que queda igual a
 *     la grilla se quita solo al final de la transacción (no a medio guardado); Apartar guarda la línea al precio de la tienda; el
 *     cambio de la misma prenda vale lo que se pagó en la tienda de la compra; el filtro del catálogo usa el precio de la tienda.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (como `historial_prenda.mjs`): la base compartida queda igual.
 *
 * USO
 *   node scripts/pruebas/precio_sede.mjs               → con las migraciones ya aplicadas en la base `postgres` del local
 *   node scripts/pruebas/precio_sede.mjs --base otra   → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const iBase = process.argv.indexOf("--base");
const BASE = iBase > 0 ? process.argv[iBase + 1] : "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo, ve Productos (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// Sesión de una persona operando en Trujillo.
const sesion = (uid) => `
set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', json_build_object('x-ubicacion', :'tru')::text, true) as _h \\gset
`;

const PRELUDIO = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
-- Una prenda con al menos dos variantes activas al mismo precio general.
select v.producto_id as p1, min(v.precio) as general from retail.variantes v
 where v.activo group by v.producto_id having count(*) >= 2 and min(v.precio) = max(v.precio) and min(v.precio) > 10
 order by v.producto_id limit 1 \\gset
select count(*) as nvar from retail.variantes where producto_id = :'p1' and activo \\gset
select id as v1 from retail.variantes where producto_id = :'p1' and activo order by id limit 1 \\gset
`;

function correr(uid, sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sesion(uid)}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");
const fallaCon = (r, texto) => !r.ok && r.mensaje.includes(texto);

// 1. Poner precio en Trujillo: cambia ahí, no en Lima; una fila de historial por variante, firmada.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'En Trujillo se vende más') as n \\gset
select concat_ws('|', (:n = :nvar)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 10)::text,
  (retail.fn_precio_en_sede(:'v1', :'lima') = :general)::text,
  (select count(*) = :nvar and bool_and(usuario_id is not null)
               and bool_and((valor_nuevo::jsonb ->> 'propio')::boolean) and bool_and(not (valor_anterior::jsonb ->> 'propio')::boolean)
               from retail.historial_producto_cambios where created_at = now() and campo = 'precio_sede')::text);`);
  esperar("poner precio: cambia solo en esa sede y deja historial firmado por variante", ultima(r) === "true|true|true|true", r);
}

// 2. El mismo precio otra vez no cambia nada.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'En Trujillo se vende más');
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'En Trujillo se vende más');`);
  esperar("el mismo precio y el mismo motivo otra vez devuelven 0 cambios", ultima(r) === "0", r);
}

// 3. El precio general no es una excepción.
{
  const r = correr(FELIPE, `select retail.poner_precio_sede(:'p1', :'tru', :general, 'Igual que todos');`);
  esperar("poner el precio de la prenda se rechaza", fallaCon(r, "ya es el precio de la prenda"), r);
}

// 4. Cambiar el precio archiva el anterior; quitarlo vuelve al general.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Primero');
select retail.poner_precio_sede(:'p1', :'tru', :general + 20, 'Después');
select concat_ws('|', ((select count(*) from retail.precios_sede_prenda ps
          where ps.producto_id = :'p1' and ps.ubicacion_id = :'tru' and ps.created_at = now()) = 2)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 20)::text);
select retail.quitar_precio_sede(:'p1', :'tru', null) as q \\gset
select concat_ws('|', (:q = :nvar)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general)::text,
  (select count(*) = 0 from retail.precios_sede_prenda ps
               where ps.producto_id = :'p1' and ps.archivado_en is null)::text);`);
  const l = r.ok ? r.salida.split("\n").filter(Boolean) : [];
  esperar("cambiar archiva el anterior y quitar vuelve al general", l.at(-2) === "true|true" && l.at(-1) === "true|true|true", r);
}

// 5. Quien ve Productos pone el de SU tienda, no el de otra.
{
  const propia = correr(MICAELA, `select (retail.poner_precio_sede(:'p1', :'tru', :general + 5, 'Precio de mi tienda') = :nvar)::text;`);
  esperar("una integrante pone el precio de su propia tienda", ultima(propia) === "true", propia);
  const ajena = correr(MICAELA, `select retail.poner_precio_sede(:'p1', :'lima', :general + 5, 'Precio de otra tienda');`);
  esperar("una integrante NO pone el precio de otra tienda", fallaCon(ajena, "propia tienda"), ajena);
}

// 6. Sin el módulo Productos, nada.
{
  const r = correr(MICAELA, `
delete from retail.rol_modulos where modulo = 'productos'
   and rol_id = (select c.rol_id from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}');
select retail.poner_precio_sede(:'p1', :'tru', :general + 5, 'Sin módulo');`);
  esperar("sin el módulo Productos no se pone precio", fallaCon(r, "Productos"), r);
}

// 7. Ni el Taller, ni sin motivo, ni en cero.
{
  esperar("el Taller no tiene precio propio", fallaCon(correr(FELIPE, `select retail.poner_precio_sede(:'p1', :'taller', :general + 5, 'Taller');`), "tienda abierta"), null);
  esperar("sin motivo se rechaza", fallaCon(correr(FELIPE, `select retail.poner_precio_sede(:'p1', :'tru', :general + 5, '  ');`), "por qué"), null);
  esperar("en cero se rechaza", fallaCon(correr(FELIPE, `select retail.poner_precio_sede(:'p1', :'tru', 0, 'Gratis');`), "mayor que cero"), null);
}

// 8. La tabla no se borra, no se edita y no se lee directo.
{
  const borrar = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Para borrar');
delete from retail.precios_sede_prenda where ubicacion_id = :'tru';`);
  esperar("un precio de sede no se borra", fallaCon(borrar, "no se borra"), borrar);
  const editar = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Para editar');
update retail.precios_sede_prenda set precio = 1 where ubicacion_id = :'tru';`);
  esperar("un precio de sede no se edita", fallaCon(editar, "no se edita"), editar);
  const leer = correr(FELIPE, `set local role authenticated; select count(*) from retail.precios_sede_prenda;`);
  esperar("una sesión no lee la tabla directo", fallaCon(leer, "permission denied"), leer);
  const vieja = correr(FELIPE, `insert into retail.precios_sede (variante_id, ubicacion_id, precio, motivo) values (:'v1', :'tru', 1, 'Vieja');`);
  esperar("la tabla por variante (precios_sede) es historia: no acepta filas nuevas", fallaCon(vieja, "es historia"), vieja);
}

// 9. Las lecturas: la ficha y la tienda.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Lectura');
set local role authenticated;
select concat_ws('|', ((select count(*) from retail.fn_precios_en_sede(:'tru') f join retail.variantes v on v.id = f.variante_id where v.producto_id = :'p1') = :nvar)::text,
  (select variantes = :nvar and precio = :general + 10 and motivo = 'Lectura' and creado_por_nombre is not null
               from retail.fn_precios_sede_producto(:'p1') where ubicacion_id = :'tru')::text,
  (select count(*) = 0 from retail.fn_precios_en_sede(:'lima') f join retail.variantes v on v.id = f.variante_id where v.producto_id = :'p1')::text);`);
  esperar("las lecturas dicen qué sedes y qué variantes tienen precio propio", ultima(r) === "true|true|true", r);
}

// 10. Actividad lo dice en palabras (el disparador es diferido: se fuerza dentro de la transacción).
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Actividad');
set constraints all immediate;
select descripcion from retail.actividad where modulo = 'productos' and ocurrio_at = now() order by id desc limit 1;
select retail.quitar_precio_sede(:'p1', :'tru', null);
set constraints all immediate;
select descripcion from retail.actividad where modulo = 'productos' and ocurrio_at = now() order by id desc limit 1;`);
  const l = r.ok ? r.salida.split("\n").filter(Boolean) : [];
  const puso = l.find((x) => x.includes("puso precio propio en Tienda Trujillo")) ?? "";
  esperar(
    "Actividad dice «puso precio propio en Tienda Trujillo: S/ … (antes S/ …, el de la prenda)», sin JSON",
    /puso precio propio en Tienda Trujillo: S\/\s*[\d.,]+ \(antes S\/\s*[\d.,]+, el de la prenda\)/.test(puso) && !l.some((x) => x.includes("{")),
    r,
  );
  // Las otras tres frases, directo (en una misma transacción Actividad junta los cambios de la prenda en una fila).
  const f = correr(FELIPE, `
select concat_ws('|',
  retail.fn_actividad_precio_sede('{"tienda":"Tienda TRU","precio":69.90,"propio":true}', '{"tienda":"Tienda TRU","precio":64.90,"propio":true}'),
  retail.fn_actividad_precio_sede('{"tienda":"Tienda TRU","precio":69.90,"propio":true}', '{"tienda":"Tienda TRU","precio":79.90,"propio":false}'),
  retail.fn_actividad_precio_sede('{"tienda":"Tienda AQP","precio":79.90,"propio":true}', '{"tienda":"Tienda AQP","precio":79.90,"propio":false,"motivo":"Quedó igual al precio de la prenda"}'));`);
  esperar(
    "Actividad: cambiar, quitar y «quedó igual al de la prenda» se dicen distinto",
    /^precio propio en Tienda TRU S\/\s*69\.90 → S\/\s*64\.90\|quitó el precio propio de Tienda TRU \(vuelve a S\/\s*79\.90\)\|el precio de Tienda AQP quedó igual al de la prenda \(S\/\s*79\.90\)$/.test(ultima(f)),
    f,
  );
}

// 11. La caja de Trujillo cobra el precio de Trujillo (`registrar_venta`, 20261010100200): al precio de la tienda pasa, al
//     general se rechaza con «el precio cambió». Caja propia y colchón de stock, como `registrar_venta.mjs`.
{
  const CAJA = `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba precio de sede') as caja_id \\gset
select id as vv, precio as vv_general, producto_id as vp from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'tru', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vv', :'tru', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'Venta de prueba') as _p \\gset
`;
  const vender = (precio) => `
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 1, 'precio_unitario', ${precio})),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', ${precio})),
  null, gen_random_uuid()) as venta_id \\gset
select (precio_unitario = :vv_general + 10)::text from retail.venta_items where venta_id = :'venta_id';`;
  const propio = correr(MICAELA, CAJA + vender(":vv_general + 10"));
  esperar("en Trujillo se cobra el precio de Trujillo", ultima(propio) === "true", propio);
  const general = correr(MICAELA, CAJA + vender(":vv_general"));
  esperar("en Trujillo, el precio general se rechaza («el precio cambió»)", fallaCon(general, "venta_precio_cambiado"), general);
}

// 12. Proformas: se cotiza al precio de la tienda (`crear_proforma` y su candado, 20261010100300).
{
  const cotizar = (precio) => `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Cotizar');
select retail.crear_proforma(:'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', ${precio})), 'Cliente de prueba') as pf \\gset
select (total = :general + 10)::text from retail.proformas where id = :'pf';`;
  const propio = correr(FELIPE, cotizar(":general + 10"));
  esperar("una proforma en Trujillo cotiza al precio de Trujillo", ultima(propio) === "true", propio);
  const general = correr(FELIPE, cotizar(":general"));
  esperar("una proforma en Trujillo al precio general se rechaza", !general.ok, general);
}

// 12a. «Cambiar» con el mismo precio y otro motivo guarda el motivo nuevo (20261010100600): archiva y crea otra fila.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Motivo mal escrito');
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Motivo corregido') as n \\gset
select concat_ws('|', (:n = :nvar)::text,
  (select bool_and(motivo = 'Motivo corregido') from retail.precios_sede_prenda ps
    where ps.producto_id = :'p1' and ps.ubicacion_id = :'tru' and ps.archivado_en is null)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 10)::text,
  (select min(vigente_desde) = max(vigente_desde) from retail.precios_sede_prenda ps
    where ps.producto_id = :'p1' and ps.ubicacion_id = :'tru' and ps.created_at = now())::text);`);
  esperar("cambiar solo el motivo lo guarda (el precio sigue igual y no reinicia «desde»)", ultima(r) === "true|true|true|true", r);
}

// 12b. Poner o quitar el precio de una tienda sube la versión del catálogo: las pantallas abiertas se ponen al día solas.
{
  const r = correr(FELIPE, `
select version as v0 from retail.catalogo_version where id = 1 \\gset
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Versión');
select version as v1 from retail.catalogo_version where id = 1 \\gset
select retail.quitar_precio_sede(:'p1', :'tru', null);
select concat_ws('|', (:v1 > :v0)::text, ((select version from retail.catalogo_version where id = 1) > :v1)::text);`);
  esperar("poner y quitar el precio de una tienda suben la versión del catálogo (las pantallas abiertas se refrescan)", ultima(r) === "true|true", r);
}

// 12c. Una prenda que tuvo precio propio no se elimina: lo dice (UNA fila, la tabla vieja y la nueva juntas) y se desactiva.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Historia');
select (select concepto from retail.fn_producto_historia(:'p1') where orden = 22) || '|' || (select n from retail.fn_producto_historia(:'p1') where orden = 22) || '|' || (select borrable from retail.fn_producto_historia(:'p1') where orden = 22)::text || '|' || (select count(*) from retail.fn_producto_historia(:'p1') where orden = 23)::text;`);
  // ≥ 1: la tabla guarda la historia (otras pruebas o sesiones pueden haber dejado filas archivadas de esta prenda).
  esperar("fn_producto_historia nombra «precios propios de una tienda» una sola vez y no es borrable", /^precios propios de una tienda\|[1-9]\d*\|false\|0$/.test(ultima(r)), r);
}

// 14. (2026-10-10) El precio es de la PRENDA: una talla nueva o una que se reactiva vale el de la tienda sin escribir nada. Antes
//     nacían sin fila y en esa caja la misma prenda tenía dos precios (FAL-0008).
{
  const r = correr(FELIPE, `
select t.id as talla_nueva from retail.tallas t
 where not exists (select 1 from retail.variantes v where v.producto_id = :'p1' and v.talla_id = t.id) limit 1 \\gset
select t.id as talla_dormida from retail.tallas t
 where not exists (select 1 from retail.variantes v where v.producto_id = :'p1' and v.talla_id = t.id) and t.id <> :'talla_nueva' limit 1 \\gset
insert into retail.variantes (producto_id, precio, color_codigo, talla_id, activo)
  select :'p1', :general, color_codigo, :'talla_dormida', false from retail.variantes where id = :'v1' returning id as vd \\gset
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Toda la prenda') as _p \\gset
insert into retail.variantes (producto_id, precio, color_codigo, talla_id)
  select :'p1', :general + 3, color_codigo, :'talla_nueva' from retail.variantes where id = :'v1' returning id as vn \\gset
update retail.variantes set activo = true where id = :'vd';
set constraints all immediate;
select concat_ws('|', (retail.fn_precio_en_sede(:'vn', :'tru') = :general + 10)::text,
  (retail.fn_precio_en_sede(:'vd', :'tru') = :general + 10)::text,
  (retail.fn_precio_en_sede(:'vn', :'lima') = :general + 3)::text,
  ((select variantes from retail.fn_precios_sede_producto(:'p1') where ubicacion_id = :'tru') = :nvar + 2)::text);`);
  esperar("una talla nueva y una reactivada valen el precio de la tienda (y en Lima, el suyo de la grilla)", ultima(r) === "true|true|true|true", r);
}

// 15. Un precio de tienda que queda IGUAL a la grilla en todas las tallas se quita solo y queda anotado (el AQP de FAL-0008).
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Más caro aquí') as _p \\gset
update retail.variantes set precio = :general + 10 where producto_id = :'p1' and activo;
set constraints all immediate;
select concat_ws('|',
  (select count(*) = 0 from retail.precios_sede_prenda where producto_id = :'p1' and archivado_en is null)::text,
  (select archivado_motivo = 'Quedó igual al precio de la prenda' from retail.precios_sede_prenda
    where producto_id = :'p1' and ubicacion_id = :'tru' order by created_at desc limit 1)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 10)::text,
  (select count(*) = :nvar from retail.historial_producto_cambios
    where campo = 'precio_sede' and created_at = now() and valor_nuevo::jsonb ->> 'motivo' = 'Quedó igual al precio de la prenda')::text);`);
  esperar("igual a la grilla en todas las tallas: se quita solo, con su motivo y su historial", ultima(r) === "true|true|true|true", r);
}

// 16. …pero no a medio guardado: un guardado que pasa la grilla por un estado igual y termina distinto no lo quita (diferido).
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'No a medias') as _p \\gset
update retail.variantes set precio = :general + 10 where producto_id = :'p1' and activo;
update retail.variantes set precio = :general + 5 where id = :'v1';
set constraints all immediate;
select (select count(*) = 1 from retail.precios_sede_prenda where producto_id = :'p1' and ubicacion_id = :'tru' and archivado_en is null)::text;`);
  esperar("el precio de tienda no se quita en un estado intermedio del guardado", ultima(r) === "true", r);
}

// 17. Apartar en Trujillo guarda la LÍNEA al precio de Trujillo, no solo el total (antes: total 69.90, línea 79.90 y la venta del
//     apartado descuadrada al entregar).
{
  const r = correr(MICAELA, `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba precio de sede') as caja_id \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT99' when 'factura' then 'FT99' else serie end, siguiente_numero = 1
 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select id as vv, precio as vv_general, producto_id as vp from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'tru', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vv', :'tru', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'Apartado de prueba') as _p \\gset
select retail.separar_prendas(
  p_ubicacion_id => :'tru',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 1, 'precio_unitario', :vv_general + 10)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 20)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
  p_devolucion_medio => 'yape') as sep \\gset
select concat_ws('|',
  (select precio_unitario = :vv_general + 10 from retail.separacion_items where separacion_id = :'sep')::text,
  (select s.total = (select sum((si.precio_unitario - si.descuento_unitario) * si.cantidad) from retail.separacion_items si where si.separacion_id = s.id)
     from retail.separaciones s where s.id = :'sep')::text);`);
  esperar("Apartar en Trujillo guarda la línea al precio de Trujillo y el total cuadra con las líneas", ultima(r) === "true|true", r);
}

// 18. Cambio (Felipe 2026-10-10, «vale lo que pagó»): otra talla de la MISMA prenda se cobra al precio de la tienda donde se
//     compró, aunque se cambie en otra; otra prenda, al de la tienda donde se cambia.
{
  const r = correr(MICAELA, `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba precio de sede') as caja_id \\gset
select id as vv, precio as vv_general, producto_id as vp from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as vv2 from retail.variantes where producto_id = :'vp' and id <> :'vv' and activo order by id limit 1 \\gset
select id as otra from retail.variantes where producto_id <> :'vp' and activo and precio > 0 order by id limit 1 \\gset
select retail.fn_sububicacion_por_defecto(:'tru', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vv', :'tru', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'Cambio de prueba') as _p \\gset
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 1, 'precio_unitario', :vv_general + 10)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :vv_general + 10)),
  null, gen_random_uuid()) as venta_id \\gset
select id as item from retail.venta_items where venta_id = :'venta_id' \\gset
select concat_ws('|',
  (retail.fn_precio_para_cambio(:'item', :'vv2', :'lima') = :vv_general + 10)::text,
  (retail.fn_precio_para_cambio(:'item', :'otra', :'lima') = retail.fn_precio_en_sede(:'otra', :'lima'))::text,
  (retail.fn_precio_para_cambio(:'item', :'vv2', :'tru') = :vv_general + 10)::text);`);
  esperar("cambiar de talla la misma prenda en otra tienda vale lo que se pagó; otra prenda, el precio de donde se cambia", ultima(r) === "true|true|true", r);
}

// 19. El filtro del catálogo usa el precio de la tienda: en Trujillo, «hasta S/ X» incluye la prenda que ahí cuesta menos.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'Más barato aquí') as _p \\gset
select concat_ws('|',
  (select bool_and(f_precio) from retail.fn_productos_filtro(p_precio_max => :general - 1, p_ubicacion_id => :'tru') where producto_id = :'p1')::text,
  (select bool_or(f_precio) from retail.fn_productos_filtro(p_precio_max => :general - 1, p_ubicacion_id => :'lima') where producto_id = :'p1')::text,
  (select bool_and(precio = :general - 5) from retail.fn_productos_filtro(p_ubicacion_id => :'tru') where producto_id = :'p1')::text);`);
  esperar("en Trujillo el filtro de precio ve el de Trujillo; en Lima, el de la grilla", ultima(r) === "true|false|true", r);
}

// 13. Guardián: toda función que cobra, aparta, cotiza, cambia o regulariza toma el precio de `fn_precio_en_sede` — y en TODAS
//     sus lecturas (separar_prendas leía el precio dos veces y solo una se había cambiado: el guardián pasaba en verde).
{
  const r = correr(FELIPE, `
select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail'
   and p.proname in ('registrar_venta', 'separar_prendas', 'editar_separacion', 'registrar_cambio', 'crear_proforma', 'regularizar_prenda')
   and (pg_get_functiondef(p.oid) not like '%fn_precio_en_sede(%' and pg_get_functiondef(p.oid) not like '%fn_precio_para_cambio(%'
        or pg_get_functiondef(p.oid) ~ 'v\\.precio\\s+into\\s+v_precio\\M'
        or pg_get_functiondef(p.oid) ~ 'select\\s+precio\\s+into\\s+v_precio_nuevo');`);
  esperar("las seis funciones que fijan un precio usan el de la tienda en todas sus lecturas", r.ok && (ultima(r) === "" || ultima(r) === "-"), r);
  const g = correr(FELIPE, `
select concat_ws('|',
  (select pg_get_functiondef(p.oid) like '%fn_precio_para_cambio(%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'registrar_cambio')::text,
  (select pg_get_functiondef(p.oid) like '%precios_sede_prenda%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'fn_productos_filtro')::text);`);
  esperar("registrar_cambio usa fn_precio_para_cambio y el filtro del catálogo el precio de la tienda", ultima(g) === "true|true", g);
}

if (fallos) {
  console.log(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo en verde.");

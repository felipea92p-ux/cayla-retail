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
 *   · (2026-10-11) el precio de una tienda no baja del costo de ninguna de sus tallas activas, para nadie (como la caja);
 *   · (2026-10-10) una talla nueva o reactivada vale el precio de la tienda sin escribir nada; un precio de tienda que queda igual a
 *     la grilla se quita solo al final de la transacción (no a medio guardado); Apartar guarda la línea al precio de la tienda; el
 *     cambio de la misma prenda vale lo que se pagó en la tienda de la compra; el filtro del catálogo usa el precio de la tienda.
 *   · (2026-10-15, `20261015121000_talla_en_cero_sigue_en_cero.sql`) La talla de OBSEQUIO —S/ 0 en una categoría que admite el 0
 *     (Empaque, `fn_categoria_admite_precio_cero`)— vale 0 en toda tienda aunque la bolsa tenga precio propio ahí; la ROPA vale el precio
 *     de la tienda aunque su ficha diga S/ 0 en una talla (Felipe: «el precio de la prenda siempre debe ser el mismo de la tienda»), y en
 *     una tienda sin precio propio sigue sin precio. En la regla, en Vender (`fn_precios_en_sede`), en el filtro del catálogo, en la caja,
 *     al poner, al quitar, en «quedó igual a la grilla» y en la ficha; con MUTANTES que confunden la ropa con el obsequio (y al revés) en
 *     cada una de las seis funciones que lo preguntan, y la prueba lo ve.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (como `historial_prenda.mjs`): la base compartida queda igual.
 *
 * USO
 *   node scripts/pruebas/precio_sede.mjs               → con las migraciones ya aplicadas en la base `postgres` del local
 *   node scripts/pruebas/precio_sede.mjs --base otra   → contra otra base del mismo contenedor
 *   node scripts/pruebas/precio_sede.mjs --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
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
-- Una prenda de ROPA (su familia cuenta en los motores, así que no admite el precio 0: 24-31 la usan como ropa) con al menos dos
-- variantes activas al mismo precio general.
select v.producto_id as p1, min(v.precio) as general from retail.variantes v join retail.productos pr on pr.id = v.producto_id
 where v.activo and retail.fn_categoria_entra_a_motores(pr.categoria_id)
 group by v.producto_id having count(*) >= 2 and min(v.precio) = max(v.precio) and min(v.precio) > 10
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
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 30)),  -- al menos el 30 % (20261016003000)
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

// 20. (2026-10-11) El precio de una tienda NO baja del costo, para NADIE (Felipe: igual que la caja, que no deja vender bajo el
//     costo ni a un líder). El costo de la prenda se fija dentro de la transacción (todo vuelve con el ROLLBACK).
{
  const COSTO = `
select round(:general * 0.6, 2) as costo_t \\gset
update retail.variantes set costo = :costo_t where producto_id = :'p1';
`;
  const bajo = correr(FELIPE, COSTO + `select retail.poner_precio_sede(:'p1', :'tru', :costo_t - 0.01, 'Liquidación');`);
  esperar("un líder no pone un precio de tienda por debajo del costo", fallaCon(bajo, "por debajo de lo que cuesta"), bajo);
  const integrante = correr(MICAELA, COSTO + `select retail.poner_precio_sede(:'p1', :'tru', :costo_t - 0.01, 'Liquidación');`);
  esperar("una integrante tampoco, en su propia tienda", fallaCon(integrante, "por debajo de lo que cuesta"), integrante);
  esperar(
    "el mensaje no dice cuánto cuesta (el costo es dato con permiso)",
    !bajo.ok && !/\d+[.,]\d{2}/.test(bajo.mensaje.split("\n").filter((l) => l.includes("ERROR:")).join("\n")),
    bajo,
  );
  const justo = correr(FELIPE, COSTO + `select (retail.poner_precio_sede(:'p1', :'tru', :costo_t, 'Al costo') = :nvar)::text;`);
  esperar("quedar justo en el costo sí se puede", ultima(justo) === "true", justo);
  const sobre = correr(FELIPE, COSTO + `select (retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'Sobre el costo') = :nvar)::text;`);
  esperar("un precio de tienda sobre el costo pasa", ultima(sobre) === "true", sobre);
  // El precio vale para TODAS las tallas: manda la que más cuesta.
  const talla = correr(FELIPE, COSTO + `
update retail.variantes set costo = round(:general * 0.9, 2) where id = :'v1';
select retail.poner_precio_sede(:'p1', :'tru', round(:general * 0.8, 2), 'Una talla cuesta más');`);
  esperar("manda la talla que más cuesta: bajo ese costo se rechaza", fallaCon(talla, "por debajo de lo que cuesta"), talla);
  // NaN: numeric lo acepta y Postgres lo ordena por ENCIMA de todo número; no puede esquivar el piso ni la validación de > 0.
  const nan = correr(FELIPE, COSTO + `select retail.poner_precio_sede(:'p1', :'tru', 'NaN'::numeric, 'Por tanteo');`);
  esperar("un precio NaN se rechaza (no esquiva el piso)", fallaCon(nan, "mayor que cero"), nan);
  // Re-guardar un precio que YA quedó bajo el costo (el costo subió después) también se rechaza: es volver a poner un precio bajo el
  // costo; se sale subiéndolo o quitándolo.
  const mismo = correr(FELIPE, COSTO + `
select retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'Primero');
update retail.variantes set costo = :general where producto_id = :'p1';
select retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'Otro motivo');`);
  esperar("cambiar solo el motivo de un precio que quedó bajo el costo también se rechaza", fallaCon(mismo, "por debajo de lo que cuesta"), mismo);
  // Una talla DESACTIVADA con costo alto no frena (la base mira solo las activas).
  const dormida = correr(FELIPE, COSTO + `
select t.id as talla_dormida from retail.tallas t
 where not exists (select 1 from retail.variantes v where v.producto_id = :'p1' and v.talla_id = t.id) limit 1 \\gset
insert into retail.variantes (producto_id, precio, costo, color_codigo, talla_id, activo)
  select :'p1', :general, :general * 2, color_codigo, :'talla_dormida', false from retail.variantes where id = :'v1';
select (retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'La cara está apagada') = :nvar)::text;`);
  esperar("una talla desactivada con costo alto no frena el precio de la tienda", ultima(dormida) === "true", dormida);
  // Igualar al precio de la prenda ES quitar: tampoco lo frena el costo, aunque ya lo supere (el piso va DESPUÉS de esa rama).
  const iguala = correr(FELIPE, COSTO + `
select retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'Primero');
update retail.variantes set costo = :general + 1 where producto_id = :'p1';
select (retail.poner_precio_sede(:'p1', :'tru', :general, 'Igual a la prenda') = :nvar)::text;`);
  esperar("igualar al precio de la prenda quita el de la tienda aunque el costo ya lo supere", ultima(iguala) === "true", iguala);
  // Quitar y igualar al precio de la prenda no se frenan por el costo (no ponen un precio más bajo).
  const quita = correr(FELIPE, COSTO + `
select retail.poner_precio_sede(:'p1', :'tru', :general - 5, 'Primero');
update retail.variantes set costo = :general + 1 where producto_id = :'p1';
select retail.quitar_precio_sede(:'p1', :'tru', null) = :nvar;`);
  esperar("quitar el precio de una tienda siempre se puede, aunque el costo haya subido", ultima(quita) === "t", quita);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 21-23. (2026-10-12) Las funciones que fijan un precio, EJECUTADAS de punta a punta con una tienda de precio propio. El guardián 13
//        solo mira que el texto de la función nombre `fn_precio_en_sede` (dejó pasar el bug de las dos lecturas de separar_prendas), y
//        el caso 18 solo llama a `fn_precio_para_cambio`: aquí se corre `registrar_cambio` y `regularizar_prenda` y se mira lo que
//        quedó guardado (la diferencia, la caja, el movimiento, el precio oficial).
// ---------------------------------------------------------------------------------------------------------------------------------

const CENTINELA = "22222222-2222-4222-8222-222222222222"; // el «cargo especial» de las prendas sin registrar

/** Deja `s` (variable psql con el id de la sede) con piso, almacén y una caja recién abierta; guarda :piso_<s> y :caja_<s>. */
const montarSede = (s) => `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'${s}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${s}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'${s}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${s}' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'${s}' and estado = 'abierta') x) as _c_${s} \\gset
select retail.abrir_caja(:'${s}', 100.00, 'prueba precio de sede') as caja_${s} \\gset
select retail.fn_sububicacion_por_defecto(:'${s}', 'venta') as piso_${s} \\gset
`;

/** Entrada de `n` unidades de la variante `v` (variable psql) al piso de la sede `s`. */
const conStock = (v, s, n = 10) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'${v}', :'${s}', :'piso_${s}', 'entrada', ${n}, 'colchón de prueba') returning id as mov_${v}_${s} \\gset
select retail.fn_aplicar_movimiento(:'mov_${v}_${s}') as _d_${v}_${s} \\gset
`;

const PRENDA_BASE = `select id as vv, precio as vv_general, producto_id as vp from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset`;

// 21. Cambio en la misma tienda: la MISMA prenda en otra talla no cobra nada si se compró al precio propio de la tienda; OTRA prenda
//     cobra el precio de la tienda donde se cambia, y esa diferencia queda en el cambio y en la caja (efectivo).
{
  const r = correr(MICAELA, `
${montarSede("tru")}
${PRENDA_BASE}
select id as vv2 from retail.variantes where producto_id = :'vp' and id <> :'vv' and activo order by id limit 1 \\gset
-- Otra prenda con un solo precio, cuyo costo deja poner :vv_general + 25 como precio de Trujillo (diferencia exacta de +15).
select v.id as otra, v.producto_id as otra_p from retail.variantes v
 where v.activo and v.producto_id <> :'vp' and v.precio <> :vv_general + 25
   and (select count(distinct x.precio) from retail.variantes x where x.producto_id = v.producto_id and x.activo) = 1
   and not exists (select 1 from retail.variantes x where x.producto_id = v.producto_id and x.activo and x.costo >= :vv_general + 25)
 order by v.id limit 1 \\gset
${conStock("vv", "tru")}${conStock("vv2", "tru")}${conStock("otra", "tru")}
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'Cambio de punta a punta') as _p1 \\gset
select retail.poner_precio_sede(:'otra_p', :'tru', :vv_general + 25, 'Cambio de punta a punta') as _p2 \\gset
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 2, 'precio_unitario', :vv_general + 10)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 2 * (:vv_general + 10))),
  null, gen_random_uuid()) as venta_id \\gset
select id as item from retail.venta_items where venta_id = :'venta_id' \\gset
select retail.registrar_cambio(:'item', :'tru', :'vv2', 1, null, gen_random_uuid()) as cambio_misma \\gset
select retail.registrar_cambio(:'item', :'tru', :'otra', 1, 'efectivo', gen_random_uuid()) as cambio_otra \\gset
select concat_ws('|',
  (select diferencia = 0 and metodo_pago_diferencia is null from retail.cambios where id = :'cambio_misma')::text,
  (select diferencia = 15 and metodo_pago_diferencia = 'efectivo' and caja_id = :'caja_tru' from retail.cambios where id = :'cambio_otra')::text,
  (select count(*) = 1 from retail.movimientos where cambio_id = :'cambio_misma' and tipo = 'salida' and variante_id = :'vv2')::text,
  (select count(*) = 1 from retail.movimientos where cambio_id = :'cambio_otra' and tipo = 'salida' and variante_id = :'otra')::text);`);
  esperar(
    "registrar_cambio en Trujillo: la misma prenda no cobra, otra prenda cobra la de Trujillo, y queda en el cambio, la caja y el stock",
    ultima(r) === "true|true|true|true",
    r,
  );
}

// 22. Cambio EN OTRA tienda: comprada en Trujillo al precio propio, la misma prenda cambiada de talla en Lima no cobra los S/ 10 que
//     Lima cuesta de más (antes salía +10 por la misma falda y la caja de Lima recibía de más).
{
  const r = correr(FELIPE, `
${montarSede("tru")}${montarSede("lima")}
${PRENDA_BASE}
select id as vv2 from retail.variantes where producto_id = :'vp' and id <> :'vv' and activo order by id limit 1 \\gset
${conStock("vv", "tru")}${conStock("vv2", "lima")}
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'Cambio en otra tienda') as _p \\gset
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 1, 'precio_unitario', :vv_general + 10)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :vv_general + 10)),
  null, gen_random_uuid()) as venta_id \\gset
select id as item from retail.venta_items where venta_id = :'venta_id' \\gset
select retail.registrar_cambio(:'item', :'lima', :'vv2', 1, null, gen_random_uuid()) as cambio \\gset
select concat_ws('|',
  (select diferencia = 0 and ubicacion_id = :'lima' and caja_id = :'caja_lima' from retail.cambios where id = :'cambio')::text,
  (select count(*) = 1 from retail.movimientos where cambio_id = :'cambio' and tipo = 'salida' and variante_id = :'vv2' and ubicacion_id = :'lima')::text);`);
  esperar("registrar_cambio en Lima de lo comprado en Trujillo vale lo de Trujillo: diferencia 0 y la caja de Lima no cobra de más", ultima(r) === "true|true", r);
}

/** Vende UNA prenda sin registrar a S/ 50 en la sede `s`; deja :venta_id y :item_id. */
const ventaLibreEn = (s) => `
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
select retail.registrar_venta(:'${s}',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', 50, 'descuento_unitario', 0,
    'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat', 'talla_id', :'talla', 'color_codigo', :'color')),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50)),
  null, gen_random_uuid()) as venta_id_${s} \\gset
select id as item_${s} from retail.venta_items where venta_id = :'venta_id_${s}' \\gset
`;

// 23. Regularizar una prenda sin registrar en una tienda de precio propio: el «precio oficial» y la diferencia salen del precio de ESA
//     tienda; en otra sede sin precio propio, del de la prenda (el cambio de una tienda no se filtra a las demás).
{
  const r = correr(FELIPE, `
${montarSede("tru")}${montarSede("lima")}
${PRENDA_BASE}
${conStock("vv", "tru")}${conStock("vv", "lima")}
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'Regularizar de punta a punta') as _p \\gset
${ventaLibreEn("tru")}${ventaLibreEn("lima")}
select retail.regularizar_prenda(p.id, :'vv', 'ya_registrada') as dif_tru from retail.prendas_por_regularizar p where venta_item_id = :'item_tru' \\gset
select retail.regularizar_prenda(p.id, :'vv', 'ya_registrada') as dif_lima from retail.prendas_por_regularizar p where venta_item_id = :'item_lima' \\gset
select concat_ws('|',
  (select estado = 'regularizada' and precio_oficial = :vv_general + 10 and diferencia = 50 - (:vv_general + 10) and diferencia = :dif_tru
     from retail.prendas_por_regularizar where venta_item_id = :'item_tru')::text,
  (select estado = 'regularizada' and precio_oficial = :vv_general and diferencia = 50 - :vv_general and diferencia = :dif_lima
     from retail.prendas_por_regularizar where venta_item_id = :'item_lima')::text);`);
  esperar("regularizar_prenda: en Trujillo el precio oficial es el de Trujillo; en Lima, el de la prenda", ultima(r) === "true|true", r);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 24-31. (2026-10-15, `20261015121000_talla_en_cero_sigue_en_cero.sql`) La talla de OBSEQUIO sigue en S/ 0; la ropa vale el precio de la
//        tienda. El precio de una tienda es de la prenda y vale para todas sus tallas —también la de ropa que su ficha deja en S/ 0
//        (Felipe: «el precio de la prenda siempre debe ser el mismo de la tienda»)— menos la de obsequio: S/ 0 en una categoría que admite
//        el 0 (Empaque, `fn_categoria_admite_precio_cero`, ADR-0384), que vale 0 en TODA tienda. Antes la de obsequio pasaba a cobrarse el
//        precio de la bolsa en la tienda que le ponía uno propio. Seis funciones preguntan «¿es la de obsequio?» (la regla, el filtro del
//        catálogo, poner, quitar, depurar y la ficha; Vender sale de la regla): los escenarios 24-30 cruzan las seis con una bolsa y con
//        ropa, y los MUTANTES (31) confunden la ropa con el obsequio, y al revés, en cada una.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Una bolsa de una familia fuera de los motores (como «Empaque»): su talla de obsequio a S/ 0 (`:v_obs`, costo 0.80) y la grande a
 *  S/ 2.50 (`:v_gra`, costo 1.00). Deja `:bolsa`. Todo dentro de la transacción del escenario (vuelve con el ROLLBACK). */
const EMPAQUE = `
insert into retail.familias (codigo, nombre, entra_a_motores) values ('zzempaque', 'ZZ Empaque', false);
insert into retail.categorias (nombre, familia, prefijo) values ('ZZ Bolsas', 'zzempaque', 'ZZB') returning id as cat_bolsa \\gset
select marca_id as marca_b, proveedor_id as prov_b from retail.productos where id = :'p1' \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
  values ('ZZ Bolsa de prueba', :'cat_bolsa', :'marca_b', :'prov_b') returning id as bolsa \\gset
select id as t_obs from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select id as t_gra from retail.tallas where activo and estado = 'aprobado' and id <> :'t_obs' order by valor limit 1 \\gset
select codigo as c_bolsa from retail.colores where activo order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
  values (:'bolsa', 'ZZ-BOLSA-OBS', 0, 0.80, :'t_obs', :'c_bolsa') returning id as v_obs \\gset
insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
  values (:'bolsa', 'ZZ-BOLSA-GRA', 2.50, 1.00, :'t_gra', :'c_bolsa') returning id as v_gra \\gset
`;
const PONER_BOLSA_EN_TRUJILLO = `select retail.poner_precio_sede(:'bolsa', :'tru', 3.00, 'La bolsa cuesta más aquí') as n \\gset\n`;
/** Lo que dicen de la bolsa en Trujillo: cuántas tallas cubre su precio | la regla (obsequio, grande; la grande en Lima) | Vender
 *  (¿la de obsequio está entre las excepciones?, el precio de la grande) | el filtro del catálogo (obsequio, grande) | la ficha. */
const LO_QUE_DICEN = `select concat_ws('|', :n,
  retail.fn_precio_en_sede(:'v_obs', :'tru'), retail.fn_precio_en_sede(:'v_gra', :'tru'), retail.fn_precio_en_sede(:'v_gra', :'lima'),
  (select count(*) from retail.fn_precios_en_sede(:'tru') where variante_id = :'v_obs'),
  (select precio from retail.fn_precios_en_sede(:'tru') where variante_id = :'v_gra'),
  (select precio from retail.fn_productos_filtro(p_ubicacion_id => :'tru') where variante_id = :'v_obs'),
  (select precio from retail.fn_productos_filtro(p_ubicacion_id => :'tru') where variante_id = :'v_gra'),
  (select variantes from retail.fn_precios_sede_producto(:'bolsa') where ubicacion_id = :'tru'));`;
/** Una prenda de ROPA (`:p1`) con una talla en S/ 0 en su ficha (`:v1`: la que el conteo propone «en 0 para que la complete el Líder»)
 *  y precio propio en Trujillo (`:general` + 10). */
const ROPA_EN_CERO = `update retail.variantes set precio = 0 where id = :'v1';
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'La ropa vale lo de la tienda') as n \\gset
`;
/** Lo que dicen de esa talla: ¿el precio cubre todas las tallas? | la regla en Trujillo (¿el de la tienda?) y en Lima | Vender en
 *  Trujillo (¿la ve al precio de la tienda?) y en Lima (¿es excepción?) | el filtro del catálogo en Trujillo y en Lima | la ficha. */
const LO_QUE_DICE_LA_ROPA = `select concat_ws('|', (:n = :nvar)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 10)::text, retail.fn_precio_en_sede(:'v1', :'lima'),
  coalesce(((select precio from retail.fn_precios_en_sede(:'tru') where variante_id = :'v1') = :general + 10)::text, '-'),
  (select count(*) from retail.fn_precios_en_sede(:'lima') where variante_id = :'v1'),
  coalesce(((select precio from retail.fn_productos_filtro(p_ubicacion_id => :'tru') where variante_id = :'v1') = :general + 10)::text, '-'),
  (select precio from retail.fn_productos_filtro(p_ubicacion_id => :'lima') where variante_id = :'v1'),
  coalesce(((select variantes from retail.fn_precios_sede_producto(:'p1') where ubicacion_id = :'tru') = :nvar)::text, '-'));`;
/** Rompe a propósito UNA función viva dentro de la transacción (vuelve con el ROLLBACK): cambia TODAS las apariciones de `de`. */
const MUTAR = (nombre, de, a) => `do $m$
declare d text := (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'retail' and p.proname = '${nombre}');
begin
  if position($q$${de}$q$ in d) = 0 then raise exception 'mutante vacío: % no tiene «%»', '${nombre}', $q$${de}$q$; end if;
  execute replace(d, $q$${de}$q$, $q$${a}$q$);
end $m$;
`;

/** Los escenarios de la regla: se corren tal cual (24-30) y, en 31, contra cada mutante. `espera`: la última línea o «falla:<texto>». */
const REGLA = [];
const regla = (clave, nombre, uid, sql, espera) => REGLA.push({ clave, nombre, uid, sql, espera });
const cumple = (r, espera) => (espera.startsWith("falla:") ? fallaCon(r, espera.slice("falla:".length)) : ultima(r) === espera);

// 24. La regla, Vender (y su «Agregar bolsa»), el filtro del catálogo y la ficha. La bolsa: la de obsequio sigue en 0 en Trujillo (no está
//     entre las excepciones de la tienda, así que la pantalla la muestra en 0) y la grande vale lo de Trujillo. La ropa: la talla que su
//     ficha deja en 0 vale lo de Trujillo en Trujillo, en las cinco lecturas, y en Lima, sin precio propio, sigue en 0.
regla(
  "24a",
  "BOLSA · la talla de obsequio sigue en S/ 0 en la tienda con precio propio (la regla, Vender, el filtro y la ficha); la grande toma el de la tienda",
  FELIPE,
  `${EMPAQUE}${PONER_BOLSA_EN_TRUJILLO}${LO_QUE_DICEN}`,
  "1|0.00|3.00|2.50|0|3.00|0.00|3.00|1",
);
regla(
  "24b",
  "ROPA · la talla que su ficha deja en S/ 0 vale el precio de Trujillo en Trujillo (la regla, Vender, el filtro y la ficha la cubren) y en Lima sigue en S/ 0",
  FELIPE,
  `${ROPA_EN_CERO}${LO_QUE_DICE_LA_ROPA}`,
  "true|true|0.00|true|0|true|0.00|true",
);

// 25. La caja de Trujillo. La bolsa: la de obsequio a S/ 0 junto a la grande a su precio propio; mandarla al precio de la tienda se
//     rechaza («el precio cambió»); la bolsa es de una familia fuera de los motores: el 0 vale (ADR-0384). La ropa: la talla en 0 se
//     cobra al precio de Trujillo (que en Lima no se venda lo prueba `pruebas:registrar-venta`).
{
  const base = `${montarSede("tru")}${EMPAQUE}${conStock("v_obs", "tru")}${conStock("v_gra", "tru")}${PONER_BOLSA_EN_TRUJILLO}`;
  const vender = (obsequio) => `
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_gra', 'cantidad', 1, 'precio_unitario', 3.00),
                    jsonb_build_object('variante_id', :'v_obs', 'cantidad', 1, 'precio_unitario', ${obsequio})),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 3.00 + ${obsequio})),
  null, gen_random_uuid()) as venta_id \\gset
select string_agg(precio_unitario::text, ',' order by precio_unitario) from retail.venta_items where venta_id = :'venta_id';`;
  regla("25a", "BOLSA · la caja de Trujillo cobra la de obsequio a S/ 0 y la grande a S/ 3.00, su precio propio", MICAELA, base + vender("0"), "0.00,3.00");
  regla("25b", "BOLSA · cobrar la de obsequio al precio de la tienda se rechaza («el precio cambió»)", MICAELA, base + vender("3.00"), "falla:venta_precio_cambiado");
  regla(
    "25c",
    "ROPA · la caja de Trujillo cobra la talla que su ficha deja en S/ 0 al precio de Trujillo",
    MICAELA,
    `${montarSede("tru")}${PRENDA_BASE}${conStock("vv", "tru")}
update retail.variantes set precio = 0 where id = :'vv';
select retail.poner_precio_sede(:'vp', :'tru', :vv_general + 10, 'La talla en 0 vale lo de la tienda') as _p \\gset
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'vv', 'cantidad', 1, 'precio_unitario', :vv_general + 10)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :vv_general + 10)),
  null, gen_random_uuid()) as venta_id \\gset
select (precio_unitario = :vv_general + 10)::text from retail.venta_items where venta_id = :'venta_id';`,
    "true",
  );
}

// 26. Poner el precio de una tienda a la BOLSA mira las tallas que alcanza: la de obsequio no cuenta para «ya es el precio de la prenda»,
//     ni para el piso del costo, ni se anota en su historial; y a una bolsa con todas sus tallas de obsequio no se le pone (no cambiaría
//     nada).
{
  const historial = (v) => `(select count(*) from retail.historial_producto_cambios where campo = 'precio_sede' and entidad_id = :'${v}')`;
  regla("26a", "BOLSA · al precio de la grande (la única que alcanza) es «ya es el precio de la prenda», aunque la de obsequio valga 0", FELIPE,
    `${EMPAQUE}select retail.poner_precio_sede(:'bolsa', :'tru', 2.50, 'Igual a la grande');`, "falla:ya es el precio de la prenda");
  regla("26b", "BOLSA · el costo de la de obsequio no frena el precio de la tienda, y su historial no se anota (solo el de la grande)", FELIPE,
    `${EMPAQUE}update retail.variantes set costo = 9.00 where id = :'v_obs';
select retail.poner_precio_sede(:'bolsa', :'tru', 3.00, 'El obsequio cuesta más') as n \\gset
select concat_ws('|', :n, ${historial("v_obs")}, ${historial("v_gra")});`, "1|0|1");
  regla("26c", "BOLSA · el costo de la grande sí frena el precio de la tienda", FELIPE,
    `${EMPAQUE}update retail.variantes set costo = 3.50 where id = :'v_gra';
select retail.poner_precio_sede(:'bolsa', :'tru', 3.00, 'Bajo el costo de la grande');`, "falla:por debajo de lo que cuesta");
  regla("26d", "BOLSA · a una bolsa con todas sus tallas de obsequio no se le pone precio de tienda (no cambiaría nada) y lo dice", FELIPE,
    `${EMPAQUE}update retail.variantes set precio = 0 where id = :'v_gra';
select retail.poner_precio_sede(:'bolsa', :'tru', 3.00, 'Todo se regala');`, "falla:valen 0");
}

// 27. Poner el precio de una tienda a la ROPA cubre también la talla en 0: a una prenda con TODAS sus tallas en 0 sí se le pone (en esa
//     tienda pasa a venderse a ese precio, en Lima sigue sin precio, y cada talla se anota); con una talla en 0, el precio de las demás
//     no es «ya el precio de la prenda» (la talla en 0 pasa a valerlo); y el costo de la talla en 0 cuenta para el piso.
regla(
  "27a",
  "ROPA · a una prenda con TODAS sus tallas en S/ 0 sí se le pone precio de tienda: las cubre todas, valen ese precio en Trujillo y 0 en Lima, y cada una se anota",
  FELIPE,
  `update retail.variantes set precio = 0 where producto_id = :'p1' and activo;
select retail.poner_precio_sede(:'p1', :'tru', :general, 'Toda la prenda estaba en 0') as n \\gset
select concat_ws('|', (:n = :nvar)::text,
  (select bool_and(retail.fn_precio_en_sede(v.id, :'tru') = :general and retail.fn_precio_en_sede(v.id, :'lima') = 0)
     from retail.variantes v where v.producto_id = :'p1' and v.activo)::text,
  ((select count(*) from retail.historial_producto_cambios h join retail.variantes v on v.id = h.entidad_id
     where h.campo = 'precio_sede' and h.created_at = now() and v.producto_id = :'p1') = :nvar)::text,
  coalesce(((select variantes from retail.fn_precios_sede_producto(:'p1') where ubicacion_id = :'tru') = :nvar)::text, '-'));`,
  "true|true|true|true",
);
regla(
  "27b",
  "ROPA · con una talla en S/ 0, el precio de las demás NO es «ya el precio de la prenda»: la talla en 0 pasa a valerlo en esta tienda",
  FELIPE,
  `update retail.variantes set precio = 0 where id = :'v1';
select retail.poner_precio_sede(:'p1', :'tru', :general, 'La talla en 0 vale lo de las demás') as n \\gset
select concat_ws('|', (:n = :nvar)::text, (retail.fn_precio_en_sede(:'v1', :'tru') = :general)::text);`,
  "true|true",
);
regla(
  "27c",
  "ROPA · el costo de la talla en S/ 0 sí frena el precio de la tienda (la cubre)",
  FELIPE,
  `update retail.variantes set precio = 0, costo = :general + 5 where id = :'v1';
select retail.poner_precio_sede(:'p1', :'tru', :general, 'Bajo el costo de la talla en 0');`,
  "falla:por debajo de lo que cuesta",
);

// 28. Quitar y «quedó igual a la grilla» en la BOLSA: la grande al precio de la tienda lo quita solo aunque la de obsequio siga en 0;
//     quitarlo no anota la de obsequio; y sin ninguna talla que alcanzar el de la tienda queda guardado y sin efecto, como con todas las
//     tallas apagadas (vuelve a valer si una talla recibe precio).
{
  const historialObsequio = `(select count(*) from retail.historial_producto_cambios where campo = 'precio_sede' and entidad_id = :'v_obs')`;
  regla("28a", "BOLSA · con la grande al precio de la tienda, el de la tienda se quita solo aunque la de obsequio siga en 0 (y ella no se anota)", FELIPE,
    `${EMPAQUE}${PONER_BOLSA_EN_TRUJILLO}update retail.variantes set precio = 3.00 where id = :'v_gra';
set constraints all immediate;
select concat_ws('|',
  (select count(*) from retail.precios_sede_prenda where producto_id = :'bolsa' and archivado_en is null),
  (select archivado_motivo from retail.precios_sede_prenda where producto_id = :'bolsa' order by created_at desc limit 1),
  ${historialObsequio}, retail.fn_precio_en_sede(:'v_obs', :'tru'));`, "0|Quedó igual al precio de la prenda|0|0.00");
  regla("28b", "BOLSA · quitar el precio de la tienda cuenta y anota solo la grande", FELIPE,
    `${EMPAQUE}${PONER_BOLSA_EN_TRUJILLO}select retail.quitar_precio_sede(:'bolsa', :'tru', 'Ya no') as q \\gset
select concat_ws('|', :q, ${historialObsequio});`, "1|0");
  regla("28c", "BOLSA · sin ninguna talla que alcanzar, el de la tienda queda guardado y sin efecto: todo vale 0 y Vender no ve excepciones", FELIPE,
    `${EMPAQUE}${PONER_BOLSA_EN_TRUJILLO}update retail.variantes set precio = 0 where id = :'v_gra';
set constraints all immediate;
select concat_ws('|',
  (select count(*) from retail.precios_sede_prenda where producto_id = :'bolsa' and archivado_en is null),
  retail.fn_precio_en_sede(:'v_gra', :'tru'),
  (select count(*) from retail.fn_precios_en_sede(:'tru') f join retail.variantes v on v.id = f.variante_id where v.producto_id = :'bolsa'));`, "1|0.00|0");
}

// 29. Quitar y «quedó igual a la grilla» en la ROPA: con una talla en 0 y las demás al precio de la tienda, el de la tienda NO se quita
//     solo (la talla en 0 quedaría sin precio en esta tienda); quitarlo a mano anota todas las tallas, también la de 0, que vuelve a quedar
//     sin precio; y cuando la talla en 0 recibe en su ficha el precio de la tienda, todas quedan iguales y se quita solo. «Se quita solo»
//     es el disparador diferido de `variantes` (`variantes_depurar_precio_de_tienda_si_tiene`): solo mira las tallas que cambian cuando la
//     prenda YA tiene precio de tienda, así que en cada escenario el precio de la tienda va antes que el cambio de la grilla.
{
  const TALLA_EN_CERO_AL_PRECIO_DE_LAS_DEMAS = `update retail.variantes set precio = 0 where id = :'v1';
select retail.poner_precio_sede(:'p1', :'tru', :general, 'La talla en 0 vale lo de las demás') as _p \\gset
`;
  regla("29a", "ROPA · con una talla en S/ 0 y las demás al precio de la tienda, el de la tienda NO se quita solo: la talla en 0 lo perdería", FELIPE,
    `select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Más cara aquí') as _p \\gset
update retail.variantes set precio = :general + 10 where producto_id = :'p1' and activo and id <> :'v1';
update retail.variantes set precio = 0 where id = :'v1';
set constraints all immediate;
select concat_ws('|', (select count(*) from retail.precios_sede_prenda where producto_id = :'p1' and ubicacion_id = :'tru' and archivado_en is null),
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 10)::text);`, "1|true");
  regla("29b", "ROPA · quitarlo a mano cuenta y anota todas las tallas, también la de S/ 0, que vuelve a quedar sin precio en esa tienda", FELIPE,
    `${ROPA_EN_CERO}select retail.quitar_precio_sede(:'p1', :'tru', 'Ya no') as q \\gset
select concat_ws('|', (:q = :nvar)::text,
  (select count(*) from retail.historial_producto_cambios
    where campo = 'precio_sede' and entidad_id = :'v1' and created_at = now() and valor_nuevo::jsonb ->> 'propio' = 'false'),
  retail.fn_precio_en_sede(:'v1', :'tru'));`, "true|1|0.00");
  regla("29c", "ROPA · cuando la talla en S/ 0 recibe en su ficha el precio de la tienda, todas quedan iguales y el de la tienda se quita solo", FELIPE,
    `${TALLA_EN_CERO_AL_PRECIO_DE_LAS_DEMAS}update retail.variantes set precio = :general where id = :'v1';
set constraints all immediate;
select concat_ws('|', (select count(*) from retail.precios_sede_prenda where producto_id = :'p1' and ubicacion_id = :'tru' and archivado_en is null),
  (select archivado_motivo from retail.precios_sede_prenda where producto_id = :'p1' and ubicacion_id = :'tru' order by created_at desc limit 1));`,
    "0|Quedó igual al precio de la prenda");
}

// 30. El filtro del catálogo escribe la regla de fn_precio_en_sede a mano (para no llamar una función por variante): las dos dicen lo
//     mismo en CADA variante, en Trujillo, en Lima y sin tienda, con precios propios, la de obsequio y una prenda de ropa en 0.
const FILTRO_Y_REGLA = `select string_agg(s.n || '=' || (select count(*) from retail.fn_productos_filtro(p_ubicacion_id => s.id) f
                                       where f.precio is distinct from retail.fn_precio_en_sede(f.variante_id, s.id)), ',' order by s.n)
  from (select 'Lima' as n, :'lima'::uuid as id union all select 'Trujillo', :'tru'::uuid union all select 'sin tienda', null::uuid) s;`;
const CON_PRECIOS_PROPIOS = `${EMPAQUE}${PONER_BOLSA_EN_TRUJILLO}
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Más cara aquí') as _q \\gset
select retail.poner_precio_sede(:'p1', :'lima', :general - 5, 'Más barata aquí') as _r \\gset
update retail.variantes set precio = 0 where id = :'v1';
`;
regla(
  "30",
  "el filtro del catálogo y fn_precio_en_sede dicen lo mismo en cada variante (Trujillo, Lima y sin tienda), con la bolsa y con la ropa en 0",
  FELIPE,
  `${CON_PRECIOS_PROPIOS}${FILTRO_Y_REGLA}`,
  "Lima=0,sin tienda=0,Trujillo=0",
);

for (const c of REGLA) {
  const r = correr(c.uid, c.sql);
  esperar(`${c.clave} · ${c.nombre}`, cumple(r, c.espera), r);
}

// 31. MUTANTES: la prueba no está ciega. Cada uno rompe la regla en UNA de las seis funciones (dentro de la transacción, vuelve con el
//     ROLLBACK): «ropa → obsequio» toma toda talla en 0 por la de obsequio (`true` en vez de la categoría) y «obsequio → ropa» le pone el
//     precio de la tienda a la de obsequio (`false`). Cada uno lo tiene que matar al menos uno de los escenarios que dice (`mata`).
{
  const EN_PR = "retail.fn_categoria_admite_precio_cero(pr.categoria_id)";
  const EN_P = "retail.fn_categoria_admite_precio_cero(p.categoria_id)";
  const MUTANTES = [
    ["fn_precio_en_sede", EN_PR, ["24b", "25c"], ["24a", "25a"]],
    ["fn_productos_filtro", EN_P, ["24b", "30"], ["24a", "30"]],
    ["poner_precio_sede", EN_PR, ["24b", "27a"], ["24a", "26a"]],
    ["quitar_precio_sede", EN_PR, ["29b"], ["28b"]],
    ["fn_precio_sede_depurar", EN_PR, ["29a"], ["28a", "28c"]],
    ["fn_precios_sede_producto", EN_PR, ["24b", "27a"], ["24a"]],
  ];
  for (const [funcion, de, mataRopa, mataObsequio] of MUTANTES) {
    for (const [sentido, a, mata] of [["ropa → obsequio", "true", mataRopa], ["obsequio → ropa", "false", mataObsequio]]) {
      // El texto a romper tiene que estar en la función viva: si no, el mutante «moriría» por su propio error y la prueba mentiría.
      const hay = correr(FELIPE, `select position($q$${de}$q$ in pg_get_functiondef(p.oid)) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname = '${funcion}';`);
      if (ultima(hay) !== "t") {
        esperar(`MUTANTE ${funcion} (${sentido}): la función ya no pregunta «${de}» (actualiza el mutante)`, false, hay);
        continue;
      }
      const quien = REGLA.filter((c) => mata.includes(c.clave)).find((c) => cumple(correr(c.uid, MUTAR(funcion, de, a) + c.sql), c.espera) === false);
      esperar(`MUTANTE ${funcion} (${sentido}): ${quien ? `lo ve el escenario ${quien.clave}` : `VIVO, no lo ve ${mata.join(" ni ")}`}`, !!quien, null);
    }
  }
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

#!/usr/bin/env node
/**
 * Prueba del precio propio por sede (`20261010100000_precio_propio_por_sede.sql`, Felipe 2026-10-09).
 *
 * QUÉ CUBRE
 *   · poner un precio en una sede cambia `fn_precio_en_sede` SOLO ahí; las demás siguen con el general;
 *   · cada variante deja su fila `precio_sede` en el historial, firmada;
 *   · volver a poner el mismo precio no cambia nada; poner el precio general no se guarda como excepción;
 *   · cambiar el precio archiva el anterior (la tabla guarda los dos) y quitarlo vuelve al general;
 *   · quien ve «Productos» solo toca SU tienda; sin el módulo, nada; el Taller no tiene precio propio;
 *   · la tabla no se borra, no se edita y no se lee directo con una sesión.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (como `historial_prenda.mjs`): la base compartida queda igual.
 *
 * USO
 *   node scripts/pruebas/precio_sede.mjs    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo, ve Productos (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Otra vez');`);
  esperar("el mismo precio otra vez devuelve 0 cambios", ultima(r) === "0", r);
}

// 3. El precio general no es una excepción.
{
  const r = correr(FELIPE, `select retail.poner_precio_sede(:'p1', :'tru', :general, 'Igual que todos');`);
  esperar("poner el precio general se rechaza", fallaCon(r, "ya es el precio general"), r);
}

// 4. Cambiar el precio archiva el anterior; quitarlo vuelve al general.
{
  const r = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Primero');
select retail.poner_precio_sede(:'p1', :'tru', :general + 20, 'Después');
select concat_ws('|', ((select count(*) from retail.precios_sede ps join retail.variantes v on v.id = ps.variante_id
          where v.producto_id = :'p1' and ps.ubicacion_id = :'tru') = 2 * :nvar)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general + 20)::text);
select retail.quitar_precio_sede(:'p1', :'tru', null) as q \\gset
select concat_ws('|', (:q = :nvar)::text,
  (retail.fn_precio_en_sede(:'v1', :'tru') = :general)::text,
  (select count(*) = 0 from retail.precios_sede ps join retail.variantes v on v.id = ps.variante_id
               where v.producto_id = :'p1' and ps.archivado_en is null)::text);`);
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
delete from retail.precios_sede where ubicacion_id = :'tru';`);
  esperar("un precio de sede no se borra", fallaCon(borrar, "no se borra"), borrar);
  const editar = correr(FELIPE, `
select retail.poner_precio_sede(:'p1', :'tru', :general + 10, 'Para editar');
update retail.precios_sede set precio = 1 where ubicacion_id = :'tru';`);
  esperar("un precio de sede no se edita", fallaCon(editar, "no se edita"), editar);
  const leer = correr(FELIPE, `set local role authenticated; select count(*) from retail.precios_sede;`);
  esperar("una sesión no lee la tabla directo", fallaCon(leer, "permission denied"), leer);
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
  const puso = l.find((x) => x.includes("precio propio en Tienda Trujillo")) ?? "";
  esperar(
    "Actividad dice «precio propio en Tienda Trujillo S/ … → S/ …», sin JSON",
    /precio propio en Tienda Trujillo S\/\s*[\d.,]+ → S\/\s*[\d.,]+/.test(puso) && !l.some((x) => x.includes("{")),
    r,
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

if (fallos) {
  console.log(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo en verde.");

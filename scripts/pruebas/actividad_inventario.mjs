#!/usr/bin/env node
/**
 * Prueba de ADR-0207, «Actualización 2026-10-02» — Existencias, Conteos y Traslados anotan su actividad
 * (`20261002233000_actividad_existencias_conteos_traslados.sql`).
 *
 * QUÉ CUBRE (con las mismas funciones que llaman las pantallas):
 *   · Existencias: ajustar dos prendas, cargar stock con bajada al piso, bajar al piso, subir al almacén: UNA línea por
 *     operación (no una por prenda), con quien firmó, la sede y lo que pasó;
 *   · la carga que nace con un producto nuevo no se anota en Existencias (es de Productos);
 *   · Conteos: abrir, cerrar con diferencia (y el ajuste del cierre NO sale también en Existencias), cancelar;
 *   · Traslados: enviar, recibir con faltantes, cerrar con diferencia y anular; las líneas llevan origen y destino;
 *   · una venta no deja línea en Existencias;
 *   · si anotar falla, el ajuste se guarda igual (principio 9).
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido), sesión
 * simulada con `request.jwt.claim.sub`. `set constraints all immediate` dispara en el momento lo que en producción corre
 * al confirmar. Ojo: dentro de una transacción `now()` no cambia, así que el stock de partida se pone con un movimiento
 * que no es de Existencias (si fuera una carga, se juntaría con la operación que se prueba).
 *
 * USO
 *   pnpm pruebas:actividad-inventario    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' limit 1 \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' limit 1 \\gset
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2 from retail.variantes where sku = 'BLU-EMMA-BEI-S' \\gset
-- Una prenda sin ningún movimiento en TRU, para la carga inicial (solo se permite en prendas sin historia en la sede).
select v.id as v0 from retail.variantes v
 where v.activo and not exists (select 1 from retail.movimientos m where m.variante_id = v.id and m.ubicacion_id = :'tru')
 order by v.sku limit 1 \\gset
-- Stock de partida en TRU (10 en almacén y 10 en piso de cada una), con un motivo que no es de Existencias.
with nuevos as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v, :'tru', s, 'entrada', 10, 'colchón de prueba'
    from unnest(array[:'v1', :'v2']::uuid[]) v cross join unnest(array[:'alm', :'piso']::uuid[]) s
  returning id
) select count(retail.fn_aplicar_movimiento(id)) as _stock from nuevos \\gset
-- Las líneas que había antes de la prueba no cuentan.
select coalesce(max(id), 0) as antes from retail.actividad \\gset
`;

/** Las líneas nuevas: «modulo,accion» de cada una, en orden. */
const NUEVAS = `select coalesce(string_agg(modulo || ':' || accion, ',' order by id), '-') from retail.actividad where id > :antes;`;
const NUEVAS_DE = (modulo) => `select count(*) || '|' || coalesce(min(descripcion), '') || '|' || coalesce(bool_and(persona_id = :'felipe')::text, '') || '|' || coalesce(bool_and(ubicacion_id = :'tru')::text, '')
  from retail.actividad where id > :antes and modulo = '${modulo}';`;
const items = (...pares) => `jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);
const partes = (r) => (ultima(r) ?? "").split("|");

// 1. Ajustar dos prendas: una sola línea, con las dos y el motivo.
{
  const r = correr(`
select retail.ajustar_inventario(:'tru', :'alm', ${items(["v1", 2], ["v2", -1])}, 'merma', '[]'::jsonb, false, 'se mojaron', gen_random_uuid()) as _a \\gset
set constraints all immediate;
${NUEVAS_DE("existencias")}`);
  const [n, desc, esFelipe, esTru] = partes(r);
  esperar(
    "ajustar dos prendas deja UNA línea en Existencias, con las dos, el motivo y la nota",
    n === "1" && /^ajustó «.+» [+−]\d y «.+» [+−]\d en el almacén/.test(desc) && desc.includes("+2") && desc.includes("−1") &&
      desc.includes("en el almacén · motivo: merma · se mojaron") && esFelipe === "true" && esTru === "true",
    r,
  );
}

// 2. Cargar stock desde «Ajustar stock» con bajada al piso: una línea de carga que dice cuántas fueron al piso, y la
//    bajada no sale aparte.
{
  const r = correr(`
select retail.ajustar_inventario(:'tru', :'alm', '[]'::jsonb, 'otro', ${items(["v0", 3])}, true, null, gen_random_uuid()) as _a \\gset
set constraints all immediate;
${NUEVAS}
${NUEVAS_DE("existencias")}`);
  const lineas = r.ok ? r.salida.split("\n").filter(Boolean) : [];
  const [n, desc] = partes(r);
  esperar(
    "cargar stock con bajada al piso: una línea «cargó stock inicial … · 3 al piso», sin línea de bajada aparte",
    lineas.at(-2) === "existencias:stock_cargado" && n === "1" && /^cargó stock inicial: 3 × «.+» \(3 prendas\) · 3 al piso$/.test(desc),
    r,
  );
}

// 3. Bajar al piso dos prendas.
{
  const r = correr(`
select retail.bajar_al_piso(:'tru', ${items(["v1", 2], ["v2", 1])}, gen_random_uuid()) as _b \\gset
set constraints all immediate;
${NUEVAS_DE("existencias")}`);
  const [n, desc, esFelipe] = partes(r);
  esperar(
    "bajar al piso deja UNA línea «bajó al piso 2 × «…» y «…»», firmada",
    n === "1" && desc.startsWith("bajó al piso ") && desc.includes("2 × «") && desc.includes(" y «") && esFelipe === "true",
    r,
  );
}

// 4. Subir al almacén (retirar del piso), con nota.
{
  const r = correr(`
select retail.retirar_del_piso(:'tru', ${items(["v2", 4])}, 'cambio de vitrina', gen_random_uuid()) as _r \\gset
set constraints all immediate;
${NUEVAS_DE("existencias")}`);
  const [n, desc] = partes(r);
  esperar("subir al almacén deja «subió al almacén 4 × «…» · cambio de vitrina»", n === "1" && /^subió al almacén 4 × «.+» · cambio de vitrina$/.test(desc), r);
}

// 5. El stock que nace con un producto nuevo es de Productos: no sale en Existencias.
{
  const r = correr(`
insert into retail.productos (referencia, estado) values ('ZZ Actividad producto nuevo', 'activo') returning id as p \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p', 'ZZ-ACT-NUEVO', 100, 40, true) returning id as vn \\gset
select retail.ajustar_inventario(:'tru', :'alm', '[]'::jsonb, 'otro', ${items(["vn", 2])}, false, null, gen_random_uuid()) as _a \\gset
set constraints all immediate;
${NUEVAS_DE("existencias")}`);
  esperar("el stock que se carga al crear un producto no sale en Existencias", partes(r)[0] === "0", r);
}

// 6. Una venta no deja línea en Existencias (la cuenta el Punto de venta).
{
  const r = correr(`
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo) values (:'v1', :'tru', :'piso', 'salida', 1, 'venta');
set constraints all immediate;
${NUEVAS_DE("existencias")}`);
  esperar("un movimiento de venta no deja línea en Existencias", partes(r)[0] === "0", r);
}

// 7. Conteo: abrir, contar una con diferencia, cerrar. El ajuste del cierre no sale también en Existencias.
{
  const r = correr(`
select retail.abrir_conteo(p_ubicacion_id => :'tru', p_sububicacion_id => :'alm') as conteo \\gset
set constraints all immediate;
select (select cantidad_sistema from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'v1') as sis \\gset
select retail.conteo_contar(:'conteo', :'v1', (:'sis')::integer - 2, true);
select retail.conteo_confirmar_diferencia(:'conteo', :'v1');
select retail.cerrar_conteo(:'conteo', true);
set constraints all immediate;
${NUEVAS}
select coalesce(string_agg(descripcion, ' // ' order by id), '-') from retail.actividad where id > :antes and modulo = 'conteos';`);
  const lineas = r.ok ? r.salida.split("\n").filter(Boolean) : [];
  const descs = lineas.at(-1) ?? "";
  esperar(
    "un conteo deja «abrió» y «cerró … 1 con diferencia (faltaron 2)», y nada en Existencias",
    lineas.at(-2) === "conteos:conteo_abierto,conteos:conteo_cerrado" &&
      /^abrió el conteo \d+ del almacén de tienda · todo/.test(descs) && /cerró el conteo \d+: .*1 con diferencia \(faltaron 2\)/.test(descs),
    r,
  );
}

// 8. Cancelar un conteo.
{
  const r = correr(`
select retail.abrir_conteo(p_ubicacion_id => :'tru', p_sububicacion_id => :'alm') as conteo \\gset
set constraints all immediate;
select retail.anular_conteo(:'conteo');
set constraints all immediate;
${NUEVAS}`);
  esperar("cancelar un conteo deja «canceló»", ultima(r) === "conteos:conteo_abierto,conteos:conteo_cancelado", r);
}

// 9. Traslado: enviar, recibir con faltantes y cerrar con diferencia. Las líneas llevan las dos sedes.
{
  const r = correr(`
select retail.iniciar_traslado(:'tru', :'lim', ${items(["v1", 3])}, now() + interval '1 day', 'para la vitrina') as tr \\gset
set constraints all immediate;
select retail.registrar_recepcion_traslado(:'tr', :'v1', 2) as _rec \\gset
select retail.confirmar_traslado(:'tr') as _c \\gset
select retail.cerrar_traslado_con_diferencia(:'tr', 'una se perdió') as _x \\gset
set constraints all immediate;
${NUEVAS}
select string_agg(descripcion, ' // ' order by id) || '|' || bool_and(ubicacion_id = :'tru' and ubicacion_destino_id = :'lim')
  from retail.actividad where id > :antes and modulo = 'traslados';`);
  const lineas = r.ok ? r.salida.split("\n").filter(Boolean) : [];
  const [descs, dosSedes] = (lineas.at(-1) ?? "").split("|");
  esperar(
    "un traslado deja «envió», «recibió … llegaron 2 de 3, faltan 1» y «cerró … con diferencia», con origen y destino",
    lineas.at(-2) === "traslados:traslado_enviado,traslados:traslado_recibido,traslados:traslado_cerrado" &&
      /^envió 3 prendas a Tienda Lima · traslado \d+ · para la vitrina/.test(descs) &&
      descs.includes("llegaron 2 de 3, faltan 1") && descs.includes("con diferencia: llegaron 2 de 3 · una se perdió") && dosSedes === "true",
    r,
  );
}

// 10. Recibir todo: una sola línea (recibir y cerrar son la misma operación).
{
  const r = correr(`
select retail.iniciar_traslado(:'tru', :'lim', ${items(["v1", 1])}, now() + interval '1 day') as tr \\gset
set constraints all immediate;
select retail.registrar_recepcion_traslado(:'tr', :'v1', 1) as _rec \\gset
select retail.confirmar_traslado(:'tr') as _c \\gset
set constraints all immediate;
${NUEVAS}
select min(descripcion) from retail.actividad where id > :antes and accion = 'traslado_recibido';`);
  const lineas = r.ok ? r.salida.split("\n").filter(Boolean) : [];
  esperar(
    "recibir todo deja «envió» y «recibió … llegaron la prenda», sin cierre aparte",
    lineas.at(-2) === "traslados:traslado_enviado,traslados:traslado_recibido" && /llegaron la prenda$/.test(lineas.at(-1) ?? ""),
    r,
  );
}

// 11. Anular un traslado.
{
  const r = correr(`
select retail.iniciar_traslado(:'tru', :'lim', ${items(["v2", 2])}, now() + interval '1 day') as tr \\gset
select retail.anular_traslado(:'tr', 'me equivoqué de sede', gen_random_uuid()) as _x \\gset
set constraints all immediate;
select string_agg(descripcion, ' // ' order by id) from retail.actividad where id > :antes and accion = 'traslado_anulado';`);
  esperar(
    "anular un traslado deja «anuló … (2 prendas vuelven al origen) · motivo: …»",
    /^anuló el traslado \d+ a Tienda Lima \(2 prendas vuelven al origen\) · motivo: me equivoqué de sede$/.test(ultima(r) ?? ""),
    r,
  );
}

// 12. Si anotar falla, el ajuste se guarda igual.
{
  const r = correr(`
alter table retail.actividad add constraint prueba_siempre_falla check (false) not valid;
select retail.ajustar_inventario(:'tru', :'alm', ${items(["v1", 1])}, 'otro', '[]'::jsonb, false, null, gen_random_uuid()) as _a \\gset
set constraints all immediate;
select (select count(*) from retail.movimientos where variante_id = :'v1' and tipo = 'ajuste' and created_at = now()) || '|' ||
       (select count(*) from retail.actividad where id > :antes);`);
  esperar("si el historial falla, el ajuste se guarda igual (y no queda línea)", ultima(r) === "1|0", r);
}

// 13. La web no puede llamar a las funciones que anotan.
{
  const r = correr(`set local role authenticated;
select has_function_privilege('authenticated', 'retail.fn_actividad_inventario(uuid, text)', 'execute') || '|' ||
       has_function_privilege('authenticated', 'retail.fn_actividad_traslado_enviado(uuid, text)', 'execute') || '|' ||
       has_function_privilege('authenticated', 'retail.fn_actividad_conteo_reabierto(uuid)', 'execute');`);
  esperar("la web no puede anotar a mano", ultima(r) === "false|false|false", r);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);

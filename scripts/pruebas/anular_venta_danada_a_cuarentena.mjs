#!/usr/bin/env node
/**
 * Prueba de `20261128161000_anular_venta_danada_a_cuarentena.sql` (auditoría 2026-11-28, hallazgo N.º 1): anular una venta con
 * una línea «Dañada para reparar», «Dañada para donar» o «Devolver al proveedor» deja la prenda en la cuarentena de la tienda y
 * en la cola de Dañadas, igual que una devolución (ADR-0071). Antes la venta se anulaba sin mover stock: la prenda seguía en la
 * tienda sin figurar ni en el stock ni en Dañadas.
 *
 * La escena es una venta REAL (`registrar_venta`) de Tienda Lima con stock de sobra, anulada con `anular_venta` como el líder
 * del seed. Cada caso corre en una transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: la base no cambia.
 * El CONTROL deshace la rama nueva de `anular_venta` (el reemplazo al revés, leído del archivo de la migración) y muestra el
 * hueco: con eso, la base de antes.
 *
 * Qué mira cada condición dañada: (1) la anulación guarda su movimiento; (2) el movimiento es una entrada a la cuarentena con
 * motivo `anulacion_venta`; (3) nace la fila de Dañadas que apunta a ese movimiento; (4) el stock de la cuarentena de la tienda
 * es igual a lo que Dañadas tiene vivo; (5) ya no es pérdida el día que se anula (la pérdida llega al resolverla) y en la
 * contabilidad el costo vuelve a la mercadería, sin 6951. Y que «Vendible» sigue igual: vuelve al lugar de donde salió.
 *
 * Y la prenda de una aliada (CLAURE): su anulación dañada entra a Dañadas igual, pero el Diario de CAYLA no se queda con ella. Entre
 * la venta, la anulación y sus reclasificaciones (`claure:`, `claure_anul:`) toda cuenta neta 0, también la 201 y la 6951; y al
 * resolverla en Dañadas CAYLA no asienta merma (era de CLAURE). Su CONTROL deshace solo el paso 5 (`fn_aliada_ventas`) y muestra
 * la 201 de CAYLA con el costo de una prenda ajena.
 *
 * USO: node scripts/pruebas/anular_venta_danada_a_cuarentena.mjs   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEGIR_A } from "./_claure_prendas.mjs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261128161000_anular_venta_danada_a_cuarentena.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

// El «cómo se deshace» de la rama nueva de `anular_venta`: el reemplazo al revés (el texto nuevo vuelve a ser el ancla).
const [, VIEJO, NUEVO] = MIGRACION.match(
  /'retail\.anular_venta\(uuid, text, jsonb\)',\n  \$v\$([\s\S]*?)\$v\$,\n  \$n\$([\s\S]*?)\$n\$\n\);/
);
const DESHACER = `
do $d$ declare v text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
begin execute replace(v, $b$${NUEVO}$b$, $b$${VIEJO}$b$); end $d$;
`;

// El paso 5 al revés: `fn_aliada_ventas` vuelve a la regla vieja (sus dos reemplazos, leídos del archivo).
const PASOS_ALIADA = [
  ...MIGRACION.matchAll(
    /'retail\.fn_aliada_ventas\(uuid, date, date, boolean, uuid\[\]\)',\n  \$v\$([\s\S]*?)\$v\$,\n  \$n\$([\s\S]*?)\$n\$\n\);/g
  ),
];
if (PASOS_ALIADA.length !== 2) throw new Error(`se esperaban 2 reemplazos de fn_aliada_ventas en la migración, hay ${PASOS_ALIADA.length}`);
const DESHACER_ALIADA = `
do $d$ declare v text := pg_get_functiondef('retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[])'::regprocedure);
begin
${PASOS_ALIADA.map(([, viejo, nuevo]) => `  v := replace(v, $b$${nuevo}$b$, $b$${viejo}$b$);`).join("\n")}
  execute v;
end $d$;
`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

// Tienda Lima lista para vender (el mismo fixture de comprobante_venta_anulada.mjs): piso y almacén, caja propia y stock de
// sobra de dos variantes en el piso.
const FIXTURE = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v1, precio as p1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2, precio as p2 from retail.variantes where sku = 'BLU-EMMA-BEI-S' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
select id as sub_cuar from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v2', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2') as _d2 \\gset
`;

/** Una venta de 2 unidades de v1 (y, si `dosLineas`, 1 de v2) en efectivo; deja `:venta`, `:item1` y `:item2`. */
const VENTA = (dosLineas) => `
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2, 'precio_unitario', :'p1', 'descuento_unitario', 0)
    ${dosLineas ? `, jsonb_build_object('variante_id', :'v2', 'cantidad', 1, 'precio_unitario', :'p2', 'descuento_unitario', 0)` : ""}),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${dosLineas ? `2 * :p1 + :p2` : `2 * :p1`})),
  null, gen_random_uuid()) as venta \\gset
select (select id from retail.venta_items where venta_id = :'venta' and variante_id = :'v1') as item1,
       coalesce((select id from retail.venta_items where venta_id = :'venta' and variante_id = :'v2')::text, '') as item2 \\gset
`;

/** El stock de la cuarentena de la tienda y lo que Dañadas tiene vivo ahí, para v1 y en total. */
const FOTO_CUARENTENA = (prefijo) => `
select '${prefijo}_cuar_v1|' || coalesce((select sum(cantidad) from retail.stock where sububicacion_id = :'sub_cuar' and variante_id = :'v1'), 0);
select '${prefijo}_danadas_v1|' || coalesce((select sum(cantidad) from retail.prendas_danadas where ubicacion_id = :'ubic' and variante_id = :'v1' and estado = 'en_cuarentena'), 0);
select '${prefijo}_piso_v1|' || coalesce((select sum(cantidad) from retail.stock where sububicacion_id = :'sub_piso' and variante_id = :'v1'), 0);
select '${prefijo}_cuar_total|' || coalesce((select sum(cantidad) from retail.stock where sububicacion_id = :'sub_cuar'), 0);
select '${prefijo}_danadas_total|' || coalesce((select sum(cantidad) from retail.prendas_danadas where ubicacion_id = :'ubic' and estado = 'en_cuarentena'), 0);
`;

/** Lo que queda de la anulación de :item1 (y, si hay, :item2). */
const LO_QUE_QUEDO = `
select 'estado|' || estado from retail.ventas where id = :'venta';
select 'mov|' || coalesce(ai.movimiento_id::text, '') from retail.venta_anulacion_items ai where ai.venta_item_id = :'item1';
select 'mov_forma|' || m.tipo || '|' || (m.sububicacion_id = :'sub_cuar')::text || '|' || (m.sububicacion_id = :'sub_piso')::text || '|' || m.motivo || '|' || m.cantidad
  from retail.venta_anulacion_items ai join retail.movimientos m on m.id = ai.movimiento_id where ai.venta_item_id = :'item1';
select 'danada|' || pd.estado || '|' || pd.cantidad || '|' || pd.motivo_reporte
  from retail.venta_anulacion_items ai join retail.prendas_danadas pd on pd.movimiento_entrada_id = ai.movimiento_id
 where ai.venta_item_id = :'item1';
select 'danadas_de_la_venta|' || count(*)
  from retail.prendas_danadas pd join retail.movimientos m on m.id = pd.movimiento_entrada_id
 where m.venta_item_id in (select id from retail.venta_items where venta_id = :'venta');
select 'perdida_anulacion|' || count(*) from retail.fn_perdidas_hechos(:'ubic', now() - interval '1 hour', now() + interval '1 hour')
 where fuente = 'anulacion' and documento_id = :'venta';
select 'asiento_6951|' || count(*) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'ubic')
 where asiento = 'anulacion:' || :'venta' and cuenta = '6951';
select 'asiento_201_cuadra|' || (
  (select coalesce(sum(debe), 0) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'ubic')
    where asiento = 'anulacion:' || :'venta' and cuenta = '201')
  = (select coalesce(sum(costo_unitario * cantidad), 0) from retail.venta_items where venta_id = :'venta'))::text;
`;

/** Arma la escena, anula con esas condiciones y devuelve un lector de las claves. */
function anular({ cond1, cond2 = null, migracion = true, deshacer = false, despues = "" }) {
  const items = `jsonb_build_array(jsonb_build_object('venta_item_id', :'item1', 'condicion', '${cond1}')
    ${cond2 ? `, jsonb_build_object('venta_item_id', :'item2', 'condicion', '${cond2}')` : ""})`;
  const salida = psql(`
begin;
${migracion ? MIGRACION : ""}
${deshacer ? DESHACER : ""}
${FIXTURE}
${VENTA(Boolean(cond2))}
${FOTO_CUARENTENA("antes")}
select retail.anular_venta(:'venta', 'prueba F1', ${items}) as _anulo \\gset
${FOTO_CUARENTENA("despues")}
${LO_QUE_QUEDO}
${despues}
rollback;
`);
  const lineas = salida.split("\n");
  const dato = (clave) => lineas.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);
  const num = (clave) => Number(dato(clave));
  return { dato, num, salida };
}

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

/** Las comprobaciones de una línea dañada anulada. */
function revisarDanada(r, textoCondicion) {
  if (r.dato("estado") !== "anulada") return `estado: ${r.dato("estado")}`;
  if (!r.dato("mov")) return "venta_anulacion_items.movimiento_id quedó vacío";
  if (r.dato("mov_forma") !== "entrada|true|false|anulacion_venta|2") return `el movimiento no es una entrada a la cuarentena: ${r.dato("mov_forma")}`;
  const danada = r.dato("danada");
  if (!danada || !danada.startsWith(`en_cuarentena|2|Venta anulada ${textoCondicion}: prueba F1`)) return `la fila de Dañadas no está o no apunta al movimiento: ${danada}`;
  if (r.num("despues_cuar_v1") - r.num("antes_cuar_v1") !== 2) return `la cuarentena no subió 2 (antes ${r.dato("antes_cuar_v1")}, después ${r.dato("despues_cuar_v1")})`;
  if (r.num("despues_cuar_v1") !== r.num("despues_danadas_v1")) return `cuarentena ${r.dato("despues_cuar_v1")} contra dañadas vivas ${r.dato("despues_danadas_v1")}`;
  if (r.num("despues_cuar_total") - r.num("despues_danadas_total") !== r.num("antes_cuar_total") - r.num("antes_danadas_total"))
    return "la cuarentena de la tienda y Dañadas se separaron";
  if (r.num("despues_piso_v1") !== r.num("antes_piso_v1")) return `el piso cambió (${r.dato("antes_piso_v1")} → ${r.dato("despues_piso_v1")}): la dañada no vuelve a la venta`;
  if (r.num("perdida_anulacion") !== 0) return "la anulación sigue contando como pérdida el día que se anula";
  if (r.num("asiento_6951") !== 0) return "la contabilidad todavía la manda a merma (6951) al anular";
  if (r.dato("asiento_201_cuadra") !== "true") return "el costo no vuelve entero a la mercadería (201)";
}

caso("CONTROL: sin la rama nueva, anular con «Dañada para donar» no mueve stock ni crea la dañada (el hueco existía)", () => {
  const r = anular({ cond1: "danada_donar", deshacer: true });
  if (r.dato("estado") !== "anulada") return `estado: ${r.dato("estado")}`;
  if (r.dato("mov") !== "") return `ya había movimiento: ${r.dato("mov")}`;
  if (r.num("danadas_de_la_venta") !== 0) return "ya había fila en Dañadas";
  if (r.num("despues_cuar_v1") !== r.num("antes_cuar_v1")) return "ya subía la cuarentena";
  // Lo de antes sigue contando como pérdida el día de la anulación (las filas viejas, sin movimiento, no cambian).
  if (r.num("perdida_anulacion") !== 1) return `la anulación vieja dejó de ser pérdida: ${r.dato("perdida_anulacion")}`;
  if (r.num("asiento_6951") !== 1) return `la anulación vieja dejó de ir a 6951: ${r.dato("asiento_6951")}`;
});

for (const [condicion, texto] of [
  ["danada_donar", "para donar"],
  ["danada_reparacion", "para reparar"],
  ["devolver_proveedor", "para devolver al proveedor"],
]) {
  caso(`«${condicion}»: entra a la cuarentena y a Dañadas, y no es pérdida hasta resolverse`, () => revisarDanada(anular({ cond1: condicion }), texto));
}

caso("«Vendible» sigue igual: vuelve al piso de donde salió y no crea dañada", () => {
  const r = anular({ cond1: "vendible" });
  if (r.dato("estado") !== "anulada") return `estado: ${r.dato("estado")}`;
  if (r.dato("mov_forma") !== "entrada|false|true|anulacion_venta|2") return `el movimiento no vuelve al piso: ${r.dato("mov_forma")}`;
  if (r.num("danadas_de_la_venta") !== 0) return "creó una fila en Dañadas";
  if (r.num("despues_piso_v1") - r.num("antes_piso_v1") !== 2) return "el piso no subió 2";
  if (r.num("despues_cuar_v1") !== r.num("antes_cuar_v1")) return "la cuarentena cambió";
  if (r.num("asiento_6951") !== 0 || r.dato("asiento_201_cuadra") !== "true") return "la contabilidad de «Vendible» cambió";
});

caso("una venta con una línea vendible y otra dañada: cada una va a su lugar", () => {
  const r = anular({
    cond1: "danada_reparacion",
    cond2: "vendible",
    despues: `
select 'mov2|' || (m.sububicacion_id = :'sub_piso')::text || '|' || m.cantidad
  from retail.venta_anulacion_items ai join retail.movimientos m on m.id = ai.movimiento_id where ai.venta_item_id = :'item2';`,
  });
  const lineas = r.salida.split("\n");
  const mov2 = lineas.find((l) => l.startsWith("mov2|"));
  if (mov2 !== "mov2|true|1") return `la línea vendible no volvió al piso: ${mov2}`;
  if (r.num("danadas_de_la_venta") !== 1) return `dañadas de la venta: ${r.dato("danadas_de_la_venta")}`;
  return revisarDanada(r, "para reparar");
});

caso("resuelta en Dañadas como donada, la pérdida se cuenta una sola vez (por la salida de la cuarentena)", () => {
  const r = anular({
    cond1: "danada_donar",
    despues: `
select pd.id as danada_id from retail.venta_anulacion_items ai join retail.prendas_danadas pd on pd.movimiento_entrada_id = ai.movimiento_id
 where ai.venta_item_id = :'item1' \\gset
select retail.resolver_prenda_danada(:'danada_id', 'donada') as _resolvio \\gset
select 'perdidas_v1|' || coalesce(sum(unidades), 0) from retail.fn_perdidas_hechos(:'ubic', now() - interval '1 hour', now() + interval '1 hour')
 where variante_id = :'v1' and lado = 'perdida' and (fuente = 'anulacion' or fuente_id in (
   select movimiento_salida_id from retail.prendas_danadas where id = :'danada_id'));
select 'cuar_final|' || coalesce((select sum(cantidad) from retail.stock where sububicacion_id = :'sub_cuar' and variante_id = :'v1'), 0)
  || '|' || coalesce((select sum(cantidad) from retail.prendas_danadas where ubicacion_id = :'ubic' and variante_id = :'v1' and estado = 'en_cuarentena'), 0);`,
  });
  const lineas = r.salida.split("\n");
  const perdidas = lineas.find((l) => l.startsWith("perdidas_v1|"));
  if (perdidas !== "perdidas_v1|2") return `pérdidas de v1: ${perdidas}`;
  const [, cuar, vivas] = (lineas.find((l) => l.startsWith("cuar_final|")) ?? "").split("|");
  if (cuar !== vivas) return `tras resolver: cuarentena ${cuar} contra dañadas vivas ${vivas}`;
});

/**
 * Una prenda de CLAURE (la prenda A de `_claure_prendas.mjs`, que pasa a ser suya dentro de la transacción) vendida en Tienda Lima,
 * donde CLAURE opera, y anulada con esa condición. Devuelve el neto de cada cuenta del Diario entre todos los asientos de esa venta
 * (venta, claure, anulacion, claure_anul): la venta y su anulación se deshacen, así que todo neto tiene que ser 0.
 */
function anularDeClaure({ cond, deshacerAliada = false, despues = "" }) {
  const salida = psql(`
begin;
${MIGRACION}
${deshacerAliada ? DESHACER_ALIADA : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
-- Tienda Lima con las dos dueñas (como en producción): CAYLA y CLAURE. Así el libro lleva el dueño de cada unidad.
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (retail.fn_empresa_casa_id(), :'ubic') on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'ubic') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = least(coalesce(cuenta_corriente_desde, retail.fn_hoy_lima()), retail.fn_hoy_lima() - 10)
 where id = :'claure';
${ELEGIR_A}
update retail.productos set empresa_id = :'claure' where id = :'p_a';
update retail.variantes set costo = 40 where id = :'va_a';
select precio as pa from retail.variantes where id = :'va_a' \\gset
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id)
  values (:'va_a', :'ubic', :'sub_piso', 'entrada', 10, 'colchón de prueba', :'claure') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'va_a', 'cantidad', 1, 'precio_unitario', :'pa', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'pa')), null, gen_random_uuid()) as venta \\gset
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select 'de_claure|' || (retail.fn_dueno_de_la_linea(:'item') = :'claure')::text;
select retail.anular_venta(:'venta', 'prueba F1', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', '${cond}'))) as _anulo \\gset
select 'mov_claure|' || coalesce((select (m.empresa_id = :'claure')::text from retail.venta_anulacion_items ai
  join retail.movimientos m on m.id = ai.movimiento_id where ai.venta_item_id = :'item'), 'sin movimiento');
select 'danadas|' || count(*) from retail.prendas_danadas pd join retail.venta_anulacion_items ai on ai.movimiento_id = pd.movimiento_entrada_id
 where ai.venta_item_id = :'item';
select 'netos|' || coalesce(string_agg(cuenta || '=' || neto, ',' order by cuenta), '') from (
  select cuenta, sum(debe - haber) as neto from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'ubic')
   where origen_id = :'venta' group by cuenta having sum(debe - haber) <> 0) n;
${despues}
rollback;
`);
  const lineas = salida.split("\n");
  const dato = (clave) => lineas.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);
  return { dato, salida };
}

caso("CLAURE, CONTROL: con la regla vieja en fn_aliada_ventas, la dañada de CLAURE queda en la 201 de CAYLA", () => {
  const r = anularDeClaure({ cond: "danada_donar", deshacerAliada: true });
  if (r.dato("de_claure") !== "true") return "la línea no es de CLAURE: la escena no sirve";
  if (r.dato("netos") !== "201=40.00,6951=-40.00") return `se esperaba el descuadre de la regla vieja, salió: ${r.dato("netos")}`;
});

caso("CLAURE: «Vendible» deja el Diario de CAYLA en 0 (la escena es justa)", () => {
  const r = anularDeClaure({ cond: "vendible" });
  if (r.dato("de_claure") !== "true") return "la línea no es de CLAURE: la escena no sirve";
  if (r.dato("netos") !== "") return `cuentas que no quedaron en 0: ${r.dato("netos")}`;
});

for (const condicion of ["danada_donar", "danada_reparacion", "devolver_proveedor"]) {
  caso(`CLAURE: «${condicion}» entra a Dañadas a nombre de CLAURE y el Diario de CAYLA queda en 0`, () => {
    const r = anularDeClaure({ cond: condicion });
    if (r.dato("de_claure") !== "true") return "la línea no es de CLAURE: la escena no sirve";
    if (r.dato("mov_claure") !== "true") return `el movimiento a la cuarentena no es de CLAURE: ${r.dato("mov_claure")}`;
    if (r.dato("danadas") !== "1") return `filas en Dañadas: ${r.dato("danadas")}`;
    if (r.dato("netos") !== "") return `cuentas que no quedaron en 0 (mercadería ajena en CAYLA): ${r.dato("netos")}`;
  });
}

caso("CLAURE: resuelta en Dañadas como donada, CAYLA no asienta la merma ni la cuenta como pérdida (era de CLAURE)", () => {
  const r = anularDeClaure({
    cond: "danada_donar",
    despues: `
select pd.id as danada_id from retail.venta_anulacion_items ai join retail.prendas_danadas pd on pd.movimiento_entrada_id = ai.movimiento_id
 where ai.venta_item_id = :'item' \\gset
select retail.resolver_prenda_danada(:'danada_id', 'donada') as _resolvio \\gset
select 'asientos_de_la_salida|' || count(*) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'ubic') a
  join retail.prendas_danadas pd on pd.id = :'danada_id' where a.origen_id = pd.movimiento_salida_id;
select 'perdida_cayla|' || count(*) from retail.fn_perdidas_hechos(:'ubic', now() - interval '1 hour', now() + interval '1 hour')
 where variante_id = :'va_a';`,
  });
  if (r.dato("netos") !== "") return `cuentas que no quedaron en 0: ${r.dato("netos")}`;
  if (r.dato("asientos_de_la_salida") !== "0") return `CAYLA asentó la salida de la cuarentena de CLAURE: ${r.dato("asientos_de_la_salida")} líneas`;
  if (r.dato("perdida_cayla") !== "0") return `Pérdidas de CAYLA cuenta la prenda de CLAURE: ${r.dato("perdida_cayla")}`;
});

caso("los rechazos de «Me equivoqué de prenda» y «No estaba dañada» nombran la venta anulada, con el mismo hint", () => {
  const n = psql(`
begin;
${MIGRACION}
select count(*) from (values ('retail.corregir_prenda_danada(uuid, uuid, text, uuid)'), ('retail.devolver_danada_sin_dano(uuid, text, uuid)')) f(firma)
 cross join lateral pg_get_functiondef(f.firma::regprocedure) d
 where position('un cambio, una venta anulada o una recepción' in d) > 0 and position('''danada_no_se_corrige''' in d) > 0;
rollback;`);
  if (n !== "2") return `solo ${n} de 2 funciones nombran la venta anulada`;
});

caso("la función nueva no la puede llamar la web (anon ni authenticated)", () => {
  const n = psql(`
begin;
${MIGRACION}
select count(*) from (values ('anon'), ('authenticated')) r(rol)
 where has_function_privilege(r.rol, 'retail.fn_anulacion_a_danadas(uuid, text, text, uuid)', 'execute');
rollback;`);
  if (n !== "0") return `${n} rol(es) pueden ejecutarla`;
});

caso("la migración se puede pegar dos veces: la rama queda una sola vez", () => {
  const n = psql(`
begin;
${MIGRACION}
${MIGRACION}
select (length(d) - length(replace(d, 'retail.fn_anulacion_a_danadas(', ''))) / length('retail.fn_anulacion_a_danadas(')
  from pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure) d;
rollback;`);
  if (n !== "1") return `la rama aparece ${n} veces`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);

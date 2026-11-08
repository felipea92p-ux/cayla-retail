#!/usr/bin/env node
/**
 * Un día de tienda contra el Postgres local, mirando las invariantes después de CADA paso.
 *
 * EL PROBLEMA QUE RESUELVE. Las ~180 suites de `scripts/pruebas/` prueban cada función por su lado («registrar_venta baja
 * el stock», «aprobar_devolucion exige caja»), y cada una mira lo que ella misma sabe mirar. Lo que ninguna miraba en el CI
 * es el descuadre que cruza tablas y que nadie ve en pantalla: un stock que ya no es la suma de `movimientos`, una venta cuyos
 * pagos no suman sus líneas, una boleta duplicada, una caja cerrada cuya diferencia no es contado − esperado. Esos estados
 * imposibles ya los sabe encontrar el detector de `/chaos` (`scripts/chaos/invariantes.mjs`, 28 invariantes), pero solo
 * corría a mano en la máquina de alguien. Esta suite lo lleva al CI: un PR que rompa una función de plata o de stock de forma
 * que deje la base descuadrada se pone en rojo aunque la suite propia de esa función siga verde.
 *
 * QUÉ HACE. En UNA sola transacción que siempre termina en ROLLBACK (no deja rastro en la base compartida), como Felipe (líder):
 *   inicio           → foto de las violaciones que YA había (el seed y la historia local pueden traer alguna)
 *   abrir caja       → la caja de Tienda Lima, limpia, con fondo de S/ 100, y stock de sobra de 4 prendas
 *   venta efectivo   → 1 Blusa Emma negra M en efectivo, con boleta
 *   venta mixta      → 2 Blusa Emma beige M, efectivo + Yape
 *   anular venta     → se anula la venta mixta (las prendas vuelven vendibles)
 *   cambio           → la Blusa de la venta en efectivo se cambia por el Vestido Sofía; la diferencia (S/ 70) se cobra en efectivo
 *   devolución       → una tercera venta (tarjeta) se devuelve y se reembolsa en efectivo desde la caja
 *   cerrar caja      → se cuenta y se cierra
 * Después de cada paso corre las 28 invariantes con su SQL tal cual (`INVARIANTES` del detector: una sola definición) y
 * falla si aparece una violación que no estaba al inicio. Así el error dice EN QUÉ PASO se descuadró la base.
 *
 * POR QUÉ LAS PRENDAS SON DISTINTAS EN CADA VENTA. Todo pasa en una transacción, así que `now()` es el mismo instante para las
 * tres ventas: dos ventas con las mismas prendas serían, para INV-11, la huella exacta de un doble clic. No es un descuadre de
 * esta suite; es el detector haciendo su trabajo. Por eso cada venta lleva otra prenda.
 *
 * QUÉ NO PROMETE. No prueba la pantalla (eso es `/chaos` en el navegador) ni cada regla de cada función (eso es la suite de cada
 * una). Prueba que el recorrido normal de un día deja la base cuadrada. Una invariante que no se puede evaluar (falta su tabla)
 * hace fallar la suite, nunca la cuenta como limpia.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción (que se revierte), antes del día:
 * sirve para ver si una migración que parcha `registrar_venta` o `cerrar_caja` descuadra algo antes de pegarla en producción.
 *
 * USO
 *   pnpm pruebas:dia-de-tienda    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { INVARIANTES, huellaDe } from "../chaos/invariantes.mjs";

// Como las demás suites: `RETAIL_CONTENEDOR_PG` apunta a otra pila (una base aislada con todas las migraciones, si la compartida va atrás).
const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y las demás suites.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: opera cualquier sede

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Marca de línea que no se confunde con nada que imprima una RPC. */
const MARCA = "@@dia";

/** Corre las 28 invariantes y deja cada violación como `@@dia|<paso>|<INV>|<fila en JSON>`. */
export function mirar(paso) {
  return INVARIANTES.map(
    (inv) =>
      `select '${MARCA}|${paso}|${inv.id}|' || row_to_json(x)::text from (${inv.sql.trim().replace(/;\s*$/, "")}) x;`,
  ).join("\n");
}

// Una línea de venta y un pago, como los manda Vender.
const linea = (variante, cantidad) =>
  `jsonb_build_object('variante_id', :'${variante}', 'cantidad', ${cantidad}, 'precio_unitario', :'${variante}_precio', 'descuento_unitario', 0)`;
const pago = (metodo, monto) => `jsonb_build_object('metodo', '${metodo}', 'monto', ${monto})`;

/** Los pasos del día, en orden. `sql` corre como Felipe; `mirar` se agrega después de cada uno. */
export const PASOS = [
  {
    id: "abrir-caja",
    dice: "abrir la caja de Tienda Lima y sembrar stock de sobra",
    sql: `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
-- Autocuración: el Postgres compartido puede no tener piso/almacén para esta sede (registrar_cambio.mjs lo explica).
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
-- Caja propia: cierra con la RPC real cualquiera que esté abierta (nunca un UPDATE crudo) y abre una nueva.
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada: día de tienda') as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
select id as negm, precio as negm_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as beim, precio as beim_precio from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select id as negs, precio as negs_precio from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select id as sofi, precio as sofi_precio from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select id as felipe_id from public.personas where auth_user_id = '${FELIPE}' \\gset
-- El colchón va firmado (INV-10: ningún movimiento sin responsable) y con cantidades distintas (INV-12: dos entradas
-- idénticas en el mismo instante son la huella de un «Guardar» pulsado dos veces).
${["negm", "beim", "negs", "sofi"]
  .map(
    (v, i) => `insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id)
  values (:'${v}', :'ubic', :'sub_piso', 'entrada', ${50 + 10 * i}, 'colchón de prueba', :'felipe_id') returning id as mov_${v} \\gset
select retail.fn_aplicar_movimiento(:'mov_${v}') as _a_${v} \\gset`,
  )
  .join("\n")}`,
  },
  {
    id: "venta-efectivo",
    dice: "vender 1 Blusa Emma negra M en efectivo, con boleta",
    sql: `
select retail.registrar_venta(:'ubic', jsonb_build_array(${linea("negm", 1)}),
  jsonb_build_array(${pago("efectivo", "(:'negm_precio')::numeric")}), null, gen_random_uuid(), 'boleta') as venta_efectivo \\gset
select id as item_efectivo from retail.venta_items where venta_id = :'venta_efectivo' \\gset`,
  },
  {
    id: "venta-mixta",
    dice: "vender 2 Blusa Emma beige M con efectivo + Yape",
    sql: `
select retail.registrar_venta(:'ubic', jsonb_build_array(${linea("beim", 2)}),
  jsonb_build_array(${pago("efectivo", "100")}, ${pago("yape", "(:'beim_precio')::numeric * 2 - 100")}),
  null, gen_random_uuid()) as venta_mixta \\gset
select id as item_mixta from retail.venta_items where venta_id = :'venta_mixta' \\gset`,
  },
  {
    id: "anular-venta",
    dice: "anular la venta mixta (las prendas vuelven vendibles)",
    sql: `
select retail.anular_venta(:'venta_mixta', 'prueba automatizada: día de tienda',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_mixta', 'condicion', 'vendible'))) as _anulada \\gset`,
  },
  {
    id: "cambio",
    dice: "cambiar la Blusa de la venta en efectivo por el Vestido Sofía, cobrando la diferencia en efectivo",
    sql: `
select retail.registrar_cambio(:'item_efectivo', :'ubic', :'sofi', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset`,
  },
  {
    id: "devolucion",
    dice: "vender 1 Blusa Emma negra S con tarjeta, devolverla y reembolsar en efectivo",
    sql: `
select retail.registrar_venta(:'ubic', jsonb_build_array(${linea("negs", 1)}),
  jsonb_build_array(${pago("tarjeta", "(:'negs_precio')::numeric")}), null, gen_random_uuid()) as venta_devuelta \\gset
select id as item_devuelto from retail.venta_items where venta_id = :'venta_devuelta' \\gset
select retail.crear_devolucion(:'venta_devuelta', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_devuelto', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada: día de tienda', 'otro') as devolucion_id \\gset
select retail.aprobar_devolucion(:'devolucion_id', (:'negs_precio')::numeric, 'efectivo', null) as _aprobada \\gset`,
  },
  {
    id: "cerrar-caja",
    dice: "contar y cerrar la caja",
    sql: `
select retail.cerrar_caja(:'caja_id', 150.00) as _cerrada \\gset`,
  },
];

/** El guion entero: una transacción, la foto inicial, cada paso con su mirada y el ROLLBACK. */
export function guion() {
  return `
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
${mirar("inicio")}
${PASOS.map((p) => `select '${MARCA}-paso|${p.id}';\n${p.sql}\n${mirar(p.id)}`).join("\n")}
select '${MARCA}-fin';
rollback;
`;
}

/** Lee la salida: por paso y por invariante, las filas que violan. */
export function leer(salida) {
  const porPaso = new Map();
  const pasosHechos = [];
  let fin = false;
  for (const l of salida.split("\n")) {
    if (l.startsWith(`${MARCA}-paso|`)) pasosHechos.push(l.split("|")[1]);
    else if (l === `${MARCA}-fin`) fin = true;
    else if (l.startsWith(`${MARCA}|`)) {
      const [, paso, inv, ...resto] = l.split("|");
      const json = resto.join("|");
      if (!porPaso.has(paso)) porPaso.set(paso, new Map());
      const m = porPaso.get(paso);
      if (!m.has(inv)) m.set(inv, []);
      m.get(inv).push(JSON.parse(json));
    }
  }
  return { porPaso, pasosHechos, fin };
}

/** Las violaciones de un paso que no estaban al inicio, como `[{ inv, filas }]`. */
export function nuevasDelPaso(porPaso, paso) {
  const inicio = porPaso.get("inicio") ?? new Map();
  const ahora = porPaso.get(paso) ?? new Map();
  const nuevas = [];
  for (const [inv, filas] of ahora) {
    const antes = new Set((inicio.get(inv) ?? []).map(huellaDe));
    const solo = filas.filter((f) => !antes.has(huellaDe(f)));
    if (solo.length) nuevas.push({ inv, filas: solo });
  }
  return nuevas;
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    return 1;
  }

  let salida;
  try {
    salida = psql(guion());
  } catch (e) {
    const hechos = leer(String(e.stdout ?? "")).pasosHechos;
    const enCurso = hechos.at(-1) ?? "inicio";
    const paso = PASOS.find((p) => p.id === enCurso);
    const error = String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT/.test(l)).slice(0, 6).join("\n    ");
    console.log(`✗ el día se cortó en «${enCurso}»${paso ? ` (${paso.dice})` : ""}: la base rechazó un paso normal o no pudo mirar una invariante`);
    console.log(`    ${error}`);
    return 1;
  }

  const { porPaso, pasosHechos, fin } = leer(salida);
  if (!fin || pasosHechos.length !== PASOS.length) {
    console.log(`✗ el día no llegó al final (pasos hechos: ${pasosHechos.join(", ") || "ninguno"})`);
    return 1;
  }

  const previas = [...(porPaso.get("inicio") ?? new Map()).values()].reduce((n, f) => n + f.length, 0);
  if (previas) console.log(`  (la base ya traía ${previas} violación(es) antes de empezar: no cuentan, solo las nuevas)`);

  let fallos = 0;
  const vistas = new Set();
  for (const paso of PASOS) {
    // Una violación que nace en un paso sigue ahí en los siguientes: se acusa solo donde apareció.
    const nuevas = nuevasDelPaso(porPaso, paso.id)
      .map(({ inv, filas }) => ({ inv, filas: filas.filter((f) => !vistas.has(`${inv}:${huellaDe(f)}`)) }))
      .filter(({ filas }) => filas.length);
    nuevas.forEach(({ inv, filas }) => filas.forEach((f) => vistas.add(`${inv}:${huellaDe(f)}`)));
    if (!nuevas.length) {
      console.log(`✓ ${paso.dice}: las ${INVARIANTES.length} invariantes siguen limpias`);
      continue;
    }
    fallos++;
    console.log(`✗ ${paso.dice}: la base quedó descuadrada`);
    for (const { inv, filas } of nuevas) {
      const def = INVARIANTES.find((i) => i.id === inv);
      console.log(`    ${inv} ${def?.nombre ?? ""} — ${def?.dice ?? ""}`);
      for (const f of filas.slice(0, 3)) console.log(`      ${JSON.stringify(f).slice(0, 400)}`);
      if (filas.length > 3) console.log(`      … y ${filas.length - 3} más`);
    }
  }

  console.log(`\n${PASOS.length - fallos}/${PASOS.length} pasos dejaron la base cuadrada (${INVARIANTES.length} invariantes por paso).`);
  return fallos ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());

#!/usr/bin/env node
/**
 * Pruebas del REDONDEO DEL EFECTIVO (ADR-0311) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261003100000_redondeo_efectivo_regla.sql`: la regla `retail.fn_redondeo_efectivo` — lo que se cobra de menos
 * al pagar en efectivo. S/ 0.10 es la moneda más chica que circula y la ley solo permite bajar: 100.19 → se cobra 100.10
 * (redondeo 0.09), nunca 100.20. En los 99 999 montos de S/ 0.01 a S/ 999.99 el redondeo es de 0.00 a 0.09, deja el efectivo
 * en múltiplo de 0.10 y es el ÚNICO que lo logra: por eso `registrar_venta` podrá exigir «el redondeo exacto de la ley».
 *
 * ACTIVIDAD 2 (lectores). `20261003110000_venta_pagos_candado_redondeo.sql` (el medio 'redondeo' y sus candados) y
 * `20261003111000_redondeo_lectores.sql` (Caja, la lista de ventas del día y la cuenta sellada saben que el redondeo no es
 * dinero que entró). Con una venta sembrada —79.88 pagada con 79.80 en efectivo y 0.08 de redondeo— se comprueba que «Efectivo en
 * el cajón» sigue siendo lo físico, que el redondeo no cuenta como cobrado ni como «Otro», que no queda sellado a un banco, que
 * el esquema rechaza lo que nunca debe existir y que TODA función que lee `venta_pagos` está revisada pensando en el redondeo.
 *
 * ACTIVIDAD 3 (diario). `20261003120000_redondeo_diario.sql`: el redondeo se asienta contra la cuenta de gasto 6598 (no contra el
 * banco), el asiento cuadra, el Estado de resultados lo muestra, la anulación lo revierte y el Cierre de mes no se bloquea.
 *
 * ACTIVIDAD 5 (Vender). `20261003130000_registrar_venta_redondeo.sql` (la RPC real acepta la fila de redondeo y verifica que sea la de
 * la ley) y `20261003140000_acepta_redondeo_efectivo.sql` (la bandera). Con `registrar_venta` de verdad: la venta de 79.88 con 79.80 en
 * efectivo + 0.08, las mixtas, la venta vieja con efectivo exacto (la cola sin conexión no pierde nada), cada rechazo —también el intento
 * de cobrar DE MÁS—, la idempotencia por token, la anulación, y la paridad de la regla de la caja con la de la base en los 99 999 montos.
 *
 * La caja tiene su gemela en TypeScript (`redondeoDelEfectivo`, apps/web/lib/redondeo-efectivo-reglas.ts): la prueba de paridad las compara
 * en los 99 999 montos de S/ 0.01 a S/ 999.99.
 * CÓMO. El patrón de `campana_redondeo.mjs`: todo dentro de una transacción con ROLLBACK, contra la base real. Nunca se
 * commitea nada en el Postgres local que comparten los worktrees.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261003100000_redondeo_efectivo_regla.sql` mete la migración
 * dentro de la transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace CI).
 *
 * USO
 *   pnpm pruebas:redondeo-efectivo    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { efectivoACobrar, redondeoDelEfectivo } from "../../apps/web/lib/redondeo-efectivo-reglas.ts";
import { DESHACER_PRECIO_SEDE, REHACER_PRECIO_SEDE } from "./registrar-venta-antes-de-precio-sede.mjs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION_REGLA = "supabase/migrations/20261003100000_redondeo_efectivo_regla.sql";
const MIGRACION_CANDADO = "supabase/migrations/20261003110000_venta_pagos_candado_redondeo.sql";
const MIGRACION_LECTORES = "supabase/migrations/20261003111000_redondeo_lectores.sql";
const MIGRACION_DIARIO = "supabase/migrations/20261003120000_redondeo_diario.sql";
const MIGRACION_VENTA = "supabase/migrations/20261003130000_registrar_venta_redondeo.sql";
const MIGRACION_ENTREGA = "supabase/migrations/20261003135000_entregar_separacion_redondeo.sql";
const MIGRACION_BANDERA = "supabase/migrations/20261003140000_acepta_redondeo_efectivo.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación

// Uno o varios archivos separados por coma (las partes de una migración se aplican en orden).
const APLICAR_ANTES = process.env.APLICAR_ANTES ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 900)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. Los ejemplos de la ley (INDECOPI) y de Felipe: [deuda en efectivo, se cobra, redondeo] ----
  const EJEMPLOS = [
    [2.69, 2.6, 0.09], [5.99, 5.9, 0.09], [8.97, 8.9, 0.07], [5.46, 5.4, 0.06], [12.56, 12.5, 0.06], [2.75, 2.7, 0.05], [9.99, 9.9, 0.09],
    [100.02, 100, 0.02], [100.12, 100.1, 0.02], [100.19, 100.1, 0.09], [100.1, 100.1, 0], [100, 100, 0],
    // los bordes: lo que no llega a una moneda no se cobra; el descuento exacto de ADR-0302 deja estos céntimos
    [0.09, 0, 0.09], [0.05, 0, 0.05], [0.1, 0.1, 0], [0.29, 0.2, 0.09], [0.01, 0, 0.01],
    [67.91, 67.9, 0.01], [79.9, 79.9, 0], [33.15, 33.1, 0.05], [484.54, 484.5, 0.04], [62.15, 62.1, 0.05], [309.59, 309.5, 0.09],
    [4.35, 4.3, 0.05], [1.15, 1.1, 0.05], [8.2, 8.2, 0], [0.57, 0.5, 0.07],
  ];
  const r1 = correr(`begin;\n${APLICAR_ANTES}\n` +
    EJEMPLOS.map(([d]) => `select '${d}|' || retail.fn_redondeo_efectivo(${d});`).join("\n") + "\nrollback;");
  if (!r1.ok) {
    esperar("fn_redondeo_efectivo existe y responde", false, r1.mensaje);
  } else {
    const dio = new Map(r1.salida.split("\n").filter(Boolean).map((l) => { const [d, r] = l.split("|"); return [d, Number(r)]; }));
    const malos = EJEMPLOS.filter(([d, , red]) => dio.get(String(d)) !== red).map(([d, , red]) => `S/ ${d}: esperaba redondeo ${red}, dio ${dio.get(String(d))}`);
    esperar(`fn_redondeo_efectivo da lo que dice la ley en ${EJEMPLOS.length} ejemplos (100.19 → 0.09, 100.12 → 0.02, 2.69 → 0.09…)`, malos.length === 0, malos.join(" · "));
    // El efectivo a cobrar = deuda − redondeo: lo que sale de la tabla.
    const malosCobro = EJEMPLOS.filter(([d, cobra, red]) => Math.round(d * 100) - Math.round(red * 100) !== Math.round(cobra * 100));
    esperar("en la tabla, deuda − redondeo es lo que se cobra (la tabla es consistente consigo misma)", malosCobro.length === 0, malosCobro.join(" · "));
  }

  // ---- 2. En TODOS los montos de 0.01 a 999.99 (99 999): redondeo de 0 a 0.09, el efectivo queda en múltiplo de 0.10, y es el único ----
  // Único: de los diez redondeos posibles (0.00 … 0.09) exactamente uno deja el efectivo en múltiplo de 0.10. Si hubiera dos, la
  // base no podría exigir «el redondeo exacto de la ley» y un cliente manipulado podría mandar otro. También se comprueba que
  // nunca sube (el efectivo a cobrar jamás supera la deuda) y que es monótona (más deuda nunca cobra menos).
  const r2 = correr(`begin;
${APLICAR_ANTES}
with t as (
  select g, (retail.fn_redondeo_efectivo(g / 100.0) * 100)::int as red from generate_series(1, 99999) g
)
select 'n|' || count(*)
  || '|fuera_de_rango|' || count(*) filter (where red < 0 or red > 9)
  || '|no_multiplo|' || count(*) filter (where (g - red) % 10 <> 0)
  || '|sube|' || count(*) filter (where g - red > g)
  || '|no_unico|' || count(*) filter (where (select count(*) from generate_series(0, 9) r where (g - r) % 10 = 0) <> 1 or red <> g % 10)
  || '|no_monotona|' || (select count(*) from (select g - red as cobra, lag(g - red) over (order by g) as ant from t) m where ant is not null and cobra < ant)
from t;
rollback;`);
  esperar(
    "en los 99 999 montos (0.01 a 999.99): redondeo de 0 a 0.09, efectivo en múltiplo de 0.10, nunca sube, es monótona y el redondeo es el único posible",
    r2.ok && r2.salida === "n|99999|fuera_de_rango|0|no_multiplo|0|sube|0|no_unico|0|no_monotona|0",
    r2.ok ? r2.salida : r2.mensaje,
  );

  // ---- 3. Lo que no hay que redondear: sin monto, cero, negativo ----
  const r3 = correr(`begin;\n${APLICAR_ANTES}\nselect 'v|' || retail.fn_redondeo_efectivo(0) || '|' || retail.fn_redondeo_efectivo(-5) || '|' || retail.fn_redondeo_efectivo(null);\nrollback;`);
  esperar("sin monto, cero o negativo no hay redondeo", r3.ok && r3.salida.includes("v|0|0|0"), r3.ok ? r3.salida : r3.mensaje);

  // ---- 4. La migración se puede pegar dos veces seguidas ----
  const migracion = readFileSync(MIGRACION_REGLA, "utf8");
  const r4 = correr(`begin;\n${migracion}\n${migracion}\nselect 'r|' || retail.fn_redondeo_efectivo(100.19);\nrollback;`);
  esperar("la migración de la regla es re-ejecutable (dos veces seguidas) y deja 100.19 → 0.09", r4.ok && r4.salida.includes("r|0.09"), r4.ok ? r4.salida : r4.mensaje);

  // ---- 5. Es una función pura y solo la ven quienes iniciaron sesión ----
  const r5 = correr(`select 'p|' || p.provolatile::text || '|' || has_function_privilege('anon', 'retail.fn_redondeo_efectivo(numeric)', 'execute') || '|' || has_function_privilege('authenticated', 'retail.fn_redondeo_efectivo(numeric)', 'execute')
    from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_redondeo_efectivo';`);
  esperar("fn_redondeo_efectivo es inmutable, no la ejecuta anon y sí authenticated", r5.ok && r5.salida.includes("p|i|false|true"), r5.ok ? r5.salida : r5.mensaje);

  // =====================================================================================================================
  // ACTIVIDAD 2 — los lectores entienden «redondeo». Una venta de 79.88 (79.90 con 0.02 de descuento) pagada con 79.80 en
  // efectivo y 0.08 de redondeo: lo que hará `registrar_venta` en la actividad 5, sembrado a mano dentro de la transacción.
  // =====================================================================================================================
  const VENTA_REDONDEADA = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v1, precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
-- Una cuenta de banco para «transferencia»: sin ella un medio que no es plata no tiene a qué cuenta caer y el error no se vería.
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('ZZ Banco de prueba', 'banco', '104') returning id as banco \\gset
insert into retail.medios_de_cobro (ubicacion_id, medio, cuenta_id, vigente_desde) values (:'ubic', 'transferencia', :'banco', retail.fn_hoy_lima() - 1);
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 79.90)), null, gen_random_uuid()) as venta \\gset
-- De 79.90 a 79.88, y el efectivo a 79.80 + 0.08 de redondeo (la suma de las filas sigue igualando la suma de ítems).
update retail.venta_items set descuento_unitario = 0.02, motivo_descuento = 'cerrar_venta' where venta_id = :'venta';
update retail.venta_pagos set monto = 79.80 where venta_id = :'venta' and metodo = 'efectivo';
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'venta', 'redondeo', 0.08);
`;

  // ---- 6. El esquema acepta los 8 medios (los 7 de antes y 'redondeo'): ninguno se perdió al rehacer el CHECK ----
  const r6 = correr(`${VENTA_REDONDEADA}
insert into retail.venta_pagos (venta_id, metodo, monto) select :'venta', m, 1 from unnest(array['tarjeta', 'yape', 'plin', 'transferencia', 'anticipo', 'qr']) m;
select 'filas|' || count(*) || '|' || string_agg(distinct metodo, ',' order by metodo) from retail.venta_pagos where venta_id = :'venta';
rollback;`);
  esperar(
    "venta_pagos acepta los 8 medios: efectivo, tarjeta, yape, plin, transferencia, anticipo, qr y redondeo (ninguno se perdió)",
    r6.ok && r6.salida.includes("filas|8|anticipo,efectivo,plin,qr,redondeo,tarjeta,transferencia,yape"),
    r6.ok ? r6.salida : r6.mensaje,
  );

  // ---- 7. Lo que nunca debe existir, lo rechaza el esquema ----
  const rechaza = (nombre, sentencia, restriccion) => {
    const r = correr(`${VENTA_REDONDEADA}\n${sentencia}\nrollback;`);
    esperar(nombre, !r.ok && r.mensaje.includes(restriccion), r.ok ? `pasó y debía fallar con «${restriccion}»` : r.mensaje);
  };
  rechaza("un redondeo de S/ 0.10 (o más) no es un redondeo", `update retail.venta_pagos set monto = 0.10 where venta_id = :'venta' and metodo = 'redondeo';`, "venta_pagos_redondeo_valido");
  rechaza("un redondeo no lleva «recibido» (no se entrega: no se cobró)", `update retail.venta_pagos set recibido = 1 where venta_id = :'venta' and metodo = 'redondeo';`, "venta_pagos_recibido_coherente");
  rechaza("un redondeo no lleva referencia de operación", `update retail.venta_pagos set referencia = 'ABC123' where venta_id = :'venta' and metodo = 'redondeo';`, "venta_pagos_referencia_valida");
  rechaza("una venta no puede tener dos redondeos (sería redondear dos veces)", `insert into retail.venta_pagos (venta_id, metodo, monto) values (:'venta', 'redondeo', 0.05);`, "venta_pagos_un_redondeo_por_venta");
  rechaza("un redondeo de S/ 0 no es una fila", `update retail.venta_pagos set monto = 0 where venta_id = :'venta' and metodo = 'redondeo';`, "venta_pagos_monto_check");
  rechaza("un medio que no existe sigue rechazado", `insert into retail.venta_pagos (venta_id, metodo, monto) values (:'venta', 'cripto', 1);`, "venta_pagos_metodo_check");

  // ---- 8. El redondeo no mueve plata: no queda sellado a la cuenta de un banco; el efectivo sí queda en el cajón ----
  const r8 = correr(`${VENTA_REDONDEADA}
select 'sello|' || (select count(*) from retail.venta_pagos where venta_id = :'venta' and metodo = 'redondeo' and cuenta_dinero_id is null)
  || '|' || (select count(*) from retail.venta_pagos where venta_id = :'venta' and metodo = 'efectivo' and cuenta_dinero_id is not null);
rollback;`);
  esperar("la fila de redondeo no lleva cuenta de dinero (no es plata) y la de efectivo sigue sellada al cajón", r8.ok && r8.salida.includes("sello|1|1"), r8.ok ? r8.salida : r8.mensaje);

  // ---- 9. Caja: lo físico sigue siendo lo físico, y el redondeo ni se cobra ni es «Otro» ----
  const r9 = correr(`${VENTA_REDONDEADA}
select 'resumen|' || (retail.fn_resumen_caja(:'caja_id'))::text;
select 'esperado|' || esperado from retail.fn_calcular_esperado_caja(:'caja_id');
rollback;`);
  if (!r9.ok) {
    esperar("fn_resumen_caja con una venta redondeada", false, r9.mensaje);
  } else {
    const t = JSON.parse(r9.salida.split("\n").find((l) => l.startsWith("resumen|")).slice("resumen|".length));
    const esperado = Number(r9.salida.split("\n").find((l) => l.startsWith("esperado|")).slice("esperado|".length));
    esperar("Efectivo en el cajón es lo físico: apertura 100.00 + 79.80 = 179.80 (el redondeo no se suma ni se resta)", esperado === 179.8 && Number(t.esperado) === 179.8, `esperado ${esperado}, resumen ${t.esperado}`);
    esperar("Caja: ventas en efectivo 79.80, ventas en otros medios 0 (el redondeo no es «otro») y redondeo 0.08 aparte", Number(t.ventas_efectivo) === 79.8 && Number(t.ventas_otros) === 0 && Number(t.redondeo) === 0.08, JSON.stringify(t));
    esperar("«Cobrado en el turno» (por_metodo) lista solo el efectivo: sin una forma de pago «redondeo»", JSON.stringify(Object.keys(t.por_metodo)) === JSON.stringify(["efectivo"]) && t.por_hora.every((h) => Number(h.otros) === 0), JSON.stringify([t.por_metodo, t.por_hora]));
  }

  // ---- 10. La lista de ventas del día dice «efectivo», no «efectivo + redondeo» ----
  const r10 = correr(`${VENTA_REDONDEADA}
select 'dia|' || metodos_pago || '|' || total from retail.fn_ventas_del_dia(:'ubic') where venta_id = :'venta';
rollback;`);
  esperar("fn_ventas_del_dia: la venta dice «efectivo» (no «efectivo + redondeo») y su total sigue siendo la suma de ítems (79.88)", r10.ok && r10.salida === "dia|efectivo|79.88", r10.ok ? r10.salida : r10.mensaje);

  // ---- 11. Historial: «cómo se pagó» incluye el redondeo y sigue sumando el total vendido ----
  const r11 = correr(`${VENTA_REDONDEADA}
select 'hist|' || ((retail.fn_totales_historial_ventas(null, null, null, null, 'todas', null, 'todos', false, array[:'venta'::uuid]))->>'total')
  || '|' || ((retail.fn_totales_historial_ventas(null, null, null, null, 'todas', null, 'todos', false, array[:'venta'::uuid]))->'por_metodo')::text;
rollback;`);
  if (!r11.ok) {
    esperar("fn_totales_historial_ventas con una venta redondeada", false, r11.mensaje);
  } else {
    const [, totalH, metodosH] = r11.salida.split("|");
    const lista = JSON.parse(metodosH);
    const suma = Math.round(lista.reduce((a, m) => a + Number(m.monto), 0) * 100);
    esperar("Historial: «cómo se pagó» lista efectivo 79.80 y redondeo 0.08, y suma el total vendido (79.88)", Number(totalH) === 79.88 && suma === 7988 && lista.some((m) => m.metodo === "redondeo" && Number(m.monto) === 0.08), r11.salida);
  }

  // ---- 12. Las dos partes se pueden pegar dos veces, y las huellas «después» son las que la migración promete ----
  const parte1 = readFileSync(MIGRACION_CANDADO, "utf8");
  const parte2 = readFileSync(MIGRACION_LECTORES, "utf8");
  const huellas = Object.fromEntries([...parte2.matchAll(/c_(sellada|resumen|dia)_despues constant text := '([0-9a-f]{32})'/g)].map((m) => [m[1], m[2]]));
  const r12 = correr(`begin;\n${parte1}\n${parte1}\n${parte2}\n${parte2}
select 'h|' || p.proname || '|' || md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_cuenta_sellada', 'fn_resumen_caja', 'fn_ventas_del_dia');
rollback;`);
  const dio12 = r12.ok ? Object.fromEntries(r12.salida.split("\n").filter((l) => l.startsWith("h|")).map((l) => { const [, n, h] = l.split("|"); return [n, h]; })) : {};
  esperar(
    "las dos partes son re-ejecutables y dejan las huellas prometidas (fn_cuenta_sellada, fn_resumen_caja, fn_ventas_del_dia)",
    r12.ok && dio12.fn_cuenta_sellada === huellas.sellada && dio12.fn_resumen_caja === huellas.resumen && dio12.fn_ventas_del_dia === huellas.dia,
    r12.ok ? JSON.stringify({ dio12, huellas }) : r12.mensaje,
  );

  // ---- 13. El candado de huella: si alguien cambió la función, el parche aborta en vez de pisarla a ciegas ----
  const r13 = correr(`begin;
do $x$ begin execute replace(pg_get_functiondef('retail.fn_cuenta_sellada(text,text,uuid,date,uuid)'::regprocedure), 'saldo_a_favor', 'saldo_a_favor_x'); end $x$;
${parte2}
rollback;`);
  esperar("el parche de lectores aborta si una función cambió desde que se escribió (no la pisa a ciegas)", !r13.ok && r13.mensaje.includes("cambió desde que se escribió esta migración"), r13.ok ? "pasó y debía abortar" : r13.mensaje);

  // =====================================================================================================================
  // ACTIVIDAD 3 — el diario asienta el redondeo contra la cuenta de gasto 6598 y todo sigue cuadrando.
  // =====================================================================================================================
  const HOY = "retail.fn_hoy_lima()";

  // ---- 15. El asiento de la venta: Caja con lo físico, el redondeo como gasto (no como banco), y cuadra ----
  const r15 = correr(`${VENTA_REDONDEADA}
select 'cuentas|' || string_agg(cuenta || ':' || debe || '/' || haber, ' ' order by cuenta, debe) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where asiento = 'venta:' || :'venta';
select 'cuadra|' || (select round(sum(debe), 2) = round(sum(haber), 2) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where asiento = 'venta:' || :'venta');
select 'descuadrados|' || count(*) from retail.fn_asientos_descuadrados(${HOY}, ${HOY}, :'ubic');
rollback;`);
  if (!r15.ok) {
    esperar("el diario asienta la venta redondeada", false, r15.mensaje);
  } else {
    const l15 = Object.fromEntries(r15.salida.split("\n").filter(Boolean).map((l) => [l.split("|")[0], l.slice(l.indexOf("|") + 1)]));
    esperar("diario: el efectivo entra a Caja (101) con lo físico, 79.80, y el redondeo va a la cuenta de gasto 6598 con 0.08", l15.cuentas.includes("101:79.80/0") && l15.cuentas.includes("6598:0.08/0"), l15.cuentas);
    esperar("diario: el redondeo NO queda como plata en el banco (ninguna línea en 104)", !/(^| )104:/.test(l15.cuentas), l15.cuentas);
    esperar("diario: el asiento de la venta cuadra (Debe = Haber) sin una línea de ajuste, y no hay asientos descuadrados", l15.cuadra === "true" && l15.descuadrados === "0", JSON.stringify(l15));
  }

  // ---- 16. El Estado de resultados lo muestra como un gasto aparte, sin descuadrados ----
  const r16 = correr(`${VENTA_REDONDEADA}
select 'er|' || asientos_descuadrados || '|' || detalle_gastos::text from retail.fn_estado_resultados(${HOY}, ${HOY}, :'ubic') where ubicacion_id = :'ubic';
rollback;`);
  if (!r16.ok) {
    esperar("el Estado de resultados con una venta redondeada", false, r16.mensaje);
  } else {
    const [, descuadrados, detalle] = r16.salida.split("|");
    const fila = JSON.parse(detalle).find((d) => d.cuenta === "6598");
    esperar("Estado de resultados: el gasto «Redondeo de efectivo (a favor del cliente)» (6598) muestra 0.08, sin asientos descuadrados", descuadrados === "0" && fila && Number(fila.monto) === 0.08, r16.salida);
  }

  // ---- 17. El Cierre de mes no se bloquea por el diario ----
  const r17 = correr(`${VENTA_REDONDEADA}
select 'cierre|' || c.chequeos::text from retail.fn_cierre_mes_estado(date_trunc('month', ${HOY})::date) c where c.ubicacion_id = :'ubic';
rollback;`);
  if (!r17.ok) {
    esperar("el Cierre de mes con una venta redondeada", false, r17.mensaje);
  } else {
    const checks = JSON.parse(r17.salida.slice("cierre|".length));
    const diario = checks.find((c) => c.clave === "diario");
    esperar("Cierre de mes: el chequeo «diario» sigue en verde (0 asientos descuadrados): el redondeo no bloquea el mes", diario && diario.ok === true && Number(diario.datos.descuadrados) === 0, JSON.stringify(diario));
  }

  // ---- 18. Anular la venta revierte el redondeo contra la misma cuenta: queda en cero ----
  const r18 = correr(`${VENTA_REDONDEADA}
select vi.id as item from retail.venta_items vi where vi.venta_id = :'venta' limit 1 \\gset
select retail.anular_venta(:'venta', 'prueba automatizada', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _a \\gset
select 'neto6598|' || coalesce(sum(debe - haber), 0) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where origen_id = :'venta' and cuenta = '6598';
select 'neto101|' || coalesce(sum(debe - haber), 0) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where origen_id = :'venta' and cuenta = '101';
select 'revierte|' || count(*) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where asiento = 'anulacion:' || :'venta' and cuenta = '6598' and haber = 0.08;
select 'descuadrados|' || count(*) from retail.fn_asientos_descuadrados(${HOY}, ${HOY}, :'ubic');
rollback;`);
  if (!r18.ok) {
    esperar("anular una venta redondeada", false, r18.mensaje);
  } else {
    const l18 = Object.fromEntries(r18.salida.split("\n").filter(Boolean).map((l) => [l.split("|")[0], l.split("|")[1]]));
    esperar("anular la venta revierte el redondeo contra 6598 (queda en 0) y Caja (101) también; sin asientos descuadrados",
      Number(l18.neto6598) === 0 && Number(l18.neto101) === 0 && l18.revierte === "1" && l18.descuadrados === "0", r18.salida);
  }

  // ---- 19. La migración del diario se pega dos veces y deja la huella prometida ----
  const diario = readFileSync(MIGRACION_DIARIO, "utf8");
  const huellaDiario = (diario.match(/c_despues constant text := '([0-9a-f]{32})'/) ?? [])[1];
  const r19 = correr(`begin;\n${diario}\n${diario}
select 'h|' || md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_asiento_cuenta_de_medio';
select 'cuentas|' || count(*) from retail.cuentas where codigo = '6598';
rollback;`);
  esperar("la migración del diario es re-ejecutable, deja una sola cuenta 6598 y la huella prometida de fn_asiento_cuenta_de_medio",
    r19.ok && r19.salida.includes(`h|${huellaDiario}`) && r19.salida.includes("cuentas|1"), r19.ok ? r19.salida : r19.mensaje);

  // ---- 20. Los demás medios siguen yendo a su cuenta, y si alguien cambió la función el parche aborta ----
  const r20 = correr(`select 'm|' || retail.fn_asiento_cuenta_de_medio('efectivo') || retail.fn_asiento_cuenta_de_medio('tarjeta') || retail.fn_asiento_cuenta_de_medio('yape') || retail.fn_asiento_cuenta_de_medio('plin')
  || retail.fn_asiento_cuenta_de_medio('transferencia') || retail.fn_asiento_cuenta_de_medio('qr') || retail.fn_asiento_cuenta_de_medio('anticipo') || retail.fn_asiento_cuenta_de_medio('saldo_a_favor');`);
  esperar("los demás medios no cambiaron de cuenta (efectivo 101, tarjeta 105, yape/plin/transferencia/qr 104, anticipo 122, saldo a favor 421)", r20.ok && r20.salida === "m|101105104104104104122421", r20.ok ? r20.salida : r20.mensaje);
  const r20b = correr(`begin;
do $x$ begin execute replace(pg_get_functiondef('retail.fn_asiento_cuenta_de_medio(text,text)'::regprocedure), 'saldo_a_favor', 'saldo_a_favor_x'); end $x$;
${diario}
rollback;`);
  esperar("el parche del diario aborta si fn_asiento_cuenta_de_medio cambió desde que se escribió (no la pisa a ciegas)", !r20b.ok && r20b.mensaje.includes("cambió desde que se escribió esta migración"), r20b.ok ? "pasó y debía abortar" : r20b.mensaje);

  // =====================================================================================================================
  // ACTIVIDAD 5 — Vender cobra en efectivo redondeado: la RPC REAL acepta la fila de redondeo y verifica que sea la de la ley.
  // =====================================================================================================================
  const PREPARACION = VENTA_REDONDEADA.slice(0, VENTA_REDONDEADA.indexOf("select retail.registrar_venta("));
  // Una venta de 79.90 − d con los pagos dados (p_pagos tal como los manda la caja). `token` fija el p_token para probar la idempotencia.
  const vender = (d, pagos, { token = "gen_random_uuid()", tipo = "'boleta'" } = {}) =>
    `select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', ${d}${d > 0 ? ", 'motivo_descuento', 'cerrar_venta'" : ""})),
       '${JSON.stringify(pagos)}'::jsonb, null, ${token}, ${tipo}) as venta \\gset`;

  // ---- 21. La venta de 79.88: efectivo 79.80 (recibió 80) + redondeo 0.08, por la RPC real ----
  const r21 = correr(`${PREPARACION}
${vender(0.02, [{ metodo: "efectivo", monto: 79.8, recibido: 80 }, { metodo: "redondeo", monto: 0.08 }])}
select 'filas|' || string_agg(metodo || '=' || monto || coalesce('/' || recibido, ''), ' ' order by metodo) from retail.venta_pagos where venta_id = :'venta';
select 'suma|' || (select sum(monto) from retail.venta_pagos where venta_id = :'venta') || '|' || (select sum(subtotal) from retail.venta_items where venta_id = :'venta');
select 'boleta|' || total || '|' || subtotal || '|' || igv from retail.comprobantes where venta_id = :'venta';
select 'esperado|' || esperado from retail.fn_calcular_esperado_caja(:'caja_id');
select 'resumen|' || (retail.fn_resumen_caja(:'caja_id'))::text;
rollback;`);
  if (!r21.ok) {
    esperar("registrar_venta acepta la venta redondeada (79.88 = 79.80 efectivo + 0.08)", false, r21.mensaje);
  } else {
    const l21 = Object.fromEntries(r21.salida.split("\n").filter(Boolean).map((l) => [l.split("|")[0], l.slice(l.indexOf("|") + 1)]));
    const resumen = JSON.parse(l21.resumen);
    esperar("registrar_venta: guarda efectivo 79.80 (recibió 80) y redondeo 0.08; la suma de las filas es la suma de los ítems (79.88)", l21.filas === "efectivo=79.80/80.00 redondeo=0.08" && l21.suma === "79.88|79.88", JSON.stringify(l21));
    esperar("la boleta sale por el precio EXACTO (79.88), con subtotal + IGV = total: el redondeo no toca el comprobante", l21.boleta === "79.88|67.69|12.19", l21.boleta);
    esperar("Caja: «Efectivo en el cajón» = 100.00 + 79.80, y el redondeo viaja aparte (0.08)", l21.esperado === "179.80" && Number(resumen.redondeo) === 0.08 && Number(resumen.ventas_efectivo) === 79.8, `${l21.esperado} ${l21.resumen}`);
  }

  // ---- 22. Los bordes del redondeo (0.01 y 0.09) y el pago mixto: solo la parte en efectivo se redondea ----
  const acepta = (nombre, d, pagos, esperado) => {
    const r = correr(`${PREPARACION}
${vender(d, pagos)}
select 'filas|' || string_agg(metodo || '=' || monto, ' ' order by metodo) from retail.venta_pagos where venta_id = :'venta';
rollback;`);
    esperar(nombre, r.ok && r.salida === `filas|${esperado}`, r.ok ? r.salida : r.mensaje);
  };
  acepta("redondeo de un céntimo: 79.81 = efectivo 79.80 + 0.01", 0.09, [{ metodo: "efectivo", monto: 79.8 }, { metodo: "redondeo", monto: 0.01 }], "efectivo=79.80 redondeo=0.01");
  acepta("redondeo de nueve céntimos: 79.69 = efectivo 79.60 + 0.09", 0.21, [{ metodo: "efectivo", monto: 79.6 }, { metodo: "redondeo", monto: 0.09 }], "efectivo=79.60 redondeo=0.09");
  acepta("pago mixto: solo el efectivo se redondea (Yape 30.05 exacto + efectivo 49.80 + redondeo 0.03 = 79.88)", 0.02,
    [{ metodo: "yape", monto: 30.05 }, { metodo: "efectivo", monto: 49.8 }, { metodo: "redondeo", monto: 0.03 }], "efectivo=49.80 redondeo=0.03 yape=30.05");
  acepta("la tarjeta siempre exacta: 79.88 con tarjeta 40.00 + efectivo 39.80 + redondeo 0.08", 0.02,
    [{ metodo: "tarjeta", monto: 40 }, { metodo: "efectivo", monto: 39.8 }, { metodo: "redondeo", monto: 0.08 }], "efectivo=39.80 redondeo=0.08 tarjeta=40.00");

  // ---- 23. Compatibilidad: una venta SIN fila de redondeo se acepta como siempre (la cola sin conexión de una caja vieja no pierde ventas) ----
  acepta("una venta vieja con el efectivo exacto (79.88, sin fila de redondeo) se sigue aceptando", 0.02, [{ metodo: "efectivo", monto: 79.88 }], "efectivo=79.88");
  acepta("una venta sin nada que redondear (79.90 en efectivo) no necesita fila de redondeo", 0, [{ metodo: "efectivo", monto: 79.9 }], "efectivo=79.90");

  // ---- 24. Lo que la base RECHAZA: cada intento de cobrar de más, de redondear mal o de guardar un estado imposible ----
  const rechazaVenta = (nombre, d, pagos, texto) => {
    const r = correr(`${PREPARACION}\n${vender(d, pagos)}\nrollback;`);
    esperar(nombre, !r.ok && r.mensaje.includes(texto), r.ok ? `pasó y debía fallar con «${texto}»` : r.mensaje);
  };
  rechazaVenta("cobrar DE MÁS no se puede: efectivo 79.90 con un «redondeo» de −0.02 para una venta de 79.88", 0.02, [{ metodo: "efectivo", monto: 79.9 }, { metodo: "redondeo", monto: -0.02 }], "venta_redondeo_invalido");
  rechazaVenta("un efectivo de 79.90 para una venta de 79.88 no cuadra (la suma no es la de los ítems)", 0.02, [{ metodo: "efectivo", monto: 79.9 }], "no cuadran con el total de la venta");
  rechazaVenta("un redondeo que no es el de la ley no se acepta (la suma cuadra, pero 0.07 + 79.81 no son efectivo en monedas)", 0.02, [{ metodo: "efectivo", monto: 79.81 }, { metodo: "redondeo", monto: 0.07 }], "venta_redondeo_invalido");
  rechazaVenta("el efectivo con redondeo se cobra en monedas que existen: 79.85 + 0.03 se rechaza", 0.02, [{ metodo: "efectivo", monto: 79.85 }, { metodo: "redondeo", monto: 0.03 }], "múltiplos de S/ 0.10");
  rechazaVenta("un «redondeo» de S/ 0.18 no es un redondeo (efectivo 79.70 + 0.18)", 0.02, [{ metodo: "efectivo", monto: 79.7 }, { metodo: "redondeo", monto: 0.18 }], "no es el de la ley");
  rechazaVenta("un redondeo sin efectivo no existe: Yape 79.80 + redondeo 0.08", 0.02, [{ metodo: "yape", monto: 79.8 }, { metodo: "redondeo", monto: 0.08 }], "solo existe junto a UN pago en efectivo");
  rechazaVenta("dos pagos en efectivo con redondeo es ambiguo: se rechaza", 0.02, [{ metodo: "efectivo", monto: 40 }, { metodo: "efectivo", monto: 39.8 }, { metodo: "redondeo", monto: 0.08 }], "solo existe junto a UN pago en efectivo");
  rechazaVenta("dos redondeos en una venta serían redondear dos veces", 0.02, [{ metodo: "efectivo", monto: 79.8 }, { metodo: "redondeo", monto: 0.04 }, { metodo: "redondeo", monto: 0.04 }], "a lo más un redondeo");
  rechazaVenta("el redondeo no puede ser todo el pago: solo la fila de redondeo", 0.02, [{ metodo: "redondeo", monto: 79.88 }], "solo existe junto a UN pago en efectivo");

  // ---- 25. Idempotencia: la misma venta dos veces (el reintento de una cola sin conexión) es UNA venta, con UN redondeo ----
  const r25 = correr(`${PREPARACION}
select gen_random_uuid() as tok \\gset
${vender(0.02, [{ metodo: "efectivo", monto: 79.8, recibido: 80 }, { metodo: "redondeo", monto: 0.08 }], { token: ":'tok'" })}
select :'venta' as venta1 \\gset
${vender(0.02, [{ metodo: "efectivo", monto: 79.8, recibido: 80 }, { metodo: "redondeo", monto: 0.08 }], { token: ":'tok'" })}
select 'misma|' || (:'venta' = :'venta1') || '|redondeos|' || (select count(*) from retail.venta_pagos where venta_id = :'venta' and metodo = 'redondeo') || '|ventas|' || (select count(*) from retail.ventas where id = :'venta');
rollback;`);
  esperar("reintentar la misma venta (mismo token) devuelve LA misma venta, con un solo redondeo", r25.ok && r25.salida === "misma|true|redondeos|1|ventas|1", r25.ok ? r25.salida : r25.mensaje);

  // ---- 26. Anular la venta redondeada por la RPC real: el redondeo se revierte contra su cuenta y todo queda en cero ----
  const r26 = correr(`${PREPARACION}
${vender(0.02, [{ metodo: "efectivo", monto: 79.8, recibido: 80 }, { metodo: "redondeo", monto: 0.08 }])}
select vi.id as item from retail.venta_items vi where vi.venta_id = :'venta' limit 1 \\gset
select retail.anular_venta(:'venta', 'prueba automatizada', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _a \\gset
select 'neto|' || coalesce(sum(debe - haber), 0) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where origen_id = :'venta' and cuenta in ('101', '6598');
select 'esperado|' || esperado from retail.fn_calcular_esperado_caja(:'caja_id');
select 'descuadrados|' || count(*) from retail.fn_asientos_descuadrados(${HOY}, ${HOY}, :'ubic');
rollback;`);
  if (!r26.ok) {
    esperar("anular una venta redondeada hecha por la RPC real", false, r26.mensaje);
  } else {
    const l26 = Object.fromEntries(r26.salida.split("\n").filter(Boolean).map((l) => [l.split("|")[0], l.split("|")[1]]));
    esperar("anular la venta redondeada: Caja vuelve a la apertura (100.00), el diario queda en cero y sin descuadrados", Number(l26.neto) === 0 && l26.esperado === "100.00" && l26.descuadrados === "0", r26.salida);
  }

  // ---- 27. La bandera dice true solo si la base de verdad puede recibir el redondeo ----
  const r27 = correr(`select 'b|' || retail.fn_acepta_redondeo_efectivo() || '|' || has_function_privilege('anon', 'retail.fn_acepta_redondeo_efectivo()', 'execute') || '|' || has_function_privilege('authenticated', 'retail.fn_acepta_redondeo_efectivo()', 'execute');`);
  esperar("fn_acepta_redondeo_efectivo() dice true, no la ejecuta anon y sí authenticated", r27.ok && r27.salida === "b|true|false|true", r27.ok ? r27.salida : r27.mensaje);
  const sinParte = (nombre, mutacion) => {
    const r = correr(`begin;\n${mutacion}\nselect 'b|' || retail.fn_acepta_redondeo_efectivo();\nrollback;`);
    esperar(nombre, r.ok && r.salida === "b|false", r.ok ? r.salida : r.mensaje);
  };
  sinParte("la bandera dice false si venta_pagos todavía no acepta el medio redondeo",
    `alter table retail.venta_pagos drop constraint venta_pagos_metodo_check;
alter table retail.venta_pagos add constraint venta_pagos_metodo_check check (metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'anticipo', 'qr'));`);
  sinParte("la bandera dice false si registrar_venta perdió la validación del redondeo (p. ej. se recreó desde un archivo viejo)",
    `do $x$ begin execute replace(pg_get_functiondef('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)'::regprocedure), 'venta_redondeo_invalido', 'otra_cosa'); end $x$;`);

  sinParte("la bandera dice false si entregar_separacion perdió la validación del redondeo (Apartados cobra con la misma bandera)",
    `do $x$ begin execute replace(pg_get_functiondef('retail.entregar_separacion(uuid,jsonb,uuid)'::regprocedure), 'venta_redondeo_invalido', 'otra_cosa'); end $x$;`);

  // ---- 28. Las dos partes: se pegan dos veces, dejan la huella prometida, abortan si falta una parte de la que dependen o si registrar_venta cambió ----
  const venta = readFileSync(MIGRACION_VENTA, "utf8");
  const bandera = readFileSync(MIGRACION_BANDERA, "utf8");
  const huellaVenta = (venta.match(/c_despues constant text := '([0-9a-f]{32})'/) ?? [])[1];
  // Sobre SU punto de partida: la base ya tiene el precio por sede (ADR-0370), que cambió una línea de registrar_venta.
  const r28 = correr(`begin;\n${DESHACER_PRECIO_SEDE}\n${venta}\n${venta}\n${bandera}\n${bandera}
select 'h|' || md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta';
select 'sobrecargas|' || count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta';
rollback;`);
  esperar("las dos partes son re-ejecutables, dejan la huella prometida de registrar_venta y UNA sola firma (la de 18 parámetros)", r28.ok && r28.salida.includes(`h|${huellaVenta}`) && r28.salida.includes("sobrecargas|1"), r28.ok ? r28.salida : r28.mensaje);
  const r28b = correr(`begin;
do $x$ begin execute replace(pg_get_functiondef('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)'::regprocedure), 'El carrito está vacío', 'El carrito está vacío (cambiado en vivo)'); end $x$;
${venta}
rollback;`);
  esperar("el parche de registrar_venta aborta si la función cambió desde que se escribió (no la pisa a ciegas)", !r28b.ok && r28b.mensaje.includes("cambió desde que se escribió esta migración"), r28b.ok ? "pasó y debía abortar" : r28b.mensaje);
  const r28c = correr(`begin;\ndrop function retail.fn_redondeo_efectivo(numeric);\n${venta}\nrollback;`);
  esperar("el parche de registrar_venta aborta si falta la regla de la que depende (no deja una función que llama a algo que no existe)", !r28c.ok && r28c.mensaje.includes("falta retail.fn_redondeo_efectivo"), r28c.ok ? "pasó y debía abortar" : r28c.mensaje);

  // ---- 29. Paridad caja ↔ base en los 99 999 montos: si dieran distinto, la base rechazaría en el mostrador la venta que la caja armó ----
  const r29 = correr(`begin;\n${APLICAR_ANTES}\nselect g || '|' || (retail.fn_redondeo_efectivo(g / 100.0) * 100)::int from generate_series(1, 99999) g;\nrollback;`);
  if (!r29.ok) {
    esperar("paridad caja ↔ base en 99 999 montos", false, r29.mensaje);
  } else {
    const filas29 = r29.salida.split("\n").filter(Boolean);
    const dif29 = [];
    for (const l of filas29) {
      const [g, redBase] = l.split("|").map(Number);
      const redCaja = Math.round(redondeoDelEfectivo(g / 100) * 100);
      const cobraCaja = Math.round(efectivoACobrar(g / 100) * 100);
      if (redCaja !== redBase || cobraCaja + redBase !== g) dif29.push(`S/ ${g / 100}: caja ${redCaja}, base ${redBase}`);
      if (dif29.length >= 5) break;
    }
    esperar(`la caja (redondeoDelEfectivo) y la base (fn_redondeo_efectivo) dan lo mismo en ${filas29.length} montos de S/ 0.01 a 999.99: 0 diferencias`, filas29.length === 99999 && dif29.length === 0, dif29.join(" · ") || `solo ${filas29.length} filas`);
  }


  // =====================================================================================================================
  // ACTIVIDAD 6 — Apartados: el SALDO que se paga al entregar se redondea; el adelanto y los abonos no. `entregar_separacion` REAL.
  // =====================================================================================================================
  // Un apartado de 79.90 con 50.02 de adelanto en Yape: el saldo (29.88) trae los céntimos que nacen del precio. El adelanto es un monto
  // que el cliente elige; por eso solo el saldo se redondea.
  const APARTADO = `${PREPARACION}
select retail.separar_prendas(p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 50.02)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222', p_devolucion_medio => 'yape') as sep \\gset`;
  const entregar = (pagos, token = "null") =>
    `select retail.entregar_separacion(:'sep', '${JSON.stringify(pagos)}'::jsonb, ${token}) as venta \\gset`;

  // ---- 30. El saldo de 29.88 en efectivo: cobra 29.80 (recibió 30) + 0.08 de redondeo; la boleta final sigue por el saldo exacto ----
  const r30 = correr(`${APARTADO}
${entregar([{ metodo: "efectivo", monto: 29.8, recibido: 30 }, { metodo: "redondeo", monto: 0.08 }])}
select 'filas|' || string_agg(metodo || '=' || monto || coalesce('/' || recibido, ''), ' ' order by metodo) from retail.venta_pagos where venta_id = :'venta';
select 'suma|' || (select sum(monto) from retail.venta_pagos where venta_id = :'venta') || '|' || (select sum(subtotal) from retail.venta_items where venta_id = :'venta');
select 'boleta|' || total || '|' || subtotal || '|' || igv from retail.comprobantes where venta_id = :'venta';
select 'estado|' || estado || '|' || (venta_id = :'venta') from retail.separaciones where id = :'sep';
select 'esperado|' || esperado from retail.fn_calcular_esperado_caja(:'caja_id');
select 'resumen|' || (retail.fn_resumen_caja(:'caja_id'))::text;
select 'verifica|' || (select count(*) from retail.fn_verificar_separaciones()) || '|' || (select count(*) from retail.fn_verificar_apartados());
select 'diario6598|' || coalesce(sum(debe - haber), 0) from retail.fn_asientos(${HOY}, ${HOY}, :'ubic') where origen_id = :'venta' and cuenta = '6598';
select 'descuadrados|' || count(*) from retail.fn_asientos_descuadrados(${HOY}, ${HOY}, :'ubic');
rollback;`);
  if (!r30.ok) {
    esperar("entregar_separacion acepta el saldo redondeado (29.88 = 29.80 efectivo + 0.08)", false, r30.mensaje);
  } else {
    const l30 = Object.fromEntries(r30.salida.split("\n").filter(Boolean).map((l) => [l.split("|")[0], l.slice(l.indexOf("|") + 1)]));
    const resumen30 = JSON.parse(l30.resumen);
    esperar("entregar_separacion: guarda anticipo 50.02, efectivo 29.80 (recibió 30) y redondeo 0.08; la suma de las filas es el total del apartado (79.90)", l30.filas === "anticipo=50.02 efectivo=29.80/30.00 redondeo=0.08" && l30.suma === "79.90|79.90", JSON.stringify(l30));
    esperar("la boleta final sale por el saldo EXACTO (29.88): el redondeo no toca el comprobante", l30.boleta === "29.88|25.32|4.56", l30.boleta);
    esperar("el apartado queda entregado y ligado a la venta; los verificadores de apartados dan 0 problemas", l30.estado === "entregada|true" && l30.verifica === "0|0", `${l30.estado} ${l30.verifica}`);
    esperar("Caja: «Efectivo en el cajón» = 100.00 + 29.80 (el adelanto fue Yape) y el redondeo viaja aparte (0.08)", l30.esperado === "129.80" && Number(resumen30.redondeo) === 0.08, `${l30.esperado} ${l30.resumen}`);
    esperar("el diario asienta los 0.08 contra la cuenta 6598 (gasto) y todos los asientos cuadran", Number(l30.diario6598) === 0.08 && l30.descuadrados === "0", `${l30.diario6598} ${l30.descuadrados}`);
  }

  // ---- 31. Un pago mixto: solo el efectivo del saldo se redondea; y compatibilidad con el efectivo exacto de siempre ----
  const aceptaEntrega = (nombre, pagos, esperado) => {
    const r = correr(`${APARTADO}
${entregar(pagos)}
select 'filas|' || string_agg(metodo || '=' || monto, ' ' order by metodo) from retail.venta_pagos where venta_id = :'venta';
rollback;`);
    esperar(nombre, r.ok && r.salida === `filas|${esperado}`, r.ok ? r.salida : r.mensaje);
  };
  aceptaEntrega("saldo mixto: Yape 10.00 exacto + efectivo 19.80 + redondeo 0.08", [{ metodo: "yape", monto: 10 }, { metodo: "efectivo", monto: 19.8 }, { metodo: "redondeo", monto: 0.08 }], "anticipo=50.02 efectivo=19.80 redondeo=0.08 yape=10.00");
  aceptaEntrega("una entrega con el efectivo exacto (29.88, sin fila de redondeo) se sigue aceptando: nada de lo que funcionaba se rompe", [{ metodo: "efectivo", monto: 29.88 }], "anticipo=50.02 efectivo=29.88");
  aceptaEntrega("el saldo en tarjeta va exacto, sin redondeo", [{ metodo: "tarjeta", monto: 29.88 }], "anticipo=50.02 tarjeta=29.88");

  // ---- 32. Lo que la base RECHAZA: cada intento de cobrar de más, de redondear mal o de guardar un estado imposible ----
  const rechazaEntrega = (nombre, pagos, texto) => {
    const r = correr(`${APARTADO}\n${entregar(pagos)}\nrollback;`);
    esperar(nombre, !r.ok && r.mensaje.includes(texto), r.ok ? `pasó y debía fallar con «${texto}»` : r.mensaje);
  };
  rechazaEntrega("cobrar DE MÁS no se puede: efectivo 29.90 con un «redondeo» negativo", [{ metodo: "efectivo", monto: 29.9 }, { metodo: "redondeo", monto: -0.02 }], "mayor a cero");
  rechazaEntrega("un efectivo de 29.90 para un saldo de 29.88 no cuadra (la suma no es el saldo)", [{ metodo: "efectivo", monto: 29.9 }], "no cuadran con el saldo del apartado");
  rechazaEntrega("un redondeo que no es el de la ley no se acepta (29.81 + 0.07 no son efectivo en monedas)", [{ metodo: "efectivo", monto: 29.81 }, { metodo: "redondeo", monto: 0.07 }], "venta_redondeo_invalido");
  rechazaEntrega("el efectivo con redondeo se cobra en monedas que existen: 29.85 + 0.03 se rechaza", [{ metodo: "efectivo", monto: 29.85 }, { metodo: "redondeo", monto: 0.03 }], "múltiplos de S/ 0.10");
  rechazaEntrega("un «redondeo» de S/ 0.18 no es un redondeo (efectivo 29.70 + 0.18)", [{ metodo: "efectivo", monto: 29.7 }, { metodo: "redondeo", monto: 0.18 }], "no es el de la ley");
  rechazaEntrega("un redondeo sin efectivo no existe: Yape 29.80 + redondeo 0.08", [{ metodo: "yape", monto: 29.8 }, { metodo: "redondeo", monto: 0.08 }], "solo existe junto a UN pago en efectivo");
  rechazaEntrega("dos pagos en efectivo con redondeo es ambiguo: se rechaza", [{ metodo: "efectivo", monto: 10 }, { metodo: "efectivo", monto: 19.8 }, { metodo: "redondeo", monto: 0.08 }], "solo existe junto a UN pago en efectivo");
  rechazaEntrega("dos redondeos en una entrega serían redondear dos veces", [{ metodo: "efectivo", monto: 29.8 }, { metodo: "redondeo", monto: 0.04 }, { metodo: "redondeo", monto: 0.04 }], "a lo más un redondeo");
  rechazaEntrega("el redondeo no puede ser todo el pago: solo la fila de redondeo", [{ metodo: "redondeo", monto: 29.88 }], "solo existe junto a UN pago en efectivo");

  // ---- 33. El adelanto y los abonos NO se redondean: separar_prendas y abonar_separacion siguen rechazando el medio ----
  const r33 = correr(`${PREPARACION}
select retail.separar_prendas(p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50.00), jsonb_build_object('metodo', 'redondeo', 'monto', 0.02)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222', p_devolucion_medio => 'yape');
rollback;`);
  esperar("apartar con una fila de redondeo en el adelanto se rechaza (el adelanto no se redondea)", !r33.ok && r33.mensaje.includes("Medio de pago no reconocido"), r33.ok ? "pasó y debía fallar" : r33.mensaje);
  const r33b = correr(`${APARTADO}
select retail.abonar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 5.00), jsonb_build_object('metodo', 'redondeo', 'monto', 0.02)));
rollback;`);
  esperar("abonar con una fila de redondeo se rechaza (el abono no se redondea)", !r33b.ok && r33b.mensaje.includes("Medio de pago no reconocido"), r33b.ok ? "pasó y debía fallar" : r33b.mensaje);

  // ---- 34. Idempotencia: la misma entrega dos veces (el reintento de una pantalla que no recibió respuesta) es UNA venta, con UN redondeo ----
  const r34 = correr(`${APARTADO}
select gen_random_uuid() as tok \\gset
${entregar([{ metodo: "efectivo", monto: 29.8, recibido: 30 }, { metodo: "redondeo", monto: 0.08 }], ":'tok'")}
select :'venta' as venta1 \\gset
${entregar([{ metodo: "efectivo", monto: 29.8, recibido: 30 }, { metodo: "redondeo", monto: 0.08 }], ":'tok'")}
select 'misma|' || (:'venta' = :'venta1') || '|redondeos|' || (select count(*) from retail.venta_pagos where venta_id = :'venta' and metodo = 'redondeo') || '|ventas|' || (select count(*) from retail.ventas where id = :'venta');
rollback;`);
  esperar("reintentar la misma entrega (mismo token) devuelve LA misma venta, con un solo redondeo", r34.ok && r34.salida === "misma|true|redondeos|1|ventas|1", r34.ok ? r34.salida : r34.mensaje);

  // ---- 35. La migración: se pega dos veces, deja la huella prometida y UNA firma; aborta si la función cambió o si falta una parte ----
  const entrega = readFileSync(MIGRACION_ENTREGA, "utf8");
  const huellaEntrega = (entrega.match(/c_despues constant text := '([0-9a-f]{32})'/) ?? [])[1];
  const r35 = correr(`begin;\n${entrega}\n${entrega}
select 'h|' || md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'entregar_separacion';
select 'sobrecargas|' || count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'entregar_separacion';
rollback;`);
  esperar("la migración de entregar_separacion es re-ejecutable, deja la huella prometida y UNA sola firma", r35.ok && r35.salida.includes(`h|${huellaEntrega}`) && r35.salida.includes("sobrecargas|1"), r35.ok ? r35.salida : r35.mensaje);
  const r35b = correr(`begin;
do $x$ begin execute replace(pg_get_functiondef('retail.entregar_separacion(uuid,jsonb,uuid)'::regprocedure), 'Ese apartado no existe', 'Ese apartado no existe (cambiado en vivo)'); end $x$;
${entrega}
rollback;`);
  esperar("el parche de entregar_separacion aborta si la función cambió desde que se escribió (no la pisa a ciegas)", !r35b.ok && r35b.mensaje.includes("cambió desde que se escribió esta migración"), r35b.ok ? "pasó y debía abortar" : r35b.mensaje);
  const r35c = correr(`begin;\ndrop function retail.fn_redondeo_efectivo(numeric);\n${entrega}\nrollback;`);
  esperar("el parche de entregar_separacion aborta si falta la regla de la que depende", !r35c.ok && r35c.mensaje.includes("falta retail.fn_redondeo_efectivo"), r35c.ok ? "pasó y debía abortar" : r35c.mensaje);

  // =====================================================================================================================
  // EL PEGADO EN EL SQL EDITOR DE SUPABASE (2026-10-02): Felipe pegó `registrar_venta` y le llegó el texto CORTADO en la línea 96: «unterminated
  // dollar-quoted string». Peor es el corte que cae entre dos instrucciones: Postgres lo acepta, el editor dice «Success» y no se aplicó nada
  // (le pasó a la parte del diario: quedó la cuenta 6598 y la función sin parchar). Por eso cada archivo termina con una fila «QUEDÓ BIEN».
  // El editor manda todo el texto como UNA sola consulta (se analiza entero antes de ejecutar nada): `psql -c` hace lo mismo.
  // =====================================================================================================================
  const pegarComoEditor = (texto) => {
    try {
      return { ok: true, salida: execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-c", texto], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim() };
    } catch (e) {
      return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
    }
  };
  const PARTES_A_PEGAR = [
    "20261003100000_redondeo_efectivo_regla", "20261003110000_venta_pagos_candado_redondeo", "20261003111000_redondeo_lectores", "20261003120000_redondeo_diario",
    "20261003130000_registrar_venta_redondeo", "20261003135000_entregar_separacion_redondeo", "20261003140000_acepta_redondeo_efectivo",
  ];
  const textoDe = (parte) => readFileSync(`supabase/migrations/${parte}.sql`, "utf8");

  // ---- 36. Cada parte, pegada ENTERA como un solo texto, termina con su fila «QUEDÓ BIEN» ----
  for (const parte of PARTES_A_PEGAR) {
    // La de registrar_venta se pega sobre su punto de partida y después se rehace el precio por sede (ADR-0370): la base termina igual.
    const r = pegarComoEditor(parte === "20261003130000_registrar_venta_redondeo" ? `${DESHACER_PRECIO_SEDE}\n${textoDe(parte)}\n${REHACER_PRECIO_SEDE}` : textoDe(parte));
    esperar(`${parte.slice(0, 14)} pegada entera (como la pega el editor) termina con su fila «QUEDÓ BIEN»`, r.ok && r.salida.split("\n").filter((l) => l.includes("QUEDÓ BIEN") && l.startsWith(parte.slice(0, 14))).length === 1, r.ok ? r.salida.slice(-400) : r.mensaje);
  }

  // ---- 37. NINGÚN texto cortado puede pasar por pegado completo: en cada archivo, los cortes que caen donde una instrucción termina (los
  //          «silenciosos» que Postgres acepta) y unos cuantos más repartidos NO dan jamás la fila «QUEDÓ BIEN» ----
  let cortes = 0;
  let silenciosos = 0;
  const falsosOk = [];
  for (const parte of PARTES_A_PEGAR) {
    const lineas = textoDe(parte).replace(/\n$/, "").split("\n"); // sin la línea vacía final: el corte del ÚLTIMO renglón sería el archivo entero
    const candidatos = new Set();
    lineas.forEach((l, i) => { if (i + 1 < lineas.length && /;\s*$/.test(l)) candidatos.add(i + 1); });
    for (let k = 1; k <= 8; k++) candidatos.add(Math.floor((lineas.length * k) / 9));
    for (const n of [...candidatos].sort((a, b) => a - b)) {
      const corte = lineas.slice(0, n).join("\n");
      // dentro de una transacción que se revierte: el efecto no queda; la ausencia de la fila es lo que se prueba
      const r = pegarComoEditor(`begin;\n${corte}\nrollback;`);
      cortes++;
      if (r.ok && r.salida.includes("QUEDÓ BIEN")) falsosOk.push(`${parte.slice(0, 14)}:${n}`);
      if (r.ok) silenciosos++;
    }
  }
  esperar(`${cortes} textos cortados (${silenciosos} que Postgres acepta sin quejarse, ${cortes - silenciosos} que rechaza) no dan NUNCA «QUEDÓ BIEN»: un pegado cortado se nota`, cortes > 100 && falsosOk.length === 0, falsosOk.join(" "));

  // ---- 14. AUDITORÍA: toda función que lee venta_pagos o separacion_pagos está revisada pensando en el redondeo ----
  // Una función nueva que lea los pagos aparece aquí y la prueba falla hasta que alguien decida qué hace con la fila 'redondeo'
  // (y la anote). Es el candado que reemplaza a «acordarse»: sin él, cada lector olvidado deja una cifra de dinero mal.
  const REVISADAS = {
    abonar_separacion: "Apartados: los abonos no se redondean (ADR-0311 §7); solo lee separacion_pagos.",
    buscar_separaciones: "Apartados: lectura de separacion_pagos.",
    corregir_pagos_venta:
      "ADR-0365: reparte lo cobrado (con el redondeo de antes) y vuelve a calcular el redondeo con fn_redondeo_efectivo si queda efectivo y la caja redondea; sin efectivo, la fila de redondeo desaparece. La suma de filas no cambia.",
    entregar_separacion: "PARCHADA (20261003135000, actividad 6): el saldo en efectivo al entregar acepta la fila de redondeo y exige que sea el redondeo exacto de la ley.",
    fn_acepta_redondeo_efectivo: "La bandera del despliegue (20261003140000): solo mira el catálogo para saber si la base ya recibe el redondeo; no suma pagos.",
    fn_asientos: "Cada fila de venta_pagos genera su Debe, así que el asiento cuadra solo; el medio redondeo va a la cuenta 6598 por fn_asiento_cuenta_de_medio (20261003120000, actividad 3) y la anulación lo revierte. No se parchó.",
    fn_bal_causas_dinero: "Solo lee separacion_pagos.",
    fn_calcular_esperado_caja: "Suma el monto de la fila de EFECTIVO: ya es lo físico (múltiplo de 0.10). No se toca.",
    fn_comparativa_caja: "Caja compara hoy contra ayer (ADR-0319): devuelve la fila de redondeo como una más, a propósito, para que el total vendido coincida con el de Vender y el historial (como fn_totales_historial_ventas); la pantalla la deja fuera de «Cómo te pagaron» (`metodosComparados`). No se parchó.",
    fn_dinero_libro: "Filtra por medios explícitos (yape, plin, tarjeta, transferencia, qr): el redondeo queda fuera.",
    fn_flujo_caja_proyeccion: "Filtra por medios explícitos: el redondeo queda fuera.",
    fn_flujo_lineas: "Efectivo = metodo 'efectivo' (lo físico), igual que fn_calcular_esperado_caja. No se toca.",
    fn_sello_caja: "Solo cuenta filas de venta_pagos_correcciones (ADR-0365) para el tablero en vivo: no suma pagos.",
    fn_resumen_caja: "PARCHADA (20261003111000): el redondeo sale de por_metodo, de otros y de ventas_otros, y viaja aparte.",
    fn_totales_historial_ventas: "Deja el redondeo como una fila más de «cómo se pagó» a propósito: la lista sigue sumando el total vendido.",
    fn_ventas_del_dia: "PARCHADA (20261003111000): la lista de medios de la venta no incluye el redondeo.",
    fn_verificar_separaciones: "Suma TODAS las filas de la venta contra el total del apartado: el redondeo cuenta (la suma de filas sigue igualando el total).",
    liquidar_prenda_danada: "Valida su propio medio (efectivo, tarjeta, yape, plin, transferencia): no acepta redondeo.",
    registrar_venta: "PARCHADA (20261003130000, actividad 5): acepta la fila de redondeo y exige que sea el redondeo exacto de la ley.",
    resumen_separaciones: "Apartados: lectura de separacion_pagos.",
    separar_prendas: "Adelanto de un apartado: no se redondea (ADR-0311 §7); solo escribe separacion_pagos.",
  };
  const r14 = correr(`select p.proname from pg_proc p where p.pronamespace = 'retail'::regnamespace
    and (p.prosrc ilike '%venta_pagos%' or p.prosrc ilike '%separacion_pagos%') order by 1;`);
  if (!r14.ok) {
    esperar("auditoría de lectores de venta_pagos", false, r14.mensaje);
  } else {
    const vivas = r14.salida.split("\n").filter(Boolean);
    const sinRevisar = vivas.filter((n) => !(n in REVISADAS));
    const sobran = Object.keys(REVISADAS).filter((n) => !vivas.includes(n));
    esperar(
      `toda función que lee venta_pagos / separacion_pagos está revisada pensando en el redondeo (${vivas.length} funciones)`,
      sinRevisar.length === 0 && sobran.length === 0,
      (sinRevisar.length ? `SIN REVISAR: ${sinRevisar.join(", ")} — decide qué hace cada una con la fila 'redondeo' y anótala en REVISADAS. ` : "") + (sobran.length ? `YA NO LEEN pagos (sácalas de REVISADAS): ${sobran.join(", ")}` : ""),
    );
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

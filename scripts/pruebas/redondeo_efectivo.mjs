#!/usr/bin/env node
/**
 * Pruebas del REDONDEO DEL EFECTIVO (ADR-0310) contra el Postgres local — CAYLA V2.
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
 * (La caja tendrá su gemela en TypeScript cuando Vender la use —actividad 5—; entonces esta prueba también compara las dos en
 * los 99 999 montos. Hoy ninguna pantalla la llama y el repo no admite una regla sin uso.)
 *
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

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION_REGLA = "supabase/migrations/20261003100000_redondeo_efectivo_regla.sql";
const MIGRACION_CANDADO = "supabase/migrations/20261003110000_venta_pagos_candado_redondeo.sql";
const MIGRACION_LECTORES = "supabase/migrations/20261003111000_redondeo_lectores.sql";
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

  // ---- 14. AUDITORÍA: toda función que lee venta_pagos o separacion_pagos está revisada pensando en el redondeo ----
  // Una función nueva que lea los pagos aparece aquí y la prueba falla hasta que alguien decida qué hace con la fila 'redondeo'
  // (y la anote). Es el candado que reemplaza a «acordarse»: sin él, cada lector olvidado deja una cifra de dinero mal.
  const REVISADAS = {
    abonar_separacion: "Apartados: los abonos no se redondean (ADR-0310 §7); solo lee separacion_pagos.",
    buscar_separaciones: "Apartados: lectura de separacion_pagos.",
    entregar_separacion: "ACTIVIDAD 6: el saldo en efectivo al entregar se redondea (por ahora rechaza el medio redondeo).",
    fn_asientos: "ACTIVIDAD 3: cada fila de venta_pagos genera su Debe, así que el asiento cuadra; falta la cuenta del medio redondeo.",
    fn_bal_causas_dinero: "Solo lee separacion_pagos.",
    fn_calcular_esperado_caja: "Suma el monto de la fila de EFECTIVO: ya es lo físico (múltiplo de 0.10). No se toca.",
    fn_dinero_libro: "Filtra por medios explícitos (yape, plin, tarjeta, transferencia, qr): el redondeo queda fuera.",
    fn_flujo_caja_proyeccion: "Filtra por medios explícitos: el redondeo queda fuera.",
    fn_flujo_lineas: "Efectivo = metodo 'efectivo' (lo físico), igual que fn_calcular_esperado_caja. No se toca.",
    fn_resumen_caja: "PARCHADA (20261003111000): el redondeo sale de por_metodo, de otros y de ventas_otros, y viaja aparte.",
    fn_totales_historial_ventas: "Deja el redondeo como una fila más de «cómo se pagó» a propósito: la lista sigue sumando el total vendido.",
    fn_ventas_del_dia: "PARCHADA (20261003111000): la lista de medios de la venta no incluye el redondeo.",
    fn_verificar_separaciones: "Suma TODAS las filas de la venta contra el total del apartado: el redondeo cuenta (la suma de filas sigue igualando el total).",
    liquidar_prenda_danada: "Valida su propio medio (efectivo, tarjeta, yape, plin, transferencia): no acepta redondeo.",
    registrar_venta: "ACTIVIDAD 5: es la que escribe la fila de redondeo, y exige que sea el redondeo exacto de la ley.",
    resumen_separaciones: "Apartados: lectura de separacion_pagos.",
    separar_prendas: "Adelanto de un apartado: no se redondea (ADR-0310 §7); solo escribe separacion_pagos.",
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

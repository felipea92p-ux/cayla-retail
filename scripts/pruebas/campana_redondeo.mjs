#!/usr/bin/env node
/**
 * Pruebas del descuento de campaña EXACTO (ADR-0302; antes, el redondeo a .90 de ADR-0182) contra el Postgres local —
 * CAYLA V2. El nombre del script (`campana-redondeo`) se conserva para no tocar el CI: hoy el único redondeo es al céntimo.
 *
 * QUÉ PRUEBA. `20261001161912_campana_descuento_exacto.sql`: la regla `retail.fn_descuento_campana` (el % sobre el
 * precio, al céntimo) y que las funciones que cobran con campaña la usen. `registrar_venta` acepta el descuento exacto y
 * rechaza el del .90 de antes, y `separar_prendas` también. Si la caja (`descuentoDeCampana`, lib/vender-reglas.ts) y la
 * base dan números distintos, la venta se rechaza en el mostrador: por eso la tabla de ejemplos es la MISMA que en
 * `vender-reglas.test.ts`.
 *
 * CÓMO. El patrón de `registrar_venta.mjs`: cada escenario en su propia transacción con ROLLBACK, contra la RPC real,
 * como Felipe (líder) con `set local request.jwt.claim.sub`. Nunca se commitea nada en el Postgres local que comparten
 * los worktrees. La campaña de prueba (20 %) se crea y se etiqueta dentro de cada transacción.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261001161912_campana_descuento_exacto.sql` mete la
 * migración dentro de la transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace CI).
 * El escenario 5 la aplica DOS veces seguidas para probar que se puede re-ejecutar.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` (precio 79.90) del seed.
 *
 * USO
 *   pnpm pruebas:campana-redondeo    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261001161912_campana_descuento_exacto.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
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

// Tienda Lima lista para vender y separar: piso/almacén (autocuración), caja propia, stock de sobra, y una campaña
// «ZZ Descuento exacto (prueba)» de 20 % vigente hoy, etiquetada a BLU-EMMA-NEG-M. 79.90 con 20 % descuenta 15.98 y se
// cobra 63.92 (con el .90 de antes eran 16.00 y 63.90).
const FIXTURE = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v1, precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
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
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
insert into retail.etiquetas (nombre, estado, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('ZZ Descuento exacto (prueba)', 'aprobado', true, 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5)
  returning id as etq \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'etq');
-- Si otra campaña de mayor % rige hoy sobre esta prenda, el escenario no prueba lo que dice: se corta aquí.
select etiqueta_id = :'etq' as es_la_nuestra from retail.campanas_vigentes() where variante_id = :'v1' \\gset
\\if :es_la_nuestra
\\else
  select 1 / 0 as otra_campana_gana;
\\endif
`;

const linea = (descuento, motivo, etq = true) =>
  `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', ${descuento}` +
  `, 'motivo_descuento', '${motivo}'${etq ? ", 'descuento_etiqueta_id', :'etq'" : ""}))`;
const venta = (descuento, motivo, cobro, etq = true) =>
  `select retail.registrar_venta(:'ubic', ${linea(descuento, motivo, etq)},
     jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${cobro})), null, gen_random_uuid()) as venta \\gset`;
const separar = (descuento) =>
  `select retail.separar_prendas(
     p_ubicacion_id => :'ubic',
     p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', ${descuento})),
     p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50, 'recibido', 60)),
     p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
     p_devolucion_medio => 'yape') as sep \\gset`;

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
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»: ${r.salida}` : r.mensaje);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. La regla: la misma tabla que vender-reglas.test.ts (caja y base tienen que dar lo mismo) ----
  const EJEMPLOS = [
    [39, 20, 7.8], [89.9, 20, 17.98], [79.9, 30, 23.97], [95.8, 25, 23.95], [159.8, 50, 79.9], [100, 20, 20], [22, 10, 2.2],
    [89.9, 12.5, 11.24], [89.9, 33.33, 29.96], [199.9, 30, 59.97], [69.9, 15, 10.49], [19.9, 25, 4.98],
    [89.9, 0, 0], [89.9, 100, 89.9], [1, 50, 0.5], [1.5, 50, 0.75],
  ];
  const r1 = correr(`begin;\n${APLICAR_ANTES}\n` +
    EJEMPLOS.map(([p, pct]) => `select '${p}|${pct}|' || retail.fn_descuento_campana(${p}, ${pct});`).join("\n") + "\nrollback;");
  if (!r1.ok) {
    esperar("fn_descuento_campana existe y responde", false, r1.mensaje);
  } else {
    const dio = new Map(r1.salida.split("\n").filter(Boolean).map((l) => { const [p, pct, d] = l.split("|"); return [`${p}|${pct}`, Number(d)]; }));
    const malos = EJEMPLOS.filter(([p, pct, d]) => dio.get(`${p}|${pct}`) !== d).map(([p, pct, d]) => `S/ ${p} con ${pct} %: esperaba ${d}, dio ${dio.get(`${p}|${pct}`)}`);
    esperar(`fn_descuento_campana da lo mismo que la caja en ${EJEMPLOS.length} ejemplos (39.00 con 20 % → 7.80, empates de medio céntimo hacia arriba…)`, malos.length === 0, malos.join(" · "));
  }

  // ---- 2. Venta con campaña: el descuento exacto se acepta y la línea cobra 63.92 ----
  const r2 = correr(`${FIXTURE}
${venta(15.98, "campana", 63.92)}
select 'linea|' || descuento_unitario || '|' || subtotal || '|' || motivo_descuento || '|' || (descuento_etiqueta_id = :'etq')::text
  from retail.venta_items where venta_id = :'venta';
rollback;`);
  esperar(
    "registrar_venta acepta la campaña exacta: 79.90 − 15.98 = 63.92",
    r2.ok && r2.salida.includes("linea|15.98|63.92|campana|true"),
    r2.ok ? r2.salida : r2.mensaje,
  );

  // ---- 3. Una caja vieja (con el .90) se rechaza: 16.00 es más de lo que da la campaña. Y menos, tampoco ----
  esperarError("registrar_venta rechaza el descuento del .90 (16.00) de una caja vieja", correr(`${FIXTURE}\n${venta(16.0, "campana", 63.9)}\nrollback;`), "venta_campana_monto_no_coincide");
  esperarError("registrar_venta rechaza un descuento de campaña menor que el exacto (15.96)", correr(`${FIXTURE}\n${venta(15.96, "campana", 63.94)}\nrollback;`), "venta_campana_omitida");

  // ---- 4. Un descuento manual tiene que SUPERAR la campaña (15.98 no alcanza) ----
  esperarError(
    "un descuento manual igual a la campaña exacta no la reemplaza",
    correr(`${FIXTURE}\n${venta(15.98, "cerrar_venta", 63.92, false)}\nrollback;`),
    "venta_descuento_no_supera_campana",
  );

  // ---- 5. La migración se puede pegar dos veces, y deja la regla en las funciones que cobran ----
  // Solo reemplaza el cuerpo de `fn_descuento_campana`: `registrar_venta`, `separar_prendas` y `editar_separacion` la
  // llaman por su nombre y no se tocan. Lo que se vigila es que la sigan llamando (si una copiara la cuenta adentro,
  // quedaría con otra regla que la caja) y que la regla viva sea la exacta.
  const migracion = readFileSync(MIGRACION, "utf8");
  const r5 = correr(`begin;\n${migracion}\n${migracion}\nselect 'r|' || retail.fn_descuento_campana(39, 20);\nrollback;`);
  esperar("la migración es re-ejecutable (dos veces seguidas) y deja 39.00 con 20 % → 7.80", r5.ok && r5.salida.includes("r|7.80"), r5.ok ? r5.salida : r5.mensaje);
  const r5b = correr(`select 'llaman|' || count(*) from pg_proc
    where pronamespace = 'retail'::regnamespace and proname in ('registrar_venta', 'separar_prendas', 'editar_separacion')
      and prosrc like '%fn_descuento_campana(%';`);
  esperar("registrar_venta, separar_prendas y editar_separacion llaman a la regla (ninguna la copió adentro)", r5b.ok && r5b.salida.includes("llaman|3"), r5b.ok ? r5b.salida : r5b.mensaje);

  // ---- 6. Separaciones: la misma regla ----
  const r6 = correr(`${FIXTURE}
${separar(15.98)}
select 'item|' || descuento_unitario || '|' || (descuento_etiqueta_id = :'etq')::text from retail.separacion_items where separacion_id = :'sep';
rollback;`);
  esperar("separar_prendas acepta y guarda la campaña exacta (15.98)", r6.ok && r6.salida.includes("item|15.98|true"), r6.ok ? r6.salida : r6.mensaje);
  esperarError("separar_prendas rechaza el descuento del .90 de antes (16.00)", correr(`${FIXTURE}\n${separar(16.0)}\nrollback;`), "separacion_descuento_no_coincide");

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

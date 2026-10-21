#!/usr/bin/env node
/**
 * Prueba del medidor de confianza de Finanzas — ADR-0417, Fase 1 (`20261015235000_finanzas_confianza.sql`).
 *
 * QUÉ CUBRE
 *   · LOS HECHOS SALEN: el líder recibe las siete piezas (costo, fijos, facturas, saldos, tarjeta, planilla, conciliación).
 *   · CADA HECHO SE MUEVE CON SU DATO: una venta sin prenda sube `costo.unidades_estimadas`; un gasto fijo sube
 *     `fijos.configurados` y, si su día ya pasó sin gasto, `fijos.faltan_mes`; una conciliación sube `conciliacion.conciliados_mes`;
 *     una recepción sin factura sube `facturas.lotes_sin_factura`.
 *   · POR SEDE: con una sede, el costo cuenta solo esa sede.
 *   · PERMISOS: sin el módulo Reportes financieros, `insufficient_privilege`; `anon` no la puede llamar.
 *   · PEGAR DOS VECES no cambia la función.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK; fechas de 2019 para no cruzarse con datos reales.
 * Depende de `20261015233000_costo_estimado_venta_sin_prenda.sql` (se aplica antes, dentro del mismo ROLLBACK).
 *
 * USO
 *   pnpm pruebas:finanzas-confianza
 *   node scripts/pruebas/finanzas_confianza.mjs --contenedor <otro>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora, sin Reportes financieros
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (n) => readFileSync(join(RAIZ, "supabase", "migrations", n), "utf8");
const MIGRACIONES = leer("20261015233000_costo_estimado_venta_sin_prenda.sql") + "\n" + leer("20261015235000_finanzas_confianza.sql");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => l.split("|")));
  for (const [caso, valor] of Object.entries(esperados)) {
    esperar(`${titulo}: ${caso}`, lineas[caso] === valor, { esperado: valor, salio: lineas[caso], todo: lineas });
  }
}

// Julio de 2019: un mes vacío en el seed. El «hoy» de la función es el real, así que los hechos del mes 2019-07 miran
// todo julio (hasta = fin de mes, porque ya pasó).
const MES = "2019-07-01";
const SEMILLA = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as talla from retail.tallas limit 1 \\gset
select codigo as color from retail.colores limit 1 \\gset
select p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.costo > 0 and v.precio > 0 limit 1 \\gset
select v.id as real_var from retail.variantes v where v.costo > 0 and v.id <> '${CENTINELA}' limit 1 \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco de prueba', 'banco', '104') returning id as banco \\gset
`;
const hecho = (nombre, ruta) => `select '${nombre}|' || (retail.fn_finanzas_confianza('${MES}', null) ${ruta});`;

// ---------- Escena 1: los hechos y cómo se mueven ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${SEMILLA}
${MIGRACIONES}
select 'piezas|' || (select count(*) from jsonb_object_keys(retail.fn_finanzas_confianza('${MES}', null)) k where k in ('costo','fijos','facturas','saldos','tarjeta','planilla','conciliacion'));
${hecho("costo_vacio", "#>>'{costo,unidades_estimadas}'")}
${hecho("fijos_vacio", "#>>'{fijos,configurados}'")}
${hecho("concil_vacio", "#>>'{conciliacion,conciliados_mes}'")}

-- Una venta sin prenda en TRU: el costo estimado cuenta 1 unidad, y por sede solo en TRU.
insert into retail.ventas (ubicacion_id, created_at) values (:'tru', '2019-07-10 15:00-05') returning id as venta_a \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (:'venta_a', '${CENTINELA}', 1, 100, 0, 0) returning id as item_a \\gset
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado)
  values (:'item_a', :'tru', 'Blusa de prueba', :'cat', :'talla', :'color', 100);
-- Y una venta real en TRU con tarjeta: cuenta en cobros con tarjeta del mes.
insert into retail.ventas (ubicacion_id, created_at) values (:'tru', '2019-07-11 15:00-05') returning id as venta_b \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (:'venta_b', :'real_var', 1, 118, 0, 45);
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'venta_b', 'tarjeta', 118);
${hecho("costo_una", "#>>'{costo,unidades_estimadas}'")}
${hecho("costo_total", "#>>'{costo,unidades_total}'")}
select 'costo_lim|' || (retail.fn_finanzas_confianza('${MES}', :'lim') #>> '{costo,unidades_total}');
select 'costo_tru|' || (retail.fn_finanzas_confianza('${MES}', :'tru') #>> '{costo,unidades_estimadas}');
${hecho("tarjeta_cobros", "#>>'{tarjeta,cobros_mes}'")}

-- Un gasto fijo de TRU, día 5: en julio de 2019 ya pasó sin gasto → cuenta como configurado y como faltante.
insert into retail.gastos_fijos (ubicacion_id, categoria, descripcion, monto, dia_del_mes, activo, creado_por)
  values (:'tru', (select codigo from retail.categorias_gasto limit 1), 'Alquiler de prueba', 1000, 5, true, (select id from public.personas limit 1));
${hecho("fijos_uno", "#>>'{fijos,configurados}'")}
${hecho("fijos_sedes", "#>>'{fijos,sedes_con_fijos}'")}
${hecho("fijos_faltan", "#>>'{fijos,faltan_mes}'")}

-- Una conciliación vigente del banco en julio de 2019.
insert into retail.conciliaciones (cuenta_id, fecha, saldo_banco, estado, registrado_por)
  values (:'banco', '2019-07-31', 0, 'vigente', (select id from public.personas limit 1));
${hecho("concil_uno", "#>>'{conciliacion,conciliados_mes}'")}

-- Una recepción sin factura en TRU: entra como «lote sin factura».
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  values (:'real_var', :'tru', 'entrada', 2, 'recepcion', '2019-07-12 10:00-05');
${hecho("lotes_sin_factura", "#>>'{facturas,lotes_sin_factura}'")}
${hecho("saldos_bancos_ok", "#>>'{saldos,bancos}' is not null")}
${hecho("planilla_visible", "#>>'{planilla,visible}'")}
`);
  verificar("hechos", r, {
    piezas: "7",
    costo_vacio: "0", fijos_vacio: "0", concil_vacio: "0",
    costo_una: "1", costo_total: "2", costo_lim: "0", costo_tru: "1",
    tarjeta_cobros: "118.00",
    fijos_uno: "1", fijos_sedes: "1", fijos_faltan: "1",
    concil_uno: "1",
    lotes_sin_factura: "1",
    saldos_bancos_ok: "true",
    planilla_visible: "false",
  });
}

// ---------- Escena 2: permisos ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACIONES}
select 'anon_no_llama|' || (not has_function_privilege('anon', 'retail.fn_finanzas_confianza(date, uuid)', 'execute'));
select 'authenticated_llama|' || has_function_privilege('authenticated', 'retail.fn_finanzas_confianza(date, uuid)', 'execute');
${cambiaA(MICAELA)}
do $$
begin
  perform retail.fn_finanzas_confianza('${MES}', null);
  raise exception 'sin el módulo tendría que fallar';
exception when insufficient_privilege then
  null;
end $$;
select 'sin_modulo_falla|ok';
`);
  verificar("permisos", r, { anon_no_llama: "true", authenticated_llama: "true", sin_modulo_falla: "ok" });
}

// ---------- Escena 3: pegar dos veces ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACIONES}
select md5(pg_get_functiondef('retail.fn_finanzas_confianza(date, uuid)'::regprocedure)) as huella_1 \\gset
${leer("20261015235000_finanzas_confianza.sql")}
select 'misma_huella|' || (md5(pg_get_functiondef('retail.fn_finanzas_confianza(date, uuid)'::regprocedure)) = :'huella_1');
`);
  verificar("idempotente", r, { misma_huella: "true" });
}

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);

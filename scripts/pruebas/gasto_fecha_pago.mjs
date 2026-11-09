#!/usr/bin/env node
/**
 * Prueba de la tarea 15 de «Las 36 de Finanzas» (`20261106013000_gasto_con_fecha_de_pago.sql`).
 *
 * QUÉ CUBRE
 *   · LA FECHA DE PAGO: el gasto queda en la fecha del papel; el banco baja el día que salió. Ni futura, ni antes del papel, ni en efectivo.
 *   · EL IGV DEL PAPEL: una factura exonerada guarda 0; sin dato, el de la tasa, como siempre.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK.
 *
 * USO
 *   pnpm pruebas:gasto-fecha-pago
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261106013000_gasto_con_fecha_de_pago.sql"), "utf8");

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
      input: `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${sql}\nrollback;\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let fallos = 0;
let casos = 0;
function verificar(titulo, r, esperados) {
  const lineas = r.ok ? Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)])) : {};
  for (const [caso, valor] of Object.entries(esperados)) {
    casos++;
    const ok = r.ok && lineas[caso] === valor;
    console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(r.ok ? `    esperado ${valor}, salió ${lineas[caso]}` : `    ${r.mensaje.slice(0, 1000)}`);
    }
  }
}
// El aviso «tendría que haber fallado» lleva su propio código (XX999): con el P0001 de fábrica, un freno esperado P0001 se tragaba
// el aviso y el caso pasaba aunque no frenara nada (lo destapó el control de `pos_pagos.mjs`, 2026-11-07).
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX999';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const papel = (numero, extra = "") => `jsonb_build_object('tipo', 'factura', 'proveedor_id', (select id from retail.proveedores where nombre = 'Proveedor T15'), 'serie', 'F777', 'numero', '${numero}', 'condicion', 'contado'${extra})`;
const gasto = (numero, medio, cuenta, extra) => `retail.registrar_gasto(null, 'suministros', 'Gasto T15', '2019-07-20', 118, ${papel(numero, extra)}, '${medio}', null, null, null, null, null, ${cuenta})`;

verificar("fecha de pago", correr(`
${MIGRACION}
insert into retail.proveedores (nombre) values ('Proveedor T15');
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco T15', 'banco', '104') returning id as banco \\gset
select ${gasto("1", "transferencia", ":'banco'", ", 'fecha_pago', '2019-07-25'")} as g1 \\gset
select 'pago_con_su_fecha|' || p.fecha from retail.compra_pagos p join retail.compras c on c.id = p.compra_id where c.serie = 'F777' and c.numero = '1';
select 'papel_con_la_suya|' || c.fecha_emision from retail.compras c where c.serie = 'F777' and c.numero = '1';
select 'banco_baja_ese_dia|' || coalesce(sum(haber) filter (where cuenta = '104' and fecha = '2019-07-25'), 0) from retail.fn_asientos('2019-07-20', '2019-07-25', null);
select 'nada_el_dia_del_papel|' || coalesce(sum(haber) filter (where cuenta = '104' and fecha = '2019-07-20'), 0) from retail.fn_asientos('2019-07-20', '2019-07-25', null);
select 'diario_cuadra|' || (sum(debe) = sum(haber)) from retail.fn_asientos('2019-07-20', '2019-07-25', null);
select ${gasto("2", "transferencia", ":'banco'", "")} as g2 \\gset
select 'sin_fecha_como_siempre|' || p.fecha from retail.compra_pagos p join retail.compras c on c.id = p.compra_id where c.serie = 'F777' and c.numero = '2';
${debeFallar("no_futura", `perform ${gasto("3", "transferencia", "(select id from retail.cuentas_dinero where nombre = 'Banco T15')", ", 'fecha_pago', '2099-01-01'")}`, "P0001")}
${debeFallar("no_antes_del_papel", `perform ${gasto("4", "transferencia", "(select id from retail.cuentas_dinero where nombre = 'Banco T15')", ", 'fecha_pago', '2019-07-01'")}`, "P0001")}
`), {
  pago_con_su_fecha: "2019-07-25",
  papel_con_la_suya: "2019-07-20",
  banco_baja_ese_dia: "118.00",
  nada_el_dia_del_papel: "0",
  diario_cuadra: "true",
  sin_fecha_como_siempre: "2019-07-20",
  no_futura: "ok",
  no_antes_del_papel: "ok",
});

verificar("IGV del papel", correr(`
${MIGRACION}
insert into retail.proveedores (nombre) values ('Proveedor T15');
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco T15', 'banco', '104') returning id as banco \\gset
select ${gasto("5", "transferencia", ":'banco'", ", 'igv', 0")} as g5 \\gset
select 'exonerada|' || igv || ',' || subtotal from retail.compras where serie = 'F777' and numero = '5';
select ${gasto("6", "transferencia", ":'banco'", "")} as g6 \\gset
select 'sin_dato_la_tasa|' || igv from retail.compras where serie = 'F777' and numero = '6';
`), { exonerada: "0.00,118.00", sin_dato_la_tasa: "18.00" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);

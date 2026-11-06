#!/usr/bin/env node
/**
 * Prueba de `20261106005000_costo_sin_igv_con_factura.sql` (tarea 9 de «Las 36 de Finanzas»; ADR-0417 d.2).
 *
 * QUÉ PROMETE. Con papel o comprobante factura, la prenda entra sin IGV: de S/ 118 a S/ 100. Con boleta, nota de venta o sin papel, tal cual. Sin línea pedida, tal cual.
 * CÓMO. Todo en una transacción con ROLLBACK: la base local la usan otras sesiones. Solo importa el enlace entre la línea, la orden y el papel: sin llaves foráneas.
 *
 * USO: pnpm pruebas:costo-sin-igv
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"], {
      input: `begin;\nset local session_replication_role = replica;\n${sql}\nrollback;\n`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stderr ?? e.message) };
  }
}

/** Una línea pedida con su orden y un papel del tipo dado; devuelve lo que entraría por S/ 118. */
const conPapel = (tipo, estado = "por_completar") => `
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, fecha, estado, huella, registrado_por)
  values ('aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid(), '${tipo}', 118, 0, current_date, '${estado}', 'prueba', gen_random_uuid());
insert into retail.ordenes_compra (id, numero, proveedor_id, ubicacion_destino_id, fecha_emision, estado, creada_por, papel_id)
  values ('aaaaaaaa-0000-4000-8000-000000000002', 999999, gen_random_uuid(), gen_random_uuid(), current_date, 'generada', gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001');
insert into retail.orden_compra_items (id, orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento)
  values ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 1, gen_random_uuid(), gen_random_uuid(), 1, 118, 0);
select retail.fn_costo_de_entrada(118, 'aaaaaaaa-0000-4000-8000-000000000003');`;

const CASOS = [
  ["papel factura: de S/ 118 a S/ 100", conPapel("factura"), "100.00"],
  ["papel boleta: tal cual, ese IGV no se recupera", conPapel("boleta"), "118"],
  ["nota de venta: tal cual", conPapel("nota_venta"), "118"],
  ["sin comprobante: tal cual", conPapel("sin_comprobante"), "118"],
  ["papel factura anulado: tal cual", conPapel("factura", "anulado"), "118"],
  ["sin línea pedida: tal cual", "select retail.fn_costo_de_entrada(118, null);", "118"],
  ["sin costo: sigue sin costo", "select retail.fn_costo_de_entrada(null, null) is null;", "t"],
  [
    "la recepción usa la regla",
    "select position('fn_costo_de_entrada' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) > 0;",
    "t",
  ],
];

let fallos = 0;
for (const [nombre, sql, esperado] of CASOS) {
  const r = correr(sql);
  const ok = r.ok && Number.isNaN(Number(esperado)) ? r.salida === esperado : r.ok && Number(r.salida) === Number(esperado);
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${r.salida.slice(0, 400)}`);
  }
}
console.log(`\n${CASOS.length - fallos}/${CASOS.length} casos en verde`);
process.exit(fallos ? 1 : 0);

#!/usr/bin/env node
/**
 * Prueba de ADR-0636, actividad 3 — el cierre de mes dice cuánta plata hay en compras que esperan su papel
 * (`20261109235000_cierre_dice_cuanto_espera_su_papel.sql`).
 *
 * QUÉ CUBRE: el chequeo `papeles_por_completar` trae `monto` para el líder, sigue sin bloquear, no cuenta un papel de un mes posterior
 * ni uno ya completado, y `fn_cierre_avisos_sin_plata` calla ese monto en un aviso guardado.
 * CÓMO: cada escenario en su transacción con ROLLBACK; la migración se vuelve a correr adentro (idempotente). Nada queda escrito.
 * USO: pnpm pruebas:cierre-papeles-con-monto   (RETAIL_CONTENEDOR_PG=<contenedor> para otra base)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261109235000_cierre_dice_cuanto_espera_su_papel.sql"), "utf8");

function correr(sql) {
  try {
    const salida = execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    );
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter((l) => l !== "") : []);

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

const CHEQUEO = `(select c from retail.fn_cierre_mes_estado(:'mes'::date) e, jsonb_array_elements(e.chequeos) c where e.alcance = 'empresa' and c ->> 'clave' = 'papeles_por_completar')`;
const PAPEL = (monto, fecha, estado = "por_completar") => `
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, medio_pago, fecha, estado, huella, registrado_por)
values (gen_random_uuid(), :'persona', :'prov', 'nota_venta', ${monto}, ${monto}, 'efectivo', ${fecha}, '${estado}', md5(random()::text), :'persona');`;

{
  const r = correr(`begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select date_trunc('month', retail.fn_hoy_lima())::date as mes \\gset
select c.persona_id as persona from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' limit 1 \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
insert into retail.compra_rondas (persona_id, abierta_por)
select :'persona', :'persona' where not exists (select 1 from retail.compra_rondas r where r.persona_id = :'persona' and r.cerrada_en is null);
select coalesce((${CHEQUEO} -> 'datos' ->> 'n')::int, 0) as n0, coalesce((${CHEQUEO} -> 'datos' ->> 'monto')::numeric, 0) as m0 \\gset
${PAPEL(200, ":'mes'::date")}
${PAPEL(350.5, ":'mes'::date")}
${PAPEL(999, ":'mes'::date", "completado")}
${PAPEL(777, "(:'mes'::date + interval '1 month')::date")}
select (x -> 'datos' ->> 'n')::int - :'n0'::int, (x -> 'datos' ->> 'monto')::numeric - :'m0'::numeric, x ->> 'ok', x ->> 'bloquea' from ${CHEQUEO} t(x);
select retail.fn_cierre_avisos_sin_plata(jsonb_build_array(${CHEQUEO})) -> 0 -> 'datos' ->> 'monto' is null,
       (retail.fn_cierre_avisos_sin_plata(jsonb_build_array(${CHEQUEO})) -> 0 -> 'datos' ->> 'n')::int - :'n0'::int;`);
  const [chequeo, guardado] = lineas(r);
  const [n, monto, ok, bloquea] = (chequeo ?? "").split("|");
  esperar("cuenta los 2 papeles por completar del mes (no el completado ni el del mes siguiente)", r.ok && Number(n) === 2, r);
  esperar("y dice su monto: S/ 550.50", r.ok && Number(monto) === 550.5, r);
  esperar("no está ok y sigue sin bloquear", r.ok && ok === "false" && bloquea === "false", r);
  esperar("en un aviso guardado, quien no ve plata no ve el monto pero sí cuántas", r.ok && guardado === "t|2", r);
}

console.log(`\n${casos - fallos}/${casos} casos en verde.`);
if (fallos) {
  console.error(`${fallos} caso(s) fallaron.`);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Prueba de `20261029153000_claure_servicios_basicos_100.sql` (ADR-0560, actividad 12): la luz se queda 50/50 con CLAURE; agua, internet y baño (la categoría «servicios básicos», más
 * `agua` e `internet`) van 100 % a CLAURE (Felipe, 2026-10-29). Solo cambian datos de configuración (`gasto_reparto_claure`).
 *
 * Lo que importa: (1) el reparto queda como lo dijo Felipe; (2) `fn_claure_gastos` aplica cada porcentaje a un gasto de esa categoría y no cuenta «telefonía» ni lo de otra sede; (3) respeta un
 * porcentaje que ya se cambió a mano; (4) la migración se puede volver a pegar sin pisar nada. Cada caso corre en su transacción y TERMINA EN ROLLBACK. Parte del reparto de la actividad 8
 * (borra la tabla y deja que 044000 siembre el de fábrica) y luego aplica esta: sin ella, los casos fallan.
 *
 * USO: pnpm pruebas:claure-servicios-100   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029011000_pagar_a_claure.sql"),
  leer("20261029013000_cierre_de_caja_con_claudia.sql"),
  leer("20261029020000_claure_fuera_de_las_cifras_de_cayla.sql"),
].join("\n");
const REPARTO_DE_LA_8 = leer("20261029044000_claure_gastos_por_empresa.sql");
const MIGRACION = leer("20261029153000_claure_servicios_basicos_100.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "ca71a000-0000-4000-8000-000000000001";
const CLAURE = "c1a07e00-0000-4000-8000-000000000002";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const idSede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return id;
};
const LIMA = idSede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = idSede("'Tienda TRU', 'Tienda Trujillo'");
const COMO = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;
const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;

// Parte de la tabla como la dejó la actividad 8 (la borra y deja que 044000 la siembre de fábrica) y, salvo que `sinMigracion`, aplica la de esta actividad.
const armar = ({ antesDeLaMigracion = "", sinMigracion = false, repegar = false } = {}) => `
begin;
\\o /dev/null
${PREVIAS}
delete from retail.gasto_reparto_claure;
${REPARTO_DE_LA_8}
${antesDeLaMigracion}
${sinMigracion ? "" : MIGRACION}
${repegar ? MIGRACION : ""}
\\o
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select '${CAYLA}', u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values ('${CLAURE}', '${LIMA}') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
`;
// Gastos de hoy en Lima, todos por transferencia y sin comprobante: luz 200 (50 %) · servicios básicos 60 (100 %) · agua 40 (100 %) · internet 30 (100 %) · telefonía 20 (sin reparto) · alquiler de TRUJILLO 500.
const ESCENA = `
reset role;
set local session_replication_role = replica;
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, registrado_por) values
  (${ID("f1")}, '${LIMA}', 'luz', 'Luz de octubre', :'hoy'::date, 200, 0, 'transferencia', 'vigente', :'yo'),
  (${ID("f2")}, '${LIMA}', 'servicios_basicos', 'Baño del mercado', :'hoy'::date, 60, 0, 'transferencia', 'vigente', :'yo'),
  (${ID("f3")}, '${LIMA}', 'agua', 'Recibo de agua', :'hoy'::date, 40, 0, 'transferencia', 'vigente', :'yo'),
  (${ID("f4")}, '${LIMA}', 'internet', 'Internet del local', :'hoy'::date, 30, 0, 'transferencia', 'vigente', :'yo'),
  (${ID("f5")}, '${LIMA}', 'telefonia', 'Plan de celular', :'hoy'::date, 20, 0, 'transferencia', 'vigente', :'yo'),
  (${ID("f6")}, '${TRUJILLO}', 'servicios_basicos', 'Agua de Trujillo', :'hoy'::date, 500, 0, 'transferencia', 'vigente', :'yo');
`;
const nuestros = `(${["f1", "f2", "f3", "f4", "f5", "f6"].map(ID).join(", ")})`;

const dentro = (cuerpo, opciones) => psql(`${armar(opciones)}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 14).join("\n    ")}`);
  }
}

const REPARTO = `select string_agg(categoria || ':' || pct_claure::numeric(5,0), ',' order by categoria) from retail.gasto_reparto_claure;`;
const PARTES = `${ESCENA}
${COMO(FELIPE)}
select coalesce(string_agg(right(gasto_id::text, 2) || ':' || pct::numeric(5,0) || ':' || parte::numeric(12,2), ' ' order by gasto_id), '') from retail.fn_claure_gastos() where gasto_id in ${nuestros};`;

caso("el reparto queda como lo dijo Felipe: luz, alquiler y mantenimiento 50 %; servicios básicos, agua, internet, limpieza y bolsas 100 %", () =>
  igual(ultima(dentro(REPARTO)), "agua:100,alquileres:50,bolsas:100,internet:100,limpieza:100,luz:50,mantenimiento:50,servicios_basicos:100"),
);

caso("cada porcentaje se aplica: la luz la mitad, lo demás todo; telefonía y la otra sede, nada", () =>
  igual(ultima(dentro(PARTES)), "f1:50:100.00 f2:100:60.00 f3:100:40.00 f4:100:30.00"),
);

caso("antes de la migración (el reparto de la actividad 8) servicios básicos era 50 % y agua e internet no repartían", () =>
  igual(ultima(dentro(`${REPARTO}`, { sinMigracion: true })), "alquileres:50,bolsas:100,limpieza:100,luz:50,mantenimiento:50,servicios_basicos:50"),
);

caso("respeta un porcentaje que ya se cambió a mano: servicios básicos en 70 % se queda en 70 %", () =>
  igual(
    ultima(dentro(`select pct_claure::numeric(5,0) from retail.gasto_reparto_claure where categoria = 'servicios_basicos';`, { antesDeLaMigracion: "update retail.gasto_reparto_claure set pct_claure = 70 where categoria = 'servicios_basicos';" })),
    "70",
  ),
);

caso("la migración se puede volver a pegar: mismo reparto", () =>
  igual(ultima(dentro(REPARTO, { repegar: true })), "agua:100,alquileres:50,bolsas:100,internet:100,limpieza:100,luz:50,mantenimiento:50,servicios_basicos:100"),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

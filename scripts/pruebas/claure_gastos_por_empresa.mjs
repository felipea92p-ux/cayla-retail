#!/usr/bin/env node
/**
 * Prueba de `20261029044000_claure_gastos_por_empresa.sql` (ADR-0560, actividad 8): lo que CAYLA paga y es de CLAURE (alquiler, luz, mantenimiento, limpieza, bolsas) baja lo que
 * se le debe a Claudia y sale del gasto de CAYLA.
 *
 * Lo que importa: (1) `fn_claure_gastos` lista la parte de CLAURE de cada gasto vigente de Tienda LIM desde el arranque de su cuenta, según el reparto por categoría (50 % de
 * alquileres, 100 % de limpieza…); no lista el de una categoría sin reparto, el de otra sede, el anulado ni el de antes del arranque; (2) el Diario reclasifica esa parte (sin IGV)
 * del gasto de CAYLA a la 479 y cada asiento cuadra; (3) el Estado de resultados de Lima cuenta solo lo que es de CAYLA; (4) el aviso del cierre de caja baja su saldo con esa suma y
 * la dice aparte; (5) quien no ve la cuenta con CLAURE no la lee y anon no ejecuta; (6) las migraciones se pueden volver a pegar. Cada caso corre en su transacción con las migraciones
 * aplicadas dentro y TERMINA EN ROLLBACK; todo se mide como DIFERENCIA contra la foto de antes de la escena.
 *
 * USO: pnpm pruebas:claure-gastos-por-empresa   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// Lo que esta migración reemplaza o usa: la columna de arranque (A1), el cierre de caja (A3) y el Diario (A5).
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029011000_pagar_a_claure.sql"),
  leer("20261029013000_cierre_de_caja_con_claudia.sql"),
  leer("20261029020000_claure_fuera_de_las_cifras_de_cayla.sql"),
].join("\n");
const MIGRACION = leer("20261029044000_claure_gastos_por_empresa.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
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
const SUPER = "reset role;";
const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;

// Gastos de la escena (todos pagados por transferencia y sin comprobante: la base solo admite IGV en un gasto con comprobante):
//   G1 alquileres de Lima 1180: 50 % → parte 590 · G2 limpieza de Lima 118: 100 % → parte 118 · G3 suministros de Lima 50: sin reparto
//   G4 alquileres de TRUJILLO 500: CLAURE no opera allá · G5 alquileres de Lima ANULADO · G6 alquileres de Lima de hace 12 días (antes del arranque)
const PRELUDIO = `
begin;
\\o /dev/null
${PREVIAS}
${MIGRACION}
\\o
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, '${LIMA}') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
`;

const ESCENA = `
${SUPER}
set local session_replication_role = replica;
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, motivo_anulacion, anulado_por, anulado_en, registrado_por) values
  (${ID("e1")}, '${LIMA}', 'alquileres', 'Alquiler de octubre', :'hoy'::date, 1180, 0, 'transferencia', 'vigente', null, null, null, :'yo'),
  (${ID("e2")}, '${LIMA}', 'limpieza', 'Lejía y trapeadores', :'hoy'::date, 118, 0, 'transferencia', 'vigente', null, null, null, :'yo'),
  (${ID("e3")}, '${LIMA}', 'suministros', 'Útiles', :'hoy'::date, 50, 0, 'transferencia', 'vigente', null, null, null, :'yo'),
  (${ID("e4")}, '${TRUJILLO}', 'alquileres', 'Alquiler de Trujillo', :'hoy'::date, 500, 0, 'transferencia', 'vigente', null, null, null, :'yo'),
  (${ID("e5")}, '${LIMA}', 'alquileres', 'Alquiler anulado', :'hoy'::date, 900, 0, 'transferencia', 'anulado', 'prueba', :'yo', now(), :'yo'),
  (${ID("e6")}, '${LIMA}', 'alquileres', 'Alquiler de antes', :'hoy'::date - 12, 700, 0, 'transferencia', 'vigente', null, null, null, :'yo');
`;

const dentro = (cuerpo) => psql(`${PRELUDIO}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();
const nuestros = `(${["e1", "e2", "e3", "e4", "e5", "e6"].map(ID).join(", ")})`;

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

caso("el reparto de fábrica es el que dijo Felipe: alquiler, luz, servicios básicos y mantenimiento 50 %; limpieza y bolsas 100 %", () =>
  igual(
    ultima(dentro(`select string_agg(categoria || ':' || pct_claure::numeric(5,0), ',' order by categoria) from retail.gasto_reparto_claure;`)),
    "alquileres:50,bolsas:100,limpieza:100,luz:50,mantenimiento:50,servicios_basicos:50",
  ),
);

caso("fn_claure_gastos: la parte de CLAURE de cada gasto de Lima desde el arranque; no el de una categoría sin reparto, el de otra sede, el anulado ni el de antes", () =>
  igual(
    ultima(
      dentro(`${ESCENA}
${COMO(FELIPE)}
select coalesce(string_agg(right(gasto_id::text, 2) || ':' || pct::numeric(5,0) || ':' || parte::numeric(12,2), ' ' order by gasto_id), '')
  from retail.fn_claure_gastos() where gasto_id in ${nuestros};`),
    ),
    "e1:50:590.00 e2:100:118.00",
  ),
);

caso("el Diario reclasifica la parte de CLAURE (sin IGV) del gasto de CAYLA a la 479, y cada asiento cuadra", () =>
  igual(
    ultima(
      dentro(`${ESCENA}
${COMO(FELIPE)}
select (select count(*) from (select asiento from retail.fn_asientos(:'hoy'::date, :'hoy'::date, null) where regla = 'claure_gasto' and origen_id in ${nuestros}
                              group by asiento having round(sum(debe), 2) <> round(sum(haber), 2)) x) || '|' ||
       (select string_agg(cuenta || ':' || debe::numeric(12,2) || ':' || haber::numeric(12,2), ' ' order by cuenta)
          from (select cuenta, sum(debe) as debe, sum(haber) as haber from retail.fn_asientos(:'hoy'::date, :'hoy'::date, null)
                 where regla = 'claure_gasto' and origen_id in ${nuestros} group by cuenta) y);`),
    ),
    // Descuadrados: 0. La 479 al debe por 708 (590 + 118); el gasto de CAYLA baja: alquileres (635) 590 y suministros (656) 118 al haber.
    "0|479:708.00:0.00 635:0.00:590.00 656:0.00:118.00",
  ),
);

caso("el Estado de resultados de Lima cuenta solo lo que es de CAYLA de esos gastos", () =>
  igual(
    ultima(
      dentro(`${COMO(FELIPE)}
select (select gastos_operacion from retail.fn_estado_resultados(:'hoy'::date, :'hoy'::date) where ubicacion_id = '${LIMA}')::numeric(12,2) as g0 \\gset
${ESCENA}
${COMO(FELIPE)}
select ((select gastos_operacion from retail.fn_estado_resultados(:'hoy'::date, :'hoy'::date) where ubicacion_id = '${LIMA}')::numeric(12,2) - :'g0'::numeric)::numeric(12,2);`),
    ),
    // Gastos de hoy de Lima: G1 1180 + G2 118 + G3 50 = 1348; menos la parte de CLAURE (590 + 118): 640 son de CAYLA.
    "640.00",
  ),
);

caso("el cierre de caja: el saldo baja con los gastos de CLAURE y los dice aparte", () =>
  igual(
    ultima(
      dentro(`${SUPER}
select c.id as caja, (coalesce(c.cerrada_en, now()) at time zone 'America/Lima')::date::text as dia
  from retail.cajas c where c.ubicacion_id = '${LIMA}' order by c.abierta_en desc limit 1 \\gset
update retail.empresas set cuenta_corriente_desde = :'dia'::date - 1 where clave = 'claure';
${COMO(FELIPE)}
select (retail.fn_claure_cierre(:'caja'::uuid)->>'saldo')::numeric as s0 \\gset
${SUPER}
set local session_replication_role = replica;
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, registrado_por) values
  (${ID("e1")}, '${LIMA}', 'alquileres', 'Alquiler', :'dia'::date, 1180, 0, 'transferencia', 'vigente', :'yo'),
  (${ID("e2")}, '${LIMA}', 'limpieza', 'Lejía', :'dia'::date, 118, 0, 'transferencia', 'vigente', :'yo');
${COMO(FELIPE)}
select ((retail.fn_claure_cierre(:'caja'::uuid)->>'saldo')::numeric - :'s0'::numeric)::numeric(12,2) || '|' || (retail.fn_claure_cierre(:'caja'::uuid)->'hoy'->>'gastos')::numeric(12,2);`),
    ),
    // El saldo baja 708 (590 + 118) y lo de ese día se dice aparte.
    "-708.00|708.00",
  ),
);

caso("quien no ve la cuenta con CLAURE no lee los gastos y anon no ejecuta; las funciones internas no las ejecuta nadie", () => {
  let sinModulo;
  try {
    dentro(`${COMO(MICAELA)}\nselect * from retail.fn_claure_gastos();`);
    sinModulo = "no falló";
  } catch (e) {
    sinModulo = String(e.stderr).includes("necesita el módulo Cuentas y dinero") ? "42501" : `otro: ${String(e.stderr).split("\n")[0]}`;
  }
  const privilegios = ultima(
    dentro(`select has_function_privilege('anon', 'retail.fn_claure_gastos()', 'execute')::text || ',' ||
                   has_function_privilege('authenticated', 'retail.fn_claure_gastos()', 'execute')::text || ',' ||
                   has_function_privilege('authenticated', 'retail.fn_claure_gastos_base(date,date,boolean,uuid[])', 'execute')::text;`),
  );
  return igual(`${sinModulo}|${privilegios}`, "42501|false,true,false");
});

caso("las migraciones se pueden volver a pegar: mismas cifras y sin error", () =>
  igual(
    ultima(
      psql(`${PRELUDIO}
\\o /dev/null
${MIGRACION}
\\o
${ESCENA}
${COMO(FELIPE)}
select coalesce(sum(parte), 0)::numeric(12,2) from retail.fn_claure_gastos() where gasto_id in ${nuestros};
rollback;`),
    ),
    "708.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

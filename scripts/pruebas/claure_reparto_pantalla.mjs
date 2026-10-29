#!/usr/bin/env node
/**
 * Prueba de `20261029161000_claure_reparto_de_gastos_pantalla.sql` (ADR-0560, actividad 17): el líder cambia desde Configuración qué parte de cada categoría de gasto es de CLAURE.
 *
 * Lo que importa: (1) `fn_reparto_claure` lista todas las categorías activas con su parte (0 si no tiene fila); (2) `guardar_reparto_claure` fija el porcentaje, firma a quien lo hizo y deja el antes y el
 * después en la historia (un cambio que no cambia nada no deja historia); (3) lo que ya lee la tabla toma el cambio solo (`fn_claure_gastos`); (4) solo el líder con el módulo Configuración; fuera de rango,
 * nulo o una categoría que no existe se rechazan sin escribir; `anon` no ejecuta; (5) la migración se puede volver a pegar. Cada caso corre en su transacción y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-reparto-pantalla   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La tabla de la actividad 8 (la siembra de fábrica) y la actividad 12 (servicios al 100 %) por si la base local no las trae; luego la de esta actividad.
const PREVIAS = [leer("20261029004000_cuenta_con_claure.sql"), leer("20261029013000_cierre_de_caja_con_claudia.sql")].join("\n");
const REPARTO_DE_LA_8 = leer("20261029044000_claure_gastos_por_empresa.sql");
const MIGRACION = leer("20261029161000_claure_reparto_de_gastos_pantalla.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const COMO = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

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
const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;

// Parte del reparto de fábrica de la actividad 8 (vacía la tabla y deja que 044000 la siembre) y aplica esta migración.
const armar = (extra = "") => `
begin;
\\o /dev/null
${PREVIAS}
delete from retail.gasto_reparto_claure;
${REPARTO_DE_LA_8}
-- Parte del estado de ANTES de la migración (la base local ya la trae): sin ella, los casos fallan.
drop function if exists retail.fn_reparto_claure();
drop function if exists retail.guardar_reparto_claure(text, numeric);
alter table retail.gasto_reparto_claure drop column if exists actualizado_por;
${MIGRACION}
${extra}
\\o
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, '${LIMA}') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
`;
const dentro = (cuerpo, extra) => psql(`${armar(extra)}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();
const falla = (cuerpo, { texto } = {}) => {
  try {
    dentro(cuerpo);
    return "no falló y debía fallar";
  } catch (e) {
    const err = String(e.stderr ?? e.message);
    return texto && !err.includes(texto) ? `falló por otra razón: ${err.split("\n").find((l) => l.includes("ERROR")) ?? err.split("\n")[0]}` : null;
  }
};

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 12).join("\n    ")}`);
  }
}

const LISTA = (codigos) => `${COMO(FELIPE)}
select string_agg(categoria || ':' || pct_claure::numeric(5,2), ',' order by categoria) from retail.fn_reparto_claure() where categoria in (${codigos.map((c) => `'${c}'`).join(", ")});`;

caso("la lista trae todas las categorías activas con su parte (0 si no tiene fila): el reparto de fábrica a la vista", () =>
  igual(ultima(dentro(LISTA(["alquileres", "luz", "limpieza", "bolsas", "transporte", "software"]))), "alquileres:50.00,bolsas:100.00,limpieza:100.00,luz:50.00,software:0.00,transporte:0.00"),
);

caso("la lista trae las 20 categorías activas, en el orden del catálogo", () =>
  igual(ultima(dentro(`reset role;\nselect count(*) as n from retail.categorias_gasto where activo \\gset\n${COMO(FELIPE)}\nselect count(*) || '|' || :n from retail.fn_reparto_claure();`)), "20|20"),
);

caso("el líder guarda: la luz pasa a 60 %, queda quién y cuándo, y la historia dice antes 50 y después 60", () =>
  igual(
    ultima(
      dentro(`${COMO(FELIPE)}
select retail.guardar_reparto_claure('luz', 60);
reset role;
select r.pct_claure::numeric(5,2) || '|' || (r.actualizado_por = :'yo')::text || '|' ||
       (select (detalle->>'antes') || '>' || (detalle->>'despues') || '>' || (hecho_por = :'yo')::text from retail.configuracion_historial where que = 'reparto_claure' order by id desc limit 1)
  from retail.gasto_reparto_claure r where r.categoria = 'luz';`),
    ),
    "60.00|true|50.00>60.00>true",
  ),
);

caso("una categoría sin fila nace con su porcentaje (transporte 25 %) y un cambio que no cambia nada no deja historia", () =>
  igual(
    ultima(
      dentro(`reset role;
select count(*) as h0 from retail.configuracion_historial where que = 'reparto_claure' \\gset
${COMO(FELIPE)}
select retail.guardar_reparto_claure('transporte', 25);
select retail.guardar_reparto_claure('transporte', 25);
reset role;
select (select pct_claure::numeric(5,2) from retail.gasto_reparto_claure where categoria = 'transporte') || '|' || ((select count(*) from retail.configuracion_historial where que = 'reparto_claure') - :h0::bigint);`),
    ),
    "25.00|1",
  ),
);

caso("lo que ya lee la tabla toma el cambio solo: un gasto de luz de 200 pasa de 100 a 120 de CLAURE con el 60 %", () =>
  igual(
    ultima(
      dentro(`reset role;
set local session_replication_role = replica;
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, registrado_por)
  values (${ID("c1")}, '${LIMA}', 'luz', 'Luz de octubre', :'hoy'::date, 200, 0, 'transferencia', 'vigente', :'yo');
set local session_replication_role = origin;
${COMO(FELIPE)}
select (select parte from retail.fn_claure_gastos() where gasto_id = ${ID("c1")}) as antes \\gset
select retail.guardar_reparto_claure('luz', 60);
select :'antes' || '|' || (select parte from retail.fn_claure_gastos() where gasto_id = ${ID("c1")});`),
    ),
    "100.00|120.00",
  ),
);

caso("fuera de rango, nulo o una categoría que no existe se rechazan y nada se escribe", () =>
  falla(`${COMO(FELIPE)}\nselect retail.guardar_reparto_claure('luz', 101);`, { texto: "va de 0 % a 100 %" }) ??
  falla(`${COMO(FELIPE)}\nselect retail.guardar_reparto_claure('luz', -1);`, { texto: "va de 0 % a 100 %" }) ??
  falla(`${COMO(FELIPE)}\nselect retail.guardar_reparto_claure('luz', null);`, { texto: "va de 0 % a 100 %" }) ??
  falla(`${COMO(FELIPE)}\nselect retail.guardar_reparto_claure('no_existe', 10);`, { texto: "no existe o está desactivada" }),
);

caso("quien no es líder no ve ni cambia el reparto, y anon no ejecuta", () =>
  falla(`${COMO(MICAELA)}\nselect * from retail.fn_reparto_claure();`, { texto: "lo ve el líder" }) ??
  falla(`${COMO(MICAELA)}\nselect retail.guardar_reparto_claure('luz', 10);`, { texto: "lo hace el líder" }) ??
  falla(`reset role;\nset local role anon;\nselect retail.guardar_reparto_claure('luz', 10);`, { texto: "permission denied" }),
);

caso("la migración se puede volver a pegar: mismo reparto y sin error", () =>
  igual(
    ultima(psql(`${armar(MIGRACION)}\n${LISTA(["alquileres", "luz"])}\nrollback;`)),
    "alquileres:50.00,luz:50.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

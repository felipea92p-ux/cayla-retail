#!/usr/bin/env node
/**
 * Prueba de `20261121175000_filtro_por_empresa_en_existencias_e_historial.sql` (ADR-0683, actividad 7): las unidades de cada empresa por lugar
 * (Existencias) y de qué empresas es cada venta (Historial), en una tienda donde conviven dos.
 *
 * La escena: Lima con CLAURE. Una talla con 5 en el piso (1 apartada) y 3 en el almacén; de eso, 2 del piso (la apartada incluida) son de CLAURE.
 * Una venta con una prenda de CLAURE y una de CAYLA, y otra solo de CAYLA. Cada caso TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:aliadas-filtros   (necesita el stack local: `npx supabase start`; CONTENEDOR_PG / BASE_PG para otra base)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const M7 = readFileSync(join(RAIZ, "supabase/migrations/20261121175000_filtro_por_empresa_en_existencias_e_historial.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const ID = (n) => `'00000000-0000-4687-8000-0000000000${n}'`;
const ESCENA = `
select id as lim from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1 \\gset
select retail.fn_empresa_casa_id() as cayla \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' order by id limit 1 \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' order by id limit 1 \\gset
select va.id as va, va.producto_id as pa from retail.variantes va order by va.id limit 1 \\gset
select va.id as vb, va.producto_id as pb from retail.variantes va where va.producto_id <> :'pa' order by va.id limit 1 \\gset
set local session_replication_role = replica;
update retail.empresas set activo = true, cuenta_corriente_desde = coalesce(cuenta_corriente_desde, retail.fn_hoy_lima() - 10) where id = :'claure';
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'cayla', :'lim'), (:'claure', :'lim') on conflict do nothing;
delete from retail.stock where variante_id = :'va' and ubicacion_id = :'lim';
delete from retail.stock_dueno where variante_id = :'va' and ubicacion_id = :'lim';
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada) values
  (:'va', :'lim', :'piso', 5, 1), (:'va', :'lim', :'alm', 3, 0);
insert into retail.stock_dueno (variante_id, ubicacion_id, sububicacion_id, empresa_id, cantidad, cantidad_apartada) values
  (:'va', :'lim', :'piso', :'claure', 2, 1);
update retail.productos set empresa_id = :'claure' where id = :'pa';
update retail.productos set empresa_id = :'cayla' where id = :'pb';
insert into retail.ventas (id, ubicacion_id, created_at, estado) values (${ID("01")}, :'lim', now(), 'completada'), (${ID("02")}, :'lim', now(), 'completada');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("51")}, ${ID("01")}, :'va', 1, 80, 10), (${ID("52")}, ${ID("01")}, :'vb', 1, 50, 10), (${ID("53")}, ${ID("02")}, :'vb', 1, 50, 10);
set local session_replication_role = origin;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;
const POR_LUGAR = (empresa) =>
  `select coalesce(string_agg(coalesce(tipo, '-') || ':' || cantidad || '/' || cantidad_apartada, ',' order by tipo), 'nada') from retail.fn_stock_de_empresa(:'lim', :'${empresa}') where variante_id = :'va';`;

const dentro = (cuerpo) => psql(`begin;\n\\o /dev/null\n${M7}\n\\o\n${ESCENA}\n${cuerpo}\nrollback;`);
const ultima = (s) => String(s).split("\n").at(-1);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join("\n    ")}`);
  }
}
const es = (sql, esperado) => {
  const r = ultima(dentro(sql));
  return r === esperado ? null : `salió «${r}», se esperaba «${esperado}»`;
};

console.log("— Existencias: las unidades de cada dueña —");
caso("CLAURE: 2 en el piso, 1 de ellas apartada", () => es(`set local role authenticated;\n${POR_LUGAR("claure")}`, "piso_venta:2/1"));
caso("CAYLA: lo demás, lugar por lugar (3 del piso sin apartar y 3 del almacén)", () => es(`set local role authenticated;\n${POR_LUGAR("cayla")}`, "almacen_tienda:3/0,piso_venta:3/0"));
caso("en una tienda con una sola empresa no devuelve nada", () =>
  es(`delete from retail.empresa_sedes where empresa_id = :'claure' and ubicacion_id = :'lim';
set local role authenticated;
${POR_LUGAR("cayla")}`, "nada"));
caso("anon no la ejecuta", () =>
  es(`select (not has_function_privilege('anon', 'retail.fn_stock_de_empresa(uuid, uuid)', 'execute'))::text;`, "true"));

console.log("\n— Historial: de qué empresas es cada venta —");
caso("la venta mixta es de las dos; la otra, solo de CAYLA", () =>
  es(`select (select (retail.empresas_de_la_venta(v) @> array[:'claure'::uuid, :'cayla'::uuid])::text from retail.ventas v where v.id = ${ID("01")}) || '|' ||
       (select (retail.empresas_de_la_venta(v) = array[:'cayla'::uuid])::text from retail.ventas v where v.id = ${ID("02")});`, "true|true"));
caso("filtrar por CLAURE trae solo la venta con su prenda", () =>
  es(`select string_agg(v.id::text, ',') from retail.ventas v where v.id in (${ID("01")}, ${ID("02")}) and v.empresas_de_la_venta @> array[:'claure'::uuid];`, "00000000-0000-4687-8000-000000000001"));

console.log("\n— Las empresas de una sede —");
caso("fn_empresas_de_sede ya no tiene el id de CAYLA escrito, y una sede sin filas sigue siendo de la casa", () =>
  es(`delete from retail.empresa_sedes where ubicacion_id = :'lim';
select (position('ca71a000-' in pg_get_functiondef('retail.fn_empresas_de_sede(uuid)'::regprocedure)) = 0)::text || '|' || (select string_agg(clave, ',') from retail.fn_empresas_de_sede(:'lim'));`, "true|cayla"));

caso("pegar la migración dos veces no falla", () => {
  const r = ultima(psql(`begin;\n\\o /dev/null\n${M7}\n${M7}\n\\o\nselect 'ok';\nrollback;`));
  return r === "ok" ? null : `salió ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

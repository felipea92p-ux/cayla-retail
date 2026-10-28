#!/usr/bin/env node
/**
 * Prueba de `20261021004000_productos_filtro_por_empresa.sql` (ADR-0467): el filtro «Tienda» de Catálogo ▸ Productos.
 *
 * Lo que importa: (1) sin elegir empresa, la lista y los conteos son EXACTAMENTE los de antes; (2) con una empresa, la lista y los
 * conteos ven solo sus prendas (una prenda de CLAURE no sale al filtrar CAYLA ni al revés) y las dos suman el total; (3) los permisos
 * no cambian: `anon` no ejecuta nada y el filtro interno sigue siendo solo de postgres; (4) sin sesión de retail no se lee; (5) la
 * migración se puede aplicar dos veces. Cada caso corre en su transacción con las migraciones del listado aplicadas dentro y
 * TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:productos-empresa   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = `${leer("20261002200000_productos_listado_por_variante.sql")}\n${leer("20261002200100_productos_facetas.sql")}\n\\o /dev/null\n${leer("20261021004000_productos_filtro_por_empresa.sql")}\n\\o\n`;
const FELIPE = "22222222-2222-4222-8222-000000000001";
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";
const SESION = `set local request.jwt.claim.sub = '${FELIPE}';\nset local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const dentro = (consulta, { sesion = true } = {}) => psql(`begin;\n${MIGRACIONES}\n${sesion ? SESION : ""}\n${consulta}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba «${esperado}» y salió «${obtenido}»`);

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

// Una prenda cualquiera de la escena local (la primera de la lista) pasa a CLAURE; el resto sigue en CAYLA.
const UNA_DE_CLAURE = `update retail.productos set empresa_id = ${CLAURE} where id = (select producto_id from retail.fn_productos_listado(p_por_pagina => 1, p_estado => 'activo') limit 1);`;
const prendas = (filtro) => `select count(distinct producto_id) from retail.fn_productos_listado(p_por_pagina => 100, p_estado => 'activo'${filtro});`;

caso("hay prendas con las que probar", () => (Number(dentro(prendas(""))) > 0 ? null : "la base local no tiene prendas activas"));

caso("sin empresa: lo mismo que con CAYLA cuando todo es de CAYLA", () => {
  const sin = dentro(prendas(""));
  const cayla = dentro(prendas(`, p_empresa_id => ${CAYLA}`));
  return igual(cayla, sin);
});

caso("CLAURE sin prendas de CLAURE: la lista y los conteos dan 0", () => {
  const lista = dentro(prendas(`, p_empresa_id => ${CLAURE}`));
  const conteo = dentro(`select (retail.fn_productos_facetas(p_estado => 'activo', p_empresa_id => ${CLAURE}) ->> 'total');`);
  return igual(lista, 0) ?? igual(conteo, 0);
});

caso("una prenda de CLAURE sale al filtrar CLAURE y deja de salir al filtrar CAYLA; las dos suman el total", () => {
  const total_ = Number(dentro(prendas("")));
  const claure = dentro(`${UNA_DE_CLAURE}\n${prendas(`, p_empresa_id => ${CLAURE}`)}`);
  const cayla = dentro(`${UNA_DE_CLAURE}\n${prendas(`, p_empresa_id => ${CAYLA}`)}`);
  return igual(claure, 1) ?? igual(cayla, total_ - 1);
});

caso("los conteos de las demás opciones se calculan DENTRO de la empresa elegida y coinciden con la lista", () => {
  const conteo = dentro(`${UNA_DE_CLAURE}\nselect (retail.fn_productos_facetas(p_estado => 'activo', p_empresa_id => ${CLAURE}) ->> 'total');`);
  const lista = dentro(`${UNA_DE_CLAURE}\nselect coalesce(max(total_productos), 0) from retail.fn_productos_listado(p_por_pagina => 1, p_estado => 'activo', p_empresa_id => ${CLAURE});`);
  return igual(conteo, 1) ?? igual(lista, 1);
});

caso("los permisos no cambiaron: anon no ejecuta la lista ni los conteos; authenticated no ejecuta el filtro interno", () => {
  const r = dentro(`select
    has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_productos_listado', 'fn_productos_facetas', 'fn_productos_filtro');`).split("\n");
  if (r.some((x) => x !== "f")) return `anon puede ejecutar alguna: ${r.join(",")}`;
  const aut = dentro(`select p.proname || '=' || has_function_privilege('authenticated', p.oid, 'execute')::text
    from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_productos_listado', 'fn_productos_facetas', 'fn_productos_filtro') order by 1;`);
  return igual(aut, "fn_productos_facetas=true\nfn_productos_filtro=false\nfn_productos_listado=true");
});

caso("quedan UNA sola firma de cada función (con dos, una llamada sin el parámetro sería ambigua)", () =>
  igual(dentro(`select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_productos_listado', 'fn_productos_facetas', 'fn_productos_filtro');`), 3));

caso("sin sesión de retail no se lee", () => {
  try {
    dentro(`select count(*) from retail.fn_productos_listado(p_empresa_id => ${CLAURE});`, { sesion: false });
    return "se leyó sin sesión";
  } catch (e) {
    return /Sin acceso al catálogo/.test(String(e.stderr)) ? null : String(e.stderr).split("\n")[0];
  }
});

caso("aplicar la migración dos veces no falla", () => {
  psql(`begin;\n${MIGRACIONES}\n\\o /dev/null\n${leer("20261021004000_productos_filtro_por_empresa.sql")}\n\\o\nrollback;`);
  return null;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Prueba de ADR-0254 «Descontinuar y reactivar en bloque con la regla de Editar» contra el Postgres LOCAL:
 * `retail.cambiar_estado_productos` (20260928235000).
 *
 * QUÉ CUBRE
 *   1. Descontinuar dos prendas: cambian las dos, cuenta 2 y el historial queda firmado por quien lo hizo.
 *   2. Reactivar con una prenda cuya marca se dio de baja: se rechaza nombrando ESA prenda y no cambia NINGUNA
 *      (todo o nada), aunque la otra marcada sí se podía reactivar.
 *   3. Reactivar las que sí se pueden: la que ya estaba activa no cuenta.
 *   4. Sin permiso de editar el catálogo: mensaje claro (antes, el update directo quedaba en cero filas y la
 *      pantalla decía «listo» sin cambiar nada).
 *   5. Estado inválido y lista vacía.
 *   6. Permisos: `anon` no ejecuta; una sola firma.
 *
 * CÓMO. Como `ajuste_no_es_primera_carga.mjs`: cada caso en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim(s)`. `pg_temp.intento` corre una llamada y devuelve el resultado o el error (hint, mensaje).
 *
 * USO
 *   pnpm pruebas:productos-estado-en-bloque    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const NADIE = "99999999-9999-4999-8999-999999999999"; // una sesión sin persona: no edita el catálogo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const sesion = (sub) => `
set local request.jwt.claim.sub = '${sub}';
set local request.jwt.claims = '{"sub":"${sub}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;

const PRELUDIO = `
begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores order by created_at limit 1 \\gset

-- Una marca aparte, que el proveedor trae, para darla de baja sin tocar la del resto del seed.
insert into retail.marcas (nombre, activo) values ('ZZ Marca que se da de baja', true) returning id as marca_baja \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca_baja', :'prov');

insert into retail.productos (referencia, estado, marca_id, proveedor_id) values ('ZZ Bloque uno', 'activo', :'marca', :'prov') returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id) values ('ZZ Bloque dos', 'activo', :'marca', :'prov') returning id as p2 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id) values ('ZZ Bloque de marca caída', 'descontinuado', :'marca_baja', :'prov') returning id as p3 \\gset
update retail.marcas set activo = false where id = :'marca_baja';
`;

const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const K = (clave, expresion) => `select 'K|${clave}|' || (${expresion})::text;`;
const cambiar = (ids, estado) =>
  `pg_temp.intento(format('select retail.cambiar_estado_productos(array[%s]::uuid[], %L)::text', ${ids.length ? ids.map((i) => `quote_literal(:'${i}')`).join(" || ',' || ") : "''"}, '${estado}'))`;
const estados = (...ids) => `(select string_agg(estado, ',' order by referencia) from retail.productos where id in (${ids.map((i) => `:'${i}'`).join(", ")}))`;

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}
function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida));
}
const j = (texto) => JSON.parse(texto ?? "null");

correr(
  "1. Descontinuar dos prendas: cambian las dos y el historial queda firmado",
  `${sesion(FELIPE)}${COMO_API}${K("r", cambiar(["p1", "p2"], "descontinuado"))}
${COMO_POSTGRES}${K("estados", estados("p1", "p2"))}
${K("historial", "(select count(*) from retail.historial_producto_cambios where entidad_id in (:'p1', :'p2') and campo = 'estado' and valor_nuevo = 'descontinuado' and usuario_id = :'felipe')")}`,
  (d) => {
    afirmar("cuenta 2", j(d.r)?.res === "2", d.r);
    afirmar("las dos quedaron descontinuadas", d.estados === "descontinuado,descontinuado", d.estados);
    afirmar("dos filas de historial firmadas por Felipe", d.historial === "2", `historial=${d.historial}`);
  },
);

correr(
  "2. Reactivar con una marca dada de baja: nombra la prenda y no cambia ninguna",
  `${sesion(FELIPE)}${COMO_POSTGRES}update retail.productos set estado = 'descontinuado' where id = :'p1';
${COMO_API}${K("r", cambiar(["p1", "p3"], "activo"))}
${COMO_POSTGRES}${K("estados", estados("p1", "p3"))}`,
  (d) => {
    const r = j(d.r);
    afirmar("se rechaza con el hint `marca_proveedor_al_reactivar`", r && r.ok === false && r.hint === "marca_proveedor_al_reactivar", d.r);
    afirmar("el mensaje nombra la prenda y la causa", /zz bloque de marca caída/i.test(r?.msg ?? "") && /marca ya no está activa/i.test(r?.msg ?? ""), r?.msg);
    afirmar("todo o nada: la que sí se podía reactivar sigue descontinuada", d.estados === "descontinuado,descontinuado", d.estados);
  },
);

correr(
  "3. Reactivar las que sí se pueden: la que ya estaba activa no cuenta",
  `${sesion(FELIPE)}${COMO_POSTGRES}update retail.productos set estado = 'descontinuado' where id = :'p1';
${COMO_API}${K("r", cambiar(["p1", "p2"], "activo"))}
${COMO_POSTGRES}${K("estados", estados("p1", "p2"))}`,
  (d) => {
    afirmar("cuenta 1 (p2 ya era activa)", j(d.r)?.res === "1", d.r);
    afirmar("las dos activas", d.estados === "activo,activo", d.estados);
  },
);

correr(
  "4. Sin permiso de editar el catálogo: lo dice en palabras y no cambia nada",
  `${sesion(NADIE)}${COMO_API}${K("r", cambiar(["p1"], "descontinuado"))}
${COMO_POSTGRES}${K("estado", estados("p1"))}`,
  (d) => {
    const r = j(d.r);
    afirmar("se rechaza con el hint `sin_permiso`", r && r.ok === false && r.hint === "sin_permiso", d.r);
    afirmar("la prenda sigue activa", d.estado === "activo", d.estado);
  },
);

correr(
  "5. Estado inválido y lista vacía",
  `${sesion(FELIPE)}${COMO_API}${K("malo", cambiar(["p1"], "archivado"))}
${K("vacia", cambiar([], "activo"))}`,
  (d) => {
    afirmar("un estado que no existe se rechaza (`estado_invalido`)", j(d.malo)?.hint === "estado_invalido", d.malo);
    afirmar("sin prendas marcadas se rechaza (`sin_prendas`)", j(d.vacia)?.hint === "sin_prendas", d.vacia);
  },
);

correr(
  "6. Permisos y forma",
  `${K("anon", "has_function_privilege('anon', 'retail.cambiar_estado_productos(uuid[], text)'::regprocedure, 'EXECUTE')")}
${K("auth", "has_function_privilege('authenticated', 'retail.cambiar_estado_productos(uuid[], text)'::regprocedure, 'EXECUTE')")}
${K("una", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'cambiar_estado_productos')")}
${K("invoker", "(select not prosecdef from pg_proc where oid = 'retail.cambiar_estado_productos(uuid[], text)'::regprocedure)")}`,
  (d) => {
    afirmar("anon NO puede ejecutarla", d.anon === "false");
    afirmar("authenticated sí", d.auth === "true");
    afirmar("una sola firma", d.una === "1", `firmas=${d.una}`);
    afirmar("security invoker: la RLS de productos sigue siendo el candado real", d.invoker === "true");
  },
);

console.log(`\n${total - fallos}/${total} verificaciones pasaron.`);
process.exit(fallos === 0 ? 0 : 1);

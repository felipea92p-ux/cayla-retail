#!/usr/bin/env node
/**
 * Pruebas de «el módulo es la llave en Compras» (ADR-0387, actividad 1 de la fase 2 de ADR-0362, Felipe 2026-10-12) — migración
 * `20261012202000_compras_el_modulo_es_la_llave.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que en Compras ya no haya un «solo un líder» donde la persona tiene el módulo: quien tiene Facturas de proveedor cambia
 * la tienda que gestiona un comprobante, y quien tiene Recibir ve los costos AL RECIBIR (decisión 18 de ADR-0362) sin que se abra la
 * regla general de la plata de Compras (que también cuida los tableros de Facturas y Por pagar y los costos de Catálogo). Lo del Plan
 * de campaña lo vigila `plan_compra.mjs` (E3, T3, C4) y el costo atípico, `lote_costo_atipico.mjs` y `envio_costo_atipico.mjs`.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga dentro de cada caso, así corre con la base al día o sin
 * ella, y de paso se prueba que se puede pegar dos veces).
 *   G  LA TIENDA GESTORA: Micaela (no es líder) con Facturas de proveedor en su rol pasa el permiso (la compra inventada no existe:
 *      ese es el error que le toca); con un rol sin ese módulo, 42501 que nombra «Facturas de proveedor»; el líder, como siempre.
 *   R  LOS COSTOS AL RECIBIR: `fn_ve_costos_al_recibir()` es verdad con Recibir solo y con Facturas, Por pagar o Notas de crédito; falsa
 *      con Proveedores, Plan de campaña, Órdenes de compra o un rol sin módulos de Compras; verdad para el líder.
 *   D  LA REGLA GENERAL NO SE ABRIÓ: con Recibir solo, `fn_puede_ver_dinero_de_compras()` sigue falsa.
 *   F  LA FORMA: las cinco funciones del Plan y la de la tienda gestora ya no preguntan si es líder; las dos de recibir confirman el
 *      costo atípico con `fn_ve_costos_al_recibir` y su nota ya no dice «por un líder»; una sola función de cada nombre, `authenticated`
 *      las sigue ejecutando y `anon` no ejecuta la nueva.
 *
 * USO
 *   pnpm pruebas:compras-llave                                → contra la base `postgres` del stack local
 *   pnpm pruebas:compras-llave --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   pnpm pruebas:compras-llave --sin-migracion                → sin cargar la migración: contra una base sin el cambio, la prueba
 *                                                                tiene que FALLAR (así se ve que vigila algo)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACION = SIN_MIGRACION ? "" : readFileSync(join(RAIZ, "supabase", "migrations", "20261012202000_compras_el_modulo_es_la_llave.sql"), "utf8")
  .replace(/^set lock_timeout.*$/m, "")
  .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba ADR-0387') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// G. LA TIENDA GESTORA --------------------------------------------------------------------------------------------------
const GESTORA = `split_part(pg_temp.intento(format('select retail.cambiar_tienda_gestora_compra(%L, %L)', gen_random_uuid(), :'tru')), '|', 2)`;
caso(
  "G1 Micaela, sin ser líder y con Facturas de proveedor, pasa el permiso (la compra inventada no existe: ese es su error)",
  `${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select ${GESTORA} like 'La compra % no existe';`,
  "t"
);
caso(
  "G2 con un rol sin Facturas de proveedor, 42501 que nombra el módulo (ya no dice «solo un líder»)",
  `${rolDeMicaela("existencias")}
   ${como(MICAELA)}
   select pg_temp.intento(format('select retail.cambiar_tienda_gestora_compra(%L, %L)', gen_random_uuid(), :'tru'));`,
  "42501|Cambiar la tienda que gestiona un comprobante necesita el módulo «Facturas de proveedor» en tu rol"
);
caso(
  "G3 el líder, como siempre",
  `${como(FELIPE)}
   select ${GESTORA} like 'La compra % no existe';`,
  "t"
);

// R. LOS COSTOS AL RECIBIR (y D: la regla general no se abrió) ----------------------------------------------------------
for (const [modulo, esperado] of [["recibir", "t"], ["facturas_compra", "t"], ["por_pagar", "t"], ["notas_credito", "t"],
  ["proveedores", "f"], ["plan_compra", "f"], ["ordenes_compra", "f"], ["existencias", "f"]]) {
  caso(
    `R con «${modulo}» solo, sin ser líder, ${esperado === "t" ? "ve" : "NO ve"} los costos al recibir`,
    `${rolDeMicaela(modulo)}
     ${como(MICAELA)}
     select retail.fn_ve_costos_al_recibir();`,
    esperado
  );
}
caso(
  "R el líder los ve",
  `${como(FELIPE)}
   select retail.fn_ve_costos_al_recibir();`,
  "t"
);
caso(
  "D con Recibir solo, la regla general de la plata de Compras sigue cerrada (no abre los tableros de Facturas y Por pagar)",
  `${rolDeMicaela("recibir")}
   ${como(MICAELA)}
   select retail.fn_puede_ver_dinero_de_compras();`,
  "f"
);

// F. LA FORMA -----------------------------------------------------------------------------------------------------------
caso(
  "F1 ni el Plan (cinco funciones) ni la tienda gestora preguntan ya si es líder",
  `select count(*) from unnest(array['retail.crear_plan_compra(uuid,text,date,date)', 'retail.editar_plan_compra(uuid,text,date,date)',
     'retail.quitar_plan_compra(uuid)', 'retail.restaurar_plan_compra(uuid)', 'retail.guardar_plan_compra_tope(uuid,numeric)',
     'retail.cambiar_tienda_gestora_compra(uuid,uuid)']) f
    where position('fn_es_lider' in pg_get_functiondef(f::regprocedure)) > 0;`,
  "0"
);
caso(
  "F2 recibir_envio y recibir_lote confirman el costo atípico con fn_ve_costos_al_recibir y su nota ya no dice «por un líder»",
  `select string_agg((position('fn_ve_costos_al_recibir() then' in d) > 0)::text || '/' || (position('confirmado por un líder' in d) = 0)::text, ',')
     from (select pg_get_functiondef(f::regprocedure) as d from unnest(array['retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
       'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)']) f) x;`,
  "true/true,true/true"
);
caso(
  "F3 una sola función de cada nombre, authenticated las sigue ejecutando, y anon no ejecuta la nueva",
  `select (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute'), ',' order by p.proname)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'retail' and p.proname in ('crear_plan_compra', 'editar_plan_compra', 'quitar_plan_compra', 'restaurar_plan_compra',
              'guardar_plan_compra_tope', 'cambiar_tienda_gestora_compra', 'recibir_envio', 'recibir_lote', 'fn_ve_costos_al_recibir'))
          || ',anon:' || has_function_privilege('anon', 'retail.fn_ve_costos_al_recibir()', 'execute');`,
  "cambiar_tienda_gestora_compra:true,crear_plan_compra:true,editar_plan_compra:true,fn_ve_costos_al_recibir:true,guardar_plan_compra_tope:true,quitar_plan_compra:true,recibir_envio:true,recibir_lote:true,restaurar_plan_compra:true,anon:false"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

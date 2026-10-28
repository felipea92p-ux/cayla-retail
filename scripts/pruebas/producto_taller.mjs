#!/usr/bin/env node
/**
 * «Lleva ojales y botones», un dato del MODELO (ADR-0551, actividad 1; migración 20261028053000). CAYLA V2.
 *
 * LO QUE VIGILA. Que la respuesta viva en `producto_taller` y no en `productos`; que «sin fila» (nadie lo ha preguntado) se distinga de «no lleva»; que guardar lo MISMO no escriba ni anote
 * nada; que cambiar la respuesta quede firmada y en Actividad; que solo quien opera ESE Taller la guarde (y nadie desde afuera ni sin decir sí o no); que la tabla no se lea ni se escriba
 * directo; que borrar el modelo borre su fila; y que la migración se pueda volver a pegar.
 *
 * Cada caso corre en su propia transacción con ROLLBACK. Contra la base tal como queda con TODAS las migraciones aplicadas (la misma de CI).
 *
 * USO
 *   node scripts/pruebas/producto_taller.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/producto_taller.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/producto_taller.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)
const MIGRACION = readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261028053000_producto_taller_ojales_y_botones.sql", import.meta.url)), "utf8");

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Una envoltura que nunca aborta el caso: devuelve «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
-- Guardar devuelve «true»/«false» (si cambió algo) o el error.
create function pg_temp.guarda(p_taller uuid, p_prod uuid, p_lleva boolean) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  return retail.guardar_ojales_botones_modelo(p_taller, p_prod, p_lleva)::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p where p.es_prueba is not true and p.estado <> 'descontinuado' order by p.created_at limit 1 \\gset
${como(FELIPE)}
`;
const FILA = `(select lleva_ojales_botones::text from retail.producto_taller where producto_id = :'prod')`;
const ACTIVIDAD = `(select count(*) from retail.actividad where accion = 'producto_taller_ojales_botones' and registro_id = :'prod'::text)`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// A. SIN FILA ES «NADIE LO HA PREGUNTADO» -----------------------------------------------------------------------------------------
caso(
  "A1 un modelo que nadie ha contestado NO sale en la lectura (sin fila ≠ «no lleva»): la hoja lo distingue y pregunta",
  `select count(*) from retail.fn_ojales_botones_de_modelos() where producto_id = :'prod';`,
  "0"
);

// B. GUARDAR ---------------------------------------------------------------------------------------------------------------------
caso(
  "B1 decir que lleva ojales y botones guarda la respuesta (devuelve true), la firma quien la dio, sale en la lectura y queda UNA línea en Actividad",
  `select pg_temp.guarda(:'taller', :'prod', true) as g \\gset
   select concat_ws(',', :'g', ${FILA}, (select declarado_por is not null from retail.producto_taller where producto_id = :'prod'),
     (select lleva_ojales_botones::text from retail.fn_ojales_botones_de_modelos() where producto_id = :'prod'), ${ACTIVIDAD});`,
  "true,true,t,true,1"
);
caso(
  "B2 decir lo MISMO otra vez no escribe nada: devuelve false, la fecha no cambia y Actividad no suma una línea",
  `select pg_temp.guarda(:'taller', :'prod', true) as g1 \\gset
   select updated_at as t1 from retail.producto_taller where producto_id = :'prod' \\gset
   select pg_sleep(0.05);
   select pg_temp.guarda(:'taller', :'prod', true) as g2 \\gset
   select concat_ws(',', :'g1', :'g2', (select updated_at = :'t1'::timestamptz from retail.producto_taller where producto_id = :'prod'), ${ACTIVIDAD});`,
  "true,false,t,1"
);
caso(
  "B3 cambiar la respuesta (lleva → no lleva) la actualiza, devuelve true y suma su línea en Actividad: una sola fila por modelo",
  `select pg_temp.guarda(:'taller', :'prod', true) as g1 \\gset
   select pg_temp.guarda(:'taller', :'prod', false) as g2 \\gset
   select concat_ws(',', :'g1', :'g2', ${FILA}, (select count(*) from retail.producto_taller where producto_id = :'prod'), ${ACTIVIDAD});`,
  "true,true,false,1,2"
);

// C. QUIÉN Y CÓMO ----------------------------------------------------------------------------------------------------------------
caso(
  "C1 una integrante de Trujillo (sin operar el Taller) no guarda (42501) y no deja nada escrito",
  `${como(MICAELA)}
   select pg_temp.guarda(:'taller', :'prod', true) as g \\gset
   ${como(FELIPE)}
   select concat_ws(',', pg_temp.eh(:'g'), (select count(*) from retail.producto_taller where producto_id = :'prod'), ${ACTIVIDAD});`,
  "42501|produccion_sin_taller,0,0"
);
caso(
  "C2 desde una tienda no se guarda («se anotan desde el Taller»), sin decir sí o no tampoco, y un modelo que no existe se dice claro; en los tres casos nada queda escrito",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.guarda(:'tienda', :'prod', true)),
     pg_temp.eh(pg_temp.guarda(:'taller', :'prod', null)),
     pg_temp.eh(pg_temp.guarda(:'taller', gen_random_uuid(), true)),
     (select count(*) from retail.producto_taller));`,
  (o) => /^(42501\|[a-z_]+|P0001\|ojales_botones_no_es_taller),P0001\|ojales_botones_sin_respuesta,P0001\|ojales_botones_modelo_inexistente,0$/.test(o)
);
caso(
  "C3 la tabla está cerrada a la API (authenticated y anon no la leen ni la escriben, solo las funciones) con RLS encendido y sin políticas; la lectura es de quien ve Producción y la función de guardar no la ejecuta anon",
  `select concat_ws(',',
     has_table_privilege('authenticated', 'retail.producto_taller', 'select,insert,update,delete'),
     has_table_privilege('anon', 'retail.producto_taller', 'select'),
     (select relrowsecurity from pg_class where oid = 'retail.producto_taller'::regclass),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'producto_taller'),
     has_function_privilege('anon', 'retail.guardar_ojales_botones_modelo(uuid, uuid, boolean)', 'execute'),
     has_function_privilege('authenticated', 'retail.guardar_ojales_botones_modelo(uuid, uuid, boolean)', 'execute'),
     has_function_privilege('anon', 'retail.fn_ojales_botones_de_modelos()', 'execute'));`,
  "f,f,t,0,f,t,f"
);

// D. LA FILA SE VA CON EL MODELO Y LA MIGRACIÓN SE PUEDE REPEGAR --------------------------------------------------------------------
caso(
  "D1 la fila cuelga del modelo con cascada (es configuración del modelo, no historia: la orden ya guardó sus propias fases)",
  `select (select confdeltype from pg_constraint where conrelid = 'retail.producto_taller'::regclass and contype = 'f' and confrelid = 'retail.productos'::regclass);`,
  "c"
);
caso(
  "D2 volver a pegar la migración no cambia nada: la función de guardar queda idéntica (misma huella) y la respuesta ya guardada sigue ahí",
  `select pg_temp.guarda(:'taller', :'prod', true) as g \\gset
   select md5(pg_get_functiondef('retail.guardar_ojales_botones_modelo(uuid, uuid, boolean)'::regprocedure)) as antes \\gset
   ${MIGRACION.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "")}
   ${como(FELIPE)}
   select concat_ws(',', md5(pg_get_functiondef('retail.guardar_ojales_botones_modelo(uuid, uuid, boolean)'::regprocedure)) = :'antes', ${FILA});`,
  "t,true"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas de la propuesta del SIRE (ADR-0601, actividades 1, 2 y 5) — migraciones `20261102202000_sire_propuestas.sql`,
 * `20261102203000_sire_resoluciones.sql` y `20261102204000_sire_propuesta_api.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la propuesta de SUNAT que se sube para compararla con el ERP se guarde entera o nada, que subirla otra vez el mismo mes
 * agregue una versión sin borrar la anterior (la vigente es la última), que solo quien ve Impuestos la suba o la lea, y que la base frene un mes
 * futuro, un registro desconocido o una línea mal formada. Y que una diferencia se resuelva una sola vez (dos a la vez: una gana), que
 * deshacer no borre, y que la resolución viva por la llave del comprobante y sobreviva a subir otra versión. Y que lo que trae la API solo
 * lo guarde la llave de servicio, sin repetir una versión igual a la vigente.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * LO QUE ESTA PRUEBA NO HACE: leer el txt de SUNAT ni cruzarlo con el ERP (eso es de la web: `lib/sire-propuesta-reglas.test.ts` y
 * `lib/sire-cruce-reglas.test.ts`), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/sire_propuestas.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/sire_propuestas.mjs --contenedor supabase_db_x  → contra otro stack
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
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = ["20261102202000_sire_propuestas.sql", "20261102203000_sire_resoluciones.sql", "20261102204000_sire_propuesta_api.sql"]
  .map((f) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const SIN_CUENTA = "22222222-2222-4222-8222-0000000000ff"; // una sesión que no es de nadie: no ve ningún módulo

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const ENVOLTURAS = `
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
`;

// Dos comprobantes inventados (ningún RUC es real), de un mes que nadie usa en la base local (marzo de 2021): la base es compartida y
// puede tener propuestas de verdad de los meses recientes.
const LINEAS = `'[{"fecha":"2026-10-05","tipo":"01","serie":"F001","numero":"123","doc_tipo":"6","doc_numero":"20100000001","nombre":"PROVEEDOR UNO","base":100,"igv":18,"total":118,"moneda":"PEN"},
  {"fecha":"2026-10-07","tipo":"07","serie":"FC01","numero":"4","doc_tipo":"6","doc_numero":"20100000002","base":-50,"igv":-9,"total":-59,"moneda":"USD","tipo_cambio":3.75,"ref_tipo":"01","ref_serie":"F001","ref_numero":"99"}]'::jsonb`;
const UNA = `'[{"fecha":"2026-10-09","tipo":"01","serie":"E001","numero":"8","doc_numero":"20100000003","total":590,"base":500,"igv":90}]'::jsonb`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
${como(FELIPE)}
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// P. LA PROPUESTA -----------------------------------------------------------------------------------------------------------------
caso(
  "P1 el líder guarda la propuesta de compras de octubre y la lee entera, con quién la subió",
  `select retail.guardar_propuesta_sire('compras', '2021-03-15', 'propuesta.zip', ${LINEAS}) is not null as g \\gset
   select retail.fn_sire_propuesta('compras', '2021-03-01') as p \\gset
   select concat_ws(',', :'g', (:'p'::jsonb) ->> 'mes', jsonb_array_length((:'p'::jsonb) -> 'lineas'), (:'p'::jsonb) ->> 'versiones',
     (:'p'::jsonb) -> 'lineas' -> 1 ->> 'moneda', (:'p'::jsonb) -> 'lineas' -> 1 ->> 'tipo_cambio', (:'p'::jsonb) ->> 'archivo',
     ((:'p'::jsonb) ->> 'subida_por') is not null);`,
  "t,2021-03,2,1,USD,3.7500,propuesta.zip,t"
);

caso(
  "P2 subir otra vez el mismo mes agrega una versión: la vigente es la nueva y la anterior sigue guardada",
  `select retail.guardar_propuesta_sire('compras', '2021-03-01', 'primera.txt', ${LINEAS}) \\gset
   select retail.guardar_propuesta_sire('compras', '2021-03-01', 'segunda.txt', ${UNA}) \\gset
   select retail.fn_sire_propuesta('compras', '2021-03-01') as p \\gset
   select concat_ws(',', (:'p'::jsonb) ->> 'archivo', jsonb_array_length((:'p'::jsonb) -> 'lineas'), (:'p'::jsonb) ->> 'versiones',
     (select count(*) from retail.sire_lineas l join retail.sire_propuestas x on x.id = l.propuesta_id where x.periodo = '2021-03-01'));`,
  "segunda.txt,1,2,3"
);

caso(
  "P3 compras y ventas del mismo mes son propuestas distintas; un mes sin subir devuelve null",
  `select retail.guardar_propuesta_sire('ventas', '2021-03-01', null, ${UNA}) \\gset
   select concat_ws(',', retail.fn_sire_propuesta('compras', '2021-03-01') is null, retail.fn_sire_propuesta('ventas', '2021-03-01') ->> 'registro',
     retail.fn_sire_propuesta('ventas', '2021-02-01') is null);`,
  "t,ventas,t"
);

caso(
  "P4 una propuesta sin comprobantes se guarda (SUNAT no recibió nada ese mes)",
  `select retail.guardar_propuesta_sire('compras', '2021-03-01', null, '[]'::jsonb) \\gset
   select concat_ws(',', retail.fn_sire_propuesta('compras', '2021-03-01') -> 'lineas', (select lineas from retail.sire_propuestas where periodo = '2021-03-01'));`,
  "[],0"
);

// F. LO QUE LA BASE FRENA ---------------------------------------------------------------------------------------------------------
caso(
  "F1 sin el módulo Impuestos no se sube ni se lee",
  `${como(SIN_CUENTA)}
   select concat_ws(',', split_part(pg_temp.intento($$select retail.guardar_propuesta_sire('compras', '2021-03-01', null, '[]'::jsonb)$$), '|', 1),
     split_part(pg_temp.intento($$select retail.fn_sire_propuesta('compras', '2021-03-01')$$), '|', 1));`,
  "42501,42501"
);

caso(
  "F2 un mes que todavía no empieza, un registro desconocido o algo que no es una lista se rechazan",
  `select concat_ws(',',
     pg_temp.intento($$select retail.guardar_propuesta_sire('compras', (now() + interval '2 months')::date, null, '[]'::jsonb)$$),
     pg_temp.intento($$select retail.guardar_propuesta_sire('diario', '2021-03-01', null, '[]'::jsonb)$$),
     pg_temp.intento($$select retail.guardar_propuesta_sire('compras', '2021-03-01', null, '{}'::jsonb)$$));`,
  "22023|mes_futuro,22023|registro_desconocido,22023|lineas_invalidas"
);

caso(
  "F3 una línea mal formada (número con letras) no deja nada guardado: ni la propuesta ni las otras líneas",
  `select split_part(pg_temp.intento($$select retail.guardar_propuesta_sire('compras', '2021-03-01', null,
      '[{"tipo":"01","serie":"F001","numero":"12","total":10},{"tipo":"01","serie":"F001","numero":"A12","total":10}]'::jsonb)$$), '|', 1) as e \\gset
   select concat_ws(',', :'e', (select count(*) from retail.sire_propuestas where periodo = '2021-03-01'), (select count(*) from retail.sire_lineas l
     join retail.sire_propuestas x on x.id = l.propuesta_id where x.periodo = '2021-03-01'));`,
  "23514,0,0"
);

// R. RESOLVER UNA DIFERENCIA ------------------------------------------------------------------------------------------------------
caso(
  "R1 resolver una diferencia la deja en la propuesta, con su decisión y quién la tomó; sobrevive a subir otra versión",
  `select retail.guardar_propuesta_sire('compras', '2021-03-01', null, ${UNA}) \\gset
   select retail.resolver_diferencia_sire('compras', '2021-03-20', '01|E001|8|20100000003', 'es_de_claure', '  de la tienda de Lima  ') \\gset
   select retail.guardar_propuesta_sire('compras', '2021-03-01', null, ${UNA}) \\gset
   select retail.fn_sire_propuesta('compras', '2021-03-01') -> 'resoluciones' -> 0 as r \\gset
   select concat_ws(',', (:'r'::jsonb) ->> 'clave', (:'r'::jsonb) ->> 'decision', (:'r'::jsonb) ->> 'nota', ((:'r'::jsonb) ->> 'resuelta_por') is not null);`,
  "01|E001|8|20100000003,es_de_claure,de la tienda de Lima,t"
);

caso(
  "R2 el mismo comprobante no se resuelve dos veces; deshacer no borra y deja resolverlo otra vez",
  `select retail.resolver_diferencia_sire('compras', '2021-03-01', '01|E001|8|20100000003', 'otro_mes', null) as id \\gset
   select pg_temp.intento($$select retail.resolver_diferencia_sire('compras', '2021-03-01', '01|E001|8|20100000003', 'revisada', null)$$) as dos \\gset
   select retail.deshacer_resolucion_sire(:'id') \\gset
   select pg_temp.intento(format('select retail.deshacer_resolucion_sire(%L)', :'id')) as tres \\gset
   select pg_temp.intento($$select retail.resolver_diferencia_sire('compras', '2021-03-01', '01|E001|8|20100000003', 'revisada', null)$$) as cuatro \\gset
   select concat_ws(',', split_part(:'dos', '|', 2), split_part(:'tres', '|', 2), :'cuatro',
     (select count(*) from retail.sire_resoluciones where clave = '01|E001|8|20100000003'),
     (select count(*) from retail.sire_resoluciones where clave = '01|E001|8|20100000003' and deshecha_at is null));`,
  "ya_resuelta,ya_deshecha,SIN_ERROR,2,1"
);

caso(
  "R3 una decisión desconocida o una llave mal formada se rechazan; sin el módulo no se resuelve",
  `select concat_ws(',',
     split_part(pg_temp.intento($$select retail.resolver_diferencia_sire('compras', '2021-03-01', '01|E001|8|20100000003', 'borrar', null)$$), '|', 1),
     split_part(pg_temp.intento($$select retail.resolver_diferencia_sire('compras', '2021-03-01', 'cualquier cosa', 'revisada', null)$$), '|', 1));
   ${como(SIN_CUENTA)}
   select split_part(pg_temp.intento($$select retail.resolver_diferencia_sire('compras', '2021-03-01', '01|E001|8|20100000003', 'revisada', null)$$), '|', 1);`,
  "42501"
);

// A. LO QUE TRAE LA API ------------------------------------------------------------------------------------------------------------
caso(
  "A1 la llave de servicio guarda la propuesta como «api», sin firma; lo mismo otra vez no crea versión; algo distinto sí",
  `set local role service_role;
   select retail.guardar_propuesta_sire_api('compras', '2021-03-01', ${LINEAS}) is not null as uno \\gset
   select retail.guardar_propuesta_sire_api('compras', '2021-03-01', ${LINEAS}) is null as repetida \\gset
   select retail.guardar_propuesta_sire_api('compras', '2021-03-01', ${UNA}) is not null as otra \\gset
   reset role;
   select concat_ws(',', :'uno', :'repetida', :'otra',
     (select count(*) from retail.sire_propuestas where periodo = '2021-03-01'),
     (select string_agg(distinct origen || ':' || coalesce(subida_por::text, 'sin firma'), ' ') from retail.sire_propuestas where periodo = '2021-03-01'));`,
  "t,t,t,2,api:sin firma"
);

caso(
  "A2 una cuenta con sesión no puede usar la función del proceso automático",
  `set local role authenticated;
   select split_part(pg_temp.intento($$select retail.guardar_propuesta_sire_api('compras', '2021-03-01', '[]'::jsonb)$$), '|', 1);`,
  "42501"
);

// S. LA FORMA ---------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la migración se vuelve a cargar encima sin error y sin tocar lo guardado",
  `select retail.guardar_propuesta_sire('compras', '2021-03-01', null, ${UNA}) \\gset
   ${MIGRACION}
   select concat_ws(',', (select count(*) from retail.sire_propuestas where periodo = '2021-03-01'),
     (select relrowsecurity from pg_class where oid = 'retail.sire_lineas'::regclass),
     (select count(*) from pg_policies where tablename in ('sire_propuestas', 'sire_lineas')));`,
  "1,t,0"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Prueba de `20260930030000_actividad_oculta_ventas_de_prueba.sql`: el panel de Actividad (`fn_actividad`) y su filtro
 * «Persona» (`fn_actividad_personas`) no muestran las filas de una venta archivada como prueba (`ventas.es_prueba`).
 *
 * La escena son dos ventas vacías de Tienda Trujillo (una de prueba, una normal) y una fila de `actividad` por cada
 * una, insertadas como `postgres` (los disparadores de actividad corren al CONFIRMAR, y aquí nada se confirma). Cada caso
 * corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 * Se lee como la líder del seed (`request.jwt.claim.sub`), igual que en `anular_venta_mismo_dia.mjs`.
 *
 * LOS CONTROLES («sin la migración…») NO PUEDEN CONFIAR EN QUE LA BASE ESTÉ SIN PARCHE: en el CI y en producción la
 * migración ya está puesta (el stack se levanta con TODAS las migraciones del repo), y en una base local vieja no. Por eso
 * cada caso aplica primero la migración (idempotente) y el control le suma `DESHACER`, que quita el parche: el camino es el
 * mismo en los tres sitios, sea cual sea el estado con que arranca la base. (Fallaba en el CI del PR #627 por esto: el control esperaba la base sin parche y la encontró parchada.)
 *
 * USO: pnpm pruebas:actividad-oculta-ventas-de-prueba   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930030000_actividad_oculta_ventas_de_prueba.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Dos ventas de Trujillo —`:prueba` (es_prueba) y `:normal`— con una fila de actividad cada una, y `:persona` que las hizo.
 *  La fila de la venta de prueba va fechada dentro de un año: si se colara en «Persona», la última actividad de esa persona
 *  saltaría al futuro, y eso se distingue de cualquier otra fila que ya haya en la base local. */
const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as persona from public.personas order by created_at limit 1 \\gset
with existente as (select id from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta' limit 1),
nueva as (insert into retail.cajas (ubicacion_id, monto_apertura)
          select :'ubic', 0 where not exists (select 1 from existente) returning id)
select id as caja from existente union all select id from nueva \\gset
insert into retail.ventas (ubicacion_id, caja_id, es_prueba) values (:'ubic', :'caja', true) returning id as prueba \\gset
insert into retail.ventas (ubicacion_id, caja_id, es_prueba) values (:'ubic', :'caja', false) returning id as normal \\gset
insert into retail.actividad (ocurrio_at, modulo, accion, descripcion, persona_id, ubicacion_id, tabla, registro_id)
  values (now() + interval '1 year', 'vender', 'venta_registrada', 'vendió 1 prenda (prueba)', :'persona', :'ubic', 'ventas', :'prueba'),
         (now(), 'vender', 'venta_registrada', 'vendió 1 prenda (normal)', :'persona', :'ubic', 'ventas', :'normal');
`;

// El «cómo se deshace» de la migración: quita la línea que agregó a cada función (y su salto de línea), si está. Lo usan los
// controles para simular la base de antes; con la línea ausente no cambia nada.
const DESHACER = `
do $d$
declare
  f text;
  v text;
  linea constant text := 'and not coalesce(a.tabla = ''ventas'' and a.registro_id in (select v.id::text from retail.ventas v where v.es_prueba), false) -- ADR-0159/0278' || E'\\n     ';
begin
  foreach f in array array[
    'retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer)',
    'retail.fn_actividad_personas(uuid, text)'
  ] loop
    v := pg_get_functiondef(f::regprocedure);
    if position(linea in v) > 0 then
      execute replace(v, linea, '');
    end if;
  end loop;
end $d$;
`;

/** Ejecuta `consulta` como líder y devuelve lo que imprima. SIEMPRE aplica primero la migración (es idempotente); para la base
 *  «de antes» le sigue `DESHACER`. Así el punto de partida da igual —local sin parche o CI con parche— y el camino es el mismo. */
function correr(consulta, { conMigracion = true } = {}) {
  return psql(`
begin;
${MIGRACION}
${conMigracion ? "" : DESHACER}
${ESCENA}
set local request.jwt.claim.sub = '${FELIPE}';
${consulta}
rollback;
`);
}

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}

const filasDe = (id) => `select count(*) from retail.fn_actividad(p_limite => 200) where registro_id = :'${id}';`;

caso("CONTROL: con el parche deshecho, la venta de prueba SÍ sale en el panel (el hueco existía)", () => {
  const n = correr(filasDe("prueba"), { conMigracion: false });
  if (n !== "1") return `salieron ${n} filas y debía salir 1`;
});
caso("con la migración, la venta de prueba desaparece del panel", () => {
  const n = correr(filasDe("prueba"));
  if (n !== "0") return `salieron ${n} filas y debían ser 0`;
});
caso("con la migración, la venta normal sigue saliendo", () => {
  const n = correr(filasDe("normal"));
  if (n !== "1") return `salieron ${n} filas y debía salir 1`;
});
caso("la fila de la venta de prueba SIGUE en la tabla (solo se oculta, no se borra)", () => {
  const n = correr(`select count(*) from retail.actividad where registro_id = :'prueba';`);
  if (n !== "1") return `hay ${n} filas y debía haber 1`;
});
caso("marcar la venta como prueba DESPUÉS de anotarla también la oculta (es por la venta, no por la fila)", () => {
  const n = correr(`update retail.ventas set es_prueba = true where id = :'normal';\n${filasDe("normal")}`);
  if (n !== "0") return `salieron ${n} filas y debían ser 0`;
});
const ultimaActividadEnElFuturo = `select coalesce(bool_or(ultima_at > now() + interval '1 day'), false) from retail.fn_actividad_personas() where persona_id = :'persona';`;
caso("CONTROL: con el parche deshecho, la fila oculta empuja la última actividad de la persona (el filtro «Persona» la contaba)", () => {
  const r = correr(ultimaActividadEnElFuturo, { conMigracion: false });
  if (r !== "t") return `dio ${r} y debía dar t`;
});
caso("con la migración, el filtro «Persona» ya no cuenta las filas de una venta de prueba", () => {
  const r = correr(ultimaActividadEnElFuturo);
  if (r !== "f") return `dio ${r} y debía dar f`;
});
caso("deshacer quita el parche aunque la migración YA esté puesta (así corre el CI) y volver a pegarla lo restituye", () => {
  const cuenta = `select (length(d) - length(replace(d, '-- ADR-0159/0278', ''))) / length('-- ADR-0159/0278')
  from (select pg_get_functiondef('retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer)'::regprocedure) as d
        union all select pg_get_functiondef('retail.fn_actividad_personas(uuid, text)'::regprocedure)) t;`;
  const n = psql(`
begin;
${MIGRACION}
${cuenta}
${DESHACER}
${cuenta}
${MIGRACION}
${cuenta}
rollback;`);
  // La migración imprime líneas vacías (sus `select pg_temp.reemplazar`): se ignoran.
  const veces = n.split("\n").filter((l) => l !== "").join(" ");
  if (veces !== "1 1 0 0 1 1") return `la línea aparece (puesta / deshecha / vuelta a poner): ${veces}`;
});
caso("la migración se puede pegar dos veces: la línea queda una sola vez en cada función", () => {
  const n = psql(`
begin;
${MIGRACION}
${MIGRACION}
select (length(d) - length(replace(d, '-- ADR-0159/0278', ''))) / length('-- ADR-0159/0278')
  from (select pg_get_functiondef('retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer)'::regprocedure) as d
        union all select pg_get_functiondef('retail.fn_actividad_personas(uuid, text)'::regprocedure)) t;
rollback;`);
  if (n !== "1\n1") return `la línea aparece: ${n.replace("\n", " y ")}`;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas === 0 ? 0 : 1);

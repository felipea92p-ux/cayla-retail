#!/usr/bin/env node
/**
 * Pruebas de «telas cortadas sin anotar» (ADR-0570, actividad 4) — migración `20261031173000_produccion_telas_cortadas_sin_anotar.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que Insumos pueda decir «la OP-3 ya cortó con esta tela y no tiene nada anotado» sin equivocarse en ninguna dirección: avisa cuando el Corte tiene prendas
 * y el libro no descontó la tela; calla cuando el Corte todavía no se anotó, cuando la tela ya se anotó, cuando la orden es una muestra o ya no está abierta; y quien no lee
 * Producción en ese Taller recibe una lista vacía (nunca un error ni la orden de otro).
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * QUÉ PRUEBA
 *   A  AVISA:  Corte anotado sin tela y tela en el estante → una fila con su saldo; sin tela en el estante → la fila con saldo 0 (la pantalla la calla).
 *   B  CALLA:  sin Corte anotado; con la tela anotada («quedaron»); muestra; orden anulada; un Deshacer que deja el Corte en cero.
 *   C  FORMA:  quien no lee Producción en ese Taller recibe []; permisos de la función; la migración se puede pegar otra vez.
 *
 * USO
 *   node scripts/pruebas/produccion_telas_cortadas_sin_anotar.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_telas_cortadas_sin_anotar.mjs --contenedor supabase_db_x  → contra otro stack
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261031173000_produccion_telas_cortadas_sin_anotar.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
end;
$f$;
create function pg_temp.guarda(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- «Terminé» el Corte, sin tela (la puerta que deja el hueco) o con lo que quedó de ella.
create function pg_temp.termina(p_fase uuid, p_lineas jsonb, p_tela jsonb default null) returns text language sql as $f$
  select pg_temp.guarda(format('select retail.anotar_termine_con_tela(%L, %L::jsonb, null, null, null, %L::jsonb, null)', p_fase, p_lineas, p_tela)) $f$;
`;

// Datos propios: una tela con 50 m en el estante del Taller, y el modelo del seed con sus dos colores.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TC-LINO', 'Lino Telas Cortadas Prueba', 'tela', 'metro') returning id as lino \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
update retail.variantes set costo = 4.50 where id = :'v1';
${como(FELIPE)}
`;
// El lote entra DESPUÉS (como pasó con la OP-3): primero se anota el Corte, luego se carga la tela.
const LOTE = (m) => `insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', ${m}, 10, 'saldo_inicial') returning id as lote \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
     values (:'lino', :'lote', :'taller', 'compra', ${m}, 10, :'felipe_p');`;

const APERTURA = (muestra = false) => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', ${muestra}, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30')))`;
const ESPINA = `jsonb_build_array(jsonb_build_object('clave', 'corte', 'quien', 'taller'), jsonb_build_object('clave', 'costura', 'quien', 'taller'), jsonb_build_object('clave', 'acabado', 'quien', 'taller'))`;
const LISTA = `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2', 'complemento', false))`;
const ABRE = (muestra = false) => `select pg_temp.abre(${APERTURA(muestra)}, ${ESPINA}, ${LISTA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset`;
const L30 = `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'))`;
const QUEDO = (n) => `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'quedo', '${n}'))`;
/** Cuántas filas de ESTA orden devuelve la función, y la primera (su saldo y su nombre). */
const FILAS = `(select count(*) from jsonb_array_elements(retail.fn_telas_cortadas_sin_anotar(:'taller')) e where e ->> 'produccion_id' = :'oid')`;
const SALDO = `(select (e ->> 'saldo')::numeric(12,0) from jsonb_array_elements(retail.fn_telas_cortadas_sin_anotar(:'taller')) e where e ->> 'produccion_id' = :'oid' limit 1)`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  casos++;
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// A. AVISA ----------------------------------------------------------------------------------------------------------------------
caso(
  "A1 el caso de la OP-3: el Corte se anotó sin tela y la tela entró después → una fila con los 50 m del estante",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L30}) as t \\gset
   ${LOTE(50)}
   select concat_ws(',', :'t', ${FILAS}, ${SALDO});`,
  "SIN_ERROR,1,50"
);
caso(
  "A2 con el Corte anotado y todavía sin tela en el estante, la base igual lo dice (saldo 0): la pantalla de Insumos es la que lo calla",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L30}) as t \\gset
   select concat_ws(',', :'t', ${FILAS}, ${SALDO});`,
  "SIN_ERROR,1,0"
);

// B. CALLA ----------------------------------------------------------------------------------------------------------------------
caso(
  "B1 la orden todavía no cortó (nada anotado en su Corte): no hay nada que avisar aunque haya tela",
  `${ABRE()}
   ${LOTE(50)}
   select concat_ws(',', ${FILAS});`,
  "0"
);
caso(
  "B2 el Corte se anotó CON su tela («quedaron 14 m»): el libro ya descontó, no avisa",
  `${ABRE()}
   ${LOTE(50)}
   select pg_temp.termina(:'f_corte', ${L30}, ${QUEDO(14)}) as t \\gset
   select concat_ws(',', :'t', ${FILAS});`,
  "SIN_ERROR,0"
);
caso(
  "B3 una muestra no entra al stock ni deja costo: no avisa",
  `${ABRE(true)}
   select pg_temp.termina(:'f_corte', ${L30}) as t \\gset
   ${LOTE(50)}
   select concat_ws(',', :'t', ${FILAS});`,
  "SIN_ERROR,0"
);
caso(
  "B4 una orden anulada ya no es de nadie: no avisa",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L30}) as t \\gset
   ${LOTE(50)}
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select concat_ws(',', :'t', ${FILAS});`,
  "SIN_ERROR,0"
);

// C. FORMA ----------------------------------------------------------------------------------------------------------------------
caso(
  "C1 quien no lee Producción en ese Taller (Integrante de Tienda Trujillo) recibe [] y no un error",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L30}) as t \\gset
   ${LOTE(50)}
   ${como(MICAELA)}
   select concat_ws(',', :'t', retail.fn_telas_cortadas_sin_anotar(:'taller')::text);`,
  "SIN_ERROR,[]"
);
caso(
  "C2 sin ubicación devuelve [] (nunca todas las órdenes)",
  `select retail.fn_telas_cortadas_sin_anotar(null)::text;`,
  "[]"
);
caso(
  "C3 permisos: la web (authenticated) y la base (service_role) la llaman; anon y el público no",
  `select concat_ws(',',
     has_function_privilege('authenticated', 'retail.fn_telas_cortadas_sin_anotar(uuid)', 'execute'),
     has_function_privilege('service_role', 'retail.fn_telas_cortadas_sin_anotar(uuid)', 'execute'),
     has_function_privilege('anon', 'retail.fn_telas_cortadas_sin_anotar(uuid)', 'execute'));`,
  "t,t,f"
);
caso(
  "C4 se puede pegar otra vez (la migración ya está cargada en el preludio; se carga de nuevo) y sigue contestando",
  `${MIGRACION}
   select retail.fn_telas_cortadas_sin_anotar(:'taller') is not null;`,
  "t"
);

console.log(`\n${casos - fallas} de ${casos} casos bien.`);
process.exit(fallas === 0 ? 0 : 1);

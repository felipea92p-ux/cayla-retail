#!/usr/bin/env node
/**
 * Pruebas de los grupos del mix del piso (ADR-0329; ADR-0328, actividad 12, primera entrega; migración
 * `20261006100000_plan_del_piso_grupos_del_mix.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA.
 *   · LA SIEMBRA. Los 8 grupos con su rol y de qué lado del riel están; las 42 categorías activas entran con la propuesta por
 *     prefijo, TODAS «por revisar» (ninguna confirmada: la decisión es de Felipe); una categoría nueva sale «Sin grupo» y una
 *     desactivada no sale; re-pegar la migración no pisa lo que el líder confirmó ni lo que cambió de grupo.
 *   · LA LECTURA. Pide el MÓDULO «Plan del piso» (20261010171845, ADR-0161): el líder lo ve siempre; una colaboradora o una terminal
 *     leen solo si su rol lo recibe (sin él, 42501 con la pista `plan_piso_sin_modulo`, no cero filas); una cuenta de afuera recibe
 *     42501 aunque se le diera el módulo a algún rol; por la vía de PostgREST funciona y las tablas directo no se leen.
 *   · LA ESCRITURA. Solo el líder, TODO O NADA: confirmar las 42 de una vez (una fila de historial con 42 cambios, firma de la
 *     persona, versión +1), cambiar una de grupo (antes y después en el historial), reenviar lo mismo es `sin_cambios` sin
 *     escribir, una versión vieja da PT409 y NO se guarda ninguna del lote, una categoría sin grupo se fija con versión 0.
 *     Valida lote vacío o enorme, categoría repetida, inexistente o desactivada, grupo inexistente y elementos mal escritos.
 *   · EL ESQUEMA. Ni por fuera de la función: una categoría en dos grupos, un rol inventado, una firma a medias, un vestido en un
 *     grupo de fuera del riel, un cinturón colgando entre los jeans, un grupo que no existe, una versión fijada a mano.
 *   · EL MÓDULO. `plan_piso` existe sin rol (nace solo para el líder), delegable, y no es «solo líder».
 *
 * CÓMO. Mismo patrón que `capacidad_piso.mjs`: cada caso en su transacción con ROLLBACK (la base local la comparten varias
 * sesiones); la terminal y la cuenta de afuera se crean DENTRO del caso. La sesión se simula con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:plan-piso-grupos                 → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:plan-piso-grupos --base otra     → contra otra base del mismo contenedor
 *   … --en-seco                                    → carga la cadena de las tres migraciones del Plan del piso dentro de cada caso (base sin ellas)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261006100000_plan_del_piso_grupos_del_mix.sql"), "utf8");
// Con --en-seco la base no trae el Plan del piso: se cargan las tres migraciones, en orden (la tercera pide las dos primeras).
const CADENA_EN_SECO = ["20261006100000_plan_del_piso_grupos_del_mix.sql", "20261006110000_plan_del_piso_foto_del_espacio.sql", "20261010171845_plan_del_piso_quien_ve_el_modulo.sql"]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Creados en cada caso.
const T_VENTAS_TRU = "33333333-3333-4333-8333-0000000000a1";
const AFUERA = "33333333-3333-4333-8333-0000000000d1"; // cuenta de Auth sin persona, sin colaborador, sin terminal

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Lo que un caso necesita, dentro de su transacción: `pg_temp.intento`, las categorías por prefijo como `:c_<prefijo>`, una terminal
 *  de TRU y una cuenta de afuera. */
const PREFIJOS = ["CMS", "POL", "TOP", "JEA", "PAN", "VES", "CON", "BOD", "CAS", "SUD", "CIN", "MOC", "CAR", "ZFO"];
const PRELUDIO = `
begin;
${EN_SECO ? CADENA_EN_SECO : ""}
set local search_path = retail, public, extensions;
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
-- La escritura con el lote como PARÁMETRO (psql no interpola variables dentro de un texto entre $q$): devuelve el jsonb como texto,
-- o «sqlstate|hint|mensaje». Un error revierte lo que el lote alcanzó a escribir (el bloque es una subtransacción), igual que
-- en producción, donde la función entera es una sola transacción.
create function pg_temp.fi(p_lote jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  return retail.fijar_grupos_de_categorias(p_lote)::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as p_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
${PREFIJOS.map((p) => `select id as c_${p.toLowerCase()} from retail.categorias where prefijo = '${p}' \\gset`).join("\n")}
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS_TRU}', 'authenticated', 'authenticated', 't-ventas-tru@prueba.local'),
  ('${AFUERA}', 'authenticated', 'authenticated', 'afuera@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'tru', 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_TRU}');
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const COMO_POSTGRES = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

let fallas = 0;
let casos = 0;
function registrar(nombre, obtenido, esperado) {
  casos++;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido, esperado);
}

/** Un lote `[{categoria_id, grupo_clave, version}]` armado con las categorías de `:c_<prefijo>`. */
const lote = (...items) =>
  `jsonb_build_array(${items
    .map(([prefijo, grupo, version]) => `jsonb_build_object('categoria_id', :'c_${prefijo.toLowerCase()}', 'grupo_clave', '${grupo}', 'version', ${version})`)
    .join(", ")})`;
/** El lote con TODAS las categorías en el grupo y la versión que la lectura les da hoy («confirmar la propuesta de una vez»). */
const LOTE_TODAS = `(select jsonb_agg(jsonb_build_object('categoria_id', f.categoria_id, 'grupo_clave', f.grupo_clave, 'version', f.version))
                       from retail.fn_categorias_grupo_mix() f where f.grupo_clave is not null)`;
const fijar = (lot) => `select retail.fijar_grupos_de_categorias(${lot})::text;`;
/** El error de la escritura: «sqlstate|hint» (el éxito devuelve el jsonb, que no lleva «|»). */
const intentar = (lot) => `select array_to_string((string_to_array(pg_temp.fi(${lot}), '|'))[1:2], '|');`;
/** El grupo y si está confirmada, de una categoría por su prefijo. */
const estado = (prefijo) => `select coalesce(grupo_clave, 'sin_grupo') || ',' || confirmada || ',' || version from retail.fn_categorias_grupo_mix() where prefijo = '${prefijo}';`;

// ===========================================================================
// 1. LA SIEMBRA
// ===========================================================================

caso(
  "los 8 grupos, con su rol y de qué lado del riel están (6 en el riel, 2 fuera)",
  como(FELIPE) + `select string_agg(clave || ':' || rol || ':' || en_riel, ',' order by orden) from retail.fn_grupos_mix();`,
  "polos_tops_blusas:destino:true,jeans:destino:true,pantalones_faldas_shorts:rutina:true,vestidos_conjuntos:ocasional:true,bodys_corsets_lenceria:ocasional:true,abrigo_y_capas:estacional:true,accesorios_de_impulso:conveniencia:false,bolsos_y_calzado:ocasional:false"
);
caso(
  "las 42 categorías activas entran con su grupo propuesto: ninguna sin grupo, ninguna confirmada (la decisión es de Felipe)",
  como(FELIPE) +
    `select count(*) || ',' || count(*) filter (where confirmada) || ',' || count(*) filter (where grupo_clave is null) from retail.fn_categorias_grupo_mix();
     select string_agg(grupo_clave || '=' || n, ',' order by grupo_clave) from (select grupo_clave, count(*) as n from retail.fn_categorias_grupo_mix() group by 1) t;`,
  "42,0,0\nabrigo_y_capas=6,accesorios_de_impulso=14,bodys_corsets_lenceria=2,bolsos_y_calzado=10,jeans=1,pantalones_faldas_shorts=3,polos_tops_blusas=3,vestidos_conjuntos=3"
);
caso(
  "la propuesta por prefijo: Jeans → jeans, Cinturones → accesorios de impulso, Zapatos formales → bolsos y calzado, Poleras → abrigo y capas",
  como(FELIPE) + ["JEA", "CIN", "ZFO", "SUD"].map(estado).join("\n"),
  "jeans,false,1\naccesorios_de_impulso,false,1\nbolsos_y_calzado,false,1\nabrigo_y_capas,false,1"
);
caso(
  "una categoría NUEVA sale «Sin grupo» (versión 0), una desactivada no sale: la base no inventa un grupo",
  `insert into retail.categorias (nombre, familia, prefijo) values ('Capas de prueba', 'indumentaria', 'XQZ');
   insert into retail.categorias (nombre, familia, prefijo, activo) values ('Apagada de prueba', 'indumentaria', 'XQY', false);\n` +
    como(FELIPE) +
    `select coalesce(grupo_clave, 'sin_grupo') || ',' || version from retail.fn_categorias_grupo_mix() where prefijo = 'XQZ';
     select count(*) from retail.fn_categorias_grupo_mix() where prefijo = 'XQY';`,
  "sin_grupo,0\n0"
);
caso(
  "re-pegar la migración no pisa lo que el líder confirmó, ni lo que cambió de grupo",
  como(FELIPE) +
    fijar(lote(["VES", "vestidos_conjuntos", 1], ["SUD", "polos_tops_blusas", 1])) + "\n" +
    COMO_POSTGRES + MIGRACION + "\n" + como(FELIPE) + estado("VES") + "\n" + estado("SUD"),
  '{"cambiadas": 1, "confirmadas": 1, "sin_cambios": 0}\nvestidos_conjuntos,true,2\npolos_tops_blusas,true,2'
);

// ===========================================================================
// 2. LA LECTURA (la puerta única de retail)
// ===========================================================================

// Desde 20261010171845 las lecturas piden el MÓDULO (ADR-0161), no solo ser de retail. El módulo nace sin ningún rol (caso del final), así
// que quien no es líder solo lee cuando un líder se lo da a su rol: aquí se le da DENTRO del caso (ROLLBACK), como postgres y antes de
// cambiar de rol de base de datos.
const DAR_EL_MODULO = (rol) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('${rol}'), 'plan_piso');\n`;
/** «sqlstate|pista» de lo que pasa al llamar una lectura (vacío después de «|» si el error no trae pista). */
const SIN_PERMISO = (lectura) => `select array_to_string((string_to_array(pg_temp.intento('select * from retail.${lectura}'), '|'))[1:2], '|');`;

caso(
  "el LÍDER lee los grupos y las categorías (el módulo lo ve siempre)",
  como(FELIPE) + `select count(*) from retail.fn_grupos_mix();\nselect count(*) from retail.fn_categorias_grupo_mix();`,
  "8\n42"
);
caso(
  "la COLABORADORA SIN el módulo recibe 42501 «plan_piso_sin_modulo» en las dos lecturas, no cero filas (apagarlo se apaga también en la base)",
  como(MICAELA) + `${SIN_PERMISO("fn_grupos_mix()")}\n${SIN_PERMISO("fn_categorias_grupo_mix()")}`,
  "42501|plan_piso_sin_modulo\n42501|plan_piso_sin_modulo"
);
caso(
  "la COLABORADORA CON el módulo (su rol lo recibe de un líder) lee las dos",
  DAR_EL_MODULO("integrante") + como(MICAELA) + `select count(*) from retail.fn_grupos_mix();\nselect count(*) from retail.fn_categorias_grupo_mix();`,
  "8\n42"
);
caso(
  "una TERMINAL de ventas sin el módulo recibe 42501; con él en su rol lee las dos (ADR-0289: la puerta conoce a las terminales)",
  como(T_VENTAS_TRU) + `${SIN_PERMISO("fn_grupos_mix()")}\n` + DAR_EL_MODULO("terminal_ventas") +
    `select count(*) from retail.fn_grupos_mix();\nselect count(*) from retail.fn_categorias_grupo_mix();`,
  "42501|plan_piso_sin_modulo\n8\n42"
);
caso(
  "una cuenta de AFUERA recibe 42501 en las dos lecturas, no cero filas (no puede parecer «no hay grupos»), aunque se le diera el módulo a algún rol",
  DAR_EL_MODULO("integrante") + como(AFUERA) +
    `${SIN_PERMISO("fn_grupos_mix()")}\n${SIN_PERMISO("fn_categorias_grupo_mix()")}`,
  // Pista VACÍA: paró en la puerta de retail, no en la del módulo (cuya pista es plan_piso_sin_modulo).
  "42501|\n42501|"
);
caso(
  "por la vía de PostgREST (rol authenticated) la colaboradora con el módulo lee y sin él no; las tablas directo, no (ni el líder)",
  DAR_EL_MODULO("integrante") + como(MICAELA) + `set local role authenticated;\nselect count(*) from retail.fn_categorias_grupo_mix();\n` +
    `reset role;\ndelete from retail.rol_modulos where modulo = 'plan_piso';\n` + como(MICAELA) + `set local role authenticated;\n${SIN_PERMISO("fn_categorias_grupo_mix()")}\n` +
    `reset role;\n` + como(FELIPE) + `set local role authenticated;\n` +
    `select split_part(pg_temp.intento('select count(*) from retail.categoria_grupo_mix'), '|', 1);
     select split_part(pg_temp.intento('select count(*) from retail.grupos_mix'), '|', 1);`,
  "42\n42501|plan_piso_sin_modulo\n42501\n42501"
);

// ===========================================================================
// 3. LA ESCRITURA
// ===========================================================================

caso(
  "la COLABORADORA y la TERMINAL no guardan: 42501 «solo del líder» y nada cambia",
  como(MICAELA) + intentar(lote(["VES", "vestidos_conjuntos", 1])) + "\n" + como(T_VENTAS_TRU) + intentar(lote(["VES", "vestidos_conjuntos", 1])) + "\n" +
    COMO_POSTGRES + `select count(*) from retail.categoria_grupo_mix where confirmada_por is not null;`,
  "42501|grupos_mix_solo_lider\n42501|grupos_mix_solo_lider\n0"
);
caso(
  "el LÍDER confirma las 42 de una vez: una sola fila de historial con 42 cambios, la firma de Felipe y la versión sube",
  como(FELIPE) + fijar(LOTE_TODAS) + "\n" + COMO_POSTGRES +
    `select count(*) || ',' || count(*) filter (where confirmada_por = :'p_felipe' and confirmada_en is not null) || ',' || count(*) filter (where version = 2) from retail.categoria_grupo_mix;
     select (count(*) || ',' || max(jsonb_array_length(detalle -> 'cambios')) || ',' || max(hecho_por::text) = (count(*) || ',42,' || :'p_felipe'))::text from retail.configuracion_historial where que = 'grupo_mix';`,
  '{"cambiadas": 0, "confirmadas": 42, "sin_cambios": 0}\n42,42,42\ntrue'
);
caso(
  "cambiar una categoría de grupo deja el antes y el después en el historial",
  como(FELIPE) + fijar(lote(["SUD", "polos_tops_blusas", 1])) + "\n" + COMO_POSTGRES +
    `select (detalle -> 'cambios' -> 0 ->> 'categoria') || ':' || (detalle -> 'cambios' -> 0 ->> 'antes') || '>' || (detalle -> 'cambios' -> 0 ->> 'despues')
       from retail.configuracion_historial where que = 'grupo_mix';`,
  '{"cambiadas": 1, "confirmadas": 0, "sin_cambios": 0}\nPoleras:abrigo_y_capas>polos_tops_blusas'
);
caso(
  "reenviar lo mismo (un reintento tras un corte, con la versión vieja) es «sin cambios»: no escribe ni anota ni da PT409",
  como(FELIPE) + fijar(lote(["SUD", "polos_tops_blusas", 1])) + "\n" + fijar(lote(["SUD", "polos_tops_blusas", 1])) + "\n" + COMO_POSTGRES +
    `select count(*) from retail.configuracion_historial where que = 'grupo_mix';`,
  '{"cambiadas": 1, "confirmadas": 0, "sin_cambios": 0}\n{"cambiadas": 0, "confirmadas": 0, "sin_cambios": 1}\n1'
);
caso(
  "una versión VIEJA con otro grupo da PT409 y dice cómo quedó (otra persona cambió Poleras mientras la pantalla estaba abierta)",
  como(FELIPE) + fijar(lote(["SUD", "polos_tops_blusas", 1])) + "\n" +
    `select split_part(pg_temp.fi(${lote(["SUD", "jeans", 1])}), '|', 2) || '|' || (pg_temp.fi(${lote(["SUD", "jeans", 1])}) ~ 'Polos, tops y blusas');\n` + estado("SUD"),
  '{"cambiadas": 1, "confirmadas": 0, "sin_cambios": 0}\nversion_cambiada|true\npolos_tops_blusas,true,2'
);
caso(
  "TODO O NADA: si la segunda del lote tiene la versión vieja, la primera tampoco se guarda",
  como(FELIPE) + fijar(lote(["SUD", "polos_tops_blusas", 1])) + "\n" +
    `select split_part(pg_temp.fi(${lote(["CAS", "polos_tops_blusas", 1], ["SUD", "abrigo_y_capas", 1])}), '|', 1);\n` +
    estado("CAS"),
  '{"cambiadas": 1, "confirmadas": 0, "sin_cambios": 0}\nPT409\nabrigo_y_capas,false,1'
);
caso(
  "una categoría SIN grupo se fija con versión 0 (queda en versión 1, confirmada); con otra versión, PT409",
  `insert into retail.categorias (nombre, familia, prefijo) values ('Capas de prueba', 'indumentaria', 'XQZ');
   select id as c_xqz from retail.categorias where prefijo = 'XQZ' \\gset\n` +
    como(FELIPE) +
    `select split_part(pg_temp.fi(jsonb_build_array(jsonb_build_object('categoria_id', :'c_xqz', 'grupo_clave', 'abrigo_y_capas', 'version', 1))), '|', 1);
     select retail.fijar_grupos_de_categorias(jsonb_build_array(jsonb_build_object('categoria_id', :'c_xqz', 'grupo_clave', 'abrigo_y_capas', 'version', 0)))::text;\n` +
    estado("XQZ"),
  'PT409\n{"cambiadas": 1, "confirmadas": 0, "sin_cambios": 0}\nabrigo_y_capas,true,1'
);
caso(
  "valida el lote: vacío, nulo, enorme (más de 200), categoría repetida, grupo inexistente",
  como(FELIPE) +
    [
      intentar(`'[]'::jsonb`),
      intentar(`null::jsonb`),
      intentar(`(select jsonb_agg(jsonb_build_object('categoria_id', :'c_ves', 'grupo_clave', 'jeans', 'version', 1)) from generate_series(1, 201))`),
      intentar(lote(["VES", "vestidos_conjuntos", 1], ["VES", "jeans", 1])),
      intentar(lote(["VES", "grupo_que_no_existe", 1])),
    ].join("\n"),
  [
    "22023|grupos_mix_lote_vacio",
    "22023|grupos_mix_lote_vacio",
    "22023|grupos_mix_lote_grande",
    "22023|grupos_mix_categoria_repetida",
    "22023|grupos_mix_grupo_inexistente",
  ].join("\n")
);
caso(
  "valida cada elemento: categoría inexistente, categoría desactivada, id mal escrito, falta la versión",
  `insert into retail.categorias (nombre, familia, prefijo, activo) values ('Apagada de prueba', 'indumentaria', 'XQY', false);
   select id as c_xqy from retail.categorias where prefijo = 'XQY' \\gset\n` +
    como(FELIPE) +
    [
      intentar(`jsonb_build_array(jsonb_build_object('categoria_id', gen_random_uuid(), 'grupo_clave', 'jeans', 'version', 0))`),
      intentar(`jsonb_build_array(jsonb_build_object('categoria_id', :'c_xqy', 'grupo_clave', 'jeans', 'version', 0))`),
      intentar(`jsonb_build_array(jsonb_build_object('categoria_id', 'no-es-un-uuid', 'grupo_clave', 'jeans', 'version', 0))`),
      intentar(`jsonb_build_array(jsonb_build_object('categoria_id', :'c_ves', 'grupo_clave', 'vestidos_conjuntos'))`),
    ].join("\n"),
  [
    "22023|grupos_mix_categoria_inexistente",
    "22023|grupos_mix_categoria_inexistente",
    "22023|grupos_mix_elemento_invalido",
    "22023|grupos_mix_elemento_invalido",
  ].join("\n")
);
caso(
  "un vestido no va a «accesorios», un cinturón no va entre los jeans (23514); una mochila sí va con los accesorios (los dos son de fuera del riel)",
  como(FELIPE) +
    intentar(lote(["VES", "accesorios_de_impulso", 1])) + "\n" +
    intentar(lote(["CIN", "jeans", 1])) + "\n" +
    fijar(lote(["MOC", "accesorios_de_impulso", 1])),
  '23514|grupo_incoherente_con_familia\n23514|grupo_incoherente_con_familia\n{"cambiadas": 1, "confirmadas": 0, "sin_cambios": 0}'
);
caso(
  "por la vía de PostgREST (rol authenticated) el líder guarda; la tabla directo, no",
  como(FELIPE) + `set local role authenticated;\n` + fijar(lote(["VES", "vestidos_conjuntos", 1])) + "\n" +
    `select split_part(pg_temp.intento(format('update retail.categoria_grupo_mix set grupo_clave = %L where categoria_id = %L', 'jeans', :'c_ves')), '|', 1);`,
  '{"cambiadas": 0, "confirmadas": 1, "sin_cambios": 0}\n42501'
);

// ===========================================================================
// 4. EL ESQUEMA (ni siquiera por fuera de la función)
// ===========================================================================

{
  const probar = (sql) => `select rtrim(array_to_string((string_to_array(pg_temp.intento($q$${sql}$q$), '|'))[1:2], '|'), '|');`;
  caso(
    "candados de la tabla: dos grupos para una categoría, grupo inexistente, firma sin fecha, y un vestido o un cinturón del lado equivocado del riel",
    [
      probar(`insert into retail.categoria_grupo_mix (categoria_id, grupo_clave) values ('__CMS__', 'jeans')`),
      probar(`update retail.categoria_grupo_mix set grupo_clave = 'no_existe' where categoria_id = '__CMS__'`),
      probar(`update retail.categoria_grupo_mix set confirmada_por = '__FELIPE__' where categoria_id = '__CMS__'`),
      probar(`update retail.categoria_grupo_mix set grupo_clave = 'accesorios_de_impulso' where categoria_id = '__VES__'`),
      probar(`update retail.categoria_grupo_mix set grupo_clave = 'jeans' where categoria_id = '__CIN__'`),
    ]
      .join("\n")
      .replaceAll("'__CMS__'", "$q$ || quote_literal(:'c_cms') || $q$")
      .replaceAll("'__VES__'", "$q$ || quote_literal(:'c_ves') || $q$")
      .replaceAll("'__CIN__'", "$q$ || quote_literal(:'c_cin') || $q$")
      .replaceAll("'__FELIPE__'", "$q$ || quote_literal(:'p_felipe') || $q$"),
    ["23505", "23503", "23514", "23514|grupo_incoherente_con_familia", "23514|grupo_incoherente_con_familia"].join("\n")
  );
}
caso(
  "candados de los grupos: un rol inventado, una clave con mayúsculas, dos grupos con el mismo orden",
  [
    `select split_part(pg_temp.intento($q$insert into retail.grupos_mix (clave, nombre, rol, en_riel, orden) values ('nuevo', 'Nuevo', 'inventado', true, 99)$q$), '|', 1);`,
    `select split_part(pg_temp.intento($q$insert into retail.grupos_mix (clave, nombre, rol, en_riel, orden) values ('Nuevo', 'Nuevo', 'rutina', true, 99)$q$), '|', 1);`,
    `select split_part(pg_temp.intento($q$insert into retail.grupos_mix (clave, nombre, rol, en_riel, orden) values ('nuevo', 'Nuevo', 'rutina', true, 10)$q$), '|', 1);`,
  ].join("\n"),
  "23514\n23514\n23505"
);
caso(
  "la versión no se fija a mano: cualquier escritura la sube en uno (ADR-0193, fn_subir_version)",
  `update retail.categoria_grupo_mix set version = 99, grupo_clave = 'jeans' where categoria_id = :'c_pan';
   select version from retail.categoria_grupo_mix where categoria_id = :'c_pan';`,
  "2"
);

// ===========================================================================
// 5. EL MÓDULO Y LA MIGRACIÓN
// ===========================================================================

caso(
  "el módulo «Plan del piso» existe, delegable y sin rol (nace solo para el líder, ADR-0161); el líder lo ve y la colaboradora no",
  `select clave || ',' || grupo || ',' || orden || ',' || solo_lider || ',' || delegable || ',' || (select count(*) from retail.rol_modulos where modulo = 'plan_piso')
     from retail.modulos where clave = 'plan_piso';\n` +
    como(FELIPE) + `select retail.fn_ve_modulo('plan_piso')::text;\n` + como(MICAELA) + `select retail.fn_ve_modulo('plan_piso')::text;`,
  "plan_piso,Inventario,118,false,true,0\ntrue\nfalse"
);
caso(
  "la migración se puede pegar dos veces seguidas: mismas tablas, mismas funciones, mismas filas",
  `${MIGRACION}
   select (select count(*) from retail.grupos_mix) || ',' || (select count(*) from retail.categoria_grupo_mix) || ',' ||
          (select count(*) from retail.modulos where clave = 'plan_piso');`,
  "8,42,1"
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas > 0) process.exit(1);

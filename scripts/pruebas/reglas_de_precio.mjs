#!/usr/bin/env node
/**
 * Prueba de las reglas del precio sugerido (`20261124170000_reglas_de_precio_por_rasgos.sql` y la lista de casillas que edita el Admin,
 * `20261124201000_casillas_de_precio_editables.sql`; ADR-0700).
 *
 * QUÉ CUBRE
 *   · la regla vigente es la última fila, y sin cambios se lee la de fábrica (37 % y +3 % cada casilla);
 *   · un Admin la cambia: se agrega UNA fila firmada con su nombre, queda su línea en el historial de Configuración (con antes y después)
 *     y Actividad la cuenta; guardar lo mismo otra vez no agrega nada;
 *   · lo que la base rechaza, con el mismo texto que la pantalla: base fuera de 20–60, una casilla que falta o no es entera, más de 10
 *     puntos y la base con todas las casillas sobre 75 %; y los candados de la tabla, aunque alguien escriba directo;
 *   · solo un Admin escribe: un Líder que no es Admin y una integrante leen la regla pero no la cambian, ni las listas;
 *   · las listas: un tejido y una marca entran y salen, se ven en `fn_listas_de_precio`, cada cambio deja una línea y repetirlo no;
 *     lo que ya no existe lo dice;
 *   · nadie lee ni escribe la tabla directo, y `anon` no llama a las funciones;
 *   · una casilla no se borra ni cambia de código ni de origen, aunque alguien escriba directo;
 *   · la lista de casillas: un Admin agrega una (su código sale del nombre y va al final), la renombra, la apaga (deja de sumar) y la
 *     vuelve a prender; un nombre repetido, uno corto o pasar el tope de 75 % se frenan; nadie más la cambia.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK, con la sesión simulada por `request.jwt.claim.sub` y el rol `authenticated`
 * (la cuenta del ERP, no el dueño: así se ven los permisos de verdad). Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:reglas-de-precio    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin en el seed
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${INTENTO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
/** La cuenta con sesión, como llega desde la web. */
const sesion = (id) => `reset role;
set local request.jwt.claim.sub = '${id}';
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
set local role authenticated;
`;
const dueno = "reset role;\n";
// Devuelve «SIN_ERROR» o «estado|mensaje»: para ver lo que rechaza la base sin cortar la transacción.
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text, v_estado = returned_sqlstate;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated, anon;
`;
// La regla de fábrica como la última fila y las seis casillas en +3 %, prendidas y sin otras: así cada escenario arranca igual aunque
// alguien la haya cambiado a mano en el local.
const CODIGOS = ["nadie_la_tiene", "en_tendencia", "tela_que_se_nota", "detalle_de_diseno", "acabado_y_confeccion", "marca_conocida"];
const FABRICA = `${dueno}insert into retail.reglas_de_precio (margen_base) values (37);
update retail.rasgos_de_precio set puntos = 3, activa = codigo in (${CODIGOS.map((c) => `'${c}'`).join(", ")});\n`;
const LEER = `select (r ->> 'margen_base') || '|' || ${CODIGOS.map((c) => `coalesce(r -> 'puntos' ->> '${c}', '-')`).join(" || ")} from retail.fn_reglas_de_precio() r;`;
const PUNTOS = (...n) => `'${JSON.stringify(Object.fromEntries(CODIGOS.map((c, i) => [c, n[i]])))}'::jsonb`;

let casos = 0;
let fallos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 600)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. La vigente es la última; un Admin la cambia con su firma, su historial y su línea de Actividad; lo mismo otra vez no agrega nada.
{
  const r = correr(`${FABRICA}
${sesion(FELIPE)}
${LEER}
select (retail.guardar_reglas_de_precio(33, ${PUNTOS(4, 5, 2, 1, 0, 0)}) ->> 'margen_base');
${LEER}
${dueno}
select count(*) from retail.reglas_de_precio where registrado_en >= now();
select (select margen_base || '|' || (registrado_por = (select id from public.personas where auth_user_id = '${FELIPE}'))::text
          from retail.reglas_de_precio order by id desc limit 1);
select (detalle #>> '{antes,margen_base}') || '|' || (detalle #>> '{despues,margen_base}') || '|' || (detalle #>> '{despues,puntos,en_tendencia}')
  from retail.configuracion_historial where que = 'reglas_de_precio' order by id desc limit 1;
select count(*) from retail.actividad where accion = 'config_reglas_de_precio' and anotado_at >= now();
${sesion(FELIPE)}
select (retail.guardar_reglas_de_precio(33, ${PUNTOS(4, 5, 2, 1, 0, 0)}) ->> 'margen_base');
${dueno}
select count(*) from retail.reglas_de_precio where registrado_en >= now();`);
  const [antes, devuelto, despues, filas, firma, historial, actividad, otraVez, filasDespues] = lineas(r);
  esperar("sin cambios se lee la de fábrica: 37 % y +3 % cada una de las seis casillas", r.ok && antes === "37|333333", r);
  esperar("un Admin guarda 33 % con 4, 5, 2, 1, 0 y 0 puntos, y la función devuelve la nueva", r.ok && devuelto === "33", r);
  esperar("la vigente pasa a ser la nueva", r.ok && despues === "33|452100", r);
  esperar("se agregó una fila (la de fábrica y la nueva)", r.ok && filas === "2", r);
  esperar("firmada por quien la cambió", r.ok && firma === "33|true", r);
  esperar("el historial de Configuración guarda antes y después", r.ok && historial === "37|33|5", r);
  esperar("Actividad la cuenta", r.ok && actividad === "1", r);
  esperar("guardar lo mismo otra vez devuelve la vigente", r.ok && otraVez === "33", r);
  esperar("y no agrega otra fila", r.ok && filasDespues === "2", r);
}

// 2. Lo que la base rechaza, con el texto que ve la pantalla.
{
  const g = (base, puntos) => `select pg_temp.intento($q$select retail.guardar_reglas_de_precio(${base}, ${puntos})$q$);`;
  const r = correr(`${FABRICA}
${sesion(FELIPE)}
${g(19, PUNTOS(3, 3, 3, 3, 3, 3))}
${g(61, PUNTOS(3, 3, 3, 3, 3, 3))}
${g(36, `'{"nadie_la_tiene": 3, "en_tendencia": 3, "tela_que_se_nota": 3}'::jsonb`)}
${g(36, PUNTOS(3, 2.5, 3, 3, 3, 3))}
${g(36, PUNTOS(3, -1, 3, 3, 3, 3))}
${g(36, PUNTOS(11, 3, 3, 3, 3, 3))}
${g(60, PUNTOS(3, 3, 3, 3, 3, 1))}
${g(60, PUNTOS(3, 3, 3, 3, 3, 0))}
${g(36, `'{"nadie_la_tiene": 3, "en_tendencia": 3, "tela_que_se_nota": 3, "detalle_de_diseno": 3, "acabado_y_confeccion": 3, "marca_conocida": 3, "inventada": 3}'::jsonb`)}`);
  const [b19, b61, falta, mitad, negativo, once, sobreTope, enTope, inventada] = lineas(r);
  esperar("base 19 %: «va de 20 a 60 %»", r.ok && b19 === "P0001|El margen base va de 20 a 60 %.", r);
  esperar("base 61 %: lo mismo", r.ok && b61 === "P0001|El margen base va de 20 a 60 %.", r);
  esperar("una casilla que falta no vale 0 en silencio", r.ok && falta === "P0001|Falta el % de alguna casilla.", r);
  esperar("ni medio punto", r.ok && mitad === "P0001|Falta el % de alguna casilla.", r);
  esperar("ni un punto negativo", r.ok && negativo === "P0001|Falta el % de alguna casilla.", r);
  esperar("más de 10 %: «de 0 a 10 %»", r.ok && once === "P0001|Cada casilla suma de 0 a 10 %.", r);
  esperar("60 % con 16 puntos pasa de 75 %", r.ok && sobreTope === "P0001|La base con todas las casillas no puede pasar de 75 %.", r);
  esperar("60 % con 15 puntos, justo 75 %, sí se guarda", r.ok && enTope === "SIN_ERROR", r);
  esperar("una casilla que no está en la lista no se guarda", r.ok && inventada === "P0001|Falta el % de alguna casilla.", r);
}

// 3. Los candados de la tabla valen aunque alguien escriba directo como dueño.
{
  const ins = (b, a, c, d, e) =>
    `select pg_temp.intento($q$insert into retail.reglas_de_precio (margen_base, puntos_nadie_la_tiene, puntos_en_tendencia, puntos_tela_que_se_nota, puntos_marca_conocida) values (${b}, ${a}, ${c}, ${d}, ${e})$q$);`;
  const r = correr(`${dueno}
${ins(61, 3, 3, 3, 3)}
${ins(36, -1, 3, 3, 3)}
${ins(60, 4, 4, 4, 4)}
select pg_temp.intento($q$update retail.rasgos_de_precio set puntos = 11 where codigo = 'nadie_la_tiene'$q$);
select pg_temp.intento($q$insert into retail.rasgos_de_precio (codigo, nombre, puntos, origen, orden) values ('otra', 'Otra', 2, 'otro', 99)$q$);
select pg_temp.intento($q$insert into retail.rasgos_de_precio (codigo, nombre, puntos, origen, orden) values ('otra_tela', 'Otra tela', 2, 'por_tejido', 99)$q$);
select pg_temp.intento($q$insert into retail.rasgos_de_precio (codigo, nombre, puntos, origen, orden) values ('Con Mayúscula', 'Con mayúscula', 2, 'a_mano', 99)$q$);
select pg_temp.intento($q$update retail.rasgos_de_precio set origen = 'por_tejido' where codigo = 'nadie_la_tiene'$q$);
select pg_temp.intento($q$update retail.rasgos_de_precio set codigo = 'nadie_lo_tiene' where codigo = 'nadie_la_tiene'$q$);
select pg_temp.intento($q$delete from retail.rasgos_de_precio where codigo = 'nadie_la_tiene'$q$);
select pg_temp.intento($q$update retail.rasgos_de_precio set nombre = 'Nadie más la tiene' where codigo = 'nadie_la_tiene'$q$);`);
  const [base, puntos, tope, cPuntos, cOrigen, cDosTejidos, cCodigo, cambiaOrigen, cambiaCodigo, borra, renombra] = lineas(r);
  esperar("candado de la base", r.ok && base.startsWith("23514|") && base.includes("reglas_de_precio_base"), r);
  esperar("candado de los puntos", r.ok && puntos.startsWith("23514|") && puntos.includes("reglas_de_precio_puntos"), r);
  esperar("candado del tope de 75 %", r.ok && tope.startsWith("23514|") && tope.includes("reglas_de_precio_tope"), r);
  esperar("una casilla suma de 0 a 10, también directo", r.ok && cPuntos.startsWith("23514|") && cPuntos.includes("rasgos_de_precio_puntos"), r);
  esperar("su origen es uno de los tres", r.ok && cOrigen.startsWith("23514|") && cOrigen.includes("rasgos_de_precio_origen"), r);
  esperar("una sola casilla sale de la lista de tejidos", r.ok && cDosTejidos.startsWith("23505|"), r);
  esperar("el código es en minúsculas y sin espacios", r.ok && cCodigo.startsWith("23514|") && cCodigo.includes("rasgos_de_precio_codigo"), r);
  const fija = "23514|El código y el origen de una casilla no cambian: apágala y crea otra.";
  esperar("una casilla no cambia de origen (las prendas guardan su código)", r.ok && cambiaOrigen === fija, r);
  esperar("ni de código", r.ok && cambiaCodigo === fija, r);
  esperar("ni se borra: se apaga", r.ok && borra === "23514|Una casilla no se borra: se apaga.", r);
  esperar("su nombre sí cambia", r.ok && renombra === "SIN_ERROR", r);
}

// 4. Solo un Admin escribe: un Líder que no es Admin y una integrante leen la regla, pero no la cambian.
{
  const intentos = `select pg_temp.intento($q$select retail.guardar_reglas_de_precio(33, ${PUNTOS(3, 3, 3, 3, 3, 3)})$q$);
select pg_temp.intento($q$select retail.guardar_casilla_de_precio(null, 'Hecho a mano', null, 2, true)$q$);
select pg_temp.intento($q$select retail.marcar_tejido_que_se_nota((select id from retail.tejidos limit 1), true)$q$);
select pg_temp.intento($q$select retail.marcar_marca_conocida((select id from retail.marcas limit 1), true)$q$);`;
  const r = correr(`${FABRICA}
update public.personas set rol = 'integrante' where auth_user_id = '${FELIPE}';
${sesion(FELIPE)}
select retail.fn_es_lider()::text || '|' || retail.fn_es_admin()::text;
${LEER}
select jsonb_typeof(retail.fn_listas_de_precio() -> 'tejidos');
${intentos}
${sesion(MICAELA)}
${LEER}
${intentos}`);
  const [perfil, leeLider, listasLider, g1, c1, t1, m1, leeMicaela, g2, c2, t2, m2] = lineas(r);
  esperar("(preparación) la cuenta es Líder y no Admin", r.ok && perfil === "true|false", r);
  esperar("el Líder lee la regla", r.ok && leeLider === "37|333333", r);
  esperar("y las listas (tiene Configuración)", r.ok && listasLider === "array", r);
  esperar("pero no cambia la regla", r.ok && g1 === "42501|Solo un Admin cambia las reglas del precio.", r);
  esperar("ni agrega una casilla", r.ok && c1 === "42501|Solo un Admin cambia las casillas del precio.", r);
  esperar("ni los tejidos", r.ok && t1 === "42501|Solo un Admin cambia la lista de tejidos que se notan.", r);
  esperar("ni las marcas", r.ok && m1 === "42501|Solo un Admin cambia la lista de marcas que el cliente conoce.", r);
  esperar("una integrante lee la regla (la necesita para fijar un precio)", r.ok && leeMicaela === "37|333333", r);
  esperar("y no cambia nada", r.ok && [g2, c2, t2, m2].every((x) => x?.startsWith("42501|Solo un Admin")), r);
}

// 5. Las listas: entran, salen, se ven, dejan su línea una vez; lo que ya no existe lo dice.
{
  // Arranca con los dos fuera de la lista, aunque alguien los haya marcado a mano en el local.
  const r = correr(`${dueno}
select set_config('prueba.tejido', (select id::text from retail.tejidos where activo and estado = 'aprobado' order by nombre limit 1), true);
select set_config('prueba.marca', (select id::text from retail.marcas where activo and char_length(nombre) <= 80 order by nombre limit 1), true);
update retail.tejidos set se_nota = false where id = current_setting('prueba.tejido')::uuid;
update retail.marcas set conocida = false where id = current_setting('prueba.marca')::uuid;
${sesion(FELIPE)}
select retail.marcar_tejido_que_se_nota(current_setting('prueba.tejido')::uuid, true);
select retail.marcar_tejido_que_se_nota(current_setting('prueba.tejido')::uuid, true);
select retail.marcar_marca_conocida(current_setting('prueba.marca')::uuid, true);
select (select e ->> 'marcado' from jsonb_array_elements(retail.fn_listas_de_precio() -> 'tejidos') e where e ->> 'id' = current_setting('prueba.tejido'))
  || '|' || (select e ->> 'marcado' from jsonb_array_elements(retail.fn_listas_de_precio() -> 'marcas') e where e ->> 'id' = current_setting('prueba.marca'));
select retail.marcar_tejido_que_se_nota(current_setting('prueba.tejido')::uuid, false);
select (select e ->> 'marcado' from jsonb_array_elements(retail.fn_listas_de_precio() -> 'tejidos') e where e ->> 'id' = current_setting('prueba.tejido'));
select pg_temp.intento($q$select retail.marcar_tejido_que_se_nota('00000000-0000-4000-8000-000000000000', true)$q$);
select pg_temp.intento($q$select retail.marcar_marca_conocida('00000000-0000-4000-8000-000000000000', true)$q$);
${dueno}
select count(*) filter (where que = 'tejido_que_se_nota') || '|' || count(*) filter (where que = 'marca_conocida')
  from retail.configuracion_historial where hecho_en >= now();
select (select se_nota::text from retail.tejidos where id = current_setting('prueba.tejido')::uuid) || '|'
    || (select conocida::text from retail.marcas where id = current_setting('prueba.marca')::uuid);`);
  const salida = lineas(r).filter((l) => l !== "" && !/^[0-9a-f-]{36}$/.test(l));
  const [marcados, desmarcado, tejidoNo, marcaNo, historial, quedo] = salida;
  esperar("el tejido y la marca entran a sus listas y se ven", r.ok && marcados === "true|true", r);
  esperar("el tejido sale de la lista", r.ok && desmarcado === "false", r);
  esperar("un tejido que ya no existe lo dice", r.ok && tejidoNo === "P0001|Ese tejido ya no existe.", r);
  esperar("una marca que ya no existe lo dice", r.ok && marcaNo === "P0001|Esa marca ya no existe.", r);
  esperar("cada cambio deja UNA línea (el tejido entra y sale: 2; repetir no suma)", r.ok && historial === "2|1", r);
  esperar("y la base quedó como lo último que se pidió", r.ok && quedo === "false|true", r);
}

// 6. Nadie toca la tabla directo, y anon no llama a las funciones.
{
  const r = correr(`${sesion(FELIPE)}
select pg_temp.intento($q$select count(*) from retail.reglas_de_precio$q$);
select pg_temp.intento($q$insert into retail.reglas_de_precio (margen_base, puntos_nadie_la_tiene, puntos_en_tendencia, puntos_tela_que_se_nota, puntos_marca_conocida) values (36, 3, 3, 3, 3)$q$);
reset role;
set local role anon;
select pg_temp.intento($q$select retail.fn_reglas_de_precio()$q$);
select pg_temp.intento($q$select retail.guardar_reglas_de_precio(36, '{}'::jsonb)$q$);
select pg_temp.intento($q$select retail.guardar_casilla_de_precio(null, 'Hecho a mano', null, 2, true)$q$);
${sesion(FELIPE)}
select pg_temp.intento($q$select count(*) from retail.rasgos_de_precio$q$);`);
  const [lee, escribe, anonLee, anonEscribe, anonCasilla, leeCasillas] = lineas(r);
  esperar("una cuenta no lee la tabla directo", r.ok && lee.startsWith("42501|"), r);
  esperar("ni escribe en ella directo", r.ok && escribe.startsWith("42501|"), r);
  esperar("anon no lee la regla", r.ok && anonLee.startsWith("42501|"), r);
  esperar("ni la cambia", r.ok && anonEscribe.startsWith("42501|"), r);
  esperar("ni agrega casillas", r.ok && anonCasilla.startsWith("42501|"), r);
  esperar("una cuenta no lee la lista de casillas directo", r.ok && leeCasillas.startsWith("42501|"), r);
}

// 7. La lista de casillas: agregar, renombrar, apagar y volver a prender; lo que se frena.
{
  const casilla = (codigo, nombre, puntos, activa, ayuda = "null") =>
    `select pg_temp.intento($q$select retail.guardar_casilla_de_precio(${codigo}, ${nombre}, ${ayuda}, ${puntos}, ${activa})$q$);`;
  const CASILLAS = `select string_agg((c ->> 'codigo') || ':' || (c ->> 'puntos'), ',' order by (c ->> 'orden')::int) from jsonb_array_elements(retail.fn_reglas_de_precio() -> 'casillas') c;`;
  // Base 55 % + seis casillas de 3 = 73 %: «Hecho a mano» con 2 llega justo a 75 %, y una más de 9 lo pasa.
  const r = correr(`${FABRICA}
insert into retail.reglas_de_precio (margen_base) values (55);
${sesion(FELIPE)}
${casilla("null", "'  Hecho   a mano '", 2, true, "'Lo cosieron a mano.'")}
${CASILLAS}
${casilla("'hecho_a_mano'", "'Hecho a mano en Perú'", 2, true)}
select c ->> 'nombre' from jsonb_array_elements(retail.fn_reglas_de_precio() -> 'casillas') c where c ->> 'codigo' = 'hecho_a_mano';
${casilla("'en_tendencia'", "'En tendencia'", 3, false)}
${CASILLAS}
select (retail.fn_reglas_de_precio() -> 'puntos') ? 'en_tendencia';
select string_agg(c ->> 'codigo', ',') from jsonb_array_elements(retail.fn_reglas_de_precio() -> 'apagadas') c;
${casilla("'en_tendencia'", "'En tendencia'", 3, true)}
${casilla("null", "'en tendencia'", 2, true)}
${casilla("null", "'A'", 2, true)}
${casilla("null", "'Otra más'", 11, true)}
${casilla("null", "'Para una ocasión'", 9, true)}
${casilla("'ya_no_existe'", "'Algo'", 2, true)}
${dueno}
select count(*) from retail.configuracion_historial where que = 'casilla_de_precio' and hecho_en >= now();`);
  const [nueva, lista, renombra, nombre, apaga, sinTendencia, sinPuntos, apagadas, prende, repetida, corta, once, tope, noExiste, historial] = lineas(r);
  esperar("un Admin agrega «Hecho a mano»", r.ok && nueva === "SIN_ERROR", r);
  esperar("su código sale del nombre y va al final de la lista, con sus puntos",
    r.ok && lista === "nadie_la_tiene:3,en_tendencia:3,tela_que_se_nota:3,detalle_de_diseno:3,acabado_y_confeccion:3,marca_conocida:3,hecho_a_mano:2", r);
  esperar("la renombra", r.ok && renombra === "SIN_ERROR" && nombre === "Hecho a mano en Perú", r);
  esperar("apagar «En tendencia» la saca de la lista", r.ok && apaga === "SIN_ERROR" && !sinTendencia.includes("en_tendencia"), r);
  esperar("y deja de sumar", r.ok && sinPuntos === "f", r);
  esperar("y pasa a la lista de apagadas (para volver a prenderla)", r.ok && apagadas === "en_tendencia", r);
  esperar("y se vuelve a prender", r.ok && prende === "SIN_ERROR", r);
  esperar("un nombre que ya está (sin mirar mayúsculas) se frena", r.ok && repetida === "P0001|Ya hay una casilla «en tendencia».", r);
  esperar("un nombre de una letra se frena", r.ok && corta === "P0001|El nombre de la casilla va de 2 a 40 letras.", r);
  esperar("más de 10 % se frena", r.ok && once === "P0001|Cada casilla suma de 0 a 10 %.", r);
  esperar("pasar de 75 % con todas se frena", r.ok && tope === "P0001|La base con todas las casillas no puede pasar de 75 %.", r);
  esperar("una casilla que no existe lo dice", r.ok && noExiste === "P0001|Esa casilla ya no existe. Recarga la pantalla.", r);
  esperar("cada cambio deja su línea en el historial", r.ok && historial === "4", r);
}

console.log(`\n${casos - fallos} de ${casos} casos bien.`);
if (fallos > 0) process.exit(1);

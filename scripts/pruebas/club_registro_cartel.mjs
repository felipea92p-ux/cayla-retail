#!/usr/bin/env node
/**
 * Pruebas de la tanda 1g del club de clientas: ella se une sola desde el cartel (ADR-0288, «Actualización 2026-10-01 (g)»
 * y su contrato; migraciones `20261001210000…210700_club_paso1g_*`).
 *
 * EL PROBLEMA. La página pública del cartel no tiene sesión: el servidor de la web llama a la base con la llave de servicio,
 * sin `auth.uid()` ni responsable. La base tiene que guardar la prueba del consentimiento (texto, versión y hora: Ley 29733),
 * no dejar que nadie más llame esas funciones, frenar el abuso del cartel, reemplazar los datos de quien ya existe sin
 * moverle la antigüedad (G-4), y anonimizar sola una ficha a los 3 años sin compras (G-15).
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; las funciones del servidor, como `service_role`):
 *   a. Registro nuevo con DNI: la ficha completa (nombre del padrón, celular normalizado, nacimiento, correo en minúsculas,
 *      `registro_origen = cartel`, la tienda del cartel, sin `created_por`), socia con código, el permiso del club por
 *      `pagina_cartel` citando los términos (la nota, la privacidad) y el de publicidad citando la casilla, sin persona; la
 *      actividad sin datos suyos. Sin la casilla: socia SIN publicidad.
 *   b. Registro de quien ya existe: reemplaza nombre (del padrón), celular, nacimiento y correo (uno vacío no borra); conserva
 *      `club_desde` y su código si ya era socia (G-4); `registro_origen` no cambia; con carné, el nombre de la ficha no se pisa.
 *   c. Menor de 18 (por la fecha, a la de Lima) → `club_menor`; las casillas obligatorias; datos inválidos con su campo.
 *   d. Las versiones de los textos: las vigentes pasan; otra → `club_texto_cambio`; la casilla solo si marcó la publicidad.
 *   e. Celular nuevo: quita la publicidad del número de antes (revoca por `pagina_cartel`) y, si marcó, la vuelve a dar para el
 *      nuevo; sin marcar con el mismo número, no toca nada.
 *   f. Una ficha archivada → `club_documento_archivado` (no la reactiva); una anonimizada nunca se reusa (ficha nueva).
 *   g. Los límites del cartel (`club_intento`): consultas por ip; registros por ip, celular y documento.
 *   h. Quién puede llamar: anon y authenticated NO ejecutan las funciones del servidor; service_role sí; la página sí es anon;
 *      las tablas nuevas sin acceso para la API; el retiro de las funciones del camino A y B.
 *   i. fn_club_pagina y fn_club_textos_legales: los textos v1 EXACTOS de docs/club/texto-legal-registro-v1.md, su versión y
 *      fecha, la escala y el umbral; null fuera de una tienda.
 *   j. guardar_beneficios_club: solo el líder, sus rangos, la escala que no baja, la versión nueva de los términos con los
 *      números nuevos, su rastro, y nada si no cambió nada.
 *   k. La conservación: 3 años sin compras → anonimizada con la rutina de archivar_clienta (revoca sin persona y con nota,
 *      sin correo, los avisos sin teléfono ni texto); con una compra reciente o recién unida, no; el celular de los intentos
 *      viejos se vacía.
 *   l. Estructura: md5 «después» = vivas; pegar las ocho partes otra vez deja todo igual; con registrar_venta cambiada en vivo
 *      la PARTE 8 aborta sin pisar; sin la PARTE 7, también; sin `select … into` en un texto entre comillas, sin
 *      `drop trigger` ni políticas, y cada parte de `alter` toca una sola tabla en uso.
 *
 * USO
 *   pnpm pruebas:club-registro-cartel                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-registro-cartel --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const leer = (...partes) => readFileSync(join(RAIZ, ...partes), "utf8");

const ARCHIVOS = [
  "20261001210000_club_paso1g_parte1_clientas.sql",
  "20261001210100_club_paso1g_parte2_configuracion.sql",
  "20261001210200_club_paso1g_parte3_canjes.sql",
  "20261001210300_club_paso1g_parte4_textos.sql",
  "20261001210400_club_paso1g_parte5_permisos.sql",
  "20261001210500_club_paso1g_parte6_modulo_avisos.sql",
  "20261001210600_club_paso1g_parte7_tablas.sql",
  "20261001210700_club_paso1g_parte8_funciones.sql",
];
const PARTES = ARCHIVOS.map((n) => leer("supabase", "migrations", n));
const PARTE8 = PARTES[7];
const VERSIONES = [...PARTE8.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+(null|'([0-9a-f]{32})')\)/g)].map((m) => ({
  firma: m[1],
  antes: m[3] ?? null,
  despues: m[5] ?? null,
}));
if (VERSIONES.length < 20) {
  console.error(`✗ La tabla de versiones de la PARTE 8 debería tener más de 20 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const RV_HOY = "retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean,boolean)";
const REGISTRARSE = "retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)";

// Los textos aprobados (docs/club/texto-legal-registro-v1.md), como los sembró la PARTE 4: el cuerpo de cada sección.
const DOC = leer("docs", "club", "texto-legal-registro-v1.md");
const seccion = (desde) => {
  const a = DOC.indexOf(desde);
  return DOC.slice(a, DOC.indexOf("\n---\n", a)).trim();
};
const TEXTO_PRIVACIDAD = seccion("### 2.1 Quién es responsable");
const TEXTO_TERMINOS = seccion("1. **Quién puede ser socia:**");
const TEXTO_CASILLA =
  "Acepto que CAYLA S.A.C. me envíe por WhatsApp, al número que registro, novedades, promociones y avisos de mis cupones, elegidos según mis compras y mi talla. Puedo dejar de recibirlos cuando quiera escribiendo BAJA al WhatsApp de cualquier tienda CAYLA.";
// El documento escribe {código}; el marcador del sistema va sin tilde.
const TEXTO_SALUDO =
  "Hola CAYLA, soy {nombre}. Me acabo de unir al Club CAYLA ({codigo}) y quiero recibir sus novedades y promociones por este WhatsApp. Sé que me doy de baja escribiendo BAJA.";
// La casilla y el saludo, como están en el documento (con sus saltos de línea y el «> » de la cita): los mismos textos.
const DOC_PLANO = DOC.replace(/\n>\s*/g, "\n").replace(/\s+/g, " ");
if (
  !TEXTO_PRIVACIDAD.startsWith("### 2.1") ||
  !TEXTO_TERMINOS.includes("{escala}") ||
  !DOC_PLANO.includes(TEXTO_CASILLA) ||
  !DOC_PLANO.includes(TEXTO_SALUDO.replace("{codigo}", "{código}"))
) {
  console.error("✗ No encontré las secciones del texto legal en docs/club/texto-legal-registro-v1.md.");
  process.exit(1);
}

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- «SQLSTATE|hint» (o «SQLSTATE|mensaje» si el hint no es nuestro) o SIN_ERROR; con el detalle: «hint:detalle».
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_det text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_det = pg_exception_detail;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint || coalesce(':' || nullif(v_det, ''), '') else v_msg end;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated, anon, service_role;
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select retail.fn_hoy_lima() as hoy, (retail.fn_hoy_lima() - interval '18 years')::date as nac18,
       (retail.fn_hoy_lima() - interval '18 years')::date + 1 as nac18m1, retail.fn_hoy_lima() + 1 as manana \\gset
`;
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const comoAnon = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claim.role = 'anon';\nset local request.jwt.claims = '{"role":"anon"}';\nset local role anon;\n`;
/** El servidor de la web: la llave de servicio, sin sesión (sin sub). */
const comoServidor = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claim.role = 'service_role';\nset local request.jwt.claims = '{"role":"service_role"}';\nset local role service_role;\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;
const lit = (v) => (v === null ? "null" : `'${v}'`);
const V1 = `'{"terminos": 1, "privacidad": 1, "casilla_publicidad": 1}'::jsonb`;

/** Los argumentos de registrarse_en_el_club (los de una registración que pasa, cambiando lo que pida el caso). */
const args = ({
  ubic = ":'ubic'",
  tipo = "dni",
  numero,
  nombre = "LUCIA PEREZ SALAS",
  cel = "987 654 321",
  nac = "1990-05-12",
  correo = null,
  mayor = true,
  terminos = true,
  pub = true,
  versiones = V1,
  padron = true,
}) =>
  `${ubic}, '${tipo}', ${lit(numero)}, ${lit(nombre)}, ${lit(cel)}, ${nac === null ? "null" : nac.startsWith(":") ? nac : `'${nac}'`}::date, ${lit(correo)}, ${mayor}, ${terminos}, ${pub}, ${versiones}, ${padron}`;
/** Registrarse (la cuenta ya elegida: el servidor). Deja :<alias>, :<alias>_codigo, :<alias>_desde, :<alias>_era, :<alias>_corto. */
const REGISTRAR = (alias, a) =>
  `select clienta_id as ${alias}, codigo_club as ${alias}_codigo, club_desde as ${alias}_desde, era_socia as ${alias}_era, nombre_corto as ${alias}_corto
  from retail.registrarse_en_el_club(${args(a)}) \\gset\n`;
const INTENTO_REG = (a) => `select pg_temp.intento(format($q$select * from retail.registrarse_en_el_club(${args(a).replace(/:'([a-z0-9_]+)'/g, "%L")})$q$${[...args(a).matchAll(/:'([a-z0-9_]+)'/g)].map((m) => `, :'${m[1]}'`).join("")}));\n`;
const EVENTOS = (alias) =>
  `select string_agg(finalidad || ':' || accion || ':' || medio || ':' || coalesce(texto_tipo || ' v' || texto_version, '-') || ':' || (registrado_por is null) || ':' || coalesce(nota, '-'), ' · ' order by created_at, finalidad, accion)
  from retail.club_permisos where clienta_id = :'${alias}';\n`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

let fallas = 0;
let casos = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${String(esperadoTexto).split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperadoCaso) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperadoCaso === "function" ? esperadoCaso(obtenido) : obtenido === esperadoCaso;
  registrar(nombre, bien, obtenido, typeof esperadoCaso === "function" ? "(condición)" : esperadoCaso);
}
function chequeo(nombre, obtenido, esperado) {
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}

// =====================================================================================================================
// a. Registro nuevo
// =====================================================================================================================
caso(
  "(a) DNI nuevo con la casilla de WhatsApp: devuelve su id, código C-####, socia desde ahora, era_socia = f y su nombre de pila; la ficha con el nombre del padrón, el celular normalizado, la fecha de nacimiento, el correo en minúsculas, registro_origen = cartel, la tienda del cartel y sin created_por",
  comoServidor +
    REGISTRAR("f", { numero: "90881001", correo: " Lucia.Perez@Correo.PE " }) +
    `select :'f_codigo' ~ '^C-[0-9]{4,}$', :'f_desde'::timestamptz = now(), :'f_era', :'f_corto';
reset role;
select nombre, telefono_whatsapp, cumple_dia || '/' || cumple_mes || '/' || cumple_anio, correo, registro_origen, club_ubicacion_id = :'ubic',
       created_por is null, codigo_club = :'f_codigo', publicidad_desde = now(), documento_tipo
  from retail.clientas where id = :'f';
`,
  "t|t|f|Lucia\nLUCIA PEREZ SALAS|987654321|12/5/1990|lucia.perez@correo.pe|cartel|t|t|t|t|dni"
);
caso(
  "(a) …y la historia: el club por pagina_cartel citando los términos v1 (la nota: la privacidad v1) y la publicidad citando la casilla v1, los dos SIN registrado_por y con la tienda; la actividad «registro_cartel» sin persona y sin datos suyos",
  comoServidor + REGISTRAR("f", { numero: "90881002", nombre: "MARIA LOPEZ RUIZ", cel: "966881002" }) +
    `reset role;\n` + EVENTOS("f") +
    `select count(*) filter (where ubicacion_id = :'ubic') from retail.club_permisos where clienta_id = :'f';
select a.modulo, a.accion, a.persona_id is null, a.ubicacion_id = :'ubic', a.detalle ->> 'nueva', a.detalle ->> 'publicidad',
       (a.descripcion || a.detalle::text) !~* '(maria|lopez|90881002|966881002)'
  from retail.actividad a where a.accion = 'registro_cartel' and a.registro_id = :'f';
`,
  "club:otorga:pagina_cartel:terminos v1:true:aceptó también la privacidad v1 · publicidad_whatsapp:otorga:pagina_cartel:casilla_publicidad v1:true:-\n2\nclientas|registro_cartel|t|t|true|true|t"
);
caso(
  "(a) sin la casilla de WhatsApp (G-12): socia con sus beneficios y SIN publicidad; un solo evento (el del club)",
  comoServidor + REGISTRAR("f", { numero: "90881003", cel: "966881003", pub: false, versiones: `'{"terminos": 1, "privacidad": 1}'::jsonb` }) +
    `reset role;
select club_desde is not null, publicidad_desde is null, codigo_club is not null from retail.clientas where id = :'f';
` + EVENTOS("f"),
  "t|t|t\nclub:otorga:pagina_cartel:terminos v1:true:aceptó también la privacidad v1"
);

// =====================================================================================================================
// b. Quien ya existe
// =====================================================================================================================
caso(
  "(b) ya existía (la registró la caja, sin club): reemplaza nombre (del padrón), celular, nacimiento y correo; se vuelve socia desde ahora (era_socia = f); registro_origen sigue «caja»",
  como(FELIPE) +
    `select retail.registrar_clienta(p_documento_tipo => 'dni', p_documento_numero => '90882001', p_nombre => 'Lu Perez', p_telefono_whatsapp => '966882001', p_cumple_dia => 1::smallint, p_cumple_mes => 1::smallint) as c \\gset
` + comoServidor + REGISTRAR("f", { numero: "90882001", cel: "966882099", correo: "nuevo@correo.pe" }) +
    `select :'f' = :'c', :'f_era';
reset role;
select nombre, telefono_whatsapp, cumple_dia || '/' || cumple_mes || '/' || cumple_anio, correo, registro_origen, club_desde = now()
  from retail.clientas where id = :'c';
`,
  "t|f\nLUCIA PEREZ SALAS|966882099|12/5/1990|nuevo@correo.pe|caja|t"
);
caso(
  "(b) G-4: ya era socia (de antes, con su código): conserva club_desde y codigo_club, era_socia = t; un correo vacío no borra el que tenía; la fecha de nacimiento sí se reemplaza; y queda otro evento del club (lo que aceptó hoy)",
  comoServidor + REGISTRAR("f", { numero: "90882011", cel: "966882011", correo: "primero@correo.pe" }) +
    `reset role;\nupdate retail.clientas set club_desde = now() - interval '200 days' where id = :'f';\n` +
    comoServidor + REGISTRAR("g", { numero: "90882011", cel: "966882011", nac: "1991-06-13", correo: "" }) +
    `select :'g' = :'f', :'g_codigo' = :'f_codigo', :'g_desde'::timestamptz = now() - interval '200 days', :'g_era';
reset role;
select correo, cumple_dia || '/' || cumple_mes || '/' || cumple_anio, club_desde = now() - interval '200 days' from retail.clientas where id = :'f';
select count(*) from retail.club_permisos where clienta_id = :'f' and finalidad = 'club';
`,
  "t|t|t|t\nprimero@correo.pe|13/6/1991|t\n2"
);
caso(
  "(b) carné de extranjería: el nombre lo escribe ella (sin padrón); sobre una ficha que ya tenía nombre NO lo pisa; sobre una sin nombre, lo completa",
  como(FELIPE) +
    `select retail.registrar_clienta(p_documento_tipo => 'carne_extranjeria', p_documento_numero => 'CE123456', p_nombre => 'Ana Torres') as a \\gset
reset role;
insert into retail.clientas (documento_tipo, documento_numero) values ('pasaporte', 'PA987654') returning id as b \\gset
` + comoServidor +
    REGISTRAR("fa", { tipo: "carne_extranjeria", numero: "ce 123456", nombre: "Otra Persona", cel: "966882021", padron: false }) +
    REGISTRAR("fb", { tipo: "pasaporte", numero: "PA987654", nombre: "Beatriz Gomez", cel: "966882022", padron: false }) +
    `reset role;
select string_agg(nombre || ':' || documento_numero, ' · ' order by documento_tipo) from retail.clientas where id in (:'a', :'b');
select :'fa' = :'a', :'fb' = :'b', :'fa_corto', :'fb_corto';
`,
  "Ana Torres:CE123456 · Beatriz Gomez:PA987654\nt|t|Ana|Beatriz"
);

// =====================================================================================================================
// c. Menor de edad, casillas y datos inválidos
// =====================================================================================================================
caso(
  "(c) 18 años: cumple hoy (a la fecha de Lima) → pasa; le falta un día → club_menor y no queda ficha",
  comoServidor +
    REGISTRAR("f", { numero: "90883001", cel: "966883001", nac: ":'nac18'" }) +
    INTENTO_REG({ numero: "90883002", cel: "966883002", nac: ":'nac18m1'" }) +
    `reset role;\nselect :'f' is not null, (select count(*) from retail.clientas where documento_numero = '90883002');\n`,
  "22023|club_menor\nt|0"
);
caso(
  "(c) las casillas obligatorias y los datos: sin «mayor de 18» o sin los términos; DNI de 7 dígitos, DNI sin padrón, nombre vacío con carné nuevo; celular, correo y nacimiento fuera de forma; una tienda que no es tienda (el Taller) o que no existe → club_datos_invalidos con su campo, y nada queda",
  comoServidor +
    INTENTO_REG({ numero: "90883011", mayor: false }) +
    INTENTO_REG({ numero: "90883011", terminos: false }) +
    INTENTO_REG({ numero: "9088301" }) +
    INTENTO_REG({ numero: "90883011", padron: false }) +
    INTENTO_REG({ tipo: "carne_extranjeria", numero: "CE883011", nombre: null, padron: false }) +
    INTENTO_REG({ numero: "90883011", cel: "12345" }) +
    INTENTO_REG({ numero: "90883011", correo: "sin-arroba.pe" }) +
    INTENTO_REG({ numero: "90883011", nac: ":'manana'" }) +
    INTENTO_REG({ numero: "90883011", ubic: ":'taller'" }) +
    INTENTO_REG({ numero: "90883011", ubic: "gen_random_uuid()" }) +
    `reset role;\nselect count(*) from retail.clientas where documento_numero in ('90883011', 'CE883011');\n`,
  [
    "22023|club_datos_invalidos:mayor_de_edad",
    "22023|club_datos_invalidos:terminos",
    "22023|club_datos_invalidos:documento",
    "22023|club_datos_invalidos:documento",
    "22023|club_datos_invalidos:nombre",
    "22023|club_datos_invalidos:celular",
    "22023|club_datos_invalidos:correo",
    "22023|club_datos_invalidos:nacimiento",
    "22023|club_datos_invalidos:tienda",
    "22023|club_datos_invalidos:tienda",
    "0",
  ].join("\n")
);

// =====================================================================================================================
// d. Las versiones de los textos
// =====================================================================================================================
caso(
  "(d) las versiones: términos 2 (que no existe), sin privacidad o con la casilla 2 (marcando WhatsApp) → club_texto_cambio; la casilla distinta SIN marcar WhatsApp pasa (no se le pide); y con un texto de términos nuevo (v2), la v1 ya no vale y la v2 sí",
  comoServidor +
    INTENTO_REG({ numero: "90884001", versiones: `'{"terminos": 2, "privacidad": 1, "casilla_publicidad": 1}'::jsonb` }) +
    INTENTO_REG({ numero: "90884001", versiones: `'{"terminos": 1, "casilla_publicidad": 1}'::jsonb` }) +
    INTENTO_REG({ numero: "90884001", versiones: `'{"terminos": 1, "privacidad": 1, "casilla_publicidad": 2}'::jsonb` }) +
    INTENTO_REG({ numero: "90884001", pub: false, versiones: `'{"terminos": 1, "privacidad": 1, "casilla_publicidad": 7}'::jsonb` }) +
    `reset role;
insert into retail.club_textos (tipo, version, texto) values ('terminos', 2, 'Términos v2 de prueba.');
` + comoServidor +
    INTENTO_REG({ numero: "90884002", cel: "966884002" }) +
    INTENTO_REG({ numero: "90884002", cel: "966884002", versiones: `'{"terminos": 2, "privacidad": 1, "casilla_publicidad": 1}'::jsonb` }) +
    `reset role;
select string_agg(texto_tipo || ' v' || texto_version, ',' order by texto_tipo) from retail.club_permisos p join retail.clientas c on c.id = p.clienta_id
 where c.documento_numero = '90884002';
`,
  "P0001|club_texto_cambio\nP0001|club_texto_cambio\nP0001|club_texto_cambio\nSIN_ERROR\nP0001|club_texto_cambio\nSIN_ERROR\ncasilla_publicidad v1,terminos v2"
);

// =====================================================================================================================
// e. Celular nuevo
// =====================================================================================================================
caso(
  "(e) socia CON publicidad se registra con OTRO celular y la casilla: se le quita la del número de antes (revoca por pagina_cartel, con nota, sin persona) y se le da para el nuevo (dos otorga y un revoca: en una misma transacción tienen la misma hora); el celular es el nuevo y sigue con publicidad",
  comoServidor + REGISTRAR("f", { numero: "90885001", cel: "966885001" }) +
    REGISTRAR("g", { numero: "90885001", cel: "966885099" }) +
    `reset role;
select telefono_whatsapp, publicidad_desde is not null from retail.clientas where id = :'f';
select string_agg(accion || ':' || medio || ':' || coalesce(texto_tipo, '-') || ':' || (registrado_por is null) || ':' || coalesce(nota, '-'), ' · ' order by accion, texto_tipo)
  from retail.club_permisos where clienta_id = :'f' and finalidad = 'publicidad_whatsapp';
`,
  "966885099|t\notorga:pagina_cartel:casilla_publicidad:true:- · otorga:pagina_cartel:casilla_publicidad:true:- · revoca:pagina_cartel:-:true:se volvió a registrar en el cartel con otro celular"
);
caso(
  "(e) …con OTRO celular y SIN la casilla: se le quita y queda sin publicidad (sigue socia); con el MISMO celular sin la casilla, no se le toca nada",
  comoServidor + REGISTRAR("f", { numero: "90885011", cel: "966885011" }) + REGISTRAR("h", { numero: "90885012", cel: "966885012" }) +
    REGISTRAR("g", { numero: "90885011", cel: "966885098", pub: false }) +
    REGISTRAR("i", { numero: "90885012", cel: "+51 966 885 012", pub: false }) +
    `reset role;
select string_agg(telefono_whatsapp || ':' || (club_desde is not null) || ':' || (publicidad_desde is not null), ' · ' order by documento_numero)
  from retail.clientas where id in (:'f', :'h');
select (select count(*) from retail.club_permisos where clienta_id = :'f' and finalidad = 'publicidad_whatsapp'),
       (select count(*) from retail.club_permisos where clienta_id = :'h' and finalidad = 'publicidad_whatsapp');
`,
  "966885098:true:false · 966885012:true:true\n2|1"
);

// =====================================================================================================================
// f. Archivada y anonimizada
// =====================================================================================================================
caso(
  "(f) una ficha ARCHIVADA (sin anonimizar) → club_documento_archivado: la página no la reactiva (en caja, sí) y nada cambia",
  como(FELIPE) +
    `select retail.registrar_clienta(p_documento_tipo => 'dni', p_documento_numero => '90886001', p_nombre => 'Archivada Prueba') as a \\gset
select retail.archivar_clienta(:'a', 'pidió que no la contacten', false) as _v \\gset
` + comoServidor + INTENTO_REG({ numero: "90886001", cel: "966886001" }) +
    `reset role;\nselect archivada_en is not null, club_desde is null, telefono_whatsapp is null, (select count(*) from retail.club_permisos where clienta_id = :'a') from retail.clientas where id = :'a';\n`,
  "P0001|club_documento_archivado\nt|t|t|0"
);
caso(
  "(f) una ficha ANONIMIZADA nunca se reusa: su documento crea una ficha NUEVA (otro id) y la anonimizada sigue igual",
  como(FELIPE) +
    `select retail.registrar_clienta(p_documento_tipo => 'dni', p_documento_numero => '90886011', p_nombre => 'Anonimizada Prueba') as a \\gset
select retail.archivar_clienta(:'a', 'pidió borrar sus datos', true) as _v \\gset
` + comoServidor + REGISTRAR("f", { numero: "90886011", cel: "966886011" }) +
    `reset role;
select :'f' <> :'a', (select anonimizada and documento_numero is null and club_desde is null from retail.clientas where id = :'a'),
       (select registro_origen from retail.clientas where id = :'f');
`,
  "t|t|cartel"
);

// =====================================================================================================================
// g. Los límites del cartel
// =====================================================================================================================
caso(
  "(g) club_intento: 20 consultas por ip en la hora pasan y la 21 no (otra ip, sí); 5 registros por ip pasan y el 6 no; 3 por celular y 3 por documento (desde ips distintas) pasan y el 4 no; el celular se guarda normalizado",
  comoServidor +
    `select string_agg(retail.club_intento('consulta', 'ip-a', 'doc-x', null)::text, ',') from generate_series(1, 21);
select retail.club_intento('consulta', 'ip-b', 'doc-x', null);
select string_agg(retail.club_intento('registro', 'ip-c', 'doc-' || g, '96688700' || g)::text, ',') from generate_series(1, 6) g;
select string_agg(retail.club_intento('registro', 'ip-d' || g, 'doc-d' || g, '+51 966 887 999')::text, ',') from generate_series(1, 4) g;
select string_agg(retail.club_intento('registro', 'ip-e' || g, 'doc-e', '96688800' || g)::text, ',') from generate_series(1, 4) g;
reset role;
select count(*) from retail.club_intentos_registro where celular = '966887999';
`,
  `${Array(20).fill("true").join(",")},false\nt\n${Array(5).fill("true").join(",")},false\ntrue,true,true,false\ntrue,true,true,false\n4`
);

// =====================================================================================================================
// h. Quién puede llamar
// =====================================================================================================================
caso(
  "(h) las del servidor (registrarse, club_intento, la conservación): ni anon ni authenticated (permission denied), service_role sí; la página (fn_club_pagina, fn_club_textos_legales): anon y authenticated",
  comoAnon +
    intentoCon(`select * from retail.registrarse_en_el_club(%L, 'dni', '90888001', 'X', '966888001', '1990-01-01', null, true, true, false, '{"terminos":1,"privacidad":1}', true)`, ":'ubic'") +
    intento(`select retail.club_intento('consulta', 'ip', null, null)`) +
    intento(`select retail.fn_club_anonimizar_inactivas()`) +
    intentoCon(`select retail.fn_club_pagina(%L) is not null`, ":'ubic'") +
    intento(`select retail.fn_club_textos_legales() is not null`) +
    como(FELIPE) +
    intentoCon(`select * from retail.registrarse_en_el_club(%L, 'dni', '90888001', 'X', '966888001', '1990-01-01', null, true, true, false, '{"terminos":1,"privacidad":1}', true)`, ":'ubic'") +
    intento(`select retail.club_intento('consulta', 'ip', null, null)`) +
    intento(`select retail.fn_club_anonimizar_inactivas()`) +
    `reset role;
select string_agg(r || ':' || has_function_privilege(r, f::regprocedure, 'execute'), ',' order by f, r)
  from unnest(array['${REGISTRARSE}', 'retail.club_intento(text,text,text,text)', 'retail.fn_club_anonimizar_inactivas()']) f,
       unnest(array['service_role', 'anon', 'authenticated']) r;
select bool_or(a.grantee = 0) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 where p.oid in ('${REGISTRARSE}'::regprocedure, 'retail.club_intento(text,text,text,text)'::regprocedure,
                 'retail.fn_club_anonimizar_inactivas()'::regprocedure, 'retail.fn_club_pagina(uuid)'::regprocedure) and a.privilege_type = 'EXECUTE';
`,
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 10 &&
      l.slice(0, 3).every((x) => x.startsWith("42501|permission denied for function")) &&
      l[3] === "SIN_ERROR" && l[4] === "SIN_ERROR" &&
      l.slice(5, 8).every((x) => x.startsWith("42501|permission denied for function")) &&
      l[8] === "anon:false,authenticated:false,service_role:true,anon:false,authenticated:false,service_role:true,anon:false,authenticated:false,service_role:true" &&
      l[9] === "f"
    );
  }
);
caso(
  "(h) las tablas nuevas: ni anon ni authenticated leen o escriben (RLS encendido y sin políticas); la escala tampoco",
  `select ${["club_intentos_registro", "club_avisos_enviados", "club_aniversario_escala"]
    .flatMap((t) => ["anon", "authenticated"].flatMap((r) => ["select", "insert", "update", "delete"].map((p) => `has_table_privilege('${r}', 'retail.${t}', '${p}')`)))
    .map((e) => `(${e})::int`)
    .join(" + ")};
select string_agg(relname || ':' || relrowsecurity || ':' || (select count(*) from pg_policy where polrelid = c.oid), ',' order by relname)
  from pg_class c where c.oid in ('retail.club_intentos_registro'::regclass, 'retail.club_avisos_enviados'::regclass, 'retail.club_aniversario_escala'::regclass);
`,
  "0\nclub_aniversario_escala:true:0,club_avisos_enviados:true:0,club_intentos_registro:true:0"
);
caso(
  "(h) el retiro (sin borrar): unirse_al_club, crear_invitacion_club, registrar_mensaje_publicidad y registrar_desde_whatsapp sin EXECUTE para authenticated; fn_invitacion_club y confirmar_invitacion_club ni para anon ni para authenticated; las seis siguen existiendo; registrar_baja_whatsapp sigue para authenticated",
  `select string_agg(f || '=' || (to_regprocedure(f) is not null) || '/' || has_function_privilege('authenticated', f::regprocedure, 'execute') || '/' || has_function_privilege('anon', f::regprocedure, 'execute'), ' ' order by f)
  from unnest(array['retail.unirse_al_club(uuid,text,smallint,smallint,smallint,text,uuid,uuid,integer)', 'retail.crear_invitacion_club(uuid,uuid)',
                    'retail.registrar_mensaje_publicidad(uuid,text,uuid)', 'retail.registrar_desde_whatsapp(text,text,text,text,uuid)',
                    'retail.fn_invitacion_club(text)', 'retail.confirmar_invitacion_club(text,integer)', 'retail.registrar_baja_whatsapp(text,uuid)']) f;
`,
  "retail.confirmar_invitacion_club(text,integer)=true/false/false retail.crear_invitacion_club(uuid,uuid)=true/false/false retail.fn_invitacion_club(text)=true/false/false retail.registrar_baja_whatsapp(text,uuid)=true/true/false retail.registrar_desde_whatsapp(text,text,text,text,uuid)=true/false/false retail.registrar_mensaje_publicidad(uuid,text,uuid)=true/false/false retail.unirse_al_club(uuid,text,smallint,smallint,smallint,text,uuid,uuid,integer)=true/false/false"
);

// =====================================================================================================================
// i. La página
// =====================================================================================================================
caso(
  "(i) fn_club_pagina (como anon): la tienda, su WhatsApp, el % (10), la escala 20/30/40/50/60, el umbral (6, 600, 60) y los cuatro textos v1 EXACTOS del documento aprobado, con su fecha; el Taller o una tienda que no existe → null",
  `reset role;\nupdate retail.ubicaciones set whatsapp_numero = '966000111' where id = :'ubic';\n` + comoAnon +
    `select p ->> 'tienda', p ->> 'whatsapp', p ->> 'pct', (select string_agg((e ->> 'anio') || '=' || (e ->> 'monto'), ',') from jsonb_array_elements(p -> 'escala') e),
       p ->> 'compras', p ->> 'monto_minimo', p ->> 'dias',
       (select string_agg(k, ',' order by k) from jsonb_object_keys(p -> 'textos') k),
       p -> 'textos' -> 'terminos' ->> 'texto' = $t$${TEXTO_TERMINOS}$t$,
       p -> 'textos' -> 'privacidad' ->> 'texto' = $t$${TEXTO_PRIVACIDAD}$t$,
       p -> 'textos' -> 'casilla_publicidad' ->> 'texto' = $t$${TEXTO_CASILLA}$t$,
       p -> 'textos' -> 'saludo' ->> 'texto' = $t$${TEXTO_SALUDO}$t$,
       (select bool_and((v ->> 'version') = '1' and (v ->> 'vigente_desde') ~ '^\\d{4}-\\d{2}-\\d{2}$') from jsonb_each(p -> 'textos') t(k, v))
  from (select retail.fn_club_pagina(:'ubic') as p) x;
select retail.fn_club_pagina(:'taller') is null, retail.fn_club_pagina(gen_random_uuid()) is null, retail.fn_club_pagina(null) is null;
`,
  "Tienda Lima|966000111|10.00|1=20.00,2=30.00,3=40.00,4=50.00,5=60.00|6|600.00|60|casilla_publicidad,privacidad,saludo,terminos|t|t|t|t|t\nt|t|t"
);
caso(
  "(i) fn_club_textos_legales (como anon): lo mismo sin la tienda, con los términos y la privacidad; y las cuatro plantillas de avisos terminan con «Si no quieres recibir más mensajes, responde BAJA.» y saludan por {nombre}",
  comoAnon +
    `select (select string_agg(k, ',' order by k) from jsonb_object_keys(p) k), (select string_agg(k, ',' order by k) from jsonb_object_keys(p -> 'textos') k),
       p -> 'textos' -> 'terminos' ->> 'texto' = $t$${TEXTO_TERMINOS}$t$, p -> 'textos' -> 'privacidad' ->> 'version'
  from (select retail.fn_club_textos_legales() as p) x;
reset role;
select string_agg(tipo || ':' || (texto like '%Si no quieres recibir más mensajes, responde BAJA.' and texto like '%{nombre}%'), ',' order by tipo)
  from retail.club_textos where tipo like 'aviso\\_%';
` + intento(`insert into retail.club_textos (tipo, version, texto) values ('aviso_rebaja', 9, 'Hola {nombre}, sin baja.')`),
  "compras,dias,escala,monto_minimo,pct,textos|privacidad,terminos|t|1\naviso_aniversario:true,aviso_cumpleanos:true,aviso_novedades:true,aviso_rebaja:true\n23514|new row for relation \"club_textos\" violates check constraint \"club_textos_aviso_con_baja\""
);

// =====================================================================================================================
// j. guardar_beneficios_club
// =====================================================================================================================
const ESCALA = (a) => `'${JSON.stringify(a.map((monto, k) => ({ anio: k + 1, monto })))}'::jsonb`;
const CONF = `reset role;\ninsert into retail.configuracion_empresa (ruc, razon_social) values ('20000000001', 'Prueba Club SAC') on conflict (id) do nothing;\n`;
caso(
  "(j) guardar_beneficios_club (el líder): guarda % , umbral, días y escala; publica términos v2 con «al menos 8 compras», «S/ 700» y «Tienes 45 días» (y {pct} y {escala} siguen de marcadores), deja su rastro, y la página ya muestra todo nuevo; guardar lo mismo otra vez no publica nada",
  CONF + como(FELIPE) +
    `select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 45, 55, 65])}) as _g \\gset
select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 45, 55, 65])}) as _g2 \\gset
reset role;
select club_cumple_pct, club_aniversario_compras, club_aniversario_monto, club_aniversario_dias from retail.configuracion_empresa;
select string_agg(anio || '=' || monto, ',' order by anio) from retail.club_aniversario_escala;
select max(version), bool_and(texto like '%al menos 8 compras o%') filter (where version = 2), bool_and(texto ~ 'al menos S/ 700\\s+en compras') filter (where version = 2),
       bool_and(texto like '%Tienes 45 días desde tu aniversario%') filter (where version = 2), bool_and(texto like '%{pct}%' and texto like '%{escala}%') filter (where version = 2),
       bool_and(creado_por = :'persona_felipe') filter (where version = 2)
  from retail.club_textos where tipo = 'terminos';
select count(*), max(detalle ->> 'terminos_version') from retail.configuracion_historial where que = 'beneficios_club';
` + `select p ->> 'pct', p -> 'textos' -> 'terminos' ->> 'version' from (select retail.fn_club_pagina(:'ubic') as p) x;\n`,
  "12.00|8|700.00|45\n1=25.00,2=35.00,3=45.00,4=55.00,5=65.00\n2|t|t|t|t|t\n1|2\n12.00|2"
);
caso(
  "(j) …solo el líder (Micaela → solo_lider); los rangos y la escala (falta un año, un año de más, un monto en 0, una escala que baja) → beneficios_invalidos con su campo; y unos términos que ya no dicen el umbral como el v1 → terminos_no_reconocidos, sin guardar nada",
  CONF + como(MICAELA) + intento(`select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 45, 55, 65])})`) +
    como(FELIPE) +
    intento(`select retail.guardar_beneficios_club(0, 8, 700, 45, ${ESCALA([25, 35, 45, 55, 65])})`) +
    intento(`select retail.guardar_beneficios_club(12, 0, 700, 45, ${ESCALA([25, 35, 45, 55, 65])})`) +
    intento(`select retail.guardar_beneficios_club(12, 8, 0, 45, ${ESCALA([25, 35, 45, 55, 65])})`) +
    intento(`select retail.guardar_beneficios_club(12, 8, 700, 181, ${ESCALA([25, 35, 45, 55, 65])})`) +
    intento(`select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 45, 55])})`) +
    intento(`select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 45, 55, 65, 75])})`) +
    intento(`select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 0, 45, 55, 65])})`) +
    intento(`select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 30, 55, 65])})`) +
    `reset role;\ninsert into retail.club_textos (tipo, version, texto) values ('terminos', 2, 'Unos términos que no dicen el umbral.');\n` + como(FELIPE) +
    intento(`select retail.guardar_beneficios_club(12, 8, 700, 45, ${ESCALA([25, 35, 45, 55, 65])})`) +
    `reset role;\nselect club_cumple_pct, club_aniversario_compras from retail.configuracion_empresa;\nselect max(version) from retail.club_textos where tipo = 'terminos';\n`,
  [
    "42501|solo_lider",
    "22023|beneficios_invalidos:pct",
    "22023|beneficios_invalidos:compras",
    "22023|beneficios_invalidos:monto",
    "22023|beneficios_invalidos:dias",
    "22023|beneficios_invalidos:escala",
    "22023|beneficios_invalidos:escala",
    "22023|beneficios_invalidos:escala",
    "22023|beneficios_invalidos:escala",
    "P0001|terminos_no_reconocidos",
    "10.00|6",
    "2",
  ].join("\n")
);

// =====================================================================================================================
// k. La conservación
// =====================================================================================================================
caso(
  "(k) fn_club_anonimizar_inactivas: una socia registrada hace 4 años sin compras (con correo, publicidad y un aviso mandado) → anonimizada: los dos revoca por «anonimizar» SIN persona y con su nota, sin correo ni tienda del club, el aviso sin teléfono ni texto, la actividad automática; una con una compra hace 2 años, una recién unida al club (ficha vieja) y una ficha nueva, no; el celular de los intentos de más de un día se vacía",
  comoServidor + REGISTRAR("v", { numero: "90889001", cel: "966889001", correo: "vieja@correo.pe" }) +
    REGISTRAR("c", { numero: "90889002", cel: "966889002" }) + REGISTRAR("u", { numero: "90889003", cel: "966889003" }) +
    `select retail.club_intento('registro', 'ip-k', 'doc-k', '966889009') as _i \\gset
reset role;
update retail.clientas set created_at = now() - interval '4 years', club_desde = now() - interval '4 years' where id in (:'v', :'c');
update retail.clientas set created_at = now() - interval '4 years' where id = :'u';
insert into retail.ventas (ubicacion_id, cliente_id, created_at, estado) values (:'ubic', :'c', now() - interval '2 years', 'completada');
insert into retail.club_avisos_enviados (clienta_id, tipo, referencia, telefono, texto, ubicacion_id, enviado_por)
  values (:'v', 'novedades', '2026-S01', '966889001', 'Hola Lucia, ... responde BAJA.', :'ubic', :'persona_felipe');
update retail.club_intentos_registro set creado_en = now() - interval '2 days' where ip_hash = 'ip-k';
` + comoServidor + `select retail.fn_club_anonimizar_inactivas() as n \\gset
reset role;
select :n >= 1, anonimizada, correo is null, club_ubicacion_id is null, club_desde is null, motivo_archivo, archivada_por is null from retail.clientas where id = :'v';
` + EVENTOS("v").replace("from retail.club_permisos", "from retail.club_permisos").replace("where clienta_id", "where accion = 'revoca' and clienta_id") +
    `select telefono is null, texto is null from retail.club_avisos_enviados where clienta_id = :'v';
select a.persona_id is null, a.detalle ->> 'automatica' from retail.actividad a where a.accion = 'anonimizar' and a.registro_id = :'v';
select string_agg(anonimizada::text, ',' order by documento_numero) from retail.clientas where id in (:'c', :'u');
select count(*) from retail.club_intentos_registro where ip_hash = 'ip-k' and celular is null;
`,
  "t|t|t|t|t|Anonimizada: 3 años sin compras (Ley 29733)|t\n" +
    "club:revoca:anonimizar:-:true:conservación: 3 años sin compras (ADR-0288 G-15) · publicidad_whatsapp:revoca:anonimizar:-:true:conservación: 3 años sin compras (ADR-0288 G-15)\n" +
    "t|t\nt|true\nfalse,false\n1"
);
caso(
  "(k) archivar_clienta (una persona) anonimiza con la MISMA rutina: los revoca con quien lo hizo, «Anonimizada (Ley 29733)» y la actividad sin «automática»",
  comoServidor + REGISTRAR("f", { numero: "90889011", cel: "966889011", correo: "a@b.pe" }) + como(FELIPE) +
    `select retail.archivar_clienta(:'f', 'lo pidió', true) as _v \\gset
reset role;
select motivo_archivo, correo is null, archivada_por = :'persona_felipe' from retail.clientas where id = :'f';
select count(*) filter (where registrado_por = :'persona_felipe' and nota is null) from retail.club_permisos where clienta_id = :'f' and medio = 'anonimizar';
select a.detalle ? 'automatica' from retail.actividad a where a.accion = 'anonimizar' and a.registro_id = :'f';
`,
  "Anonimizada (Ley 29733)|t|t\n2\nf"
);

// =====================================================================================================================
// l. Estructura y pegado
// =====================================================================================================================
caso(
  `(l) los md5 «después» de la sección 0 de la PARTE 8 son los de las funciones vivas (${VERSIONES.length} firmas; la registrar_venta de 17 ya no existe) y los «antes» son los de producción el 2026-10-01`,
  VERSIONES.map((v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`).join(""),
  (s) =>
    s === VERSIONES.map((v) => v.despues ?? "NO_EXISTE").join("\n") &&
    VERSIONES.find((v) => v.firma.endsWith("text,boolean)") && v.firma.startsWith("retail.registrar_venta"))?.antes === "2b55a94a754e7708f5b133008f30469f" &&
    VERSIONES.find((v) => v.firma === "retail.resumen_clienta_caja(uuid)")?.antes === "fa690d7f1a5e1fa2412f9be78cb784a6"
);
const FIRMAS_1G = VERSIONES.filter((v) => v.despues).map((v) => v.firma);
const TABLAS = ["retail.clientas", "retail.configuracion_empresa", "retail.club_canjes", "retail.club_textos", "retail.club_permisos",
  "retail.club_aniversario_escala", "retail.club_intentos_registro", "retail.club_avisos_enviados", "retail.modulos"];
const FOTO = `reset role;
select md5(string_agg(x, '|' order by x)) from (
  select p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '')
    from pg_proc p where p.oid in (select to_regprocedure(f) from unnest(array[${FIRMAS_1G.map((f) => `'${f}'`).join(", ")}, 'retail.fn_clientas_club_datos_al_salir()', 'retail.fn_clientas_avisos_al_anonimizar()', 'retail.fn_club_avisos_solo_agregar()', 'retail.unirse_al_club(uuid,text,smallint,smallint,smallint,text,uuid,uuid,integer)', 'retail.confirmar_invitacion_club(text,integer)']) f)
  union all
  select 'col:' || a.attrelid::regclass || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':'
         || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || coalesce(col_description(a.attrelid, a.attnum), '')
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")}) and a.attnum > 0 and not a.attisdropped
  union all
  select 'con:' || conrelid::regclass || ':' || conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated from pg_constraint
   where conrelid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")})
  union all
  select 'idx:' || indexdef from pg_indexes where schemaname = 'retail' and tablename in (${TABLAS.map((t) => `'${t.slice(7)}'`).join(", ")})
  union all
  select 'trg:' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text from pg_trigger t where not t.tgisinternal and t.tgrelid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")})
  union all
  select 'rel:' || relname || ':' || relrowsecurity::text || ':' || coalesce(array_to_string(relacl, ','), '') || ':' || coalesce(obj_description(oid, 'pg_class'), '')
    from pg_class where oid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")})
  union all
  select 'txt:' || tipo || ':' || version || ':' || texto from retail.club_textos
  union all
  select 'esc:' || anio || ':' || monto from retail.club_aniversario_escala
  union all
  select 'mod:' || clave || ':' || grupo || ':' || nombre || ':' || incluye || ':' || orden || ':' || solo_lider || ':' || delegable from retail.modulos where clave = 'avisos_club'
) f(x);
select string_agg(p.oid::regprocedure::text, ',') from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta';
`;
const PEGAR_TODO = PARTES.map((p) => `reset role;\n${p}\n`).join("") + "set local search_path = retail, public, extensions;\n";
caso(
  "(l) pegar las ocho partes OTRA VEZ, en orden (como en el SQL Editor), deja todo igual: funciones, permisos, comentarios, columnas, candados, índices, disparadores, RLS, textos, la escala y el módulo; y una sola firma de registrar_venta, la de 18",
  FOTO + PEGAR_TODO + FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === l[3] && l[1] === RV_HOY.slice(7);
  }
);
caso(
  "(l) con registrar_venta cambiada en vivo (alguien la corrigió en producción), la PARTE 8 aborta con un mensaje claro y no pisa nada",
  `reset role;
do $cambio$ begin
  execute replace(pg_get_functiondef('${RV_HOY}'::regprocedure), 'El carrito está vacío', 'El carrito está vacío (cambiado en vivo)');
end $cambio$;
` + FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${PARTE8}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` + FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === l[3];
  }
);
{
  const r = correr(`${PRELUDIO}reset role;
do $cambio$ begin
  execute replace(pg_get_functiondef('${RV_HOY}'::regprocedure), 'El carrito está vacío', 'El carrito está vacío (cambiado en vivo)');
end $cambio$;
${PARTE8}
rollback;`);
  registrar(
    "(l) …y el mensaje dice qué función cambió y que se rehaga sobre la versión viva",
    !r.ok && r.mensaje.includes(`${RV_HOY} cambió desde que se escribió esta migración`) && r.mensaje.includes("lee su definición viva"),
    r.ok ? "no abortó" : r.mensaje.split("\n").find((x) => x.includes("ERROR")),
    "ERROR: … cambió desde que se escribió esta migración … lee su definición viva …"
  );
}
{
  const r1 = correr(`${PRELUDIO}reset role;\nalter table retail.club_avisos_enviados rename to club_avisos_enviados_x;\n${PARTE8}\nrollback;`);
  const r2 = correr(`${PRELUDIO}reset role;\ndelete from retail.modulos where clave = 'avisos_club';\n${PARTE8}\nrollback;`);
  registrar(
    "(l) sin la PARTE 7 (sin club_avisos_enviados) o sin la PARTE 6 (sin el módulo), la PARTE 8 aborta y lo dice: «Falta la PARTE 7» y «Falta la PARTE 6»",
    !r1.ok && r1.mensaje.includes("Falta la PARTE 7") && !r2.ok && r2.mensaje.includes("Falta la PARTE 6"),
    `${r1.ok ? "no abortó" : r1.mensaje.split("\n").find((x) => x.includes("ERROR"))} · ${r2.ok ? "no abortó" : r2.mensaje.split("\n").find((x) => x.includes("ERROR"))}`,
    "Falta la PARTE 7 · Falta la PARTE 6"
  );
}

/** Los textos entre comillas simples FUERA de un cuerpo `$…$` y de comentarios, con su `select … into` si lo tienen. */
function intoEnTextos(sql) {
  const hallados = [];
  let k = 0;
  while (k < sql.length) {
    if (sql.startsWith("--", k)) {
      const fin = sql.indexOf("\n", k);
      k = fin < 0 ? sql.length : fin + 1;
    } else if (sql.startsWith("/*", k)) {
      const fin = sql.indexOf("*/", k + 2);
      k = fin < 0 ? sql.length : fin + 2;
    } else if (sql[k] === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(k));
      if (!m) {
        k++;
        continue;
      }
      const fin = sql.indexOf(m[0], k + m[0].length);
      k = fin < 0 ? sql.length : fin + m[0].length;
    } else if (sql[k] === "'") {
      let j = k + 1;
      let texto = "";
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          texto += "'";
          j += 2;
        } else if (sql[j] === "'") {
          break;
        } else {
          texto += sql[j++];
        }
      }
      if (/\bselect\b[\s\S]*?\binto\b/i.test(texto)) hallados.push(texto.replace(/\s+/g, " ").slice(0, 80));
      k = j + 1;
    } else {
      k++;
    }
  }
  return hallados;
}
chequeo(
  "(l) ningún `select … into` dentro de un texto entre comillas fuera de `$…$` en las ocho partes (el SQL Editor lo confunde con un SELECT INTO)",
  ARCHIVOS.map((n, x) => intoEnTextos(PARTES[x]).map((t) => `${n}: ${t}`)).flat().join(" · ") || "ninguno",
  "ninguno"
);
chequeo(
  "(l) …y el vigilante muerde: lo ve en un texto entre comillas, no dentro de $…$ ni en un comentario",
  JSON.stringify([
    intoEnTextos(`select pg_temp.r('x', 'begin select a into v_a from t; end');`).length,
    intoEnTextos(`do $d$ begin select a into v_a from t; end $d$; select 'hola';`).length,
    intoEnTextos(`-- select 'select a into b'\nselect 1;`).length,
  ]),
  "[1,0,0]"
);
{
  const sinComentarios = (sql) => sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  chequeo(
    "(l) sin `drop trigger`, `create policy` ni `drop policy` en ninguna parte (CLAUDE.md, «Políticas y deadlocks»)",
    PARTES.map((p, x) => [/drop\s+trigger/i, /create\s+policy/i, /drop\s+policy/i].filter((r) => r.test(sinComentarios(p))).map(() => ARCHIVOS[x])).flat().join(",") || "ninguna",
    "ninguna"
  );
  // Cada parte de las 1 a 5 hace `alter table` sobre UNA sola tabla en uso (la suya); la 6 no hace ninguno; la 7 solo sobre
  // sus tablas nuevas; la 8, sobre ninguna.
  const altera = (p) => [...new Set([...sinComentarios(p).matchAll(/alter\s+table\s+retail\.([a-z_]+)/gi)].map((m) => m[1]))].join(",");
  chequeo(
    "(l) cada `alter` de una tabla en uso va en su propia parte: 1 clientas · 2 configuracion_empresa · 3 club_canjes · 4 club_textos · 5 club_permisos · 6 ninguna · 7 solo las nuevas · 8 ninguna",
    PARTES.map((p) => altera(p) || "-").join(" · "),
    "clientas · configuracion_empresa · club_canjes · club_textos · club_permisos · - · club_aniversario_escala,club_intentos_registro,club_avisos_enviados · -"
  );
  chequeo(
    "(l) todas las partes esperan como mucho 3 s un candado (`set lock_timeout = '3s'`)",
    PARTES.every((p) => p.includes("set lock_timeout = '3s';")),
    true
  );
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

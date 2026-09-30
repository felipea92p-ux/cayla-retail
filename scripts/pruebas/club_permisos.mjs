#!/usr/bin/env node
/**
 * Pruebas de la tanda 1b del club de clientas (ADR-0288: D-4 reescrita, «Actualización 2026-09-30» y «Contrato de la
 * tanda 1b»; migración `20260930200000/200100_club_paso1b (parte 1 y 2)`).
 *
 * EL PROBLEMA. La clienta tenía un solo permiso (`whatsapp_consentimiento_en`) que la asesora marcaba en caja. La Ley 32323
 * solo deja mandar publicidad a quien le escribió a la tienda por iniciativa propia. La base tiene que hacer cumplir, no la
 * pantalla:
 *   - dos permisos: SOCIA (su «sí» de palabra, en caja o en la ficha) y PUBLICIDAD (solo si ella escribió: medio
 *     `whatsapp_propio`); nadie marca la publicidad de palabra, ni una función ni un insert directo;
 *   - la historia (`club_permisos`) es de solo agregar, también para `postgres`, y la ficha (`club_desde`,
 *     `publicidad_desde`, `codigo_club`) es su foto;
 *   - socia = documento + celular + nombre (CL-1); la BAJA vale para toda ficha con ese número y deja el club;
 *   - anonimizar escribe los `revoca` y deja la ficha sin club; unir pasa a la que queda lo más antiguo y el código.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`, para
 * que los permisos se evalúen de verdad; cuentas del seed: Felipe, líder y Admin; Micaela, integrante de Trujillo):
 *   a. unirse_al_club: celular válido (normalizado) y texto vigente; código C-0001… correlativo; idempotente (mismo código,
 *      sin otro evento, completa el cumpleaños); ficha archivada, anonimizada, unida o inexistente rechazada; sin módulo
 *      `clientas_sin_modulo`; sin documento o sin nombre `socia_sin_documento`; `p_texto_version` distinta de la vigente
 *      `club_texto_cambio`; sin texto vigente `club_sin_texto`; nunca da la publicidad.
 *   b. Publicidad: solo por registrar_mensaje_publicidad (socia; el número que escribió reemplaza al de la ficha;
 *      idempotente) o registrar_desde_whatsapp (crea o completa la ficha y la deja socia con publicidad); un insert directo
 *      con otro medio lo frena el candado de la ley.
 *   c. BAJA: revoca en todas las fichas con ese número (escrito como sea), deja el club, es idempotente.
 *   d. `club_permisos` y `club_textos`: sin update, delete ni truncate (tampoco `postgres`); sin permisos para la API; RLS
 *      sin políticas; los ayudantes sin EXECUTE.
 *   e. Candados de `clientas`: socia sin celular, sin documento o sin nombre; publicidad sin club; código sin club o con
 *      otro formato; anonimizada con club; y lo mismo por editar_clienta (`socia_sin_celular`, `socia_sin_documento`).
 *   f. Anonimizar escribe los `revoca` (medio `anonimizar`) y deja la ficha sin club, sin código y sin año.
 *   g. Unir: la que queda toma lo más antiguo y el código si no tenía; el celular sigue al permiso; los eventos se quedan
 *      con la ficha unida.
 *   h. registrar_clienta/editar_clienta: una sola firma, sin `p_acepta_whatsapp`/`p_revoca_whatsapp`, con `p_cumple_anio`;
 *      no tocan ningún permiso (ni el legado); celular normalizado o `celular_invalido`.
 *   i. Lecturas: resumen_clienta_caja y fn_club_textos_vigentes (los textos EXACTOS del ADR; sin el módulo también);
 *      buscar_clienta por código (solo o dentro del mensaje) y por celular con +51.
 *   j. guardar_whatsapp_tienda: normaliza y valida (`whatsapp_tienda_invalido`), vacío lo quita, solo tiendas, el permiso
 *      de guardar_metas_tienda, deja rastro; y el candado de formato en la tabla.
 *   k. Legado: el permiso marcado en caja pasa a socia SIN publicidad (con celular válido, documento y nombre), con su
 *      fecha y un evento `legado`; lo demás queda fuera y el aviso lo cuenta.
 *   l. Estructura y pegado: md5 «después» de la sección 0 = vivos y cuerpos = archivo; pegar dos veces deja lo mismo; con
 *      una función cambiada en vivo aborta sin tocar nada; sin la PARTE 1, la PARTE 2 aborta; ningún `into` dentro de un
 *      texto entre comillas fuera de `$…$` (el SQL Editor lo confunde con un SELECT INTO), ni `drop trigger`, ni
 *      `create policy`; la PARTE 1 solo toca `ubicaciones`; las funciones nuevas empiezan por el módulo y el responsable.
 *   m. Dos cajas invitan a la misma clienta a la vez, en dos conexiones reales: la segunda ESPERA en la lectura de la
 *      ficha (ROLLBACK). Con BASE_DESECHABLE=1, además con COMMIT: un solo código y un solo evento (deja una socia de
 *      prueba, así que no corre en el CI).
 *   n. Cambio de celular (ajuste d, el arquitecto 2026-09-30): editar_clienta o registrar_clienta con otro celular a una
 *      socia con publicidad se la quitan (evento revoca/cambio_celular con quien lo registra, actividad) y sigue socia;
 *      sin publicidad, o con el mismo número escrito distinto, nada; la recupera con «Llegó su mensaje» desde el nuevo;
 *      «Llegó su mensaje» y el cartel desde OTRO número la conservan; y el disparador clientas_celular_con_publicidad
 *      rechaza un update directo que cambia el celular y conserva la publicidad, salvo que esta transacción haya
 *      registrado su mensaje. Para que el mensaje de la preparación no cuente como «de esta transacción», su evento se
 *      corre un día (con el disparador de solo agregar apagado dentro de la transacción, que termina en ROLLBACK).
 *
 * USO
 *   pnpm pruebas:club-permisos                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-permisos --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-permisos → además (m2), que commitea: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const MIGRACION = ["20260930200000_club_paso1b_parte1_whatsapp_tienda.sql", "20260930200100_club_paso1b_parte2_permisos_y_qr.sql"].map((n) => readFileSync(join(RAIZ, "supabase", "migrations", n), "utf8")).join("\n");
const MARCA_P1 = "-- ============================== PARTE 1";
const MARCA_FIN_P1 = "-- ============================== FIN DE LA PARTE 1";
const MARCA_P2 = "-- ============================== PARTE 2";
const PARTE_1 = MIGRACION.slice(MIGRACION.indexOf(MARCA_P1), MIGRACION.indexOf(MARCA_FIN_P1));
const PARTE_2 = MIGRACION.slice(MIGRACION.indexOf(MARCA_P2));
if (MIGRACION.indexOf(MARCA_P1) < 0 || MIGRACION.indexOf(MARCA_FIN_P1) < 0 || MIGRACION.indexOf(MARCA_P2) < 0) {
  console.error("✗ La migración debería marcar la PARTE 1, su fin y la PARTE 2.");
  process.exit(1);
}

// La tabla del candado de versión de la sección 0: firma → md5 normalizado «antes» (producción = «después» de la 1a; null =
// la firma todavía no existe) y «después» (null = la firma deja de existir).
const VERSIONES = [
  ...MIGRACION.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+(null|'([0-9a-f]{32})')\)/g),
].map((m) => ({ firma: m[1], antes: m[3] ?? null, despues: m[5] ?? null }));
if (VERSIONES.length !== 7) {
  console.error(`✗ La tabla de versiones de la migración debería tener 7 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const REGISTRAR = "retail.registrar_clienta(text,text,text,text,smallint,smallint,smallint)";
const EDITAR = "retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer)";
const UNIRSE = "retail.unirse_al_club(uuid,text,smallint,smallint,smallint,text,uuid,uuid,integer)";

// Las funciones que crea el archivo (cuerpo entre `$$` y `$$`), para comparar con las vivas.
const CREADAS = [...MIGRACION.matchAll(/create or replace function (retail\.[a-z_]+)\(/g)].map((m) => m[1]);
/** El cuerpo (lo que queda entre `$$` y `$$`) con que el archivo crea una función: es su `prosrc` vivo. */
const cuerpoDe = (nombre) => {
  const ini = MIGRACION.indexOf(`create or replace function ${nombre}(`);
  const a = MIGRACION.indexOf("$$", ini) + 2;
  return MIGRACION.slice(a, MIGRACION.indexOf("$$", a));
};

// Las que llama la web (EXECUTE solo para authenticated) y los ayudantes internos (sin EXECUTE para la API).
const DE_LA_WEB = [
  UNIRSE,
  "retail.registrar_mensaje_publicidad(uuid,text,uuid)",
  "retail.registrar_desde_whatsapp(text,text,text,text,uuid)",
  "retail.registrar_baja_whatsapp(text,uuid)",
  "retail.resumen_clienta_caja(uuid)",
  "retail.fn_club_textos_vigentes()",
  "retail.guardar_whatsapp_tienda(uuid,text)",
  REGISTRAR,
  EDITAR,
];
const AYUDANTES = [
  "retail.fn_celular_normalizado(text)",
  "retail.fn_exigir_celular(text,boolean)",
  "retail.fn_codigo_club_normalizado(text)",
  "retail.fn_club_codigo_nuevo()",
  "retail.fn_club_solo_agregar()",
  "retail.fn_club_quitar_publicidad_por_celular(uuid,uuid)",
  "retail.fn_club_celular_con_publicidad()",
];

// Los textos v2 EXACTOS de la «Actualización 2026-09-30» del ADR (en el personal, el código va como {codigo}).
const TEXTO_CLUB =
  "Te unes al Club CAYLA: guardamos tu nombre, documento, celular y cumpleaños para tus beneficios y para avisarte por WhatsApp de tus apartados y de las tallas que nos pidas. Puedes salir cuando quieras.";
const TEXTO_PERSONAL =
  "Hola CAYLA, quiero recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA. (Club {codigo})";
const TEXTO_GENERICO =
  "Hola CAYLA, quiero unirme al Club CAYLA y recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA.";

// Seed local: Felipe (líder y Admin), Micaela (integrante de Trujillo; con Clientas, sin Configuración).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

/** Una sesión de psql que corre en paralelo con las demás (para las carreras de la sección m). */
function psqlEnParalelo(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolve({ ok: codigo === 0, salida: salida.trim(), mensaje: error }));
    p.stdin.end(sql);
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Lo que todo caso necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- Intenta una sentencia y devuelve «SQLSTATE|hint» si el hint es uno de los nuestros (un identificador estable como
-- 'celular_invalido'), o «SQLSTATE|mensaje» si no, o SIN_ERROR. No es security definer: corre con los permisos de quien la
-- llama. Es un bloque con excepción: lo que la sentencia alcanzó a hacer se deshace.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated, anon;

-- Una persona firma a su nombre, como hoy en el mostrador; y la integrante, con Clientas (así están en producción).
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
`;

/** Cambia de cuenta (sin responsable en el combo). */
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const comoAnon = `reset role;\nset local request.jwt.claim.role = 'anon';\nset local request.jwt.claims = '{"role":"anon"}';\nset local role anon;\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
/** Como `intento`, con variables de psql: psql no las reemplaza entre $q$, así que van por `format` (%L). */
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;
const lit = (v) => (v === null ? "null" : `'${v}'`);
/** Alta de ficha por la RPC (la cuenta ya elegida). */
const ALTA = (alias, { tipo = "dni", numero = null, nombre = null, celular = null } = {}) =>
  `select retail.registrar_clienta(p_documento_tipo => '${tipo}', p_documento_numero => ${lit(numero)}, p_nombre => ${lit(nombre)}, p_telefono_whatsapp => ${lit(celular)}) as ${alias} \\gset\n`;
/** Unirla al club (la cuenta ya elegida): deja :<alias>_codigo. */
const UNIR = (alias, celular, extra = "") =>
  `select codigo_club as ${alias}_codigo from retail.unirse_al_club(p_clienta_id => :'${alias}', p_telefono_whatsapp => '${celular}', p_ubicacion_id => :'ubic'${extra}) \\gset\n`;
/** Una socia lista: alta con DNI, nombre y celular, y su «sí» en caja. */
const SOCIA = (alias, numero, nombre, celular) => ALTA(alias, { numero, nombre, celular }) + UNIR(alias, celular);
/** Cuántos eventos del club tiene una ficha (como postgres). */
const EVENTOS = (alias) => `(select count(*) from retail.club_permisos where clienta_id = :'${alias}')`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

let fallas = 0;
let casos = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperadoTexto.split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
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
/** Un chequeo sin base de datos (lee el archivo). */
function chequeo(nombre, obtenido, esperado) {
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

// =====================================================================================================================
// a. unirse_al_club
// =====================================================================================================================
caso(
  "(a) unirse con el celular como venga («+51 987 …») y el texto vigente: código C-####, socia desde ahora, celular normalizado, SIN publicidad, un evento club/caja_palabra con el texto club v2, quien registra y la tienda",
  como(FELIPE) + ALTA("f", { numero: "90660101", nombre: "Socia Uno Prueba" }) +
    `select codigo_club ~ '^C-[0-9]{4,}$', club_desde is not null from retail.unirse_al_club(:'f', '+51 966 010 101', p_ubicacion_id => :'ubic');
reset role;
select telefono_whatsapp, club_desde is not null, publicidad_desde is null, codigo_club is not null from retail.clientas where id = :'f';
select finalidad || ':' || accion || ':' || medio || ':' || texto_tipo || ':' || texto_version, registrado_por = :'persona_felipe', ubicacion_id = :'ubic', venta_id is null
  from retail.club_permisos where clienta_id = :'f';
`,
  "t|t\n966010101|t|t|t\nclub:otorga:caja_palabra:club:2|t|t|t"
);
caso(
  "(a) dos socias nuevas: códigos correlativos y distintos (la secuencia), en el formato C-0001",
  como(FELIPE) + SOCIA("f1", "90660102", "Socia Dos Prueba", "966010102") + SOCIA("f2", "90660103", "Socia Tres Prueba", "966010103") +
    `select :'f2_codigo' <> :'f1_codigo', substr(:'f2_codigo', 3)::int = substr(:'f1_codigo', 3)::int + 1;\n`,
  "t|t"
);
caso(
  "(a) idempotente: la segunda vez devuelve el MISMO código y la misma fecha, sin otro evento; solo completa el cumpleaños que faltaba (no pisa el que tenía)",
  como(FELIPE) + ALTA("f", { numero: "90660104", nombre: "Socia Cuatro Prueba", celular: "966010104" }) +
    `select codigo_club as c1, club_desde as d1 from retail.unirse_al_club(:'f', '966010104', 7::smallint, 3::smallint, null) \\gset
select codigo_club = :'c1', club_desde = :'d1' from retail.unirse_al_club(:'f', '966999999', 9::smallint, 9::smallint, 1991::smallint);
reset role;
select ${EVENTOS("f")}, cumple_dia, cumple_mes, cumple_anio, telefono_whatsapp from retail.clientas where id = :'f';
`,
  "t|t\n1|7|3|1991|966010104"
);
caso(
  "(a) celular inválido, vacío o que no empieza en 9 → 22023 celular_invalido, y no cambia nada",
  como(FELIPE) + ALTA("f", { numero: "90660105", nombre: "Sin Celular Prueba" }) +
    intentoCon(`select * from retail.unirse_al_club(%L, '12345')`, ":'f'") +
    intentoCon(`select * from retail.unirse_al_club(%L, null)`, ":'f'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '812345678')`, ":'f'") +
    `reset role;\nselect club_desde is null, ${EVENTOS("f")} from retail.clientas where id = :'f';\n`,
  "22023|celular_invalido\n22023|celular_invalido\n22023|celular_invalido\nt|0"
);
caso(
  "(a) CL-1: sin documento o sin nombre → socia_sin_documento (y la ficha sigue sin club)",
  como(FELIPE) + ALTA("sin_doc", { nombre: "Sin Documento Prueba", celular: "966010106" }) +
    ALTA("sin_nombre", { numero: "90660107", celular: "966010107" }) +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010106')`, ":'sin_doc'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010107')`, ":'sin_nombre'") +
    `reset role;\nselect count(*) from retail.clientas where id in (:'sin_doc', :'sin_nombre') and club_desde is null;\n`,
  "P0001|socia_sin_documento\nP0001|socia_sin_documento\n2"
);
caso(
  "(a) p_texto_version: la vigente (2) pasa y el evento la cita; otra → club_texto_cambio; null = la vigente",
  como(FELIPE) + ALTA("f", { numero: "90660108", nombre: "Texto Leido Prueba" }) + ALTA("g", { numero: "90660109", nombre: "Texto Nulo Prueba" }) +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010108', p_texto_version => 1)`, ":'f'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010108', p_texto_version => 3)`, ":'f'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010108', p_texto_version => 2)`, ":'f'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010109')`, ":'g'") +
    `reset role;\nselect string_agg(texto_version::text, ',') from retail.club_permisos where clienta_id in (:'f', :'g');\n`,
  "P0001|club_texto_cambio\nP0001|club_texto_cambio\nSIN_ERROR\nSIN_ERROR\n2,2"
);
caso(
  "(a) con un texto club nuevo (v3), la vigente pasa a ser la 3: pedir la 2 es club_texto_cambio y sin versión cita la 3",
  `insert into retail.club_textos (tipo, version, texto) values ('club', 3, 'Texto de prueba v3 del club.');\n` +
    como(FELIPE) + ALTA("f", { numero: "90660110", nombre: "Texto Tres Prueba" }) +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010110', p_texto_version => 2)`, ":'f'") +
    UNIR("f", "966010110") +
    `reset role;\nselect texto_version from retail.club_permisos where clienta_id = :'f';\n`,
  "P0001|club_texto_cambio\n3"
);
caso(
  "(a) sin un texto club vigente → club_sin_texto (se simula sin el texto, con su disparador apagado dentro de la transacción)",
  `alter table retail.club_textos disable trigger club_textos_solo_agregar;
delete from retail.club_textos where tipo = 'club';
` + como(FELIPE) + ALTA("f", { numero: "90660111", nombre: "Sin Texto Prueba" }) +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010111')`, ":'f'"),
  "P0001|club_sin_texto"
);
caso(
  "(a) ficha archivada, anonimizada, unida a otra o inexistente → clienta_archivada, clienta_anonimizada, clienta_unida, clienta_no_existe",
  como(FELIPE) + ALTA("arch", { numero: "90660112", nombre: "Archivada Prueba", celular: "966010112" }) +
    ALTA("anon", { numero: "90660113", nombre: "Anonimizada Prueba", celular: "966010113" }) +
    ALTA("queda", { numero: "90660114", nombre: "Queda Prueba" }) + ALTA("se_va", { nombre: "Se Va Prueba", celular: "966010115" }) +
    `select retail.archivar_clienta(:'arch', 'prueba', false, null) as _a \\gset
select retail.archivar_clienta(:'anon', 'prueba', true, null) as _b \\gset
select (retail.unir_clientas(:'queda', :'se_va', null, null)).id as _u \\gset
` +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010112')`, ":'arch'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010113')`, ":'anon'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010115')`, ":'se_va'") +
    intento(`select * from retail.unirse_al_club(gen_random_uuid(), '966010116')`),
  "P0001|clienta_archivada\nP0001|clienta_anonimizada\nP0001|clienta_unida\nP0001|clienta_no_existe"
);
caso(
  "(a) sin el módulo «Clientas» (Micaela, sin él en su rol) → 42501 clientas_sin_modulo, antes que nada",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
insert into retail.clientas (documento_numero, nombre) values ('90660117', 'Sin Modulo Prueba') returning id as f \\gset
` + como(MICAELA) + intentoCon(`select * from retail.unirse_al_club(%L, '966010117')`, ":'f'"),
  "42501|clientas_sin_modulo"
);
caso(
  "(a) medio: «ficha» vale (la integrante con el módulo); «whatsapp_propio» no es un «sí» de palabra; una venta que no existe se rechaza",
  como(MICAELA) + ALTA("f", { numero: "90660118", nombre: "Medio Ficha Prueba" }) + ALTA("g", { numero: "90660119", nombre: "Medio Malo Prueba" }) +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010118', p_medio => 'ficha')`, ":'f'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010119', p_medio => 'whatsapp_propio')`, ":'g'") +
    intentoCon(`select * from retail.unirse_al_club(%L, '966010119', p_venta_id => gen_random_uuid())`, ":'g'") +
    `reset role;\nselect medio from retail.club_permisos where clienta_id = :'f';\n`,
  "SIN_ERROR\n22023|El «sí» al club se registra en caja o en la ficha.\nP0001|Esa venta no existe: invítala sin ligarla a una venta.\nficha"
);

// =====================================================================================================================
// b. La publicidad: solo si ella escribió
// =====================================================================================================================
caso(
  "(b) «Llegó su mensaje» a una socia: publicidad desde ahora, evento publicidad/whatsapp_propio con el mensaje_personal v2, y el número que escribió pasa a ser su celular",
  como(FELIPE) + SOCIA("f", "90660201", "Publicidad Uno Prueba", "966020101") +
    `select retail.registrar_mensaje_publicidad(:'f', '+51 966 020 199', :'ubic') is not null;
reset role;
select telefono_whatsapp, publicidad_desde is not null from retail.clientas where id = :'f';
select string_agg(finalidad || ':' || accion || ':' || medio || ':' || coalesce(texto_tipo, '') || ':' || coalesce(texto_version::text, ''), ',' order by finalidad)
  from retail.club_permisos where clienta_id = :'f';
`,
  "t\n966020199|t\nclub:otorga:caja_palabra:club:2,publicidad_whatsapp:otorga:whatsapp_propio:mensaje_personal:2"
);
caso(
  "(b) idempotente: el mismo número otra vez devuelve la misma fecha sin otro evento; desde OTRO número, cambia el celular y agrega su evento (la fecha no cambia)",
  como(FELIPE) + SOCIA("f", "90660202", "Publicidad Dos Prueba", "966020201") +
    `select retail.registrar_mensaje_publicidad(:'f', '966020201', :'ubic') as d1 \\gset
select retail.registrar_mensaje_publicidad(:'f', '966020201', :'ubic') = :'d1';
reset role;
select ${EVENTOS("f")};
${como(FELIPE)}select retail.registrar_mensaje_publicidad(:'f', '966020288', :'ubic') = :'d1';
reset role;
select ${EVENTOS("f")}, (select telefono_whatsapp from retail.clientas where id = :'f');
`,
  "t\n2\nt\n3|966020288"
);
caso(
  "(b) a una clienta que NO es socia → no_es_socia; celular inválido → celular_invalido; y la ficha sigue sin publicidad",
  como(FELIPE) + ALTA("f", { numero: "90660203", nombre: "No Socia Prueba", celular: "966020301" }) +
    intentoCon(`select retail.registrar_mensaje_publicidad(%L, '966020301')`, ":'f'") +
    intentoCon(`select retail.registrar_mensaje_publicidad(%L, 'abc')`, ":'f'") +
    `reset role;\nselect publicidad_desde is null, ${EVENTOS("f")} from retail.clientas where id = :'f';\n`,
  "P0001|no_es_socia\n22023|celular_invalido\nt|0"
);
// El candado de la ley tiene nombre propio aunque club_permisos_medio_coherente también lo cubra: el día que alguien afloje
// la coherencia de los medios, la ley sigue en pie. Por eso el segundo caso lo prueba SOLO (sin el de coherencia).
const PUBLICIDAD_DE_PALABRA = ["caja_palabra", "ficha", "legado"]
  .map((m) =>
    intentoCon(
      `insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, registrado_por, nota) values (%L, 'publicidad_whatsapp', 'otorga', '${m}', ${m === "legado" ? "null, null" : "'club', 2"}, %L, 'prueba')`,
      ":'f'",
      ":'persona_felipe'"
    )
  )
  .join("");
caso(
  "(b) EL CANDADO DE LA LEY: un insert directo (como postgres) de una publicidad que se otorga de palabra, en la ficha o como legado, se rechaza",
  como(FELIPE) + SOCIA("f", "90660204", "Candado Ley Prueba", "966020401") + `reset role;\n` + PUBLICIDAD_DE_PALABRA,
  (s) => s.split("\n").length === 3 && s.split("\n").every((l) => l.startsWith("23514|"))
);
caso(
  "(b) …y lo rechaza club_permisos_publicidad_solo_por_su_mensaje por sí solo (sin el candado de coherencia de los medios, quitado dentro de la transacción)",
  como(FELIPE) + SOCIA("f", "90660210", "Candado Ley Solo Prueba", "966021001") +
    `reset role;\nalter table retail.club_permisos drop constraint club_permisos_medio_coherente;\n` + PUBLICIDAD_DE_PALABRA,
  (s) => s.split("\n").length === 3 && s.split("\n").every((l) => l.startsWith("23514|") && l.includes("club_permisos_publicidad_solo_por_su_mensaje"))
);
caso(
  "(b) …y el resto de la historia también tiene candado: el «sí» de palabra sin texto, un evento sin quién lo registra, un texto que no existe",
  como(FELIPE) + ALTA("f", { numero: "90660205", nombre: "Candado Historia Prueba" }) + `reset role;\n` +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por) values (%L, 'club', 'otorga', 'caja_palabra', %L)`, ":'f'", ":'persona_felipe'") +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version) values (%L, 'club', 'otorga', 'caja_palabra', 'club', 2)`, ":'f'") +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, registrado_por) values (%L, 'club', 'otorga', 'caja_palabra', 'club', 99, %L)`, ":'f'", ":'persona_felipe'") +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por) values (%L, 'club', 'revoca', 'baja_whatsapp', %L)`, ":'f'", ":'persona_felipe'"),
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 4 &&
      l[0].startsWith("23514|") && l[0].includes("club_permisos_otorga_con_texto") &&
      l[1].startsWith("23514|") && l[1].includes("club_permisos_con_quien_registra") &&
      l[2].startsWith("23503|") && l[2].includes("club_permisos_texto_existe") &&
      l[3].startsWith("23514|") && l[3].includes("club_permisos_medio_coherente")
    );
  }
);
caso(
  "(b) el cartel: registrar_desde_whatsapp con un DNI nuevo crea la ficha socia CON publicidad, con el número que escribió y los dos eventos por whatsapp_propio + mensaje_generico",
  como(FELIPE) +
    `select clienta_id as f, codigo_club as c from retail.registrar_desde_whatsapp('dni', '90660206', 'Cartel Nueva Prueba', '51966020601', :'ubic') \\gset
reset role;
select :'c' = codigo_club, telefono_whatsapp, club_desde is not null, publicidad_desde is not null, nombre from retail.clientas where id = :'f';
select string_agg(finalidad || ':' || medio || ':' || texto_tipo || ':' || texto_version, ',' order by finalidad) from retail.club_permisos where clienta_id = :'f';
`,
  "t|966020601|t|t|Cartel Nueva Prueba\nclub:whatsapp_propio:mensaje_generico:2,publicidad_whatsapp:whatsapp_propio:mensaje_generico:2"
);
caso(
  "(b) el cartel sobre una ficha que ya existía: la misma ficha; si ya era socia conserva su código y solo suma la publicidad; la segunda vez, nada nuevo",
  como(FELIPE) + ALTA("nosocia", { numero: "90660207", nombre: "Cartel Existe Prueba" }) + SOCIA("socia", "90660208", "Cartel Socia Prueba", "966020801") +
    `select clienta_id = :'nosocia' from retail.registrar_desde_whatsapp('dni', '90660207', null, '966020701', :'ubic');
select clienta_id = :'socia', codigo_club = :'socia_codigo' from retail.registrar_desde_whatsapp('dni', '90660208', null, '966020801', :'ubic');
select codigo_club = :'socia_codigo' from retail.registrar_desde_whatsapp('dni', '90660208', null, '966020801', :'ubic');
reset role;
select ${EVENTOS("nosocia")}, ${EVENTOS("socia")};
select string_agg(finalidad || ':' || medio, ',' order by finalidad, medio) from retail.club_permisos where clienta_id = :'socia';
`,
  "t\nt|t\nt\n2|2\nclub:caja_palabra,publicidad_whatsapp:whatsapp_propio"
);
caso(
  "(b) el cartel sin documento → documento_invalido; sin nombre (ni en la ficha ni escrito) → socia_sin_documento y no queda ficha; sin celular → celular_invalido",
  como(FELIPE) +
    intento(`select * from retail.registrar_desde_whatsapp('dni', null, 'Sin Doc Prueba', '966020901')`) +
    intento(`select * from retail.registrar_desde_whatsapp('dni', '90660209', null, '966020901')`) +
    intento(`select * from retail.registrar_desde_whatsapp('dni', '90660209', 'Con Nombre Prueba', null)`) +
    `reset role;\nselect count(*) from retail.clientas where documento_numero = '90660209';\n`,
  "22023|documento_invalido\nP0001|socia_sin_documento\n22023|celular_invalido\n0"
);

// =====================================================================================================================
// c. BAJA
// =====================================================================================================================
caso(
  "(c) BAJA desde «+51 966 030 101»: cuenta las 3 fichas con ese número (una con el celular viejo con espacios), revoca la publicidad de las 2 que la tenían, y el club sigue",
  como(FELIPE) + SOCIA("a", "90660301", "Baja Uno Prueba", "966030101") + SOCIA("b", "90660302", "Baja Dos Prueba", "966030101") +
    `select retail.registrar_mensaje_publicidad(:'a', '966030101') as _pa \\gset
select retail.registrar_mensaje_publicidad(:'b', '966030101') as _pb \\gset
reset role;
insert into retail.clientas (documento_numero, nombre, telefono_whatsapp) values ('90660303', 'Baja Vieja Prueba', '966 030 101') returning id as c \\gset
${como(FELIPE)}select retail.registrar_baja_whatsapp('+51 966 030 101', :'ubic');
reset role;
select count(*) filter (where publicidad_desde is null), count(*) filter (where club_desde is not null) from retail.clientas where id in (:'a', :'b', :'c');
select count(*), string_agg(distinct medio || ':' || finalidad || ':' || accion, ',') from retail.club_permisos where clienta_id in (:'a', :'b', :'c') and accion = 'revoca';
`,
  "3\n3|2\n2|baja_whatsapp:publicidad_whatsapp:revoca"
);
caso(
  "(c) la BAJA es idempotente (la segunda no escribe otro evento), un número sin fichas da 0, y un número inválido es celular_invalido",
  como(FELIPE) + SOCIA("a", "90660304", "Baja Doble Prueba", "966030401") +
    `select retail.registrar_mensaje_publicidad(:'a', '966030401') as _p \\gset
select retail.registrar_baja_whatsapp('966030401', :'ubic');
select retail.registrar_baja_whatsapp('966030401', :'ubic');
select retail.registrar_baja_whatsapp('966039999', :'ubic');
` + intento(`select retail.registrar_baja_whatsapp('123')`) +
    `reset role;\nselect count(*) from retail.club_permisos where clienta_id = :'a' and accion = 'revoca';\n`,
  "1\n1\n0\n22023|celular_invalido\n1"
);
caso(
  "(c) la BAJA sin el módulo → clientas_sin_modulo",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + intento(`select retail.registrar_baja_whatsapp('966030501')`),
  "42501|clientas_sin_modulo"
);

// =====================================================================================================================
// d. Solo agregar, y sin API
// =====================================================================================================================
caso(
  "(d) club_permisos: ni update, ni delete, ni truncate — tampoco como postgres (club_solo_agregar)",
  como(FELIPE) + SOCIA("f", "90660401", "Inmutable Prueba", "966040101") + `reset role;\n` +
    intentoCon(`update retail.club_permisos set medio = 'ficha' where clienta_id = %L`, ":'f'") +
    intentoCon(`delete from retail.club_permisos where clienta_id = %L`, ":'f'") +
    intento(`truncate retail.club_permisos`) +
    `select ${EVENTOS("f")};\n`,
  "P0001|club_solo_agregar\nP0001|club_solo_agregar\nP0001|club_solo_agregar\n1"
);
caso(
  "(d) club_textos: tampoco se edita, ni se borra, ni se vacía (un cambio es una versión nueva)",
  intento(`update retail.club_textos set texto = 'otro' where tipo = 'club'`) +
    intento(`delete from retail.club_textos where tipo = 'club'`) +
    // Sin CASCADE lo frena antes la llave foránea de club_permisos; con CASCADE, el disparador de las dos.
    intento(`truncate retail.club_textos cascade`),
  "P0001|club_solo_agregar\nP0001|club_solo_agregar\nP0001|club_solo_agregar"
);
caso(
  "(d) sin permisos para la API (ni anon ni authenticated leen o escriben las dos tablas), RLS encendido y SIN políticas",
  `select ${["club_permisos", "club_textos"]
    .flatMap((t) => ["anon", "authenticated"].flatMap((r) => ["select", "insert", "update", "delete"].map((p) => `has_table_privilege('${r}', 'retail.${t}', '${p}')`)))
    .map((e) => `(${e})::int`)
    .join(" + ")};
select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class where oid in ('retail.club_permisos'::regclass, 'retail.club_textos'::regclass);
select count(*) from pg_policy where polrelid in ('retail.club_permisos'::regclass, 'retail.club_textos'::regclass);
` + como(FELIPE) + intento(`select count(*) from retail.club_permisos`) + intento(`select count(*) from retail.club_textos`),
  "0\nclub_permisos:true,club_textos:true\n0\n42501|permission denied for table club_permisos\n42501|permission denied for table club_textos"
);
caso(
  "(d) los ayudantes no los ejecuta nadie de la API (ni PUBLIC); las funciones de la web, solo authenticated (no anon)",
  `select bool_or(has_function_privilege('anon', f::regprocedure, 'execute') or has_function_privilege('authenticated', f::regprocedure, 'execute'))
  from unnest(array[${AYUDANTES.map((f) => `'${f}'`).join(", ")}]) f;
select bool_or(a.grantee = 0) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 where p.oid in (${[...AYUDANTES, ...DE_LA_WEB].map((f) => `'${f}'::regprocedure`).join(", ")}) and a.privilege_type = 'EXECUTE';
select bool_and(has_function_privilege('authenticated', f::regprocedure, 'execute')), bool_or(has_function_privilege('anon', f::regprocedure, 'execute'))
  from unnest(array[${DE_LA_WEB.map((f) => `'${f}'`).join(", ")}]) f;
select bool_and(prosecdef) from pg_proc where oid in (${AYUDANTES.map((f) => `'${f}'::regprocedure`).join(", ")});
select bool_and(prosecdef and array_to_string(proconfig, ',') = 'search_path=retail, public, extensions') from pg_proc where oid in (${DE_LA_WEB.map((f) => `'${f}'::regprocedure`).join(", ")});
`,
  "f\nf\nt|f\nf\nt"
);

// =====================================================================================================================
// e. Candados de clientas
// =====================================================================================================================
caso(
  "(e) estados imposibles por update directo (como postgres): socia sin celular, con un celular fuera de formato, sin documento, sin nombre",
  como(FELIPE) + SOCIA("f", "90660501", "Candado Socia Prueba", "966050101") + `reset role;\n` +
    intentoCon(`update retail.clientas set telefono_whatsapp = null where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set telefono_whatsapp = '966 050 101' where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set documento_numero = null where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set nombre = '  ' where id = %L`, ":'f'"),
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 4 &&
      l[0].includes("clientas_socia_con_celular") && l[1].includes("clientas_socia_con_celular") &&
      l[2].includes("clientas_socia_con_documento_y_nombre") && l[3].includes("clientas_socia_con_documento_y_nombre") &&
      l.every((x) => x.startsWith("23514|"))
    );
  }
);
caso(
  "(e) publicidad sin club, código sin club, club sin código, código con otro formato",
  como(FELIPE) + ALTA("f", { numero: "90660502", nombre: "Candado Club Prueba", celular: "966050201" }) + `reset role;\n` +
    intentoCon(`update retail.clientas set publicidad_desde = now() where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set codigo_club = 'C-9990' where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set club_desde = now() where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set club_desde = now(), codigo_club = 'X-1' where id = %L`, ":'f'"),
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 4 &&
      l[0].includes("clientas_publicidad_exige_club") && l[1].includes("clientas_codigo_si_y_solo_si_club") &&
      l[2].includes("clientas_codigo_si_y_solo_si_club") && l[3].includes("clientas_codigo_club_formato") &&
      l.every((x) => x.startsWith("23514|"))
    );
  }
);
caso(
  "(e) una anonimizada con año de nacimiento o con club → clientas_anonimizada_sin_club",
  como(FELIPE) + ALTA("f", { numero: "90660503", nombre: "Candado Anonimizada Prueba" }) +
    `select retail.archivar_clienta(:'f', 'prueba', true, null) as _a \\gset\nreset role;\n` +
    intentoCon(`update retail.clientas set cumple_anio = 1990 where id = %L`, ":'f'"),
  (s) => s.startsWith("23514|") && s.includes("clientas_anonimizada_sin_club")
);
caso(
  "(e) editar_clienta a una socia: borrarle el celular → socia_sin_celular; el documento o el nombre → socia_sin_documento; cambiarle el celular, sí",
  como(FELIPE) + SOCIA("f", "90660504", "Editar Socia Prueba", "966050401") +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '90660504', 'Editar Socia Prueba', null)`, ":'f'") +
    intentoCon(`select retail.editar_clienta(%L, 'dni', null, 'Editar Socia Prueba', '966050401')`, ":'f'") +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '90660504', '', '966050401')`, ":'f'") +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '90660504', 'Editar Socia Prueba', '966 050 499')`, ":'f'") +
    `reset role;\nselect telefono_whatsapp, club_desde is not null from retail.clientas where id = :'f';\n`,
  "P0001|socia_sin_celular\nP0001|socia_sin_documento\nP0001|socia_sin_documento\nSIN_ERROR\n966050499|t"
);

// =====================================================================================================================
// f. Anonimizar
// =====================================================================================================================
caso(
  "(f) anonimizar a una socia con publicidad: primero los dos `revoca` (medio anonimizar, con quien lo hizo), después la ficha sin club, sin publicidad, sin código y sin año; la actividad lo cuenta",
  como(FELIPE) + ALTA("f", { numero: "90660601", nombre: "Anonimizar Socia Prueba", celular: "966060101" }) +
    `select codigo_club as c from retail.unirse_al_club(:'f', '966060101', 5::smallint, 5::smallint, 1985::smallint) \\gset
select retail.registrar_mensaje_publicidad(:'f', '966060101') as _p \\gset
select retail.archivar_clienta(:'f', 'lo pidió', true, null) as _a \\gset
reset role;
select club_desde is null, publicidad_desde is null, codigo_club is null, cumple_anio is null, anonimizada from retail.clientas where id = :'f';
select string_agg(finalidad || ':' || accion || ':' || medio, ',' order by finalidad), bool_and(registrado_por = :'persona_felipe')
  from retail.club_permisos where clienta_id = :'f' and accion = 'revoca';
select detalle ->> 'permisos_revocados' from retail.actividad where modulo = 'clientas' and accion = 'anonimizar' and registro_id = :'f';
select count(*) from retail.clientas where codigo_club = :'c';
`,
  "t|t|t|t|t\nclub:revoca:anonimizar,publicidad_whatsapp:revoca:anonimizar|t\n2\n0"
);
caso(
  "(f) anonimizar a quien no es socia no escribe eventos; archivar SIN anonimizar conserva el club",
  como(FELIPE) + ALTA("n", { numero: "90660602", nombre: "Anonimizar No Socia Prueba" }) + SOCIA("s", "90660603", "Archivar Socia Prueba", "966060301") +
    `select retail.archivar_clienta(:'n', 'lo pidió', true, null) as _a \\gset
select retail.archivar_clienta(:'s', 'se mudó', false, null) as _b \\gset
reset role;
select ${EVENTOS("n")}, (select club_desde is not null and codigo_club = :'s_codigo' from retail.clientas where id = :'s');
`,
  "0|t"
);

// =====================================================================================================================
// g. Unir
// =====================================================================================================================
caso(
  "(g) la que queda NO era socia y la que se va SÍ (con publicidad): la que queda toma su club, su publicidad, su código y SU celular; la unida queda sin nada y sus eventos se quedan con ella",
  como(FELIPE) + ALTA("queda", { numero: "90660701", nombre: "Unir Queda Prueba", celular: "966070101" }) +
    SOCIA("se_va", "90660702", "Unir Se Va Prueba", "966070201") +
    `select retail.registrar_mensaje_publicidad(:'se_va', '966070201') as pub \\gset
select club_desde as club_se_va from retail.clientas where id = :'se_va' \\gset
select (u).codigo_club = :'se_va_codigo', (u).club_desde = :'club_se_va', (u).publicidad_desde = :'pub', (u).telefono_whatsapp
  from (select retail.unir_clientas(:'queda', :'se_va', null, null) as u) x;
reset role;
select club_desde is null and publicidad_desde is null and codigo_club is null and anonimizada from retail.clientas where id = :'se_va';
select ${EVENTOS("queda")}, ${EVENTOS("se_va")};
`,
  "t|t|t|966070201\nt\n0|2"
);
caso(
  "(g) las dos socias: la que queda conserva SU código y toma el club más antiguo (de la otra)",
  como(FELIPE) + SOCIA("queda", "90660703", "Unir Dos Queda Prueba", "966070301") + SOCIA("se_va", "90660704", "Unir Dos Se Va Prueba", "966070401") +
    `reset role;
update retail.clientas set club_desde = club_desde - interval '400 days' where id = :'se_va' returning club_desde as viejo \\gset
${como(FELIPE)}select (u).codigo_club = :'queda_codigo', (u).club_desde = :'viejo', (u).telefono_whatsapp
  from (select retail.unir_clientas(:'queda', :'se_va', null, null) as u) x;
`,
  "t|t|966070301"
);
caso(
  "(g) la que queda tiene publicidad y la que se va no: se queda con su celular (el que escribió)",
  como(FELIPE) + SOCIA("queda", "90660705", "Unir Tres Queda Prueba", "966070501") + SOCIA("se_va", "90660706", "Unir Tres Se Va Prueba", "966070601") +
    `select retail.registrar_mensaje_publicidad(:'queda', '966070501') as _p \\gset
select (u).telefono_whatsapp, (u).publicidad_desde is not null from (select retail.unir_clientas(:'queda', :'se_va', null, null) as u) x;
`,
  "966070501|t"
);

// =====================================================================================================================
// h. registrar_clienta / editar_clienta: sin permiso de WhatsApp, con el año
// =====================================================================================================================
caso(
  "(h) una sola firma de cada una; ya no reciben p_acepta_whatsapp ni p_revoca_whatsapp, y sí p_cumple_anio",
  `select string_agg(p.proname || '=' || (select count(*) from pg_proc q where q.pronamespace = p.pronamespace and q.proname = p.proname), ',' order by p.proname)
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('registrar_clienta', 'editar_clienta', 'unirse_al_club');
select pg_get_function_identity_arguments(oid) ~ 'whatsapp_consentimiento|p_acepta_whatsapp|p_revoca_whatsapp', pg_get_function_identity_arguments(oid) ~ 'p_cumple_anio smallint'
  from pg_proc where oid in ('${REGISTRAR}'::regprocedure, '${EDITAR}'::regprocedure) order by proname;
` + como(FELIPE) + intento(`select retail.registrar_clienta(p_documento_numero => '90660801', p_acepta_whatsapp => true)`),
  "editar_clienta=1,registrar_clienta=1,unirse_al_club=1\nf|t\nf|t\n42883|function retail.registrar_clienta(p_documento_numero => unknown, p_acepta_whatsapp => boolean) does not exist"
);
caso(
  "(h) registrarse NO es unirse al club: con celular y cumpleaños, sin club, sin publicidad, sin eventos y sin el permiso de antes; el año se guarda y el celular, normalizado",
  como(FELIPE) +
    `select retail.registrar_clienta('dni', '90660802', 'Registro Solo Prueba', '+51 966 080 201', 3::smallint, 4::smallint, 1990::smallint) as f \\gset
reset role;
select telefono_whatsapp, cumple_anio, club_desde is null, publicidad_desde is null, codigo_club is null, whatsapp_consentimiento_en is null, ${EVENTOS("f")}
  from retail.clientas where id = :'f';
`,
  "966080201|1990|t|t|t|t|0"
);
caso(
  "(h) un celular inválido al registrar o editar → celular_invalido; vacío es sin celular",
  como(FELIPE) + ALTA("f", { numero: "90660803", nombre: "Celular Malo Prueba" }) +
    intento(`select retail.registrar_clienta('dni', '90660804', 'Otro', '12-34')`) +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '90660803', 'Celular Malo Prueba', '81234567')`, ":'f'") +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '90660803', 'Celular Malo Prueba', '   ')`, ":'f'"),
  "22023|celular_invalido\n22023|celular_invalido\nSIN_ERROR"
);
caso(
  "(h) registrar y editar NO tocan los permisos: el permiso de antes (legado) sigue; la socia sigue socia y con publicidad; el año se edita",
  `insert into retail.clientas (documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en) values ('90660805', 'Legado Sigue Prueba', '966080501', now()) returning id as l \\gset\n` +
    como(FELIPE) + SOCIA("s", "90660806", "Editar No Toca Prueba", "966080601") +
    `select retail.registrar_mensaje_publicidad(:'s', '966080601') as _p \\gset
select retail.registrar_clienta('dni', '90660805', 'Legado Sigue Prueba Dos') as _r \\gset
select retail.editar_clienta(:'l', 'dni', '90660805', 'Legado Sigue Prueba', '966080501') as _e1 \\gset
select retail.registrar_clienta('dni', '90660806', 'Editar No Toca Prueba', '966080601') as _r2 \\gset
select retail.editar_clienta(:'s', 'dni', '90660806', 'Editar No Toca Prueba', '966080601', p_cumple_anio => 1980::smallint) as _e2 \\gset
reset role;
select whatsapp_consentimiento_en is not null, club_desde is null from retail.clientas where id = :'l';
select club_desde is not null, publicidad_desde is not null, cumple_anio, ${EVENTOS("s")} from retail.clientas where id = :'s';
`,
  "t|t\nt|t|1980|2"
);

// =====================================================================================================================
// i. Lecturas
// =====================================================================================================================
caso(
  "(i) resumen_clienta_caja: no socia, socia, y socia con publicidad (con su celular y cumpleaños)",
  como(FELIPE) + ALTA("n", { numero: "90660901", nombre: "Resumen No Prueba", celular: "966090101" }) +
    ALTA("s", { numero: "90660902", nombre: "Resumen Si Prueba" }) +
    `select * from retail.resumen_clienta_caja(:'n');
select codigo_club as c from retail.unirse_al_club(:'s', '966090201', 12::smallint, 8::smallint) \\gset
select es_socia, codigo_club = :'c', club_desde is not null, con_publicidad, celular, cumple_dia, cumple_mes from retail.resumen_clienta_caja(:'s');
select retail.registrar_mensaje_publicidad(:'s', '966090201') as _p \\gset
select con_publicidad from retail.resumen_clienta_caja(:'s');
select count(*) from retail.resumen_clienta_caja(gen_random_uuid());
`,
  "f|||f|966090101||\nt|t|t|f|966090201|12|8\nt\n0"
);
caso(
  "(i) resumen_clienta_caja sin el módulo → clientas_sin_modulo; anon no la ejecuta",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) + intento(`select * from retail.resumen_clienta_caja(gen_random_uuid())`) +
    comoAnon + intento(`select * from retail.resumen_clienta_caja(gen_random_uuid())`),
  (s) => s.split("\n")[0] === "42501|clientas_sin_modulo" && /^42501\|permission denied for (function|schema)/.test(s.split("\n")[1] ?? "")
);
caso(
  "(i) fn_club_textos_vigentes: los tres textos v2 EXACTOS del ADR, también para una cuenta SIN el módulo (el ticket de una cajera); anon no",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) +
    `select tipo || '|' || version || '|' || (texto = case tipo when 'club' then $t$${TEXTO_CLUB}$t$ when 'mensaje_personal' then $t$${TEXTO_PERSONAL}$t$ else $t$${TEXTO_GENERICO}$t$ end)
  from retail.fn_club_textos_vigentes() order by tipo;
` + comoAnon + intento(`select * from retail.fn_club_textos_vigentes()`),
  (s) => {
    const l = s.split("\n");
    return l.slice(0, 3).join("\n") === "club|2|true\nmensaje_generico|2|true\nmensaje_personal|2|true" && /^42501\|permission denied/.test(l[3] ?? "");
  }
);
caso(
  "(i) los textos del club tienen sus candados: el mensaje personal sin {codigo}, un tipo que no existe, una versión repetida",
  intento(`insert into retail.club_textos (tipo, version, texto) values ('mensaje_personal', 3, 'Hola, sin código')`) +
    intento(`insert into retail.club_textos (tipo, version, texto) values ('otro', 1, 'x')`) +
    intento(`insert into retail.club_textos (tipo, version, texto) values ('club', 2, 'x')`),
  (s) => {
    const l = s.split("\n");
    return l[0].includes("club_textos_personal_con_codigo") && l[1].includes("club_textos_tipo_valido") && l[2].startsWith("23505|");
  }
);
caso(
  "(i) buscar_clienta encuentra a la socia por su código (C-0xxx, sin guion, en minúsculas o dentro del mensaje que llegó) y por su celular con +51 y espacios",
  como(FELIPE) + SOCIA("s", "90660903", "Buscar Codigo Prueba", "966090301") +
    `select substr(:'s_codigo', 3)::int as n \\gset
select (select count(*) from retail.buscar_clienta(:'s_codigo')),
       (select count(*) from retail.buscar_clienta('c' || :n)),
       (select count(*) from retail.buscar_clienta('Hola CAYLA, quiero recibir… (Club ' || :'s_codigo' || ')')),
       (select count(*) from retail.buscar_clienta('+51 966 090 301')),
       (select id = :'s' from retail.buscar_clienta(:'s_codigo') limit 1);
`,
  "1|1|1|1|t"
);

// =====================================================================================================================
// j. guardar_whatsapp_tienda
// =====================================================================================================================
caso(
  "(j) el líder guarda el WhatsApp de la tienda: normalizado, con rastro en configuracion_historial; vacío lo quita; la cuenta lo lee de ubicaciones",
  como(FELIPE) +
    `select retail.guardar_whatsapp_tienda(:'ubic', '+51 987 654 321') as _g \\gset
${como(MICAELA)}select whatsapp_numero from retail.ubicaciones where id = :'ubic';
${como(FELIPE)}select retail.guardar_whatsapp_tienda(:'ubic', '') as _q \\gset
reset role;
select whatsapp_numero is null from retail.ubicaciones where id = :'ubic';
select string_agg(coalesce(detalle ->> 'despues', 'null'), ',' order by hecho_en, id) from retail.configuracion_historial
 where que = 'whatsapp_tienda' and detalle ->> 'ubicacion_id' = :'ubic' and hecho_por = :'persona_felipe';
`,
  "987654321\nt\n987654321,null"
);
caso(
  "(j) un número que no es un celular → whatsapp_tienda_invalido; el taller no es tienda; sin Configuración (Micaela) no puede",
  como(FELIPE) +
    intentoCon(`select retail.guardar_whatsapp_tienda(%L, '12345678')`, ":'ubic'") +
    intentoCon(`select retail.guardar_whatsapp_tienda(%L, '812345678')`, ":'ubic'") +
    intentoCon(`select retail.guardar_whatsapp_tienda(%L, '987654321')`, ":'taller'") +
    como(MICAELA) + intentoCon(`select retail.guardar_whatsapp_tienda(%L, '987654321')`, ":'tru'"),
  "22023|whatsapp_tienda_invalido\n22023|whatsapp_tienda_invalido\nP0001|Solo una tienda tiene WhatsApp del club.\nP0001|Cambiar el WhatsApp de la tienda necesita el módulo «Configuración» en tu rol."
);
caso(
  "(j) el candado de la tabla: un update directo fuera de formato lo rechaza ubicaciones_whatsapp_numero_formato",
  intentoCon(`update retail.ubicaciones set whatsapp_numero = '987 654 321' where id = %L`, ":'ubic'"),
  (s) => s.startsWith("23514|") && s.includes("ubicaciones_whatsapp_numero_formato")
);

// =====================================================================================================================
// k. Legado
// =====================================================================================================================
/** Corre el SQL y devuelve también los avisos (NOTICE) de psql, que salen por stderr. */
function correrConAvisos(sql) {
  const r = spawnSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, salida: (r.stdout ?? "").trim(), avisos: r.stderr ?? "" };
}
{
  const nombre =
    "(k) legado: el permiso marcado en caja pasa a socia SIN publicidad (su fecha como club_desde, código, celular normalizado y un evento `legado` con esa fecha); sin celular válido o sin documento queda fuera, y el aviso los cuenta";
  const r = correrConAvisos(
    `${PRELUDIO}insert into retail.clientas (documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en) values
  ('90661001', 'Legado Bien Prueba', '+51 966 100 101', '2026-06-01 10:00-05') returning id as bien \\gset
insert into retail.clientas (documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en)
  values ('90661002', 'Legado Sin Celular Prueba', '12345', now()) returning id as sin_cel \\gset
insert into retail.clientas (nombre, telefono_whatsapp, whatsapp_consentimiento_en)
  values ('Legado Sin Documento Prueba', '966100301', now()) returning id as sin_doc \\gset
reset role;
${MIGRACION}
set local search_path = retail, public, extensions;
select telefono_whatsapp, club_desde = '2026-06-01 10:00-05'::timestamptz, codigo_club ~ '^C-[0-9]{4,}$', publicidad_desde is null from retail.clientas where id = :'bien';
select finalidad || ':' || accion || ':' || medio, created_at = '2026-06-01 10:00-05'::timestamptz, texto_version is null, registrado_por is null, nota
  from retail.club_permisos where clienta_id = :'bien';
select count(*) from retail.clientas where id in (:'sin_cel', :'sin_doc') and club_desde is null;
${MIGRACION}
select ${EVENTOS("bien")};
rollback;
`
  );
  const avisos = [...r.avisos.matchAll(/Legado del club \(ADR-0288\): (\d+) ficha\(s\)[^;]*; (\d+) quedaron fuera por no tener un celular válido y (\d+) por no tener documento o nombre/g)].map(
    (m) => `${m[1]}/${m[2]}/${m[3]}`
  );
  const obtenido = `${r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.avisos.split("\n").find((l) => l.includes("ERROR")) ?? r.avisos}`}\navisos: ${avisos.join(" ")}`;
  const esperado =
    "966100101|t|t|t\nclub:otorga:legado|t|t|t|marcado en caja antes de ADR-0288: socia sin publicidad\n2\n1\n" +
    // El primer pegado toca 1 y deja fuera 1 + 1 (más las del seed/otras pruebas, si tuvieran permiso: cero); el segundo, 0.
    "avisos: 1/1/1 0/1/1";
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

// =====================================================================================================================
// n. Cambio de celular (ajuste d: el arquitecto, 2026-09-30; la publicidad es del número desde el que ella escribió)
// =====================================================================================================================
/** «Llegó su mensaje» desde ese número (la cuenta ya elegida). */
const MENSAJE = (alias, celular) => `select retail.registrar_mensaje_publicidad(:'${alias}', '${celular}', :'ubic') as _m_${alias} \\gset\n`;
/**
 * Corre un día hacia atrás los eventos del club de esas fichas: la preparación ocurre en la MISMA transacción que la prueba, y
 * sin esto su mensaje contaría como «registrado en esta transacción» (lo que el disparador deja pasar). El disparador de solo
 * agregar se apaga y se vuelve a encender dentro de la transacción, que termina en ROLLBACK. Deja la cuenta en postgres.
 */
const DE_AYER = (...alias) => `reset role;
alter table retail.club_permisos disable trigger club_permisos_solo_agregar;
update retail.club_permisos set created_at = created_at - interval '1 day' where clienta_id in (${alias.map((a) => `:'${a}'`).join(", ")});
alter table retail.club_permisos enable trigger club_permisos_solo_agregar;
`;
caso(
  "(n) editar_clienta le cambia el celular a una socia con publicidad: se la quita en la misma transacción (evento revoca/publicidad/cambio_celular con quien lo registra y sin texto, y la actividad); sigue socia con su código y el celular nuevo, normalizado",
  como(FELIPE) + SOCIA("f", "90661101", "Cambio Celular Uno Prueba", "966110101") + MENSAJE("f", "966110101") + DE_AYER("f") + como(FELIPE) +
    `select retail.editar_clienta(:'f', 'dni', '90661101', 'Cambio Celular Uno Prueba', '+51 966 110 199') as _e \\gset
reset role;
select telefono_whatsapp, club_desde is not null, codigo_club = :'f_codigo', publicidad_desde is null from retail.clientas where id = :'f';
select string_agg(finalidad || ':' || accion || ':' || medio, ',' order by created_at, finalidad, accion) from retail.club_permisos where clienta_id = :'f';
select registrado_por = :'persona_felipe', texto_tipo is null and texto_version is null, created_at = now()
  from retail.club_permisos where clienta_id = :'f' and medio = 'cambio_celular';
select descripcion, persona_id = :'persona_felipe' from retail.actividad
 where modulo = 'clientas' and accion = 'publicidad_cambio_celular' and registro_id = :'f';
`,
  "966110199|t|t|t\nclub:otorga:caja_palabra,publicidad_whatsapp:otorga:whatsapp_propio,publicidad_whatsapp:revoca:cambio_celular\nt|t|t\n" +
    "quitó la publicidad por WhatsApp de una clienta porque cambió su celular|t"
);
caso(
  "(n) …con el MISMO número escrito distinto («+51 966 …»), o cambiando otra cosa de la ficha, no se le quita nada",
  como(FELIPE) + SOCIA("f", "90661201", "Mismo Numero Prueba", "966120101") + MENSAJE("f", "966120101") + DE_AYER("f") + como(FELIPE) +
    `select retail.editar_clienta(:'f', 'dni', '90661201', 'Mismo Numero Prueba', '+51 966 120 101') as _e1 \\gset
select retail.editar_clienta(:'f', 'dni', '90661201', 'Mismo Numero Prueba Editada', '966120101', p_cumple_anio => 1990::smallint) as _e2 \\gset
reset role;
select telefono_whatsapp, publicidad_desde is not null, nombre, ${EVENTOS("f")} from retail.clientas where id = :'f';
`,
  "966120101|t|Mismo Numero Prueba Editada|2"
);
caso(
  "(n) a una socia SIN publicidad, o a quien no es socia, se le cambia el celular sin ningún evento ni actividad del club",
  como(FELIPE) + SOCIA("s", "90661301", "Sin Publicidad Prueba", "966130101") +
    ALTA("n", { numero: "90661302", nombre: "No Socia Celular Prueba", celular: "966130201" }) +
    `select retail.editar_clienta(:'s', 'dni', '90661301', 'Sin Publicidad Prueba', '966130199') as _e1 \\gset
select retail.editar_clienta(:'n', 'dni', '90661302', 'No Socia Celular Prueba', '966130299') as _e2 \\gset
reset role;
select string_agg(telefono_whatsapp, ',' order by documento_numero) from retail.clientas where id in (:'s', :'n');
select ${EVENTOS("s")}, ${EVENTOS("n")}, (select count(*) from retail.actividad where accion = 'publicidad_cambio_celular' and registro_id in (:'s', :'n'));
`,
  "966130199,966130299\n1|0|0"
);
caso(
  "(n) …y la recupera cuando escribe desde el número nuevo («Llegó su mensaje»): vuelve la publicidad con su evento; el club y el código, intactos",
  como(FELIPE) + SOCIA("f", "90661401", "Recupera Prueba", "966140101") + MENSAJE("f", "966140101") + DE_AYER("f") + como(FELIPE) +
    `select retail.editar_clienta(:'f', 'dni', '90661401', 'Recupera Prueba', '966140199') as _e \\gset
select retail.registrar_mensaje_publicidad(:'f', '966140199', :'ubic') is not null;
reset role;
select telefono_whatsapp, publicidad_desde is not null, club_desde is not null, codigo_club = :'f_codigo' from retail.clientas where id = :'f';
select count(*) filter (where finalidad = 'publicidad_whatsapp' and accion = 'otorga'), count(*) filter (where medio = 'cambio_celular'), count(*)
  from retail.club_permisos where clienta_id = :'f';
`,
  "t\n966140199|t|t|t\n2|1|4"
);
caso(
  "(n) «Llegó su mensaje» y el cartel desde OTRO número CONSERVAN la publicidad (con su fecha) y el celular pasa a ser el que escribió: ningún revoca (ella escribió desde el nuevo)",
  como(FELIPE) + SOCIA("f", "90661501", "Otro Numero Mensaje Prueba", "966150101") + SOCIA("g", "90661502", "Otro Numero Cartel Prueba", "966150201") +
    MENSAJE("f", "966150101") + MENSAJE("g", "966150201") + DE_AYER("f", "g") +
    `select publicidad_desde as pub_f from retail.clientas where id = :'f' \\gset
select publicidad_desde as pub_g from retail.clientas where id = :'g' \\gset
` + como(FELIPE) +
    `select retail.registrar_mensaje_publicidad(:'f', '966150199', :'ubic') = :'pub_f';
select codigo_club = :'g_codigo' from retail.registrar_desde_whatsapp('dni', '90661502', null, '966150299', :'ubic');
reset role;
select string_agg(telefono_whatsapp || ':' || (publicidad_desde = (case when id = :'f' then :'pub_f' else :'pub_g' end)::timestamptz), ',' order by documento_numero)
  from retail.clientas where id in (:'f', :'g');
select count(*) filter (where accion = 'revoca'), count(*) filter (where finalidad = 'publicidad_whatsapp' and accion = 'otorga')
  from retail.club_permisos where clienta_id in (:'f', :'g');
`,
  "t\nt\n966150199:true,966150299:true\n0|4"
);
caso(
  "(n) EL DISPARADOR (update directo, como postgres): cambiar el celular de una socia con publicidad y conservarla → celular_con_publicidad; quitándosela en el mismo update, pasa; con su mensaje registrado en ESTA transacción, pasa; a una socia sin publicidad, pasa",
  como(FELIPE) + SOCIA("f", "90661601", "Disparador Uno Prueba", "966160101") + SOCIA("g", "90661602", "Disparador Dos Prueba", "966160201") +
    SOCIA("h", "90661603", "Disparador Tres Prueba", "966160301") + MENSAJE("f", "966160101") + MENSAJE("g", "966160201") + DE_AYER("f", "g") +
    intentoCon(`update retail.clientas set telefono_whatsapp = '966160199' where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set telefono_whatsapp = '966160199', publicidad_desde = null where id = %L`, ":'f'") +
    intentoCon(
      `insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, registrado_por) values (%L, 'publicidad_whatsapp', 'otorga', 'whatsapp_propio', 'mensaje_personal', 2, %L)`,
      ":'g'",
      ":'persona_felipe'"
    ) +
    intentoCon(`update retail.clientas set telefono_whatsapp = '966160299' where id = %L`, ":'g'") +
    intentoCon(`update retail.clientas set telefono_whatsapp = '966160399' where id = %L`, ":'h'") +
    `select string_agg(telefono_whatsapp || ':' || (publicidad_desde is not null), ',' order by documento_numero) from retail.clientas where id in (:'f', :'g', :'h');\n`,
  "P0001|celular_con_publicidad\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR\n966160199:false,966160299:true,966160399:false"
);
caso(
  "(n) registrar_clienta (el upsert por documento) con OTRO celular sobre una socia con publicidad se la quita igual (revoca/cambio_celular, con quien lo registra); sin celular, o con el mismo escrito distinto, no",
  como(FELIPE) + SOCIA("f", "90661701", "Alta Cambio Prueba", "966170101") + MENSAJE("f", "966170101") + DE_AYER("f") + como(FELIPE) +
    `select retail.registrar_clienta('dni', '90661701', null, null) = :'f';
select retail.registrar_clienta('dni', '90661701', null, '+51 966 170 101') = :'f';
reset role;
select publicidad_desde is not null, ${EVENTOS("f")} from retail.clientas where id = :'f';
${como(FELIPE)}select retail.registrar_clienta('dni', '90661701', null, '966170199') = :'f';
reset role;
select telefono_whatsapp, club_desde is not null, publicidad_desde is null from retail.clientas where id = :'f';
select string_agg(finalidad || ':' || medio || ':' || (registrado_por = :'persona_felipe'), ',') from retail.club_permisos where clienta_id = :'f' and accion = 'revoca';
`,
  "t\nt\nt|2\nt\n966170199|t|t\npublicidad_whatsapp:cambio_celular:true"
);
caso(
  "(n) unir no choca con el disparador: dos socias con publicidad desde celulares distintos → queda el celular de la que queda; la que queda sin publicidad y la otra con → queda el de la otra, con su publicidad",
  como(FELIPE) + SOCIA("q1", "90661801", "Unir Cel Queda Uno Prueba", "966180101") + SOCIA("v1", "90661802", "Unir Cel Va Uno Prueba", "966180201") +
    SOCIA("q2", "90661803", "Unir Cel Queda Dos Prueba", "966180301") + SOCIA("v2", "90661804", "Unir Cel Va Dos Prueba", "966180401") +
    MENSAJE("q1", "966180101") + MENSAJE("v1", "966180201") + MENSAJE("v2", "966180401") + DE_AYER("q1", "v1", "q2", "v2") + como(FELIPE) +
    `select (u).telefono_whatsapp, (u).publicidad_desde is not null from (select retail.unir_clientas(:'q1', :'v1', null, null) as u) x;
select (u).telefono_whatsapp, (u).publicidad_desde is not null from (select retail.unir_clientas(:'q2', :'v2', null, null) as u) x;
reset role;
select count(*) from retail.club_permisos where clienta_id in (:'q1', :'v1', :'q2', :'v2') and accion = 'revoca';
`,
  "966180101|t\n966180401|t\n0"
);
caso(
  "(n) la historia: un revoca por cambio_celular exige quien lo registra y solo quita publicidad (ni la da, ni quita el club); el ayudante sin responsable → responsable_requerido, y sobre una ficha sin publicidad no escribe nada",
  como(FELIPE) + SOCIA("f", "90661901", "Historia Cambio Prueba", "966190101") + `reset role;\n` +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio) values (%L, 'publicidad_whatsapp', 'revoca', 'cambio_celular')`, ":'f'") +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por) values (%L, 'club', 'revoca', 'cambio_celular', %L)`, ":'f'", ":'persona_felipe'") +
    intentoCon(`insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por) values (%L, 'publicidad_whatsapp', 'otorga', 'cambio_celular', %L)`, ":'f'", ":'persona_felipe'") +
    intentoCon(`select retail.fn_club_quitar_publicidad_por_celular(%L, null)`, ":'f'") +
    intentoCon(`select retail.fn_club_quitar_publicidad_por_celular(%L, %L)`, ":'f'", ":'persona_felipe'") +
    `select ${EVENTOS("f")};\n`,
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 6 &&
      l[0].startsWith("23514|") && l[0].includes("club_permisos_con_quien_registra") &&
      l[1].startsWith("23514|") && l[1].includes("club_permisos_medio_coherente") &&
      l[2].startsWith("23514|") &&
      l[3] === "42501|responsable_requerido" && l[4] === "SIN_ERROR" && l[5] === "1"
    );
  }
);

// =====================================================================================================================
// l. Estructura y pegado
// =====================================================================================================================
caso(
  "(l) los md5 «después» de la sección 0 son los de las funciones vivas (las dos firmas viejas ya no existen)",
  VERSIONES.map(
    (v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`
  ).join(""),
  VERSIONES.map((v) => v.despues ?? "NO_EXISTE").join("\n")
);
caso(
  `(l) las ${CREADAS.length} funciones que crea el archivo están vivas con el cuerpo del archivo (una sola firma cada una)`,
  CREADAS.map(
    (f) =>
      `select '${f}' || ':' || count(*) || ':' || bool_and(${md5Norm("p.prosrc")} = ${md5Norm(`$cuerpo_1b$${cuerpoDe(f)}$cuerpo_1b$`)}) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = '${f.slice(7)}';\n`
  ).join(""),
  CREADAS.map((f) => `${f}:1:true`).join("\n")
);
// Una foto de todo lo que la migración toca: funciones (cuerpo, permisos, security definer, search_path), columnas de
// clientas y ubicaciones, candados, índices, disparadores, RLS y permisos de las tablas nuevas, y los textos. Una línea: su md5.
const FOTO = `reset role;
select md5(string_agg(x, '|' order by x)) from (
  select p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '') || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${CREADAS.map((f) => `'${f.slice(7)}'`).join(", ")})
  union all
  select 'col:' || a.attrelid::regclass || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':'
         || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || coalesce(col_description(a.attrelid, a.attnum), '')
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in ('retail.clientas'::regclass, 'retail.ubicaciones'::regclass, 'retail.club_permisos'::regclass, 'retail.club_textos'::regclass)
     and a.attnum > 0 and not a.attisdropped
  union all
  select 'con:' || conrelid::regclass || ':' || conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated from pg_constraint
   where conrelid in ('retail.clientas'::regclass, 'retail.ubicaciones'::regclass, 'retail.club_permisos'::regclass, 'retail.club_textos'::regclass)
  union all
  select 'idx:' || indexdef from pg_indexes where schemaname = 'retail' and tablename in ('clientas', 'ubicaciones', 'club_permisos', 'club_textos')
  union all
  select 'trg:' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text from pg_trigger t
   where not t.tgisinternal and t.tgrelid in ('retail.club_permisos'::regclass, 'retail.club_textos'::regclass, 'retail.clientas'::regclass)
  union all
  select 'rel:' || relname || ':' || relrowsecurity::text || ':' || coalesce(array_to_string(relacl, ','), '') from pg_class
   where oid in ('retail.club_permisos'::regclass, 'retail.club_textos'::regclass, 'retail.clientas_codigo_club_seq'::regclass)
  union all
  select 'txt:' || tipo || ':' || version || ':' || texto from retail.club_textos
) f(x);
`;
const PEGAR = `reset role;\n${MIGRACION}\nset local search_path = retail, public, extensions;\n`;
caso(
  "(l) pegarla otra vez (entera, las dos partes) deja todo igual: funciones, permisos, columnas, candados, índices, disparadores, RLS y textos",
  FOTO + PEGAR + FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 2 && l[0] === l[1];
  }
);
caso(
  "(l) y cada parte por separado, en orden y dos veces (como en el SQL Editor), también",
  FOTO + `reset role;\n${PARTE_1}\n${PARTE_1}\n${PARTE_2}\n${PARTE_2}\nset local search_path = retail, public, extensions;\n` + FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 2 && l[0] === l[1];
  }
);
// Una función cambiada en vivo (md5 que no es ni «antes» ni «después»): la migración aborta con un mensaje claro y no pisa.
const CAMBIADA_EN_VIVO = `reset role;
create or replace function retail.archivar_clienta(p_id uuid, p_motivo text, p_anonimizar boolean default false, p_version_esperada integer default null)
returns integer language plpgsql security definer set search_path = retail, public, extensions as $q$
begin
  perform retail.fn_exigir_modulo('clientas');
  return 1; -- cambiada en vivo
end;
$q$;
`;
caso(
  "(l) candado de versión: con archivar_clienta cambiada en vivo, la migración aborta con un mensaje claro",
  CAMBIADA_EN_VIVO + PEGAR,
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes("retail.archivar_clienta(uuid,text,boolean,integer) cambió desde que se escribió esta migración")
);
caso(
  "(l) …y no pisa NADA de la PARTE 2: la función sigue con su cambio y lo demás queda como estaba",
  CAMBIADA_EN_VIVO + FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${PARTE_2}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    FOTO +
    `select position('cambiada en vivo' in prosrc) > 0 from pg_proc where oid = 'retail.archivar_clienta(uuid,text,boolean,integer)'::regprocedure;\n`,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 3 && l[0] === l[1] && l[2] === "t";
  }
);
caso(
  "(l) sin la PARTE 1 (sin ubicaciones.whatsapp_numero), la PARTE 2 aborta y lo dice",
  `reset role;\nalter table retail.ubicaciones drop column whatsapp_numero;\n` + `reset role;\n${PARTE_2}\n`,
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes("Falta la PARTE 1")
);
caso(
  "(l) las funciones nuevas que guardan empiezan por el módulo «Clientas» y firman con el responsable del combo (fn_actor_persona_id(true)); la de la tienda, con el permiso de Configuración",
  `select string_agg(p.proname || ':' || (regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g')
            ~ '^(#variable_conflictuse_column)?declare.*?beginperformretail\\.fn_exigir_modulo\\(''clientas''\\);v_persona:=retail\\.fn_actor_persona_id\\(true\\);'), ',' order by p.proname)
  from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('unirse_al_club', 'registrar_mensaje_publicidad', 'registrar_desde_whatsapp', 'registrar_baja_whatsapp', 'registrar_clienta', 'editar_clienta', 'archivar_clienta', 'unir_clientas');
select prosrc ~ 'if not retail\\.fn_puede_configurar\\(\\) then' and prosrc ~ 'fn_actor_persona_id\\(true\\)' from pg_proc where oid = 'retail.guardar_whatsapp_tienda(uuid,text)'::regprocedure;
select prosrc !~ 'fn_exigir_modulo' from pg_proc where oid = 'retail.fn_club_textos_vigentes()'::regprocedure;
`,
  "archivar_clienta:true,editar_clienta:true,registrar_baja_whatsapp:true,registrar_clienta:true,registrar_desde_whatsapp:true,registrar_mensaje_publicidad:true,unir_clientas:true,unirse_al_club:true\nt\nt"
);

// Sin base de datos: lo que el SQL Editor ve del archivo. Fuera de los cuerpos `$…$` y de los comentarios: los textos entre
// comillas simples y el código suelto.
function fueraDeDolares(sql) {
  const textos = [];
  let codigo = "";
  let k = 0;
  while (k < sql.length) {
    const c = sql[k];
    if (c === "-" && sql[k + 1] === "-") {
      const fin = sql.indexOf("\n", k);
      k = fin < 0 ? sql.length : fin;
      continue;
    }
    if (c === "/" && sql[k + 1] === "*") {
      const fin = sql.indexOf("*/", k + 2);
      k = fin < 0 ? sql.length : fin + 2;
      continue;
    }
    if (c === "'") {
      let j = k + 1;
      let t = "";
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          t += "'";
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        t += sql[j];
        j++;
      }
      textos.push(t);
      codigo += " '' ";
      k = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(k));
      if (m) {
        const fin = sql.indexOf(m[0], k + m[0].length);
        k = fin < 0 ? sql.length : fin + m[0].length;
        codigo += " $cuerpo$ ";
        continue;
      }
    }
    codigo += c;
    k++;
  }
  return { textos, codigo };
}
const conInto = (sql) => {
  const { textos, codigo } = fueraDeDolares(sql);
  return [
    ...textos.filter((t) => /\binto\b/i.test(t)).map((t) => `texto: ${t.slice(0, 60)}`),
    ...codigo.split(";").filter((s) => /\bselect\b[\s\S]*\binto\b/i.test(s)).map((s) => `suelto: ${s.trim().slice(0, 60)}`),
  ];
};
chequeo(
  "(l) ningún `into` dentro de un texto entre comillas fuera de `$…$`, ni un `select … into` suelto (el SQL Editor lo toma por un SELECT INTO y agrega un `alter table … enable row level security`)",
  conInto(MIGRACION).join(" · ") || "ninguno",
  "ninguno"
);
chequeo(
  "(l) …y el vigilante muerde: un reemplazo anclado con `select … into` en su texto, y un `select … into` suelto, salen nombrados",
  conInto(`select pg_temp.reemplazar('x', 'v := 1;', 'select c.id into v_id from retail.clientas c;');\nselect 1 into tabla_x;\ndo $$ begin select 1 into v; end $$;`).length,
  2
);
{
  const sinComentarios = MIGRACION.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  chequeo(
    "(l) sin `drop trigger` ni `create policy` / `drop policy` (CLAUDE.md, «Políticas y deadlocks»)",
    [/drop\s+trigger/i, /create\s+policy/i, /drop\s+policy/i].filter((r) => r.test(sinComentarios)).length,
    0
  );
  const tablasP1 = [...new Set([...PARTE_1.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").matchAll(/retail\.([a-z_]+)/g)].map((m) => m[1]))].join(",");
  chequeo("(l) la PARTE 1 solo toca `ubicaciones` (va sola: toda venta la lee)", tablasP1, "ubicaciones");
  chequeo(
    "(l) la PARTE 2 no vuelve a tocar `ubicaciones` con un alter (lo toma solo en modo compartido, por las llaves foráneas)",
    /alter\s+table\s+retail\.ubicaciones/i.test(PARTE_2.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")),
    false
  );
}

// =====================================================================================================================
// m. Dos cajas invitan a la misma clienta a la vez (dos conexiones reales)
// =====================================================================================================================
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Antes de la sesión B: espera (hasta 10 s) a que A esté dormida con su transacción abierta, y dice si la vio. */
const esperarA = (app) => `do $espera$ begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
    perform pg_sleep(0.05);
  end loop;
end $espera$;
select exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
`;
/** La sesión A: la invita, duerme con la ficha tomada y termina con `fin` (rollback o commit). */
const cajaA = (app, ficha, celular, fin) => `set application_name = '${app}';
begin;
set local search_path = retail, public, extensions;
update retail.configuracion_empresa set exige_responsable = false;
${como(FELIPE)}select codigo_club from retail.unirse_al_club('${ficha}', '${celular}');
select pg_sleep(3);
${fin};
`;
async function carrera(nombre, fn) {
  let obtenido;
  let bien;
  try {
    [bien, obtenido] = await fn();
  } catch (e) {
    [bien, obtenido] = [false, `ERROR_DE_SCRIPT ${e.message}`];
  }
  registrar(nombre, bien, obtenido, "(condición)");
}

await carrera(
  "(m1) dos cajas invitan a la vez a la misma clienta: la segunda ESPERA en la lectura de la ficha (`for update`), antes de decidir si ya es socia (sin COMMIT: las dos terminan en ROLLBACK)",
  async () => {
    const ficha = correr(`select id || '|' || coalesce(telefono_whatsapp, '966999001') from retail.clientas
 where not anonimizada and archivada_en is null and documento_numero is not null and nombre is not null and club_desde is null
 order by documento_numero limit 1;`);
    const [id, celular] = ficha.ok ? ficha.salida.split("|") : [];
    if (!id) return [false, `no hay una ficha del seed que pueda unirse: ${ficha.mensaje ?? ""}`];
    const app = `club_permisos_a_${Date.now()}`;
    const a = psqlEnParalelo(cajaA(app, id, celular, "rollback"));
    await dormir(100);
    const b = await psqlEnParalelo(`${esperarA(app)}begin;
set local search_path = retail, public, extensions;
update retail.configuracion_empresa set exige_responsable = false;
create function pg_temp.donde_espera(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_contexto text;
begin
  execute p_sql;
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context;
  return v_estado || '|' || case when v_contexto ~* 'locking tuple .* in relation "clientas"' and v_contexto ~* 'unirse_al_club.* at SQL statement'
                                   then 'en la lectura de la ficha'
                                 else 'en otra sentencia: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
grant execute on function pg_temp.donde_espera(text) to authenticated;
set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera($q$select * from retail.unirse_al_club('${id}', '${celular}')$q$);
rollback;
`);
    const ra = await a;
    const obtenido = `${ra.ok ? "A ok" : `A falló: ${ra.mensaje}`}\n${b.ok ? b.salida : `B falló: ${b.mensaje}`}`;
    return [obtenido === "A ok\nt\n55P03|en la lectura de la ficha", obtenido];
  }
);

// (m2) commitea (deja una socia de prueba y su evento, que no se borra): solo contra un Postgres desechable, como
// bajada_al_piso_concurrencia y las (h2)/(h3) de club_venta_ligada. En el CI no corre; ahí vigila (m1).
if (process.env.BASE_DESECHABLE === "1") {
  await carrera(
    "(m2) con COMMIT: dos cajas invitan a la vez a la misma clienta → un solo código (las dos cajas reciben el mismo) y un solo evento",
    async () => {
      const prep = correr(`insert into retail.clientas (documento_numero, nombre, telefono_whatsapp)
  values ((select '7' || lpad(floor(random() * 1e7)::int::text, 7, '0')), 'Prueba Carrera Club Socia', '9' || lpad(floor(random() * 1e8)::int::text, 8, '0'))
  returning id || '|' || telefono_whatsapp;`);
      if (!prep.ok) return [false, prep.mensaje];
      const [id, celular] = prep.salida.split("|");
      const app = `club_permisos_a_${Date.now()}`;
      const a = psqlEnParalelo(cajaA(app, id, celular, "commit"));
      await dormir(100);
      const b = await psqlEnParalelo(`${esperarA(app)}begin;
set local search_path = retail, public, extensions;
update retail.configuracion_empresa set exige_responsable = false;
${como(FELIPE)}select codigo_club from retail.unirse_al_club('${id}', '${celular}');
commit;
`);
      const ra = await a;
      const fin = correr(`select (select count(*) from retail.club_permisos where clienta_id = '${id}') || '|' || codigo_club from retail.clientas where id = '${id}';`);
      if (!ra.ok || !b.ok || !fin.ok) return [false, [ra.mensaje, b.mensaje, fin.mensaje].filter(Boolean).join("\n")];
      const codA = ra.salida.split("\n").find((l) => /^C-\d+$/.test(l));
      const [vio, codB] = b.salida.split("\n");
      const obtenido = `A=${codA}\nB vio a A dormida: ${vio}\nB=${codB}\neventos|código: ${fin.salida}`;
      return [Boolean(codA) && vio === "t" && codA === codB && fin.salida === `1|${codA}`, obtenido];
    }
  );
} else {
  console.log("· (m2), la carrera con COMMIT, no corrió: solo corre con BASE_DESECHABLE=1 (deja una socia de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

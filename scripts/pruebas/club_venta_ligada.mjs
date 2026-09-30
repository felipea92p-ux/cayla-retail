#!/usr/bin/env node
/**
 * Pruebas de la tanda 1a del club de clientas (ADR-0288, D-1, D-2 y CL-27; migración
 * `20260930160000_club_paso1a_venta_ligada_y_documento.sql`).
 *
 * EL PROBLEMA. Ninguna venta llegaba a la ficha de nadie (Cobrar nunca mandaba `p_cliente_id`), y la ficha guardaba el
 * documento en una columna `dni`: un carné de extranjería o un pasaporte habría quedado escrito como si fuera un DNI. La base
 * tiene que hacer cumplir, no la pantalla:
 *   D-1  la venta se liga a la ficha que manda Cobrar; si esa ficha se unió a otra, a la que quedó; si está anonimizada, la
 *        venta se rechaza (`clienta_anonimizada`) y no se guarda nada; un id que no existe, `clienta_no_existe`;
 *   D-2  el documento tiene tipo (`dni`, `carne_extranjeria`, `pasaporte`), con su formato y único por (tipo, número);
 *   CL-27 al registrar la ficha (o corregirle el documento), sus compras anteriores sin clienta con boleta a ese documento
 *        pasan a su ficha, y nunca se mueve una venta que ya era de otra.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`, para
 * que los permisos se evalúen de verdad; cuentas del seed: Felipe, líder y Admin; Micaela, integrante de Trujillo):
 *   a. `registrar_venta` con `p_cliente_id` deja `ventas.cliente_id` en esa ficha (y la ficha la ve); sin él, null; y una
 *      cuenta SIN el módulo «Clientas» igual vende con la clienta que ya venía en el ticket (la venta encolada no se pierde:
 *      «DECIDÍ» de la migración).
 *   b. La ficha unida lleva a la que se conservó (también en cadena); la anonimizada —o unida a una que después se
 *      anonimizó— rechaza con `clienta_anonimizada`; la que no existe, con `clienta_no_existe`; y en los rechazos no queda
 *      venta ni se mueve el stock.
 *   c. Formato: un DNI que no tiene 8 dígitos, un tipo que no es de persona (un RUC) o un carné o pasaporte fuera de formato
 *      → `documento_invalido`, sin crear nada; carné y pasaporte se guardan limpios (sin espacios, en mayúsculas); el mismo
 *      número con dos tipos son dos fichas; el mismo tipo y número se completa (upsert); y un `update` o `insert` directo
 *      fuera de formato lo frena el candado de la tabla.
 *   d. CL-27: registrar con DNI liga sus ventas anteriores sin clienta con boleta a ese DNI, y no toca la que ya era de otra
 *      ficha, ni la de otro documento, ni la que no llevó comprobante; la actividad lo anota sin el documento ni el nombre;
 *      corregir el documento en la ficha también liga; corregirlo al de otra ficha → `documento_de_otra_ficha`.
 *   e. Anonimizar deja `documento_numero` en null; unir pasa el tipo y el número a la que queda si no tenía, y si tenía
 *      conserva los suyos.
 *   f. Estructura: una sola firma de `registrar_clienta`, `editar_clienta` y `registrar_venta`; los ayudantes sin EXECUTE
 *      para la API; ninguna función de `retail` (salvo `separar_prendas`) nombra `clientas.dni` (y el vigilante muerde); los
 *      md5 «después» de la sección 0 de la migración son los de las funciones vivas, y las dos nuevas son las del archivo.
 *   g. Pegado: pegarla otra vez deja todo igual (funciones, columnas, candados e índices); con una de las funciones que
 *      guarda cambiada en vivo, aborta con un mensaje claro y no pisa nada.
 *   h. Dos cajas a la vez, en dos conexiones reales (ROLLBACK): (h1) registran el mismo DNI y la segunda espera en el alta
 *      (el único `(documento_tipo, documento_numero)`) en vez de crear otra ficha; (h1b) una une dos fichas mientras la otra
 *      vende a la que se va, y la venta espera en la LECTURA de la ficha (`for key share`), antes de decidir a cuál se liga.
 *      Con BASE_DESECHABLE=1, además, las mismas dos carreras con COMMIT: una sola ficha (h2), y la venta termina en la ficha
 *      que quedó (h3); dejan fichas de prueba, así que no corren en el CI.
 *
 * LO QUE ESTA PRUEBA ENCONTRÓ en la primera versión de la migración (2026-09-30, antes de pegarla en ningún lado):
 *   - (a) toda venta SIN clienta fallaba en una conexión nueva: «record "v_ficha_clienta" is not assigned yet» (el `and`
 *     no evita leer el campo de un `record` sin asignar); registrar_venta.mjs pasaba 5/28;
 *   - (g) pegarla dos veces duplicaba el bloque D-1 de registrar_venta (el texto nuevo contiene su propia ancla), y la
 *     tercera ya abortaba en el candado de versión;
 *   - (h1b/h3) la venta que se ligaba mientras otra caja unía esa ficha quedaba colgada de la ficha unida.
 *
 * FUERA A PROPÓSITO: el comprobante con carné o pasaporte (tanda 1e, D-3), el club y el permiso de WhatsApp (1b en adelante).
 * Lo que ya probaban antes de la 1a sigue en clientas.mjs (alta, upsert, WhatsApp) y clientas_por_modulo_y_anonimizar.mjs
 * (módulo, reactivar, anonimizar sin rastro).
 *
 * USO
 *   pnpm pruebas:club-venta-ligada                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-venta-ligada --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-venta-ligada → además (h2) y (h3), que commitean: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260930160000_club_paso1a_venta_ligada_y_documento.sql"),
  "utf8"
);

// La tabla del candado de versión de la sección 0: firma → md5 normalizado «antes» (main = producción) y «después» (null: la
// firma deja de existir, como las dos viejas de registrar_clienta y editar_clienta).
const VERSIONES = [...MIGRACION.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+'([0-9a-f]{32})',\s+(null|'([0-9a-f]{32})')\)/g)].map((m) => ({
  firma: m[1],
  antes: m[2],
  despues: m[4] ?? null,
}));
if (VERSIONES.length !== 6) {
  console.error(`✗ La tabla de versiones de la migración debería tener 6 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const REGISTRAR_VENTA = VERSIONES.find((v) => v.firma.startsWith("retail.registrar_venta(")).firma;
const REGISTRAR_NUEVA = "retail.registrar_clienta(text,text,text,text,boolean,smallint,smallint)";
const EDITAR_NUEVA = "retail.editar_clienta(uuid,text,text,text,text,boolean,boolean,smallint,smallint,jsonb,integer)";

/** El cuerpo (lo que queda entre `$$` y `$$`) con que el archivo crea una función: es su `prosrc` vivo. */
const cuerpoDe = (inicio) => {
  const ini = MIGRACION.indexOf(inicio);
  if (ini < 0) throw new Error(`No encontré «${inicio}» en la migración`);
  const a = MIGRACION.indexOf("$$", ini) + 2;
  return MIGRACION.slice(a, MIGRACION.indexOf("$$", a));
};
const CUERPO_REGISTRAR = cuerpoDe("create or replace function retail.registrar_clienta(");
const CUERPO_EDITAR = cuerpoDe("create or replace function retail.editar_clienta(");

// Seed local: Felipe (líder y Admin), Micaela (integrante de Trujillo, con Clientas por su rol).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Tokens fijos: para contar, después de un rechazo, que no quedó ninguna venta con ese token.
const TOKEN_A = "88888888-8888-4888-8888-000000000001";
const TOKEN_B = "88888888-8888-4888-8888-000000000002";
const TOKEN_C = "88888888-8888-4888-8888-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

/** Una sesión de psql que corre en paralelo con las demás (para las carreras de la sección h). */
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
-- 'documento_invalido'), o «SQLSTATE|mensaje» si no, o SIN_ERROR. No es security definer: corre con los permisos de quien
-- la llama.
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

-- Vende 1 BLU-EMMA-NEG-M a precio de lista, con o sin clienta y con o sin boleta a un documento. Devuelve el id de la venta,
-- o «ERROR|hint» (o «ERROR|mensaje») si registrar_venta la rechaza: el rechazo deshace todo lo que la venta hizo. Tampoco
-- es security definer: la llama la cuenta del caso.
create function pg_temp.vender(p_ubic uuid, p_variante uuid, p_precio numeric, p_clienta uuid, p_token uuid,
  p_tipo_doc text default null, p_num_doc text default null) returns text language plpgsql as $f$
declare v_id uuid; v_msg text; v_hint text;
begin
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic,
    p_items => jsonb_build_array(jsonb_build_object('variante_id', p_variante, 'cantidad', 1, 'precio_unitario', p_precio, 'descuento_unitario', 0)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', p_precio)),
    p_cliente_id => p_clienta,
    p_token => p_token,
    p_tipo_comprobante => case when p_tipo_doc is not null then 'boleta' end,
    p_cliente_tipo_doc => coalesce(p_tipo_doc, 'sin_documento'),
    p_cliente_num_doc => p_num_doc,
    p_cliente_nombre => case when p_tipo_doc is not null then 'Compradora Prueba Club' end
  );
  return v_id::text;
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, uuid, numeric, uuid, uuid, text, text) to authenticated;

-- Una persona firma a su nombre, como hoy en el mostrador; y la integrante, con Clientas (así están en producción).
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
`;

/** Cambia de cuenta (sin responsable en el combo). */
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
/** Como `intento`, con variables de psql: psql no las reemplaza entre $q$, así que van por `format` (%L). */
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;

/**
 * Una sede lista para vender (como en registrar_venta.mjs): piso y almacén si faltaran, su caja abierta por el líder y 100
 * unidades de BLU-EMMA-NEG-M en el piso. Deja :ubic, :v1, :v1_precio y :stock0. Corre como `postgres` con los claims del
 * líder (abrir_caja firma con él); después, cada caso cambia a la cuenta que vende.
 */
const SEDE = (nombre = "Tienda Lima") => `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as ubic from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba club_venta_ligada') as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select coalesce(sum(cantidad), 0) as stock0 from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic' \\gset
`;
/** `select pg_temp.vender(...) as <alias> \gset` — `clienta` y `num` son expresiones SQL (una variable :'x', o null). */
const VENDER = (alias, { clienta = "null", token = "gen_random_uuid()", tipoDoc = "null", num = "null" } = {}) =>
  `select pg_temp.vender(:'ubic', :'v1', :'v1_precio', ${clienta}, ${token}, ${tipoDoc}, ${num}) as ${alias} \\gset\n`;
/** Alta de ficha por la RPC, con nombre de parámetros (la cuenta ya elegida). */
const ALTA = (alias, { tipo = "dni", numero = null, nombre = null, celular = null } = {}) =>
  `select retail.registrar_clienta(p_documento_tipo => '${tipo}', p_documento_numero => ${numero === null ? "null" : `'${numero}'`}, p_nombre => ${nombre === null ? "null" : `'${nombre}'`}, p_telefono_whatsapp => ${celular === null ? "null" : `'${celular}'`}) as ${alias} \\gset\n`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperadoCaso) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperadoCaso === "function" ? esperadoCaso(obtenido) : obtenido === esperadoCaso;
  if (!bien) {
    fallas++;
    const e = typeof esperadoCaso === "function" ? "(condición)" : esperadoCaso.split("\n").join("\n              ");
    console.log(`✗ ${nombre}\n    esperado: ${e}\n    obtenido: ${obtenido.split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// =====================================================================================================================
// a. La venta se liga a la ficha que manda Cobrar (D-1)
// =====================================================================================================================
caso(
  "(a) con p_cliente_id, la venta queda en esa ficha y la ficha la ve en sus compras",
  SEDE() + como(FELIPE) + ALTA("f1", { numero: "90880101", nombre: "Club Uno Prueba" }) + VENDER("venta", { clienta: ":'f1'" }) +
    `select count(*) from retail.fn_clienta_compras(:'f1') where venta_id::text = :'venta';
reset role;
select cliente_id = :'f1'::uuid from retail.ventas where id::text = :'venta';
`,
  "1\nt"
);
// La primera venta de una conexión nueva, SIN clienta: así falló la primera versión de la migración («record
// "v_ficha_clienta" is not assigned yet» en toda venta sin clienta, hasta que esa conexión vendía una vez CON clienta).
caso(
  "(a) sin p_cliente_id, la venta queda sin clienta, como hasta hoy (primera venta de una conexión nueva)",
  SEDE() + como(FELIPE) + VENDER("venta") + `reset role;\nselect cliente_id is null from retail.ventas where id::text = :'venta';\n`,
  "t"
);
caso(
  "(a) una cuenta SIN el módulo «Clientas» (Micaela, sin él en su rol) igual vende con la clienta que ya venía en el ticket: no busca fichas, pero la venta encolada no se pierde",
  SEDE("Tienda Trujillo") +
    `insert into retail.clientas (documento_numero, nombre) values ('90880102', 'Club Encolada Prueba') returning id as f1 \\gset
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
` +
    como(MICAELA) + intento(`select * from retail.buscar_clienta('90880102')`) + VENDER("venta", { clienta: ":'f1'" }) +
    `reset role;\nselect cliente_id = :'f1'::uuid from retail.ventas where id::text = :'venta';\n`,
  "42501|clientas_sin_modulo\nt"
);

// =====================================================================================================================
// b. Unida, anonimizada o inexistente
// =====================================================================================================================
caso(
  "(b) la ficha unida a otra: la venta queda en la que se conservó",
  SEDE() + como(FELIPE) +
    ALTA("queda", { numero: "90880201", nombre: "Club Queda Prueba" }) +
    ALTA("se_va", { nombre: "Club Se Va Prueba", celular: "987880202" }) +
    `select (retail.unir_clientas(:'queda', :'se_va', null, null)).id as _u \\gset\n` +
    VENDER("venta", { clienta: ":'se_va'" }) +
    `reset role;\nselect cliente_id = :'queda'::uuid from retail.ventas where id::text = :'venta';\n`,
  "t"
);
caso(
  "(b) en cadena (Z se unió a Y, e Y a X): la venta de Z queda en X",
  SEDE() + como(FELIPE) +
    ALTA("x", { numero: "90880211", nombre: "Club X Prueba" }) +
    ALTA("y", { nombre: "Club Y Prueba", celular: "987880212" }) +
    ALTA("z", { nombre: "Club Z Prueba", celular: "987880213" }) +
    `select (retail.unir_clientas(:'y', :'z', null, null)).id as _u1 \\gset
select (retail.unir_clientas(:'x', :'y', null, null)).id as _u2 \\gset
` +
    VENDER("venta", { clienta: ":'z'" }) +
    `reset role;\nselect cliente_id = :'x'::uuid from retail.ventas where id::text = :'venta';\n`,
  "t"
);
/** Después de un rechazo: ¿quedó alguna venta con ese token, o se movió el stock? «ventas|stock movido». */
const NADA_SE_GUARDO = (token) => `reset role;
select (select count(*) from retail.ventas where token_cliente = '${token}')
    || '|' || (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic') - :stock0;
`;
caso(
  "(b) la ficha anonimizada: la venta se rechaza con clienta_anonimizada, y no queda venta ni se mueve el stock",
  SEDE() + como(FELIPE) +
    ALTA("f", { numero: "90880221", nombre: "Club Olvidada Prueba", celular: "987880221" }) +
    `select retail.archivar_clienta(:'f', 'pidió que la borren', true, null) as _v \\gset\n` +
    VENDER("venta", { clienta: ":'f'", token: `'${TOKEN_A}'` }) + `select :'venta';\n` + NADA_SE_GUARDO(TOKEN_A),
  "ERROR|clienta_anonimizada\n0|0"
);
caso(
  "(b) la ficha unida a una que DESPUÉS se anonimizó: también clienta_anonimizada (se sigue la unión y se mira la que quedó)",
  SEDE() + como(FELIPE) +
    ALTA("x", { numero: "90880231", nombre: "Club X Anon Prueba" }) +
    ALTA("y", { nombre: "Club Y Anon Prueba", celular: "987880232" }) +
    `select (retail.unir_clientas(:'x', :'y', null, null)).id as _u \\gset
select retail.archivar_clienta(:'x', 'pidió que la borren', true, null) as _v \\gset
` +
    VENDER("venta", { clienta: ":'y'", token: `'${TOKEN_B}'` }) + `select :'venta';\n` + NADA_SE_GUARDO(TOKEN_B),
  "ERROR|clienta_anonimizada\n0|0"
);
caso(
  "(b) un id que no es de ninguna ficha: clienta_no_existe, y no queda venta ni se mueve el stock",
  SEDE() + como(FELIPE) + VENDER("venta", { clienta: "gen_random_uuid()", token: `'${TOKEN_C}'` }) + `select :'venta';\n` + NADA_SE_GUARDO(TOKEN_C),
  "ERROR|clienta_no_existe\n0|0"
);

// =====================================================================================================================
// c. El documento con tipo y formato (D-2)
// =====================================================================================================================
const INVALIDO = "22023|documento_invalido";
caso(
  "(c) DNI de 7 dígitos o con letras, un RUC (una empresa no es una clienta), un carné corto, un pasaporte con guion o de 13: documento_invalido, y no se crea ninguna ficha",
  como(FELIPE) +
    intento(`select retail.registrar_clienta('dni', '1234567', 'Documento Malo Prueba')`) +
    intento(`select retail.registrar_clienta('dni', '1234567A', 'Documento Malo Prueba')`) +
    intento(`select retail.registrar_clienta('ruc', '20601234567', 'Documento Malo Prueba')`) +
    intento(`select retail.registrar_clienta('carne_extranjeria', '12345', 'Documento Malo Prueba')`) +
    intento(`select retail.registrar_clienta('pasaporte', 'AB-12345', 'Documento Malo Prueba')`) +
    intento(`select retail.registrar_clienta('pasaporte', '1234567890123', 'Documento Malo Prueba')`) +
    `reset role;\nselect count(*) from retail.clientas where nombre = 'Documento Malo Prueba';\n`,
  [INVALIDO, INVALIDO, INVALIDO, INVALIDO, INVALIDO, INVALIDO, "0"].join("\n")
);
caso(
  "(c) …y editar_clienta rechaza igual (y la ficha queda como estaba)",
  como(FELIPE) + ALTA("f", { numero: "90880301", nombre: "Club Edita Mal Prueba" }) +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '9088030', 'Club Edita Mal Prueba', null, false, false, null, null, null, null)`, ":'f'") +
    `reset role;\nselect documento_tipo || ':' || documento_numero from retail.clientas where id = :'f';\n`,
  `${INVALIDO}\ndni:90880301`
);
caso(
  "(c) carné 001234567, pasaporte « ab 123456 » y DNI « 9088 0302 » se guardan limpios (sin espacios, en mayúsculas), y el buscador los encuentra como se escriban",
  como(FELIPE) +
    ALTA("c", { tipo: "carne_extranjeria", numero: "001234567", nombre: "Club Carne Prueba" }) +
    ALTA("p", { tipo: "pasaporte", numero: " ab 123456 ", nombre: "Club Pasaporte Prueba" }) +
    ALTA("d", { numero: " 9088 0302 ", nombre: "Club Dni Espacios Prueba" }) +
    `select count(*) from retail.buscar_clienta(' ab 123456 ') where id = :'p';
reset role;
select string_agg(documento_tipo || ':' || documento_numero, ',' order by nombre) from retail.clientas where id in (:'c', :'p', :'d');
`,
  "1\ncarne_extranjeria:001234567,dni:90880302,pasaporte:AB123456"
);
caso(
  "(c) el mismo número con tres tipos son tres fichas (tres personas), y buscar por el número trae las tres",
  como(FELIPE) +
    ALTA("a", { numero: "90880401", nombre: "Club Dni Cuatro" }) +
    ALTA("b", { tipo: "pasaporte", numero: "90880401", nombre: "Club Pasaporte Cuatro" }) +
    ALTA("c", { tipo: "carne_extranjeria", numero: "90880401", nombre: "Club Carne Cuatro" }) +
    `select count(distinct x) from unnest(array[:'a', :'b', :'c']) x;
select count(*) from retail.buscar_clienta('90880401');
`,
  "3\n3"
);
caso(
  "(c) el mismo tipo y número se completa (upsert): misma ficha, una sola fila, conserva el nombre y suma el celular",
  como(FELIPE) +
    ALTA("a", { tipo: "pasaporte", numero: "XY998877", nombre: "Club Upsert Prueba" }) +
    ALTA("b", { tipo: "pasaporte", numero: "xy 998877", celular: "987880501" }) +
    `reset role;
select :'a' = :'b', (select count(*) from retail.clientas where documento_tipo = 'pasaporte' and documento_numero = 'XY998877'),
       nombre, telefono_whatsapp
  from retail.clientas where id = :'a';
`,
  "t|1|Club Upsert Prueba|987880501"
);
caso(
  "(c) los candados de la tabla frenan lo que no pasa por la RPC: un DNI de 7, un pasaporte en minúsculas, el tipo RUC y un repetido; el mismo número con otro tipo sí entra",
  `insert into retail.clientas (documento_numero, nombre) values ('90880601', 'Club Directo Prueba') returning id as f \\gset
` +
    intentoCon(`update retail.clientas set documento_numero = '9088060' where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set documento_tipo = 'pasaporte', documento_numero = 'ab123456' where id = %L`, ":'f'") +
    intentoCon(`update retail.clientas set documento_tipo = 'ruc', documento_numero = null where id = %L`, ":'f'") +
    intento(`insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '90880601', 'Club Directo Dos')`) +
    intento(`insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('carne_extranjeria', '90880601', 'Club Directo Tres')`),
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 5 &&
      l[0].startsWith("23514|") && l[0].includes("clientas_documento_formato") &&
      l[1].startsWith("23514|") && l[1].includes("clientas_documento_formato") &&
      l[2].startsWith("23514|") && l[2].includes("clientas_documento_tipo_valido") &&
      l[3].startsWith("23505|") && l[3].includes("clientas_documento_unico") &&
      l[4] === "SIN_ERROR"
    );
  }
);

// =====================================================================================================================
// d. CL-27: sus compras anteriores pasan a su ficha
// =====================================================================================================================
caso(
  "(d) registrar con DNI liga la venta anterior sin clienta con boleta a ese DNI; no mueve la que ya era de otra ficha, ni la de otro DNI, ni la que no llevó comprobante",
  SEDE() + como(FELIPE) +
    ALTA("otra", { nombre: "Club Otra Ficha", celular: "987880701" }) +
    VENDER("v_suya", { tipoDoc: "'dni'", num: "'90880701'" }) +
    VENDER("v_de_otra", { clienta: ":'otra'", tipoDoc: "'dni'", num: "'90880701'" }) +
    VENDER("v_otro_dni", { tipoDoc: "'dni'", num: "'90880702'" }) +
    VENDER("v_sin_doc") +
    ALTA("nueva", { numero: "90880701", nombre: "Club Ligada Prueba" }) +
    `reset role;
select (select cliente_id = :'nueva'::uuid from retail.ventas where id::text = :'v_suya'),
       (select cliente_id = :'otra'::uuid from retail.ventas where id::text = :'v_de_otra'),
       (select cliente_id is null from retail.ventas where id::text = :'v_otro_dni'),
       (select cliente_id is null from retail.ventas where id::text = :'v_sin_doc');
select count(*), max(a.detalle ->> 'ventas_ligadas'), bool_and(a::text !~* '(90880701|ligada prueba)')
  from retail.actividad a where a.modulo = 'clientas' and a.accion = 'ligar_ventas' and a.registro_id = :'nueva';
`,
  "t|t|t|t\n1|1|t"
);
caso(
  "(d) corregir el documento en la ficha también liga la venta anterior con ese DNI (y la actividad de editar dice cuántas)",
  SEDE() + como(FELIPE) +
    ALTA("e", { nombre: "Club Editada Prueba", celular: "987880801" }) +
    VENDER("venta", { tipoDoc: "'dni'", num: "'90880801'" }) +
    `select retail.editar_clienta(:'e', 'dni', '90880801', 'Club Editada Prueba', '987880801', false, false, null, null, null, null) as _v \\gset
reset role;
select (select cliente_id = :'e'::uuid from retail.ventas where id::text = :'venta'),
       (select detalle ->> 'ventas_ligadas' from retail.actividad where modulo = 'clientas' and accion = 'editar' and registro_id = :'e');
`,
  "t|1"
);
caso(
  "(d) corregirlo al documento de OTRA ficha: documento_de_otra_ficha, y no cambia nada; el mismo número con otro tipo sí se puede",
  como(FELIPE) +
    ALTA("a", { numero: "90880901", nombre: "Club Dueña Prueba" }) +
    ALTA("b", { numero: "90880902", nombre: "Club Otra Prueba" }) +
    intentoCon(`select retail.editar_clienta(%L, 'dni', '90880901', 'Club Otra Prueba', null, false, false, null, null, null, null)`, ":'b'") +
    `reset role;\nselect documento_tipo || ':' || documento_numero from retail.clientas where id = :'b';\n` +
    como(FELIPE) +
    intentoCon(`select retail.editar_clienta(%L, 'pasaporte', '90880901', 'Club Otra Prueba', null, false, false, null, null, null, null)`, ":'b'"),
  "23505|documento_de_otra_ficha\ndni:90880902\nSIN_ERROR"
);

// =====================================================================================================================
// e. Anonimizar y unir con el documento con tipo
// =====================================================================================================================
caso(
  "(e) anonimizar deja documento_numero en null y el número no queda en ninguna columna de la ficha",
  como(FELIPE) +
    ALTA("f", { tipo: "pasaporte", numero: "AN123456", nombre: "Club Anonimiza Prueba", celular: "987881001" }) +
    `select retail.archivar_clienta(:'f', 'pidió que la borren', true, null) as _v \\gset
reset role;
select documento_numero is null, anonimizada, (select count(*) from retail.clientas c where c::text ~ 'AN123456')
  from retail.clientas where id = :'f';
`,
  "t|t|0"
);
caso(
  "(e) unir: la que queda sin documento toma el tipo y el número de la que se va (y la que se va lo suelta)",
  como(FELIPE) +
    ALTA("queda", { nombre: "Club Queda Sin Doc", celular: "987881101" }) +
    ALTA("se_va", { tipo: "pasaporte", numero: "UN123456", nombre: "Club Se Va Pasaporte" }) +
    `select (u).documento_tipo || ':' || (u).documento_numero from (select retail.unir_clientas(:'queda', :'se_va', null, null) as u) x;
reset role;
select documento_numero is null from retail.clientas where id = :'se_va';
`,
  "pasaporte:UN123456\nt"
);
caso(
  "(e) unir: la que queda CON su documento lo conserva (tipo y número), aunque la que se va traiga otro",
  como(FELIPE) +
    ALTA("queda", { numero: "90881201", nombre: "Club Queda Con Dni" }) +
    ALTA("se_va", { tipo: "carne_extranjeria", numero: "CE123456", nombre: "Club Se Va Carne" }) +
    `select (u).documento_tipo || ':' || (u).documento_numero from (select retail.unir_clientas(:'queda', :'se_va', null, null) as u) x;\n`,
  "dni:90881201"
);

// =====================================================================================================================
// f. Estructura
// =====================================================================================================================
caso(
  "(f) una sola firma de registrar_clienta, editar_clienta y registrar_venta; la de registrar_clienta empieza por el tipo y el número",
  `select string_agg(p.proname || '=' || (select count(*) from pg_proc q where q.pronamespace = p.pronamespace and q.proname = p.proname), ',' order by p.proname)
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('registrar_clienta', 'editar_clienta', 'registrar_venta');
select pg_get_function_identity_arguments('${REGISTRAR_NUEVA}'::regprocedure) ~ '^p_documento_tipo text, p_documento_numero text,',
       pg_get_function_identity_arguments('${EDITAR_NUEVA}'::regprocedure) ~ '^p_id uuid, p_documento_tipo text, p_documento_numero text,';
`,
  "editar_clienta=1,registrar_clienta=1,registrar_venta=1\nt|t"
);
const AYUDANTES = ["retail.fn_documento_clienta(text,text)", "retail.fn_ligar_ventas_por_documento(uuid,text,text)"];
caso(
  "(f) los dos ayudantes no los ejecuta nadie de la API (ni anon, ni authenticated, ni PUBLIC); las dos RPC, solo authenticated",
  `select ${AYUDANTES.map((f) => `has_function_privilege('anon', '${f}', 'execute'), has_function_privilege('authenticated', '${f}', 'execute')`).join(", ")};
select bool_or(a.grantee = 0) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 where p.oid in (${[...AYUDANTES, REGISTRAR_NUEVA, EDITAR_NUEVA].map((f) => `'${f}'::regprocedure`).join(", ")}) and a.privilege_type = 'EXECUTE';
select ${[REGISTRAR_NUEVA, EDITAR_NUEVA].map((f) => `has_function_privilege('authenticated', '${f}', 'execute'), has_function_privilege('anon', '${f}', 'execute')`).join(", ")};
`,
  "f|f|f|f\nf\nt|f|t|f"
);
// El mismo vigilante que la sección 6 de la migración: `dni` como identificador (no entre comillas ni en un comentario).
const SIN_DNI = `select coalesce(string_agg(p.proname, ',' order by p.proname), 'ninguna')
  from pg_proc p
 where p.pronamespace = 'retail'::regnamespace
   and p.prosrc ~ 'clientas'
   and regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g') ~ '(^|[^a-z_''])dni([^a-z_'']|$)'
   and p.proname not in ('separar_prendas');
`;
caso(
  "(f) ninguna función de retail (salvo separar_prendas, con su propio clienta_dni) nombra clientas.dni",
  SIN_DNI,
  "ninguna"
);
caso(
  "(f) …y el vigilante muerde: una función que lee c.dni sale nombrada; 'dni' como tipo o en un comentario, no",
  `create function retail.zz_lee_dni() returns text language plpgsql as $fn$ begin return (select c.dni from retail.clientas c limit 1); end $fn$;
create function retail.zz_dni_es_un_tipo() returns bigint language plpgsql as $fn$
begin
  -- antes: select c.dni from retail.clientas c
  return (select count(*) from retail.clientas where documento_tipo = 'dni');
end $fn$;
` + SIN_DNI,
  "zz_lee_dni"
);
caso(
  "(f) los md5 «después» de la sección 0 son los de las funciones vivas (las dos firmas viejas ya no existen), y las dos nuevas son las del archivo",
  VERSIONES.map(
    (v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`
  ).join("") +
    `select ${md5Norm("prosrc")} = ${md5Norm(`$cuerpo_1a$${CUERPO_REGISTRAR}$cuerpo_1a$`)} from pg_proc where oid = '${REGISTRAR_NUEVA}'::regprocedure;
select ${md5Norm("prosrc")} = ${md5Norm(`$cuerpo_1a$${CUERPO_EDITAR}$cuerpo_1a$`)} from pg_proc where oid = '${EDITAR_NUEVA}'::regprocedure;
`,
  [...VERSIONES.map((v) => v.despues ?? "NO_EXISTE"), "t", "t"].join("\n")
);
caso(
  "(f) el esquema: sin columna dni, con documento_tipo 'dni' por defecto, los dos candados validados y el único parcial por (tipo, número)",
  `select count(*) filter (where column_name = 'dni'), max(column_default) filter (where column_name = 'documento_tipo')
  from information_schema.columns where table_schema = 'retail' and table_name = 'clientas';
select string_agg(conname || ':' || convalidated, ',' order by conname) from pg_constraint
 where conrelid = 'retail.clientas'::regclass and conname in ('clientas_documento_tipo_valido', 'clientas_documento_formato');
select string_agg(replace(indexdef, 'retail.', ''), ',') from pg_indexes
 where schemaname = 'retail' and tablename = 'clientas' and indexname in ('clientas_documento_unico', 'clientas_dni_unico');
`,
  "0|'dni'::text\nclientas_documento_formato:true,clientas_documento_tipo_valido:true\n" +
    "CREATE UNIQUE INDEX clientas_documento_unico ON clientas USING btree (documento_tipo, documento_numero) WHERE (documento_numero IS NOT NULL)"
);

// =====================================================================================================================
// g. Pegado
// =====================================================================================================================
// Solo pegarla otra vez, sobre la base con la migración ya aplicada: el pegado sobre el estado de ANTES (main = producción)
// lo hace el propio CI al levantar la base con todas las migraciones, y el candado de versión de la sección 0 exige que ese
// estado sea el que se revisó.
// Una foto de todo lo que la migración toca: cuerpo y permisos de las 10 funciones, columnas (con default y comentario),
// candados e índices de `clientas`. Una línea: su md5. Y aparte, cuántas veces está el bloque D-1 en registrar_venta.
const FUNCIONES_1A = [...VERSIONES.map((v) => v.firma), REGISTRAR_NUEVA, EDITAR_NUEVA, ...AYUDANTES];
const FOTO = `reset role;
select md5(string_agg(x, '|' order by x)) from (
  select p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '')
    from pg_proc p where p.oid in (select to_regprocedure(f) from unnest(array[${FUNCIONES_1A.map((f) => `'${f}'`).join(", ")}]) f)
  union all
  select 'col:' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':'
         || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || coalesce(col_description(a.attrelid, a.attnum), '')
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'retail.clientas'::regclass and a.attnum > 0 and not a.attisdropped
  union all
  select 'con:' || conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated from pg_constraint where conrelid = 'retail.clientas'::regclass
  union all
  select 'idx:' || indexdef from pg_indexes where schemaname = 'retail' and tablename = 'clientas'
) f(x);
select (length(prosrc) - length(replace(prosrc, 'ADR-0288 D-1', ''))) / length('ADR-0288 D-1') from pg_proc where oid = '${REGISTRAR_VENTA}'::regprocedure;
`;
const PEGAR = `reset role;\n${MIGRACION}\nset local search_path = retail, public, extensions;\n`;
caso(
  "(g) pegarla otra vez deja todo igual: funciones, permisos, columnas, candados e índices (y el bloque D-1 una sola vez en registrar_venta)",
  FOTO + PEGAR + FOTO,
  (s) => {
    // Sin las líneas vacías que imprimen los `select` de la migración (sus reemplazos anclados devuelven void).
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === "1" && l[3] === "1";
  }
);
// Una función cambiada en vivo (md5 que no es ni «antes» ni «después»): la migración aborta con un mensaje claro y no pisa.
const CAMBIADA_EN_VIVO = `reset role;
create or replace function retail.buscar_clienta(p_termino text, p_incluir_archivadas boolean default false)
returns setof retail.clientas language sql stable security definer set search_path = retail, public, extensions as $q$
  select retail.fn_exigir_modulo('clientas');
  select * from retail.clientas where nullif(btrim(p_termino), '') is not null and documento_numero = btrim(p_termino) limit 5;
$q$;
`;
caso(
  "(g) candado de versión: con buscar_clienta cambiada en vivo, la migración aborta con un mensaje claro",
  CAMBIADA_EN_VIVO + PEGAR,
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes("retail.buscar_clienta(text,boolean) cambió desde que se escribió esta migración")
);
caso(
  "(g) …y no pisa NADA: esa función sigue con su cambio y lo demás queda como estaba",
  // Sin ON_ERROR_STOP y dentro de un savepoint: si el candado aborta, se vuelve al savepoint para mirar qué quedó. Si NO
  // abortara, no se revierte nada y la foto lo delata.
  CAMBIADA_EN_VIVO + FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${MIGRACION}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    FOTO +
    `select position('limit 5' in prosrc) > 0 from pg_proc where oid = 'retail.buscar_clienta(text,boolean)'::regprocedure;\n`,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 5 && l[0] === l[2] && l[1] === "1" && l[3] === "1" && l[4] === "t";
  }
);

// =====================================================================================================================
// h. Dos cajas a la vez (dos conexiones reales)
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
/** La sesión A: registra el documento, duerme con la transacción abierta y termina con `fin` (rollback o commit). */
const cajaA = (app, dni, fin) => `set application_name = '${app}';
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}select retail.registrar_clienta(p_documento_numero => '${dni}', p_nombre => 'Prueba Carrera Club');
select pg_sleep(3);
${fin};
`;
async function carrera(nombre, fn) {
  casos++;
  let obtenido;
  let bien;
  try {
    [bien, obtenido] = await fn();
  } catch (e) {
    [bien, obtenido] = [false, `ERROR_DE_SCRIPT ${e.message}`];
  }
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`}`);
}
/** Un DNI de 8 dígitos que no es de ninguna ficha (empieza por 7: el seed y las pruebas usan otros). */
const dniLibre = () =>
  correr(`select d from (select '7' || lpad(floor(random() * 1e7)::int::text, 7, '0') as d from generate_series(1, 50)) x
 where not exists (select 1 from retail.clientas c where c.documento_tipo = 'dni' and c.documento_numero = x.d) limit 1;`);

await carrera(
  "(h1) dos cajas registran a la vez el mismo DNI nuevo: la segunda ESPERA en el alta (el único por tipo y número) en vez de crear otra ficha (sin COMMIT: las dos terminan en ROLLBACK)",
  async () => {
    const dni = dniLibre();
    if (!dni.ok || !dni.salida) return [false, `no encontré un DNI libre: ${dni.mensaje ?? ""}`];
    const app = `club_venta_ligada_a_${Date.now()}`;
    const a = psqlEnParalelo(cajaA(app, dni.salida, "rollback"));
    await dormir(100);
    const b = await psqlEnParalelo(`${esperarA(app)}begin;
set local search_path = retail, public, extensions;
create function pg_temp.donde_espera(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_contexto text;
begin
  execute p_sql;
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context;
  return v_estado || '|' || case when v_contexto ~* 'insert into retail\\.clientas' then 'en el alta'
                                 else 'en otra sentencia: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
grant execute on function pg_temp.donde_espera(text) to authenticated;
set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera($q$select retail.registrar_clienta(p_documento_numero => '${dni.salida}', p_nombre => 'Prueba Carrera Club')$q$);
rollback;
`);
    const ra = await a;
    const obtenido = `${ra.ok ? "A ok" : `A falló: ${ra.mensaje}`}\n${b.ok ? b.salida : `B falló: ${b.mensaje}`}`;
    return [obtenido === "A ok\nt\n55P03|en el alta", obtenido];
  }
);

// Una caja une dos fichas (U, sin confirmar) mientras otra vende a la que se va (V). registrar_venta tiene que ESPERAR en
// la lectura de la ficha (`for key share` contra el `for update` de unir_clientas), ANTES de decidir a cuál se liga: así,
// cuando U confirme, sigue la unión. Si en vez de eso espera recién al guardar la venta (la llave foránea de
// ventas.cliente_id), ya decidió con la ficha de antes de la unión y la venta quedaría colgada de la unida (lo muestra h3
// con COMMIT). Usa dos fichas del seed (confirmadas: una sesión no ve lo que la otra no confirmó); las dos sesiones terminan
// en ROLLBACK.
await carrera(
  "(h1b) una caja une dos fichas mientras otra vende a la que se va: la venta ESPERA en la lectura de la ficha, antes de decidir a cuál se liga (sin COMMIT: las dos terminan en ROLLBACK)",
  async () => {
    const fichas = correr(`select id from retail.clientas
 where not anonimizada and archivada_en is null and fusionada_en_id is null and documento_numero is not null
 order by documento_numero limit 2;`);
    const [queda, seVa] = fichas.ok ? fichas.salida.split("\n") : [];
    if (!queda || !seVa) return [false, `no hay dos fichas activas en la base (el seed trae 8): ${fichas.mensaje ?? ""}`];
    const app = `club_venta_ligada_u_${Date.now()}`;
    const u = psqlEnParalelo(`set application_name = '${app}';
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}select (retail.unir_clientas('${queda}', '${seVa}', null, null)).id as _u \\gset
select pg_sleep(3);
rollback;
`);
    await dormir(100);
    const v = await psqlEnParalelo(`begin;
${PRELUDIO.replace("begin;", "")}${SEDE()}
create function pg_temp.donde_espera_venta(p_ubic uuid, p_variante uuid, p_precio numeric, p_clienta uuid) returns text
language plpgsql as $f$
declare v_estado text; v_contexto text;
begin
  perform retail.registrar_venta(
    p_ubicacion_id => p_ubic,
    p_items => jsonb_build_array(jsonb_build_object('variante_id', p_variante, 'cantidad', 1, 'precio_unitario', p_precio, 'descuento_unitario', 0)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', p_precio)),
    p_cliente_id => p_clienta, p_token => gen_random_uuid());
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context;
  -- La lectura de la ficha es un \`for … in select … for key share\` (sin \`select … into\`: el SQL Editor de Supabase lo confunde
  -- con un SELECT INTO que crea tabla), así que el contexto ya no trae su texto: dice qué fila de \`clientas\` esperaba.
  -- Primero «al guardar»: la llave foránea de ventas.cliente_id también bloquea la fila de \`clientas\`, y esa espera tardía
  -- es justo el defecto que esta prueba vigila.
  return v_estado || '|' || case when v_contexto ~* 'insert into ventas' then 'al guardar la venta, con la ficha de antes de la unión'
                                 when v_contexto ~* 'from retail\\.clientas c where c\\.id = p_cliente_id'
                                   or (v_contexto ~* 'locking tuple .* in relation "clientas"' and v_contexto ~* 'at FOR over SELECT rows')
                                   then 'en la lectura de la ficha'
                                 else 'en otra sentencia: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
grant execute on function pg_temp.donde_espera_venta(uuid, uuid, numeric, uuid) to authenticated;
${esperarA(app)}set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera_venta(:'ubic', :'v1', :'v1_precio', '${seVa}');
rollback;
`);
    const ru = await u;
    const obtenido = `${ru.ok ? "U ok" : `U falló: ${ru.mensaje}`}\n${v.ok ? v.salida : `V falló: ${v.mensaje}`}`;
    return [obtenido === "U ok\nt\n55P03|en la lectura de la ficha", obtenido];
  }
);

// (h2) y (h3) commitean (dejan fichas de prueba y, en h3, una unión): solo contra un Postgres desechable, como
// bajada_al_piso_concurrencia y la (7b) de clientas_por_modulo_y_anonimizar. En el CI no corren; ahí vigila (h1).
if (process.env.BASE_DESECHABLE === "1") {
  await carrera(
    "(h2) con COMMIT: dos cajas registran a la vez el mismo DNI nuevo → una sola ficha, y las dos cajas reciben su id",
    async () => {
      const dni = dniLibre();
      if (!dni.ok || !dni.salida) return [false, `no encontré un DNI libre: ${dni.mensaje ?? ""}`];
      const app = `club_venta_ligada_a_${Date.now()}`;
      const a = psqlEnParalelo(cajaA(app, dni.salida, "commit"));
      await dormir(100);
      const b = await psqlEnParalelo(`${esperarA(app)}begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}select retail.registrar_clienta(p_documento_numero => '${dni.salida}');
commit;
`);
      const ra = await a;
      const fin = correr(`select count(*) || '|' || min(id::text) from retail.clientas where documento_tipo = 'dni' and documento_numero = '${dni.salida}';`);
      if (!ra.ok || !b.ok || !fin.ok) return [false, [ra.mensaje, b.mensaje, fin.mensaje].filter(Boolean).join("\n")];
      const [idA] = ra.salida.split("\n").filter((l) => /^[0-9a-f-]{36}$/.test(l));
      const [vio, idB] = b.salida.split("\n");
      const obtenido = `A=${idA}\nB vio a A dormida: ${vio}\nB=${idB}\nfichas|id: ${fin.salida}`;
      return [Boolean(idA) && vio === "t" && idA === idB && fin.salida === `1|${idA}`, obtenido];
    }
  );

  await carrera(
    "(h3) con COMMIT: una caja une dos fichas mientras otra vende a la que se va → la venta termina en la ficha que quedó (nunca colgada de una unida)",
    async () => {
      const prep = correr(`insert into retail.clientas (documento_numero, nombre)
  values ((select '7' || lpad(floor(random() * 1e7)::int::text, 7, '0')), 'Prueba Carrera Queda') returning id;
insert into retail.clientas (nombre, telefono_whatsapp) values ('Prueba Carrera Se Va', '9' || lpad(floor(random() * 1e8)::int::text, 8, '0')) returning id;`);
      if (!prep.ok) return [false, prep.mensaje];
      const [queda, seVa] = prep.salida.split("\n");
      const app = `club_venta_ligada_u_${Date.now()}`;
      // U: la caja que une. Toma las dos fichas (`for update`), las une y duerme 4 s antes de confirmar.
      const u = psqlEnParalelo(`set application_name = '${app}';
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}select (retail.unir_clientas('${queda}', '${seVa}', null, null)).id;
select pg_sleep(4);
commit;
`);
      await dormir(100);
      // V: la caja que vende. Prepara su sede, espera a ver a U dormida y vende a la ficha que se va. Mira dónde quedó la
      // venta y se deshace (lo que se prueba es la ficha de la venta, no la venta).
      const v = await psqlEnParalelo(`begin;
set local search_path = retail, public, extensions;
${PRELUDIO.replace("begin;", "")}${SEDE()}${esperarA(app)}${como(FELIPE)}${VENDER("venta", { clienta: `'${seVa}'` })}reset role;
select case cliente_id when '${queda}'::uuid then 'la que quedó' when '${seVa}'::uuid then 'la que se fue (unida)' else coalesce(cliente_id::text, 'sin clienta') end
  from retail.ventas where id::text = :'venta';
rollback;
`);
      const ru = await u;
      const obtenido = `${ru.ok ? "U ok" : `U falló: ${ru.mensaje}`}\n${v.ok ? v.salida : `V falló: ${v.mensaje}`}`;
      return [obtenido === "U ok\nt\nla que quedó", obtenido];
    }
  );
} else {
  console.log("· (h2) y (h3), las carreras con COMMIT, no corrieron: solo corren con BASE_DESECHABLE=1 (dejan fichas de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

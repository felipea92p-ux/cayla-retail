#!/usr/bin/env node
/**
 * Pruebas de la tanda 1e del club de clientas: el comprobante acepta carné de extranjería y pasaporte (ADR-0288, DECISIÓN 3;
 * migración `20260930250000_club_paso1e_comprobante_carne_pasaporte.sql`).
 *
 * EL PROBLEMA. El comprobante solo aceptaba `dni`, `ruc` y `sin_documento`: la boleta de una clienta extranjera salía «sin
 * documento» y sus compras nunca se ligaban a su ficha (CL-27 compara el tipo del comprobante con el de la ficha). La base
 * tiene que hacer cumplir, no la pantalla:
 *   - una boleta (o nota de venta) a un carné o a un pasaporte guarda ese tipo y el número limpio (sin espacios, mayúsculas);
 *   - un carné o un pasaporte fuera de formato (o sin número) se rechaza con `documento_invalido`, y con él la venta entera
 *     (no queda venta, ni stock movido, ni correlativo gastado);
 *   - una factura sigue exigiendo RUC;
 *   - el candado de la tabla lo frena aunque alguien se salte `emitir_comprobante`.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated` en las
 * ventas, para que los permisos se evalúen de verdad; cuenta del seed: Felipe, líder):
 *   a. Boleta con carné y con pasaporte (este, escrito en minúsculas y con espacios): el comprobante guarda el tipo y el
 *      número limpio; también una nota de venta. DNI y «sin documento» siguen igual.
 *   b. Formato: carné corto, pasaporte con guion y carné sin número → `documento_invalido`, sin venta, sin stock movido y
 *      sin correlativo gastado.
 *   c. La factura sigue exigiendo RUC: con carné, `comprobantes_factura_requiere_ruc`; con RUC, se emite.
 *   d. El candado de la tabla, saltándose la función: carné fuera de formato o sin número, y un tipo que no existe.
 *   e. CL-27: registrar a la clienta con su carné liga la venta anterior con boleta a ese carné; la venta con boleta a un
 *      DNI con los mismos dígitos no (el tipo cuenta).
 *   f. Una nota de crédito sobre una boleta con carné lleva el mismo tipo y número.
 *   g. Estructura: los md5 «después» de la sección 0 son los de las funciones vivas; una sola firma de `emitir_comprobante` y
 *      sigue sin EXECUTE para la API; los dos candados, validados y con su definición.
 *   h. Pegado: pegarla otra vez deja todo igual (función, permisos, candados, comentario) y el bloque una sola vez; con
 *      `emitir_comprobante` cambiada en vivo, aborta con un mensaje claro y no pisa nada.
 *
 * FUERA A PROPÓSITO: Lucode y SUNAT. Esta prueba no transmite nada (ni al sandbox): el envío con «4» y «7» lo prueba
 * `apps/web/lib/lucode.test.ts` sin red, y que SUNAT lo acepte, la boleta de prueba real del ADR. Tampoco los apartados:
 * siguen guardando solo DNI (DESCARTÉ de la migración).
 *
 * USO
 *   pnpm pruebas:comprobante-carne-pasaporte                → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:comprobante-carne-pasaporte --base cayla_x → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260930250000_club_paso1e_comprobante_carne_pasaporte.sql"),
  "utf8"
);

// La tabla del candado de versión de la sección 0: firma → md5 normalizado «antes» (main) y «después» (este archivo).
const VERSIONES = [...MIGRACION.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+'([0-9a-f]{32})',\s+'([0-9a-f]{32})'\)/g)].map((m) => ({
  firma: m[1],
  antes: m[2],
  despues: m[3],
}));
if (VERSIONES.length !== 3) {
  console.error(`✗ La tabla de versiones de la migración debería tener 3 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const EMITIR = VERSIONES.find((v) => v.firma.startsWith("retail.emitir_comprobante(")).firma;

// Seed local: Felipe (líder y Admin).
const FELIPE = "22222222-2222-4222-8222-000000000001";
// Tokens fijos: para contar, después de un rechazo, que no quedó ninguna venta con ese token.
const TOKEN_A = "88888888-8888-4888-8888-0000000001e1";
const TOKEN_B = "88888888-8888-4888-8888-0000000001e2";
const TOKEN_C = "88888888-8888-4888-8888-0000000001e3";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

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

-- Vende 1 BLU-EMMA-NEG-M a precio de lista con el comprobante y el documento que se le pidan. Devuelve el id de la venta, o
-- «ERROR|hint» (o «ERROR|mensaje») si registrar_venta la rechaza: el rechazo deshace todo lo que la venta hizo. Tampoco es
-- security definer: la llama la cuenta del caso.
create function pg_temp.vender(p_ubic uuid, p_variante uuid, p_precio numeric, p_token uuid,
  p_comprobante text, p_tipo_doc text, p_num_doc text) returns text language plpgsql as $f$
declare v_id uuid; v_msg text; v_hint text;
begin
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic,
    p_items => jsonb_build_array(jsonb_build_object('variante_id', p_variante, 'cantidad', 1, 'precio_unitario', p_precio, 'descuento_unitario', 0)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', p_precio)),
    p_token => p_token,
    p_tipo_comprobante => p_comprobante,
    p_cliente_tipo_doc => coalesce(p_tipo_doc, 'sin_documento'),
    p_cliente_num_doc => p_num_doc,
    p_cliente_nombre => 'Compradora Prueba 1e'
  );
  return v_id::text;
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, uuid, numeric, uuid, text, text, text) to authenticated;

-- Una persona firma a su nombre, como hoy en el mostrador.
update retail.configuracion_empresa set exige_responsable = false;
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

/**
 * Una sede lista para vender (como en registrar_venta.mjs y club_venta_ligada.mjs): piso y almacén si faltaran, su caja
 * abierta por el líder y 100 unidades de BLU-EMMA-NEG-M en el piso. Deja :ubic, :v1, :v1_precio, :stock0 y :serie0 (el
 * próximo número de la serie de boletas). Corre como `postgres` con los claims del líder (abrir_caja firma con él).
 */
const SEDE = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba comprobante_carne_pasaporte') as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select coalesce(sum(cantidad), 0) as stock0 from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic' \\gset
select coalesce(sum(siguiente_numero), 0) as serie0 from retail.series_comprobantes
 where ubicacion_id = :'ubic' and tipo = 'boleta' and archivada_at is null \\gset
`;
/** `select pg_temp.vender(...) as <alias> \gset`. `tipoDoc` y `num` son SQL (un literal entre comillas, o null). */
const VENDER = (alias, { token = "gen_random_uuid()", comprobante = "'boleta'", tipoDoc = "null", num = "null" } = {}) =>
  `select pg_temp.vender(:'ubic', :'v1', :'v1_precio', ${token}, ${comprobante}, ${tipoDoc}, ${num}) as ${alias} \\gset\n`;
/** El documento que quedó en el comprobante de una venta: «tipo|número|comprobante». */
const DOC_DE = (alias) => `reset role;
select cliente_tipo_doc || '|' || coalesce(cliente_num_doc, '∅') || '|' || tipo from retail.comprobantes where venta_id::text = :'${alias}';
`;
/** Después de un rechazo: ¿quedó alguna venta con ese token, se movió el stock, se gastó un número de boleta? */
const NADA_SE_GUARDO = (token) => `reset role;
select (select count(*) from retail.ventas where token_cliente = '${token}')
    || '|' || (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic') - :stock0
    || '|' || (select coalesce(sum(siguiente_numero), 0) from retail.series_comprobantes
                where ubicacion_id = :'ubic' and tipo = 'boleta' and archivada_at is null) - :serie0;
`;

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
// a. Boleta con carné y con pasaporte
// =====================================================================================================================
caso(
  "(a) boleta con carné de extranjería: el comprobante guarda el tipo y el número",
  SEDE + como(FELIPE) + VENDER("venta", { tipoDoc: "'carne_extranjeria'", num: "'001234567'" }) + DOC_DE("venta"),
  "carne_extranjeria|001234567|boleta"
);
caso(
  "(a) boleta con pasaporte escrito en minúsculas y con espacios: se guarda limpio (AB123456)",
  SEDE + como(FELIPE) + VENDER("venta", { tipoDoc: "'pasaporte'", num: "' ab 123 456 '" }) + DOC_DE("venta"),
  "pasaporte|AB123456|boleta"
);
caso(
  "(a) nota de venta con pasaporte: también lo guarda (y sigue interna, sin SUNAT)",
  // El seed no trae serie de nota de venta: se registra dentro de la transacción (se revierte).
  SEDE +
    `select retail.registrar_serie_comprobante(:'ubic', 'nota_venta', 'NV97') as _nv
 where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_venta' and archivada_at is null) \\gset
` +
    como(FELIPE) + VENDER("venta", { comprobante: "'nota_venta'", tipoDoc: "'pasaporte'", num: "'XY987654'" }) + `select :'venta' ~ '^ERROR';\n` + DOC_DE("venta") +
    `select estado from retail.comprobantes where venta_id::text = :'venta';\n`,
  "f\npasaporte|XY987654|nota_venta\ninterna"
);
caso(
  "(a) DNI y «sin documento» siguen como antes",
  SEDE + como(FELIPE) + VENDER("con_dni", { tipoDoc: "'dni'", num: "'71234482'" }) + VENDER("sin_doc") + DOC_DE("con_dni") + DOC_DE("sin_doc"),
  "dni|71234482|boleta\nsin_documento|∅|boleta"
);

// =====================================================================================================================
// b. Formato: la venta entera se rechaza, sin gastar nada
// =====================================================================================================================
caso(
  "(b) carné de 5 caracteres: documento_invalido, y no queda venta, ni stock movido, ni número de boleta gastado",
  SEDE + como(FELIPE) + VENDER("venta", { token: `'${TOKEN_A}'`, tipoDoc: "'carne_extranjeria'", num: "'12345'" }) + `select :'venta';\n` + NADA_SE_GUARDO(TOKEN_A),
  "ERROR|documento_invalido\n0|0|0"
);
caso(
  "(b) pasaporte con guion: documento_invalido, sin guardar nada",
  SEDE + como(FELIPE) + VENDER("venta", { token: `'${TOKEN_B}'`, tipoDoc: "'pasaporte'", num: "'AB-123456'" }) + `select :'venta';\n` + NADA_SE_GUARDO(TOKEN_B),
  "ERROR|documento_invalido\n0|0|0"
);
caso(
  "(b) carné sin número: documento_invalido (la pantalla manda «sin documento» cuando está vacío; si llega así, es un error), sin guardar nada",
  SEDE + como(FELIPE) + VENDER("venta", { token: `'${TOKEN_C}'`, tipoDoc: "'carne_extranjeria'", num: "null" }) + `select :'venta';\n` + NADA_SE_GUARDO(TOKEN_C),
  "ERROR|documento_invalido\n0|0|0"
);
// El hint es estable; el mensaje, en castellano de la tienda. Se lee con otra captura (sin el hint).
caso(
  "(b) …y dice qué está mal: «El carné de extranjería tiene de 6 a 12 letras o números, sin guiones.»",
  SEDE +
    `create function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end $f$;
grant execute on function pg_temp.mensaje(text) to authenticated;
` +
    como(FELIPE) +
    `select pg_temp.mensaje(format($q$select retail.registrar_venta(p_ubicacion_id => %L, p_items => jsonb_build_array(jsonb_build_object('variante_id', %L, 'cantidad', 1, 'precio_unitario', %s, 'descuento_unitario', 0)), p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', %s)), p_tipo_comprobante => 'boleta', p_cliente_tipo_doc => 'carne_extranjeria', p_cliente_num_doc => '12345')$q$, :'ubic', :'v1', :'v1_precio', :'v1_precio'));
`,
  "El carné de extranjería tiene de 6 a 12 letras o números, sin guiones."
);

// =====================================================================================================================
// c. La factura sigue exigiendo RUC
// =====================================================================================================================
caso(
  "(c) factura a un carné: la rechaza comprobantes_factura_requiere_ruc (y no queda venta)",
  SEDE + como(FELIPE) + VENDER("venta", { token: `'${TOKEN_A}'`, comprobante: "'factura'", tipoDoc: "'carne_extranjeria'", num: "'001234567'" }) +
    `select :'venta' ~ 'comprobantes_factura_requiere_ruc';\n` + NADA_SE_GUARDO(TOKEN_A),
  "t\n0|0|0"
);
caso(
  "(c) factura a un pasaporte, directo a emitir_comprobante: también la rechaza comprobantes_factura_requiere_ruc",
  SEDE +
    `reset role;
select pg_temp.intento(format($q$select retail.emitir_comprobante(%L::uuid, 'factura', 84.75, 15.25, 100.00, null, 'pasaporte', 'AB123456', 'X')$q$, :'ubic'));
`,
  (o) => o.startsWith("23514|") && o.includes("comprobantes_factura_requiere_ruc")
);
caso(
  "(c) factura con RUC: se emite como siempre",
  SEDE + como(FELIPE) + VENDER("venta", { comprobante: "'factura'", tipoDoc: "'ruc'", num: "'20605964550'" }) + DOC_DE("venta"),
  "ruc|20605964550|factura"
);

// =====================================================================================================================
// d. El candado de la tabla, saltándose la función
// =====================================================================================================================
const INSERTAR = (tipoDoc, num) =>
  `select pg_temp.intento(format($q$insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, total, estado) values (%L, 'boleta', 'B999', 999999, %L, %L, 10, 'pendiente')$q$, :'ubic', ${tipoDoc}, ${num}));\n`;
caso(
  "(d) insert directo: carné fuera de formato, pasaporte en minúsculas y carné sin número los frena comprobantes_carne_pasaporte_formato; un tipo inventado, comprobantes_cliente_tipo_doc_check",
  SEDE + `reset role;\n` +
    INSERTAR("'carne_extranjeria'", "'12345'") +
    INSERTAR("'pasaporte'", "'ab123456'") +
    INSERTAR("'carne_extranjeria'", "null") +
    INSERTAR("'cedula'", "'12345678'") +
    INSERTAR("'pasaporte'", "'AB123456'"),
  (o) => {
    const l = o.split("\n");
    return (
      l.length === 5 &&
      l.slice(0, 3).every((x) => x.startsWith("23514|") && x.includes("comprobantes_carne_pasaporte_formato")) &&
      l[3].startsWith("23514|") && l[3].includes("comprobantes_cliente_tipo_doc_check") &&
      l[4] === "SIN_ERROR"
    );
  }
);

// =====================================================================================================================
// e. CL-27: registrar a la clienta con su carné liga la venta anterior
// =====================================================================================================================
caso(
  "(e) la venta con boleta a un carné se liga al registrar a la clienta con ese carné; la de un DNI con los mismos dígitos, no",
  SEDE + como(FELIPE) +
    VENDER("con_carne", { tipoDoc: "'carne_extranjeria'", num: "'00123456'" }) +
    VENDER("con_dni", { tipoDoc: "'dni'", num: "'00123456'" }) +
    `select retail.registrar_clienta(p_documento_tipo => 'carne_extranjeria', p_documento_numero => '00123456', p_nombre => 'Clienta Carné 1e') as ficha \\gset
reset role;
select (select cliente_id = :'ficha'::uuid from retail.ventas where id::text = :'con_carne')
    || '|' || (select cliente_id is null from retail.ventas where id::text = :'con_dni');
`,
  "true|true"
);

// =====================================================================================================================
// f. Nota de crédito sobre una boleta con carné
// =====================================================================================================================
caso(
  "(f) la nota de crédito de una boleta con carné lleva el mismo tipo y número (y la serie de la letra B)",
  SEDE + como(FELIPE) + VENDER("venta", { tipoDoc: "'carne_extranjeria'", num: "'001234567'" }) +
    `reset role;
select id as bol from retail.comprobantes where venta_id::text = :'venta' \\gset
select retail.registrar_serie_comprobante(:'ubic', 'nota_credito', 'BC97') as _bc
 where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito'
                     and archivada_at is null and serie like 'B%') \\gset
-- SUNAT solo admite notas sobre lo que ya aceptó (fn_valida_nota_referencia_aceptada).
select retail.actualizar_transmision_comprobante(:'bol', 'aceptado', 'sandbox', '{"prueba": true}'::jsonb) as _ab \\gset
select retail.emitir_nota(:'bol', 'nota_credito', '06', 84.75, 15.25, 100.00) as nota \\gset
select cliente_tipo_doc || '|' || cliente_num_doc || '|' || left(serie, 1) from retail.comprobantes where id = :'nota';
`,
  "carne_extranjeria|001234567|B"
);

// =====================================================================================================================
// g. Estructura
// =====================================================================================================================
caso(
  "(g) los md5 «después» de la sección 0 son los de las funciones vivas",
  VERSIONES.map(
    (v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`
  ).join(""),
  VERSIONES.map((v) => v.despues).join("\n")
);
caso(
  "(g) una sola firma de emitir_comprobante, con el bloque de la tanda 1e una sola vez, y sin EXECUTE para anon ni authenticated",
  `select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'emitir_comprobante';
select (length(prosrc) - length(replace(prosrc, 'ADR-0288 D-3', ''))) / length('ADR-0288 D-3') from pg_proc where oid = '${EMITIR}'::regprocedure;
select has_function_privilege('anon', '${EMITIR}', 'execute'), has_function_privilege('authenticated', '${EMITIR}', 'execute');
`,
  "1\n1\nf|f"
);
caso(
  "(g) los dos candados de comprobantes, validados y con su definición; la factura sigue exigiendo RUC",
  `select conname || ':' || convalidated || ':' || pg_get_constraintdef(oid) from pg_constraint
  where conrelid = 'retail.comprobantes'::regclass
    and conname in ('comprobantes_cliente_tipo_doc_check', 'comprobantes_carne_pasaporte_formato', 'comprobantes_factura_requiere_ruc')
  order by conname;
`,
  [
    "comprobantes_carne_pasaporte_formato:true:CHECK (((cliente_tipo_doc <> ALL (ARRAY['carne_extranjeria'::text, 'pasaporte'::text])) OR (COALESCE(cliente_num_doc, ''::text) ~ '^[A-Z0-9]{6,12}$'::text)))",
    "comprobantes_cliente_tipo_doc_check:true:CHECK ((cliente_tipo_doc = ANY (ARRAY['dni'::text, 'ruc'::text, 'carne_extranjeria'::text, 'pasaporte'::text, 'sin_documento'::text])))",
    "comprobantes_factura_requiere_ruc:true:CHECK (((tipo <> 'factura'::text) OR ((cliente_tipo_doc = 'ruc'::text) AND (cliente_num_doc IS NOT NULL))))",
  ].join("\n")
);

// =====================================================================================================================
// h. Pegado
// =====================================================================================================================
// Una foto de todo lo que la migración toca: cuerpo y permisos de emitir_comprobante (y de los dos ayudantes que usa),
// candados y comentario de la columna. Una línea: su md5.
const FOTO = `reset role;
select md5(string_agg(x, '|' order by x)) from (
  select p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '')
    from pg_proc p where p.oid in (select to_regprocedure(f) from unnest(array[${VERSIONES.map((v) => `'${v.firma}'`).join(", ")}]) f)
  union all
  select 'con:' || conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated || ':' || coalesce(obj_description(oid, 'pg_constraint'), '')
    from pg_constraint where conrelid = 'retail.comprobantes'::regclass
  union all
  select 'col:' || coalesce(col_description('retail.comprobantes'::regclass, a.attnum), '')
    from pg_attribute a where a.attrelid = 'retail.comprobantes'::regclass and a.attname = 'cliente_tipo_doc'
) f(x);
select (length(prosrc) - length(replace(prosrc, 'ADR-0288 D-3', ''))) / length('ADR-0288 D-3') from pg_proc where oid = '${EMITIR}'::regprocedure;
`;
const PEGAR = `reset role;\n${MIGRACION}\nset local search_path = retail, public, extensions;\n`;
caso(
  "(h) pegarla otra vez deja todo igual: función, permisos, candados y comentario (y el bloque una sola vez)",
  FOTO + PEGAR + FOTO,
  (s) => {
    // Sin las líneas vacías que imprimen los `select` de la migración (su reemplazo anclado devuelve void).
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === "1" && l[3] === "1";
  }
);
// Una función cambiada en vivo (md5 que no es ni «antes» ni «después»): la migración aborta con un mensaje claro y no pisa.
const CAMBIADA_EN_VIVO = `reset role;
do $cambio$ begin
  execute replace(pg_get_functiondef('${EMITIR}'::regprocedure), 'Una nota de venta no desglosa IGV', 'Una nota de venta NUNCA desglosa IGV');
end $cambio$;
`;
caso(
  "(h) candado de versión: con emitir_comprobante cambiada en vivo, la migración aborta con un mensaje claro",
  CAMBIADA_EN_VIVO + PEGAR,
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes(`${EMITIR} cambió desde que se escribió esta migración`)
);
caso(
  "(h) …y no pisa NADA: la función sigue con su cambio y los candados quedan como estaban",
  // Sin ON_ERROR_STOP y dentro de un savepoint: si el candado aborta, se vuelve al savepoint para mirar qué quedó. Si NO
  // abortara, no se revierte nada y la foto lo delata.
  CAMBIADA_EN_VIVO + FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${MIGRACION}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    FOTO +
    `select position('NUNCA desglosa' in prosrc) > 0 from pg_proc where oid = '${EMITIR}'::regprocedure;\n`,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 5 && l[0] === l[2] && l[1] === "1" && l[3] === "1" && l[4] === "t";
  }
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);

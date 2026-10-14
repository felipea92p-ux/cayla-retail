#!/usr/bin/env node
/**
 * Las cuentas de la tienda online (ADR-0408, actividad 2) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014223000_tienda_cuentas_parte1_clientas.sql` y `20261014224000_tienda_cuentas_parte2_cuentas_web.sql`:
 *   1. Estructura: `cuentas_web` con RLS y sin políticas ni permisos para nadie (tampoco `tienda_web`); las seis funciones
 *      `tienda_*` de la cuenta son security definer, solo las ejecuta `tienda_web`; el ayudante del correo, nadie de la API.
 *   2. Mientras se escribe: `tienda_consultar_correo` y `tienda_consultar_documento` dicen libre / repetido / archivada /
 *      del club, cuentan un intento de consulta (y uno inválido no lo cuenta) y frenan a los 20 por ip y hora.
 *   3. Antes de crear el usuario: `tienda_revisar_registro` cuenta un intento de registro, frena por ip (5), documento (3) y
 *      celular (3), y dice si el correo o el DNI ya tienen cuenta o si la ficha está archivada.
 *   4. `tienda_registrar_cuenta`: con un DNI nuevo crea la ficha (origen web, socia con código, celular normalizado,
 *      cumpleaños como el Club, sin persona) y la cuenta, y anota la actividad sin datos suyos; con una ficha que existe se une
 *      a ella sin pisar lo que tiene (solo el nombre del padrón reemplaza); y rechaza con su hint —sin escribir NADA— un correo
 *      o un DNI repetidos, el mismo usuario dos veces, una ficha archivada, un menor de 18, un cumpleaños imposible, un
 *      celular que no es, sin aceptar los términos o sin nombre.
 *   5. `tienda_mi_cuenta` y `tienda_club_beneficios` devuelven lo que la página muestra; como `tienda_web`, todo el camino
 *      funciona y las tablas se niegan.
 *   6. Las dos partes se pueden pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: crea sus fichas (DNI 0999xxxx, que el seed no usa) y sus intentos
 * (huellas «zz-…» de esta corrida), y nada queda en el Postgres local que comparten los worktrees. Para actuar como
 * `tienda_web`, quien corre la prueba se da ese rol dentro de la transacción (se revierte).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete las dos partes dentro de cada transacción (que se revierte). Sin la variable,
 * prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el rol `tienda_web` (20261014220000), las funciones del club (`club_intento`, `fn_club_codigo_nuevo`,
 * `fn_club_textos_legales`, ADR-0288) y ninguna ficha con DNI 0999xxxx.
 *
 * USO
 *   pnpm pruebas:tienda-cuentas    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-cuentas -- --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261014223000_tienda_cuentas_parte1_clientas.sql",
  "supabase/migrations/20261014224000_tienda_cuentas_parte2_cuentas_web.sql",
];
// `APLICAR_ANTES=1` aplica las dos partes del repo; `APLICAR_ANTES=<parte1>,<parte2>`, otras (p. ej. una copia rota a propósito,
// para ver que la prueba muerde).
const ANTES = process.env.APLICAR_ANTES ?? "";
const APLICAR_ANTES = ANTES ? (ANTES === "1" ? MIGRACIONES : ANTES.split(",")).map((m) => readFileSync(m.trim(), "utf8")).join("\n") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

// ---- Datos de esta corrida ----
const CORRIDA = Date.now().toString(36);
let n = 0;
/** Una huella de ip (o de documento) de esta corrida: no choca con intentos reales de la última hora. */
const huella = (que = "ip") => `zz-${que}-${CORRIDA}-${++n}`;
const DNI = { nuevo: "09990001", caja: "09990002", socia: "09990003", archivada: "09990004", vacia: "09990005", otro: "09990006" };
const TEXTOS = "borrador-2026-10-14";

// Cada escenario parte con sus fichas a mano: una de caja (sin club), una socia, una archivada y una sin celular ni cumpleaños.
const PREPARAR = `
begin;
${APLICAR_ANTES}
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0999%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0999xxxx en esta base.';
  end if;
end $$;
select retail.fn_hoy_lima() as hoy \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes)
values ('dni', '${DNI.caja}', 'Ana Prueba Caja', '987000111', 3, 4) returning id as caja \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, cumple_anio,
                             club_desde, codigo_club)
values ('dni', '${DNI.socia}', 'Bea Socia Antigua', '987000222', 9, 9, 1990, now() - interval '400 days',
        retail.fn_club_codigo_nuevo()) returning id as socia, codigo_club as codigo_socia \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
values ('dni', '${DNI.archivada}', 'Ceci Archivada', now(), 'prueba de la tienda') returning id as archivada \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '${DNI.vacia}', 'Dora Sin Datos')
returning id as vacia \\gset
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_detalle text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_detalle = pg_exception_detail;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || coalesce(v_detalle, '');
end $f$;
`;

/** La llamada a tienda_registrar_cuenta con lo de un registro bueno, cambiando lo que se pida. Literales: va dentro de $q$. */
function registrar(cambios = {}) {
  const d = {
    usuario: randomUUID(),
    correo: `zz.${CORRIDA}.${++n}@ejemplo.com`,
    dni: DNI.nuevo,
    nombre: "Lucía Fernanda Pérez Salas",
    padron: true,
    celular: "+51 987 654 321",
    dia: 14,
    mes: 10,
    anio: 1995,
    acepta: true,
    textos: TEXTOS,
    ...cambios,
  };
  const t = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const num = (v) => (v === null ? "null" : String(v));
  return {
    d,
    sql: `select retail.tienda_registrar_cuenta(${d.usuario === null ? "null" : `'${d.usuario}'`}::uuid, ${t(d.correo)}, ${t(d.dni)}, ${t(d.nombre)}, ${d.padron}, ${t(d.celular)}, ${num(d.dia)}, ${num(d.mes)}, ${num(d.anio)}, ${d.acepta}, ${t(d.textos)})`,
  };
}
const RECUENTO = `(select count(*) from retail.clientas where documento_numero like '0999%') || ':' || (select count(*) from retail.cuentas_web) || ':' || (select count(*) from retail.actividad where accion = 'registro_web')`;
/** Corre una llamada sin que su resultado salga en la salida (la guarda en una variable de psql que nadie lee). */
const callado = (sql) => `select (${sql}) as _ignorar \\gset`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES && correr("select to_regclass('retail.cuentas_web') is not null;").salida !== "t") {
    console.error(`Falta retail.cuentas_web: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=1`);
    process.exit(2);
  }
  const preparado = correr(`${PREPARAR}select 'listo';\nrollback;`);
  if (!preparado.ok || preparado.salida !== "listo") {
    console.error(`No se pudo preparar el escenario: ${preparado.mensaje ?? preparado.salida}`);
    process.exit(2);
  }

  console.log("— Estructura —");
  esperarValor(
    "cuentas_web tiene RLS, ninguna política y ningún permiso para public, anon, authenticated ni tienda_web",
    correr(`${PREPARAR}
      select c.relrowsecurity::text || '|' || (select count(*) from pg_policy p where p.polrelid = c.oid) || '|' ||
             (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
              or has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE'))::text
        from pg_class c where c.oid = 'retail.cuentas_web'::regclass;
      rollback;`),
    "true|0|false",
  );
  const FUNCIONES = [
    "tienda_consultar_correo(text,text)",
    "tienda_consultar_documento(text,text,text)",
    "tienda_revisar_registro(text,text,text,text,text)",
    "tienda_registrar_cuenta(uuid,text,text,text,boolean,text,integer,integer,integer,boolean,text)",
    "tienda_mi_cuenta(uuid)",
    "tienda_club_beneficios()",
  ];
  esperarValor(
    "las seis funciones de la cuenta: security definer, con su search_path, solo para tienda_web",
    correr(`${PREPARAR}
      select string_agg(f || ':' || (p.prosecdef and exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'))::text || ':' ||
             has_function_privilege('tienda_web', p.oid, 'EXECUTE')::text || ':' ||
             (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('public', p.oid, 'EXECUTE'))::text, ',' order by f)
        from unnest(array[${FUNCIONES.map((f) => `'${f}'`).join(", ")}]) f
        join pg_proc p on p.oid = ('retail.' || f)::regprocedure;
      rollback;`),
    [...FUNCIONES].sort().map((f) => `${f}:true:true:false`).join(","),
  );
  esperarValor(
    "el ayudante del correo no lo ejecuta nadie de la API (tampoco tienda_web)",
    correr(`${PREPARAR}
      select (has_function_privilege('tienda_web', 'retail.fn_cuenta_web_correo(text)', 'EXECUTE')
              or has_function_privilege('anon', 'retail.fn_cuenta_web_correo(text)', 'EXECUTE')
              or has_function_privilege('authenticated', 'retail.fn_cuenta_web_correo(text)', 'EXECUTE'))::text;
      rollback;`),
    "false",
  );
  esperarValor(
    "registro_origen acepta web (y sigue rechazando lo que no es caja, cartel ni web)",
    correr(`${PREPARAR}
      select pg_temp.intento($q$update retail.clientas set registro_origen = 'web' where documento_numero = '${DNI.vacia}'$q$) || '#' ||
             split_part(pg_temp.intento($q$update retail.clientas set registro_origen = 'tienda' where documento_numero = '${DNI.vacia}'$q$), '|', 1);
      rollback;`),
    "ok#23514",
  );

  console.log("— Mientras se escribe: el correo y el DNI —");
  const ip1 = huella();
  esperarValor(
    "un correo libre: «libre», y cuenta un intento de consulta con esa huella",
    // El intento se cuenta en la sentencia que sigue: la misma sentencia no ve lo que escribió la función que llama.
    correr(`${PREPARAR}
      select retail.tienda_consultar_correo(' Nueva.Persona@Ejemplo.com ', '${ip1}') ->> 'estado' as estado \\gset
      select :'estado' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip1}' and tipo = 'consulta');
      rollback;`),
    "libre|1",
  );
  const ip2 = huella();
  esperarValor(
    "un correo mal escrito: «invalido» y NO cuenta el intento",
    correr(`${PREPARAR}
      select string_agg(retail.tienda_consultar_correo(c, '${ip2}') ->> 'estado', ',') as estados
        from unnest(array['ana@', 'ana@gmail', '', null, 'ana @gmail.com']) c \\gset
      select :'estados' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip2}');
      rollback;`),
    "invalido,invalido,invalido,invalido,invalido|0",
  );
  const ip3 = huella();
  const r1 = registrar({ correo: "zz.ana.repetida@ejemplo.com" });
  esperarValor(
    "un correo que ya tiene cuenta: «repetido» (sin importar mayúsculas ni espacios)",
    correr(`${PREPARAR}
      ${callado(r1.sql)}
      select retail.tienda_consultar_correo('  ZZ.Ana.Repetida@Ejemplo.COM', '${ip3}') ->> 'estado';
      rollback;`),
    "repetido",
  );
  const ip4 = huella();
  esperarValor(
    "a los 20 intentos de consulta de una ip en la hora, el 21 dice «limite»",
    correr(`${PREPARAR}
      insert into retail.club_intentos_registro (tipo, ip_hash) select 'consulta', '${ip4}' from generate_series(1, 20);
      select retail.tienda_consultar_correo('otra.persona@ejemplo.com', '${ip4}') ->> 'estado';
      rollback;`),
    "limite",
  );
  const ip5 = huella();
  const doc5 = huella("doc");
  esperarValor(
    "un DNI sin ficha: «libre», no es del club; cuenta la consulta con la huella del documento",
    correr(`${PREPARAR}
      select retail.tienda_consultar_documento('${DNI.nuevo}', '${ip5}', '${doc5}')::text as r \\gset
      select :'r' || '|' ||
             (select count(*) from retail.club_intentos_registro where ip_hash = '${ip5}' and documento_hash = '${doc5}' and tipo = 'consulta');
      rollback;`),
    '{"estado": "libre", "del_club": false}|1',
  );
  const ip6 = huella();
  esperarValor(
    "DNI de una socia: libre y del club; de una ficha de caja: libre y no del club; de una archivada: «archivada»",
    correr(`${PREPARAR}
      select (retail.tienda_consultar_documento('${DNI.socia}', '${ip6}', 'zz-d1') ->> 'del_club') || '|' ||
             (retail.tienda_consultar_documento('${DNI.caja}', '${ip6}', 'zz-d2') ->> 'del_club') || '|' ||
             (retail.tienda_consultar_documento('${DNI.archivada}', '${ip6}', 'zz-d3') ->> 'estado');
      rollback;`),
    "true|false|archivada",
  );
  const ip7 = huella();
  esperarValor(
    "un DNI mal escrito: «invalido» y no cuenta; uno que ya tiene cuenta: «repetido»",
    correr(`${PREPARAR}
      select (retail.tienda_consultar_documento('1234567', '${ip7}', 'zz-d') ->> 'estado') || '|' ||
             (retail.tienda_consultar_documento('ABCDEFGH', '${ip7}', 'zz-d') ->> 'estado') as estados \\gset
      select :'estados' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip7}');
      ${callado(registrar({ dni: DNI.socia }).sql)}
      select retail.tienda_consultar_documento('${DNI.socia}', '${ip7}', 'zz-d') ->> 'estado';
      rollback;`),
    "invalido|invalido|0\nrepetido",
  );

  console.log("— Antes de crear el usuario: tienda_revisar_registro —");
  const revisar = (correo, dni, celular, ip, doc) =>
    `retail.tienda_revisar_registro(${correo === null ? "null" : `'${correo}'`}, '${dni}', '${celular}', '${ip}', '${doc}')`;
  const ip8 = huella();
  esperarValor(
    "todo libre: «ok», y cuenta UN intento de registro (con su huella de documento y el celular normalizado)",
    correr(`${PREPARAR}
      select ${revisar("nuevo@ejemplo.com", DNI.nuevo, "+51 987 654 321", ip8, "zz-doc-8")} ->> 'estado' as estado \\gset
      select :'estado' || '|' ||
             (select string_agg(tipo || ':' || coalesce(documento_hash, '-') || ':' || coalesce(celular, '-'), ',')
                from retail.club_intentos_registro where ip_hash = '${ip8}');
      rollback;`),
    "ok|registro:zz-doc-8:987654321",
  );
  const ip9 = huella();
  esperarValor(
    "datos que no son: «invalido» con su campo, sin contar el intento",
    correr(`${PREPARAR}
      select (${revisar("nuevo@", DNI.nuevo, "987654321", ip9, "zz-d")} ->> 'campo') || ',' ||
             (${revisar("nuevo@ejemplo.com", "123", "987654321", ip9, "zz-d")} ->> 'campo') || ',' ||
             (${revisar("nuevo@ejemplo.com", DNI.nuevo, "887654321", ip9, "zz-d")} ->> 'campo') as campos \\gset
      select :'campos' || '|' || (select count(*) from retail.club_intentos_registro where ip_hash = '${ip9}');
      rollback;`),
    "correo,dni,celular|0",
  );
  const ip10 = huella();
  const r10 = registrar({ correo: "zz.tomado@ejemplo.com", dni: DNI.socia });
  esperarValor(
    "correo con cuenta: «correo_repetido»; DNI con cuenta: «dni_repetido»; ficha archivada: «archivada»",
    correr(`${PREPARAR}
      ${callado(r10.sql)}
      select (${revisar("ZZ.Tomado@ejemplo.com", DNI.nuevo, "987654321", huella(), "zz-a")} ->> 'estado') || ',' ||
             (${revisar("libre@ejemplo.com", DNI.socia, "987654321", huella(), "zz-b")} ->> 'estado') || ',' ||
             (${revisar("libre@ejemplo.com", DNI.archivada, "987654321", ip10, "zz-c")} ->> 'estado');
      rollback;`),
    "correo_repetido,dni_repetido,archivada",
  );
  const ip11 = huella();
  const doc11 = huella("doc");
  esperarValor(
    "los topes del cartel: 5 registros por ip, 3 por documento y 3 por celular en la hora → «limite»",
    correr(`${PREPARAR}
      insert into retail.club_intentos_registro (tipo, ip_hash) select 'registro', '${ip11}' from generate_series(1, 5);
      insert into retail.club_intentos_registro (tipo, ip_hash, documento_hash) select 'registro', 'zz-otra-' || g, '${doc11}' from generate_series(1, 3) g;
      insert into retail.club_intentos_registro (tipo, ip_hash, celular) select 'registro', 'zz-otra-' || g, '912121212' from generate_series(1, 3) g;
      select (${revisar("a@ejemplo.com", DNI.nuevo, "987654321", ip11, "zz-x")} ->> 'estado') || ',' ||
             (${revisar("a@ejemplo.com", DNI.nuevo, "987654321", huella(), doc11)} ->> 'estado') || ',' ||
             (${revisar("a@ejemplo.com", DNI.nuevo, "912121212", huella(), "zz-y")} ->> 'estado') || ',' ||
             (${revisar("a@ejemplo.com", DNI.nuevo, "976543210", huella(), "zz-z")} ->> 'estado');
      rollback;`),
    "limite,limite,limite,ok",
  );

  console.log("— tienda_registrar_cuenta —");
  const r20 = registrar({ correo: " Lucia.Perez@Ejemplo.com " });
  esperarValor(
    "DNI nuevo: crea la ficha (origen web, socia con código, celular normalizado, cumpleaños, correo, sin persona ni tienda) y la cuenta",
    correr(`${PREPARAR}
      select (${r20.sql}) as r \\gset
      select (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'nombre_corto') || '|' ||
             ((:'r'::jsonb ->> 'codigo_club') ~ '^C-[0-9]{4,}$')::text;
      select c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '/' || c.cumple_anio || '|' ||
             c.correo || '|' || c.registro_origen || '|' || (c.created_por is null)::text || '|' || (c.club_ubicacion_id is null)::text || '|' ||
             (c.publicidad_desde is null)::text || '|' || (c.club_desde = now())::text || '|' || (c.codigo_club = :'r'::jsonb ->> 'codigo_club')::text
        from retail.clientas c where c.documento_numero = '${DNI.nuevo}';
      select w.correo || '|' || (w.usuario_web_id = '${r20.d.usuario}')::text || '|' || w.textos_aceptados || '|' ||
             (w.clienta_id = (select id from retail.clientas where documento_numero = '${DNI.nuevo}'))::text
        from retail.cuentas_web w where w.usuario_web_id = '${r20.d.usuario}';
      rollback;`),
    "false|false|Lucía|true\n" +
      "Lucía Fernanda Pérez Salas|987654321|14/10/1995|lucia.perez@ejemplo.com|web|true|true|true|true|true\n" +
      "lucia.perez@ejemplo.com|true|borrador-2026-10-14|true",
  );
  esperarValor(
    "…y la actividad «registro_web», sin persona y sin el DNI, el nombre, el celular ni el correo",
    correr(`${PREPARAR}
      ${callado(registrar().sql)}
      select a.modulo || '|' || a.accion || '|' || (a.persona_id is null)::text || '|' || (a.registro_id = c.id::text)::text || '|' ||
             (a::text !~* '(${DNI.nuevo}|lucía|pérez|987654321|@ejemplo)')::text || '|' || (a.detalle ->> 'nueva') || '|' || (a.detalle ->> 'textos')
        from retail.actividad a join retail.clientas c on c.documento_numero = '${DNI.nuevo}'
       where a.accion = 'registro_web' and a.registro_id = c.id::text;
      rollback;`),
    "clientas|registro_web|true|true|true|true|borrador-2026-10-14",
  );
  esperarValor(
    "ficha de caja (sin club): se une a ella; el nombre del padrón reemplaza, el celular y el cumpleaños que tenía NO se pisan, el correo vacío se completa; queda socia y su origen sigue «caja»",
    correr(`${PREPARAR}
      select (${registrar({ dni: DNI.caja, nombre: "Ana María Prueba Caja", celular: "912345678", dia: 20, mes: 1, anio: 1990 }).sql}) as r \\gset
      select (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'nombre_corto');
      select c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '/' || coalesce(c.cumple_anio::text, '-') || '|' ||
             (c.correo like 'zz.%')::text || '|' || c.registro_origen || '|' || (c.club_desde = now())::text || '|' || (c.codigo_club = :'r'::jsonb ->> 'codigo_club')::text
        from retail.clientas c where c.id = :'caja';
      rollback;`),
    "true|false|Ana\nAna María Prueba Caja|987000111|3/4/-|true|caja|true|true",
  );
  esperarValor(
    "socia que ya era del club, con el nombre escrito a mano: conserva su nombre, su fecha de socia y su código (era_del_club)",
    correr(`${PREPARAR}
      select (${registrar({ dni: DNI.socia, nombre: "Otro Nombre Cualquiera", padron: false }).sql}) as r \\gset
      select (:'r'::jsonb ->> 'era_del_club') || '|' || (:'r'::jsonb ->> 'se_unio_a_su_ficha') || '|' || (:'r'::jsonb ->> 'codigo_club' = :'codigo_socia')::text;
      select c.nombre || '|' || (c.club_desde < now() - interval '399 days')::text || '|' || (c.codigo_club = :'codigo_socia')::text || '|' || c.cumple_anio
        from retail.clientas c where c.id = :'socia';
      rollback;`),
    "true|true|true\nBea Socia Antigua|true|true|1990",
  );
  esperarValor(
    "ficha sin celular ni cumpleaños: se completan con lo de la web (año incluido)",
    correr(`${PREPARAR}
      ${callado(registrar({ dni: DNI.vacia, celular: "999888777", dia: 29, mes: 2, anio: null, nombre: "Dora", padron: false }).sql)}
      select c.nombre || '|' || c.telefono_whatsapp || '|' || c.cumple_dia || '/' || c.cumple_mes || '/' || coalesce(c.cumple_anio::text, '-')
        from retail.clientas c where c.id = :'vacia';
      rollback;`),
    "Dora Sin Datos|999888777|29/2/-",
  );
  const rCorreo = registrar({ correo: "zz.unico@ejemplo.com" });
  const rUsuario = registrar({ dni: DNI.caja });
  const casos = [
    ["el mismo correo (con otras mayúsculas)", registrar({ correo: "ZZ.Unico@Ejemplo.com", dni: DNI.otro }).sql, "P0001|cuenta_correo_repetido|correo"],
    ["el mismo DNI con otro correo", registrar({ dni: DNI.nuevo }).sql, "P0001|cuenta_dni_repetido|dni"],
    ["el mismo usuario dos veces", registrar({ usuario: rUsuario.d.usuario, dni: DNI.otro }).sql, "P0001|cuenta_ya_existe|"],
    ["una ficha archivada", registrar({ dni: DNI.archivada }).sql, "P0001|cuenta_archivada|dni"],
    ["un menor de 18 (por el año)", registrar({ dni: DNI.otro, anio: new Date().getFullYear() - 17 }).sql, "P0001|cuenta_menor|cumple"],
    ["el 29 de febrero de un año que no es bisiesto", registrar({ dni: DNI.otro, dia: 29, mes: 2, anio: 2001 }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["el 31 de abril", registrar({ dni: DNI.otro, dia: 31, mes: 4, anio: null }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["el mes 13", registrar({ dni: DNI.otro, mes: 13 }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["sin día", registrar({ dni: DNI.otro, dia: null }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["un año de antes de 1900", registrar({ dni: DNI.otro, anio: 1899 }).sql, "22023|cuenta_datos_invalidos|cumple"],
    ["un celular que no empieza en 9", registrar({ dni: DNI.otro, celular: "812345678" }).sql, "22023|cuenta_datos_invalidos|celular"],
    ["sin aceptar los términos", registrar({ dni: DNI.otro, acepta: false }).sql, "22023|cuenta_datos_invalidos|acepta"],
    ["un DNI nuevo sin nombre", registrar({ dni: DNI.otro, nombre: "   ", padron: false }).sql, "22023|cuenta_datos_invalidos|nombre"],
    ["«del padrón» sin nombre", registrar({ dni: DNI.caja, nombre: null, padron: true }).sql, "22023|cuenta_datos_invalidos|nombre"],
    ["un correo sin forma de correo", registrar({ dni: DNI.otro, correo: "ana@gmail" }).sql, "22023|cuenta_datos_invalidos|correo"],
    ["un DNI de 7 dígitos", registrar({ dni: "1234567" }).sql, "22023|cuenta_datos_invalidos|dni"],
    ["sin usuario", registrar({ dni: DNI.otro, usuario: null }).sql, "22023|cuenta_datos_invalidos|usuario"],
    ["una versión de textos rara", registrar({ dni: DNI.otro, textos: "Borrador 1" }).sql, "22023|cuenta_datos_invalidos|textos"],
  ];
  for (const [caso, sql, esperado] of casos) {
    esperarValor(
      `rechaza ${caso} (${esperado.split("|")[1]}) y no escribe nada`,
      correr(`${PREPARAR}
        ${callado(rCorreo.sql)}
        ${callado(rUsuario.sql)}
        select ${RECUENTO} as antes \\gset
        select pg_temp.intento($q$${sql}$q$) || '#' || ((${RECUENTO}) = :'antes')::text;
        rollback;`),
      `${esperado}#true`,
    );
  }
  // Hoy, en Lima, menos 18 años (`registrar` deja pasar una expresión SQL en el día, el mes y el año).
  const HOY_LIMA = "retail.fn_hoy_lima()";
  esperarValor(
    "quien cumple 18 hoy (en Lima) sí entra; quien los cumple mañana, no",
    correr(`${PREPARAR}
      select pg_temp.intento($q$${registrar({ dni: DNI.otro, dia: `extract(day from ${HOY_LIMA})::int`, mes: `extract(month from ${HOY_LIMA})::int`, anio: `(extract(year from ${HOY_LIMA}) - 18)::int` }).sql}$q$) || '#' ||
             pg_temp.intento($q$${registrar({ dni: DNI.nuevo, dia: `extract(day from ${HOY_LIMA} + 1)::int`, mes: `extract(month from ${HOY_LIMA} + 1)::int`, anio: `(extract(year from ${HOY_LIMA} + 1) - 18)::int` }).sql}$q$);
      rollback;`),
    "ok#P0001|cuenta_menor|cumple",
  );

  console.log("— Mi cuenta y los beneficios —");
  const r30 = registrar({ correo: "zz.mi.cuenta@ejemplo.com", nombre: "María Pérez Salas" });
  esperarValor(
    "tienda_mi_cuenta: nombre, nombre de pila, correo, código, socia desde hoy (Lima), cumpleaños y activa; null para un usuario sin cuenta",
    correr(`${PREPARAR}
      ${callado(r30.sql)}
      select (m ->> 'nombre') || '|' || (m ->> 'nombre_corto') || '|' || (m ->> 'correo') || '|' || ((m ->> 'codigo_club') ~ '^C-')::text || '|' ||
             ((m ->> 'club_desde') = :'hoy')::text || '|' || (m ->> 'cumple_dia') || '/' || (m ->> 'cumple_mes') || '|' || (m ->> 'activa')
        from (select retail.tienda_mi_cuenta('${r30.d.usuario}') as m) x;
      select coalesce(retail.tienda_mi_cuenta('${randomUUID()}')::text, 'null');
      rollback;`),
    "María Pérez Salas|María|zz.mi.cuenta@ejemplo.com|true|true|14/10|true\nnull",
  );
  esperarValor(
    "tienda_club_beneficios: el % del cumpleaños y la escala, sin los textos",
    correr(`${PREPARAR}
      select ((b ->> 'pct')::numeric > 0)::text || '|' || (jsonb_array_length(b -> 'escala') > 0)::text || '|' || (b ? 'textos')::text
        from (select retail.tienda_club_beneficios() as b) x;
      rollback;`),
    "true|true|false",
  );

  console.log("— Como tienda_web —");
  const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
  const r40 = registrar({ correo: "zz.como.tienda@ejemplo.com" });
  esperarValor(
    "como tienda_web: consulta, revisa, crea la cuenta y la lee",
    correr(`${PREPARAR}${COMO_TIENDA}
      select (retail.tienda_consultar_correo('zz.como.tienda@ejemplo.com', '${huella()}') ->> 'estado') || '|' ||
             (retail.tienda_consultar_documento('${DNI.nuevo}', '${huella()}', 'zz-d') ->> 'estado') || '|' ||
             (${revisar("zz.como.tienda@ejemplo.com", DNI.nuevo, "987654321", huella(), "zz-d")} ->> 'estado');
      select (${r40.sql}) ->> 'era_del_club';
      select retail.tienda_mi_cuenta('${r40.d.usuario}') ->> 'correo';
      rollback;`),
    "libre|libre|ok\nfalse\nzz.como.tienda@ejemplo.com",
  );
  for (const tabla of ["cuentas_web", "club_intentos_registro", "clientas"]) {
    const r = correr(`${PREPARAR}${COMO_TIENDA}select count(*) from retail.${tabla};\nrollback;`);
    esperar(`como tienda_web, leer retail.${tabla} se niega`, !r.ok && /permission denied/.test(r.mensaje), r.ok ? `leyó: ${r.salida}` : r.mensaje);
  }
  const ayudante = correr(`${PREPARAR}${COMO_TIENDA}select retail.fn_cuenta_web_correo('a@b.co');\nrollback;`);
  esperar("como tienda_web, el ayudante del correo se niega", !ayudante.ok && /permission denied/.test(ayudante.mensaje), ayudante.ok ? `respondió: ${ayudante.salida}` : ayudante.mensaje);

  console.log("— Las migraciones —");
  const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
  esperarValor(
    "las dos partes se pueden volver a correr (dos veces seguidas, como un segundo pegado)",
    correr(`begin;\n${sql}\n${sql}\nselect (retail.tienda_club_beneficios() ? 'pct')::text;\nrollback;`),
    "true",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

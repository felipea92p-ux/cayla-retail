#!/usr/bin/env node
/**
 * Recomendaciones de la tienda online (ADR-0408, Felipe 2026-10-15) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015134000_recomendaciones_web_tienda.sql` (PARTE 1, la tienda) y `20261015135000_recomendaciones_web_erp.sql`
 * (PARTE 2, el módulo «Recomendaciones» del ERP):
 *   E. Estructura y puerta: `recomendaciones_web` con RLS, sin políticas y sin permisos para nadie (ni `tienda_web`); las dos `tienda_*`
 *      son security definer, con su search_path y solo de `tienda_web`; las piezas internas no las ejecuta nadie de la API; las cuatro
 *      del ERP son de `authenticated`, nunca de anon ni de la tienda; el módulo nace en «Clientes», delegable y SIN rol.
 *   T. La tienda escribe: el texto se guarda limpio (de 10 a 1000 letras); vacío, corto, largo o lleno de espacios no entra; sobre una
 *      tienda de la web o CAYLA en general (el Taller, una tienda escondida o un id cualquiera no); sin cuenta o con la cuenta cerrada
 *      no escribe; la MISMA marca devuelve la misma recomendación sin contarla otra vez (dos toques, un reintento), y la misma marca en
 *      otra cuenta es otra; el tope de 3 por día de Lima (las de ayer no cuentan).
 *   L. La tienda lee: cada cuenta ve solo las suyas, la más nueva primero, con su estado para el cliente (recibida, leída, respondida
 *      con la respuesta; archivada se ve «leída»), el nombre web de la tienda, el tope y cuántas lleva hoy.
 *   R. El ERP: sin el módulo, las cuatro funciones dicen 42501 `recomendaciones_sin_modulo` y no cambia nada; el líder y quien tiene el
 *      módulo pasan; la lista trae el nombre del cliente, su ficha y su tienda, y si quien mira ve las fichas; marcar, responder y
 *      archivar firman con el responsable, son idempotentes (dos toques, dos personas), responder limpia el texto, rechaza vacío y
 *      largo, deja leída y no pisa otra respuesta; archivar va y viene, deja leída y no borra; cada acción anota UNA línea en la
 *      Actividad sin el nombre ni el texto del cliente.
 *   C. Los candados de la fila (disparador): la ficha es la de su cuenta, una cuenta cerrada no escribe, nace sin leer, y no se
 *      cambian quién, sobre qué, cuándo, el texto, la respuesta ni cuándo se leyó o respondió.
 *   A. Anonimizar (la conservación del Club y «lo pidió», `archivar_clienta` con anonimizar): las recomendaciones SE QUEDAN, sin su
 *      nombre: el ERP ya no la nombra ni da su ficha, ninguna columna de la fila guarda su nombre, DNI, celular ni correo (cada fila
 *      entera como texto), no se responde, la de otra persona no cambia, y un texto que queda corto no frena la anonimización.
 *   M. Mutantes: la puerta, el tope, la marca, el candado del módulo, la anonimización (el disparador y la lista), «solo lo suyo» y «sin
 *      nombre no se responde», rotos a propósito dentro de la transacción: la prueba lo nota. Si un mutante pasara, la prueba de arriba
 *      no estaría mirando nada.
 *   P. Las dos partes se pueden pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: muestra Trujillo y Lima en la web («ZZ …»), crea sus fichas (DNI 0995xxxx) y sus
 * cuentas web, y deja que una persona firme a su nombre (`exige_responsable = false`). Nada queda en el Postgres local que comparten
 * los worktrees. Para actuar como `tienda_web`, quien corre la prueba se da ese rol dentro de la transacción (se revierte). Lo que NO se
 * prueba aquí: dos pestañas a la vez en dos conexiones (los datos de la prueba no se commitean y otra conexión no los ve); lo cubren el
 * `for update` de la cuenta y el índice único de la marca, que la base hace cumplir sola (y /chaos lo atacó en local).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete las dos partes dentro de cada transacción (que se revierte). Sin la variable, prueba
 * lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed (Felipe líder; Micaela integrante, cuyo rol no tiene «Recomendaciones» ni «Clientes»… salvo lo que el rol
 * integrante tenga en esa base: la prueba fija Clientes encendido para ver `ve_fichas`; Tienda Trujillo, Tienda Lima y el Taller), las
 * cuentas de la tienda (20261014224000 y 20261015055000), las tiendas de la web (20261014231000) y `fn_tienda_sedes_web` (20261015012000).
 *
 * USO
 *   pnpm pruebas:recomendaciones-web    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:recomendaciones-web -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261015134000_recomendaciones_web_tienda.sql",
  "supabase/migrations/20261015135000_recomendaciones_web_erp.sql",
];
const ANTES = process.env.APLICAR_ANTES ?? "";
const APLICAR_ANTES = ANTES ? (ANTES === "1" ? MIGRACIONES : ANTES.split(",")).map((m) => readFileSync(m.trim(), "utf8")).join("\n") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo

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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 10).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

// ---- Los datos de esta corrida ----
const CORRIDA = Date.now().toString(36);
const U = { ana: randomUUID(), bea: randomUUID(), ceci: randomUUID(), nadie: randomUUID() };
const CORREO = (quien) => `zz.${quien}.rec.${CORRIDA}@ejemplo.com`;
const DNI = { ana: "09950001", bea: "09950002", ceci: "09950003" };
const CEL = { ana: "987000951", bea: "987000952", ceci: "987000953" };
const LARGO = (n) => `'${"a".repeat(n)}'`;

const AYUDAS = `
-- Corre una sentencia y devuelve 'ok' o '<sqlstate>|<hint>' si el hint es uno de los nuestros (un identificador como
-- 'recomendacion_no_existe'), o '<sqlstate>|' si no. El Postgres de Supabase (el del CI) le agrega a un «permission denied» la pista
-- «Grant the required privileges…», que uno sin parches no pone: esa no cuenta. Lo que hizo se queda si salió bien.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else '' end;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated, anon, tienda_web;
-- La versión viva de una función con un pedazo cambiado (un MUTANTE). Si el pedazo no está, falla: el mutante no sería tal.
create function pg_temp.mutar(p_firma text, p_de text, p_a text) returns void language plpgsql as $f$
declare v text := pg_get_functiondef(p_firma::regprocedure);
begin
  if position(p_de in v) = 0 then
    raise exception 'mutante vacío: % no tiene «%»', p_firma, p_de;
  end if;
  execute replace(v, p_de, p_a);
end $f$;
`;

// Cada escenario parte con Trujillo y Lima en la web (el Taller no), tres fichas con su cuenta web —Ana y Bea abiertas, Ceci con la
// ficha archivada— y una persona que firma a su nombre.
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local search_path = retail, public, extensions;
do $$ begin
  if exists (select 1 from retail.clientas where documento_numero like '0995%') then
    raise exception 'Ambiente sucio: ya hay fichas con DNI 0995xxxx en esta base.';
  end if;
end $$;
${AYUDAS}
update retail.configuracion_empresa set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by id limit 1 \\gset
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela_p from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Integrante (Micaela) sin «Recomendaciones» y con «Clientes», sea como sea que esté su rol en esta base.
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'recomendaciones';
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'clientas') on conflict do nothing;
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, correo)
values ('dni', '${DNI.ana}', 'Anabella Prueba Recomienda', '${CEL.ana}', '${CORREO("ana")}') returning id as ana_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '${DNI.bea}', 'Beatriz Prueba Recomienda', '${CEL.bea}') returning id as bea_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
values ('dni', '${DNI.ceci}', 'Cecilia Prueba Archivada', now(), 'prueba de recomendaciones') returning id as ceci_c \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values
  ('${U.ana}', :'ana_c', '${CORREO("ana")}', 'borrador-2026-10-14'),
  ('${U.bea}', :'bea_c', '${CORREO("bea")}', 'borrador-2026-10-14'),
  ('${U.ceci}', :'ceci_c', '${CORREO("ceci")}', 'borrador-2026-10-14');
select id as ana_w from retail.cuentas_web where usuario_web_id = '${U.ana}' \\gset
select id as bea_w from retail.cuentas_web where usuario_web_id = '${U.bea}' \\gset
`;
const COMO_TIENDA = `reset role;\ngrant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
const COMO_POSTGRES = `reset role;\n`;
/** Como una cuenta del ERP (claims reales y el rol authenticated, para que fn_exigir_modulo pregunte de verdad). */
const COMO = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const FIN = "rollback;\n";
const escenario = (cuerpo) => correr(`${PREPARAR}${cuerpo}\n${FIN}`);

/** `tienda_recomendar` de esa cuenta (texto como SQL ya citado), con una marca fija o nueva. */
const recomienda = (u, texto, sobre = "null", marca = `'${randomUUID()}'`) =>
  `retail.tienda_recomendar('${u}', ${texto}, ${sobre}, ${marca})`;
/** Guarda en :<nombre> el id de una recomendación nueva de Ana (como la tienda) y vuelve a postgres. */
const ANA_RECOMIENDA = (nombre = "rid", texto = "'Pongan más tallas grandes en Trujillo, por favor'") =>
  `${COMO_TIENDA}select ${recomienda(U.ana, texto, ":'tru'")} ->> 'id' as ${nombre} \\gset\n${COMO_POSTGRES}`;
const LISTA = `retail.fn_recomendaciones() -> 'recomendaciones'`;
/** Una recomendación de la lista del ERP, por id (la de :'rid'). */
const DE_LA_LISTA = (campo) => `(select x ${campo} from jsonb_array_elements(${LISTA}) x where x ->> 'id' = :'rid')`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select (to_regclass('retail.recomendaciones_web') is not null and to_regprocedure('retail.fn_recomendaciones()') is not null)::text;");
    if (hay.salida !== "true") {
      console.error(`Faltan las recomendaciones: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=1`);
      process.exit(2);
    }
  }

  // =================================================================================================================
  console.log("— E. Estructura y puerta —");
  const ESTRUCTURA = `
    select (select relrowsecurity from pg_class where oid = 'retail.recomendaciones_web'::regclass)::text
      || '|' || (select count(*) from pg_policy where polrelid = 'retail.recomendaciones_web'::regclass)
      || '|' || (select count(*) from (values ('public'), ('anon'), ('authenticated'), ('tienda_web')) r(rol)
                  where has_table_privilege(r.rol, 'retail.recomendaciones_web', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'));
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), 'todas bien') from pg_proc p
     where p.pronamespace = 'retail'::regnamespace and p.proname in ('tienda_recomendar', 'tienda_mis_recomendaciones')
       and not (p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search\\_path=%')
                and has_function_privilege('tienda_web', p.oid, 'EXECUTE')
                and not has_function_privilege('public', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
                and not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), 'todas bien') from pg_proc p
     where p.pronamespace = 'retail'::regnamespace
       and p.proname in ('fn_recomendaciones', 'marcar_recomendacion_leida', 'responder_recomendacion', 'archivar_recomendacion')
       and not (p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                and not has_function_privilege('anon', p.oid, 'EXECUTE') and not has_function_privilege('tienda_web', p.oid, 'EXECUTE'));
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), 'ninguna') from pg_proc p
     where p.pronamespace = 'retail'::regnamespace
       and p.proname in ('fn_recomendaciones_tope', 'fn_recomendacion_texto', 'fn_recomendacion_sin_datos', 'fn_recomendacion_web_reglas',
                         'fn_recomendaciones_al_anonimizar', 'fn_recomendacion_anotar')
       and (has_function_privilege('public', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
            or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('tienda_web', p.oid, 'EXECUTE'));
    select m.grupo || '|' || m.orden || '|' || m.delegable || '|' || m.solo_lider || '|'
           || (select count(*) from retail.rol_modulos rm where rm.modulo = m.clave)
      from retail.modulos m where m.clave = 'recomendaciones';`;
  esperarValor(
    "la tabla tiene RLS, sin políticas y sin permisos para nadie; las dos tienda_* son de tienda_web; las cuatro del ERP de authenticated; las internas de nadie; el módulo nace en Clientes, delegable y SIN rol",
    correr(`begin;\n${APLICAR_ANTES}\n${ESTRUCTURA}\nrollback;`),
    "true|0|0\ntodas bien\ntodas bien\nninguna\nClientes|78|true|false|0",
  );
  esperarValor(
    "las cuatro del ERP piden el módulo antes que nada: es lo primero que corre (antes del responsable y de leer la recomendación)",
    correr(`begin;\n${APLICAR_ANTES}
      select coalesce(string_agg(p.proname, ',' order by p.proname), 'ninguna') from pg_proc p
       where p.pronamespace = 'retail'::regnamespace
         and p.proname in ('fn_recomendaciones', 'marcar_recomendacion_leida', 'responder_recomendacion', 'archivar_recomendacion')
         and p.prosrc !~ '^\\s*(declare.*?)?begin\\s+perform retail\\.fn_exigir_modulo\\(''recomendaciones''\\);';
      rollback;`),
    "ninguna",
  );
  esperarValor(
    "como tienda_web, leer o escribir la tabla se niega; como authenticated también",
    escenario(`${COMO_TIENDA}select pg_temp.intento('select count(*) from retail.recomendaciones_web');
      select pg_temp.intento('delete from retail.recomendaciones_web');
      ${COMO(FELIPE)}select pg_temp.intento('select count(*) from retail.recomendaciones_web');`),
    "42501|\n42501|\n42501|",
  );

  // =================================================================================================================
  console.log("— T. La tienda escribe —");
  esperarValor(
    "se guarda limpia (sin invisibles, espacios seguidos ni líneas en blanco de más), con su ficha, su cuenta y su tienda",
    escenario(`${COMO_TIENDA}
      select ${recomienda(U.ana, `E'  Pongan\\u200B   más   tallas\\r\\n\\r\\n\\r\\ngrandes  '`, ":'tru'")} ->> 'id' as rid \\gset
      ${COMO_POSTGRES}
      select replace(texto, E'\\n', '⏎') || '|' || (clienta_id = :'ana_c') || '|' || (cuenta_web_id = :'ana_w') || '|' || (ubicacion_id = :'tru')
        from retail.recomendaciones_web where id = :'rid';`),
    "Pongan más tallas⏎⏎grandes|true|true|true",
  );
  esperarValor(
    "CAYLA en general (sin tienda) también: la tienda queda vacía",
    escenario(`${COMO_TIENDA}select ${recomienda(U.ana, "'Que abran una tienda en Piura'")} ->> 'id' as rid \\gset
      ${COMO_POSTGRES}select (ubicacion_id is null)::text from retail.recomendaciones_web where id = :'rid';`),
    "true",
  );
  esperarValor(
    "vacío, solo espacios, corto (9 letras), largo (1001) o null no entran; 10 y 1000 sí",
    escenario(`${COMO_TIENDA}
      select ${recomienda(U.ana, "''")}::text;
      select ${recomienda(U.ana, `E'   \\n\\t  '`)}::text;
      select ${recomienda(U.ana, "'123456789'")}::text;
      select ${recomienda(U.ana, LARGO(1001))}::text;
      select ${recomienda(U.ana, "null")}::text;
      select ${recomienda(U.ana, "'1234567890'")} ->> 'estado';
      select ${recomienda(U.ana, LARGO(1000))} ->> 'estado';`),
    [
      '{"campo": "texto", "estado": "invalido", "minimo": 10, "detalle": "corto"}',
      '{"campo": "texto", "estado": "invalido", "minimo": 10, "detalle": "corto"}',
      '{"campo": "texto", "estado": "invalido", "minimo": 10, "detalle": "corto"}',
      '{"campo": "texto", "estado": "invalido", "maximo": 1000, "detalle": "largo"}',
      '{"campo": "texto", "estado": "invalido", "minimo": 10, "detalle": "corto"}',
      "enviada",
      "enviada",
    ].join("\n"),
  );
  esperarValor(
    "sobre el Taller, una tienda escondida de la web o un id cualquiera no entra (y no escribe nada)",
    escenario(`${COMO_POSTGRES}update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      ${COMO_TIENDA}
      select ${recomienda(U.ana, "'Sobre el taller de costura'", ":'taller'")} ->> 'campo';
      select ${recomienda(U.ana, "'Sobre una tienda escondida'", ":'lim'")} ->> 'campo';
      select ${recomienda(U.ana, "'Sobre una tienda que no existe'", `'${randomUUID()}'`)} ->> 'campo';
      ${COMO_POSTGRES}select count(*) from retail.recomendaciones_web where cuenta_web_id = :'ana_w';`),
    "sobre\nsobre\nsobre\n0",
  );
  esperarValor(
    "sin cuenta, con un usuario cualquiera o sin marca no escribe; la ficha ARCHIVADA (no anonimizada) sí recomienda",
    escenario(`${COMO_TIENDA}
      select ${recomienda("00000000-0000-4000-8000-000000000000", "'Alguien que no tiene cuenta'")} ->> 'estado';
      select retail.tienda_recomendar(null, 'Sin usuario ninguno aquí', null, gen_random_uuid()) ->> 'estado';
      select ${recomienda(U.nadie, "'Un usuario que no existe'")} ->> 'estado';
      select ${recomienda(U.ana, "'Sin marca del formulario'", "null", "null")} ->> 'campo';
      select ${recomienda(U.ceci, "'La ficha archivada igual escribe'")} ->> 'estado';`),
    "sin_cuenta\nsin_cuenta\nsin_cuenta\nmarca\nenviada",
  );
  esperarValor(
    "la cuenta CERRADA (su ficha se anonimizó) ya no escribe",
    escenario(`select retail.fn_clienta_anonimizar(:'ana_c', null, true) as _n \\gset
      ${COMO_TIENDA}select ${recomienda(U.ana, "'Después de cerrar la cuenta'")} ->> 'estado';`),
    "sin_cuenta",
  );
  const MARCA = randomUUID();
  esperarValor(
    "la MISMA marca devuelve la misma recomendación (repetida), sin contarla otra vez ni cambiar el texto; en otra cuenta es otra",
    escenario(`${COMO_TIENDA}
      select ${recomienda(U.ana, "'Primera vez que la mando'", "null", `'${MARCA}'`)} as uno \\gset
      select ${recomienda(U.ana, "'Primera vez que la mando'", "null", `'${MARCA}'`)} as dos \\gset
      select ${recomienda(U.ana, "'Otro texto con la misma marca'", "null", `'${MARCA}'`)} as tres \\gset
      select ${recomienda(U.bea, "'Bea con la misma marca que Ana'", "null", `'${MARCA}'`)} as cuatro \\gset
      ${COMO_POSTGRES}
      select (:'uno'::jsonb ->> 'id' = :'dos'::jsonb ->> 'id') || '|' || (:'dos'::jsonb ->> 'repetida') || '|' || (:'dos'::jsonb ->> 'quedan_hoy')
          || '|' || (:'uno'::jsonb ->> 'id' = :'tres'::jsonb ->> 'id') || '|' || (:'cuatro'::jsonb ->> 'id' <> :'uno'::jsonb ->> 'id');
      select count(*) || '|' || min(texto) from retail.recomendaciones_web where cuenta_web_id = :'ana_w';`),
    "true|true|2|true|true\n1|Primera vez que la mando",
  );
  esperarValor(
    "el tope: 3 por día de Lima por cuenta (la cuarta dice «limite» y no escribe); las de ayer no cuentan; otra cuenta tiene las suyas",
    escenario(`${COMO_POSTGRES}
      insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, texto, marca, creada_en)
      select :'ana_w', :'ana_c', 'Una de ayer ' || g, gen_random_uuid(), (retail.fn_hoy_lima()::timestamp - interval '2 hours') at time zone 'America/Lima'
        from generate_series(1, 3) g;
      ${COMO_TIENDA}
      select ${recomienda(U.ana, "'Hoy la primera del día'")} ->> 'quedan_hoy';
      select ${recomienda(U.ana, "'Hoy la segunda del día'")} ->> 'quedan_hoy';
      select ${recomienda(U.ana, "'Hoy la tercera del día'")} ->> 'quedan_hoy';
      select ${recomienda(U.ana, "'Hoy la cuarta del día'")}::text;
      select ${recomienda(U.bea, "'Bea todavía puede hoy'")} ->> 'estado';
      ${COMO_POSTGRES}select count(*) from retail.recomendaciones_web where cuenta_web_id = :'ana_w';`),
    '2\n1\n0\n{"tope": 3, "estado": "limite"}\nenviada\n6',
  );

  // =================================================================================================================
  console.log("— L. La tienda lee —");
  esperarValor(
    "cada cuenta ve solo las suyas, la más nueva primero, con su estado para el cliente, la respuesta y el nombre web de la tienda",
    escenario(`${COMO_POSTGRES}
      insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, ubicacion_id, texto, marca, creada_en) values
        (:'ana_w', :'ana_c', :'tru', 'La más vieja, sobre Trujillo', gen_random_uuid(), now() - interval '3 days'),
        (:'ana_w', :'ana_c', null, 'La del medio, general', gen_random_uuid(), now() - interval '2 days'),
        (:'ana_w', :'ana_c', :'lim', 'La más nueva, sobre Lima', gen_random_uuid(), now() - interval '1 day'),
        (:'ana_w', :'ana_c', null, 'Una archivada sin respuesta', gen_random_uuid(), now() - interval '4 days'),
        (:'bea_w', :'bea_c', null, 'La de Bea no la ve Ana', gen_random_uuid(), now());
      update retail.recomendaciones_web set leida_en = now(), leida_por = :'felipe_p' where texto = 'La del medio, general';
      update retail.recomendaciones_web set leida_en = now(), respuesta = 'Gracias, ya lo vemos', respondida_en = now()
       where texto = 'La más vieja, sobre Trujillo';
      update retail.recomendaciones_web set leida_en = now(), archivada_en = now() where texto = 'Una archivada sin respuesta';
      ${COMO_TIENDA}
      select string_agg(concat_ws('|', x ->> 'texto', x ->> 'estado', coalesce(x -> 'sobre' ->> 'nombre', 'general'), coalesce(x ->> 'respuesta', '-')), ' # '
                        order by ord)
        from jsonb_array_elements(retail.tienda_mis_recomendaciones('${U.ana}') -> 'recomendaciones') with ordinality as t(x, ord);
      select (retail.tienda_mis_recomendaciones('${U.ana}') - 'recomendaciones')::text;
      select coalesce(retail.tienda_mis_recomendaciones('${U.nadie}')::text, 'null');`),
    [
      "La más nueva, sobre Lima|recibida|ZZ Lima|- # La del medio, general|leida|general|- # La más vieja, sobre Trujillo|respondida|ZZ Trujillo|Gracias, ya lo vemos # Una archivada sin respuesta|leida|general|-",
      '{"hoy": 0, "tope": 3}',
      "null",
    ].join("\n"),
  );

  // =================================================================================================================
  console.log("— R. El ERP —");
  // Las cuatro funciones del ERP sobre :'rid', cada una por `pg_temp.intento` (psql no reemplaza :'rid' dentro de $q$: se pega afuera).
  const conId = (antes, despues = ")") => `select pg_temp.intento($q$${antes}('$q$ || :'rid' || $q$'${despues}$q$);`;
  const LAS_CUATRO = [
    "select pg_temp.intento($q$select retail.fn_recomendaciones()$q$);",
    conId("select retail.marcar_recomendacion_leida"),
    conId("select retail.responder_recomendacion", ", 'Gracias por escribirnos')"),
    conId("select retail.archivar_recomendacion", ", true)"),
  ].join("\n");
  esperarValor(
    "sin el módulo (Micaela, integrante), las cuatro dicen 42501 recomendaciones_sin_modulo y no cambia nada",
    escenario(`${ANA_RECOMIENDA()}${COMO(MICAELA)}
      ${LAS_CUATRO}
      ${COMO_POSTGRES}select (leida_en is null and respuesta is null and archivada_en is null)::text from retail.recomendaciones_web where id = :'rid';`),
    "42501|recomendaciones_sin_modulo\n42501|recomendaciones_sin_modulo\n42501|recomendaciones_sin_modulo\n42501|recomendaciones_sin_modulo\ntrue",
  );
  esperarValor(
    "con el módulo en su rol, Micaela pasa en las cuatro; sin «Clientes» no ve fichas (ve_fichas falso) pero sí el nombre",
    escenario(`${ANA_RECOMIENDA()}
      insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'recomendaciones');
      delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
      ${COMO(MICAELA)}
      ${LAS_CUATRO}
      select (retail.fn_recomendaciones() ->> 've_fichas') || '|' || ${DE_LA_LISTA("-> 'cliente' ->> 'nombre'")};`),
    "ok\nok\nok\nok\nfalse|Anabella Prueba Recomienda",
  );
  esperarValor(
    "el líder ve la lista: el nombre del cliente, su ficha, su tienda, el texto, y que ve las fichas",
    escenario(`${ANA_RECOMIENDA()}${COMO(FELIPE)}
      select (retail.fn_recomendaciones() ->> 've_fichas') || '|' || ${DE_LA_LISTA("-> 'cliente' ->> 'nombre'")}
          || '|' || (${DE_LA_LISTA("-> 'cliente' ->> 'ficha_id'")} = :'ana_c') || '|' || ${DE_LA_LISTA("-> 'tienda' ->> 'nombre'")}
          || '|' || ${DE_LA_LISTA("->> 'texto'")};
      select ((retail.fn_recomendaciones() -> 'tiendas') @> jsonb_build_array(jsonb_build_object('id', :'tru', 'nombre', 'Tienda Trujillo')))::text;`),
    "true|Anabella Prueba Recomienda|true|Tienda Trujillo|Pongan más tallas grandes en Trujillo, por favor\ntrue",
  );
  esperarValor(
    "marcar como leída firma con quien lo hace y es idempotente (la segunda vez «ya_estaba» y no cambia quién ni cuándo)",
    escenario(`${ANA_RECOMIENDA()}${COMO(FELIPE)}
      select retail.marcar_recomendacion_leida(:'rid') ->> 'estado';
      ${COMO_POSTGRES}select leida_en as l1 from retail.recomendaciones_web where id = :'rid' \\gset
      ${COMO(FELIPE)}select retail.marcar_recomendacion_leida(:'rid') ->> 'estado';
      ${COMO_POSTGRES}select (leida_por = :'felipe_p') || '|' || (leida_en = :'l1') from retail.recomendaciones_web where id = :'rid';`),
    "leida\nya_estaba\ntrue|true",
  );
  esperarValor(
    "responder: vacía o de una letra no entra, de 401 tampoco; limpia el texto, deja leída con quien respondió y la misma otra vez es «ya_estaba»; otra distinta no pisa la primera",
    escenario(`${ANA_RECOMIENDA()}${COMO(FELIPE)}
      select pg_temp.intento($q$select retail.responder_recomendacion('$q$ || :'rid' || $q$', '   ')$q$);
      select pg_temp.intento($q$select retail.responder_recomendacion('$q$ || :'rid' || $q$', 'a')$q$);
      select pg_temp.intento($q$select retail.responder_recomendacion('$q$ || :'rid' || $q$', '$q$ || repeat('b', 401) || $q$')$q$);
      select retail.responder_recomendacion(:'rid', E'  Gracias,   ya pedimos\\u200B tallas grandes.  ') ->> 'estado';
      select retail.responder_recomendacion(:'rid', 'Gracias, ya pedimos tallas grandes.') ->> 'estado';
      select pg_temp.intento($q$select retail.responder_recomendacion('$q$ || :'rid' || $q$', 'Otra respuesta distinta')$q$);
      ${COMO_POSTGRES}select respuesta || '|' || (respondida_por = :'felipe_p') || '|' || (leida_por = :'felipe_p') || '|' || (leida_en is not null)
        from retail.recomendaciones_web where id = :'rid';`),
    "P0001|recomendacion_respuesta_vacia\nP0001|recomendacion_respuesta_vacia\nP0001|recomendacion_respuesta_larga\nrespondida\nya_estaba\nP0001|recomendacion_ya_respondida\nGracias, ya pedimos tallas grandes.|true|true|true",
  );
  esperarValor(
    "responder una ya leída por otra persona no cambia quién la leyó",
    escenario(`${ANA_RECOMIENDA()}${COMO_POSTGRES}update retail.recomendaciones_web set leida_en = now(), leida_por = :'micaela_p' where id = :'rid';
      ${COMO(FELIPE)}select retail.responder_recomendacion(:'rid', 'Gracias por escribirnos') ->> 'estado';
      ${COMO_POSTGRES}select (leida_por = :'micaela_p') || '|' || (respondida_por = :'felipe_p') from retail.recomendaciones_web where id = :'rid';`),
    "respondida\ntrue|true",
  );
  esperarValor(
    "archivar la deja leída y no la borra; dos veces es «ya_estaba»; sacarla del archivo la devuelve; la que no existe dice recomendacion_no_existe",
    escenario(`${ANA_RECOMIENDA()}${COMO(FELIPE)}
      select retail.archivar_recomendacion(:'rid', true) ->> 'estado';
      select retail.archivar_recomendacion(:'rid', true) ->> 'estado';
      ${COMO_POSTGRES}select (archivada_por = :'felipe_p') || '|' || (leida_por = :'felipe_p') from retail.recomendaciones_web where id = :'rid';
      ${COMO(FELIPE)}select retail.archivar_recomendacion(:'rid', false) ->> 'estado';
      select retail.archivar_recomendacion(:'rid', false) ->> 'estado';
      select pg_temp.intento($q$select retail.archivar_recomendacion(gen_random_uuid(), true)$q$);
      select pg_temp.intento($q$select retail.marcar_recomendacion_leida(gen_random_uuid())$q$);
      select pg_temp.intento($q$select retail.archivar_recomendacion('$q$ || :'rid' || $q$', null)$q$);
      ${COMO_POSTGRES}select count(*) || '|' || bool_and(archivada_en is null and leida_en is not null) from retail.recomendaciones_web where id = :'rid';`),
    "archivada\nya_estaba\ntrue|true\nen_bandeja\nya_estaba\nP0001|recomendacion_no_existe\nP0001|recomendacion_no_existe\nP0001|recomendacion_datos_invalidos\n1|true",
  );
  esperarValor(
    "cada acción anota UNA línea en la Actividad del módulo, sin el nombre del cliente ni su texto; lo que ya estaba no anota otra",
    escenario(`${ANA_RECOMIENDA()}${COMO(FELIPE)}
      select retail.marcar_recomendacion_leida(:'rid') ->> 'estado' as _1 \\gset
      select retail.marcar_recomendacion_leida(:'rid') ->> 'estado' as _2 \\gset
      select retail.responder_recomendacion(:'rid', 'Gracias Anabella') ->> 'estado' as _3 \\gset
      select retail.archivar_recomendacion(:'rid', true) ->> 'estado' as _4 \\gset
      select retail.archivar_recomendacion(:'rid', false) ->> 'estado' as _5 \\gset
      ${COMO_POSTGRES}
      select string_agg(a.accion, ',' order by a.accion) || '|' || bool_and(a.persona_id = :'felipe_p')
          || '|' || bool_and(a.tabla = 'recomendaciones_web')
          || '|' || bool_and(a::text !~* '(anabella|tallas grandes|${DNI.ana}|${CEL.ana})')
        from retail.actividad a where a.modulo = 'recomendaciones' and a.registro_id = :'rid';`),
    // Todo pasa en la misma transacción (la misma hora): se ordenan por acción.
    "archivar,leer,responder,sacar_del_archivo|true|true|true",
  );

  // =================================================================================================================
  console.log("— C. Los candados de la fila —");
  esperarValor(
    "la ficha tiene que ser la de su cuenta; una cuenta cerrada no escribe; nace sin leer, sin respuesta y sin archivar",
    escenario(`${COMO_POSTGRES}
      select pg_temp.intento($q$insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, texto, marca) values ('$q$ || :'ana_w' || $q$', '$q$ || :'bea_c' || $q$', 'La ficha de otra cuenta', gen_random_uuid())$q$);
      select pg_temp.intento($q$insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, texto, marca, leida_en) values ('$q$ || :'ana_w' || $q$', '$q$ || :'ana_c' || $q$', 'Nace ya leída a mano', gen_random_uuid(), now())$q$);
      select retail.fn_clienta_anonimizar(:'bea_c', null, true) as _n \\gset
      select pg_temp.intento($q$insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, texto, marca) values ('$q$ || :'bea_w' || $q$', '$q$ || :'bea_c' || $q$', 'De una cuenta cerrada', gen_random_uuid())$q$);`),
    "23514|recomendacion_ficha_de_otra_cuenta\n23514|recomendacion_nace_nueva\n23514|recomendacion_cuenta_cerrada",
  );
  esperarValor(
    "no se cambian quién, sobre qué, cuándo ni el texto; leída y respondida se ponen una vez; una respondida está leída",
    escenario(`${ANA_RECOMIENDA()}${COMO_POSTGRES}
      select pg_temp.intento($q$update retail.recomendaciones_web set texto = 'Otro texto cambiado a mano' where id = '$q$ || :'rid' || $q$'$q$);
      select pg_temp.intento($q$update retail.recomendaciones_web set ubicacion_id = null where id = '$q$ || :'rid' || $q$'$q$);
      select pg_temp.intento($q$update retail.recomendaciones_web set creada_en = creada_en - interval '1 day' where id = '$q$ || :'rid' || $q$'$q$);
      select pg_temp.intento($q$update retail.recomendaciones_web set clienta_id = '$q$ || :'bea_c' || $q$' where id = '$q$ || :'rid' || $q$'$q$);
      select pg_temp.intento($q$update retail.recomendaciones_web set respuesta = 'Sin leerla', respondida_en = now() where id = '$q$ || :'rid' || $q$'$q$);
      update retail.recomendaciones_web set leida_en = now(), leida_por = :'felipe_p' where id = :'rid';
      select pg_temp.intento($q$update retail.recomendaciones_web set leida_por = '$q$ || :'micaela_p' || $q$' where id = '$q$ || :'rid' || $q$'$q$);
      update retail.recomendaciones_web set respuesta = 'Gracias de verdad', respondida_en = now(), respondida_por = :'felipe_p' where id = :'rid';
      select pg_temp.intento($q$update retail.recomendaciones_web set respuesta = 'Otra cosa' where id = '$q$ || :'rid' || $q$'$q$);
      select pg_temp.intento($q$update retail.recomendaciones_web set respondida_en = now() + interval '1 hour' where id = '$q$ || :'rid' || $q$'$q$);`),
    "23514|recomendacion_inmutable\n23514|recomendacion_inmutable\n23514|recomendacion_inmutable\n23514|recomendacion_inmutable\n23514|\n23514|recomendacion_inmutable\n23514|recomendacion_inmutable\n23514|recomendacion_inmutable",
  );

  // =================================================================================================================
  console.log("— A. Anonimizar: se quedan, sin su nombre —");
  const TEXTO_CON_DATOS = `'Soy Anabella Prueba, DNI ${DNI.ana}, cel 987 000 951, correo ${CORREO("ana")}. Pongan más tallas grandes.'`;
  const SIN_RASTRO = `(select count(*) from retail.recomendaciones_web r
      where r.clienta_id = :'ana_c' and r::text ~* '(anabella|prueba|recomienda|${DNI.ana}|987.?000.?951|${CORREO("ana").replaceAll(".", "\\.")})')`;
  for (const [como, anonimiza] of [
    ["la conservación del Club (fn_clienta_anonimizar, automática)", "select retail.fn_clienta_anonimizar(:'ana_c', null, true) as _n \\gset"],
    ["porque lo pidió (archivar_clienta con anonimizar, desde Clientes)", `${COMO(FELIPE)}select retail.archivar_clienta(:'ana_c', 'Lo pidió en tienda', true, null) as _n \\gset\n${COMO_POSTGRES}`],
  ]) {
    esperarValor(
      `por ${como}: la recomendación se queda (con lo que pidió), sin nombre, sin ficha en el ERP y sin su nombre, DNI, celular ni correo en NINGUNA columna; no se responde; la de Bea no cambia`,
      escenario(`${ANA_RECOMIENDA("rid", TEXTO_CON_DATOS)}
        ${COMO(FELIPE)}select retail.responder_recomendacion(:'rid', 'Gracias Anabella, ya las pedimos') ->> 'estado' as _r \\gset
        ${COMO_TIENDA}select ${recomienda(U.bea, "'Beatriz pide más colores'")} ->> 'id' as rbea \\gset
        ${COMO_POSTGRES}
        select ${SIN_RASTRO} as antes \\gset
        ${anonimiza}
        select count(*) || '|' || :'antes' || '>' || ${SIN_RASTRO} || '|' || bool_and(sin_nombre_en is not null)
            || '|' || bool_and(texto like '%Pongan más tallas grandes.%') || '|' || bool_and(respuesta like 'Gracias […], ya las pedimos')
          from retail.recomendaciones_web where clienta_id = :'ana_c';
        ${COMO(FELIPE)}
        select coalesce(${DE_LA_LISTA("->> 'cliente'")}, 'sin cliente') || '|' || (select count(*) from jsonb_array_elements(${LISTA}) x where x ->> 'id' = :'rid');
        select pg_temp.intento($q$select retail.responder_recomendacion('$q$ || :'rid' || $q$', 'Otra')$q$);
        select (select x -> 'cliente' ->> 'nombre' from jsonb_array_elements(${LISTA}) x where x ->> 'id' = :'rbea');
        ${COMO_TIENDA}select coalesce(retail.tienda_mis_recomendaciones('${U.ana}')::text, 'null');`),
      "1|1>0|true|true|true\nsin cliente|1\nP0001|recomendacion_sin_nombre\nBeatriz Prueba Recomienda\nnull",
    );
  }
  esperarValor(
    "un texto que solo tenía su nombre queda en «[…]» y la anonimización no se frena (el mínimo de 10 letras es de lo que escribe el cliente)",
    escenario(`${COMO_POSTGRES}
      insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, texto, marca) values (:'ana_w', :'ana_c', 'Anabella Anabella', gen_random_uuid());
      select retail.fn_clienta_anonimizar(:'ana_c', null, true) as _n \\gset
      select texto from retail.recomendaciones_web where clienta_id = :'ana_c';`),
    "[…] […]",
  );
  esperarValor(
    "anonimizar una ficha SIN recomendaciones sigue igual (el disparador no estorba)",
    escenario(`${COMO_POSTGRES}select retail.fn_clienta_anonimizar(:'bea_c', null, true) as _n \\gset
      select anonimizada::text from retail.clientas where id = :'bea_c';`),
    "true",
  );

  // =================================================================================================================
  console.log("— M. Mutantes: cada candado, roto a propósito, se nota —");
  esperar(
    "MUTANTE la puerta abierta: tienda_recomendar ejecutable por authenticated (la prueba E lo nota)",
    (() => {
      const r = correr(`begin;\n${APLICAR_ANTES}\ngrant execute on function retail.tienda_recomendar(uuid, text, uuid, uuid) to authenticated;\n${ESTRUCTURA}\nrollback;`);
      return r.ok && r.salida.split("\n")[1] !== "todas bien";
    })(),
    "la estructura siguió diciendo «todas bien»",
  );
  esperar(
    "MUTANTE la tabla abierta: authenticated puede leerla (la prueba E lo nota)",
    (() => {
      const r = correr(`begin;\n${APLICAR_ANTES}\ngrant select on retail.recomendaciones_web to authenticated;\n${ESTRUCTURA}\nrollback;`);
      return r.ok && !r.salida.startsWith("true|0|0");
    })(),
    "la estructura siguió diciendo «true|0|0»",
  );
  esperarValor(
    "MUTANTE sin tope: la cuarta del día entra (la prueba T lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_recomendar(uuid, text, uuid, uuid)', 'if v_hoy >= v_tope then', 'if v_hoy >= v_tope + 100 then');
      ${COMO_TIENDA}
      select ${recomienda(U.ana, "'La primera del día'")} ->> 'estado' as _1 \\gset
      select ${recomienda(U.ana, "'La segunda del día'")} ->> 'estado' as _2 \\gset
      select ${recomienda(U.ana, "'La tercera del día'")} ->> 'estado' as _3 \\gset
      select ${recomienda(U.ana, "'La cuarta del día'")} ->> 'estado';`),
    "enviada",
  );
  esperar(
    "MUTANTE sin mirar la marca: el segundo toque ya no devuelve la misma (la prueba T lo nota)",
    (() => {
      const r = escenario(`select pg_temp.mutar('retail.tienda_recomendar(uuid, text, uuid, uuid)', 'r.marca = p_marca);', 'r.marca = p_marca and false);');
        ${COMO_TIENDA}
        select ${recomienda(U.ana, "'Dos toques seguidos'", "null", `'${MARCA}'`)} ->> 'estado' as _1 \\gset
        select pg_temp.intento($q$select ${recomienda(U.ana, "'Dos toques seguidos'", "null", `'${MARCA}'`)}$q$);`);
      return r.ok && r.salida !== "ok";
    })(),
    "el segundo toque siguió devolviendo la misma",
  );
  esperarValor(
    "MUTANTE la lista sin el candado del módulo: Micaela la lee (la prueba R lo nota)",
    escenario(`select pg_temp.mutar('retail.fn_recomendaciones()', 'perform retail.fn_exigir_modulo(''recomendaciones'');', '');
      ${COMO(MICAELA)}select pg_temp.intento('select retail.fn_recomendaciones()');`),
    "ok",
  );
  esperarValor(
    "MUTANTE responder sin el candado del módulo: Micaela responde (la prueba R lo nota)",
    escenario(`${ANA_RECOMIENDA()}select pg_temp.mutar('retail.responder_recomendacion(uuid, text)', 'perform retail.fn_exigir_modulo(''recomendaciones'');', '');
      ${COMO(MICAELA)}select retail.responder_recomendacion(:'rid', 'Sin el módulo') ->> 'estado';`),
    "respondida",
  );
  esperarValor(
    "MUTANTE el disparador que no quita sus datos: su nombre y su DNI siguen en el texto (la prueba A lo nota)",
    escenario(`select pg_temp.mutar('retail.fn_recomendaciones_al_anonimizar()', 'where r.clienta_id = new.id', 'where false and r.clienta_id = new.id');
      ${ANA_RECOMIENDA("rid", TEXTO_CON_DATOS)}
      select retail.fn_clienta_anonimizar(:'ana_c', null, true) as _n \\gset
      select (${SIN_RASTRO} > 0)::text;`),
    "true",
  );
  esperarValor(
    "MUTANTE la lista que no mira si la ficha se anonimizó: sigue dando un cliente y su ficha (la prueba A lo nota)",
    escenario(`select pg_temp.mutar('retail.fn_recomendaciones()', 'case when x.sin_nombre_en is not null or c.anonimizada then null', 'case when false then null');
      ${ANA_RECOMIENDA()}
      select retail.fn_clienta_anonimizar(:'ana_c', null, true) as _n \\gset
      ${COMO(FELIPE)}select (${DE_LA_LISTA("-> 'cliente' ->> 'ficha_id'")} = :'ana_c')::text;`),
    "true",
  );
  esperarValor(
    "MUTANTE «las suyas» sin filtrar la cuenta: Ana ve la de Bea (la prueba L lo nota)",
    escenario(`select pg_temp.mutar('retail.tienda_mis_recomendaciones(uuid)', 'where r.cuenta_web_id = v_cuenta', 'where true');
      ${COMO_TIENDA}
      select ${recomienda(U.bea, "'La de Bea no la ve Ana'")} ->> 'id' as _b \\gset
      -- Se busca la de Bea por su id, no se cuentan: en una base que ya tiene otras recomendaciones el mutante también las devuelve.
      select exists (select 1 from jsonb_array_elements(retail.tienda_mis_recomendaciones('${U.ana}') -> 'recomendaciones') x
                      where x ->> 'id' = :'_b')::text;`),
    "true",
  );
  esperarValor(
    "MUTANTE responder sin mirar si quedó sin nombre: igual lo frena el candado de la fila, con otro error (la prueba A lo nota)",
    escenario(`select pg_temp.mutar('retail.responder_recomendacion(uuid, text)', 'if v_sin_nombre is not null then', 'if false then');
      ${ANA_RECOMIENDA()}
      select retail.fn_clienta_anonimizar(:'ana_c', null, true) as _n \\gset
      ${COMO(FELIPE)}select pg_temp.intento($q$select retail.responder_recomendacion('$q$ || :'rid' || $q$', 'Otra')$q$);`),
    "23514|recomendacion_sin_nombre",
  );

  // =================================================================================================================
  console.log("— P. Las dos partes, pegadas dos veces —");
  const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
  esperarValor(
    "se pueden volver a pegar (dos veces seguidas, en orden)",
    correr(`begin;\n${sql}\n${sql}\nselect count(*)::text from retail.modulos where clave = 'recomendaciones';\nrollback;`),
    "1",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();

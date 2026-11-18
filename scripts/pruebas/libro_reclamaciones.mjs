#!/usr/bin/env node
/**
 * Libro de Reclamaciones de la tienda online (ADR-0679, Felipe 2026-11-18) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261118145000_libro_reclamaciones_tienda.sql` (PARTE 1, la hoja), `20261118150000_libro_reclamaciones_copia_al_correo.sql`
 * (PARTE 2, la copia), `20261118151000_libro_reclamaciones_erp.sql` (PARTE 3, el ERP) y `20261118152000_libro_reclamaciones_respuesta.sql`
 * (PARTE 4, la respuesta) y `20261118170000_libro_reclamaciones_ajustes_legales.sql` (PARTE 5, lo que pidió la revisión legal):
 *   E. Estructura y puerta: `hojas_reclamacion` y sus intentos con RLS, sin políticas y sin permisos para nadie (ni `tienda_web`); las
 *      tres `tienda_*` son security definer y solo de `tienda_web` (nunca de anon ni de authenticated).
 *   T. La tienda escribe SIN cuenta: la hoja completa se guarda con su número «000001-<año>», los datos de CAYLA copiados y el texto
 *      limpio; cada campo malo (tipo, nombre, documento por tipo, domicilio, teléfono, correo, menor sin apoderado, bien, monto,
 *      descripción, detalle, pedido, una tienda escondida o un id cualquiera) devuelve su `campo` y no guarda nada; con una tienda
 *      de la web, copia su nombre y su dirección; con sesión liga la cuenta, y con la cuenta cerrada la guarda igual sin cuenta.
 *   N. El número: correlativo sin saltos (1, 2, 3), un rechazo no gasta número, y la MISMA marca devuelve la misma hoja sin gastar otro.
 *   I. El tope: 5 por hora por huella de ip (la sexta, `limite`, sin guardar); otra huella sigue; sin huella se guarda igual.
 *   L. La constancia: con id y marca se lee completa; con el id y otra marca, nada.
 *   C. El candado: nada de lo escrito cambia y ninguna hoja se borra (ni como postgres).
 *   K. La copia al correo: reclamar toma solo las pendientes (la más vieja primero), suma un intento, no vuelve a tomar una tomada hace
 *      menos de 2 minutos, deja la de 5 intentos; con id, solo esa; enviada no se vuelve a tomar ni se desmarca; los intentos no bajan;
 *      la constancia dice si salió.
 *   R. El ERP: el plazo (15 días hábiles desde el día siguiente, sin sábados, domingos ni feriados; cuántos quedan, 0 el último día y
 *      negativo si venció); el módulo nace en Tienda web, delegable y SIN rol; sin el módulo (Micaela, integrante) la lista dice 42501 y
 *      el líder la lee con cada hoja completa y su plazo; ni anon ni la tienda la ejecutan.
 *   S. Responder: sin el módulo, 42501; corta o larga, su hint y nada cambia; el líder responde (firmada, con su fecha, en la Actividad);
 *      el mismo texto otra vez es «ya_estaba» y otro texto, `libro_ya_respondida`; la respuesta no se corrige (ni como postgres); la
 *      lista y la constancia la traen; la cola del correo la toma una vez y la marca enviada; la tienda no puede responder.
 *   G. Lo legal: sin la casilla de conformidad no se guarda; con un menor, cada dato de quien lo representa (documento por tipo, domicilio,
 *      teléfono, correo) se exige y se guarda; la hoja lleva el código del libro («LR-WEB-01») y no cambia.
 *   M. Mutantes: el tope, la marca y el candado, rotos a propósito dentro de la transacción: la prueba lo nota.
 *   P. Las dos partes se pueden pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: muestra Trujillo en la web («ZZ …») y crea una cuenta web de prueba. Para
 * actuar como `tienda_web`, quien corre la prueba se da ese rol dentro de la transacción (`grant tienda_web to postgres`, con el
 * nombre: con `current_user` la imagen 17.6.1.14x de la base local se cae, ver la memoria del repo). Nada queda en la base.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=1` mete la migración dentro de cada transacción (que se revierte). Sin la variable, prueba lo
 * que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:libro-reclamaciones                                         → contra supabase_db_cayla-retail
 *   pnpm pruebas:libro-reclamaciones -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261118145000_libro_reclamaciones_tienda.sql",
  "supabase/migrations/20261118150000_libro_reclamaciones_copia_al_correo.sql",
  "supabase/migrations/20261118151000_libro_reclamaciones_erp.sql",
  "supabase/migrations/20261118152000_libro_reclamaciones_respuesta.sql",
  "supabase/migrations/20261118170000_libro_reclamaciones_ajustes_legales.sql",
];
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo
const APLICAR_ANTES = process.env.APLICAR_ANTES === "1" ? MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

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

const USUARIO = randomUUID();
const USUARIO_CERRADO = randomUUID();

const PREPARAR = `
begin;
${APLICAR_ANTES}
set local search_path = retail, public, extensions;
-- Una persona firma a su nombre (sin el combo «Responsable»): lo que se prueba aquí es la hoja, no el combo.
update retail.configuracion_empresa set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by id limit 1 \\gset
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09959901', 'Lucía Prueba Reclama', '999000101') returning id as lucia_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp)
values ('dni', '09959902', 'Rosa Prueba Cerrada', '999000102') returning id as rosa_c \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values
  ('${USUARIO}', :'lucia_c', 'lucia.prueba.reclama@example.com', 'borrador-2026-10-14'),
  ('${USUARIO_CERRADO}', :'rosa_c', 'rosa.prueba.cerrada@example.com', 'borrador-2026-10-14');
-- Cerrada como la cierra la tienda: el usuario pasa a usuario_cerrado_id y el correo se va.
update retail.cuentas_web set cerrada_en = now(), usuario_cerrado_id = usuario_web_id, usuario_web_id = null, correo = null
 where usuario_web_id = '${USUARIO_CERRADO}';
select id as lucia_w from retail.cuentas_web where usuario_web_id = '${USUARIO}' \\gset
-- La prueba parte del libro vacío aunque la base ya tenga hojas (una probada a mano en el navegador): se apartan dentro de la
-- transacción, con el candado apagado solo para eso, y el ROLLBACK las devuelve. El contador del año también arranca en cero.
alter table retail.hojas_reclamacion disable trigger hojas_reclamacion_reglas;
delete from retail.hojas_reclamacion;
alter table retail.hojas_reclamacion enable trigger hojas_reclamacion_reglas;
delete from retail.hojas_reclamacion_intentos;
delete from retail.codigos_correlativos where prefijo = 'LR-' || extract(year from (now() at time zone 'America/Lima'))::int;
`;
const COMO_TIENDA = `reset role;\ngrant tienda_web to postgres with set true;\nset local role tienda_web;\n`;
const COMO_POSTGRES = `reset role;\n`;
/** Como una cuenta del ERP (claims reales y el rol authenticated, para que fn_exigir_modulo pregunte de verdad). */
const COMO = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const ANIO = new Date(Date.now() - 5 * 3600 * 1000).getUTCFullYear();

/** Una hoja buena, con lo que se le cambie. */
function datos(cambios = {}) {
  return JSON.stringify({
    tipo: "reclamo",
    nombre: "Lucía  Prueba​ Reclama",
    tipo_documento: "dni",
    documento: "09959901",
    domicilio: "Calle de prueba 123, Trujillo",
    telefono: "999 000 101",
    correo: "Lucia.Prueba@Example.com",
    menor_de_edad: false,
    apoderado: "",
    bien_tipo: "producto",
    monto: "89.90",
    bien_descripcion: "Blusa de prueba talla M",
    detalle: "La blusa llegó con una costura abierta en la manga.",
    pedido: "Cambio por otra igual.",
    ubicacion_id: "",
    conforme: true,
    ...cambios,
  }).replaceAll("'", "''");
}
const registrar = (d, { usuario = null, ip = "'huella-a'", marca = null } = {}) =>
  `select retail.tienda_registrar_hoja_reclamacion('${d}'::jsonb, ${usuario ? `'${usuario}'` : "null"}, ${ip}, ${marca ? `'${marca}'` : "gen_random_uuid()"})`;

function escenario(cuerpo) {
  return correr(`${PREPARAR}${cuerpo}\nrollback;\n`);
}

// ---------- E. Estructura y puerta ----------
{
  const r = correr(`
${APLICAR_ANTES ? `begin;\n${APLICAR_ANTES}` : "begin;"}
select string_agg(format('%s:%s:%s', c.relname, c.relrowsecurity,
         (select count(*) from pg_policies p where p.schemaname = 'retail' and p.tablename = c.relname)), ',' order by c.relname)
  from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relname in ('hojas_reclamacion', 'hojas_reclamacion_intentos');
select bool_or(has_table_privilege(r, 'retail.hojas_reclamacion', 'select') or has_table_privilege(r, 'retail.hojas_reclamacion', 'insert'))
  from unnest(array['anon', 'authenticated', 'tienda_web']) r;
select string_agg(format('%s:%s:%s:%s:%s', p.proname, p.prosecdef,
         has_function_privilege('tienda_web', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
         has_function_privilege('anon', p.oid, 'execute')), ',' order by p.proname)
  from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('tienda_registrar_hoja_reclamacion', 'tienda_ver_hoja_reclamacion', 'tienda_libro_reclamaciones_datos',
                     'tienda_libro_copias_reclamar', 'tienda_libro_copia_enviada');
rollback;`);
  const [rls, permisos, funciones] = r.ok ? r.salida.split("\n") : [];
  esperar("E1 · las dos tablas con RLS y sin políticas", rls === "hojas_reclamacion:t:0,hojas_reclamacion_intentos:t:0", r.mensaje ?? rls);
  esperar("E2 · nadie de la API lee ni escribe la tabla (tampoco tienda_web)", permisos === "f", permisos);
  esperar(
    "E3 · las cinco tienda_* son security definer y solo de tienda_web",
    funciones ===
      "tienda_libro_copia_enviada:t:t:f:f,tienda_libro_copias_reclamar:t:t:f:f,tienda_libro_reclamaciones_datos:t:t:f:f,tienda_registrar_hoja_reclamacion:t:t:f:f,tienda_ver_hoja_reclamacion:t:t:f:f",
    funciones,
  );
}

// ---------- T. La tienda escribe ----------
{
  const r = escenario(`${COMO_TIENDA}
select ${registrar(datos()).replace(/^select /, "")} ->> 'estado';
${COMO_POSTGRES}
select format('%s|%s|%s|%s|%s|%s|%s|%s|%s', codigo, consumidor_nombre, consumidor_telefono, consumidor_correo, bien_monto,
              proveedor_ruc, proveedor_domicilio <> '', cuenta_web_id is null, ubicacion_id is null)
  from retail.hojas_reclamacion;`);
  const [estado, fila] = r.ok ? r.salida.split("\n") : [];
  esperar("T1 · una hoja sin cuenta se guarda", estado === "registrada", r.mensaje ?? estado);
  esperar(
    "T2 · número del año, texto limpio, datos de CAYLA copiados, sin cuenta ni tienda",
    fila === `000001-${ANIO}|Lucía Prueba Reclama|999000101|lucia.prueba@example.com|89.90|20605964550|t|t|t`,
    fila,
  );
}
{
  const malos = [
    ["tipo", { tipo: "sugerencia" }],
    ["nombre", { nombre: "A" }],
    ["documento", { documento: "1234567" }],
    ["documento", { tipo_documento: "ce", documento: "12-34" }],
    ["documento", { tipo_documento: "licencia" }],
    ["domicilio", { domicilio: "x" }],
    ["telefono", { telefono: "12" }],
    ["correo", { correo: "lucia@" }],
    ["apoderado", { menor_de_edad: true, apoderado: "" }],
    ["apoderado_documento", { menor_de_edad: true, apoderado: "María Prueba", apoderado_tipo_documento: "dni", apoderado_documento: "123" }],
    ["conforme", { conforme: false }],
    ["bien_tipo", { bien_tipo: "otro" }],
    ["monto", { monto: "-5" }],
    ["monto", { monto: "1,50" }],
    ["monto", { monto: "2000000" }],
    ["bien_descripcion", { bien_descripcion: "" }],
    ["detalle", { detalle: "corto" }],
    ["pedido", { pedido: "" }],
    ["ubicacion", { ubicacion_id: "no-es-un-id" }],
    ["ubicacion", { ubicacion_id: randomUUID() }],
  ];
  const r = escenario(`${COMO_TIENDA}
${malos.map(([, c]) => `${registrar(datos(c))} ->> 'campo';`).join("\n")}
${COMO_POSTGRES}
select count(*) from retail.hojas_reclamacion;`);
  const lineas = r.ok ? r.salida.split("\n") : [];
  malos.forEach(([campo, c], i) =>
    esperar(`T3 · ${JSON.stringify(c)} → invalido en «${campo}»`, lineas[i] === campo, r.mensaje ?? lineas[i]),
  );
  esperar("T3 · ningún rechazo guardó nada", lineas[malos.length] === "0", lineas[malos.length]);
}
{
  const r = escenario(`${COMO_TIENDA}
select retail.tienda_registrar_hoja_reclamacion(jsonb_set('${datos()}'::jsonb, '{ubicacion_id}', to_jsonb(:'tru'::text)), null, 'huella-a', gen_random_uuid()) ->> 'estado';
${COMO_POSTGRES}
select format('%s|%s', ubicacion_nombre, ubicacion_direccion) from retail.hojas_reclamacion;`);
  const [estado, fila] = r.ok ? r.salida.split("\n") : [];
  esperar("T4 · con una tienda de la web copia su nombre y su dirección", estado === "registrada" && fila === "ZZ Trujillo|Av. de prueba 1", r.mensaje ?? `${estado} ${fila}`);
}
{
  const r = escenario(`${COMO_TIENDA}
select retail.tienda_registrar_hoja_reclamacion(jsonb_set('${datos()}'::jsonb, '{ubicacion_id}', to_jsonb(:'taller'::text)), null, 'huella-a', gen_random_uuid()) ->> 'campo';`);
  esperar("T5 · el Taller (no se ve en la web) no se elige", r.ok && r.salida === "ubicacion", r.mensaje ?? r.salida);
}
{
  const r = escenario(`${COMO_TIENDA}
${registrar(datos(), { usuario: USUARIO })} ->> 'estado';
${registrar(datos(), { usuario: USUARIO_CERRADO, ip: "'huella-b'" })} ->> 'estado';
${COMO_POSTGRES}
select string_agg(coalesce((cuenta_web_id = :'lucia_w')::text, 'sin'), ',' order by numero) from retail.hojas_reclamacion;`);
  esperar("T6 · con sesión liga la cuenta; con la cuenta cerrada se guarda sin cuenta", r.ok && r.salida === "registrada\nregistrada\ntrue,sin", r.mensaje ?? r.salida);
}

// ---------- N. El número ----------
{
  const m = randomUUID();
  const r = escenario(`${COMO_TIENDA}
${registrar(datos(), { marca: m })} ->> 'codigo';
${registrar(datos({ correo: "malo" }))} ->> 'estado';
${registrar(datos(), { marca: m })} ->> 'repetida';
${registrar(datos(), { ip: "'huella-b'" })} ->> 'codigo';
${registrar(datos(), { ip: "'huella-c'" })} ->> 'codigo';
${COMO_POSTGRES}
select count(*) from retail.hojas_reclamacion;`);
  esperar(
    "N1 · 1, 2, 3 sin saltos: un rechazo no gasta número y la misma marca devuelve la misma hoja",
    r.ok && r.salida === `000001-${ANIO}\ninvalido\ntrue\n000002-${ANIO}\n000003-${ANIO}\n3`,
    r.mensaje ?? r.salida,
  );
}

// ---------- I. El tope ----------
{
  const r = escenario(`${COMO_TIENDA}
${Array.from({ length: 6 }, () => `${registrar(datos())} ->> 'estado';`).join("\n")}
${registrar(datos(), { ip: "'huella-otra'" })} ->> 'estado';
${registrar(datos(), { ip: "null" })} ->> 'estado';
${COMO_POSTGRES}
select count(*) from retail.hojas_reclamacion;`);
  esperar(
    "I1 · 5 por hora por huella; la sexta no se guarda; otra huella y sin huella, sí",
    r.ok && r.salida === "registrada\nregistrada\nregistrada\nregistrada\nregistrada\nlimite\nregistrada\nregistrada\n7",
    r.mensaje ?? r.salida,
  );
}

// ---------- L. La constancia ----------
{
  const m = randomUUID();
  const r = escenario(`${COMO_TIENDA}
select (${registrar(datos(), { marca: m }).replace(/^select /, "")}) ->> 'id' as hoja \\gset
select retail.tienda_ver_hoja_reclamacion(:'hoja', '${m}') #>> '{consumidor,documento}';
select retail.tienda_ver_hoja_reclamacion(:'hoja', gen_random_uuid()) is null;
select retail.tienda_libro_reclamaciones_datos() ->> 'ruc';`);
  esperar("L1 · con id y marca se lee; con otra marca, nada; los datos de CAYLA antes de llenar", r.ok && r.salida === "09959901\nt\n20605964550", r.mensaje ?? r.salida);
}

// ---------- C. El candado ----------
for (const [nombre, sql] of [
  ["C1 · el detalle no cambia", "update retail.hojas_reclamacion set detalle = 'Otro texto distinto del original.'"],
  ["C2 · el correo no cambia", "update retail.hojas_reclamacion set consumidor_correo = 'otra@example.com'"],
  ["C3 · el número no cambia", "update retail.hojas_reclamacion set numero = 99"],
  ["C4 · una hoja no se borra", "delete from retail.hojas_reclamacion"],
]) {
  const r = escenario(`${COMO_TIENDA}
${registrar(datos())};
${COMO_POSTGRES}
${sql};`);
  esperar(`${nombre} (ni como postgres)`, !r.ok && /42501|no cambia|no se borra/.test(r.mensaje), r.ok ? "pasó sin error" : r.mensaje);
}

// ---------- K. La copia al correo ----------
{
  const [m1, m2, m3] = [randomUUID(), randomUUID(), randomUUID()];
  const r = escenario(`${COMO_TIENDA}
select (${registrar(datos(), { marca: m1 }).replace(/^select /, "")}) ->> 'id' as h1 \\gset
select (${registrar(datos(), { marca: m2, ip: "'huella-b'" }).replace(/^select /, "")}) ->> 'id' as h2 \\gset
select (${registrar(datos(), { marca: m3, ip: "'huella-c'" }).replace(/^select /, "")}) ->> 'id' as h3 \\gset
-- Solo la 2 (con id).
select jsonb_array_length(retail.tienda_libro_copias_reclamar(10, :'h2') -> 'copias');
-- Las pendientes no tomadas: la 1 y la 3, cada una con su marca (en una transacción las tres tienen la misma hora: se compara el
-- conjunto, no el orden).
select string_agg(c ->> 'marca', ',' order by c ->> 'marca') from jsonb_array_elements(retail.tienda_libro_copias_reclamar(10) -> 'copias') c;
-- Recién tomadas: nadie más las toma.
select jsonb_array_length(retail.tienda_libro_copias_reclamar(10) -> 'copias');
select retail.tienda_libro_copia_enviada(:'h1') ->> 'estado';
select retail.tienda_ver_hoja_reclamacion(:'h1', '${m1}') ->> 'copia_enviada', retail.tienda_ver_hoja_reclamacion(:'h3', '${m3}') ->> 'copia_enviada';
${COMO_POSTGRES}
-- Pasados los 2 minutos: vuelven la 2 y la 3 (la 1 ya salió).
update retail.hojas_reclamacion set copia_tomada_en = now() - interval '3 minutes';
${COMO_TIENDA}
select string_agg(c #>> '{hoja,id}', ',' order by c #>> '{hoja,id}') = (select string_agg(x, ',' order by x) from unnest(array[:'h2', :'h3']) x)
  from jsonb_array_elements(retail.tienda_libro_copias_reclamar(10) -> 'copias') c;
${COMO_POSTGRES}
-- Con 5 intentos se deja.
update retail.hojas_reclamacion set copia_intentos = 5, copia_tomada_en = null where id = :'h2';
update retail.hojas_reclamacion set copia_tomada_en = null where id = :'h3';
${COMO_TIENDA}
select string_agg(c #>> '{hoja,id}', ',') = :'h3' from jsonb_array_elements(retail.tienda_libro_copias_reclamar(10) -> 'copias') c;`);
  esperar(
    "K1 · reclamar: con id solo esa; las pendientes; las tomadas no; enviada no vuelve; a los 2 min sí; con 5 intentos no",
    r.ok && r.salida === `1\n${[m1, m3].sort().join(",")}\n0\nok\ntrue|false\nt\nt`,
    r.mensaje ?? r.salida,
  );
}
for (const [nombre, sql] of [
  ["K2 · la copia enviada no se desmarca", "update retail.hojas_reclamacion set copia_enviada_en = null"],
  ["K3 · los intentos no bajan", "update retail.hojas_reclamacion set copia_intentos = 0"],
]) {
  const r = escenario(`${COMO_TIENDA}
select (${registrar(datos()).replace(/^select /, "")}) ->> 'id' as h \\gset
select retail.tienda_libro_copias_reclamar(1, :'h') is not null;
select retail.tienda_libro_copia_enviada(:'h') is not null;
${COMO_POSTGRES}
${sql};`);
  esperar(`${nombre} (ni como postgres)`, !r.ok && /42501|no se desmarca|no bajan/.test(r.mensaje), r.ok ? "pasó sin error" : r.mensaje);
}

// ---------- R. El ERP ----------
{
  const r = escenario(`${COMO_POSTGRES}
select retail.fn_libro_vence_el('2026-11-18');
select retail.fn_libro_vence_el('2026-12-04');
select retail.fn_libro_dias_habiles_restantes('2026-11-18', '2026-12-10'), retail.fn_libro_dias_habiles_restantes('2026-12-10', '2026-12-10'),
       retail.fn_libro_dias_habiles_restantes('2026-12-14', '2026-12-10');
select format('%s|%s|%s|%s', grupo, orden, delegable, (select count(*) from retail.rol_modulos where modulo = 'libro_reclamaciones'))
  from retail.modulos where clave = 'libro_reclamaciones';
select has_function_privilege('anon', 'retail.fn_libro_reclamaciones()', 'execute'),
       has_function_privilege('tienda_web', 'retail.fn_libro_reclamaciones()', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_libro_vence_el(date)', 'execute');`);
  esperar(
    "R1 · el plazo (8 de diciembre feriado; un viernes cruza el fin de semana), el módulo nace sin rol, solo authenticated lee",
    // 18-nov → 10-dic (salta el 8); 4-dic (viernes) → 29-dic (salta el 8 y el 25).
    r.ok && r.salida === "2026-12-10\n2026-12-29\n15|0|-2\nTienda web|65|t|0\nf|f|f",
    r.mensaje ?? r.salida,
  );
}
{
  const r = escenario(`${COMO_TIENDA}
${registrar(datos())};
${COMO_POSTGRES}
-- Sin el módulo (el rol integrante no lo tiene: nace sin rol).
delete from retail.rol_modulos where modulo = 'libro_reclamaciones';
${COMO(MICAELA)}
do $$ begin
  perform retail.fn_libro_reclamaciones();
  perform set_config('prueba.libro', 'pasó', true);
exception when insufficient_privilege then
  perform set_config('prueba.libro', '42501', true);
end $$;
select current_setting('prueba.libro');
${COMO(FELIPE)}
select format('%s|%s|%s|%s', jsonb_array_length(x -> 'hojas'), x #>> '{hojas,0,consumidor,documento}', x #>> '{hojas,0,vence_el}' is not null,
              (x #>> '{hojas,0,dias_restantes}')::int between 10 and 15)
  from retail.fn_libro_reclamaciones() x;`);
  esperar(
    "R2 · sin el módulo, 42501; el líder lee la hoja completa con su plazo",
    r.ok && r.salida.endsWith("42501\n1|09959901|t|t"),
    r.mensaje ?? r.salida,
  );
}

// ---------- S. Responder ----------
{
  const m = randomUUID();
  const RESP = "Lamentamos lo ocurrido. Puedes acercarte a cualquier tienda CAYLA y te la cambiamos.";
  const r = escenario(`${COMO_TIENDA}
select (${registrar(datos(), { marca: m }).replace(/^select /, "")}) ->> 'id' as h \\gset
${COMO_POSTGRES}
select set_config('prueba.h', :'h', false) is not null as _h \\gset
delete from retail.rol_modulos where modulo = 'libro_reclamaciones';
${COMO(MICAELA)}
do $$ begin
  perform retail.responder_hoja_reclamacion(current_setting('prueba.h')::uuid, 'Una respuesta suficiente.');
  perform set_config('prueba.r', 'pasó', true);
exception when insufficient_privilege then perform set_config('prueba.r', '42501', true);
end $$;
select current_setting('prueba.r');
${COMO(FELIPE)}
do $$ begin
  perform retail.responder_hoja_reclamacion(current_setting('prueba.h')::uuid, 'corta');
  perform set_config('prueba.r', 'pasó', true);
exception when others then
  declare v text; begin get stacked diagnostics v = pg_exception_hint; perform set_config('prueba.r', v, true); end;
end $$;
select current_setting('prueba.r');
select retail.responder_hoja_reclamacion(:'h', '${RESP}') ->> 'estado';
select retail.responder_hoja_reclamacion(:'h', '${RESP}') ->> 'estado';
do $$ begin
  perform retail.responder_hoja_reclamacion(current_setting('prueba.h')::uuid, 'Otra respuesta distinta y larga.');
  perform set_config('prueba.r', 'pasó', true);
exception when others then
  declare v text; begin get stacked diagnostics v = pg_exception_hint; perform set_config('prueba.r', v, true); end;
end $$;
select current_setting('prueba.r');
select x #>> '{hojas,0,respuesta}' = '${RESP}', x #>> '{hojas,0,respuesta_enviada}' from retail.fn_libro_reclamaciones() x;
${COMO_POSTGRES}
select respondida_por is not null and respondida_en is not null from retail.hojas_reclamacion where id = :'h';
select count(*) from retail.actividad where registro_id = :'h' and accion = 'responder';
${COMO_TIENDA}
select retail.tienda_ver_hoja_reclamacion(:'h', '${m}') ->> 'respuesta' = '${RESP}';
select jsonb_array_length(retail.tienda_libro_respuestas_reclamar(10) -> 'respuestas');
select jsonb_array_length(retail.tienda_libro_respuestas_reclamar(10) -> 'respuestas');
select retail.tienda_libro_respuesta_enviada(:'h') ->> 'estado';
${COMO_POSTGRES}
select respuesta_enviada_en is not null, respuesta_intentos from retail.hojas_reclamacion where id = :'h';`);
  esperar(
    "S1 · sin módulo 42501; corta, su hint; responde una vez, firmada y anotada; el mismo texto «ya_estaba», otro texto «libro_ya_respondida»; la cola del correo",
    r.ok && r.salida === "42501\nlibro_respuesta_corta\nrespondida\nya_estaba\nlibro_ya_respondida\nt|false\nt\n1\nt\n1\n0\nok\nt|1",
    r.mensaje ?? r.salida,
  );
}
for (const [nombre, sql] of [
  ["S2 · la respuesta no se corrige", "update retail.hojas_reclamacion set respuesta = 'Otra respuesta distinta y larga.'"],
  ["S3 · quién respondió no cambia", "update retail.hojas_reclamacion set respondida_en = now() + interval '1 day'"],
]) {
  const r = escenario(`${COMO_TIENDA}
select (${registrar(datos()).replace(/^select /, "")}) ->> 'id' as h \\gset
${COMO(FELIPE)}
select retail.responder_hoja_reclamacion(:'h', 'Ya la revisamos y te la cambiamos en tienda.') is not null;
${COMO_POSTGRES}
${sql};`);
  esperar(`${nombre} (ni como postgres)`, !r.ok && /42501|no se corrige/.test(r.mensaje), r.ok ? "pasó sin error" : r.mensaje);
}
{
  const r = escenario(`${COMO_POSTGRES}
select has_function_privilege('tienda_web', 'retail.responder_hoja_reclamacion(uuid, text)', 'execute'),
       has_function_privilege('anon', 'retail.responder_hoja_reclamacion(uuid, text)', 'execute'),
       has_function_privilege('authenticated', 'retail.tienda_libro_respuestas_reclamar(integer)', 'execute');`);
  esperar("S4 · ni la tienda ni anon responden; el ERP no toma la cola de la tienda", r.ok && r.salida === "f|f|f", r.mensaje ?? r.salida);
}

// ---------- G. Lo legal (PARTE 5) ----------
{
  const MENOR = {
    menor_de_edad: true,
    apoderado: "María Prueba Madre",
    apoderado_tipo_documento: "dni",
    apoderado_documento: "09959911",
    apoderado_domicilio: "Calle de prueba 456, Trujillo",
    apoderado_telefono: "999 000 111",
    apoderado_correo: "Maria.Madre@Example.com",
  };
  const m = randomUUID();
  const r = escenario(`${COMO_TIENDA}
${registrar(datos({ ...MENOR, apoderado_correo: "malo" }))} ->> 'campo';
${registrar(datos({ ...MENOR, apoderado_domicilio: "" }))} ->> 'campo';
${registrar(datos({ ...MENOR, apoderado_telefono: "1" }))} ->> 'campo';
select (${registrar(datos(MENOR), { marca: m }).replace(/^select /, "")}) ->> 'id' as h \\gset
select format('%s|%s|%s', x ->> 'libro_codigo', x #>> '{consumidor,apoderado_datos,documento}', x #>> '{consumidor,apoderado_datos,correo}')
  from retail.tienda_ver_hoja_reclamacion(:'h', '${m}') x;
${COMO_POSTGRES}
select format('%s|%s', conforme, apoderado_telefono) from retail.hojas_reclamacion where id = :'h';`);
  esperar(
    "G1 · con un menor, cada dato de quien lo representa se exige y se guarda; la hoja lleva su código y la conformidad",
    r.ok && r.salida === "apoderado_correo\napoderado_domicilio\napoderado_telefono\nLR-WEB-01|09959911|maria.madre@example.com\nt|999000111",
    r.mensaje ?? r.salida,
  );
}
for (const [nombre, sql] of [
  ["G2 · el código del libro no cambia", "update retail.hojas_reclamacion set libro_codigo = 'OTRO'"],
  ["G3 · la conformidad no cambia", "update retail.hojas_reclamacion set conforme = false"],
]) {
  const r = escenario(`${COMO_TIENDA}
${registrar(datos())};
${COMO_POSTGRES}
${sql};`);
  esperar(`${nombre} (ni como postgres)`, !r.ok && /42501|no cambia/.test(r.mensaje), r.ok ? "pasó sin error" : r.mensaje);
}

// ---------- M. Mutantes ----------
{
  // Sin el candado, el update pasa: si la prueba C no lo notara, no estaría mirando nada.
  const r = escenario(`${COMO_TIENDA}
${registrar(datos())};
${COMO_POSTGRES}
alter table retail.hojas_reclamacion disable trigger hojas_reclamacion_reglas;
update retail.hojas_reclamacion set detalle = 'Mutante: el candado apagado.';
select 'pasó';`);
  esperar("M1 · sin el disparador, el cambio pasa (la prueba C mira de verdad)", r.ok && r.salida.endsWith("pasó"), r.mensaje ?? r.salida);
}
{
  // Sin la marca única, la misma marca guarda dos hojas.
  const m = randomUUID();
  const r = escenario(`${COMO_POSTGRES}
alter table retail.hojas_reclamacion drop constraint hojas_reclamacion_marca_unica;
insert into retail.hojas_reclamacion (anio, numero, marca, proveedor_razon_social, proveedor_ruc, proveedor_domicilio, consumidor_nombre,
  consumidor_tipo_documento, consumidor_documento, consumidor_domicilio, consumidor_telefono, consumidor_correo, bien_tipo,
  bien_descripcion, tipo, detalle, pedido)
select ${ANIO}, n, '${m}', 'X', '1', 'X', 'Lucía', 'dni', '09959901', 'Calle 123', '999000101', 'a@b.co', 'producto', 'Blusa',
       'reclamo', 'Detalle de prueba largo.', 'Cambio' from generate_series(900, 901) n;
select count(*) from retail.hojas_reclamacion where marca = '${m}';`);
  esperar("M2 · sin la marca única entran dos con la misma marca (la prueba N mira de verdad)", r.ok && r.salida.endsWith("2"), r.mensaje ?? r.salida);
}

// ---------- P. Se pegan dos veces ----------
{
  const sql = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
  const r = correr(`begin;\n${sql}\n${sql}\nrollback;\n`);
  esperar("P1 · las cinco partes se pueden pegar dos veces", r.ok, r.mensaje);
}

console.log(`\n${total - fallos}/${total} ${fallos ? "con fallos" : "bien"}`);
process.exit(fallos ? 1 : 0);

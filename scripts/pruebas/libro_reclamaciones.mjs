#!/usr/bin/env node
/**
 * Libro de Reclamaciones de la tienda online (ADR-0679, Felipe 2026-11-18) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261118145000_libro_reclamaciones_tienda.sql` (PARTE 1, la hoja):
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
 *   M. Mutantes: el tope, la marca y el candado, rotos a propósito dentro de la transacción: la prueba lo nota.
 *   P. La migración se puede pegar dos veces.
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
const MIGRACION = "supabase/migrations/20261118145000_libro_reclamaciones_tienda.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES === "1" ? readFileSync(MIGRACION, "utf8") : "";

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
-- El contador del año arranca en cero para la prueba (se revierte con todo lo demás).
delete from retail.codigos_correlativos where prefijo = 'LR-' || extract(year from (now() at time zone 'America/Lima'))::int;
`;
const COMO_TIENDA = `reset role;\ngrant tienda_web to postgres with set true;\nset local role tienda_web;\n`;
const COMO_POSTGRES = `reset role;\n`;
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
   and p.proname in ('tienda_registrar_hoja_reclamacion', 'tienda_ver_hoja_reclamacion', 'tienda_libro_reclamaciones_datos');
rollback;`);
  const [rls, permisos, funciones] = r.ok ? r.salida.split("\n") : [];
  esperar("E1 · las dos tablas con RLS y sin políticas", rls === "hojas_reclamacion:t:0,hojas_reclamacion_intentos:t:0", r.mensaje ?? rls);
  esperar("E2 · nadie de la API lee ni escribe la tabla (tampoco tienda_web)", permisos === "f", permisos);
  esperar(
    "E3 · las tres tienda_* son security definer y solo de tienda_web",
    funciones ===
      "tienda_libro_reclamaciones_datos:t:t:f:f,tienda_registrar_hoja_reclamacion:t:t:f:f,tienda_ver_hoja_reclamacion:t:t:f:f",
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

// ---------- P. Se pega dos veces ----------
{
  const sql = readFileSync(MIGRACION, "utf8");
  const r = correr(`begin;\n${sql}\n${sql}\nrollback;\n`);
  esperar("P1 · la migración se puede pegar dos veces", r.ok, r.mensaje);
}

console.log(`\n${total - fallos}/${total} ${fallos ? "con fallos" : "bien"}`);
process.exit(fallos ? 1 : 0);

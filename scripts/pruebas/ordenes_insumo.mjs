#!/usr/bin/env node
/**
 * Pruebas de las órdenes de insumos del Taller (ADR-0362, fase 7, actividad 1) — migraciones
 * `20261013035000_ordenes_insumo_esquema.sql` (el módulo `ordenes_insumos`, el correlativo y las tablas `ordenes_insumo`,
 * `orden_insumo_items` y `orden_insumo_versiones`) y `20261013040000_ordenes_insumo_funciones.sql` (crear, editar, anular, la lista y el
 * detalle). Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md. CAYLA V2.
 *
 * LO QUE VIGILA. Que la orden del Taller sea la orden de tienda «con insumos» y no se mezcle con ella (decisiones 25, 28 y 47): sus
 * propios proveedores, su correlativo OI-, el Taller como destino y la línea «insumo + cantidad en su unidad». Que no pueda quedar en un
 * estado imposible (un descuento mayor que el importe, un % que no cuadra, una anulación sin motivo, un número repetido, una línea sin
 * unidad); que solo quien tiene el módulo la vea —con sus precios— y que nazca solo para el líder; que un doble clic, una señal que se
 * corta o dos personas a la vez no dejen dos órdenes ni pisen un cambio; y que siempre diga quién la hizo (decisión 39, extendida).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos migraciones se cargan dentro de cada caso: así se prueba que se pueden
 * pegar otra vez y corre igual con la base al día o sin ella).
 *   M  EL MÓDULO: en Producción, orden 205, delegable, no «solo líder»; nace SIN rol y lo ve solo el líder (ni Integrante ni las terminales).
 *   P  PUERTAS: sin el módulo ninguna de las seis responde (42501); con él, una integrante ve la lista y el detalle con precios
 *      (decisión 47); nadie toca las tablas directo (sin permisos, RLS sin políticas).
 *   S  LA FORMA: las seis de la web son security definer con su search_path, `authenticated` sí y `anon` no; las internas, cerradas; cada
 *      una que guarda pregunta UNA vez por el actor (la regla de `actor_firma_las_operaciones.mjs`) y ninguna mira `auth.uid()`.
 *   C  CANDADOS DEL ESQUEMA: descuento mayor que el importe, % que no cuadra (sobre el importe redondeado), cantidad 0, posición repetida,
 *      unidad vacía; cabecera anulada sin motivo, con datos de anulación sin anular, entrega antes de la emisión, estado raro, número
 *      repetido, sin destino; la versión sube sola; el archivo no se edita ni se borra.
 *   CR CREAR: el número que anunciaba la vista previa (OI-…); la unidad copiada del insumo; en la cantidad tres decimales entran, cuatro
 *      no; el precio lleva hasta cuatro, como los comprobantes y los lotes del Taller (mil botones a S/ 0.0350 = S/ 35.00), y cinco no; el %
 *      se vuelve soles sobre el importe redondeado a céntimos; el mismo id con el mismo pedido es la misma orden (doble clic) y con otro avisa `orden_insumo_ya_guardada`; cada
 *      regla rechaza con su motivo SIN gastar número (proveedor de tienda o inactivo, destino que no es un taller activo, insumo archivado…);
 *      la firma: una persona con «orden_insumo_crear» firma ella, una terminal no crea sin elegir a alguien y, si elige, firma el responsable.
 *   D  VER: el detalle (cabecera, quién, líneas con nombre, código, tipo y unidad, cantidades por unidad, total, versiones; NULL si no
 *      existe) y la lista (orden, sumas por unidad, filtros por estado y proveedor, búsqueda por número, proveedor o insumo, páginas).
 *   E  EDITAR: cambia y archiva lo de antes con precios; versión vieja → PT409 con la frase que dice qué pasó; doble clic sin choque; sin
 *      cambios no escribe; una anulada no se edita; lo que no se tocó no se vuelve a juzgar; las reglas de crear; la unidad del día al
 *      editar (provisional); la firma; Actividad sin montos.
 *   A  ANULAR: con quién, cuándo y por qué; el número no se libera; motivo obligatorio; PT409; doble clic; la firma.
 *   2S DOS SESIONES A LA VEZ: (1) editan la misma orden: una gana y la otra espera y lee «Otra persona cambió…»; (2) crean con el mismo id:
 *      queda una sola orden. Hacen COMMIT de una orden de prueba y la borran al terminar (deshacen lo suyo), así que NO corren contra la base
 *      local compartida: solo en el CI (cada tanda tiene su base) o con `--contenedor` de un banco propio.
 *
 * USO
 *   node scripts/pruebas/ordenes_insumo.mjs                                  → contra el stack local compartido (sin los casos 2S)
 *   node scripts/pruebas/ordenes_insumo.mjs --contenedor supabase_db_x       → contra otro stack (un banco de pruebas propio), con 2S
 *   node scripts/pruebas/ordenes_insumo.mjs --base otra                      → contra otra base del mismo contenedor
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const COMPARTIDO = "supabase_db_cayla-retail";
const CONTENEDOR = arg("--contenedor", COMPARTIDO);
const BASE = arg("--base", "postgres");
// Los casos de dos sesiones hacen COMMIT (y lo deshacen al final): nunca en la base local compartida, donde trabajan otras sesiones.
const DOS_SESIONES = Boolean(process.env.CI) || CONTENEDOR !== COMPARTIDO || process.argv.includes("--dos-sesiones");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(
  ["20261013035000_ordenes_insumo_esquema.sql", "20261013040000_ordenes_insumo_funciones.sql"]
    .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
    .join("\n"),
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo, no es Admin (seed)
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder y Admin (seed)
// Terminales y una responsable de prueba (se crean dentro de cada caso y se van con el ROLLBACK).
const T_VENTAS = "33333333-3333-4333-8333-0000000000d1";
const T_ADMIN = "33333333-3333-4333-8333-0000000000d2";
const ROSA = "33333333-3333-4333-8333-0000000000d3";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;

// Envolturas que nunca abortan el caso: devuelven «OK:…» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
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
-- «sqlstate|hint» de lo que devolvió una envoltura.
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create function pg_temp.crea(p_id uuid, p_prov uuid, p_dest uuid, p_ent date, p_nota text, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_num integer;
begin
  for v_num in select r.numero from retail.crear_orden_insumo(p_id, p_prov, p_dest, p_ent, p_nota, p_lineas) r loop
    return 'OK:' || v_num;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.edita(p_id uuid, p_version integer, p_prov uuid, p_dest uuid, p_ent date, p_nota text, p_lineas jsonb) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.numero, r.version from retail.editar_orden_insumo(p_id, p_version, p_prov, p_dest, p_ent, p_nota, p_lineas) r loop
    return 'OK:' || v_fila.numero || ':' || v_fila.version;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula(p_id uuid, p_version integer, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.numero, r.version from retail.anular_orden_insumo(p_id, p_version, p_motivo) r loop
    return 'OK:' || v_fila.version;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
-- Datos propios: dos proveedores del Taller (uno con tilde, para buscar sin ella), uno de TIENDA (no sirve aquí), dos insumos (tela en
-- metros, hilo en conos) y uno archivado.
insert into retail.proveedores_produccion (nombre, rubro) values ('Telas Peña OI Prueba', 'tela') returning id as prov \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Avíos Norte OI Prueba', 'avios') returning id as prov2 \\gset
insert into retail.proveedores (nombre) values ('Tienda OI Prueba') returning id as prov_tienda \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('OIP-LINO', 'Lino Crudo OI Prueba', 'tela', 'metro') returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('OIP-HILO', 'Hilo Algodón OI Prueba', 'avio', 'cono') returning id as hilo \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, archivado_at) values ('OIP-VIEJO', 'Botón Viejo OI Prueba', 'avio', 'unidad', now())
  returning id as viejo \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
-- Como en producción (20260923160000): el responsable obligatorio encendido. Sin él, una persona firmaría igual sin combo y las pruebas
-- de «orden_insumo_*» no probarían nada.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
${como(FELIPE)}
`;

// Una línea para `p_lineas`, con los números como TEXTO, igual que los manda la pantalla. «@lino» → el id de la variable psql `lino`.
const linea = (o) =>
  JSON.stringify({ insumo_id: "@lino", cantidad: "1", precio_unitario: "10.00", ...o }).replace(/"@([a-z_0-9]+)"/g, `"' || :'$1' || '"`);
const lineas = (...ls) => `('[' || ${ls.map((l) => `'${linea(l)}'`).join(" || ',' || ")} || ']')::jsonb`;
// Los argumentos de crear_orden_insumo con lo de siempre (proveedor del Taller, al Taller, sin entrega ni nota, una línea).
const args = ({ id = "gen_random_uuid()", prov = ":'prov'", destino = ":'taller'", entrega = "null::date", nota = "null::text", ls = lineas({}) } = {}) =>
  `${id}, ${prov}, ${destino}, ${entrega}, ${nota}, ${ls}`;
const crea = (o) => `pg_temp.crea(${args(o)})`;
const si = (cond, a, b) => `case when ${cond} then '${a}' else '${b}' end`;

// Las terminales de Trujillo (ventas y administrativa), SIN el módulo en su rol salvo que se pida.
const TERMINALES = ({ conModulo = false } = {}) => `
reset role;
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS}', 'authenticated', 'authenticated', 'oi-terminal-ventas@prueba.local'),
  ('${T_ADMIN}', 'authenticated', 'authenticated', 'oi-terminal-admin@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'tru', 'Terminal Ventas OI Prueba', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}') returning id as t_ventas \\gset
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'tru', 'Terminal Admin OI Prueba', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ADMIN}') returning id as t_admin \\gset
${conModulo ? "insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'ordenes_insumos') on conflict do nothing;" : ""}
`;
// Rosa: integrante de Trujillo sin cuenta, que marcó su entrada hace un segundo (la responsable que se elige en el combo de una terminal).
const ROSA_PRESENTE = `
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba OI', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
`;
const MICAELA_CON_MODULO = `
reset role;
insert into retail.rol_modulos (rol_id, modulo)
  select c.rol_id, 'ordenes_insumos' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
`;

// Tres órdenes, en este orden: O1 (Telas Peña: 10.5 m de lino a 25.50 y 4 conos de hilo a 100 con 10 %), O2 (Avíos Norte: 3 m de lino a
// 50) y O3 (Telas Peña, anulada, sin líneas). Totales: O1 = 267.75 + (400 − 40) = 627.75; O2 = 150.00.
const TRES_ORDENES = `
insert into retail.ordenes_insumo (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'taller', :'felipe_p')
  returning id as o1, numero as n1 \\gset
insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, descripcion, cantidad, unidad_medida, precio_unitario) values
  (:'o1', 1, :'lino', 'Lino para la colección', 10.5, 'metro', 25.50);
insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario, descuento, descuento_pct) values
  (:'o1', 2, :'hilo', 4, 'cono', 100, 40, 10);
insert into retail.ordenes_insumo (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', :'taller', :'felipe_p')
  returning id as o2, numero as n2 \\gset
insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario) values
  (:'o2', 1, :'lino', 3, 'metro', 50);
insert into retail.ordenes_insumo (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'taller', :'felipe_p', 'anulada', :'felipe_p', now(), 'Se pidió dos veces') returning id as o3, numero as n3 \\gset
`;
// Solo las órdenes de esta prueba (la base puede tener otras), como «O3,O2,O1» en el orden en que vienen.
const MIAS = (llamada) => `(select string_agg(case f.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' end, ',')
  from ${llamada} f where f.id in (:'o1', :'o2', :'o3'))`;

// Una orden recién creada por Felipe para editar o anular: al Taller, con nota, dos líneas (10.5 m de lino a 25.50 y 4 conos de hilo a 100
// con 10 %): S/ 627.75. `v` es su versión (1).
const L1 = { insumo_id: "@lino", cantidad: "10.5", precio_unitario: "25.50" };
const L2 = { insumo_id: "@hilo", cantidad: "4", precio_unitario: "100", descuento_pct: "10" };
const UNA_ORDEN = `
select id as oc, numero as n from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, 'Nota inicial', ${lineas(L1, L2)}) \\gset
select version as v from retail.ordenes_insumo where id = :'oc' \\gset
`;
const argsE = ({ version = ":'v'", prov = ":'prov'", destino = ":'taller'", entrega = "null::date", nota = "'Nota inicial'", ls = lineas(L1, L2) } = {}) =>
  `:'oc', ${version}, ${prov}, ${destino}, ${entrega}, ${nota}, ${ls}`;
const edita = (o) => `pg_temp.edita(${argsE(o)})`;
const anula = (version = ":'v'", motivo = "'El proveedor no tenía el lino'") => `pg_temp.anula(:'oc', ${version}, ${motivo})`;
const enActividad = (accion) =>
  `(select count(*) from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = '${accion}')`;
const descripcionActividad = (accion) => `(select replace(a.descripcion, retail.fn_orden_insumo_numero_texto(:'n'::int), 'OI-N') from retail.actividad a
  where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = '${accion}')`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// M. EL MÓDULO ------------------------------------------------------------------------------------------------------------------
caso(
  "M1 el módulo está en Producción (orden 205, delegable, no «solo líder», no del Admin) y nace SIN rol ni oculto al líder",
  `reset role;
   select concat_ws(',',
     (select grupo || ':' || nombre || ':' || orden || ':' || delegable || ':' || solo_lider || ':' || del_admin
        from retail.modulos where clave = 'ordenes_insumos'),
     (select count(*) from retail.rol_modulos where modulo = 'ordenes_insumos'),
     (select count(*) from retail.lider_modulos_ocultos where modulo = 'ordenes_insumos'));`,
  "Producción:Órdenes de insumos:205:true:false:false,0,0"
);
caso(
  "M2 las dos migraciones se vuelven a cargar sin error (idempotentes) y no duplican el módulo ni las tres claves de la firma",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select (select count(*) from retail.modulos where clave = 'ordenes_insumos') || ',' ||
          (select string_agg(clave, '+' order by clave) from retail.acciones_sin_responsable where clave like 'orden_insumo_%');`,
  "1,orden_insumo_anular+orden_insumo_crear+orden_insumo_editar"
);
caso(
  "M3 lo ve solo el líder: Felipe sí; Micaela (Integrante) y las dos terminales, no — hasta que el líder se lo dé en Roles y accesos",
  `${TERMINALES()}
   ${como(FELIPE)}select retail.fn_ve_modulo('ordenes_insumos')::text as felipe \\gset
   ${como(MICAELA)}select retail.fn_ve_modulo('ordenes_insumos')::text as micaela \\gset
   ${como(T_VENTAS)}select retail.fn_ve_modulo('ordenes_insumos')::text as tv \\gset
   ${como(T_ADMIN)}select retail.fn_ve_modulo('ordenes_insumos')::text as ta \\gset
   select :'felipe' || ',' || :'micaela' || ',' || :'tv' || ',' || :'ta';`,
  "true,false,false,false"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin el módulo ninguna de las seis responde (42501 / ordenes_insumos_sin_modulo), aunque mande la clave de la firma",
  `${UNA_ORDEN}
   ${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_crear" })}
   select concat_ws(',',
     pg_temp.eh(pg_temp.intento('select * from retail.fn_ordenes_insumo()')),
     pg_temp.eh(pg_temp.intento(format('select retail.fn_orden_insumo(%L)', :'oc'))),
     pg_temp.eh(pg_temp.intento('select retail.fn_ordenes_insumo_siguiente()')),
     pg_temp.eh(${crea()}),
     pg_temp.eh(${edita({ nota: "'x'" })}),
     pg_temp.eh(${anula()}));`,
  Array(6).fill("42501|ordenes_insumos_sin_modulo").join(",")
);
caso(
  "P2 con el módulo en su rol, una integrante (no líder) ve la lista y el detalle CON precios (decisión 47)",
  `${TRES_ORDENES}
   ${MICAELA_CON_MODULO}
   ${como(MICAELA)}
   select concat_ws(' / ', ${MIAS("retail.fn_ordenes_insumo()")},
     (select total from retail.fn_ordenes_insumo() where id = :'o1'),
     (select string_agg(l ->> 'precio_unitario', '+') from jsonb_array_elements(retail.fn_orden_insumo(:'o1') -> 'lineas') l),
     retail.fn_orden_insumo(:'o1') ->> 'total');`,
  "O3,O2,O1 / 627.75 / 25.5000+100.0000 / 627.75"
);
caso(
  "P3 nadie toca las tablas directo: ni anon ni authenticated tienen permisos, las tres con RLS encendido y sin políticas",
  `reset role;
   select concat_ws(',',
     (select bool_or(has_table_privilege(r, t, p))
        from unnest(array['anon', 'authenticated']) r,
             unnest(array['retail.ordenes_insumo', 'retail.orden_insumo_items', 'retail.orden_insumo_versiones']) t,
             unnest(array['select', 'insert', 'update', 'delete']) p),
     (select bool_and(c.relrowsecurity) from pg_class c
       where c.oid in ('retail.ordenes_insumo'::regclass, 'retail.orden_insumo_items'::regclass, 'retail.orden_insumo_versiones'::regclass)),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('ordenes_insumo', 'orden_insumo_items', 'orden_insumo_versiones')),
     has_sequence_privilege('authenticated', 'retail.ordenes_insumo_numero_seq', 'usage'));`,
  // `concat_ws` escribe un booleano como t/f.
  "f,t,0,f"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
const PUBLICAS = ["fn_ordenes_insumo_siguiente", "crear_orden_insumo", "editar_orden_insumo", "anular_orden_insumo", "fn_ordenes_insumo", "fn_orden_insumo"];
const INTERNAS = [
  "fn_orden_insumo_numero_texto", "fn_orden_insumo_descuento", "fn_orden_insumo_foto", "fn_orden_insumo_validar", "fn_orden_insumo_huella",
  "fn_orden_insumo_huella_guardada", "fn_orden_insumo_escribir_lineas", "fn_orden_insumo_sede_actividad", "fn_orden_insumo_exigir_mismo_pedido",
  "fn_orden_insumo_version", "fn_orden_insumo_versiones_inmutable",
];
const DE = (lista) => `from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = any(array[${lista.map((f) => `'${f}'`).join(", ")}])`;
caso(
  "S1 la forma: las 6 de la web son security definer con search_path (una versión cada una), authenticated sí y anon no; las 11 internas, cerradas",
  `reset role;
   select concat_ws(',',
     (select count(*) ${DE(PUBLICAS)}),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') ${DE(PUBLICAS)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select count(*) ${DE(INTERNAS)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE(INTERNAS)}),
     (select bool_and(array_to_string(p.proconfig, ',') like '%search_path%') ${DE(INTERNAS)}));`,
  "6,t,t,f,11,f,t"
);
caso(
  "S2 la firma: las tres que guardan preguntan UNA vez por el actor de tienda (true), ninguna con (false) ni mirando auth.uid() (reglas de actor_firma)",
  `reset role;
   select concat_ws(',',
     (select string_agg(x.proname || ':' || x.veces, ' ' order by x.proname) from (
        select p.proname, (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'fn_actor_persona_id(', '')))
                          / length('fn_actor_persona_id(') as veces
          ${DE([...PUBLICAS, ...INTERNAS])}) x where x.veces > 0),
     (select count(*) ${DE([...PUBLICAS, ...INTERNAS])} and pg_get_functiondef(p.oid) ~ 'fn_actor_persona_id\\(true\\)'),
     (select count(*) ${DE([...PUBLICAS, ...INTERNAS])} and pg_get_functiondef(p.oid) ~ 'fn_actor_persona_id\\(false\\)'),
     (select count(*) ${DE([...PUBLICAS, ...INTERNAS])} and pg_get_functiondef(p.oid) ~* 'auth_user_id\\s*=\\s*auth\\.uid\\(\\)'));`,
  "anular_orden_insumo:1 crear_orden_insumo:1 editar_orden_insumo:1,3,0,0"
);

// C. CANDADOS DEL ESQUEMA -------------------------------------------------------------------------------------------------------
const lineaDirecta = (posicion, campos, valores) =>
  `pg_temp.intento(format('insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, ${campos}) values (%L, ${posicion}, %L, ${valores})', :'o2', :'lino'))`;
caso(
  "C1 lo imposible no se guarda en una línea: descuento mayor que el importe, % que no cuadra, cantidad 0, posición repetida, unidad vacía",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(${lineaDirecta(9, "cantidad, unidad_medida, precio_unitario, descuento", "2, ''metro'', 10, 20.01")}, '|', 1),
     split_part(${lineaDirecta(9, "cantidad, unidad_medida, precio_unitario, descuento, descuento_pct", "1, ''metro'', 100, 5, 10")}, '|', 1),
     split_part(${lineaDirecta(9, "cantidad, unidad_medida, precio_unitario", "0, ''metro'', 10")}, '|', 1),
     split_part(${lineaDirecta(1, "cantidad, unidad_medida, precio_unitario", "1, ''metro'', 10")}, '|', 1),
     split_part(${lineaDirecta(9, "cantidad, unidad_medida, precio_unitario", "1, ''  '', 10")}, '|', 1));`,
  "23514,23514,23514,23505,23514"
);
caso(
  "C1b el importe de una línea con decimales es cantidad × precio redondeado a céntimos, y el % se cuenta sobre ESE importe (0.125 × 1.00 = 0.13; 50 % = 0.07, no 0.06)",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(${lineaDirecta(8, "cantidad, unidad_medida, precio_unitario, descuento, descuento_pct", "0.125, ''metro'', 1, 0.06, 50")}, '|', 1),
     split_part(${lineaDirecta(8, "cantidad, unidad_medida, precio_unitario, descuento, descuento_pct", "0.125, ''metro'', 1, 0.07, 50")}, '|', 1),
     split_part(${lineaDirecta(9, "cantidad, unidad_medida, precio_unitario, descuento, descuento_pct", "2.5, ''metro'', 13.33, 3.33, 10")}, '|', 1))
     as escritas \\gset
   -- En otra sentencia: la de arriba no ve lo que insertaron sus propias llamadas.
   select :'escritas' || ',' ||
     (select string_agg(i.subtotal::text, '+' order by i.posicion) from retail.orden_insumo_items i where i.orden_insumo_id = :'o2' and i.posicion > 1);`,
  "23514,SIN_ERROR,SIN_ERROR,0.06+30.00"
);
caso(
  "C2 la cabecera tampoco: anulada sin motivo, generada con datos de anulación, entrega antes de la emisión, estado raro, número repetido, sin destino",
  `${TRES_ORDENES}
   reset role;
   select concat_ws(',',
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set estado = %L, anulada_por = %L, anulada_en = now() where id = %L', 'anulada', :'felipe_p', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set anulada_en = now() where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set fecha_entrega_estimada = fecha_emision - 1 where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set estado = %L where id = %L', 'perdida', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set numero = %s where id = %L', :'n2', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set ubicacion_destino_id = null where id = %L', :'o1')), '|', 1),
     split_part(pg_temp.intento(format('update retail.ordenes_insumo set fecha_entrega_estimada = fecha_emision where id = %L', :'o1')), '|', 1));`,
  "23514,23514,23514,23514,23505,23502,SIN_ERROR"
);
caso(
  "C3 la versión sube sola en cada escritura y no se fija a mano; el archivo de versiones no se edita ni se borra",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Para archivar'" })} \\g /dev/null
   reset role;
   update retail.ordenes_insumo set version = 999, nota = 'directo' where id = :'oc';
   update retail.ordenes_insumo set nota = 'otra vez' where id = :'oc';
   select concat_ws(',', (select version from retail.ordenes_insumo where id = :'oc'),
     split_part(pg_temp.intento(format('update retail.orden_insumo_versiones set datos = %L where orden_insumo_id = %L', '{}', :'oc')), '|', 1),
     split_part(pg_temp.intento(format('delete from retail.orden_insumo_versiones where orden_insumo_id = %L', :'oc')), '|', 1),
     (select count(*) from retail.orden_insumo_versiones where orden_insumo_id = :'oc'));`,
  "4,42501,42501,1"
);

// CR. CREAR -----------------------------------------------------------------------------------------------------------------------
caso(
  "CR1 guarda con el número que anunciaba la vista previa (OI-…); copia la unidad de cada insumo; tres decimales entran; el % se vuelve soles sobre el importe redondeado",
  `select retail.fn_ordenes_insumo_siguiente() as antes \\gset
   select id as oc, numero as num from retail.crear_orden_insumo(${args({
     entrega: "retail.fn_hoy_lima() + 3",
     nota: "'Llega en rollo'",
     ls: lineas(
       { descripcion: "Lino crudo de 1.50 m de ancho", cantidad: "12.505", precio_unitario: "13.33", descuento_pct: "10" },
       { insumo_id: "@hilo", cantidad: "4", precio_unitario: "5.50", descuento: "1.50" },
       { cantidad: "0.125", precio_unitario: "1", descuento_pct: "50" },
       { insumo_id: "@hilo", cantidad: "99999.999", precio_unitario: "0" }
     ),
   })}) \\gset
   reset role;
   select concat_ws(' / ',
     ${si(":'num'::int = :'antes'::int", "numero anunciado", "otro numero")},
     ${si("retail.fn_orden_insumo_numero_texto(:'num'::int) = 'OI-' || lpad(:'num', 6, '0')", "OI-", "sin prefijo")},
     (select o.estado || ':' || u.tipo || ':' || (o.fecha_entrega_estimada - o.fecha_emision) || ':' || o.nota || ':'
             || ${si("o.creada_por = :'felipe_p'", "felipe", "otra")} || ':' || o.version
        from retail.ordenes_insumo o join retail.ubicaciones u on u.id = o.ubicacion_destino_id where o.id = :'oc'),
     (select string_agg(i.posicion || ':' || i.cantidad || ' ' || i.unidad_medida || ' x ' || i.precio_unitario || '-' || i.descuento
                        || coalesce('(' || i.descuento_pct::numeric(7, 2) || '%)', '') || '=' || i.subtotal, ' ' order by i.posicion)
        from retail.orden_insumo_items i where i.orden_insumo_id = :'oc'),
     (select f.total || ' ' || f.cantidades::text from retail.fn_ordenes_insumo() f where f.id = :'oc'));`,
  "numero anunciado / OI- / generada:taller:3:Llega en rollo:felipe:1 / " +
    "1:12.505 metro x 13.3300-16.67(10.00%)=150.02 2:4.000 cono x 5.5000-1.50=20.50 3:0.125 metro x 1.0000-0.07(50.00%)=0.06 4:99999.999 cono x 0.0000-0.00=0.00 / " +
    '170.58 {"cono": 100003.999, "metro": 12.630}'
);
caso(
  "CR2 el mismo p_id dos veces con el MISMO pedido (doble clic, reintento) devuelve la misma orden: una sola, con su línea, y un solo número gastado",
  `select gen_random_uuid() as pid \\gset
   select id as a, numero as na from retail.crear_orden_insumo(${args({ id: ":'pid'", ls: lineas({ cantidad: "2.5" }) })}) \\gset
   select id as b, numero as nb from retail.crear_orden_insumo(${args({ id: ":'pid'", nota: "'  '", ls: lineas({ cantidad: "2.500", precio_unitario: "10" }) })}) \\gset
   reset role;
   select concat_ws(',', ${si(":'a' = :'b' and :'na' = :'nb'", "misma", "otra")},
     (select count(*) from retail.ordenes_insumo where id = :'pid'),
     (select string_agg(cantidad::text, '+') from retail.orden_insumo_items where orden_insumo_id = :'pid'),
     ${si("retail.fn_ordenes_insumo_siguiente() = :'na'::int + 1", "un numero", "gasto de mas")});`,
  "misma,1,2.500,un numero"
);
caso(
  "CR2b el mismo p_id con OTRO pedido (la señal se cortó después de guardar y se corrigió algo): avisa que ya se guardó como OI-… con lo de antes y no cambia nada",
  `select gen_random_uuid() as pid \\gset
   select numero as na from retail.crear_orden_insumo(${args({ id: ":'pid'" })}) \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ cantidad: "99" }) })} as cantidad \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ insumo_id: "@hilo" }) })} as insumo \\gset
   reset role;
   select concat_ws(',', split_part(:'cantidad', '|', 2), split_part(:'insumo', '|', 2),
     ${si(`split_part(:'cantidad', '|', 3) = 'Esta orden ya se guardó como ' || retail.fn_orden_insumo_numero_texto(:'na'::int) || ' con lo que tenía antes de tu cambio. Ábrela y corrígela ahí.'`, "dice el numero", "mensaje raro")},
     (select count(*) from retail.ordenes_insumo where id = :'pid'),
     (select string_agg(cantidad::text || ' ' || unidad_medida, '+') from retail.orden_insumo_items where orden_insumo_id = :'pid'),
     ${si("retail.fn_ordenes_insumo_siguiente() = :'na'::int + 1", "un numero", "gasto de mas")});`,
  "orden_insumo_ya_guardada,orden_insumo_ya_guardada,dice el numero,1,1.000 metro,un numero"
);
caso(
  "CR3 cada regla rechaza con su motivo y SIN gastar número: proveedor (vacío, inactivo, de tienda), destino (vacío, una tienda, un taller inactivo), entrega, nota y líneas",
  `reset role;
   insert into retail.proveedores_produccion (nombre, rubro, activo) values ('Inactivo OI Prueba', 'tela', false) returning id as prov_off \\gset
   insert into retail.ubicaciones (nombre, tipo, activo) values ('Taller Cerrado OI Prueba', 'taller', false) returning id as taller_off \\gset
   ${como(FELIPE)}
   select retail.fn_ordenes_insumo_siguiente() as antes \\gset
   select concat_ws(',',
     split_part(${crea({ prov: "null::uuid" })}, '|', 2),
     split_part(${crea({ prov: ":'prov_off'" })}, '|', 2),
     split_part(${crea({ prov: ":'prov_tienda'" })}, '|', 2),
     split_part(${crea({ destino: "null::uuid" })}, '|', 2),
     split_part(${crea({ destino: ":'tru'" })}, '|', 2),
     split_part(${crea({ destino: ":'taller_off'" })}, '|', 2),
     split_part(${crea({ entrega: "retail.fn_hoy_lima() - 1" })}, '|', 2),
     split_part(${crea({ entrega: "retail.fn_hoy_lima() + 400" })}, '|', 2),
     split_part(${crea({ nota: "repeat('a', 501)" })}, '|', 2),
     split_part(${crea({ ls: "'[]'::jsonb" })}, '|', 2),
     split_part(${crea({ ls: "'{}'::jsonb" })}, '|', 2),
     split_part(${crea({ ls: `(select jsonb_agg(jsonb_build_object('insumo_id', :'lino', 'cantidad', '1', 'precio_unitario', '1')) from generate_series(1, 101))` })}, '|', 2),
     ${si("retail.fn_ordenes_insumo_siguiente() = :'antes'::int", "sin gastar", "gasto numeros")});`,
  [
    "orden_insumo_proveedor", "orden_insumo_proveedor", "orden_insumo_proveedor", "orden_insumo_destino", "orden_insumo_destino",
    "orden_insumo_destino", "orden_insumo_entrega", "orden_insumo_entrega", "orden_insumo_nota", "orden_insumo_sin_lineas",
    "orden_insumo_sin_lineas", "orden_insumo_muchas_lineas", "sin gastar",
  ].join(",")
);
caso(
  "CR4 cada regla de una línea rechaza con su motivo y SIN gastar número: insumo (vacío, archivado, que no existe), cantidad (4 decimales, 0, negativa, de más, NaN), precio (5 decimales, letras) y descuento",
  `select retail.fn_ordenes_insumo_siguiente() as antes \\gset
   select concat_ws(',',
     split_part(${crea({ ls: lineas({ insumo_id: "" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ insumo_id: "@viejo" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ insumo_id: "00000000-0000-4000-8000-000000000000" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ insumo_id: "no-es-un-id" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ descripcion: "x".repeat(201) }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "1.2345" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "0" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "-1" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "100000" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "NaN" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ precio_unitario: "10.55555" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ precio_unitario: "diez" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ cantidad: "2", precio_unitario: "10", descuento: "20.01" }) })}, '|', 2),
     split_part(${crea({ ls: lineas({ descuento_pct: "101" }) })}, '|', 2),
     ${si("retail.fn_ordenes_insumo_siguiente() = :'antes'::int", "sin gastar", "gasto numeros")});`,
  [
    "orden_insumo_insumo", "orden_insumo_insumo", "orden_insumo_insumo", "orden_insumo_linea", "orden_insumo_descripcion",
    "orden_insumo_cantidad", "orden_insumo_cantidad", "orden_insumo_cantidad", "orden_insumo_cantidad", "orden_insumo_cantidad",
    "orden_insumo_precio", "orden_insumo_linea", "orden_insumo_descuento", "orden_insumo_descuento", "sin gastar",
  ].join(",")
);
caso(
  "CR5 la cantidad dice su unidad al rechazarse (metros, conos) y los extremos entran: 0.001 metros, y 99 999.999 conos a S/ 99 999.9999",
  `select concat_ws(' / ',
     split_part(${crea({ ls: lineas({ cantidad: "0.0005" }) })}, '|', 3),
     split_part(${crea({ ls: lineas({ insumo_id: "@hilo", cantidad: "1.2345" }) })}, '|', 3),
     split_part(${crea({ ls: lineas({ cantidad: "0.001" }, { insumo_id: "@hilo", cantidad: "99999.999", precio_unitario: "99999.9999" }) })}, ':', 1));`,
  "La cantidad de la línea 1 va de 0.001 a 99 999.999 metros, con hasta tres decimales / " +
    "La cantidad de la línea 1 va de 0.001 a 99 999.999 conos, con hasta tres decimales / OK"
);
caso(
  "CR5b el precio lleva hasta 4 decimales, como los comprobantes y los lotes del Taller: 1000 botones a S/ 0.0350 son S/ 35.00 (no S/ 40.00); " +
    "el reintento con «0.035» es el mismo pedido; con 5 decimales se rechaza y lo dice",
  `reset role;
   insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('OIP-BOTON', 'Botón Nácar OI Prueba', 'avio', 'unidad') returning id as boton \\gset
   ${como(FELIPE)}
   select gen_random_uuid() as pid \\gset
   select id as oc, numero as na from retail.crear_orden_insumo(${args({ id: ":'pid'", ls: lineas({ insumo_id: "@boton", cantidad: "1000", precio_unitario: "0.0350" }) })}) \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ insumo_id: "@boton", cantidad: "1000.000", precio_unitario: "0.035" }) })} as reintento \\gset
   select ${crea({ ls: lineas({ insumo_id: "@boton", cantidad: "1000", precio_unitario: "0.03505" }) })} as cinco \\gset
   reset role;
   select concat_ws(' / ',
     (select i.cantidad || ' ' || i.unidad_medida || ' x ' || i.precio_unitario || ' = ' || i.subtotal from retail.orden_insumo_items i where i.orden_insumo_id = :'oc'),
     (select f.total from retail.fn_ordenes_insumo() f where f.id = :'oc'),
     retail.fn_orden_insumo(:'oc') -> 'lineas' -> 0 ->> 'precio_unitario',
     ${si(":'reintento' = 'OK:' || :'na'", "mismo pedido", "otro")},
     split_part(:'cinco', '|', 2) || ':' || split_part(:'cinco', '|', 3));`,
  "1000.000 unidad x 0.0350 = 35.00 / 35.00 / 0.0350 / mismo pedido / " +
    "orden_insumo_precio:El precio de la línea 1 va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales"
);
caso(
  "CR5c el descuento en % sobre un importe con precio de 4 decimales cuadra con el candado: 12.5 m a S/ 13.3333 = S/ 166.67 y el 15 % es S/ 25.00 " +
    "(no 25.0005); el candado rechaza 25.01 con el 15 % y un descuento mayor que el importe redondeado",
  `select id as oc from retail.crear_orden_insumo(${args({ ls: lineas({ cantidad: "12.5", precio_unitario: "13.3333", descuento_pct: "15" }) })}) \\gset
   reset role;
   select concat_ws(',',
     split_part(pg_temp.intento(format('insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario, descuento, descuento_pct) values (%L, 2, %L, 12.5, ''metro'', 13.3333, 25.01, 15)', :'oc', :'lino')), '|', 1),
     split_part(pg_temp.intento(format('insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario, descuento) values (%L, 3, %L, 12.5, ''metro'', 13.3333, 166.68)', :'oc', :'lino')), '|', 1))
     as candados \\gset
   select :'candados' || ' / ' ||
     (select i.cantidad || ' x ' || i.precio_unitario || ' = ' || round(i.cantidad * i.precio_unitario, 2) || ' - ' || i.descuento
             || ' (' || i.descuento_pct::numeric(7, 2) || '%) = ' || i.subtotal
        from retail.orden_insumo_items i where i.orden_insumo_id = :'oc' and i.posicion = 1);`,
  "23514,23514 / 12.500 x 13.3333 = 166.67 - 25.00 (15.00%) = 141.67"
);
caso(
  "CR6 una persona que no es Admin, con el responsable obligatorio encendido: sin la clave le pide el combo; con «orden_insumo_crear» firma ella",
  `${MICAELA_CON_MODULO}
   ${como(MICAELA)}
   select ${crea()} as sin_clave \\gset
   ${encabezados({ "x-responsable-omitido": "orden_insumo_crear" })}
   select id as oc from retail.crear_orden_insumo(${args()}) \\gset
   reset role;
   select split_part(:'sin_clave', '|', 2) || ',' ||
     (select ${si("creada_por = :'micaela_p'", "micaela", "otra")} from retail.ordenes_insumo where id = :'oc');`,
  "responsable_requerido,micaela"
);
caso(
  "CR7 una terminal no crea una orden sin elegir a alguien: ni mandando la clave (la base no deja una orden sin autor) ni sin nada",
  `${TERMINALES({ conModulo: true })}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_crear" })}
   select ${crea()} as con_clave \\gset
   ${encabezados({})}
   select ${crea()} as sin_nada \\gset
   select pg_temp.eh(:'con_clave') || ',' || split_part(:'sin_nada', '|', 2);`,
  "42501|responsable_requerido,responsable_requerido"
);
caso(
  "CR8 desde una terminal con la responsable elegida y presente, firma ELLA: la orden y su línea de Actividad (con la terminal, la sede y el Taller)",
  `${TERMINALES({ conModulo: true })}
   ${ROSA_PRESENTE}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable": ROSA })}
   select id as oc from retail.crear_orden_insumo(${args()}) \\gset
   reset role;
   select concat_ws(',',
     (select ${si(`creada_por = '${ROSA}'`, "rosa", "otra")} from retail.ordenes_insumo where id = :'oc'),
     (select ${si(`a.persona_id = '${ROSA}' and a.terminal_id = :'t_ventas' and a.ubicacion_id = :'tru' and a.ubicacion_destino_id = :'taller'`, "actividad de rosa", "actividad rara")}
        from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = 'orden_insumo_creada'),
     retail.fn_orden_insumo(:'oc') ->> 'creada_por');`,
  "rosa,actividad de rosa,Rosa Prueba OI"
);
caso(
  "CR9 crear anota su línea en Actividad: quién, cuántas líneas y a dónde llega, SIN montos ni cantidades",
  `${UNA_ORDEN}
   reset role;
   select concat_ws(' / ', ${descripcionActividad("orden_insumo_creada")},
     (select ${si("a.persona_id = :'felipe_p' and a.ubicacion_destino_id = :'taller' and a.modulo = 'ordenes_insumos'", "firmada y con destino", "mal")}
        from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = 'orden_insumo_creada'),
     (select ${si("a.descripcion ~ 'S/|25[.]5|10[.]5' or a.detalle::text ~ '25[.]5|10[.]5'", "con montos", "sin montos")}
        from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = 'orden_insumo_creada'));`,
  "creó la OI-N para Telas Peña OI Prueba: 2 líneas · llega a Taller / firmada y con destino / sin montos"
);
caso(
  "CR9b el id de una orden AJENA no sirve para mirarla ni cambiarla: otra persona con el módulo que lo reusa recibe «Esa orden ya existe» y nada cambia",
  `select gen_random_uuid() as pid \\gset
   select numero as na from retail.crear_orden_insumo(${args({ id: ":'pid'" })}) \\gset
   ${como(SANDRA)}
   select ${crea({ id: ":'pid'" })} as ajena \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ cantidad: "50" }) })} as ajena_otra \\gset
   reset role;
   select concat_ws(',', pg_temp.eh(:'ajena'), pg_temp.eh(:'ajena_otra'),
     (select ${si("creada_por = :'felipe_p'", "felipe", "otra")} || ':' || numero from retail.ordenes_insumo where id = :'pid') = 'felipe:' || :'na',
     (select string_agg(cantidad::text, '+') from retail.orden_insumo_items where orden_insumo_id = :'pid'));`,
  "P0001|orden_insumo_ya_existe,P0001|orden_insumo_ya_existe,t,1.000"
);
caso(
  "CR10 sin el módulo no se crea ni se mira el número que sigue (42501); anon no ejecuta ninguna de las dos",
  `${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_crear" })}
   select split_part(${crea()}, '|', 1) || ',' || split_part(pg_temp.intento('select retail.fn_ordenes_insumo_siguiente()'), '|', 1) as micaela \\gset
   reset role;
   select :'micaela' || ',' ||
     has_function_privilege('anon', 'retail.crear_orden_insumo(uuid,uuid,uuid,date,text,jsonb)', 'execute') || ',' ||
     has_function_privilege('anon', 'retail.fn_ordenes_insumo_siguiente()', 'execute');`,
  "42501,42501,false,false"
);

// D. VER ----------------------------------------------------------------------------------------------------------------------------
caso(
  "D1 el detalle trae la cabecera, quién la creó, las líneas con nombre, código, tipo y unidad, las cantidades por unidad, el total y versiones vacías; NULL si no existe",
  `${TRES_ORDENES}
   select retail.fn_orden_insumo(:'o1') as d \\gset
   select concat_ws(' / ',
     (:'d'::jsonb ->> 'estado') || ':' || (:'d'::jsonb -> 'proveedor' ->> 'nombre') || ':' || (:'d'::jsonb -> 'proveedor' ->> 'rubro')
       || ':' || (:'d'::jsonb -> 'destino' ->> 'nombre') || ':' || ${si("(:'d'::jsonb ->> 'creada_por') like 'Felipe%'", "felipe", "otra")},
     (select string_agg((l ->> 'posicion') || ':' || (l ->> 'insumo') || ':' || (l ->> 'codigo') || ':' || (l ->> 'tipo') || ':'
                        || (l ->> 'cantidad') || ' ' || (l ->> 'unidad_medida') || '/' || (l ->> 'unidad_actual') || ':'
                        || (l ->> 'precio_unitario') || '-' || (l ->> 'descuento') || '=' || (l ->> 'subtotal'), ' ')
        from jsonb_array_elements(:'d'::jsonb -> 'lineas') l),
     (:'d'::jsonb -> 'cantidades')::text || ':' || (:'d'::jsonb ->> 'total') || ':' || (:'d'::jsonb -> 'versiones')::text,
     coalesce(retail.fn_orden_insumo(gen_random_uuid())::text, 'no existe'));`,
  "generada:Telas Peña OI Prueba:tela:Taller:felipe / " +
    "1:Lino Crudo OI Prueba:OIP-LINO:tela:10.500 metro/metro:25.5000-0.00=267.75 2:Hilo Algodón OI Prueba:OIP-HILO:avio:4.000 cono/cono:100.0000-40.00=360.00 / " +
    '{"cono": 4.000, "metro": 10.500}:627.75:[] / no existe'
);
caso(
  "D2 la lista va de la más nueva a la más vieja, con líneas, cantidades por unidad y total (el 10 % ya restado); una anulada sin líneas suma cero",
  `${TRES_ORDENES}
   select concat_ws(' / ', ${MIAS("retail.fn_ordenes_insumo()")},
     (select lineas || ':' || cantidades::text || ':' || total || ':' || estado || ':' || destino_nombre || ':' || proveedor_nombre || ':'
             || ${si("creada_por_nombre like 'Felipe%'", "felipe", "otra")}
        from retail.fn_ordenes_insumo() where id = :'o1'),
     (select lineas || ':' || cantidades::text || ':' || total from retail.fn_ordenes_insumo() where id = :'o2'),
     (select lineas || ':' || cantidades::text || ':' || total || ':' || estado from retail.fn_ordenes_insumo() where id = :'o3'));`,
  'O3,O2,O1 / 2:{"cono": 4.000, "metro": 10.500}:627.75:generada:Taller:Telas Peña OI Prueba:felipe / 1:{"metro": 3.000}:150.00 / 0:{}:0:anulada'
);
caso(
  "D3 filtra por estado y por proveedor; busca por número («OI-000012», «oi 12», «12»), por proveedor sin tildes ni mayúsculas y por insumo (nombre o código)",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     ${MIAS("retail.fn_ordenes_insumo(p_estado => 'generada')")},
     ${MIAS("retail.fn_ordenes_insumo(p_estado => 'anulada')")},
     ${MIAS("retail.fn_ordenes_insumo(p_proveedor_id => :'prov2')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => format('OI-%s', lpad(:'n2', 6, '0')))")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => format('oi %s', :'n2'))")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => :'n1')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'pena oi prueba')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'PEÑA OI PRUEBA')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'avios norte')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'lino crudo')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'oip-hilo')")},
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'algodon')")});`,
  "O2,O1 / O3 / O2 / O2 / O2 / O1 / O3,O1 / O3,O1 / O2 / O2,O1 / O1 / O1"
);
caso(
  "D4 pagina: de a 2 trae las dos más nuevas, y «antes de» la segunda trae la que sigue",
  `${TRES_ORDENES}
   select concat_ws(' / ',
     (select string_agg(case f.id when :'o1' then 'O1' when :'o2' then 'O2' when :'o3' then 'O3' else 'otra' end, ',')
        from retail.fn_ordenes_insumo(p_busqueda => 'oi prueba', p_limite => 2) f),
     ${MIAS("retail.fn_ordenes_insumo(p_busqueda => 'oi prueba', p_antes_de => :'n2')")});`,
  "O3,O2 / O1"
);
caso(
  "D5 sin el módulo, ni la lista ni el detalle (42501); anon no ejecuta ninguno",
  `${TRES_ORDENES}
   ${como(MICAELA)}
   select split_part(pg_temp.intento('select * from retail.fn_ordenes_insumo()'), '|', 1) || ',' ||
          split_part(pg_temp.intento(format('select retail.fn_orden_insumo(%L)', :'o1')), '|', 1) as micaela \\gset
   reset role;
   select :'micaela' || ',' ||
     has_function_privilege('anon', 'retail.fn_ordenes_insumo(text,uuid,text,integer,integer)', 'execute') || ',' ||
     has_function_privilege('anon', 'retail.fn_orden_insumo(uuid)', 'execute');`,
  "42501,42501,false,false"
);

// E. EDITAR -----------------------------------------------------------------------------------------------------------------------
caso(
  "E1 editar cambia cabecera y líneas, sube la versión, archiva lo de antes (con precios y unidades) y anota en Actividad sin montos",
  `${UNA_ORDEN}
   select ${edita({ entrega: "retail.fn_hoy_lima() + 5", nota: "'Nota nueva'", ls: lineas({ ...L1, cantidad: "12.25" }, L2, { insumo_id: "@hilo", cantidad: "2", precio_unitario: "30" }) })} as r \\gset
   reset role;
   select concat_ws(' / ',
     split_part(:'r', ':', 1) || ':' || split_part(:'r', ':', 3),
     (select version || ':' || (fecha_entrega_estimada - retail.fn_hoy_lima()) || ':' || nota || ':' || ${si("actualizada_por = :'felipe_p'", "felipe", "otra")}
        from retail.ordenes_insumo where id = :'oc'),
     (select string_agg(cantidad::text || ' ' || unidad_medida || ' x ' || precio_unitario, ' ' order by posicion) from retail.orden_insumo_items where orden_insumo_id = :'oc'),
     (select version || ':' || jsonb_array_length(datos -> 'lineas') || ':' || (datos ->> 'total') || ':' || (datos ->> 'nota') || ':'
             || (datos -> 'lineas' -> 0 ->> 'cantidad') || ' ' || (datos -> 'lineas' -> 0 ->> 'unidad_medida')
        from retail.orden_insumo_versiones where orden_insumo_id = :'oc'),
     (select jsonb_array_length(d -> 'versiones') || ':' || (d -> 'versiones' -> 0 ->> 'version') || ':'
             || ${si("(d -> 'versiones' -> 0 ->> 'reemplazada_por') like 'Felipe%'", "felipe", "otra")} || ':' || (d -> 'versiones' -> 0 -> 'datos' ->> 'total')
        from (select retail.fn_orden_insumo(:'oc') d) x),
     ${enActividad("orden_insumo_creada")} || '+' || ${enActividad("orden_insumo_editada")},
     ${descripcionActividad("orden_insumo_editada")},
     (select ${si("descripcion ~ 'S/|25[.]5|12[.]25' or detalle::text ~ '25[.]5|12[.]25'", "con montos", "sin montos")} from retail.actividad a
       where a.tabla = 'ordenes_insumo' and a.registro_id = :'oc' and a.accion = 'orden_insumo_editada'));`,
  (obtenido) => {
    const p = obtenido.split(" / ");
    return (
      p[0] === "OK:2" &&
      p[1] === "2:5:Nota nueva:felipe" &&
      p[2] === "12.250 metro x 25.5000 4.000 cono x 100.0000 2.000 cono x 30.0000" &&
      p[3] === "1:2:627.75:Nota inicial:10.500 metro" &&
      p[4] === "1:1:felipe:627.75" &&
      p[5] === "1+1" &&
      p[6]?.startsWith("editó la OI-N: entrega sin fecha → ") &&
      p[6]?.includes("la nota") &&
      p[6]?.includes("1 línea agregada") &&
      p[6]?.includes("1 línea cambiada") &&
      p[7] === "sin montos"
    );
  }
);
caso(
  "E2 con la versión vieja (otra persona guardó antes): PT409 / version_cambiada y no escribe nada",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Primera'" })} as primera \\gset
   select ${edita({ nota: "'Segunda'" })} as segunda \\gset
   reset role;
   select concat_ws(',', split_part(:'primera', ':', 3), pg_temp.eh(:'segunda'),
     (select nota || ':' || version from retail.ordenes_insumo where id = :'oc'),
     (select count(*) from retail.orden_insumo_versiones where orden_insumo_id = :'oc'));`,
  "2,PT409|version_cambiada,Primera:2,1"
);
caso(
  "E2b el aviso del choque dice la verdad: «tu cambio anterior sí se guardó» (la misma persona), «otra persona cambió» o «se anuló mientras la editabas»",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Primera'" })} as primera \\gset
   select ${edita({ nota: "'Segunda'" })} as misma \\gset
   reset role;
   update retail.ordenes_insumo set nota = 'De Micaela', actualizada_por = :'micaela_p' where id = :'oc';
   ${como(FELIPE)}
   select ${edita({ version: "2", nota: "'Tercera'" })} as otra \\gset
   reset role;
   update retail.ordenes_insumo set estado = 'anulada', anulada_por = :'felipe_p', anulada_en = now(), motivo_anulacion = 'Prueba' where id = :'oc';
   ${como(FELIPE)}
   select ${edita({ version: "3", nota: "'Cuarta'" })} as anulada \\gset
   select concat_ws(' / ', split_part(:'misma', '|', 1) || ':' || split_part(:'misma', '|', 3),
     split_part(:'otra', '|', 1) || ':' || split_part(:'otra', '|', 3),
     split_part(:'anulada', '|', 1) || ':' || split_part(:'anulada', '|', 3));`,
  "PT409:Tu cambio anterior sí se guardó, pero esta pantalla todavía no lo muestra. Recarga para ver cómo quedó. / " +
    "PT409:Otra persona cambió esta orden mientras la editabas. Recarga para ver sus cambios. / " +
    "PT409:Esta orden se anuló mientras la editabas. Recarga para verla."
);
caso(
  "E3 un doble clic (el mismo pedido otra vez, con la versión que ya no es) no choca: devuelve la orden sin subir la versión",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Una sola vez'" })} as primera \\gset
   select ${edita({ nota: "'Una sola vez'" })} as repetida \\gset
   reset role;
   select concat_ws(',', split_part(:'primera', ':', 3), split_part(:'repetida', ':', 1), split_part(:'repetida', ':', 3),
     (select count(*) from retail.orden_insumo_versiones where orden_insumo_id = :'oc'), ${enActividad("orden_insumo_editada")});`,
  "2,OK,2,1,1"
);
caso(
  "E4 sin cambios no escribe: ni versión nueva, ni archivo, ni línea de Actividad (10.5 = 10.500, 25.5 = 25.50, 10 % = 10.0 %)",
  `${UNA_ORDEN}
   select ${edita({ nota: "'  Nota inicial  '", ls: lineas({ ...L1, cantidad: "10.500", precio_unitario: "25.5" }, { ...L2, descuento_pct: "10.0" }) })} as r \\gset
   reset role;
   select concat_ws(',', split_part(:'r', ':', 3),
     (select count(*) from retail.orden_insumo_versiones where orden_insumo_id = :'oc'), ${enActividad("orden_insumo_editada")});`,
  "1,0,0"
);
caso(
  "E5 una anulada no se edita (y anularla subió la versión: la pantalla que la tenía abierta recibe el aviso de choque)",
  `${UNA_ORDEN}
   reset role;
   update retail.ordenes_insumo set estado = 'anulada', anulada_por = :'felipe_p', anulada_en = now(), motivo_anulacion = 'Prueba' where id = :'oc';
   ${como(FELIPE)}
   select concat_ws(',', split_part(${edita({ version: "2", nota: "'x'" })}, '|', 2), split_part(${edita({ nota: "'x'" })}, '|', 2));`,
  "orden_insumo_anulada,version_cambiada"
);
caso(
  "E6 lo que no se tocó no se vuelve a juzgar (proveedor y taller desactivados, insumo archivado, entrega vencida); elegir algo inactivo de nuevo, sí",
  `${UNA_ORDEN}
   reset role;
   insert into retail.proveedores_produccion (nombre, rubro, activo) values ('Otro Inactivo OI Prueba', 'tela', false) returning id as prov_off \\gset
   update retail.ordenes_insumo set fecha_emision = retail.fn_hoy_lima() - 10, fecha_entrega_estimada = retail.fn_hoy_lima() - 3 where id = :'oc';
   update retail.proveedores_produccion set activo = false where id = :'prov';
   update retail.ubicaciones set activo = false where id = :'taller';
   update retail.insumos set archivado_at = now() where id = :'lino';
   select version as v from retail.ordenes_insumo where id = :'oc' \\gset
   ${como(FELIPE)}
   select concat_ws(',',
     split_part(${edita({ entrega: "retail.fn_hoy_lima() - 3", nota: "'Solo la nota'" })}, ':', 1),
     split_part(${edita({ version: ":'v'::int + 1", prov: ":'prov_off'", entrega: "retail.fn_hoy_lima() - 3" })}, '|', 2),
     split_part(${edita({ version: ":'v'::int + 1", entrega: "retail.fn_hoy_lima() - 2" })}, '|', 2),
     split_part(${edita({ version: ":'v'::int + 1", entrega: "retail.fn_hoy_lima() - 3", ls: lineas(L1, L2, { insumo_id: "@viejo" }) })}, '|', 2));`,
  "OK,orden_insumo_proveedor,orden_insumo_entrega,orden_insumo_insumo"
);
caso(
  "E7 una orden SIN entrega no recibe al editarla una fecha fuera de rango (a más de un año ni pasada); una buena, sí",
  `${UNA_ORDEN}
   select ${edita({ entrega: "retail.fn_hoy_lima() + 400" })} as lejos \\gset
   select ${edita({ entrega: "retail.fn_hoy_lima() - 1" })} as pasada \\gset
   select ${edita({ entrega: "retail.fn_hoy_lima() + 5" })} as buena \\gset
   reset role;
   select concat_ws(',', split_part(:'lejos', '|', 2), split_part(:'pasada', '|', 2), split_part(:'buena', ':', 1),
     (select fecha_entrega_estimada - retail.fn_hoy_lima() from retail.ordenes_insumo where id = :'oc'));`,
  "orden_insumo_entrega,orden_insumo_entrega,OK,5"
);
caso(
  "E8 las reglas son las de crear: una línea mal escrita, sin líneas, una tienda de destino o sin versión se rechazan y la orden queda como estaba",
  `${UNA_ORDEN}
   select concat_ws(',',
     split_part(${edita({ ls: lineas({ ...L1, cantidad: "1.0001" }) })}, '|', 2),
     split_part(${edita({ ls: "'[]'::jsonb" })}, '|', 2),
     split_part(${edita({ destino: ":'tru'" })}, '|', 2),
     split_part(${edita({ destino: "null::uuid" })}, '|', 2),
     split_part(${edita({ version: "null::int" })}, '|', 2),
     (select version || ':' || (select count(*) from retail.orden_insumo_items i where i.orden_insumo_id = :'oc') from retail.ordenes_insumo where id = :'oc'));`,
  "orden_insumo_cantidad,orden_insumo_sin_lineas,orden_insumo_destino,orden_insumo_destino,orden_insumo_sin_version,1:2"
);
caso(
  "E9 la unidad (provisional): si el insumo cambió de unidad después de crear la orden, el detalle lo muestra y la edición copia la del día; el archivo guarda la de antes",
  `${UNA_ORDEN}
   reset role;
   update retail.insumos set unidad_medida = 'kilo' where id = :'lino';
   ${como(FELIPE)}
   select (select l ->> 'unidad_medida' || '→' || (l ->> 'unidad_actual') from jsonb_array_elements(retail.fn_orden_insumo(:'oc') -> 'lineas') l
            where (l ->> 'posicion')::int = 1) as antes \\gset
   select ${edita({ nota: "'Solo la nota'" })} as r \\gset
   reset role;
   select concat_ws(',', :'antes', split_part(:'r', ':', 1),
     (select unidad_medida from retail.orden_insumo_items where orden_insumo_id = :'oc' and posicion = 1),
     (select datos -> 'lineas' -> 0 ->> 'unidad_medida' from retail.orden_insumo_versiones where orden_insumo_id = :'oc'));`,
  "metro→kilo,OK,kilo,metro"
);
caso(
  "E10 una persona que no es Admin firma con «orden_insumo_editar» (sin la clave le pide el combo); una terminal no edita sin elegir a alguien",
  `${UNA_ORDEN}
   ${MICAELA_CON_MODULO}
   ${como(MICAELA)}
   select ${edita({ nota: "'Micaela'" })} as sin_clave \\gset
   ${encabezados({ "x-responsable-omitido": "orden_insumo_editar" })}
   select ${edita({ nota: "'Micaela'" })} as con_clave \\gset
   ${TERMINALES({ conModulo: true })}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_editar" })}
   select ${edita({ version: "2", nota: "'Terminal'" })} as terminal \\gset
   reset role;
   select concat_ws(',', split_part(:'sin_clave', '|', 2), split_part(:'con_clave', ':', 1),
     (select ${si("actualizada_por = :'micaela_p'", "micaela", "otra")} || ':' || nota from retail.ordenes_insumo where id = :'oc'),
     split_part(:'terminal', '|', 2));`,
  "responsable_requerido,OK,micaela:Micaela,responsable_requerido"
);
caso(
  "E10b editar o anular una orden que no existe responde «no existe» (no un error de la base)",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.edita(gen_random_uuid(), 1, :'prov', :'taller', null::date, null::text, ${lineas({})})),
     pg_temp.eh(pg_temp.anula(gen_random_uuid(), 1, 'No existe')));`,
  "P0001|orden_insumo_no_existe,P0001|orden_insumo_no_existe"
);
caso(
  "E11 sin el módulo, 42501; anon no ejecuta editar",
  `${UNA_ORDEN}
   ${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_editar" })}
   select split_part(${edita({ nota: "'x'" })}, '|', 1) as micaela \\gset
   reset role;
   select concat_ws(',', :'micaela',
     has_function_privilege('anon', 'retail.editar_orden_insumo(uuid,integer,uuid,uuid,date,text,jsonb)', 'execute'));`,
  "42501,f"
);

// A. ANULAR -----------------------------------------------------------------------------------------------------------------------
caso(
  "A1 anular deja la orden anulada con quién, cuándo y el motivo, sube la versión, no libera el número y anota en Actividad",
  `${UNA_ORDEN}
   select ${anula()} as r \\gset
   select id as otra, numero as n2 from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, null::text, ${lineas(L1)}) \\gset
   reset role;
   select concat_ws(' / ', :'r',
     (select estado || ':' || ${si("anulada_por = :'felipe_p'", "felipe", "otra")} || ':' || ${si("anulada_en is not null", "con hora", "sin hora")}
             || ':' || motivo_anulacion from retail.ordenes_insumo where id = :'oc'),
     ${si(":'n2'::int > :'n'::int", "número nuevo", "repitió número")},
     (select (d ->> 'estado') || ':' || ${si("(d ->> 'anulada_por') like 'Felipe%'", "felipe", "otra")} || ':' || (d ->> 'motivo_anulacion')
        from (select retail.fn_orden_insumo(:'oc') d) x),
     ${descripcionActividad("orden_insumo_anulada")});`,
  "OK:2 / anulada:felipe:con hora:El proveedor no tenía el lino / número nuevo / anulada:felipe:El proveedor no tenía el lino / " +
    "anuló la OI-N para Telas Peña OI Prueba: «El proveedor no tenía el lino»"
);
caso(
  "A2 el motivo es obligatorio (vacío o solo espacios) y va hasta 300 letras; sin él la orden sigue generada",
  `${UNA_ORDEN}
   select concat_ws(',',
     split_part(${anula(":'v'", "null::text")}, '|', 2),
     split_part(${anula(":'v'", "'   '")}, '|', 2),
     split_part(${anula(":'v'", "repeat('a', 301)")}, '|', 2),
     (select estado from retail.ordenes_insumo where id = :'oc'));`,
  "orden_insumo_motivo,orden_insumo_motivo,orden_insumo_motivo,generada"
);
caso(
  "A3 con la versión vieja (otra persona la editó antes): PT409 / version_cambiada y no la anula",
  `${UNA_ORDEN}
   select ${edita({ nota: "'Otra persona'" })} \\g /dev/null
   select concat_ws(',', pg_temp.eh(${anula()}), (select estado from retail.ordenes_insumo where id = :'oc'));`,
  "PT409|version_cambiada,generada"
);
caso(
  "A4 el mismo pedido repetido (doble clic) no da error y no cambia nada; anular otra vez con otro motivo, sí",
  `${UNA_ORDEN}
   select ${anula()} as primera \\gset
   select ${anula()} as repetida \\gset
   select ${anula(":'v'::int + 1", "'Otro motivo'")} as otra \\gset
   reset role;
   select concat_ws(',', :'primera', :'repetida', split_part(:'otra', '|', 2),
     (select motivo_anulacion || ':' || version from retail.ordenes_insumo where id = :'oc'),
     ${enActividad("orden_insumo_anulada")});`,
  "OK:2,OK:2,orden_insumo_ya_anulada,El proveedor no tenía el lino:2,1"
);
caso(
  "A5 una persona que no es Admin firma con «orden_insumo_anular» (sin la clave le pide el combo); una terminal no anula sin elegir a alguien",
  `${UNA_ORDEN}
   ${MICAELA_CON_MODULO}
   ${TERMINALES({ conModulo: true })}
   ${como(T_VENTAS)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_anular" })}
   select ${anula()} as terminal \\gset
   ${como(MICAELA)}
   ${encabezados({})}
   select ${anula()} as sin_clave \\gset
   ${encabezados({ "x-responsable-omitido": "orden_insumo_anular" })}
   select ${anula()} as con_clave \\gset
   reset role;
   select concat_ws(',', split_part(:'terminal', '|', 2), split_part(:'sin_clave', '|', 2), :'con_clave',
     (select ${si("anulada_por = :'micaela_p'", "micaela", "otra")} from retail.ordenes_insumo where id = :'oc'));`,
  "responsable_requerido,responsable_requerido,OK:2,micaela"
);
caso(
  "A6 sin el módulo, 42501; anon no ejecuta anular",
  `${UNA_ORDEN}
   ${como(MICAELA)}
   ${encabezados({ "x-responsable-omitido": "orden_insumo_anular" })}
   select split_part(${anula()}, '|', 1) as micaela \\gset
   reset role;
   select :'micaela' || ',' || has_function_privilege('anon', 'retail.anular_orden_insumo(uuid,integer,text)', 'execute');`,
  "42501,false"
);

// 2S. DOS SESIONES A LA VEZ ---------------------------------------------------------------------------------------------------
// Una orden de prueba COMMITEADA (sin la migración en el preludio: corre sobre la base ya migrada). Se borra entera al terminar —y al
// empezar, si una corrida anterior se cortó—, también sus filas «solo se agregan» (session_replication_role = replica).
const MARCA_2S = "ZZ OI dos sesiones";
const LIMPIAR_2S = `
set client_min_messages = warning;
begin;
set local session_replication_role = replica;
create temp table _prov on commit drop as select p.id from retail.proveedores_produccion p where p.nombre like '${MARCA_2S}%';
create temp table _ord on commit drop as select o.id from retail.ordenes_insumo o where o.proveedor_id in (select id from _prov);
delete from retail.actividad a where a.tabla = 'ordenes_insumo' and a.registro_id in (select id::text from _ord);
delete from retail.orden_insumo_versiones v where v.orden_insumo_id in (select id from _ord);
delete from retail.orden_insumo_items i where i.orden_insumo_id in (select id from _ord);
delete from retail.ordenes_insumo o where o.id in (select id from _ord);
delete from retail.insumos n where n.codigo like 'ZZOI2S-%';
delete from retail.proveedores_produccion p where p.id in (select id from _prov);
commit;
select count(*) from retail.proveedores_produccion where nombre like '${MARCA_2S}%';
`;
const LINEAS_2S = (ins) => `jsonb_build_array(jsonb_build_object('insumo_id', '${ins}', 'cantidad', '10', 'precio_unitario', '20'))`;
const CREAR_2S = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}
insert into retail.proveedores_produccion (nombre, rubro) values ('${MARCA_2S} ' || substr(md5(random()::text), 1, 8), 'tela') returning id as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZOI2S-' || substr(md5(random()::text), 1, 8), 'Lino dos sesiones', 'tela', 'metro')
  returning id as ins \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select r.id as oc from retail.crear_orden_insumo(gen_random_uuid(), :'prov', :'taller', null::date, 'Inicial',
  jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', '10', 'precio_unitario', '20'))) r \\gset
commit;
select :'oc' || '|' || :'prov' || '|' || :'ins' || '|' || :'taller';
`;
// Una sesión que edita la orden con la versión 1: «OK:<n>:<versión>» o «sqlstate|hint|mensaje». Con `espera`, se queda con la fila
// bloqueada ese tiempo antes de confirmar.
const SESION_EDITA = (auth, x, nota, espera) => `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${como(auth)}
select pg_temp.edita('${x.oc}', 1, '${x.prov}', '${x.taller}', null::date, '${nota}', ${LINEAS_2S(x.ins)});
${espera ? `select pg_sleep(${espera});\ncommit;` : "rollback;"}
`;
const SESION_CREA = (x, pid, espera) => `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${como(FELIPE)}
select pg_temp.crea('${pid}', '${x.prov}', '${x.taller}', null::date, 'Mismo id', ${LINEAS_2S(x.ins)});
${espera ? `select pg_sleep(${espera});\ncommit;` : "rollback;"}
`;
const ultima = (s) => s.stdout.trim().split("\n").filter(Boolean).at(-1);

async function dosSesiones() {
  const nombres = [
    "2S1 dos sesiones editan la misma orden a la vez: la primera gana, la segunda espera la fila y lee «Otra persona cambió…» (PT409), sin pisarla",
    "2S2 dos sesiones crean con el mismo id a la vez (un doble clic que viajó por dos conexiones): queda UNA orden y las dos reciben la misma",
  ];
  if (!DOS_SESIONES) {
    for (const n of nombres) console.log(`⤳ ${n}: se salta en la base local compartida (hace COMMIT); córrela con --contenedor <banco propio>`);
    return;
  }
  try {
    psql(LIMPIAR_2S);
    const [oc, prov, ins, taller] = psql(CREAR_2S).trim().split("\n").filter(Boolean).at(-1).split("|");
    const x = { oc, prov, ins, taller };

    // 2S1: Felipe guarda y se queda con la fila 1.5 s; Sandra (otra persona) guarda mientras tanto con la misma versión 1.
    const p1 = psqlAsync(SESION_EDITA(FELIPE, x, "Sesión A", 1.5));
    await dormir(400);
    const p2 = psqlAsync(SESION_EDITA(SANDRA, x, "Sesión B", null));
    const [s1, s2] = await Promise.all([p1, p2]);
    const estado = psql(`select o.nota || ':' || o.version || ':' || (select count(*) from retail.orden_insumo_versiones v where v.orden_insumo_id = o.id)
                           from retail.ordenes_insumo o where o.id = '${oc}';`).trim();
    const esperado1 =
      "s1=OK:2 · s2=PT409|version_cambiada|Otra persona cambió esta orden mientras la editabas. Recarga para ver sus cambios. · esperó · Sesión A:2:1";
    const obtenido1 = `s1=${ultima(s1)?.replace(/^OK:\d+:/, "OK:")} · s2=${ultima(s2)} · ${s2.ms > 900 ? "esperó" : `no esperó (${s2.ms} ms)`} · ${estado}`;
    const ok1 = s1.code === 0 && s2.code === 0 && obtenido1 === esperado1;
    anotar(nombres[0], ok1, esperado1, ok1 ? obtenido1 : `${obtenido1}\n    s1: ${s1.stderr.trim()}\n    s2: ${s2.stderr.trim()}`);

    // 2S2: el mismo id en dos conexiones; la primera confirma 1.5 s después, la segunda espera su clave y devuelve la de la primera.
    const pid = crypto.randomUUID();
    const q1 = psqlAsync(SESION_CREA(x, pid, 1.5));
    await dormir(400);
    const q2 = psqlAsync(SESION_CREA(x, pid, null));
    const [r1, r2] = await Promise.all([q1, q2]);
    const cuantas = psql(`select count(*) || ':' || coalesce(max(numero)::text, '-') from retail.ordenes_insumo where id = '${pid}';`).trim();
    const [n, numero] = cuantas.split(":");
    const obtenido2 = `r1=${ultima(r1) === `OK:${numero}` ? "OK:N" : ultima(r1)} · r2=${ultima(r2) === `OK:${numero}` ? "OK:N" : ultima(r2)} · ${
      r2.ms > 900 ? "esperó" : `no esperó (${r2.ms} ms)`
    } · ordenes=${n}`;
    const esperado2 = "r1=OK:N · r2=OK:N · esperó · ordenes=1";
    const ok2 = r1.code === 0 && r2.code === 0 && obtenido2 === esperado2;
    anotar(nombres[1], ok2, esperado2, ok2 ? obtenido2 : `${obtenido2}\n    r1: ${r1.stderr.trim()}\n    r2: ${r2.stderr.trim()}`);
  } catch (e) {
    anotar("2S dos sesiones", false, "sin error", String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" "));
  } finally {
    try {
      const quedan = psql(LIMPIAR_2S).trim().split("\n").filter(Boolean).at(-1);
      if (quedan !== "0") console.log(`⚠ quedaron ${quedan} proveedores «${MARCA_2S}» sin borrar`);
    } catch (e) {
      console.log(`⚠ no se pudo borrar la orden de prueba de 2S: ${String(e.stderr ?? e.message).split("\n")[0]}`);
    }
  }
}

await dosSesiones();

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);

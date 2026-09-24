#!/usr/bin/env node
/**
 * Pruebas de `20260923240000_quien_en_acciones_pendientes.sql` (ADR-0161, actualización d) — CAYLA V2.
 *
 * QUÉ PRUEBA. Que cada acción que antes guardaba sin anotar quién, ahora anota al RESPONSABLE del combo (no a la
 * cuenta): Felipe (líder) guarda con `x-responsable` = Rosa (presente en Trujillo) y queda Rosa en
 *   anular_compra (anulada_por), anular_comprobante_produccion (anulada_por), set_etapa_produccion (una fila en
 *   produccion_etapas_historial por cambio), guardar_/cambiar_estado_proveedor_produccion (creado_por, modificado_por),
 *   alta de insumo por la API (disparador → creado_por), reactivar_terminal (reactivada_por) y
 *   registrar_cambio_clave_terminal (clave_cambiada_por).
 * Además: con el responsable obligatorio encendido, sin encabezado se rechaza (42501) y no se escribe nada; y la
 * migración se puede pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (la base local la comparten varias sesiones). Rosa y la asistencia de
 * Dynamic (`public.marcajes`) se crean DENTRO del caso; el encabezado HTTP se simula con `request.headers`.
 *
 * USO
 *   pnpm pruebas:quien-pendientes                 → contra la base `postgres` del stack local
 *   pnpm pruebas:quien-pendientes --en-seco       → carga la migración dentro de cada caso
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260923240000_quien_en_acciones_pendientes.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const ROSA = "33333333-3333-4333-8333-0000000000b1"; // integrante de Trujillo, sin cuenta: la responsable
const T_CUENTA = "33333333-3333-4333-8333-0000000000c1"; // cuenta de una terminal de prueba

function correr(sql) {
  try {
    const salida = execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
    );
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada) values
  ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
select id as v1, producto_id as prod from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
\\set rosa '${ROSA}'
`;

/** Felipe (líder) con sesión; `conRosa` = manda x-responsable Rosa y x-ubicacion Trujillo. */
const felipe = (conRosa = true) => `set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', ${conRosa ? `json_build_object('x-responsable', :'rosa', 'x-ubicacion', :'tru')::text` : `'{}'`}, true) as _h \\gset
`;
const ENCENDER = `insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;\n`;
// Desde 20260924171300 el ADMIN firma sin responsable, y en el seed Felipe es admin de Dynamic: los casos «sin
// encabezado se rechaza» lo bajan a líder que no es admin (dentro de la transacción) para probar la regla del resto.
const NO_ADMIN = `update public.personas set rol = 'integrante' where auth_user_id = '${FELIPE}';\n`;
const PROVEEDOR = `select retail.guardar_proveedor_produccion(null, 'ZZ Prov ' || substr(md5(random()::text), 1, 8), 'tela') as prov \\gset\n`;

let fallas = 0;
let casos = 0;
function caso(nombre, cuerpo, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${cuerpo}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").filter((l) => l.includes("ERROR")).join(" / ") || r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

caso(
  "anular_compra — Felipe con Rosa en el combo: anulada_por = Rosa (no Felipe) y anulada_at puesta",
  `insert into retail.proveedores (nombre, activo) values ('ZZ Prueba quién ' || substr(md5(random()::text), 1, 8), true) returning id as p \\gset
${felipe()}select retail.registrar_compra(:'p', 'TST', 'N' || substr(md5(random()::text), 1, 10), 'credito', :'tru',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'v1', 'cantidad', 1, 'costo_unitario', 10)),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as compra \\gset
select retail.anular_compra(:'compra', 'prueba') as _a \\gset
select concat_ws(',', estado, anulada_por = :'rosa', anulada_at is not null) from retail.compras where id = :'compra';`,
  "anulada,t,t"
);

caso(
  "anular_compra — responsable obligatorio y SIN encabezado: 42501 y la compra sigue vigente",
  `insert into retail.proveedores (nombre, activo) values ('ZZ Prueba quién ' || substr(md5(random()::text), 1, 8), true) returning id as p \\gset
${felipe()}select retail.registrar_compra(:'p', 'TST', 'N' || substr(md5(random()::text), 1, 10), 'credito', :'tru',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'v1', 'cantidad', 1, 'costo_unitario', 10)),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as compra \\gset
${ENCENDER}${NO_ADMIN}${felipe(false)}select pg_temp.intento(format('select retail.anular_compra(%L, ''prueba'')', :'compra'));
select estado from retail.compras where id = :'compra';`,
  (s) => s.startsWith("42501|responsable_requerido") && s.trim().endsWith("vigente")
);

caso(
  "anular_comprobante_produccion — anulada_por = Rosa",
  `${felipe()}${PROVEEDOR}insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total)
  values (:'prov', 'boleta', 'B1', 'N' || substr(md5(random()::text), 1, 8), 'contado', 10, 0, 10) returning id as comp \\gset
select retail.anular_comprobante_produccion(:'comp', 'prueba') as _a \\gset
select concat_ws(',', estado, anulada_por = :'rosa', anulada_at is not null) from retail.comprobantes_produccion where id = :'comp';`,
  "anulada,t,t"
);

caso(
  "set_etapa_produccion — cada cambio deja una fila con quién (Rosa); dos cambios = dos filas",
  `insert into retail.producciones (ubicacion_id, producto_id, cantidad_plan, estado) values (:'tru', :'prod', 5, 'en_proceso') returning id as orden \\gset
${felipe()}select retail.set_etapa_produccion(:'orden', 'corte', 'hecho') as _1 \\gset
select retail.set_etapa_produccion(:'orden', 'confeccion', 'tercerizado') as _2 \\gset
select concat_ws(',', count(*), bool_and(hecho_por = :'rosa'), string_agg(etapa || ':' || estado, '/' order by created_at, etapa))
  from retail.produccion_etapas_historial where produccion_id = :'orden';`,
  (s) => s.startsWith("2,t,") && s.includes("corte:hecho") && s.includes("confeccion:tercerizado")
);

caso(
  "proveedor de producción — alta: creado_por = Rosa; edición y archivo: modificado_por = Rosa",
  `${felipe()}${PROVEEDOR}select concat_ws(',', creado_por = :'rosa', modificado_por is null) from retail.proveedores_produccion where id = :'prov';
select retail.guardar_proveedor_produccion(:'prov', 'ZZ Editado ' || substr(md5(random()::text), 1, 8), 'avios') as _e \\gset
select concat_ws(',', modificado_por = :'rosa', modificado_at is not null) from retail.proveedores_produccion where id = :'prov';
update retail.proveedores_produccion set modificado_por = null where id = :'prov';
select retail.cambiar_estado_proveedor_produccion(:'prov', false) as _c \\gset
select concat_ws(',', activo, modificado_por = :'rosa') from retail.proveedores_produccion where id = :'prov';`,
  "t,t\nt,t\nf,t"
);

caso(
  "alta de insumo por la API (sin RPC): el disparador pone creado_por = Rosa",
  `${felipe()}set local role authenticated;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ' || substr(md5(random()::text), 1, 6), 'Tela de prueba', 'tela', 'metro') returning (creado_por = :'rosa')::text;`,
  (s) => s.trim().endsWith("true")
);

caso(
  "alta de insumo — responsable obligatorio y sin encabezado: 42501, no entra",
  `${ENCENDER}${NO_ADMIN}${felipe(false)}set local role authenticated;
select pg_temp.intento($q$insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-NO', 'No entra', 'tela', 'metro')$q$);`,
  (s) => s.startsWith("42501|responsable_requerido")
);

caso(
  "terminal — reactivar: reactivada_por = Rosa; cambio de clave: clave_cambiada_por = Rosa",
  `insert into auth.users (id, aud, role, email) values ('${T_CUENTA}', 'authenticated', 'authenticated', 'terminal-quien@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id) values (:'tru', 'Terminal Quién', 'ventas', '${T_CUENTA}') returning id as t \\gset
${felipe()}select retail.desactivar_terminal(:'t') as _d \\gset
select retail.reactivar_terminal(:'t') as _r \\gset
select retail.registrar_cambio_clave_terminal(:'t') as _k \\gset
select concat_ws(',', activo, reactivada_por = :'rosa', clave_cambiada_por = :'rosa', clave_cambiada_at is not null) from retail.terminales where id = :'t';`,
  "t,t,t,t"
);

caso(
  "la migración se puede pegar otra vez sin cambiar nada (anular_compra queda con UNA anotación)",
  `${MIGRACION}
select (length(d) - length(replace(d, 'anulada_por = retail.fn_actor_persona_id(true)', ''))) / length('anulada_por = retail.fn_actor_persona_id(true)')
  from (select pg_get_functiondef('retail.anular_compra(uuid, text)'::regprocedure) d) x;`,
  (s) => s.trim().endsWith("1")
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Pruebas del ADR-0253 (Felipe, 2026-09-28): «ningún módulo solo del líder» y «el Líder de equipo se edita».
 *
 * QUÉ PRUEBA
 *   Parte A (`20260928220000_finanzas_modulos_delegables.sql`):
 *   · ningún módulo queda «solo del líder»: Configuración, Impuestos y Cierre de mes se dan como cualquier otro;
 *   · sin el módulo, la integrante no entra, y el mensaje nombra el módulo que le falta (ya no dice «solo el líder»);
 *   · con un rol que los tiene, hace lo del líder en esas pantallas: lee y guarda la configuración, ve los impuestos de
 *     CAYLA entera y el panel de cierre, y su alcance en Finanzas es todas las tiendas (decisión «todo, como el líder»);
 *     Impuestos solo no abre ese alcance (no hace falta: es del RUC entero);
 *   · VIGILANCIA: ninguna de las funciones reescritas vuelve a preguntar `fn_es_lider()`. Si una migración futura las
 *     recrea desde un archivo viejo del repo, esta prueba falla.
 *   Parte B (`20260928220100_lider_de_equipo_editable.sql`):
 *   · el Admin le quita un módulo al Líder: el líder deja de verlo (menú, `fn_ve_modulo`), pero sigue siendo líder
 *     (`fn_es_lider`, sus poderes de siempre); queda en el historial; se le devuelve y queda como estaba;
 *   · «Roles y accesos» no se le quita (la función y la tabla lo rechazan);
 *   · un líder que no es Admin no edita el Líder;
 *   · un módulo que nace después aparece solo para el líder, aunque se le haya quitado otro;
 *   · la versión del rol sube al editarlo (ADR-0193): guardar con la versión vieja se rechaza;
 *   · duplicar el Líder copia lo que el Líder ve, no todo;
 *   · `fn_lider_modulos_ocultos` la lee quien administra roles, no la integrante.
 *
 * CÓMO. Igual que `roles_por_modulo.mjs`: cada escenario en su transacción con ROLLBACK (la base local es compartida),
 * sesión simulada con `request.jwt.claims`.
 *
 * USO
 *   pnpm pruebas:roles-lider-editable
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE_AUTH = "22222222-2222-4222-8222-000000000001"; // líder (y Admin en Dynamic)
const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

// Las funciones que la parte A reescribió. Ninguna debe volver a preguntar `fn_es_lider()` directo.
const REESCRITAS = [
  "fn_configuracion_tiendas", "guardar_efecto_campana", "guardar_hora_cierre_tienda", "guardar_metas_tienda",
  "fn_presupuesto_configuracion", "fn_presupuesto_propuesta", "guardar_presupuesto", "guardar_presupuesto_lote",
  "guardar_parametros_finanzas", "descartar_fijo_sugerido", "fn_exigir_lider_dinero", "fn_parametros_tributarios_lista",
  "guardar_parametro_tributario", "fn_impuestos_panel", "fn_impuestos_igv_meses", "fn_impuestos_registro_compras",
  "fn_impuestos_registro_ventas", "cerrar_periodo", "fn_cierre_mes_estado", "fn_cierre_panel", "reabrir_periodo",
  "fn_asientos", "fn_periodos_mes", "fn_gastos_fijos_mes", "fn_gastos_fijos_sugeridos", "fn_gastos_lista", "fn_gastos_panel",
  "fn_cuentas_dinero_saldos", "fn_cuentas_para_elegir", "fn_movimientos_dinero", "fn_presupuesto_vs_real", "fn_campanas_reporte",
  "fn_diario_ubicaciones", "fn_gastos_ubicaciones", "fn_cuentas_dinero_ubicaciones", "fn_gastos_puede",
];

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
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
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
create temp table ids as
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         (select id from public.personas where auth_user_id = '${FELIPE_AUTH}') as felipe,
         (select id from public.personas where auth_user_id = '${MICAELA_AUTH}') as micaela,
         retail.fn_rol_por_clave('lider') as r_lider;
grant select on ids to authenticated;
-- ADR-0178: el Admin se lee de Dynamic. Felipe lo es en producción; el seed también, pero se deja explícito.
update public.personas set rol = 'admin' where auth_user_id = '${FELIPE_AUTH}';
update public.personas set rol = 'integrante' where auth_user_id = '${MICAELA_AUTH}';
-- Una base local puede traer lo que otra sesión le quitó al Líder: cada escenario arranca con el Líder viéndolo todo.
delete from retail.lider_modulos_ocultos;
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);`;
// Un rol a medida con esos módulos, asignado a la integrante. El líder arma la escena.
const conRol = (nombre, modulos) =>
  como(FELIPE_AUTH) +
  `select asignar_rol(crear_rol('${nombre}'), micaela) from ids \\g /dev/null\n` +
  `select guardar_modulos_rol(id, array[${modulos.map((m) => `'${m}'`).join(", ")}]::text[]) from retail.roles where nombre = '${nombre}' \\g /dev/null\n`;
// Guarda en el Líder todos los módulos menos `sin` (lo que se le quita).
const liderSin = (...sin) =>
  `select guardar_modulos_rol(r_lider, array(select clave from retail.modulos where clave <> all (array[${sin.map((m) => `'${m}'`).join(", ") || "''"}]::text[]))) from ids \\g /dev/null\n`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// ---------------- Parte A: ningún módulo solo del líder ----------------
caso(
  "ningún módulo queda «solo del líder»: Configuración, Impuestos y Cierre de mes se pueden dar",
  `select coalesce(string_agg(clave, ',' order by clave) filter (where not delegable or solo_lider), '') || '|' ||
          (select string_agg(clave || ':' || delegable, ',' order by clave) from retail.modulos where clave in ('configuracion', 'impuestos', 'cierre_mes'))
     from retail.modulos;`,
  "|cierre_mes:true,configuracion:true,impuestos:true"
);
caso(
  "sin el módulo, la integrante no entra a Configuración, Impuestos ni Cierre de mes, y el mensaje nombra el módulo",
  como(MICAELA_AUTH) +
    intento(`select retail.fn_configuracion_tiendas(null)`) + "\n" +
    intento(`select retail.fn_impuestos_panel(null)`) + "\n" +
    intento(`select retail.fn_cierre_panel(null)`) + "\n" +
    intento(`select retail.fn_parametros_tributarios_lista()`),
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 4 &&
      l[0].includes("necesita el módulo «Configuración»") &&
      l[1].includes("necesita el módulo «Impuestos»") &&
      l[2].includes("necesita el módulo «Cierre de mes»") &&
      l[3].includes("necesita el módulo «Configuración»") &&
      !s.includes("Solo el líder")
    );
  }
);
caso(
  "con un rol que los tiene, la integrante hace lo del líder: lee y guarda la configuración, ve impuestos y cierre, y su alcance en Finanzas es todas las tiendas",
  conRol("Finanzas de prueba", ["configuracion", "impuestos", "cierre_mes"]) +
    como(MICAELA_AUTH) +
    `select concat_ws(',', fn_puede_configurar(), fn_puede_ver_impuestos(), fn_puede_cerrar_mes(), fn_ve_finanzas_de_todo(), fn_es_lider());\n` +
    `select (cardinality(fn_gastos_ubicaciones()) = (select count(*) from retail.ubicaciones where activo))::text || ',' ||
            (cardinality(fn_diario_ubicaciones()) = (select count(*) from retail.ubicaciones))::text || ',' || fn_gastos_puede(null)::text;\n` +
    intento(`select retail.fn_configuracion_tiendas(null)`) + "\n" +
    intento(`select retail.fn_parametros_finanzas()`) + "\n" +
    intento(`select retail.fn_parametros_tributarios_lista()`) + "\n" +
    intento(`select retail.fn_presupuesto_configuracion(date_trunc('month', current_date)::date)`) + "\n" +
    intento(`select retail.fn_impuestos_panel(null)`) + "\n" +
    intento(`select retail.fn_cierre_panel(null)`) + "\n" +
    `select pg_temp.intento(format('select retail.guardar_metas_tienda(%L, array[100,100,100,100,100,100,100]::numeric[], 150)', tru)) from ids;`,
  "t,t,t,t,f\ntrue,true,true\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR\nSIN_ERROR"
);
caso(
  "Impuestos solo no abre el alcance de las demás tiendas (es del RUC entero: no lo necesita)",
  conRol("Solo impuestos", ["impuestos"]) +
    como(MICAELA_AUTH) +
    `select concat_ws(',', fn_puede_ver_impuestos(), fn_puede_configurar(), fn_puede_cerrar_mes(), fn_ve_finanzas_de_todo());\n` +
    intento(`select retail.fn_impuestos_panel(null)`),
  "t,f,f,f\nSIN_ERROR"
);
caso(
  `VIGILANCIA: ninguna de las ${REESCRITAS.length} funciones reescritas vuelve a preguntar fn_es_lider() (una migración que las recree desde un archivo viejo del repo les devolvería el candado)`,
  `select count(*) || '|' || coalesce(string_agg(p.proname, ',' order by p.proname) filter (where p.prosrc ~ 'fn_es_lider\\(\\)'), '')
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname = any (array[${REESCRITAS.map((f) => `'${f}'`).join(", ")}]);`,
  `${REESCRITAS.length}|`
);

// ---------------- Parte B: el Líder de equipo se edita ----------------
caso(
  "el Admin le quita Caja al Líder: el líder deja de verla, sigue siendo líder con sus poderes, y queda en el historial",
  como(FELIPE_AUTH) +
    liderSin("caja") +
    `select concat_ws(',', exists (select 1 from fn_mis_modulos() where clave = 'caja'), fn_ve_modulo('caja'), fn_ve_modulo('vender'),
       fn_es_lider(), fn_puede_gestionar_caja(), (select count(*) from fn_mis_modulos()) = (select count(*) - 1 from retail.modulos));\n` +
    `select string_agg(m, ',') from fn_lider_modulos_ocultos() m;\n` +
    `select (detalle->'antes' ? 'caja')::text || ',' || (detalle->'despues' ? 'caja')::text from retail.roles_historial
      where rol_id = (select r_lider from ids) and accion = 'modulos' order by id desc limit 1;`,
  "f,f,t,t,t,t\ncaja\ntrue,false"
);
caso(
  "se le devuelve todo y queda como estaba",
  como(FELIPE_AUTH) + liderSin("caja", "gastos") + liderSin() +
    `select (select count(*) from retail.lider_modulos_ocultos) || ',' || ((select count(*) from fn_mis_modulos()) = (select count(*) from retail.modulos));`,
  "0,true"
);
caso(
  "«Roles y accesos» no se le quita al Líder: lo rechazan la función y la tabla",
  como(FELIPE_AUTH) +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array(select clave from retail.modulos where clave <> %L))', r_lider, 'roles')) from ids;\n` +
    intento(`insert into retail.lider_modulos_ocultos (modulo) values ('roles')`),
  (s) => {
    const l = s.split("\n");
    return l.length === 2 && l[0].startsWith("23514|«Roles y accesos» no se le quita") && l[1].startsWith("23514|");
  }
);
caso(
  "un líder que no es Admin no edita el Líder (tocarlo es tocar a todos los líderes)",
  // Sigue siendo Líder aquí (`colaboradores.rol`), pero en Dynamic ya no es admin.
    `update public.personas set rol = 'integrante' where auth_user_id = '${FELIPE_AUTH}';\n` +
    como(FELIPE_AUTH) +
    `select fn_es_lider()::text || ',' || fn_es_admin()::text;\n` +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array(select clave from retail.modulos where clave <> %L))', r_lider, 'caja')) from ids;`,
  (s) => {
    const l = s.split("\n");
    return l.length === 2 && l[0] === "true,false" && l[1].startsWith("42501|Los módulos del Líder de equipo los cambia un Admin");
  }
);
caso(
  "un módulo que nace después aparece solo para el líder, aunque se le haya quitado otro",
  como(FELIPE_AUTH) + liderSin("caja") +
    `insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)
       values ('zz_prueba', 'Gestión', 'Módulo de prueba', 'Solo para esta prueba', 9999, false, true);\n` +
    `select concat_ws(',', exists (select 1 from fn_mis_modulos() where clave = 'zz_prueba'), fn_ve_modulo('zz_prueba'),
       exists (select 1 from fn_mis_modulos() where clave = 'caja'));`,
  "t,t,f"
);
caso(
  "la versión del Líder sube al editarlo: guardar con la versión vieja se rechaza (ADR-0193)",
  como(FELIPE_AUTH) +
    `select version as v0 from retail.roles where clave = 'lider' \\gset\n` +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array(select clave from retail.modulos where clave <> %L), %s)', r_lider, 'caja', :v0)) from ids;\n` +
    `select (version > :v0)::text from retail.roles where clave = 'lider';\n` +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array(select clave from retail.modulos), %s)', r_lider, :v0)) from ids;`,
  (s) => {
    const l = s.split("\n");
    return l.length === 3 && l[0] === "SIN_ERROR" && l[1] === "true" && l[2].startsWith("PT409|");
  }
);
caso(
  "duplicar el Líder copia lo que el Líder ve: sin Caja si se la quitaron",
  como(FELIPE_AUTH) + liderSin("caja") +
    `select crear_rol('Copia del Líder', null, r_lider) as copia from ids \\gset\n` +
    `select concat_ws(',', exists (select 1 from retail.rol_modulos where rol_id = :'copia' and modulo = 'caja'),
       exists (select 1 from retail.rol_modulos where rol_id = :'copia' and modulo = 'vender'));`,
  "f,t"
);
caso(
  "lo que se le quitó al Líder lo lee quien administra roles; la integrante sin Roles y accesos, no",
  como(FELIPE_AUTH) + liderSin("caja") +
    como(MICAELA_AUTH) + `select count(*)::text from fn_lider_modulos_ocultos();\n` +
    como(FELIPE_AUTH) + `select count(*)::text from fn_lider_modulos_ocultos();`,
  "0\n1"
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
process.exit(fallas ? 1 : 0);

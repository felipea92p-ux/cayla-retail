#!/usr/bin/env node
/**
 * CAYLA Global (ADR-0275, migración 20260929140000): la vista de toda la empresa nace SOLO para el Admin.
 *
 * QUÉ PRUEBA, contra el Postgres local (todo termina en ROLLBACK):
 *   · nace como «módulo del Admin», quitado al Líder de equipo, y se puede dar (a personas);
 *   · la ve el Admin; un líder que no es Admin, no; la integrante, no;
 *   · el Admin que le quita Caja al Líder pierde Caja (ADR-0253, sin cambios) pero conserva CAYLA Global;
 *   · si el Admin se la da al Líder de equipo, la ve también un líder que no es Admin;
 *   · «solo das lo que ves», también el líder: uno que no es Admin no la enciende en un rol; el Admin sí;
 *   · con un rol que la tiene, la integrante la ve y su alcance en Finanzas es todas las sedes;
 *   · una terminal no puede tener un rol con CAYLA Global;
 *   · `fn_global_cobertura`: el Admin la lee (una fila por ubicación activa), sin el módulo se rechaza con 42501 y el
 *     mensaje nombra el módulo, y `anon` no la ejecuta.
 *
 * CÓMO. Igual que `roles_lider_editable.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claims`. Cada escenario arranca con CAYLA Global como nace: quitada al Líder, nada más quitado.
 *
 * USO
 *   pnpm pruebas:cayla-global
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE_AUTH = "22222222-2222-4222-8222-000000000001"; // líder (y Admin en Dynamic)
const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const T_VENTAS_AUTH = "33333333-3333-4333-8333-0000000000a1"; // terminal de ventas

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
  select (select id from public.personas where auth_user_id = '${FELIPE_AUTH}') as felipe,
         (select id from public.personas where auth_user_id = '${MICAELA_AUTH}') as micaela,
         (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         retail.fn_rol_por_clave('lider') as r_lider;
grant select on ids to authenticated;
update public.personas set rol = 'admin' where auth_user_id = '${FELIPE_AUTH}';
update public.personas set rol = 'integrante' where auth_user_id = '${MICAELA_AUTH}';
-- CAYLA Global como nace: quitada al Líder de equipo y nada más quitado (otra prueba o sesión pudo dejar otra cosa).
delete from retail.lider_modulos_ocultos;
insert into retail.lider_modulos_ocultos (modulo) values ('cayla_global');
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);`;
// Felipe deja de ser Admin en Dynamic (sigue siendo Líder aquí): el «líder que no es Admin».
const sinAdmin = `update public.personas set rol = 'integrante' where auth_user_id = '${FELIPE_AUTH}';\n`;
const conAdmin = `update public.personas set rol = 'admin' where auth_user_id = '${FELIPE_AUTH}';\n`;
// Guarda en el Líder todos los módulos menos `sin` (lo que se le quita). Lo hace el Admin.
const liderSin = (...sin) =>
  `select guardar_modulos_rol(r_lider, array(select clave from retail.modulos where clave <> all (array[${sin.map((m) => `'${m}'`).join(", ") || "''"}]::text[]))) from ids \\g /dev/null\n`;
// Un rol a medida con esos módulos, asignado a la integrante. Lo arma el Admin.
const conRol = (nombre, modulos) =>
  como(FELIPE_AUTH) +
  `select asignar_rol(crear_rol('${nombre}'), micaela) from ids \\g /dev/null\n` +
  `select guardar_modulos_rol(id, array[${modulos.map((m) => `'${m}'`).join(", ")}]::text[]) from retail.roles where nombre = '${nombre}' \\g /dev/null\n`;

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

const ve = `select concat_ws(',', fn_ve_modulo('cayla_global'), exists (select 1 from fn_mis_modulos() where clave = 'cayla_global'));\n`;

caso(
  "nace como módulo del Admin, quitado al Líder de equipo, y se puede dar",
  `select concat_ws(',', del_admin, delegable, not solo_lider) from retail.modulos where clave = 'cayla_global';\n` +
    `select (select count(*) from retail.modulos where del_admin)::text;`,
  "t,t,t\n1"
);

caso(
  "la ve el Admin; un líder que no es Admin, no; la integrante, no",
  como(FELIPE_AUTH) + ve + sinAdmin + ve + como(MICAELA_AUTH) + ve,
  "t,t\nf,f\nf,f"
);

caso(
  "el Admin le quita Caja al Líder: pierde Caja (ADR-0253, igual que antes) pero conserva CAYLA Global",
  como(FELIPE_AUTH) + liderSin("caja", "cayla_global") +
    `select concat_ws(',', fn_ve_modulo('caja'), fn_ve_modulo('cayla_global'), fn_ve_modulo('vender'),
       exists (select 1 from fn_mis_modulos() where clave = 'caja'), exists (select 1 from fn_mis_modulos() where clave = 'cayla_global'));`,
  "f,t,t,f,t"
);

caso(
  "si el Admin se la da al Líder de equipo, la ve también un líder que no es Admin",
  como(FELIPE_AUTH) + liderSin() + sinAdmin + ve,
  "t,t"
);

caso(
  "solo das lo que ves, también el líder: uno que no es Admin no la enciende en un rol; el Admin sí",
  como(FELIPE_AUTH) +
    `select crear_rol('Contadora de prueba') as rol \\gset\n` +
    sinAdmin +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array[%L])', :'rol', 'cayla_global'));\n` +
    conAdmin +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array[%L])', :'rol', 'cayla_global'));`,
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 2 &&
      l[0].startsWith("42501|No puedes encender módulos que tú no tienes (CAYLA Global)") &&
      l[0].includes("Pídeselo a un Admin") &&
      l[1] === "SIN_ERROR"
    );
  }
);

caso(
  "un líder que no es Admin tampoco le asigna a alguien un rol que la incluye",
  conRol("Contadora de prueba", ["cayla_global"]) +
    `select id as rol from retail.roles where nombre = 'Contadora de prueba' \\gset\n` +
    sinAdmin +
    `select pg_temp.intento(format('select retail.fn_exigir_rol_dentro_de_lo_mio(%L)', :'rol'));`,
  (s) => s.startsWith("42501|Ese rol incluye módulos que tú no tienes (CAYLA Global)") && s.includes("Pídeselo a un Admin")
);

caso(
  "con un rol que la tiene, la integrante ve CAYLA Global, su alcance en Finanzas es todas las sedes y lee la cobertura",
  conRol("Contadora de prueba", ["cayla_global"]) +
    como(MICAELA_AUTH) +
    `select concat_ws(',', fn_ve_modulo('cayla_global'), fn_ve_finanzas_de_todo(), fn_es_lider());\n` +
    intento(`select * from retail.fn_global_cobertura()`),
  "t,t,f\nSIN_ERROR"
);

caso(
  "una terminal no puede tener un rol con CAYLA Global (solo se da a personas)",
  // La terminal se crea con su rol, como lo hacen la pantalla y pnpm terminales:crear (igual que roles_por_modulo.mjs).
  como(FELIPE_AUTH) +
    `select crear_rol('Rol de aparato') as rol \\gset\n` +
    `insert into auth.users (id, aud, role, email) values ('${T_VENTAS_AUTH}', 'authenticated', 'authenticated', 'terminal-cayla-global@prueba.local');\n` +
    `insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) select tru, 'Terminal de prueba', :'rol', '${T_VENTAS_AUTH}'::uuid from ids;\n` +
    `select pg_temp.intento(format('select retail.guardar_modulos_rol(%L, array[%L])', :'rol', 'cayla_global'));`,
  (s) => s.startsWith("23514|") && s.includes("solo se da a personas")
);

caso(
  "fn_global_cobertura: el Admin la lee (una fila por ubicación activa); sin el módulo, 42501 nombrando el módulo; anon no la ejecuta",
  como(FELIPE_AUTH) +
    `select ((select count(*) from retail.fn_global_cobertura()) = (select count(*) from retail.ubicaciones where activo))::text;\n` +
    como(MICAELA_AUTH) +
    intento(`select * from retail.fn_global_cobertura()`) + "\n" +
    `select has_function_privilege('anon', 'retail.fn_global_cobertura()', 'execute')::text;`,
  (s) => {
    const l = s.split("\n");
    return l.length === 3 && l[0] === "true" && l[1].startsWith("42501|Ver CAYLA Global necesita el módulo «CAYLA Global»") && l[2] === "false";
  }
);

caso(
  "la cobertura no cuenta una venta anulada ni una de prueba, y nunca da nulos en ventas ni unidades",
  como(FELIPE_AUTH) +
    `select bool_and(ventas_30d is not null and unidades_stock is not null)::text from retail.fn_global_cobertura();\n` +
    `select (select count(*) from retail.fn_global_cobertura() c
              where c.ventas_30d <> (select count(*) from retail.ventas v where v.ubicacion_id = c.ubicacion_id
                                      and v.estado = 'completada' and not coalesce(v.es_prueba, false)
                                      and v.created_at >= now() - interval '30 days'))::text;`,
  "true\n0"
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
process.exit(fallas ? 1 : 0);

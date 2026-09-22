#!/usr/bin/env node
/**
 * Pruebas de los roles por módulo (ADR-0150 retomado por el ADR-0161 B, migración `20260923030000_roles_por_modulo.sql`).
 *
 * QUÉ PRUEBA
 *   · La siembra: cuatro roles (Líder fijo, Integrante, las dos terminales) con los módulos de hoy, y cada cuenta con el
 *     rol que le toca. Integrante ya NO nace limitado: hace lo de los módulos que ve (B2d, Felipe 2026-09-22, 20260923031000).
 *   · Las reglas: Líder no se edita ni se archiva ni se asigna; Integrante se edita pero no se archiva; un rol con
 *     cuentas no se archiva; solo el líder escribe; los módulos «solo del líder» y «solo líder por ahora» no se delegan;
 *     el historial solo se agrega.
 *   · `fn_ve_modulo` para una persona y para una terminal, y `fn_mis_modulos`.
 *   · EL PUNTO DE ENCHUFE: las capacidades `fn_puede_*()` dan al líder y a las dos terminales sembradas lo mismo que las
 *     definiciones fijas del ADR-0160. La integrante es la ÚNICA que cambia, a propósito (B2d): cierra caja, ajusta stock
 *     y edita el catálogo porque su rol ve esos módulos; no gana cuentas de proveedor ni etiquetas con descuento.
 *   · Terminales sin tipo (20260923040000): se crean con tienda + nombre + rol; el tipo es legado.
 *   · Suspender y reactivar conservan el rol.
 *
 * CÓMO. Mismo patrón que `terminales_sin_persona.mjs`: cada escenario en su transacción con ROLLBACK; las terminales y las
 * personas extra se crean dentro y desaparecen. La sesión se simula con `set local request.jwt.claims`.
 *
 * USO
 *   pnpm pruebas:roles                 → contra la base `postgres` del stack local
 *   pnpm pruebas:roles --base cayla_x  → contra otra base del mismo contenedor
 *   … --en-seco                        → carga la migración dentro de cada escenario
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
// En seco: la migración de roles y las dos que la ajustan después (B2d y terminales sin tipo), en orden.
const MIGRACION = ["20260923030000_roles_por_modulo.sql", "20260923031000_integrante_hace_lo_que_ve.sql", "20260923040000_terminales_sin_tipo.sql"]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo).
const FELIPE_AUTH = "22222222-2222-4222-8222-000000000001";
const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003";
const T_VENTAS_AUTH = "33333333-3333-4333-8333-0000000000a1";
const T_ADMIN_AUTH = "33333333-3333-4333-8333-0000000000a2";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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

// La base local la comparten muchas sesiones y la pantalla Roles y accesos EDITA los módulos de los roles sembrados (le
// encienden Facturación a Integrante, por ejemplo). Cada escenario arranca con los tres roles sembrados tal como los deja
// la migración 20260923030000 (se leen del archivo, no se copian a mano); el ROLLBACK devuelve lo que había.
const SIEMBRA_ROLES = (() => {
  const mig = readFileSync(join(RAIZ, "supabase", "migrations", "20260923030000_roles_por_modulo.sql"), "utf8");
  return ["integrante", "terminal_ventas", "terminal_administrativa"]
    .map((clave) => {
      const bloque = mig.split(`values ('${clave}'`)[1].split("end if;")[0];
      const modulos = [...bloque.matchAll(/unnest\(array\[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
      return `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), m from unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]) m;`;
    })
    .join("\n") + "\nupdate retail.roles set limitado_como_hoy = false where clave = 'integrante';\n";
})();

const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
${SIEMBRA_ROLES}
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
         retail.fn_rol_por_clave('lider') as r_lider,
         retail.fn_rol_por_clave('integrante') as r_integ,
         retail.fn_rol_por_clave('terminal_ventas') as r_tv,
         retail.fn_rol_por_clave('terminal_administrativa') as r_ta;
grant select on ids to authenticated;
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS_AUTH}', 'authenticated', 'authenticated', 'terminal-ventas-tru@prueba.local'),
  ('${T_ADMIN_AUTH}', 'authenticated', 'authenticated', 'terminal-admin-tru@prueba.local');
-- Sin tipo (20260923040000): se crean con su rol, como lo hacen la pantalla y pnpm terminales:crear.
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select tru, 'Terminal Ventas TRU', r_tv, '${T_VENTAS_AUTH}'::uuid from ids
  union all select tru, 'Terminal Administrativa TRU', r_ta, '${T_ADMIN_AUTH}'::uuid from ids;
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const CUENTAS = [
  ["líder", FELIPE_AUTH],
  ["integrante", MICAELA_AUTH],
  ["terminal de ventas", T_VENTAS_AUTH],
  ["terminal administrativa", T_ADMIN_AUTH],
];

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
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);`;
const modulosDe = (clave) =>
  `select string_agg(modulo, ',' order by modulo) from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');`;

// ---------------- La siembra ----------------
caso("hay 23 módulos; Colaboradores y Roles son siempre solo del líder", `select count(*), string_agg(clave, ',' order by clave) filter (where solo_lider) from retail.modulos;`, "23|colaboradores,roles");
caso(
  "«solo líder por ahora» (la base aún no los deja a nadie más): etiquetas, montos de Compras y Análisis",
  `select string_agg(clave, ',' order by clave) from retail.modulos where not delegable and not solo_lider;`,
  "analisis,etiquetas,facturas_compra,notas_credito,por_pagar"
);
caso(
  "cuatro roles sembrados: Líder fijo y de sistema, Integrante de sistema (ya no limitado: B2d), las terminales a medida",
  `select string_agg(concat_ws(':', clave, es_sistema, fijo, limitado_como_hoy), ',' order by clave) from retail.roles where clave is not null;`,
  "integrante:t:f:f,lider:t:t:f,terminal_administrativa:f:f:f,terminal_ventas:f:f:f"
);
caso("Líder no guarda módulos: ya ve todo", modulosDe("lider"), "");
caso(
  "Integrante ve lo que un integrante ve hoy en el menú (más Clientas)",
  modulosDe("integrante"),
  "atributos,caja,cambios,clientas,conteos,devoluciones,existencias,historial,movimientos,produccion,productos,recibir,traslados,vender"
);
caso("Terminal de ventas: Ventas entero con Facturación, y Clientas", modulosDe("terminal_ventas"), "caja,cambios,clientas,devoluciones,facturacion,historial,vender");
caso(
  "Terminal administrativa: Inventario, Catálogo, Recibir y Proveedores",
  modulosDe("terminal_administrativa"),
  "atributos,conteos,existencias,movimientos,productos,proveedores,recibir,traslados"
);
caso(
  "cada persona tiene el rol de su nivel (líder ⇔ Líder) y cada terminal el que se le dio al crearla (sin tipo)",
  `select (select count(*) from retail.colaboradores c where (c.rol = 'lider') <> (c.rol_id = retail.fn_rol_por_clave('lider'))
            or (c.rol = 'colaborador' and c.rol_id is distinct from retail.fn_rol_por_clave('integrante')))
       || '|' || (select string_agg(coalesce(t.tipo, 'sin tipo') || ':' || r.clave, ',' order by t.nombre) from retail.terminales t join retail.roles r on r.id = t.rol_id);`,
  "0|sin tipo:terminal_administrativa,sin tipo:terminal_ventas"
);
caso(
  "una persona nueva entra como Integrante",
  `insert into public.personas (id, nombres, apellidos, estado, sede_base_id)
     select '33333333-3333-4333-8333-0000000000c1', 'Nueva', 'Prueba', 'activo', sede_dynamic_id from retail.ubicaciones where id = (select tru from ids);
   insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '33333333-3333-4333-8333-0000000000c1', 'colaborador', tru from ids;
   select r.clave from retail.colaboradores c join retail.roles r on r.id = c.rol_id where c.persona_id = '33333333-3333-4333-8333-0000000000c1';`,
  "integrante"
);
caso(
  "una terminal no puede tener el rol Líder",
  intento(`update retail.terminales set rol_id = retail.fn_rol_por_clave('lider') where auth_user_id = '${T_VENTAS_AUTH}'`),
  (s) => s.startsWith("23514|")
);

// ---------------- Qué ve cada cuenta ----------------
caso(
  "fn_ve_modulo: el líder ve todo, Colaboradores y Roles incluidos",
  como(FELIPE_AUTH) + `select bool_and(retail.fn_ve_modulo(clave))::text from retail.modulos;`,
  "true"
);
caso(
  "fn_ve_modulo: la integrante ve Caja y Existencias, no Facturación, ni Colaboradores, ni Roles",
  como(MICAELA_AUTH) + `select concat_ws(',', fn_ve_modulo('caja'), fn_ve_modulo('existencias'), fn_ve_modulo('facturacion'), fn_ve_modulo('colaboradores'), fn_ve_modulo('roles'));`,
  "t,t,f,f,f"
);
caso(
  "fn_ve_modulo: la terminal de ventas ve Facturación, no Existencias; la administrativa al revés",
  como(T_VENTAS_AUTH) + `select concat_ws(',', fn_ve_modulo('facturacion'), fn_ve_modulo('existencias'));\n` +
    como(T_ADMIN_AUTH) + `select concat_ws(',', fn_ve_modulo('facturacion'), fn_ve_modulo('existencias'));`,
  "t,f\nf,t"
);
caso(
  "fn_mis_modulos: 23 al líder, 14 a la integrante, 7 y 8 a las terminales; todos completos (B2d)",
  CUENTAS.map(([, a]) => como(a) + `select count(*) || ':' || count(*) filter (where completo) from fn_mis_modulos();`).join("\n"),
  "23:23\n14:14\n7:7\n8:8"
);
caso("sin sesión, no ve nada", `select fn_ve_modulo('vender')::text || '|' || (select count(*) from fn_mis_modulos());`, "false|0");

// ---------------- EL PUNTO DE ENCHUFE: nada cambia hoy ----------------
// Matriz de TODAS las capacidades sin parámetros (`fn_puede_*()` y `fn_es_lider`) para las cuatro cuentas, primero con
// esta migración y después con las definiciones fijas del ADR-0160 recreadas en la misma transacción. Deben ser iguales.
const MATRIZ = `
select string_agg(format('%s=%s', p.proname, v.valor), ',' order by p.proname)
  from pg_proc p
  cross join lateral (select pg_temp.valor(p.proname) as valor) v
 where p.pronamespace = 'retail'::regnamespace and p.pronargs = 0 and p.prorettype = 'boolean'::regtype
   and (p.proname like 'fn_puede_%' or p.proname in ('fn_es_lider', 'fn_es_terminal'));`;
const VALOR = `create function pg_temp.valor(p text) returns text language plpgsql as $f$
declare v boolean; begin execute format('select retail.%I()', p) into v; return coalesce(v::text, 'NULL');
exception when others then return 'ERROR'; end; $f$;\n`;
const ADR_0160 = `
create or replace function retail.fn_puede_gestionar_caja() returns boolean language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('ventas'); $$;
create or replace function retail.fn_puede_ajustar_inventario() returns boolean language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('administrativa'); $$;
create or replace function retail.fn_puede_editar_catalogo() returns boolean language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('administrativa'); $$;
create or replace function retail.fn_puede_editar_cuentas_proveedor() returns boolean language sql stable set search_path = retail, public, extensions
as $$ select fn_es_lider() or fn_es_terminal('administrativa'); $$;
`;
{
  let antes = null;
  const r = correr(
    `${PRELUDIO}${VALOR}` +
      CUENTAS.map(([, a]) => como(a) + MATRIZ).join("\n") +
      `\n${ADR_0160}\n` +
      CUENTAS.map(([, a]) => como(a) + MATRIZ).join("\n") +
      `\nrollback;`
  );
  casos++;
  if (!r.ok) {
    fallas++;
    console.log(`✗ capacidades: no se pudo calcular la matriz\n    ${r.mensaje.split("\n").find((l) => l.includes("ERROR"))}`);
  } else {
    const filas = r.salida.split("\n");
    const ahora = filas.slice(0, 4);
    antes = filas.slice(4, 8);
    // La integrante se salta A PROPÓSITO: B2d (20260923031000) le da lo de los módulos que ve. Su fila se mira abajo.
    const distintas = CUENTAS.map(([n], k) => (n === "integrante" || ahora[k] === antes[k] ? null : `${n}:\n      hoy:     ${antes[k]}\n      ahora:   ${ahora[k]}`)).filter(Boolean);
    if (distintas.length) {
      fallas++;
      console.log(`✗ las capacidades dan lo mismo que con el ADR-0160 para el líder y las dos terminales\n    ${distintas.join("\n    ")}`);
    } else {
      console.log(`✓ las capacidades dan lo mismo que con el ADR-0160 para el líder y las dos terminales (${ahora[0].split(",").length} capacidades)`);
    }
  }
}
caso(
  "las 4 capacidades por cuenta, a la vista (caja, inventario, catálogo, cuentas de proveedor, etiqueta con descuento)",
  CUENTAS.map(
    ([, a]) =>
      como(a) +
      `select concat_ws(',', fn_puede_gestionar_caja(), fn_puede_ajustar_inventario(), fn_puede_editar_catalogo(), fn_puede_editar_cuentas_proveedor(), fn_puede_dar_descuento_por_etiqueta());`
  ).join("\n"),
  "t,t,t,t,t\nt,t,t,f,f\nt,f,f,f,f\nf,t,t,t,f"
);
caso(
  "B2d: la integrante hace lo de los módulos que VE — si se le apaga Caja, deja de cerrar caja; con Existencias ajusta stock",
  como(FELIPE_AUTH) +
    `select guardar_modulos_rol(r_integ, array['vender','existencias']) from ids \\g /dev/null\n` +
    como(MICAELA_AUTH) +
    `select concat_ws(',', fn_ve_modulo('caja'), fn_puede_gestionar_caja(), fn_puede_ajustar_inventario(), fn_puede_editar_catalogo());`,
  "f,f,t,f"
);
caso(
  "un rol `limitado_como_hoy` (queda disponible) VE sus módulos pero no recibe las capacidades de escritura",
  `update retail.roles set limitado_como_hoy = true where clave = 'integrante';\n` +
    como(FELIPE_AUTH) +
    `select guardar_modulos_rol(r_integ, array['vender','caja','existencias','facturacion']) from ids \\g /dev/null\n` +
    como(MICAELA_AUTH) +
    `select concat_ws(',', fn_ve_modulo('facturacion'), fn_puede_gestionar_caja(), fn_puede_ajustar_inventario());`,
  "t,f,f"
);
caso(
  "un rol a medida aplica la regla al pie de la letra: «Almacén» con Existencias ajusta stock, pero no cierra caja",
  como(FELIPE_AUTH) +
    `select asignar_rol(crear_rol('Almacén'), micaela) from ids \\g /dev/null\n` +
    `select guardar_modulos_rol(id, array['existencias','conteos','traslados','movimientos','recibir']) from retail.roles where nombre = 'Almacén' \\g /dev/null\n` +
    como(MICAELA_AUTH) +
    `select concat_ws(',', fn_ve_modulo('existencias'), fn_ve_modulo('vender'), fn_puede_ajustar_inventario(), fn_puede_gestionar_caja(), fn_puede_editar_catalogo());`,
  "t,f,t,f,f"
);
caso(
  "cambiarle el rol a una terminal cambia lo que ve y lo que hace: la de ventas con el rol administrativo",
  como(FELIPE_AUTH) +
    `select asignar_rol(r_ta, p_terminal_id => (select id from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}')) from ids \\g /dev/null\n` +
    como(T_VENTAS_AUTH) +
    `select concat_ws(',', fn_ve_modulo('vender'), fn_ve_modulo('existencias'), fn_puede_gestionar_caja(), fn_puede_ajustar_inventario());`,
  "f,t,f,t"
);
caso(
  "la etiqueta con descuento sigue siendo solo del líder, aunque el rol vea Productos y Etiquetas",
  como(T_ADMIN_AUTH) + `select fn_puede_dar_descuento_por_etiqueta()::text;`,
  "false"
);

// ---------------- Reglas de los roles ----------------
caso(
  "Líder no se edita, no se archiva y no se asigna",
  como(FELIPE_AUTH) +
    intento(`select retail.guardar_modulos_rol(retail.fn_rol_por_clave('lider'), array['vender'])`) + "\n" +
    intento(`select retail.archivar_rol(retail.fn_rol_por_clave('lider'))`) + "\n" +
    intento(`select retail.renombrar_rol(retail.fn_rol_por_clave('lider'), 'Jefa')`) + "\n" +
    `select pg_temp.intento(format('select retail.asignar_rol(%L, %L)', r_lider, micaela)) from ids;`,
  (s) => s.split("\n").length === 4 && s.split("\n").every((l) => l.startsWith("42501|"))
);
caso(
  "Integrante se edita y se renombra, pero no se archiva",
  como(FELIPE_AUTH) +
    `select guardar_modulos_rol(r_integ, array['vender','caja']) from ids \\g /dev/null\n` +
    `select renombrar_rol(r_integ, 'Vendedora') from ids \\g /dev/null\n` +
    modulosDe("integrante") + "\n" +
    `select nombre from retail.roles where clave = 'integrante';\n` +
    intento(`select retail.archivar_rol(retail.fn_rol_por_clave('integrante'))`),
  (s) => s.startsWith("caja,vender\nVendedora\n42501|")
);
caso(
  "solo el líder escribe roles (una integrante y una terminal, rechazadas)",
  [MICAELA_AUTH, T_ADMIN_AUTH]
    .map(
      (a) =>
        como(a) +
        intento(`select retail.crear_rol('Mío')`) + "\n" +
        intento(`select retail.guardar_modulos_rol(retail.fn_rol_por_clave('integrante'), array['facturacion'])`) + "\n" +
        intento(`select * from retail.fn_cuentas_con_rol()`)
    )
    .join("\n"),
  (s) => s.split("\n").length === 6 && s.split("\n").every((l) => l.startsWith("42501|"))
);
caso(
  "RLS: como rol de la API, una integrante no lee roles ni escribe en ninguna tabla de roles",
  como(MICAELA_AUTH) +
    `set local role authenticated;\nselect count(*) from retail.roles;\nselect count(*) from retail.modulos;\n` +
    intento(`insert into retail.rol_modulos values (retail.fn_rol_por_clave('integrante'), 'facturacion')`),
  (s) => s.startsWith("0\n23\n42501|")
);
caso(
  "no se delega un módulo solo del líder ni uno «solo líder por ahora», ni siquiera a mano",
  como(FELIPE_AUTH) +
    intento(`select retail.guardar_modulos_rol(retail.fn_rol_por_clave('terminal_ventas'), array['vender','colaboradores'])`) + "\n" +
    intento(`select retail.guardar_modulos_rol(retail.fn_rol_por_clave('terminal_ventas'), array['vender','analisis'])`) + "\n" +
    intento(`insert into retail.rol_modulos values (retail.fn_rol_por_clave('terminal_ventas'), 'roles')`) + "\n" +
    intento(`select retail.guardar_modulos_rol(retail.fn_rol_por_clave('terminal_ventas'), array['no_existe'])`),
  (s) => {
    const l = s.split("\n");
    return l.length === 4 && l[0].startsWith("23514|") && l[1].includes("por ahora") && l[2].startsWith("23514|") && l[3].includes("No existe");
  }
);
caso(
  "un rol con cuentas no se archiva; sin cuentas sí, y se restaura",
  como(FELIPE_AUTH) +
    intento(`select retail.archivar_rol(retail.fn_rol_por_clave('terminal_ventas'))`) + "\n" +
    `select archivar_rol(crear_rol('Temporal')) \\g /dev/null\n` +
    `select (archivado_at is not null)::text from retail.roles where nombre = 'Temporal';\n` +
    `select restaurar_rol(id) from retail.roles where nombre = 'Temporal' \\g /dev/null\n` +
    `select (archivado_at is null)::text from retail.roles where nombre = 'Temporal';`,
  (s) => /^23503\|.*\ntrue\ntrue$/.test(s)
);
caso(
  "un rol archivado no se asigna ni se edita, y su nombre queda libre",
  como(FELIPE_AUTH) +
    `select archivar_rol(crear_rol('Viejo')) \\g /dev/null\n` +
    `select pg_temp.intento(format('select retail.asignar_rol(%L, %L)', (select id from retail.roles where nombre = 'Viejo'), micaela)) from ids;\n` +
    intento(`select retail.guardar_modulos_rol((select id from retail.roles where nombre = 'Viejo'), array['vender'])`) + "\n" +
    intento(`select retail.crear_rol('viejo')`),
  (s) => {
    const l = s.split("\n");
    return l[0].includes("archivado") && l[1].includes("archivado") && l[2] === "SIN_ERROR";
  }
);
caso("dos roles vigentes no se llaman igual", como(FELIPE_AUTH) + intento(`select retail.crear_rol('integrante')`), (s) => s.startsWith("23505|"));
caso(
  "Duplicar copia los módulos del rol de origen",
  como(FELIPE_AUTH) +
    `create temp table copia as select crear_rol('Copia TV', null, retail.fn_rol_por_clave('terminal_ventas')) as id;\n` +
    `select string_agg(modulo, ',' order by modulo) from retail.rol_modulos where rol_id = (select id from copia);`,
  "caja,cambios,clientas,devoluciones,facturacion,historial,vender"
);
caso(
  "a un líder no se le cambia el rol",
  como(FELIPE_AUTH) + `select pg_temp.intento(format('select retail.asignar_rol(%L, %L)', r_integ, felipe)) from ids;`,
  (s) => s.startsWith("42501|")
);

// ---------------- Quién firma (convención del ADR-0162 F3, vigilada también en actor_firma_las_operaciones.mjs) ----------------
caso(
  "las 6 RPC de roles firman con el actor de no-tienda, una sola vez cada una; de lo nuevo, solo fn_mi_rol_id mira la cuenta",
  `select string_agg(proname || ':' || ((length(d) - length(replace(d, 'fn_actor_persona_id(false)', ''))) / length('fn_actor_persona_id(false)')), ',' order by proname)
     from (select proname, pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace
            and proname in ('crear_rol', 'guardar_modulos_rol', 'renombrar_rol', 'archivar_rol', 'restaurar_rol', 'asignar_rol')) x;
   select string_agg(proname, ',' order by proname) from pg_proc
    where pronamespace = 'retail'::regnamespace and pg_get_functiondef(oid) ~* 'auth_user_id\\s*=\\s*auth\\.uid\\(\\)'
      and proname in ('fn_mi_rol_id', 'fn_ve_modulo', 'fn_capacidad_por_modulos', 'fn_mis_modulos', 'crear_rol', 'guardar_modulos_rol',
                      'renombrar_rol', 'archivar_rol', 'restaurar_rol', 'asignar_rol', 'fn_cuentas_con_rol', 'fn_cuentas_del_rol');`,
  "archivar_rol:1,asignar_rol:1,crear_rol:1,guardar_modulos_rol:1,renombrar_rol:1,restaurar_rol:1\nfn_mi_rol_id"
);

// ---------------- Historial ----------------
caso(
  "cada escritura deja su línea en el historial, con quién la hizo",
  como(FELIPE_AUTH) +
    `create temp table antes as select count(*) n from retail.roles_historial;\n` +
    `select asignar_rol(crear_rol('Hist'), micaela) from ids \\g /dev/null\n` +
    `select guardar_modulos_rol(id, array['vender']) from retail.roles where nombre = 'Hist' \\g /dev/null\n` +
    `select renombrar_rol(id, 'Hist 2') from retail.roles where nombre = 'Hist' \\g /dev/null\n` +
    `select asignar_rol(r_integ, micaela) from ids \\g /dev/null\n` +
    `select archivar_rol(id) from retail.roles where nombre = 'Hist 2' \\g /dev/null\n` +
    `select string_agg(accion, ',' order by id) || '|' || bool_and(hecho_por = (select felipe from ids))::text
       from retail.roles_historial where id > (select max(id) from retail.roles_historial) - ((select count(*) from retail.roles_historial) - (select n from antes));`,
  "creacion,asignacion,modulos,renombre,asignacion,archivo|true"
);
caso(
  "el historial solo se agrega: ni update, ni delete, ni truncate (ni siquiera como postgres)",
  intento(`update retail.roles_historial set accion = 'archivo'`) + "\n" +
    intento(`delete from retail.roles_historial`) + "\n" +
    intento(`truncate retail.roles_historial`),
  (s) => s.split("\n").every((l) => l.startsWith("42501|"))
);

// ---------------- Suspender y reactivar conservan el rol ----------------
caso(
  "una persona suspendida y reactivada vuelve con SU rol, no con Integrante",
  como(FELIPE_AUTH) +
    `select asignar_rol(crear_rol('Almacén'), micaela) from ids \\g /dev/null\n` +
    `select suspender_colaborador(micaela, 'prueba') from ids \\g /dev/null\n` +
    `select r.nombre from retail.colaboradores_suspendidos s join retail.roles r on r.id = s.rol_id where s.persona_id = (select micaela from ids);\n` +
    intento(`select retail.archivar_rol((select id from retail.roles where nombre = 'Almacén'))`) + "\n" +
    `select reactivar_colaborador(micaela) from ids \\g /dev/null\n` +
    `select r.nombre from retail.colaboradores c join retail.roles r on r.id = c.rol_id where c.persona_id = (select micaela from ids);`,
  (s) => /^Almacén\n23503\|.*\nAlmacén$/.test(s)
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);

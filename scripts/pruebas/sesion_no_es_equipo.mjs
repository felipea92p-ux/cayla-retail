#!/usr/bin/env node
/**
 * Prueba de «tener sesión no es ser del equipo» (`20261015221000_lecturas_de_retail_solo_para_el_equipo.sql`).
 *
 * EL PROBLEMA. Las cuentas de retail son las del proyecto que comparte con Dynamic. 35 reglas de fila de `retail` dejaban
 * pasar a toda cuenta con sesión, fuera o no del equipo. Ahora preguntan `fn_tiene_acceso_retail()`.
 *
 * QUÉ CUBRE
 *   A. Una cuenta de Dynamic que no trabaja en retail (persona sin colaborador) no lee ninguna de esas tablas y no da de
 *      alta colores, tallas, tejidos, patrones ni etiquetas.
 *   B. El líder lee el catálogo, las sedes, los proveedores y los módulos, y da de alta un color.
 *   C. Una colaboradora activa lee el catálogo y las sedes.
 *   D. Una terminal de tienda (cuenta de aparato, sin persona) lee el catálogo y las sedes.
 *   E. Las dos migraciones se pueden volver a pegar.
 *   F. A esa misma cuenta, las funciones de personas no le dan nombres ni fotos, la meta y el fondo de caja la rechazan,
 *      el saldo por tienda de una factura le llega vacío, las piezas internas (meta del mes, horas, recalcular compras) no
 *      se pueden llamar, y no sube archivos a los buckets de retail.
 *   G. El líder ve nombres, la meta del día y el saldo por tienda, y sube una foto de prenda; una terminal ve la meta del
 *      día de su tienda.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido). Cada transacción
 * pega primero la migración: en local prueba el cambio aunque todavía no se haya aplicado, y en el CI (donde ya está)
 * prueba además que se puede volver a pegar. La sesión se simula con `request.jwt.claim.sub` y `role authenticated`.
 *
 * USO
 *   pnpm pruebas:sesion-no-es-equipo
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACIONES = [
  "20261015221000_lecturas_de_retail_solo_para_el_equipo.sql",
  "20261015222000_funciones_y_subidas_solo_para_el_equipo.sql",
].map((m) =>
  readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8"),
);
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo (seed)
const DE_DYNAMIC = "55555555-5555-4555-8555-0000000000e1"; // cuenta de Dynamic sin colaborador en retail (se crea aquí)
const TERMINAL = "55555555-5555-4555-8555-0000000000e2"; // terminal de tienda (se crea aquí)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Corre `sql` en una transacción que siempre se deshace, con la migración pegada antes. */
function correr(sql) {
  try {
    const salida = psql(`begin;\n${PRELUDIO}\n${MIGRACIONES.join("\n")}\nreset search_path;\n${CUENTAS}\n${sql}\nrollback;\n`);
    return { ok: true, lineas: salida.trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// `pg_temp.intento(sql)` devuelve «ok» o el mensaje del error, sin abortar la transacción.
// `pg_temp.filas(tabla)` cuenta lo que la cuenta ve; un «permiso denegado» cuenta como cero (tampoco ve nada).
const PRELUDIO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end $f$;
create function pg_temp.filas(p_tabla text) returns bigint language plpgsql as $f$
declare v bigint;
begin
  execute format('select count(*) from retail.%I', p_tabla) into v;
  return v;
exception when insufficient_privilege then
  return 0;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated;
grant execute on function pg_temp.filas(text) to authenticated;
`;

// La cuenta de Dynamic (persona activa, sin colaborador en retail) y la terminal de Tienda Trujillo.
const CUENTAS = `
insert into auth.users (id, aud, role, email) values ('${DE_DYNAMIC}', 'authenticated', 'authenticated', 'solo-dynamic@prueba.local');
insert into public.personas (auth_user_id, nombres, apellidos, sede_base_id, estado)
  values ('${DE_DYNAMIC}', 'Persona', 'Solo Dynamic', (select id from public.sedes order by id limit 1), 'activo');
insert into auth.users (id, aud, role, email) values ('${TERMINAL}', 'authenticated', 'authenticated', 'terminal-sesion@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values ((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), 'Terminal prueba sesión',
          retail.fn_rol_por_clave('terminal_ventas'), '${TERMINAL}');
`;

const comoCuenta = (id) =>
  `set local role authenticated;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claim.role = 'authenticated';\n`;

// Las tablas de las 35 reglas (gastos_legado_2026_09 solo existe en producción).
const TABLAS = [
  "activos_fijos", "categoria_patrones", "categoria_tallas", "categoria_tejidos", "categorias", "codigos_barras",
  "codigos_correlativos", "codigos_descuento", "colores", "configuracion_empresa", "cotizaciones_maquila",
  "etiqueta_categorias", "etiquetas", "familias", "insumos", "marca_proveedores", "marcas", "modulos", "patrones",
  "producto_fotos", "productos", "proveedores", "sububicaciones", "tallas", "tejidos", "ubicacion_datos_fiscales",
  "ubicaciones", "variante_etiquetas", "variantes",
];
const CATALOGO = ["categorias", "productos", "variantes", "ubicaciones", "colores", "tallas"];

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`   ${JSON.stringify(detalle).slice(0, 900)}`);
  }
}
const ultima = (r) => (r.ok ? r.lineas[r.lineas.length - 1] : undefined);
const cuentas = (tablas) => `select ${tablas.map((t) => `pg_temp.filas('${t}')`).join(" || '|' || ")};`;

// A. La cuenta de Dynamic que no es de retail.
{
  const r = correr(`${comoCuenta(DE_DYNAMIC)}${cuentas(TABLAS)}`);
  const vistas = (ultima(r) ?? "").split("|").map(Number);
  const conFilas = TABLAS.filter((_, i) => vistas[i] > 0);
  esperar("una cuenta de Dynamic que no es de retail no lee ninguna de las 29 tablas", r.ok && vistas.length === TABLAS.length && conFilas.length === 0, conFilas.length ? conFilas : r);

  const altas = correr(`${comoCuenta(DE_DYNAMIC)}
select pg_temp.intento($$insert into retail.colores (codigo, nombre) values ('ZZPRU', 'Color de prueba')$$) || '|' ||
       pg_temp.intento($$insert into retail.tallas (valor) values ('ZZ-PRUEBA')$$) || '|' ||
       pg_temp.intento($$insert into retail.etiquetas (nombre) values ('Etiqueta de prueba')$$);`);
  const rechazos = (ultima(altas) ?? "").split("|");
  esperar("…y no da de alta colores, tallas ni etiquetas", altas.ok && rechazos.length === 3 && rechazos.every((m) => m !== "ok"), altas);
}

// B. El líder.
{
  const r = correr(`${comoCuenta(FELIPE)}${cuentas([...CATALOGO, "proveedores", "modulos"])}`);
  const vistas = (ultima(r) ?? "").split("|").map(Number);
  esperar("el líder lee catálogo, sedes, proveedores y módulos", r.ok && vistas.length === 8 && vistas.every((n) => n > 0), r);
  const alta = correr(`${comoCuenta(FELIPE)}
select pg_temp.intento($$insert into retail.colores (codigo, nombre) values ('ZZPRU', 'Color de prueba')$$);`);
  esperar("…y da de alta un color", ultima(alta) === "ok", alta);
}

// C. Una colaboradora activa.
{
  const r = correr(`${comoCuenta(MICAELA)}${cuentas(CATALOGO)}`);
  const vistas = (ultima(r) ?? "").split("|").map(Number);
  esperar("una colaboradora lee el catálogo y las sedes", r.ok && vistas.length === CATALOGO.length && vistas.every((n) => n > 0), r);
}

// D. Una terminal de tienda.
{
  const r = correr(`${comoCuenta(TERMINAL)}${cuentas(CATALOGO)}`);
  const vistas = (ultima(r) ?? "").split("|").map(Number);
  esperar("una terminal de tienda lee el catálogo y las sedes", r.ok && vistas.length === CATALOGO.length && vistas.every((n) => n > 0), r);
}

// E. Se pueden volver a pegar.
{
  const r = correr(`${MIGRACIONES.join("\n")}\nselect 'repegada';`);
  esperar("las dos migraciones se pueden pegar dos veces", ultima(r) === "repegada", r);
}

// Lo que se pide como «postgres» antes de cambiar de cuenta: los ids que se consultan y una sede.
const IDS = `
select id as felipe_persona from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
`;
const SUBIR_FOTO = `pg_temp.intento($$insert into storage.objects (bucket_id, name) values ('retail-productos-fotos', 'prueba/sesion-no-es-equipo.jpg')$$)`;

// F. La cuenta de Dynamic que no es de retail, contra las funciones y las subidas.
{
  const r = correr(`${IDS}${comoCuenta(DE_DYNAMIC)}
select (select count(*) from retail.fn_nombres_personas(array[:'felipe_persona']::uuid[])) || '|' ||
       (select count(*) from retail.fn_fotos_personas(array[:'felipe_persona']::uuid[])) || '|' ||
       pg_temp.intento(format('select * from retail.fn_parametros_caja(%L, current_date)', :'trujillo')) || '|' ||
       pg_temp.intento(format('select retail.fn_meta_mes(%L, current_date)', :'trujillo')) || '|' ||
       coalesce(retail.fn_saldo_de_tienda(gen_random_uuid(), :'trujillo')::text, 'vacío') || '|' ||
       pg_temp.intento(format('select * from retail.fn_rendimiento_horas_nucleo(array[%L]::uuid[], current_date)', :'trujillo')) || '|' ||
       pg_temp.intento('select retail.recalcular_compras()') || '|' ||
       ${SUBIR_FOTO};`);
  const [nombres, fotos, parametros, metaMes, saldo, horas, recalcular, subida] = (ultima(r) ?? "").split("|");
  esperar("a una cuenta que no es de retail, fn_nombres_personas y fn_fotos_personas no le dan nada", r.ok && nombres === "0" && fotos === "0", r);
  esperar("…fn_parametros_caja la rechaza", parametros?.includes("no es del equipo"), parametros ?? r);
  esperar("…meta del mes, horas y recalcular compras no se pueden llamar",
    [metaMes, horas, recalcular].every((m) => m?.includes("permission denied")), [metaMes, horas, recalcular]);
  esperar("…y el saldo por tienda le llega vacío (al equipo, con una factura cualquiera, le llega 0.00)", saldo === "vacío", saldo ?? r);
  esperar("…y no sube archivos a un bucket de retail", subida !== undefined && subida !== "ok", subida ?? r);
}

// G. El líder y una terminal, igual que siempre.
{
  const lider = correr(`${IDS}${comoCuenta(FELIPE)}
select (select count(*) from retail.fn_nombres_personas(array[:'felipe_persona']::uuid[])) || '|' ||
       pg_temp.intento(format('select * from retail.fn_parametros_caja(%L, current_date)', :'trujillo')) || '|' ||
       coalesce(retail.fn_saldo_de_tienda(gen_random_uuid(), :'trujillo')::text, 'vacío') || '|' ||
       ${SUBIR_FOTO};`);
  const [nombres, parametros, saldo, subida] = (ultima(lider) ?? "").split("|");
  esperar("el líder ve nombres, la meta del día y el saldo por tienda, y sube una foto de prenda",
    nombres === "1" && parametros === "ok" && saldo === "0.00" && subida === "ok", lider);

  const terminal = correr(`${IDS}${comoCuenta(TERMINAL)}
select pg_temp.intento(format('select * from retail.fn_parametros_caja(%L, current_date)', :'trujillo'));`);
  esperar("una terminal ve la meta del día de su tienda", ultima(terminal) === "ok", terminal);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);

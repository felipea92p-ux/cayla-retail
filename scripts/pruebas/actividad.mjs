#!/usr/bin/env node
/**
 * Prueba de ADR-0207 — la actividad de cada módulo (`20260926090000_actividad_por_modulo.sql`).
 *
 * QUÉ CUBRE
 *   · una venta, su anulación, abrir y cerrar caja (con traslado), una entrada al cajón: cada una deja SU línea, con la
 *     persona que firmó, la sede y el módulo correctos;
 *   · la venta se anota al confirmar (disparador diferido): ya con sus prendas y su total;
 *   · la tabla es de solo agregar (ni UPDATE ni DELETE), y la web no puede escribirla ni llamar a las funciones que anotan;
 *   · si anotar falla, la operación NO se cae (principio 9): la venta se guarda igual;
 *   · alcance de `fn_actividad`: sin el módulo, nada; con el módulo, solo SU sede (también un traslado que llega a ella);
 *     el líder, todas; una terminal, nunca; y el módulo no se puede encender en un rol que tiene terminales.
 *
 * CÓMO. Mismo patrón que `caja_cierre_traslado.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea
 * nada en el Postgres local compartido), sesión simulada con `request.jwt.claim.sub`. `set constraints all immediate`
 * dispara en el momento lo que en producción corre al confirmar.
 *
 * USO
 *   pnpm pruebas:actividad    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const ROL_PRUEBA = "44444444-4444-4444-8444-0000000000a7";
const T_VENTAS = "55555555-5555-4555-8555-0000000000a7";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${INTENTO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;

/** Tienda Lima lista para vender (piso, caja propia y stock de BLU-EMMA-NEG-M), como `registrar_venta.mjs`. */
const TIENDA_LISTA = `
${cambiaA(FELIPE)}
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'lima', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'lima', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lima' and estado = 'abierta'
) x) as _previa \\gset
select retail.abrir_caja(:'lima', 100.00, 'prueba automatizada') as caja \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'lima', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'lima', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;

const VENDER_2 = `
select retail.registrar_venta(:'lima',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric * 2)),
  null, gen_random_uuid()) as venta \\gset
set constraints all immediate;
`;

/** Micaela con un rol a medida que ve (o no) «Actividad». */
const MICAELA_CON_ROL = (conActividad) => `
insert into retail.roles (id, nombre, descripcion) values ('${ROL_PRUEBA}', 'Prueba de actividad', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('${ROL_PRUEBA}', 'vender')${conActividad ? `, ('${ROL_PRUEBA}', 'actividad')` : ""};
update retail.colaboradores set rol_id = '${ROL_PRUEBA}' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;

/** Tres líneas conocidas: una de Lima, una de Trujillo y un traslado de Lima a Trujillo. */
const TRES_LINEAS = `
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.actividad (ocurrio_at, modulo, accion, descripcion, ubicacion_id, ubicacion_destino_id, tabla, registro_id)
values (now(), 'caja', 'prueba_actividad', 'línea de Lima', :'lima', null, 'prueba', 'a'),
       (now(), 'caja', 'prueba_actividad', 'línea de Trujillo', :'trujillo', null, 'prueba', 'b'),
       (now(), 'traslados', 'prueba_actividad', 'traslado de Lima a Trujillo', :'lima', :'trujillo', 'prueba', 'c');
`;
const VISTAS = `select string_agg(descripcion, ',' order by registro_id) from retail.fn_actividad(p_limite => 200) where accion = 'prueba_actividad';`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1200)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);

// 1. Venta: su línea en Punto de venta, firmada por quien vendió, con 2 prendas y el total.
{
  const r = correr(`${TIENDA_LISTA}${VENDER_2}
select count(*) || '|' || min(descripcion) || '|' || (min(persona_id::text) = :'felipe') || '|' || (min(ubicacion_id::text) = :'lima') || '|' || min(origen)
  from retail.actividad where tabla = 'ventas' and registro_id = :'venta' and accion = 'venta_registrada' and modulo = 'vender';`);
  const [n, desc, esFelipe, esLima, origen] = (ultima(r) ?? "").split("|");
  esperar("una venta deja una línea en Punto de venta, con quien vendió, la sede y el total", r.ok && n === "1" && /^vendió 2 prendas por S\/ 159\.80/.test(desc) && esFelipe === "true" && esLima === "true" && origen === "vivo", r);
}

// 2. Abrir caja: su línea en Caja.
{
  const r = correr(`${TIENDA_LISTA}
select count(*) from retail.actividad where tabla = 'cajas' and registro_id = :'caja' and accion = 'caja_abierta' and descripcion like 'abrió la caja con S/_100.00%';`);
  esperar("abrir la caja deja su línea en Caja", ultima(r) === "1", r);
}

// 3. Anular: la línea va al Historial de ventas, con el motivo.
{
  const r = correr(`${TIENDA_LISTA}${VENDER_2}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.anular_venta(:'venta', 'talla equivocada', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _a \\gset
select count(*) || '|' || min(descripcion) from retail.actividad where registro_id = :'venta' and accion = 'venta_anulada' and modulo = 'historial';`);
  const [n, desc] = (ultima(r) ?? "").split("|");
  esperar("anular una venta deja su línea en Historial de ventas, con el motivo", n === "1" && desc?.includes("motivo: talla equivocada"), r);
}

// 4. Entrada al cajón y cierre con traslado: tres líneas de Caja.
{
  const r = correr(`${TIENDA_LISTA}
select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Otro', 'sencillo traído de casa') as _i \\gset
select retail.cerrar_caja(:'caja', 130, 100, 'caja_fuerte', null, null) as _c \\gset
select string_agg(accion, ',' order by accion) from retail.actividad where modulo = 'caja' and origen = 'vivo'
   and (registro_id = :'caja' or detalle->>'caja_id' = :'caja') and accion in ('caja_ingreso', 'caja_cerrada', 'caja_traslado');`);
  esperar("una entrada al cajón y el cierre con traslado dejan sus tres líneas", ultima(r) === "caja_cerrada,caja_ingreso,caja_traslado", r);
}

// 5. Solo agregar.
{
  const r = correr(`${TIENDA_LISTA}${VENDER_2}
select pg_temp.intento($$update retail.actividad set descripcion = 'x' where registro_id = '$$ || :'venta' || $$'$$) || '|' ||
       pg_temp.intento($$delete from retail.actividad where registro_id = '$$ || :'venta' || $$'$$);`);
  esperar("la actividad no se edita ni se borra", ultima(r) === "La actividad no se edita ni se borra: es el registro de lo que pasó|La actividad no se edita ni se borra: es el registro de lo que pasó", r);
}

// 6. La web no escribe ni lee la tabla directo, ni inventa líneas con las funciones que anotan.
{
  const r = correr(`${cambiaA(FELIPE)}set local role authenticated;
select pg_temp.intento($$insert into retail.actividad (ocurrio_at, modulo, accion, descripcion, tabla, registro_id) values (now(), 'caja', 'x', 'x', 'x', 'x')$$) || '|' ||
       pg_temp.intento($$select count(*) from retail.actividad$$) || '|' ||
       pg_temp.intento($$select retail.fn_actividad_anotar('caja', 'x', 'x', null, null, null, null, 'x', 'x', now(), '{}', 'vivo')$$);`);
  const partes = (ultima(r) ?? "").split("|");
  esperar("la web no puede escribir, leer directo ni anotar a mano", partes.length === 3 && partes.every((p) => p.startsWith("permission denied")), r);
}

// 7. Si anotar falla, la venta se guarda igual.
{
  const r = correr(`${TIENDA_LISTA}
alter table retail.actividad add constraint prueba_siempre_falla check (false) not valid;
${VENDER_2}
select (select count(*) from retail.ventas where id = :'venta') || '|' || (select count(*) from retail.actividad where registro_id = :'venta');`);
  esperar("si el historial falla, la venta se guarda igual (y no queda línea)", ultima(r) === "1|0", r);
}

// 8. Alcance.
{
  const sinModulo = correr(`${MICAELA_CON_ROL(false)}${cambiaA(MICAELA)}set local role authenticated;
select pg_temp.intento($$select count(*) from retail.fn_actividad()$$);`);
  esperar("sin el módulo «Actividad», una colaboradora no ve nada", ultima(sinModulo) === "No tienes acceso a la actividad", sinModulo);

  const suSede = correr(`${TRES_LINEAS}${MICAELA_CON_ROL(true)}${cambiaA(MICAELA)}set local role authenticated;
select coalesce((select string_agg(descripcion, ',' order by registro_id) from retail.fn_actividad(p_ubicacion_id => :'lima', p_limite => 200) where accion = 'prueba_actividad'), '-');`);
  esperar("con el módulo, solo SU sede (y el traslado que llega a ella), aunque pida otra", ultima(suSede) === "línea de Trujillo,traslado de Lima a Trujillo", suSede);

  const lider = correr(`${TRES_LINEAS}${cambiaA(FELIPE)}set local role authenticated;\n${VISTAS}`);
  esperar("el líder ve todas las sedes", ultima(lider) === "línea de Lima,línea de Trujillo,traslado de Lima a Trujillo", lider);

  const liderUnaSede = correr(`${TRES_LINEAS}${cambiaA(FELIPE)}set local role authenticated;
select string_agg(descripcion, ',' order by registro_id) from retail.fn_actividad(p_ubicacion_id => :'lima', p_limite => 200) where accion = 'prueba_actividad';`);
  esperar("el líder filtra por una sede", ultima(liderUnaSede) === "línea de Lima,traslado de Lima a Trujillo", liderUnaSede);

  const porModulo = correr(`${TRES_LINEAS}${cambiaA(FELIPE)}
select string_agg(descripcion, ',' order by registro_id) from retail.fn_actividad(p_modulo => 'traslados', p_limite => 200) where accion = 'prueba_actividad';`);
  esperar("filtra por módulo", ultima(porModulo) === "traslado de Lima a Trujillo", porModulo);

  const terminal = correr(`
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into auth.users (id, aud, role, email) values ('${T_VENTAS}', 'authenticated', 'authenticated', 'terminal-actividad@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'trujillo', 'Terminal prueba actividad', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}');
${cambiaA(T_VENTAS)}
select pg_temp.intento($$select count(*) from retail.fn_actividad()$$) || '|' ||
       pg_temp.intento($$insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'actividad')$$);`);
  const [lee, enciende] = (ultima(terminal) ?? "").split("|");
  esperar("una terminal no ve la actividad", lee === "La actividad no se ve desde una terminal", terminal);
  esperar("«Actividad» no se enciende en un rol que tienen terminales", enciende?.includes("solo se da a personas"), terminal);
}

// 9. La carga inicial no repite: volver a correrla no suma líneas.
{
  const r = correr(`
select count(*) as antes from retail.actividad \\gset
select retail.fn_actividad_venta_registrada(id, 'carga_inicial') from retail.ventas;
select retail.fn_actividad_caja_abierta(id, 'carga_inicial') from retail.cajas;
select (select count(*) from retail.actividad) - :antes;`);
  esperar("la carga inicial es re-ejecutable (no duplica)", ultima(r) === "0", r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);

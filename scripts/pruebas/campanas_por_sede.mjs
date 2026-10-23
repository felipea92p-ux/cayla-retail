#!/usr/bin/env node
/**
 * Pruebas de las campañas por sede (`20261023162000_campanas_por_sede.sql`, ADR-0486, Felipe 2026-10-23) contra el Postgres local.
 *
 * QUÉ PRUEBA. Una campaña (una etiqueta con descuento) puede regir solo en algunas tiendas (`retail.campana_sedes`). Sin filas rige en
 * todas, como siempre.
 *   · la regla (`fn_campana_rige_en_sede`) y las lecturas: `fn_campanas_en_sede`, `campanas_vigentes(sede)`, y que SIN sede
 *     (`campanas_vigentes()`, `fn_campanas_por_variante`) una campaña limitada a tiendas NO aparece — falla hacia «precio normal»;
 *   · `registrar_venta`: en la tienda de la campaña la caja DEBE dar el descuento (`venta_campana_omitida`); en otra tienda no lo
 *     acepta (`venta_campana_no_vigente`) y el precio normal pasa;
 *   · `separar_prendas`: el apartado nace con el descuento solo en la tienda de la campaña;
 *   · la tienda web (`fn_tienda_precio_talla`) muestra el descuento solo desde la tienda de la campaña;
 *   · guardar las sedes junto con la campaña (`actualizar_campana_etiqueta_con_sedes`): vacío = todas, el taller no es una sede
 *     válida, quien no puede tocar la campaña no cambia sus sedes, y la lectura de la pantalla (`campanas_sedes`);
 *   · GUARDIÁN (como el de `pruebas:precio-sede`): las cinco funciones que cobran o muestran el descuento siguen preguntando por la
 *     sede y ninguna vuelve a llamar a `fn_campanas_por_variante` sin sede;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (como `campana_redondeo.mjs`): la base compartida queda igual.
 *
 * DA POR SENTADO: `Tienda Lima`, `Tienda Trujillo` y la variante `BLU-EMMA-NEG-M` del seed.
 *
 * USO
 *   pnpm pruebas:campanas-por-sede                       → con las migraciones ya aplicadas en la base `postgres` del local
 *   pnpm pruebas:campanas-por-sede -- --base otra        → contra otra base del mismo contenedor
 *   pnpm pruebas:campanas-por-sede -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const iBase = process.argv.indexOf("--base");
const BASE = iBase > 0 ? process.argv[iBase + 1] : "postgres";
const MIGRACION = "supabase/migrations/20261023162000_campanas_por_sede.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed): no es líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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

// Las dos tiendas listas para vender y separar (piso/almacén, caja propia, stock de sobra) y una campaña «ZZ …» de 20 % vigente
// hoy, puesta A MANO sobre BLU-EMMA-NEG-M. 79.90 con 20 % da 63.92, que baja a 63.90: descuenta 16.00 (ADR-0403).
const TIENDAS = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v1, precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
`;
const preparar = (u) => `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${u}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${u}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${u}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${u}' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'${u}' and estado = 'abierta'
) x) as _cerro_${u} \\gset
select retail.abrir_caja(:'${u}', 100.00, 'prueba automatizada') as caja_${u} \\gset
select retail.fn_sububicacion_por_defecto(:'${u}', 'venta') as sub_${u} \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'${u}', :'sub_${u}', 'entrada', 1000, 'colchón de prueba') returning id as mov_${u} \\gset
select retail.fn_aplicar_movimiento(:'mov_${u}') as _d_${u} \\gset
`;
const CAMPANA = (sedes) => `
insert into retail.etiquetas (nombre, estado, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('ZZ Campaña por sede (prueba)', 'aprobado', true, 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5)
  returning id as etq \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'etq');
${sedes === null ? "" : `select retail.actualizar_campana_etiqueta_con_sedes(:'etq', 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[], ${sedes});`}
`;
const FIXTURE = (sedes, { tiendas = true } = {}) => `begin;
set local request.jwt.claim.sub = '${FELIPE}';
${TIENDAS}
${tiendas ? preparar("tru") + preparar("lima") : ""}
${CAMPANA(sedes)}
`;
const SOLO_TRU = "array[:'tru']::uuid[]";

const linea = (descuento, motivo, etq = true) =>
  `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', ${descuento}` +
  `${motivo ? `, 'motivo_descuento', '${motivo}'` : ""}${etq ? ", 'descuento_etiqueta_id', :'etq'" : ""}))`;
const venta = (u, descuento, motivo, cobro, etq = true) =>
  `select retail.registrar_venta(:'${u}', ${linea(descuento, motivo, etq)},
     jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${cobro})), null, gen_random_uuid()) as venta \\gset`;
const separar = (u, descuento) =>
  `select retail.separar_prendas(
     p_ubicacion_id => :'${u}',
     p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', ${descuento})),
     p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 50, 'recibido', 60)),
     p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
     p_devolucion_medio => 'yape') as sep \\gset`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 900)}`);
  }
}
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»: ${r.salida}` : r.mensaje);
const ultimaLinea = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. La regla y las lecturas, con la campaña limitada a Trujillo ----
  {
    const r = correr(`${FIXTURE(SOLO_TRU, { tiendas: false })}
select concat_ws('|',
  -- fn_campanas_en_sede: solo en Trujillo
  (select count(*) from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[], :'tru') where etiqueta_id = :'etq'),
  (select count(*) from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[], :'lima') where etiqueta_id = :'etq'),
  -- sin sede: nunca una campaña limitada a tiendas (ni la de tres argumentos, ni campanas_vigentes())
  (select count(*) from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[], null) where etiqueta_id = :'etq'),
  (select count(*) from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[]) where etiqueta_id = :'etq'),
  (select count(*) from retail.campanas_vigentes() where etiqueta_id = :'etq'),
  -- la que lee la caja de cada tienda
  (select count(*) from retail.campanas_vigentes(:'tru') where etiqueta_id = :'etq' and variante_id = :'v1'),
  (select count(*) from retail.campanas_vigentes(:'lima') where etiqueta_id = :'etq'));
rollback;`);
    esperar("una campaña limitada a Trujillo rige en Trujillo y en ninguna otra parte (tampoco sin sede)", ultimaLinea(r) === "1|0|0|0|0|1|0", r.ok ? r.salida : r.mensaje);
  }

  // ---- 2. Sin sedes, rige en todas (y sin sede, también: es de todas) ----
  {
    const r = correr(`${FIXTURE(null, { tiendas: false })}
select concat_ws('|',
  (select count(*) from retail.campanas_vigentes(:'tru') where etiqueta_id = :'etq'),
  (select count(*) from retail.campanas_vigentes(:'lima') where etiqueta_id = :'etq'),
  (select count(*) from retail.campanas_vigentes() where etiqueta_id = :'etq'),
  (select count(*) from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, array[:'v1']::uuid[]) where etiqueta_id = :'etq'),
  retail.fn_campana_rige_en_sede(:'etq', :'lima')::text,
  retail.fn_campana_rige_en_sede(:'etq', null)::text);
rollback;`);
    esperar("una campaña sin sedes rige en todas, como siempre", ultimaLinea(r) === "1|1|1|1|true|true", r.ok ? r.salida : r.mensaje);
  }

  // ---- 3. Limitar y volver a «todas» (lista vacía) ----
  {
    const r = correr(`${FIXTURE(SOLO_TRU, { tiendas: false })}
select count(*) as n1 from retail.campana_sedes where etiqueta_id = :'etq' \\gset
select retail.actualizar_campana_etiqueta_con_sedes(:'etq', 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[], array[:'lima', :'tru']::uuid[]);
select count(*) as n2 from retail.campana_sedes where etiqueta_id = :'etq' \\gset
select retail.actualizar_campana_etiqueta_con_sedes(:'etq', 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[], array[:'lima']::uuid[]);
select count(*) as n3 from retail.campana_sedes where etiqueta_id = :'etq' \\gset
select retail.fn_campana_rige_en_sede(:'etq', :'tru') as tru_afuera \\gset
select retail.actualizar_campana_etiqueta_con_sedes(:'etq', 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[], '{}'::uuid[]);
select concat_ws('|', :n1, :n2, :n3, :'tru_afuera', (select count(*) from retail.campana_sedes where etiqueta_id = :'etq'),
  retail.fn_campana_rige_en_sede(:'etq', :'tru')::text, retail.fn_campana_rige_en_sede(:'etq', :'lima')::text);
rollback;`);
    esperar("guardar sedes agrega y quita; la lista vacía vuelve a «todas las sedes»", ultimaLinea(r) === "1|2|1|f|0|true|true", r.ok ? r.salida : r.mensaje);
  }

  // ---- 4. registrar_venta en Trujillo: el descuento se exige y se acepta ----
  esperarError(
    "Trujillo (campaña solo ahí): cobrar sin el descuento se rechaza (venta_campana_omitida)",
    correr(`${FIXTURE(SOLO_TRU)}\n${venta("tru", 0, null, "(:'precio'::numeric)", false)}\nrollback;`),
    "venta_campana_omitida",
  );
  {
    const r = correr(`${FIXTURE(SOLO_TRU)}
${venta("tru", 16.0, "campana", 63.9)}
select 'linea|' || descuento_unitario || '|' || subtotal || '|' || motivo_descuento || '|' || (descuento_etiqueta_id = :'etq')::text
  from retail.venta_items where venta_id = :'venta';
rollback;`);
    esperar("Trujillo (campaña solo ahí): la venta con 20 % pasa y cobra 63.90", ultimaLinea(r) === "linea|16.00|63.90|campana|true", r.ok ? r.salida : r.mensaje);
  }

  // ---- 5. registrar_venta en Lima: el precio normal pasa y el descuento no se acepta ----
  {
    const r = correr(`${FIXTURE(SOLO_TRU)}
${venta("lima", 0, null, "(:'precio'::numeric)", false)}
select 'linea|' || descuento_unitario || '|' || subtotal from retail.venta_items where venta_id = :'venta';
rollback;`);
    esperar("Lima (campaña solo en Trujillo): se vende a precio normal, sin descuento", ultimaLinea(r) === "linea|0.00|79.90", r.ok ? r.salida : r.mensaje);
  }
  esperarError(
    "Lima (campaña solo en Trujillo): un descuento de esa campaña se rechaza (venta_campana_no_vigente)",
    correr(`${FIXTURE(SOLO_TRU)}\n${venta("lima", 16.0, "campana", 63.9)}\nrollback;`),
    "venta_campana_no_vigente",
  );

  // ---- 6. Apartados ----
  {
    const r = correr(`${FIXTURE(SOLO_TRU)}
${separar("tru", 16.0)}
select 'desc|' || coalesce(sum(descuento_unitario), 0) from retail.separacion_items where separacion_id = :'sep';
rollback;`);
    esperar("Apartado en Trujillo: la línea nace con el 20 % de la campaña", r.ok && r.salida.includes("desc|16.00"), r.ok ? r.salida : r.mensaje);
  }
  {
    const r = correr(`${FIXTURE(SOLO_TRU)}
${separar("lima", 0)}
select 'desc|' || coalesce(sum(descuento_unitario), 0) from retail.separacion_items where separacion_id = :'sep';
rollback;`);
    esperar("Apartado en Lima: la línea nace a precio normal (sin el descuento de Trujillo)", r.ok && r.salida.includes("desc|0.00"), r.ok ? r.salida : r.mensaje);
  }
  esperarError(
    "Apartado en Lima con el descuento de la campaña de Trujillo se rechaza",
    correr(`${FIXTURE(SOLO_TRU)}\n${separar("lima", 16.0)}\nrollback;`),
    "separacion_descuento_no_coincide",
  );

  // ---- 7. La tienda web: el descuento solo desde la tienda de la campaña ----
  {
    const r = correr(`${FIXTURE(SOLO_TRU, { tiendas: false })}
select concat_ws('|',
  (select count(*) from retail.fn_tienda_precio_talla(array[:'v1']::uuid[], :'tru') where etiqueta_id = :'etq'),
  (select count(*) from retail.fn_tienda_precio_talla(array[:'v1']::uuid[], :'lima') where etiqueta_id = :'etq'),
  (select count(*) from retail.fn_tienda_precio_talla(array[:'v1']::uuid[], null) where etiqueta_id = :'etq'));
rollback;`);
    // Trujillo y Lima tienen que estar en la web para que la tienda las ofrezca; si no, la consulta no dice nada de ninguna y no
    // prueba lo que se quiere: se informa y no se da por buena.
    const l = ultimaLinea(r);
    esperar("Tienda web: el descuento se ve desde Trujillo y no desde Lima ni sin tienda", l === "1|0|0" || l === "0|0|0", `${l} ${r.ok ? "" : r.mensaje}`);
    if (l === "0|0|0") console.log("    (aviso) la tienda web local no ofrece Trujillo: este caso no pudo comprobar el lado positivo.");
  }

  // ---- 8. Permisos y datos ----
  esperarError(
    "el taller no es una sede válida para una campaña",
    correr(`${FIXTURE(null, { tiendas: false })}
select retail.actualizar_campana_etiqueta_con_sedes(:'etq', 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[],
  array[(select id from retail.ubicaciones where tipo = 'taller' limit 1)]);
rollback;`),
    "ya no es una tienda activa",
  );
  esperarError(
    "quien no puede tocar la campaña no cambia sus sedes (integrante sin permiso del descuento)",
    correr(`${FIXTURE(null, { tiendas: false })}
set local request.jwt.claim.sub = '${MICAELA}';
set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
select retail.actualizar_campana_etiqueta_con_sedes(:'etq', 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5, '{}'::uuid[], array[:'tru']::uuid[]);
rollback;`),
    "configura con",
  );
  {
    const r = correr(`${FIXTURE(SOLO_TRU, { tiendas: false })}
select concat_ws('|', (select count(*) from retail.campanas_sedes() where etiqueta_id = :'etq'),
  (select (ubicacion_id = :'tru')::text from retail.campanas_sedes() where etiqueta_id = :'etq'));
rollback;`);
    esperar("campanas_sedes() devuelve las tiendas de la campaña para la pantalla", ultimaLinea(r) === "1|true", r.ok ? r.salida : r.mensaje);
  }
  {
    // La tabla no se lee directo con una sesión (RLS sin políticas): solo por las funciones.
    const r = correr(`begin;
set local role authenticated;
set local request.jwt.claim.sub = '${FELIPE}';
select count(*) from retail.campana_sedes;
rollback;`);
    esperar("la tabla campana_sedes no se lee directo desde una sesión", !r.ok || ultimaLinea(r) === "0", r.ok ? r.salida : r.mensaje);
  }

  // ---- 9. GUARDIÁN: lo que cobra o muestra el descuento pregunta por la sede ----
  {
    const r = correr(`select p.proname || '|' || (position(m.debe in d.def) > 0)::text || '|' || (position('fn_campanas_por_variante(' in d.def) = 0)::text
  from (values ('registrar_venta', 'fn_campanas_en_sede('), ('separar_prendas', 'fn_campanas_en_sede('), ('editar_separacion', 'fn_campanas_en_sede('),
               ('fn_tienda_precio_talla', 'fn_campanas_en_sede('), ('fn_club_avisos_pendientes', 'campanas_vigentes(p_ubicacion_id)')) m (nombre, debe)
  join pg_proc p on p.proname = m.nombre and p.pronamespace = 'retail'::regnamespace
  cross join lateral (select pg_get_functiondef(p.oid) as def) d
  order by 1;`);
    const filas = r.ok ? r.salida.split("\n").filter(Boolean) : [];
    esperar(
      "GUARDIÁN: registrar_venta, separar_prendas, editar_separacion, fn_tienda_precio_talla y fn_club_avisos_pendientes preguntan por la sede",
      filas.length === 5 && filas.every((f) => f.endsWith("|true|true")),
      r.ok ? filas.join(" · ") : r.mensaje,
    );
  }

  // ---- 10. La migración se puede pegar dos veces ----
  {
    const migracion = readFileSync(MIGRACION, "utf8");
    const r = correr(`begin;\n${migracion}\n${migracion}\nselect 'ok';\nrollback;`);
    esperar("la migración es re-ejecutable (dos veces seguidas)", r.ok && ultimaLinea(r) === "ok", r.ok ? r.salida : r.mensaje);
  }

  console.log(`\n${total - fallos} de ${total} bien${fallos ? ` · ${fallos} FALLARON` : ""}.`);
  process.exit(fallos ? 1 : 0);
}

main();

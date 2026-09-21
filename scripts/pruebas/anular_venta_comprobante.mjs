#!/usr/bin/env node
/**
 * Prueba de que `retail.anular_venta` libera el comprobante pendiente de la venta que anula —
 * CAYLA V2 (`20260921121500_anular_venta_libera_el_comprobante_pendiente.sql`).
 *
 * EL HUECO. Anular una venta con boleta pendiente no tocaba esa boleta: seguía `pendiente`, contaba
 * en «Por enviar a SUNAT» y tenía su botón «Transmitir» — se podía declarar a SUNAT una venta que ya
 * se había devuelto. Ahora `anular_venta` la libera (`no_emitido`, con su motivo) en la misma
 * transacción, igual que «Liberar sin espera» (ADR-0093).
 *
 * QUÉ PRUEBA.
 *   1. `pendiente` → `no_emitido`, con «Venta anulada: <motivo>», quién y cuándo; la venta queda anulada.
 *   2. Solo el de ESA venta: el de otra venta que no se anula sigue pendiente.
 *   3. Con dos comprobantes (uno ya liberado a mano y su reemplazo pendiente) solo se libera el
 *      pendiente; el otro conserva su motivo.
 *   4. `rechazado` NO se toca (ya llegó a SUNAT, ADR-0093) y la anulación sigue adelante.
 *   5. Una venta sin comprobante se anula igual.
 *   6. `enviado` sigue frenando la anulación, y no cambia nada.
 *   7. Una anulación rechazada por una guarda no libera nada (la atomicidad es de Postgres: esto fija
 *      el comportamiento visible, no prueba el código nuevo).
 *   8. La reparación de la migración: un pendiente que YA quedó colgado de una venta anulada
 *      (anulada antes de esta migración) pasa a `no_emitido` con los datos de quien anuló.
 *
 * CÓMO. Mismo mecanismo que `ventas_del_dia.mjs` y `registrar_venta.mjs` (léelos primero): `docker
 * exec ... psql`, `set local request.jwt.claim.sub` para ser Felipe (líder) y una sola transacción que
 * termina SIEMPRE en ROLLBACK — no deja rastro en el Postgres compartido. Todo se arma con las RPC
 * reales (`registrar_venta`, `anular_venta`, `marcar_comprobante_no_emitido`, `emitir_comprobante`,
 * `actualizar_transmision_comprobante`). Los errores esperados se atrapan con un bloque `do` (que se
 * revierte solo) para poder mirar el estado DESPUÉS del fallo.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace CI). El punto 8 lee la
 * migración misma (es lo que prueba) aunque la base ya la tenga.
 *
 * USO
 *   pnpm pruebas:anular-venta-comprobante    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20260921121500_anular_venta_libera_el_comprobante_pendiente.sql";

// Mismas credenciales obvias que supabase/seed.sql y registrar_venta.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que falla no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Una venta de una unidad en Tienda Lima, pagada en efectivo, con boleta reservada junto a la venta.
const VENTA_CON_BOLETA = `retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio')),
  null, gen_random_uuid(), 'boleta')`;
const VENTA_SIN_COMPROBANTE = VENTA_CON_BOLETA.replace(", 'boleta')", ")");

// La condición de la única línea de una venta, como la manda la pantalla.
const ITEMS_ANULACION = (ventaVar) => `jsonb_build_array(jsonb_build_object('venta_item_id', :'${ventaVar}_item', 'condicion', 'vendible'))`;
const ITEM_DE = (ventaVar) => `select id as ${ventaVar}_item from retail.venta_items where venta_id = :'${ventaVar}' \\gset`;

// Tienda Lima lista para vender: piso/almacén (autocuración), caja limpia y propia (cierra cualquiera
// abierta con la RPC real, nunca un UPDATE) y stock de sobra de la variante.
const FIXTURE = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v1, precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as felipe_id from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja_id \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;

let fallos = 0;
let total = 0;

// `resultado` se imprime solo si falla: distingue «la regla no se cumple» de «el fixture se rompió».
function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 700)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- Escenario 1: lo que se anula bien (una sola transacción, se revierte) ----
  const r1 = correr(`${FIXTURE}
-- A: boleta pendiente → se anula → se libera
select ${VENTA_CON_BOLETA} as a \\gset
${ITEM_DE("a")}
select retail.anular_venta(:'a', 'prueba automatizada', ${ITEMS_ANULACION("a")}) as _anul_a \\gset

-- B: otra venta, NO se anula: su boleta sigue pendiente
select ${VENTA_CON_BOLETA} as b \\gset

-- C: dos comprobantes: el primero se libera a mano, se emite un reemplazo pendiente, y se anula la venta
select ${VENTA_CON_BOLETA} as c \\gset
${ITEM_DE("c")}
select id as c_cmp1 from retail.comprobantes where venta_id = :'c' \\gset
select retail.marcar_comprobante_no_emitido(:'c_cmp1', 'liberada a mano') as _libre_c \\gset
select retail.emitir_comprobante(:'ubic', 'boleta',
  round(:'precio' - round(:'precio' - :'precio' / 1.18, 2), 2), round(:'precio' - :'precio' / 1.18, 2), :'precio', :'c') as c_cmp2 \\gset
select retail.anular_venta(:'c', 'prueba automatizada', ${ITEMS_ANULACION("c")}) as _anul_c \\gset

-- D: comprobante RECHAZADO → se anula → no se toca
select ${VENTA_CON_BOLETA} as d \\gset
${ITEM_DE("d")}
select id as d_cmp from retail.comprobantes where venta_id = :'d' \\gset
select retail.actualizar_transmision_comprobante(:'d_cmp', 'rechazado', 'sandbox', null, 'RUC no habido') as _rech_d \\gset
select retail.anular_venta(:'d', 'prueba automatizada', ${ITEMS_ANULACION("d")}) as _anul_d \\gset

-- E: sin comprobante → se anula igual
select ${VENTA_SIN_COMPROBANTE} as e \\gset
${ITEM_DE("e")}
select retail.anular_venta(:'e', 'prueba automatizada', ${ITEMS_ANULACION("e")}) as _anul_e \\gset

select 'a_comprobante|' || estado || '|' || coalesce(motivo_no_emitido, '') || '|' || coalesce((marcado_no_emitido_por = :'felipe_id')::text, 'sin_quien') || '|' || (marcado_no_emitido_at is not null)::text
  from retail.comprobantes where venta_id = :'a';
select 'a_venta|' || estado from retail.ventas where id = :'a';
select 'b_comprobante|' || estado from retail.comprobantes where venta_id = :'b';
select 'c_primero|' || estado || '|' || coalesce(motivo_no_emitido, '') from retail.comprobantes where id = :'c_cmp1';
select 'c_reemplazo|' || estado || '|' || coalesce(motivo_no_emitido, '') from retail.comprobantes where id = :'c_cmp2';
select 'c_venta|' || estado from retail.ventas where id = :'c';
select 'd_comprobante|' || estado || '|' || coalesce(motivo_rechazo, '') from retail.comprobantes where id = :'d_cmp';
select 'd_venta|' || estado from retail.ventas where id = :'d';
select 'e_venta|' || estado from retail.ventas where id = :'e';
select 'e_comprobantes|' || count(*) from retail.comprobantes where venta_id = :'e';
select 'pendientes_de_anuladas|' || count(*) from retail.comprobantes c join retail.ventas v on v.id = c.venta_id
  where v.id in (:'a', :'c', :'d', :'e') and c.estado = 'pendiente';
rollback;
`);

  if (!r1.ok) {
    console.log("✗ el escenario principal falló antes de poder probar nada");
    console.log(`    ${r1.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l1 = r1.salida.split("\n");
  const dato1 = (clave) => l1.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar(
    "anular una venta libera su comprobante pendiente: no_emitido, con su motivo, quién y cuándo",
    dato1("a_comprobante") === "no_emitido|Venta anulada: prueba automatizada|true|true" && dato1("a_venta") === "anulada",
    r1.salida
  );
  esperar("el comprobante de OTRA venta, que no se anula, sigue pendiente", dato1("b_comprobante") === "pendiente", r1.salida);
  esperar(
    "con dos comprobantes solo se libera el pendiente; el que ya estaba liberado conserva su motivo",
    dato1("c_reemplazo") === "no_emitido|Venta anulada: prueba automatizada" && dato1("c_primero") === "no_emitido|liberada a mano" && dato1("c_venta") === "anulada",
    r1.salida
  );
  esperar(
    "un comprobante RECHAZADO no se toca (ya llegó a SUNAT) y la venta se anula igual",
    dato1("d_comprobante") === "rechazado|RUC no habido" && dato1("d_venta") === "anulada",
    r1.salida
  );
  esperar("una venta sin comprobante se anula igual", dato1("e_venta") === "anulada" && dato1("e_comprobantes") === "0", r1.salida);
  esperar("ninguna venta anulada de la prueba deja un comprobante pendiente", dato1("pendientes_de_anuladas") === "0", r1.salida);

  // ---- Escenario 2: lo que NO debe pasar. Los errores se atrapan con un bloque `do` para mirar el estado después. ----
  const r2 = correr(`${FIXTURE}
create temp table _r (clave text, valor text);

-- F: comprobante ENVIADO → anular se niega, y nada cambia
select ${VENTA_CON_BOLETA} as f \\gset
select id as f_cmp from retail.comprobantes where venta_id = :'f' \\gset
select retail.actualizar_transmision_comprobante(:'f_cmp', 'enviado', 'sandbox') as _env_f \\gset
select set_config('t.f', :'f', true) as _g1 \\gset
do $$ begin
  begin
    perform retail.anular_venta(current_setting('t.f')::uuid, 'prueba automatizada', '[]'::jsonb);
    insert into _r values ('f_error', '(no falló)');
  exception when others then
    insert into _r values ('f_error', sqlerrm);
  end;
end $$;

-- G: anulación rechazada por una guarda (líneas mal contadas) → el comprobante NO se libera (atomicidad de Postgres)
select ${VENTA_CON_BOLETA} as g \\gset
select set_config('t.g', :'g', true) as _g2 \\gset
do $$ begin
  begin
    perform retail.anular_venta(current_setting('t.g')::uuid, 'prueba automatizada', '[]'::jsonb);
    insert into _r values ('g_error', '(no falló)');
  exception when others then
    insert into _r values ('g_error', sqlerrm);
  end;
end $$;

select 'f_error|' || valor from _r where clave = 'f_error';
select 'f_comprobante|' || estado from retail.comprobantes where id = :'f_cmp';
select 'f_venta|' || estado from retail.ventas where id = :'f';
select 'g_error|' || valor from _r where clave = 'g_error';
select 'g_comprobante|' || estado from retail.comprobantes where venta_id = :'g';
select 'g_venta|' || estado from retail.ventas where id = :'g';
rollback;
`);

  if (!r2.ok) {
    console.log("✗ el escenario de errores falló antes de poder probar nada");
    console.log(`    ${r2.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l2 = r2.salida.split("\n");
  const dato2 = (clave) => l2.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar(
    "un comprobante ENVIADO sigue frenando la anulación, y ni el comprobante ni la venta cambian",
    (dato2("f_error") ?? "").includes("comprobante enviado o aceptado") && dato2("f_comprobante") === "enviado" && dato2("f_venta") === "completada",
    r2.salida
  );
  esperar(
    "una anulación rechazada por una guarda no libera el comprobante pendiente y la venta sigue completada",
    (dato2("g_error") ?? "").includes("necesita la condición de cada una") && dato2("g_comprobante") === "pendiente" && dato2("g_venta") === "completada",
    r2.salida
  );

  // ---- Escenario 3: la reparación de la migración (lo que ya quedó colgado antes de aplicarla) ----
  const reparacion = readFileSync(MIGRACION, "utf8").split("-- Reparación de lo que ya quedó así")[1];
  const r3 = correr(`${FIXTURE}
select ${VENTA_CON_BOLETA} as h \\gset
select ${VENTA_CON_BOLETA} as i \\gset
-- H: el estado viejo, armado a mano: la venta ya está anulada y su boleta sigue pendiente.
update retail.ventas set estado = 'anulada', motivo_anulacion = 'anulada antes de la migración', anulado_por = :'felipe_id', anulado_en = now() where id = :'h';
select 'antes|' || estado from retail.comprobantes where venta_id = :'h';
-- La reparación de la migración, tal cual (con el search_path con el que la migración corre).
set local search_path = retail, public, extensions;
${"-- Reparación de lo que ya quedó así" + reparacion}
select 'despues|' || estado || '|' || coalesce(motivo_no_emitido, '') || '|' || coalesce((marcado_no_emitido_por = :'felipe_id')::text, 'sin_quien') from retail.comprobantes where venta_id = :'h';
select 'intacta|' || estado from retail.comprobantes where venta_id = :'i';
rollback;
`);

  if (!r3.ok) {
    console.log("✗ el escenario de la reparación falló antes de poder probar nada");
    console.log(`    ${r3.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l3 = r3.salida.split("\n");
  const dato3 = (clave) => l3.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar(
    "la reparación libera el pendiente que ya colgaba de una venta anulada, y no toca el de una venta viva",
    dato3("antes") === "pendiente" && dato3("despues") === "no_emitido|Venta anulada: anulada antes de la migración|true" && dato3("intacta") === "pendiente",
    r3.salida
  );

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();

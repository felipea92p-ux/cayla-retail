#!/usr/bin/env node
/**
 * Prueba de ADR-0335 — activos «ya lo teníamos» (`20261004200000_activos_carga_inicial.sql`).
 *
 * QUÉ CUBRE
 *   · el líder carga lo que CAYLA ya tenía (Taller, fecha real, costo): queda SIN comprobante, medio de pago, egreso ni
 *     cuenta; se deprecia con la fórmula de siempre desde su fecha; la lista lo marca; la propuesta de saldos de arranque
 *     lo toma (33x y 391);
 *   · NO mueve plata: el libro de dinero (`fn_dinero_libro`) queda idéntico; una compra normal con yape SÍ lo mueve (para
 *     que la prueba no pase por vacía);
 *   · idempotente por token; solo el líder; fecha futura, costo cero, tipo y nombre inválidos se rechazan;
 *   · los estados imposibles: «ya lo teníamos» con medio de pago, un activo sin pago que no sea carga inicial, y cambiar la
 *     marca después; una carga con fecha de o después del arranque del Balance (la de antes sí pasa);
 *   · corregir es anular y volver a cargar; y se da de baja como cualquier activo;
 *   · la compra normal (`registrar_activo`) sigue exactamente igual.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escenario en su transacción con ROLLBACK (no deja nada), sesión
 *   simulada con `request.jwt.claim.sub`. Fechas fijas y pasadas: nada depende del día en que corra.
 *
 * USO
 *   pnpm pruebas:activos-carga-inicial          → con las migraciones ya aplicadas en el local (así corre el CI)
 *   APLICAR_MIGRACION=1 pnpm pruebas:activos-carga-inicial
 *       → ANTES de pegar la migración: la aplica dentro de la transacción de cada escenario (y la deshace con el ROLLBACK),
 *         sin tocar la base local compartida.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

const MIGRACION = process.env.APLICAR_MIGRACION
  ? readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20261004200000_activos_carga_inicial.sql"), "utf8")
  : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
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

/** El Taller y Trujillo, y la sesión del líder. Deja `:taller` y `:tru`. */
const ESCENA = `
begin;
${MIGRACION}
${INTENTO}
${cambiaA(FELIPE)}
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. El líder carga una máquina del Taller con su fecha real: sin rastro de pago, con la depreciación de siempre.
{
  const r = correr(`${ESCENA}
select retail.cargar_activo_inicial(:'taller', 'maquinaria', 'Máquina de coser recta industrial (prueba)', '2025-08-07', 2928, null, 'SERIE-PRUEBA-1', 'prueba', gen_random_uuid()) as a \\gset
select carga_inicial, medio_pago is null, compra_id is null, caja_movimiento_id is null, cuenta_dinero_id is null, costo, valor_residual, vida_util_meses, tasa_anual, cuenta_codigo, estado, registrado_por is not null, serie
  from retail.activos_fijos where id = :'a';
select meses_depreciados, depreciacion_mensual, depreciacion_acumulada, valor_hoy, carga_inicial, ubicacion_nombre
  from retail.fn_activos_lista('2026-09-30') where id = :'a';
select meses_depreciados, depreciacion_acumulada, valor_hoy from retail.fn_activos_lista('2025-08-31') where id = :'a';`);
  const [fila, lista, mismoMes] = lineas(r);
  esperar("queda «ya lo teníamos»: sin medio, comprobante, egreso ni cuenta; S/ 2,928, 10 años (10 %), cuenta 333, firmado", r.ok && fila === "t|t|t|t|t|2928.00|0.00|120|0.1000|333|activo|t|SERIE-PRUEBA-1", r);
  esperar("a fines de septiembre de 2026 lleva 13 meses depreciados: S/ 317.20, vale S/ 2,610.80, y la lista lo marca", r.ok && lista === "13|24.40|317.20|2610.80|t|Taller", r);
  esperar("el mes de la compra no se deprecia (desde el mes siguiente, como todo activo)", r.ok && mismoMes === "0|0.00|2928.00", r);
}

// 2. Idempotente: el mismo token no duplica.
{
  const r = correr(`${ESCENA}
select gen_random_uuid() as tk \\gset
select retail.cargar_activo_inicial(:'taller', 'equipos', 'Aspiradora (prueba)', '2026-01-14', 1044, null, null, null, :'tk') as a1 \\gset
select retail.cargar_activo_inicial(:'taller', 'equipos', 'Aspiradora (prueba)', '2026-01-14', 1044, null, null, null, :'tk') as a2 \\gset
select (:'a1' = :'a2'), (select count(*) from retail.activos_fijos where token_cliente = :'tk');`);
  esperar("el mismo token devuelve el mismo activo y no duplica", r.ok && r.salida === "t|1", r);
}

// 3. NO mueve plata. Lo comparo contra una compra normal con yape, que SÍ la mueve (para no probar contra vacío).
{
  const r = correr(`${ESCENA}
select count(*) as n0, coalesce(sum(monto), 0) as s0 from retail.fn_dinero_libro('2026-12-31') where clave like 'activo:%' \\gset
select retail.cargar_activo_inicial(:'taller', 'maquinaria', 'Remalladora (prueba)', '2025-10-13', 1337.70, null, null, null, gen_random_uuid()) as a \\gset
select (select count(*) from retail.fn_dinero_libro('2026-12-31') where clave like 'activo:%') - :n0 as lineas_nuevas_carga;
select retail.registrar_activo(:'tru', 'equipos', 'Parlante comprado hoy (prueba)', '2026-09-20', 900, null, 'yape') as b \\gset
select (select count(*) from retail.fn_dinero_libro('2026-12-31') where clave like 'activo:%') - :n0 as lineas_nuevas_compra,
       (select coalesce(sum(monto), 0) from retail.fn_dinero_libro('2026-12-31') where clave like 'activo:%') - :s0 as monto_nuevo;
select carga_inicial, medio_pago from retail.activos_fijos where id = :'b';`);
  const [carga, compra, normal] = lineas(r);
  esperar("cargar lo que ya se tenía no agrega ni una línea al libro de dinero", r.ok && carga === "0", r);
  esperar("una compra normal con yape sí: una línea, restando S/ 900 (la prueba no es contra vacío)", r.ok && compra === "1|-900.00", r);
  esperar("y la compra normal queda como siempre: sin marca y con su medio", r.ok && normal === "f|yape", r);
}

// 4. Entra a los saldos de arranque: costo en 333 y su depreciación acumulada en 391.
{
  const r = correr(`${ESCENA}
select retail.cargar_activo_inicial(:'taller', 'maquinaria', 'Máquina (prueba)', '2025-08-07', 2928, null, null, null, gen_random_uuid()) as a \\gset
select cuenta, monto from retail.fn_saldos_iniciales_propuesta('2026-10-01') where cuenta in ('333', '391') order by cuenta;`);
  const [l333, l391] = lineas(r);
  esperar("la propuesta de arranque (1-oct-2026) lleva la máquina en la 333 por su costo", r.ok && l333 === "333|2928.00", r);
  esperar("y su depreciación hasta el día anterior en la 391 (13 meses = S/ 317.20)", r.ok && l391 === "391|317.20", r);
}

// 5. Solo el líder, y los datos obligatorios.
{
  const r = correr(`${ESCENA}
${cambiaA(MICAELA)}
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2025-08-07', 500)$q$, :'tru'));
${cambiaA(FELIPE)}
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2999-01-01', 500)$q$, :'tru'));
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2025-08-07', 0)$q$, :'tru'));
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'inventado', 'Mesa', '2025-08-07', 500)$q$, :'tru'));
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', '  ', '2025-08-07', 500)$q$, :'tru'));
select pg_temp.intento($q$select retail.cargar_activo_inicial(null, 'muebles', 'Mesa', '2025-08-07', 500)$q$);
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2025-08-07', 500, 6)$q$, :'tru'));`);
  const [micaela, futura, cero, tipo, nombre, sinSede, vida] = lineas(r);
  esperar("una colaboradora no puede (aunque sea de esa tienda)", r.ok && micaela === "Cargar lo que CAYLA ya tenía es solo del líder.", r);
  esperar("fecha futura", r.ok && futura === "La fecha de compra no puede ser futura.", r);
  esperar("costo cero", r.ok && cero === "El costo tiene que ser mayor que cero.", r);
  esperar("tipo que no existe", r.ok && tipo === "Elige qué tipo de activo es.", r);
  esperar("sin nombre", r.ok && nombre === "Escribe qué es.", r);
  esperar("sin sede", r.ok && sinSede === "Un activo está en una tienda, el Taller o el almacén: elige dónde.", r);
  esperar("vida útil de 6 meses", r.ok && vida === "La vida útil va de 1 a 50 años.", r);
}

// 6. Estados imposibles: los impide la base, no la pantalla.
{
  const r = correr(`${ESCENA}
select retail.cargar_activo_inicial(:'taller', 'muebles', 'Mesa (prueba)', '2025-08-07', 500, null, null, null, gen_random_uuid()) as a \\gset
-- a) «ya lo teníamos» con medio de pago
select pg_temp.intento(format($q$insert into retail.activos_fijos (ubicacion_id, nombre, costo, vida_util_meses, tasa_anual, fecha_adquisicion, tipo, carga_inicial, medio_pago)
   values (%L::uuid, 'x', 100, 120, 0.1, '2025-08-07', 'muebles', true, 'yape')$q$, :'taller')) ~ 'activos_fijos_pago_coherente';
-- b) un activo sin pago que NO es carga inicial
select pg_temp.intento(format($q$insert into retail.activos_fijos (ubicacion_id, nombre, costo, vida_util_meses, tasa_anual, fecha_adquisicion, tipo, carga_inicial)
   values (%L::uuid, 'x', 100, 120, 0.1, '2025-08-07', 'muebles', false)$q$, :'taller')) ~ 'activos_fijos_pago_coherente';
-- c) cambiar la marca después
select pg_temp.intento(format($q$update retail.activos_fijos set carga_inicial = false, medio_pago = 'yape' where id = %L::uuid$q$, :'a'));
-- d) lo que ya había sigue bloqueado: no se edita
select pg_temp.intento(format($q$update retail.activos_fijos set costo = 1 where id = %L::uuid$q$, :'a'));`);
  const [conMedio, sinPago, marca, edita] = lineas(r);
  esperar("«ya lo teníamos» con medio de pago: lo rechaza el candado", r.ok && conMedio === "t", r);
  esperar("un activo sin pago que no es carga inicial: lo rechaza el mismo candado (como hasta hoy)", r.ok && sinPago === "t", r);
  esperar("cambiar la marca después: «se anula y se registra de nuevo»", r.ok && marca.startsWith("Un activo no pasa de «ya lo teníamos»"), r);
  esperar("y editarlo sigue prohibido (la regla de siempre)", r.ok && edita === "Un activo solo cambia para darse de baja o anularse.", r);
}

// 7. El arranque del Balance: de ahí en adelante, una compra lleva su pago.
{
  const r = correr(`${ESCENA}
insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen) values ('2026-10-01', '101', 1, 0, 'manual');
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2026-10-01', 500)$q$, :'taller'));
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2026-10-02', 500)$q$, :'taller'));
select pg_temp.intento(format($q$select retail.cargar_activo_inicial(%L::uuid, 'muebles', 'Mesa', '2026-09-30', 500)$q$, :'taller'));`);
  const [mismoDia, despues, antes] = lineas(r);
  esperar("con fecha del día del arranque: se rechaza", r.ok && mismoDia?.startsWith("Lo que ya se tenía tiene que ser de antes del arranque del Balance (01/10/2026)"), r);
  esperar("con fecha posterior: se rechaza", r.ok && despues?.startsWith("Lo que ya se tenía tiene que ser de antes del arranque"), r);
  esperar("con fecha de antes: pasa", r.ok && antes === "SIN_ERROR", r);
}

// 8. Quien tiene el módulo Gastos ve en su tienda lo que se cargó, marcado; el resto de la lista no cambia.
{
  const r = correr(`${ESCENA}
select retail.cargar_activo_inicial(:'tru', 'equipos_computo', 'Laptop (prueba)', '2025-03-10', 1500.80, null, null, null, gen_random_uuid()) as a \\gset
select retail.cargar_activo_inicial(:'taller', 'muebles', 'Maniquí (prueba)', '2026-01-19', 920, null, null, null, gen_random_uuid()) as b \\gset
select ubicacion_nombre, carga_inicial, vida_util_meses from retail.fn_activos_lista() where id in (:'a', :'b') order by ubicacion_nombre;`);
  const [taller, tru] = lineas(r);
  esperar("el líder ve las dos sedes, marcadas (cómputo a 48 meses, mueble a 120)", r.ok && taller === "Taller|t|120" && tru === "Tienda Trujillo|t|48", r);
}

// 9. Corregir una carga es anularla y volver a cargarla; y si ya no sirve, se da de baja (como cualquier activo).
{
  const r = correr(`${ESCENA}
select retail.cargar_activo_inicial(:'taller', 'muebles', 'Mesa mal cargada (prueba)', '2025-08-07', 500, null, null, null, gen_random_uuid()) as a \\gset
select retail.cargar_activo_inicial(:'taller', 'muebles', 'Sillas (prueba)', '2025-10-30', 420, null, null, null, gen_random_uuid()) as b \\gset
select retail.anular_activo(:'a', 'se cargó con otro monto');
select estado, carga_inicial, motivo_anulacion from retail.activos_fijos where id = :'a';
select retail.dar_de_baja_activo(:'b', '2026-06-30', 'se rompieron');
select estado, carga_inicial from retail.activos_fijos where id = :'b';
select count(*) from retail.fn_activos_lista() where id = :'a' and estado = 'anulado';`);
  const [anulada, baja, enLista] = lineas(r);
  esperar("anular una carga inicial: queda anulada con su motivo y conserva la marca", r.ok && anulada === "anulado|t|se cargó con otro monto", r);
  esperar("darla de baja: queda dada de baja", r.ok && baja === "baja|t", r);
  esperar("la anulada sigue visible en la lista como anulada (no se borra)", r.ok && enLista === "1", r);
}

console.log(fallos === 0 ? "\nTodo en orden" : `\n${fallos} caso(s) con falla`);
process.exit(fallos === 0 ? 0 : 1);

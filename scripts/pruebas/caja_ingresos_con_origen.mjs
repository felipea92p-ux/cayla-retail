#!/usr/bin/env node
/**
 * Prueba de ADR-0375 — Caja ▸ Registrar ingreso con su origen (`20261010220000` + `20261010220100`).
 *
 * QUÉ CUBRE
 *   · Caja fuerte → cajón: el cajón sube, la caja fuerte BAJA, el flujo lo lee como «entre cuentas» (suma cero) y el balance
 *     no lo cuenta como «ingreso sin origen»;
 *   · lo trae el líder: «de un cierre» baja el efectivo por rendir; «del dueño» es un aporte (flujo: plata del dueño);
 *   · préstamo de otra sede: sale del cajón de la otra sede y entra a este, en un paso; el egreso de la otra sede no queda
 *     «por clasificar»; si esa caja está cerrada, no se registra nada;
 *   · los motivos con contraparte NO se pueden tipear sueltos, y «Compra de insumos» ya no es una salida;
 *   · lo que entró desde Caja no se anula en Finanzas; un cajón como destino exige su ingreso de caja;
 *   · el mismo token dos veces registra una sola vez; una colaboradora no registra en la caja de otra sede.
 *
 * CÓMO. Igual que `cuenta_sellada.mjs`: cada escenario en su transacción con ROLLBACK y la sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:caja-ingresos    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
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

/** Trujillo abierta con S/ 1,000 y Lima con S/ 500. Los saldos se comparan antes y después (las diferencias), no en absoluto. */
const ESCENA = `
begin;
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
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select saldo from retail.fn_cuentas_dinero_saldos() where id = p_id;
$f$;
-- Lo que el balance de hoy cuenta como «ingresos sin origen» (en monto: la semilla del CI, cargada hoy, ya trae uno suyo).
create function pg_temp.sin_origen() returns numeric language sql as $f$
  select coalesce(sum(monto), 0) from retail.fn_bal_causas_dinero(retail.fn_hoy_lima(), retail.fn_hoy_lima()) where clave = 'ingreso_sin_origen';
$f$;
create function pg_temp.flujo(p_cat text) returns numeric language sql as $f$
  select coalesce(sum(monto), 0) from retail.fn_flujo_lineas(retail.fn_hoy_lima(), retail.fn_hoy_lima()) where categoria = p_cat;
$f$;
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' order by created_at limit 1 \\gset
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id in (:'tru', :'lim') and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select retail.abrir_caja(:'lim', 500.00, 'prueba automatizada') as caja_lim \\gset
`;
const esperado = (caja) => `(select esperado from retail.fn_calcular_esperado_caja(:'${caja}'))`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Caja fuerte → cajón.
{
  const r = correr(`${ESCENA}
select pg_temp.saldo(:'fuerte_tru') as f0 \\gset
select ${esperado("caja")} as e0 \\gset
select pg_temp.flujo('entre_cuentas') as ec0 \\gset
select pg_temp.flujo('otros_ingresos') as oi0 \\gset
select pg_temp.sin_origen() as so0 \\gset
${cambiaA(MICAELA)}
select retail.registrar_ingreso_caja(:'caja', 'caja_fuerte', 100, null, null, null, gen_random_uuid()) as ing \\gset
${cambiaA(FELIPE)}
select pg_temp.saldo(:'fuerte_tru') - :f0;
select ${esperado("caja")} - :e0;
select (select motivo from retail.caja_movimientos where id = :'ing');
select (select tipo || ':' || (cuenta_origen_id = :'fuerte_tru') from retail.movimientos_dinero where caja_ingreso_id = :'ing');
select pg_temp.flujo('entre_cuentas') - :ec0;
select pg_temp.flujo('otros_ingresos') - :oi0;
select pg_temp.sin_origen() - :so0;
`);
  const [dFuerte, dCajon, motivo, md, dEntre, dOtros, sinOrigen] = lineas(r);
  esperar("caja fuerte: la caja fuerte baja S/ 100", Number(dFuerte) === -100, r);
  esperar("caja fuerte: el cajón sube S/ 100", Number(dCajon) === 100, r);
  esperar("caja fuerte: el ingreso dice «Sencillo de la caja fuerte»", motivo === "Sencillo de la caja fuerte", r);
  esperar("caja fuerte: su movimiento es entre cuentas desde la caja fuerte", md === "entre_cuentas:true", r);
  esperar("caja fuerte: el flujo lo ve entre cuentas, sumando cero", Number(dEntre) === 0, r);
  esperar("caja fuerte: el flujo NO lo cuenta como otro ingreso", Number(dOtros) === 0, r);
  esperar("caja fuerte: el balance no lo suma a los ingresos sin origen", Number(sinOrigen) === 0, r);
}

// 2. Lo trae el líder: de un cierre y del dueño.
{
  const r = correr(`${ESCENA}
select pg_temp.saldo(:'rendir') as r0 \\gset
select pg_temp.flujo('dueno_pone') as dp0 \\gset
${cambiaA(MICAELA)}
select retail.registrar_ingreso_caja(:'caja', 'lider', 50, 'Trajo: Sandra', 'cierre', null, gen_random_uuid()) as a \\gset
select retail.registrar_ingreso_caja(:'caja', 'lider', 70, 'Trajo: Felipe', 'dueno', null, gen_random_uuid()) as b \\gset
select pg_temp.intento($$select retail.registrar_ingreso_caja('$$ || :'caja' || $$', 'lider', 70, 'Trajo: Felipe', null, null, null)$$);
select pg_temp.intento($$select retail.registrar_ingreso_caja('$$ || :'caja' || $$', 'lider', 70, null, 'dueno', null, null)$$);
${cambiaA(FELIPE)}
select pg_temp.saldo(:'rendir') - :r0;
select (select tipo from retail.movimientos_dinero where caja_ingreso_id = :'b');
select pg_temp.flujo('dueno_pone') - :dp0;
`);
  const [sinDeDonde, sinQuien, dRendir, tipoB, dDueno] = lineas(r);
  esperar("líder: sin decir de dónde, no se registra", /cierre o plata del dueño/.test(sinDeDonde ?? ""), r);
  esperar("líder: sin decir quién, no se registra (la nota es obligatoria)", /referencia/.test(sinQuien ?? ""), r);
  esperar("líder de un cierre: baja el efectivo por rendir", Number(dRendir) === -50, r);
  esperar("líder del dueño: es un aporte", tipoB === "aporte", r);
  esperar("líder del dueño: el flujo lo ve como plata del dueño", Number(dDueno) === 70, r);
}

// 3. Préstamo de otra sede.
{
  const r = correr(`${ESCENA}
select ${esperado("caja")} as t0 \\gset
select ${esperado("caja_lim")} as l0 \\gset
${cambiaA(MICAELA)}
select retail.registrar_ingreso_caja(:'caja', 'otra_sede', 80, 'De Tienda Lima', null, :'lim', gen_random_uuid()) as ing \\gset
${cambiaA(FELIPE)}
select ${esperado("caja")} - :t0;
select ${esperado("caja_lim")} - :l0;
select (select m.motivo || '|' || m.nota from retail.movimientos_dinero d join retail.caja_movimientos m on m.id = d.caja_movimiento_id
         where d.caja_ingreso_id = :'ing');
select (select retail.fn_egreso_ya_usado(d.caja_movimiento_id) from retail.movimientos_dinero d where d.caja_ingreso_id = :'ing');
select count(*) from retail.fn_egresos_sin_clasificar(:'lim') where motivo = 'Préstamo a otra sede';
select retail.cerrar_caja(:'caja_lim', 0) as _c \\gset
${cambiaA(MICAELA)}
select pg_temp.intento($$select retail.registrar_ingreso_caja('$$ || :'caja' || $$', 'otra_sede', 10, 'De Tienda Lima', null, '$$ || :'lim' || $$', null)$$);
select pg_temp.intento($$select retail.registrar_ingreso_caja('$$ || :'caja' || $$', 'otra_sede', 10, 'De aquí', null, '$$ || :'tru' || $$', null)$$);
`);
  const [dTru, dLim, egreso, uso, sinClasificar, cerrada, misma] = lineas(r);
  esperar("otra sede: este cajón sube S/ 80", Number(dTru) === 80, r);
  esperar("otra sede: el cajón que presta baja S/ 80", Number(dLim) === -80, r);
  esperar("otra sede: la salida de la otra sede dice a quién", egreso === "Préstamo a otra sede|A Tienda Trujillo — De Tienda Lima", r);
  esperar("otra sede: esa salida ya tiene su movimiento", uso === "movimiento", r);
  esperar("otra sede: esa salida no queda por clasificar en Gastos", Number(sinClasificar) === 0, r);
  esperar("otra sede: con su caja cerrada, no se registra", /no está abierta/.test(cerrada ?? ""), r);
  esperar("otra sede: no se presta a sí misma", /otra sede/.test(misma ?? ""), r);
}

// 4. El vocabulario: lo que tiene contraparte no se tipea suelto; «Compra de insumos» ya no es salida.
{
  const r = correr(`${ESCENA}
${cambiaA(MICAELA)}
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'ingreso', 10, 'Sencillo de la caja fuerte', null, false, null)$$);
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'ingreso', 10, 'Préstamo de otra sede', 'x', false, null)$$);
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'egreso', 10, 'Préstamo a otra sede', null, false, null)$$);
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'egreso', 10, 'Compra de insumos', null, false, null)$$);
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'ingreso', 10, 'Devolución de un retiro', null, false, null)$$);
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'egreso', 10, 'Retiro de efectivo', null, false, null)$$);
select pg_temp.intento($$select retail.registrar_movimiento_caja('$$ || :'caja' || $$', 'egreso', 10, 'Pago a proveedor', null, false, null)$$);
`);
  const [fuerte, prestamo, prestamoSalida, insumos, devolucion, retiro, pagoProveedor] = lineas(r);
  esperar("vocabulario: «Sencillo de la caja fuerte» suelto se rechaza", /desconocido/.test(fuerte ?? ""), r);
  esperar("vocabulario: «Préstamo de otra sede» suelto se rechaza", /desconocido/.test(prestamo ?? ""), r);
  esperar("vocabulario: «Préstamo a otra sede» suelto se rechaza", /desconocido/.test(prestamoSalida ?? ""), r);
  esperar("vocabulario: «Compra de insumos» ya no es una salida", /desconocido/.test(insumos ?? ""), r);
  esperar("vocabulario: «Devolución de un retiro» sigue tipeable", devolucion === "SIN_ERROR", r);
  esperar("vocabulario: «Retiro de efectivo» sigue igual", retiro === "SIN_ERROR", r);
  esperar("vocabulario: «Pago a proveedor» suelto se rechaza (el hueco del NULL, de antes)", /desconocido/.test(pagoProveedor ?? ""), r);
}

// 5. Finanzas: no se anula lo que nació en Caja; un cajón como destino exige su ingreso.
{
  const r = correr(`${ESCENA}
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select retail.registrar_ingreso_caja(:'caja', 'caja_fuerte', 30, null, null, null, gen_random_uuid()) as ing \\gset
select id as md from retail.movimientos_dinero where caja_ingreso_id = :'ing' \\gset
select pg_temp.intento($$select retail.anular_movimiento_dinero('$$ || :'md' || $$', 'prueba')$$);
select pg_temp.intento($$select retail.registrar_movimiento_dinero('aporte', 20, null, '$$ || :'cajon_tru' || $$')$$);
`);
  const [anular, sinIngreso] = lineas(r);
  esperar("Finanzas: lo que entró desde Caja no se anula ahí", /nació en Caja/.test(anular ?? ""), r);
  esperar("Finanzas: un aporte al cajón sin su ingreso de caja se rechaza", /necesita su ingreso de caja/.test(sinIngreso ?? ""), r);
}

// 6. Doble clic y permisos.
{
  const r = correr(`${ESCENA}
${cambiaA(MICAELA)}
select gen_random_uuid() as tk \\gset
select retail.registrar_ingreso_caja(:'caja', 'caja_fuerte', 40, null, null, null, :'tk') as a \\gset
select retail.registrar_ingreso_caja(:'caja', 'caja_fuerte', 40, null, null, null, :'tk') as b \\gset
select (:'a' = :'b');
select count(*) from retail.movimientos_dinero d join retail.caja_movimientos m on m.id = d.caja_ingreso_id where m.token_cliente = :'tk';
select pg_temp.intento($$select retail.registrar_ingreso_caja('$$ || :'caja_lim' || $$', 'otro', 10, 'algo', null, null, null)$$);
`);
  const [mismo, unMov, ajena] = lineas(r);
  esperar("doble clic: el mismo token devuelve el mismo ingreso", mismo === "t", r);
  esperar("doble clic: una sola contraparte", Number(unMov) === 1, r);
  esperar("permisos: una colaboradora no registra en la caja de otra sede", /permiso/.test(ajena ?? ""), r);
}

console.log(fallos === 0 ? `\nTodo en orden (${casos} casos)` : `\n${fallos} de ${casos} casos fallaron`);
process.exit(fallos === 0 ? 0 : 1);

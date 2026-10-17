#!/usr/bin/env node
/**
 * Prueba de «cada pago de un apartado se asienta el día en que entró la plata» — auditoría de Finanzas 2026-10-16, hallazgo G02
 * (ADR-0433, actividad 10).
 *
 * EL PROBLEMA. Un apartado se separa con un adelanto y, antes de entregarse, la clienta puede abonar más. El diario (`fn_asientos`) asentaba
 * TODO el adelanto —incluidos los abonos de días o meses después— el día de la separación, con el total actual (`separaciones.adelanto`), y el
 * Balance (`fn_bal_anticipos`) igual. Resultado: un abono de marzo aparecía en febrero; el diario de febrero CAMBIABA cuando la clienta abonaba
 * (un mes cerrado divergía de su foto por una operación normal); y la caja y el IGV quedaban mal fechados. Cuentas y dinero (por fecha del pago)
 * decía otra cosa. Caso real en producción: APT-TRU-0006, separado el 9-oct con pagos de 30.00 (9-oct), 30.00 (14-oct) y 29.90 (15-oct): el diario
 * asentaba 89.90 el 9-oct y nada el 14 ni el 15.
 *
 * QUÉ CUBRE
 *   · cada pago (el primero y cada abono) entra en SU día: 101/104 al debe, 122 y 4011 al haber, un asiento por pago que cuadra solo;
 *   · agregar un abono NO cambia el diario de un mes anterior (la foto de un mes cerrado no diverge por una operación normal);
 *   · devolver el adelanto saca EXACTAMENTE lo que entró (122 y 4011 quedan en cero, con los céntimos por pago);
 *   · entregar el apartado aplica el adelanto (122 y el IGV ya asentado quedan en cero);
 *   · el Balance (`fn_bal_anticipos`) a una fecha suma solo lo recibido hasta esa fecha.
 *
 * CÓMO. La suite arma el apartado con las RPC reales (`separar_prendas`, `abonar_separacion`, `entregar_separacion`,
 * `registrar_devolucion_separacion`) y lleva las fechas de lo creado a febrero y marzo de 2025 con los disparadores apagados. Todo termina en
 * ROLLBACK: nada se confirma en el Postgres local compartido.
 *
 * USO
 *   pnpm pruebas:finanzas-apartados-por-pago                  → contra el Postgres local del contenedor
 *   node scripts/pruebas/finanzas_apartados_por_pago.mjs --base otra → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const k = l.lastIndexOf("|");
        return [l.slice(0, k), l.slice(k + 1)];
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// Preparación como la de `separaciones.mjs`: una caja propia en Trujillo, stock de sobra y una serie propia (en el seed local Lima y Trujillo
// comparten la B001). La prenda cuesta 79.90: el adelanto de 70 (33.33 + 36.67) deja un saldo de 9.90 para la entrega.
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
update retail.parametros_finanzas set inicio_finanzas = null where id;
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT99' when 'factura' then 'FT99' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 20, 'colchón de prueba') returning id as m0 \\gset
select retail.fn_aplicar_movimiento(:'m0') as _a \\gset
`;

// El apartado: 33.33 en efectivo el 27-feb-2025. (Las fechas se llevan a 2025 con los disparadores apagados.)
const APARTAR = `
select retail.separar_prendas(
  p_ubicacion_id => :'ubic', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 33.33, 'recibido', 33.33)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222', p_devolucion_medio => 'yape') as sep \\gset
set local session_replication_role = replica;
update retail.separaciones set created_at = '2025-02-27 12:00-05' where id = :'sep';
update retail.separacion_pagos set created_at = '2025-02-27 12:00-05' where separacion_id = :'sep';
set local session_replication_role = origin;
`;

// El abono: 36.67 por Yape, que se recibe el 5-mar-2025.
const ABONAR = `
select retail.abonar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 36.67))) as _abono \\gset
set local session_replication_role = replica;
update retail.separacion_pagos set created_at = '2025-03-05 11:00-05' where separacion_id = :'sep' and metodo = 'yape';
set local session_replication_role = origin;
`;

// Las líneas del diario de ESTE apartado en un rango (la base local trae otras líneas: solo se mira la del apartado).
const LINEAS = (desde, hasta) => `(select * from retail.fn_asientos('${desde}', '${hasta}') a where a.origen_tabla = 'separaciones' and a.origen_id = :'sep')`;

// ── A · Cada pago entra el día en que se recibió ───────────────────────────────────────────────────────────────────────────
const CASOS_FECHAS = `
create temp table feb_antes as select fecha, asiento, regla, cuenta, debe, haber from ${LINEAS("2025-02-01", "2025-02-28")} x;
select 'A0 antes del abono, febrero trae el primer pago: 33.33 al efectivo, 122 por 28.25 y el IGV (5.08)',
  (select count(*) = 3 and sum(debe) = 33.33 and sum(haber) = 33.33
          and bool_or(cuenta = '101' and debe = 33.33) and bool_or(cuenta = '122' and haber = 28.25) and bool_or(cuenta = '4011' and haber = 5.08) from feb_antes);
${ABONAR}
select 'A1 febrero NO cambia cuando la clienta abona en marzo (un mes cerrado no diverge por una operación normal)',
  (select count(*) from (select fecha, asiento, regla, cuenta, debe, haber from feb_antes
                         except select fecha, asiento, regla, cuenta, debe, haber from ${LINEAS("2025-02-01", "2025-02-28")} x) f) = 0
  and (select count(*) from ${LINEAS("2025-02-01", "2025-02-28")} x) = 3;
select 'A2 el abono entra en marzo, el día 5: 36.67 por Yape (104), 122 por 31.08 y el IGV (5.59)',
  (select count(*) = 3 and sum(debe) = 36.67 and sum(haber) = 36.67 and min(fecha) = date '2025-03-05' and max(fecha) = date '2025-03-05'
          and bool_or(cuenta = '104' and debe = 36.67) and bool_or(cuenta = '122' and haber = 31.08) and bool_or(cuenta = '4011' and haber = 5.59)
     from ${LINEAS("2025-03-01", "2025-03-31")} x);
select 'A3 cada pago es su propio asiento y cada uno cuadra',
  (select count(distinct asiento) = 2 from ${LINEAS("2025-02-01", "2025-03-31")} x)
  and (select count(*) = 0 from (select asiento from ${LINEAS("2025-02-01", "2025-03-31")} x group by asiento having round(sum(debe), 2) <> round(sum(haber), 2)) d);
select 'A4 en todo el rango el diario cuadra (ningún asiento descuadrado por culpa de los apartados)',
  (select count(*) = 0 from retail.fn_asientos_descuadrados('2025-02-01', '2025-03-31'));
`;

// ── B · El Balance suma lo recibido hasta la fecha ─────────────────────────────────────────────────────────────────────────
const CASOS_BALANCE = `
${ABONAR}
select 'B1 el Balance al 28-feb suma solo el primer pago (33.33 menos su IGV = 28.25)',
  (select coalesce(sum(monto), 0) = 28.25 from retail.fn_bal_anticipos('2025-02-28') b where b.ubicacion_id = :'ubic');
select 'B2 al 10-mar suma los dos pagos (28.25 + 31.08 = 59.33)',
  (select coalesce(sum(monto), 0) = 59.33 from retail.fn_bal_anticipos('2025-03-10') b where b.ubicacion_id = :'ubic');
select 'B3 y el Balance es lo que dice el libro: el saldo de la 122 de este apartado al 10-mar',
  (select coalesce(sum(haber - debe), 0) = 59.33 from retail.fn_asientos('2025-02-01', '2025-03-10') a where a.origen_tabla = 'separaciones' and a.origen_id = :'sep' and a.cuenta = '122');
`;

// ── C · Devolver el adelanto saca exactamente lo que entró ─────────────────────────────────────────────────────────────────
const CASOS_DEVOLUCION = `
${ABONAR}
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _lib \\gset
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-G02') as _dev \\gset
set local session_replication_role = replica;
update retail.separaciones set devuelta_en = '2025-03-20 10:00-05' where id = :'sep';
set local session_replication_role = origin;
select 'C1 devuelto el 20-mar, la 122 y el 4011 de este apartado quedan en cero (los céntimos por pago: 5.08 + 5.59 = 10.67 salen enteros, no los 10.68 del total)',
  (select round(sum(haber - debe) filter (where cuenta = '122'), 2) = 0 and round(sum(haber - debe) filter (where cuenta = '4011'), 2) = 0
     from retail.fn_asientos('2025-02-01', '2025-03-31') a where a.origen_tabla = 'separaciones' and a.origen_id = :'sep');
select 'C2 y el dinero también: lo que entró (33.33 + 36.67) sale (70) el 20-mar',
  (select round(sum(haber) filter (where regla = 'anticipo_devuelto'), 2) = 70
     from retail.fn_asientos('2025-03-20', '2025-03-20') a where a.origen_tabla = 'separaciones' and a.origen_id = :'sep');
select 'C3 devuelto, el Balance al 31-mar ya no lo cuenta',
  (select coalesce(sum(monto), 0) = 0 from retail.fn_bal_anticipos('2025-03-31') b where b.ubicacion_id = :'ubic');
select 'C4 el diario de todo el rango sigue cuadrando',
  (select count(*) = 0 from retail.fn_asientos_descuadrados('2025-02-01', '2025-03-31'));
`;

// ── D · Entregar el apartado aplica el adelanto ────────────────────────────────────────────────────────────────────────────
const CASOS_ENTREGA = `
${ABONAR}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', round(:'precio'::numeric - 70, 2)))) as venta \\gset
set local session_replication_role = replica;
update retail.ventas set created_at = '2025-03-25 15:00-05' where id = :'venta';
update retail.separaciones set entregada_en = '2025-03-25 15:00-05' where id = :'sep';
set local session_replication_role = origin;
select 'D1 entregado el 25-mar, la 122 queda en cero: lo que se le debía a la clienta se aplicó a la venta',
  (select round(sum(haber - debe), 2) = 0
     from retail.fn_asientos('2025-02-01', '2025-03-31') a
    where a.cuenta = '122' and ((a.origen_tabla = 'separaciones' and a.origen_id = :'sep') or (a.origen_tabla = 'ventas' and a.origen_id = :'venta')));
select 'D2 y el IGV de los adelantos que la venta aplica es EXACTAMENTE el que entró con ellos (5.08 + 5.59 = 10.67): el 4011 no queda huérfano',
  (select round(sum(debe) filter (where a.origen_tabla = 'ventas' and a.cuenta = '4011' and a.glosa like 'IGV del adelanto%'), 2) = 10.67
      and round(sum(haber) filter (where a.origen_tabla = 'separaciones' and a.cuenta = '4011'), 2) = 10.67
     from retail.fn_asientos('2025-02-01', '2025-03-31') a
    where (a.origen_tabla = 'separaciones' and a.origen_id = :'sep') or (a.origen_tabla = 'ventas' and a.origen_id = :'venta'));
select 'D3 entregado, el Balance al 31-mar ya no lo cuenta como adelanto',
  (select coalesce(sum(monto), 0) = 0 from retail.fn_bal_anticipos('2025-03-31') b where b.ubicacion_id = :'ubic');
select 'D4 el diario de todo el rango sigue cuadrando',
  (select count(*) = 0 from retail.fn_asientos_descuadrados('2025-02-01', '2025-03-31'));
`;

verificar("Cada pago en su día", correr(`${PREPARAR}${APARTAR}${CASOS_FECHAS}`), casosDe(CASOS_FECHAS));
verificar("El Balance a una fecha", correr(`${PREPARAR}${APARTAR}${CASOS_BALANCE}`), casosDe(CASOS_BALANCE));
verificar("Devolver el adelanto", correr(`${PREPARAR}${APARTAR}${CASOS_DEVOLUCION}`), casosDe(CASOS_DEVOLUCION));
verificar("Entregar el apartado", correr(`${PREPARAR}${APARTAR}${CASOS_ENTREGA}`), casosDe(CASOS_ENTREGA));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);

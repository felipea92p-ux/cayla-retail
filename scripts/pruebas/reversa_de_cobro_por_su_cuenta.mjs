#!/usr/bin/env node
/**
 * Lo que se le devuelve a un cliente sale por la MISMA cuenta por la que entró su cobro — y nunca por la tarjeta de crédito
 * de CAYLA (451). ADR-0120 («Actualización 2026-10-17»), ADR-0195 F7.
 *
 * EL CONVENIO QUE VIGILA. `fn_asiento_cuenta_de_medio(medio, sentido)` tiene dos sentidos y el nombre engaña:
 *   · `'entra'` es el lado de caja o banco de un cobro… Y de su reversa (anulación, devolución, diferencia de un cambio
 *     devuelta, adelanto devuelto): la plata vuelve por donde entró. Con tarjeta, la 105 (por abonar): el POS descuenta la
 *     devolución del siguiente abono y la puente se netea sola.
 *   · `'sale'` es SOLO lo que CAYLA paga con un medio propio (gastos, activos, pagos a proveedor). Con tarjeta, la 451: la
 *     tarjeta de crédito de CAYLA, una deuda.
 * `fn_asientos` nació (20260925130000) llamando a las cuatro reversas con `'sale'` —una devolución con tarjeta se asentaba
 * como una deuda nueva con el banco— y F7 (20260925170000) las cambió a `'entra'` con un reemplazo anclado sobre la función
 * viva. Ese arreglo vive SOLO como parche: si alguien recrea `fn_asientos` desde el archivo original, se pierde sin ruido.
 * Esta prueba es el candado: la devolución ya la cubría `balance.mjs` (F1); aquí van las cuatro reversas, con cada medio.
 *
 * QUÉ CUBRE
 *   · por cada medio (efectivo, tarjeta, yape, plin, transferencia; qr solo en la anulación, que es la única reversa que
 *     hoy lo acepta): la anulación de una venta, la devolución aprobada, la diferencia de un cambio que se le devuelve al
 *     cliente y el adelanto devuelto de un apartado salen por la cuenta del cobro y nunca por la 451;
 *   · con tarjeta, esa cuenta es la 105 (por abonar), la misma que lleva el abono del POS (104 | 105);
 *   · el contraste: un gasto pagado con la tarjeta de CAYLA sí va a la 451 (para eso existe `'sale'`);
 *   · cada asiento cuadra (debe = haber);
 *   · AUTOPRUEBA: con `fn_asientos` vuelta a su versión original (las cuatro reversas con `'sale'`, dentro de la misma
 *     transacción, que se revierte), los casos de tarjeta se ponen rojos. Si no se pusieran, la prueba estaría ciega.
 *
 * El medio del QR no decide esta prueba: con `qr → 105` (ADR-0429, rama de las máquinas de cobro) o sin él, la reversa de un
 * cobro con QR va a la cuenta del cobro, y eso es lo que se exige. Los dos parches conviven en cualquier orden.
 *
 * CÓMO. El patrón de `estado_resultados.mjs`: UNA transacción con ROLLBACK (la base la comparten otras sesiones), sesión
 * simulada de Felipe (líder), la escena en MAYO DE 2034 (un mes que ninguna otra prueba usa), ventas, devoluciones, cambios y
 * apartados insertados directo (como hace F5) y el diario leído con `fn_asientos`. No guarda nada.
 *
 * USO
 *   pnpm pruebas:reversa-de-cobro                                        → contra el stack local (`npx supabase start`)
 *   pnpm pruebas:reversa-de-cobro -- --contenedor supabase_db_<mi-pila>  → contra una pila propia
 */

import { execFileSync } from "node:child_process";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
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
function esperar(nombre, ok, detalle) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
/** Cada verificación sale como una línea `caso|t`. Devuelve el mapa caso → valor. */
function lineasDe(r) {
  return new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

// ============================================================================================================================
// La escena: MAYO DE 2034, Tienda Trujillo, prenda de prueba de S/ 100 sin costo (así la anulación no mezcla mercadería).
// ============================================================================================================================
const MEDIOS = ["efectivo", "tarjeta", "yape", "plin", "transferencia", "qr"];
// Dónde acepta cada medio la base hoy. El QR entra solo por la venta (`venta_pagos`); devoluciones, cambios y apartados no lo
// tienen en su `check`. Un adelanto devuelto en efectivo exige su movimiento de caja (`separaciones_devolucion_efectivo_en_caja`):
// la regla del efectivo ya la cubren la anulación, la devolución y el cambio.
const CON_DEVOLUCION = ["efectivo", "tarjeta", "yape", "plin", "transferencia"];
const CON_ADELANTO = ["tarjeta", "yape", "plin", "transferencia"];

const AYUDANTES = `
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Una venta de UNA línea con sus cobros (jsonb [{m, v}]); si viene anulada, con la condición de la prenda (como en F5).
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_precio numeric, p_pagos jsonb,
                               p_anulada timestamptz default null) returns void language plpgsql as $f$
declare x jsonb;
begin
  insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, created_at)
  values (pg_temp.k(p_n), p_ubic, case when p_anulada is null then 'completada' else 'anulada' end, p_anulada,
          case when p_anulada is null then null else 'prueba de la reversa' end, p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, 1, p_precio, 0, 0);
  for x in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), x ->> 'm', (x ->> 'v')::numeric);
  end loop;
  if p_anulada is not null then
    insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (pg_temp.k(p_n), pg_temp.k(p_n || 'i'), 'vendible');
  end if;
end $f$;
`;

function escenaDe(medio) {
  const m = medio;
  let sql = `
-- ===== ${m} =====
-- Venta del 10-may cobrada con ${m}, anulada el 12-may (prenda vendible).
select pg_temp.vender('A_${m}', :'tru', '2034-05-10 12:00-05', :'va', 100, '[{"m":"${m}","v":100}]', '2034-05-12 12:00-05');
`;
  if (CON_DEVOLUCION.includes(m)) {
    sql += `
-- Venta del 10-may cobrada con ${m}; devolución aprobada el 14-may, reembolsada con ${m}.
select pg_temp.vender('V_${m}', :'tru', '2034-05-10 12:00-05', :'va', 100, '[{"m":"${m}","v":100}]');
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
values (pg_temp.k('D_${m}'), pg_temp.k('V_${m}'), :'tru', 'talla', 'aprobada', 100, '${m}', '2034-05-14 10:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (pg_temp.k('D_${m}'), pg_temp.k('V_${m}i'), 1, 'vendible');
-- Venta del 10-may cobrada con ${m}; cambio del 16-may por una prenda más barata: se le devuelven 30 con ${m}.
select pg_temp.vender('X_${m}', :'tru', '2034-05-10 12:00-05', :'va', 100, '[{"m":"${m}","v":100}]');
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, motivo, condicion, created_at)
values (pg_temp.k('C_${m}'), pg_temp.k('X_${m}i'), :'tru', :'vn', 1, -30, '${m}', 'talla_chica', 'vendible', '2034-05-16 12:00-05');
`;
  }
  if (CON_ADELANTO.includes(m)) {
    sql += `
-- Apartado del 3-may con adelanto de 59 por Yape; vence, se libera el 18 y se devuelve el 20-may con ${m}.
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo,
       creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, estado, liberada_en, liberada_motivo, devuelta_en,
       devolucion_medio_real, created_at)
values (pg_temp.k('S_${m}'), 'RV-' || left(pg_temp.k('S_${m}')::text, 8), :'tru', :'caja', 'Cliente', 'De prueba', '999888777', 'boleta',
        :'felipe', 100, 59, '2034-05-17', 'yape', '999888777', 'devuelta', '2034-05-18 10:00-05', 'vencio', '2034-05-20 10:00-05',
        '${m}', '2034-05-03 10:00-05');
insert into retail.separacion_pagos (separacion_id, metodo, monto, created_at) values (pg_temp.k('S_${m}'), 'yape', 59, '2034-05-03 10:00-05');
`;
  }
  return sql;
}

// Un gasto pagado con la tarjeta de crédito de CAYLA: el único uso legítimo de ('tarjeta', 'sale') → 451.
const CONTRASTE = `
insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable) values (pg_temp.k('TC'), 'Tarjeta de crédito de prueba', 'tarjeta_credito', '451');
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago)
values (pg_temp.k('G_tc'), null, 'gastos_bancarios', 'Pagado con la tarjeta de crédito de CAYLA', '2034-05-22', 50, 0, 'tarjeta');
`;

function casosDe(medio) {
  const m = medio;
  // La cuenta por la que ENTRÓ el cobro de esa venta (la línea «Cobro (medio)» del asiento de la venta).
  const entro = (n) => `(select cuenta from dia where origen_id = pg_temp.k('${n}') and regla = 'venta' and glosa like 'Cobro (%')`;
  const casos = [
    [`${m} · la anulación devuelve el cobro por la cuenta por la que entró`,
     `(select cuenta = ${entro(`A_${m}`)} and haber = 100 from dia where origen_id = pg_temp.k('A_${m}') and regla = 'anulacion' and glosa like 'Se devuelve el cobro (%')`],
  ];
  if (CON_DEVOLUCION.includes(m)) {
    casos.push(
      [`${m} · el reembolso de la devolución sale por la cuenta del cobro`,
       `(select cuenta = ${entro(`V_${m}`)} and haber = 100 from dia where origen_id = pg_temp.k('D_${m}') and regla = 'devolucion' and glosa like 'Reembolso (%')`],
      [`${m} · la diferencia devuelta del cambio sale por la cuenta del cobro`,
       `(select cuenta = ${entro(`X_${m}`)} and haber = 30 from dia where origen_id = pg_temp.k('C_${m}') and regla = 'cambio' and glosa = 'Se le devolvió la diferencia')`],
    );
  }
  if (CON_ADELANTO.includes(m)) {
    casos.push([
      `${m} · el adelanto devuelto sale por la cuenta de ese medio`,
      `(select cuenta = retail.fn_asiento_cuenta_de_medio('${m}', 'entra') and haber = 59 from dia where origen_id = pg_temp.k('S_${m}') and regla = 'anticipo_devuelto' and glosa like 'Devolución del adelanto (%')`,
    ]);
  }
  if (m === "tarjeta") {
    casos.push(
      ["tarjeta · esa cuenta es la 105 (por abonar), la misma del abono del POS",
       `(select bool_and(cuenta = '105') and count(*) = 4 from dia where cuenta in ('105', '451') and haber > 0
          and ((origen_id = pg_temp.k('A_tarjeta') and regla = 'anulacion') or (origen_id = pg_temp.k('D_tarjeta') and regla = 'devolucion')
            or (origen_id = pg_temp.k('C_tarjeta') and regla = 'cambio') or (origen_id = pg_temp.k('S_tarjeta') and regla = 'anticipo_devuelto')))`],
      ["tarjeta · ninguna de las cuatro reversas toca la 451",
       `(not exists (select 1 from dia where cuenta = '451' and origen_id in (pg_temp.k('A_tarjeta'), pg_temp.k('D_tarjeta'), pg_temp.k('C_tarjeta'), pg_temp.k('S_tarjeta'))))`],
    );
  }
  return casos;
}

const CASOS_GENERALES = [
  ["en todo el mes, ninguna devolución a un cliente toca la 451",
   `(not exists (select 1 from dia where cuenta = '451' and regla in ('anulacion', 'devolucion', 'cambio', 'anticipo_devuelto', 'pedido_web_pago_anulado')))`],
  ["el contraste: un gasto pagado con la tarjeta de crédito de CAYLA sí va a la 451",
   `(select cuenta = '451' and haber = 50 from dia where origen_id = pg_temp.k('G_tc') and regla = 'gasto' and haber > 0)`],
  ["fn_asiento_cuenta_de_medio: tarjeta entra 105, tarjeta sale 451 (solo para lo que paga CAYLA)",
   `(retail.fn_asiento_cuenta_de_medio('tarjeta', 'entra') = '105' and retail.fn_asiento_cuenta_de_medio('tarjeta', 'sale') = '451')`],
  ["cada asiento de la escena cuadra (debe = haber)",
   `(select coalesce(bool_and(abs(d - h) < 0.005), true) from (select asiento, sum(debe) d, sum(haber) h from dia where origen_id in (select id from k) group by asiento) x)`],
];

// La regresión que se vigila: `fn_asientos` vuelta a su versión original (20260925130000), con las cuatro reversas en
// `'sale'`. Se hace sobre la definición VIVA, dentro de la transacción (se revierte con todo lo demás). Cada ancla tiene que
// aparecer exactamente una vez; si no, el diario cambió y la autoprueba se detiene sin tocar nada.
const MUTACION = `
do $m$
declare
  v text := pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure);
  a text;
  n integer;
begin
  foreach a in array array[
    $$'anulacion', retail.fn_asiento_cuenta_de_medio(c.metodo, 'entra')$$,
    $$'devolucion', retail.fn_asiento_cuenta_de_medio(dd.metodo, 'entra')$$,
    $$'cambio', retail.fn_asiento_cuenta_de_medio(cb.metodo, 'entra'), 0, -cb.diferencia$$,
    $$'anticipo_devuelto', retail.fn_asiento_cuenta_de_medio(sd.medio, 'entra')$$
  ] loop
    n := (length(v) - length(replace(v, a, ''))) / length(a);
    if n <> 1 then
      raise exception 'autoprueba: el ancla «%» aparece % veces en fn_asientos (se esperaba 1). El diario cambió: rehace la autoprueba sobre su definición viva.', a, n;
    end if;
    v := replace(v, a, replace(a, $$'entra')$$, $$'sale')$$));
  end loop;
  execute v;
end $m$;
`;

function escena({ mutada }) {
  const medios = MEDIOS.map(escenaDe).join("\n");
  const casos = [...MEDIOS.flatMap(casosDe), ...CASOS_GENERALES]
    .map(([nombre, expr]) => `select '${nombre.replace(/'/g, "''")}', ${expr};`)
    .join("\n");
  return `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${AYUDANTES}
${mutada ? MUTACION : ""}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select (select id from retail.cajas order by abierta_en desc nulls last limit 1) as caja \\gset
-- Una prenda propia, sin historia de costo, con el color de otra (como en F5: «Sin color» no entra junto a sus colores).
insert into retail.variantes (producto_id, color_codigo, sku, precio, costo)
select v.producto_id, v.color_codigo, 'PRUEBA-REVERSA-VA', 100, 0 from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1
returning id as va \\gset
select v.id as vn from retail.variantes v where v.id not in ('22222222-2222-4222-8222-222222222222', :'va') order by v.id limit 1 \\gset
${medios}
${CONTRASTE}
create temp table dia as select * from retail.fn_asientos('2034-05-01', '2034-05-31');
${casos}
`;
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }
  console.log("La reversa de un cobro sale por su cuenta (nunca por la 451)\n");

  // ---- 1. Con el diario como está ----
  const esperados = [...MEDIOS.flatMap(casosDe), ...CASOS_GENERALES].map(([nombre]) => nombre);
  const r = correr(escena({ mutada: false }));
  if (!r.ok) {
    esperar("la escena corre", false, r);
  } else {
    const lineas = lineasDe(r);
    for (const caso of esperados) {
      esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-800) });
    }
  }

  // ---- 2. Autoprueba: con la versión original de fn_asientos, los casos de tarjeta se ponen rojos ----
  const deTarjeta = casosDe("tarjeta").map(([nombre]) => nombre);
  const rm = correr(escena({ mutada: true }));
  if (!rm.ok) {
    esperar("autoprueba: la escena corre con fn_asientos vuelta a su versión original", false, rm);
  } else {
    const lineas = lineasDe(rm);
    const rojos = deTarjeta.filter((c) => lineas.get(c) === "f");
    esperar(
      `autoprueba: con las cuatro reversas en 'sale' la prueba VE la regresión (${rojos.length} de ${deTarjeta.length} casos de tarjeta en rojo)`,
      rojos.length === deTarjeta.length,
      { enVerdePeseALaMutacion: deTarjeta.filter((c) => lineas.get(c) !== "f") },
    );
    esperar(
      "autoprueba: la regresión también enciende «ninguna devolución a un cliente toca la 451»",
      lineas.get(CASOS_GENERALES[0][0]) === "f",
    );
  }

  console.log(`\n${casos - fallos}/${casos} en verde · contenedor: ${CONTENEDOR_LOCAL}`);
  if (fallos > 0) process.exit(1);
}

main();

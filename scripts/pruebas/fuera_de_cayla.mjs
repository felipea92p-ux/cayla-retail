#!/usr/bin/env node
/**
 * Prueba de ADR-0638 (actividad 2 de Lima, migraciones 20261110001000, 20261110002000 y 20261110003000): el Yape de Claudia sale de los números de CAYLA.
 *
 * LO QUE IMPORTA.
 *   · I1. Con la cuenta vacía, todo da idéntico a como si nada de esto existiera (se comparan las huellas con y sin los parches y con y sin la cuenta).
 *   · I2. Un Yape de CLAURE puesto en la cuenta de Claudia, con `corregir_pagos_venta` y cuenta explícita, sale de BCP, de los saldos, del Flujo y del Balance.
 *   · I4. El Diario sigue cuadrando: cada asiento, debe = haber.
 *   · Lo que va al revés (anulación, devolución, adelanto devuelto, cambio) también se cancela.
 *   · Nadie paga un gasto, una compra, un activo o un movimiento con esa cuenta, y no aparece en ninguna lista para elegir. Un cobro Yape o Plin en su sede sí se puede.
 *   · CONTROL: sin cada parche, lo que se prueba falla (la prueba muerde).
 *   · INVARIANTE: toda columna con llave a `cuentas_dinero` está clasificada aquí: o puede tener una cuenta ajena porque es un cobro, o dice cómo se le impide. Una tabla nueva obliga a decidir.
 *
 * Cada caso corre en su transacción y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:fuera-de-cayla   (necesita el stack local con todas las migraciones)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEGIR_A, ELEGIR_B_CON_PRODUCTO } from "./_claure_prendas.mjs";
import { sqlDeshacer } from "./_deshacer_claure.mjs";
import { haceHoras } from "./_reloj_lima.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const M1 = "20261110001000_cuenta_de_otra_empresa_candados_y_filtro.sql";
const M2 = "20261110002000_cuenta_de_otra_empresa_en_el_diario.sql";
const M3 = "20261110003000_yape_de_claudia_lim.sql";
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const firmasDe = (f) => [...new Set([...leer(f).matchAll(/pg_temp\.reemplazar\('([^']+)',\n\$v\$/g)].map((m) => m[1]))];
const FIRMAS_M1 = firmasDe(M1);
const FIRMA_DIARIO = "retail.fn_asientos_claure(date, date, boolean, uuid[])";
const FIRMA_LIBRO = "retail.fn_dinero_libro(date)";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";
const YAPE = "'c1a07e00-0000-4000-8000-000000000101'";
const BCP = "'00000000-0000-4000-8000-0000000000b1'";
const CAJA = "'00000000-0000-4000-8000-0000000000e1'";
const V = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
const HOY = "retail.fn_hoy_lima()";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");

// ---------------------------------------------------------------------------------------------------------------------------------------------
// La escena: Lima con CAYLA y CLAURE; BCP Empresa con saldo y como destino del Yape y el Plin; la caja de Lima abierta; tres ventas de hoy.
// a1 = CLAURE 59 por Yape, a2 = CAYLA 100 por Yape, a3 = CLAURE 30 por Plin. Se escribe sin disparadores y lo demás (lo que el seed dejó) se aísla.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const ESCENA = `
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;
${ELEGIR_A}
${ELEGIR_B_CON_PRODUCTO}
set local session_replication_role = replica;
update retail.ventas set es_prueba = true where not coalesce(es_prueba, false);
update retail.devoluciones set estado = 'rechazada' where estado = 'aprobada';
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
update retail.productos set empresa_id = ${CAYLA} where id = :'p_b';
insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde) values (${BCP}, 'BCP Empresa de prueba', 'banco', '104', 1000, date_trunc('month', ${HOY})::date);
delete from retail.medios_de_cobro where ubicacion_id = ${LIMA};
insert into retail.medios_de_cobro (ubicacion_id, medio, cuenta_id, vigente_desde) values (${LIMA}, 'yape', ${BCP}, date '2026-01-01'), (${LIMA}, 'plin', ${BCP}, date '2026-01-01'), (${LIMA}, 'transferencia', ${BCP}, date '2026-01-01');
update retail.cajas set estado = 'cerrada', cerrada_en = now(), monto_cierre_real = 0, monto_fondo = 0 where estado = 'abierta' and ubicacion_id = ${LIMA};
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en) values (${CAJA}, ${LIMA}, 'abierta', 100, ${haceHoras(1)});
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id) values
  (${V("a1")}, ${LIMA}, ${haceHoras(0.5)}, 'completada', false, ${CAJA}),
  (${V("a2")}, ${LIMA}, ${haceHoras(0.5)}, 'completada', false, ${CAJA}),
  (${V("a3")}, ${LIMA}, ${haceHoras(0.5)}, 'completada', false, ${CAJA});
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${V("f1")}, ${V("a1")}, :'va_a', 1, 59, 10),
  (${V("f2")}, ${V("a2")}, :'va_b', 1, 100, 10),
  (${V("f3")}, ${V("a3")}, :'va_a', 1, 30, 5);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${V("a1")}, 'yape', 59, ${BCP}), (${V("a2")}, 'yape', 100, ${BCP}), (${V("a3")}, 'plin', 30, ${BCP});
set local session_replication_role = origin;
create or replace function pg_temp.intento(p text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  execute p;
  return 'paso';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
`;

/** Lo que el Balance necesita para dibujar la 104 por sus dos caminos: el arranque, al primer día del mes. */
const ARRANQUE = `select retail.registrar_saldo_inicial(date_trunc('month', ${HOY})::date, '[{"cuenta":"104","monto":1000},{"cuenta":"50","monto":1000}]'::jsonb) as _ar \\gset`;

const dentro = (cuerpo, { escena = true, salida = true } = {}) => psql(`begin;\n\\o /dev/null\n${escena ? ESCENA : ""}\n${salida ? "\\o" : ""}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const contiene = (obtenido, texto) => (String(obtenido).includes(texto) ? null : `se esperaba que dijera «${texto}» y salió\n${obtenido}`);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 14).join("\n    ")}`);
  }
}

/** Mueve el Yape de CLAURE de 59 a la cuenta de Claudia por la misma puerta que usará la corrección de lo registrado. */
const MOVER_A1 = `select retail.corregir_pagos_venta(${V("a1")}, jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 59, 'cuenta_dinero_id', ${YAPE}::text)), 'Prueba: cayó en el número de Claudia') as _c \\gset`;

/** Todo lo que no debe contar lo de Claudia, en filas (clave, valor). */
const MEDIDAS = `
  select 'saldo_bcp' k, coalesce((select s.saldo from retail.fn_cuentas_dinero_saldos(${HOY}, null) s where s.id = ${BCP}), 0)::numeric v
  union all select 'bal_dinero_bcp', coalesce((select b.saldo from retail.fn_bal_dinero(${HOY}) b where b.cuenta_dinero_id = ${BCP}), 0)
  union all select 'libro_bcp', coalesce((select sum(l.monto) from retail.fn_dinero_libro(${HOY}) l where l.cuenta_id = ${BCP}), 0)
  union all select 'conciliacion_bcp', coalesce((select c.saldo_hoy from retail.fn_conciliacion_cuentas() c where c.id = ${BCP}), 0)
  union all select 'flujo_disponible', retail.fn_flujo_disponible(${HOY})
  union all select 'flujo_lineas', coalesce((select sum(l.monto) from retail.fn_flujo_lineas(${HOY}, ${HOY}) l where l.con_cuenta), 0)
  union all select 'flujo_real_entro', (retail.fn_flujo_caja_real(${HOY}, ${HOY}) ->> 'entro')::numeric
  union all select 'otro_camino_104', coalesce((select o.saldo from retail.fn_bal_otro_camino(${HOY}) o where o.cuenta = '104'), 0)
  union all select 'diario_104', coalesce((select sum(a.debe - a.haber) from retail.fn_asientos(${HOY}, ${HOY}, null) a where a.cuenta = '104'), 0)
  union all select 'diario_479', coalesce((select sum(a.debe - a.haber) from retail.fn_asientos(${HOY}, ${HOY}, null) a where a.cuenta = '479'), 0)
  union all select 'diario_7011', coalesce((select sum(a.debe - a.haber) from retail.fn_asientos(${HOY}, ${HOY}, null) a where a.cuenta = '7011'), 0)
  union all select 'diario_4011', coalesce((select sum(a.debe - a.haber) from retail.fn_asientos(${HOY}, ${HOY}, null) a where a.cuenta = '4011'), 0)
  union all select 'comprobacion_104_diario', coalesce((select c.diario from retail.fn_conciliacion_contable(${HOY}) c where c.clave = '104'), 0)
  union all select 'comprobacion_104_otro', coalesce((select c.otro from retail.fn_conciliacion_contable(${HOY}) c where c.clave = '104'), 0)
  union all select 'comprobacion_104_diferencia', coalesce((select c.diferencia from retail.fn_conciliacion_contable(${HOY}) c where c.clave = '104'), 0)
`;

/** Cuánto cambió cada medida al mover el pago. */
const DIFERENCIAS = (mover) => `
${ARRANQUE}
create temp table antes on commit drop as ${MEDIDAS};
${mover}
create temp table despues on commit drop as ${MEDIDAS};
select a.k || '=' || (d.v - a.v)::numeric(12,2) from antes a join despues d using (k) order by a.k;
`;

/** Los asientos descuadrados de hoy (tiene que dar 0). */
const DESCUADRADOS = `(select count(*) from (select a.asiento from retail.fn_asientos(${HOY}, ${HOY}, null) a group by a.asiento having abs(sum(a.debe) - sum(a.haber)) > 0.005) x)`;

/** Las huellas que no pueden cambiar mientras la cuenta esté vacía, en filas (clave, huella). */
const HUELLAS = (() => {
  const de = (k, sql) => `select '${k}' k, md5(coalesce((select string_agg(x::text, '|' order by x::text) from (${sql}) x), '')) h`;
  const desde = `${HOY} - 40`;
  const mes = `date_trunc('month', ${HOY})::date`;
  return [
    de("libro", `select * from retail.fn_dinero_libro(${HOY})`),
    de("bal_dinero", `select * from retail.fn_bal_dinero(${HOY}) b where b.saldo <> 0`),
    de("otro_camino", `select * from retail.fn_bal_otro_camino(${HOY})`),
    de("flujo_lineas", `select * from retail.fn_flujo_lineas(${desde}, ${HOY})`),
    de("asientos_dinero", `select * from retail.fn_asientos_dinero_y_caja(${desde}, ${HOY}, true, null)`),
    de("asientos", `select * from retail.fn_asientos(${desde}, ${HOY}, null)`),
    de("saldos", `select * from retail.fn_cuentas_dinero_saldos(${HOY}, null)`),
    de("conciliacion", `select * from retail.fn_conciliacion_cuentas()`),
    de("elegir_pago", `select * from retail.fn_cuentas_para_elegir('pago', ${LIMA})`),
    de("elegir_cobro", `select * from retail.fn_cuentas_para_elegir('cobro', ${LIMA})`),
    de("destinos", `select * from retail.fn_cuentas_dinero_destinos()`),
    de("bancos_compras", `select retail.fn_bancos_para_plata_compras()`),
    de("devolver_compras", `select retail.fn_cuentas_para_devolver_compras()`),
    de("fondos_opciones", `select retail.fn_fondos_opciones() -> 'cuentas'`),
    de("confianza", `select retail.fn_finanzas_confianza(${mes}, null)`),
    de("cierre_mes", `select alcance, nombre, estado, chequeos from retail.fn_cierre_mes_estado(${mes})`),
  ].join("\nunion all ");
})();

// ---------------------------------------------------------------------------------------------------------------------------------------------
// La cuenta
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— La cuenta —");

caso("nace una sola, de CLAURE: banco, 104, saldo 0, sin fecha de arranque y sin número", () =>
  igual(
    psql(`select nombre, tipo, cuenta_contable, saldo_inicial::numeric(12,2), coalesce(saldo_desde::text, '-'), coalesce(numero, '-'), coalesce(archivada_en::text, '-'), empresa_id = ${CLAURE}::uuid
            from retail.cuentas_dinero where empresa_id <> ${CAYLA}::uuid;`),
    "Yape de Claudia · LIM|banco|104|0.00|-|-|-|t",
  ));

caso("una cuenta no cambia de empresa", () =>
  igual(dentro(`select pg_temp.intento($$update retail.cuentas_dinero set empresa_id = ${CAYLA} where id = ${YAPE}$$);`), "cuenta_ajena"));

caso("una cuenta de CAYLA tampoco pasa a otra empresa", () =>
  igual(dentro(`select pg_temp.intento($$update retail.cuentas_dinero set empresa_id = ${CLAURE} where id = ${BCP}$$);`), "cuenta_ajena"));

caso("una cuenta ajena no lleva saldo inicial ni fecha de arranque (ni con la marca de edición)", () =>
  igual(
    dentro(`select set_config('retail.editando_cuenta', 'si', true) as _e \\gset
      select pg_temp.intento($$update retail.cuentas_dinero set saldo_inicial = 10, saldo_desde = current_date where id = ${YAPE}$$);`),
    "cuenta_ajena",
  ));

caso("su nombre y su número sí se pueden editar (el candado no estorba lo normal)", () =>
  igual(dentro(`select pg_temp.intento($$update retail.cuentas_dinero set numero = '999' where id = ${YAPE}$$);`), "paso"));

// ---------------------------------------------------------------------------------------------------------------------------------------------
// I1: con la cuenta vacía, nada cambia
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— I1: con la cuenta vacía, todo igual —");

caso("las 16 huellas (libro, Balance, Flujo, Diario, saldos, listas, medidor y cierre) son las mismas con los parches y la cuenta, y sin ellos", () =>
  igual(
    dentro(`
create temp table con on commit drop as ${HUELLAS};
\\o /dev/null
${sqlDeshacer(M1, FIRMAS_M1)}
${sqlDeshacer(M2, [FIRMA_DIARIO])}
set local session_replication_role = replica;
delete from retail.cuentas_dinero where id = ${YAPE};
set local session_replication_role = origin;
\\o
create temp table sin on commit drop as ${HUELLAS};
select count(*) || '|' || coalesce((select string_agg(c.k, ',' order by c.k) from con c join sin s using (k) where c.h is distinct from s.h), 'ninguna') from con;`),
    "16|ninguna",
  ));

caso("con la cuenta vacía, fn_claure_fuera no devuelve filas", () =>
  igual(dentro(`select count(*) from retail.fn_claure_fuera(${HOY} - 40, ${HOY}, true, null);`), "0"));

// ---------------------------------------------------------------------------------------------------------------------------------------------
// I2 e I4: el Yape puesto en su cuenta
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— I2 e I4: un Yape de CLAURE en la cuenta de Claudia —");

const ESPERADO_MOVIDO = [
  "bal_dinero_bcp=-59.00",
  "comprobacion_104_diario=-59.00",
  "comprobacion_104_diferencia=0.00",
  "comprobacion_104_otro=-59.00",
  "conciliacion_bcp=-59.00",
  "diario_104=-59.00",
  "diario_4011=0.00",
  "diario_479=59.00",
  "diario_7011=0.00",
  "flujo_disponible=-59.00",
  "flujo_lineas=-59.00",
  "flujo_real_entro=-59.00",
  "libro_bcp=-59.00",
  "otro_camino_104=-59.00",
  "saldo_bcp=-59.00",
].join("\n");

caso("sale de BCP, de los saldos, del Flujo y del Balance; la 479 baja; 7011 y 4011 no se tocan; la comprobación del Balance sigue igual", () =>
  igual(dentro(DIFERENCIAS(MOVER_A1)), ESPERADO_MOVIDO));

caso("el Diario sigue cuadrando: debe = haber en cada asiento y en total", () =>
  igual(
    dentro(`${MOVER_A1}
      select ${DESCUADRADOS} || '|' || (select (sum(a.debe) = sum(a.haber))::text from retail.fn_asientos(${HOY}, ${HOY}, null) a);`),
    "0|true",
  ));

caso("el asiento claure_fuera: 479 al debe y la 104 al haber, por exactamente lo cobrado", () =>
  igual(
    dentro(`${MOVER_A1}
      select string_agg(a.cuenta || ':' || a.debe::numeric(12,2) || ':' || a.haber::numeric(12,2), ' ' order by a.cuenta)
        from retail.fn_asientos(${HOY}, ${HOY}, null) a where a.regla = 'claure_fuera';`),
    "104:0.00:59.00 479:59.00:0.00",
  ));

caso("no queda ninguna línea de la cuenta ajena en el libro ni entra a los saldos", () =>
  igual(
    dentro(`${MOVER_A1}
      select (select count(*) from retail.fn_dinero_libro(${HOY}) l where l.cuenta_id = ${YAPE}) || '|' ||
             (select count(*) from retail.fn_cuentas_dinero_saldos(${HOY}, null) s where s.id = ${YAPE});`),
    "0|0",
  ));

caso("la venta de CAYLA de la misma caja sigue en BCP, y el Yape movido queda sellado en la cuenta de Claudia", () =>
  igual(
    dentro(`${MOVER_A1}
      select (select p.cuenta_dinero_id = ${YAPE}::uuid from retail.venta_pagos p where p.venta_id = ${V("a1")}) || '|' ||
             (select p.cuenta_dinero_id = ${BCP}::uuid from retail.venta_pagos p where p.venta_id = ${V("a2")});`),
    "true|true",
  ));

caso("un Plin también se puede poner ahí", () =>
  igual(
    dentro(`select retail.corregir_pagos_venta(${V("a3")}, jsonb_build_array(jsonb_build_object('metodo', 'plin', 'monto', 30, 'cuenta_dinero_id', ${YAPE}::text)), 'Prueba') as _c \\gset
      select p.cuenta_dinero_id = ${YAPE}::uuid from retail.venta_pagos p where p.venta_id = ${V("a3")};`),
    "t",
  ));

caso("fn_cuentas_de_otras_empresas dice lo cobrado este mes, en total y el último cobro; no lo mezcla con BCP", () =>
  igual(
    dentro(`${MOVER_A1}
      select o.nombre, o.empresa, o.cobrado_mes::numeric(12,2), o.cobrado_total::numeric(12,2), o.ultimo_cobro = ${HOY} from retail.fn_cuentas_de_otras_empresas() o;`),
    "Yape de Claudia · LIM|CLAURE|59.00|59.00|t",
  ));

caso("una venta anulada: el cobro y su reversa se cancelan en la 104 y el Diario cuadra", () =>
  igual(
    dentro(`${MOVER_A1}
      set local session_replication_role = replica;
      update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = ${V("a1")};
      insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (${V("a1")}, ${V("f1")}, 'vendible');
      set local session_replication_role = origin;
      select string_agg(z.clave_corta || ':' || z.monto::numeric(12,2), ' ' order by z.clave_corta) || '|' ||
             (select coalesce(sum(a.debe - a.haber), 0)::numeric(12,2) from retail.fn_asientos(${HOY}, ${HOY}, null) a where a.cuenta = '104' and a.origen_id = ${V("a1")}) || '|' || ${DESCUADRADOS}
        from (select split_part(f.clave, ':', 1) clave_corta, f.monto from retail.fn_claure_fuera(${HOY}, ${HOY}, true, null) f) z;`),
    "anulacion:-59.00 venta:59.00|0.00|0",
  ));

caso("un reembolso, un abono, su adelanto devuelto y un cambio en la cuenta de Claudia: cada uno con su signo, y el Diario cuadra", () =>
  igual(
    dentro(`
      set local session_replication_role = replica;
      insert into retail.devoluciones (id, venta_id, ubicacion_id, estado, motivo, aprobado_en, reembolso_monto, reembolso_metodo, reembolso_cuenta_id)
        values (${V("d1")}, ${V("a1")}, ${LIMA}, 'aprobada', 'prueba', now(), 10, 'yape', ${YAPE});
      insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, comprobante_tipo, creado_por, total, adelanto, vence_el, devolucion_medio, estado, liberada_en, liberada_por, liberada_motivo, devuelta_en, devuelta_por, devolucion_medio_real, devolucion_cuenta_id)
        values (${V("c1")}, 'PRUEBA-FUERA', ${LIMA}, ${CAJA}, 'Prueba', 'Prueba', 'boleta', (select id from public.personas where auth_user_id = '${FELIPE}'), 40, 20, ${HOY} + 30, 'yape', 'devuelta', now(), (select id from public.personas where auth_user_id = '${FELIPE}'), 'clienta_desistio', now(), (select id from public.personas where auth_user_id = '${FELIPE}'), 'yape', ${YAPE});
      insert into retail.separacion_pagos (separacion_id, metodo, monto, cuenta_dinero_id) values (${V("c1")}, 'yape', 20, ${YAPE});
      insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, cuenta_dinero_id, caja_id)
        values (${V("c2")}, ${V("f1")}, ${LIMA}, :'va_a', 1, 7, 'yape', ${YAPE}, ${CAJA});
      set local session_replication_role = origin;
      select string_agg(split_part(f.clave, ':', 1) || ':' || f.monto::numeric(12,2), ' ' order by split_part(f.clave, ':', 1)) || '|' || ${DESCUADRADOS}
        from retail.fn_claure_fuera(${HOY}, ${HOY}, true, null) f;`),
    "abono:20.00 adelanto:-20.00 cambio:7.00 devolucion:-10.00|0",
  ));

caso("el efectivo que se queda con Claudia no entra al libro (ni sin cuenta)", () =>
  igual(
    dentro(`
      set local session_replication_role = replica;
      insert into retail.caja_traslados (id, caja_id, destino, monto) values (${V("c3")}, ${CAJA}, 'claudia', 25);
      set local session_replication_role = origin;
      select count(*) from retail.fn_dinero_libro(${HOY}) l where l.clave = 'traslado:' || ${V("c3")};`),
    "0",
  ));

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Los candados
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— Nadie paga nada de CAYLA con ella —");

const CLASES = [
  ["cobro", "yape", LIMA, "paso"],
  ["cobro", "plin", LIMA, "paso"],
  ["cobro", "yape", TRUJILLO, "cuenta_ajena"],
  ["cobro", "tarjeta", LIMA, "cuenta_ajena"],
  ["cobro", "qr", LIMA, "cuenta_ajena"],
  ["cobro", "transferencia", LIMA, "cuenta_ajena"],
  ["cobro", "deposito", LIMA, "cuenta_ajena"],
  ["pago", "yape", LIMA, "cuenta_ajena"],
  ["pago", "plin", LIMA, "cuenta_ajena"],
  ["pago", "transferencia", LIMA, "cuenta_ajena"],
  ["pago", "tarjeta", LIMA, "cuenta_ajena"],
  ["reembolso", "yape", LIMA, "cuenta_ajena"],
  ["reembolso", "transferencia", LIMA, "cuenta_ajena"],
];

caso("fn_cuenta_sellada: solo un cobro Yape o Plin en una sede de su empresa", () =>
  igual(
    dentro(
      CLASES.map(([cl, me, se]) => `select pg_temp.intento($$select retail.fn_cuenta_sellada('${cl}', '${me}', ${se}, ${HOY}, ${YAPE})$$);`).join("\n"),
    ),
    CLASES.map((c) => c[3]).join("\n"),
  ));

const PAGOS_REALES = [
  ["un gasto", `insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, medio_pago, cuenta_dinero_id) values (${LIMA}, 'otros', 'Prueba', ${HOY}, 10, 'yape', ${YAPE})`],
  ["un activo", `insert into retail.activos_fijos (ubicacion_id, nombre, costo, vida_util_meses, tasa_anual, fecha_adquisicion, medio_pago, cuenta_dinero_id) values (${LIMA}, 'Prueba', 100, 12, 0.1, ${HOY}, 'yape', ${YAPE})`],
];
for (const [que, sql] of PAGOS_REALES)
  caso(`${que} no se paga con ella`, () => contiene(dentro(`select pg_temp.intento($$${sql}$$);`), "cuenta_ajena"));

caso("una compra no se paga con ella", () =>
  contiene(
    dentro(`
      set local session_replication_role = replica;
      insert into retail.compras (id, proveedor_id, serie, numero, condicion, subtotal, igv, total, ubicacion_gestion_id)
        select ${V("c4")}, p.id, 'F001', 'PRUEBA', 'contado', 100, 18, 118, ${LIMA} from retail.proveedores p limit 1;
      set local session_replication_role = origin;
      select pg_temp.intento($$insert into retail.compra_pagos (compra_id, monto, metodo, cuenta_dinero_id) values (${V("c4")}, 10, 'transferencia', ${YAPE})$$);`),
    "cuenta_ajena",
  ));

const MOVIMIENTOS = [
  ["un retiro", `insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado) values ('retiro', ${HOY}, ${YAPE}, 10, 'vigente')`],
  ["un aporte", `insert into retail.movimientos_dinero (tipo, fecha, cuenta_destino_id, monto, estado) values ('aporte', ${HOY}, ${YAPE}, 10, 'vigente')`],
  ["un pase desde BCP", `insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, estado) values ('entre_cuentas', ${HOY}, ${BCP}, ${YAPE}, 10, 'vigente')`],
  ["un pago a CLAURE que saliera de ella", `insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado) values ('pago_claure', ${HOY}, ${YAPE}, 10, 'vigente')`],
];
for (const [que, sql] of MOVIMIENTOS)
  caso(`${que} no pasa`, () => igual(dentro(`select pg_temp.intento($$${sql}$$);`), "cuenta_ajena"));

caso("no es el destino fijo de un cobro (medios_de_cobro)", () =>
  igual(dentro(`select pg_temp.intento($$select retail.guardar_medio_de_cobro(${LIMA}, 'yape', ${YAPE})$$);`), "cuenta_ajena"));

caso("el depósito del cierre no va a ella", () =>
  igual(dentro(`select pg_temp.intento($$insert into retail.caja_traslados (caja_id, destino, monto, cuenta_dinero_id) values (${CAJA}, 'banco', 10, ${YAPE})$$);`), "cuenta_ajena"));

caso("Mi plata no la acepta como banco", () =>
  igual(dentro(`select pg_temp.intento($$select retail.anotar_plata_compras('transferencia', 10, null, gen_random_uuid(), ${YAPE})$$);`), "banco_invalido"));

caso("cerrar la ronda de compras no devuelve a ella", () =>
  igual(
    dentro(`select retail.abrir_ronda_compras() as _r \\gset
      select retail.anotar_plata_compras('ya_tenia', 50, null, gen_random_uuid(), null) as _p \\gset
      select pg_temp.intento($$select retail.terminar_dia_compras('devuelve', ${YAPE})$$);`),
    "compra_cierre_cuenta",
  ));

caso("una máquina no deposita a ella", () =>
  contiene(dentro(`select pg_temp.intento(format($$select retail.guardar_banco_de_maquina(%L, ${YAPE})$$, (select id from retail.pos_maquinas where archivada_en is null limit 1)));`), "banco vigente"));

caso("la planilla no sale de ella", () =>
  contiene(dentro(`select pg_temp.intento($$select retail.guardar_cuenta_planilla('bcp', ${YAPE})$$);`), "banco"));

console.log("— No aparece para elegir —");

const LISTAS = [
  ["fn_cuentas_para_elegir (pago)", `select count(*) from retail.fn_cuentas_para_elegir('pago', ${LIMA}) x where x.id = ${YAPE}`],
  ["fn_cuentas_para_elegir (cobro)", `select count(*) from retail.fn_cuentas_para_elegir('cobro', ${LIMA}) x where x.id = ${YAPE}`],
  ["fn_cuentas_para_elegir (reembolso)", `select count(*) from retail.fn_cuentas_para_elegir('reembolso', ${LIMA}) x where x.id = ${YAPE}`],
  ["fn_cuentas_dinero_destinos", `select count(*) from retail.fn_cuentas_dinero_destinos() x where x.id = ${YAPE}`],
  ["fn_cuentas_dinero_saldos", `select count(*) from retail.fn_cuentas_dinero_saldos(${HOY}, null) x where x.id = ${YAPE}`],
  ["fn_conciliacion_cuentas", `select count(*) from retail.fn_conciliacion_cuentas() x where x.id = ${YAPE}`],
  ["fn_bancos_para_plata_compras", `select (retail.fn_bancos_para_plata_compras())::text like '%' || ${YAPE} || '%'`],
  ["fn_cuentas_para_devolver_compras", `select (retail.fn_cuentas_para_devolver_compras())::text like '%' || ${YAPE} || '%'`],
  ["fn_fondos_opciones", `select (retail.fn_fondos_opciones() -> 'cuentas')::text like '%' || ${YAPE} || '%'`],
];
for (const [que, sql] of LISTAS)
  caso(`${que} no la trae`, () => {
    const r = dentro(`${sql};`);
    return r === "0" || r === "f" ? null : `salió ${r}`;
  });

caso("el medidor de confianza y el cierre de mes no la piden conciliada", () =>
  igual(
    dentro(`select (retail.fn_finanzas_confianza(date_trunc('month', ${HOY})::date, null) -> 'saldos' ->> 'bancos')::int = (select count(*) from retail.cuentas_dinero c where c.tipo = 'banco' and c.archivada_en is null and c.empresa_id = ${CAYLA}::uuid);`),
    "t",
  ));

// ---------------------------------------------------------------------------------------------------------------------------------------------
// CONTROL: sin cada parche, la prueba falla
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— CONTROL: sin los parches, se rompe —");

caso("CONTROL: sin el asiento claure_fuera, la plata sigue en la 104 del Diario", () =>
  contiene(dentro(`\\o /dev/null\n${sqlDeshacer(M2, [FIRMA_DIARIO])}\\o\n${DIFERENCIAS(MOVER_A1)}`), "diario_104=0.00"));

caso("CONTROL: sin el filtro del libro, la línea sigue en el libro", () => {
  const r = dentro(`\\o /dev/null\n${sqlDeshacer(M1, [FIRMA_LIBRO])}\\o\n${MOVER_A1}
    select (select count(*) from retail.fn_dinero_libro(${HOY}) l where l.cuenta_id = ${YAPE});`);
  return igual(r, "1");
});

caso("CONTROL: sin el candado, un gasto sí se paga con ella", () =>
  igual(
    dentro(`\\o /dev/null\n${sqlDeshacer(M1, ["retail.fn_cuenta_sellada(text, text, uuid, date, uuid)"])}\\o\nselect pg_temp.intento($$select retail.fn_cuenta_sellada('pago', 'yape', ${LIMA}, ${HOY}, ${YAPE})$$);`),
    "paso",
  ));

caso("CONTROL: sin el filtro de las listas, aparece para elegir", () =>
  igual(
    dentro(`\\o /dev/null\n${sqlDeshacer(M1, ["retail.fn_bancos_para_plata_compras()"])}\\o\nselect (retail.fn_bancos_para_plata_compras())::text like '%' || ${YAPE} || '%';`),
    "t",
  ));

caso("CONTROL: sin la puerta, una máquina deposita a ella", () =>
  igual(
    dentro(`\\o /dev/null\n${sqlDeshacer(M1, ["retail.guardar_banco_de_maquina(uuid, uuid)"])}\\o\nselect pg_temp.intento(format($$select retail.guardar_banco_de_maquina(%L, ${YAPE})$$, (select id from retail.pos_maquinas where archivada_en is null limit 1)));`),
    "paso",
  ));

caso("CONTROL: sin el candado de la tabla, una cuenta cambia de empresa", () =>
  igual(
    dentro(`\\o /dev/null\n${sqlDeshacer(M1, ["retail.fn_cuentas_dinero_inmutable()"])}\\o\nselect pg_temp.intento($$update retail.cuentas_dinero set empresa_id = ${CAYLA} where id = ${YAPE}$$);`),
    "paso",
  ));

// ---------------------------------------------------------------------------------------------------------------------------------------------
// INVARIANTE de las tablas con llave a cuentas_dinero
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— Invariante: toda llave a cuentas_dinero está decidida —");

const COBRO = "cobro"; // puede tener una cuenta ajena: pasa por fn_cuenta_sellada con clase «cobro», y fn_claure_fuera la saca del Diario.
const COLUMNAS = {
  "retail.venta_pagos.cuenta_dinero_id": COBRO,
  "retail.separacion_pagos.cuenta_dinero_id": COBRO,
  "retail.separaciones.devolucion_cuenta_id": COBRO,
  "retail.cambios.cuenta_dinero_id": COBRO,
  "retail.devoluciones.reembolso_cuenta_id": COBRO,
  "retail.pedido_web_pagos.cuenta_dinero_id": "registrar_pago_pedido_web no recibe cuenta: se sella sin elegida, y medios_de_cobro no acepta una ajena",
  "retail.gastos.cuenta_dinero_id": "fn_gastos_sellar → fn_cuenta_sellada('pago')",
  "retail.activos_fijos.cuenta_dinero_id": "fn_activos_sellar → fn_cuenta_sellada('pago')",
  "retail.compra_pagos.cuenta_dinero_id": "fn_compra_pagos_sellar → fn_cuenta_sellada('pago')",
  "retail.comprobantes_produccion_pagos.cuenta_dinero_id": "fn_produccion_pagos_sellar → fn_cuenta_sellada('pago')",
  "retail.proveedor_creditos.cuenta_dinero_id": "fn_proveedor_creditos_sellar → fn_cuenta_sellada('reembolso')",
  "retail.cuentas_asignadas.cuenta_id": "asignar_cuenta_pasada → fn_cuenta_sellada('pago' o 'reembolso')",
  "retail.caja_traslados.cuenta_dinero_id": "fn_caja_traslados_sellar: fn_cuenta_es_de_casa",
  "retail.compra_cierres.cuenta_indicada_id": "terminar_dia_compras: fn_cuenta_es_de_casa",
  "retail.fondo_plata_anotada.cuenta_indicada_id": "anotar_plata_compras: fn_cuenta_es_de_casa",
  "retail.fondo_plata_anotada.cuenta_origen_id": "sale a un movimiento de fondo: fn_movimientos_dinero_validar",
  "retail.medios_de_cobro.cuenta_id": "fn_medios_de_cobro_validar",
  "retail.movimientos_dinero.cuenta_origen_id": "fn_movimientos_dinero_validar",
  "retail.movimientos_dinero.cuenta_destino_id": "fn_movimientos_dinero_validar",
  "retail.planilla_cuentas.cuenta_id": "guardar_cuenta_planilla: fn_cuenta_es_de_casa",
  "retail.pos_maquinas.banco_id": "guardar_banco_de_maquina: fn_cuenta_es_de_casa",
  "retail.pos_maquinas.cuenta_id": "una máquina cobra en una cuenta por_abonar, y una cuenta ajena es banco",
  "retail.pos_abonos_lotes.cuenta_id": "lotes de una cuenta por_abonar de una máquina",
  "retail.pos_abonos_pagos.cuenta_id": "pagos de una cuenta por_abonar de una máquina",
  "retail.cobros_resellados.cuenta_antes": "solo tarjeta y QR, que una cuenta ajena no recibe",
  "retail.cobros_resellados.cuenta_despues": "solo tarjeta y QR, que una cuenta ajena no recibe",
  "retail.rendiciones_fondo.cuenta_id": "una rendición es de una cuenta de tipo fondo",
  "retail.conciliaciones.cuenta_id": "no mueve plata, y fn_conciliacion_cuentas no la ofrece",
  "retail.dinero_revisados.cuenta_id": "no mueve plata, y fn_conciliacion_cuentas no la ofrece",
};

caso("cada columna con llave a cuentas_dinero está clasificada (una tabla nueva obliga a decidir), y son 25 tablas", () => {
  const vivas = psql(`select conrelid::regclass::text || '.' || a.attname from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                       where c.contype = 'f' and c.confrelid = 'retail.cuentas_dinero'::regclass order by 1;`).split("\n");
  const sinDecidir = vivas.filter((c) => !(c in COLUMNAS));
  const sobran = Object.keys(COLUMNAS).filter((c) => !vivas.includes(c));
  const tablas = new Set(vivas.map((c) => c.split(".").slice(0, 2).join(".")));
  if (sinDecidir.length || sobran.length || tablas.size !== 25)
    return `Sin decidir: ${sinDecidir.join(", ") || "-"} · ya no existen: ${sobran.join(", ") || "-"} · tablas: ${tablas.size}`;
  return null;
});

caso("lo que no es un cobro nunca apunta a una cuenta ajena, y cada sello declarado sigue preguntando", () => {
  const consultas = Object.entries(COLUMNAS)
    .filter(([, v]) => v !== COBRO)
    .map(([c]) => {
      const [esquema, tabla, columna] = c.split(".");
      return `select '${c}' c, count(*) n from ${esquema}.${tabla} x where x.${columna} in (select id from retail.cuentas_dinero where empresa_id <> ${CAYLA}::uuid)`;
    })
    .join("\nunion all ");
  const r = dentro(`${MOVER_A1}\nselect coalesce(string_agg(c, ','), 'ninguna') from (${consultas}) t where n > 0;`);
  if (r !== "ninguna") return `apuntan a una cuenta ajena: ${r}`;
  const sellos = psql(`select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_gastos_sellar', 'fn_activos_sellar', 'fn_compra_pagos_sellar', 'fn_produccion_pagos_sellar', 'fn_proveedor_creditos_sellar', 'asignar_cuenta_pasada') and p.prosrc like '%fn_cuenta_sellada(%';`);
  return igual(sellos, "6");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Se puede pegar dos veces
// ---------------------------------------------------------------------------------------------------------------------------------------------
console.log("— Se puede volver a pegar —");

caso("las tres partes pegadas dos veces no cambian nada", () =>
  igual(
    psql(`begin;
\\o /dev/null
${leer(M1)}
${leer(M2)}
${leer(M3)}
create temp table h1 on commit drop as select p.proname, md5(p.prosrc) m from pg_proc p where p.pronamespace = 'retail'::regnamespace;
${leer(M1)}
${leer(M2)}
${leer(M3)}
\\o
select (select count(*) from h1 a join pg_proc p on p.proname = a.proname and p.pronamespace = 'retail'::regnamespace and md5(p.prosrc) <> a.m) || '|' ||
       (select count(*) from retail.cuentas_dinero where empresa_id <> ${CAYLA}::uuid);
rollback;`),
    "0|1",
  ));

caso("permisos: la pantalla lee fn_cuentas_de_otras_empresas; lo interno no se expone", () =>
  igual(
    psql(`select has_function_privilege('authenticated', 'retail.fn_cuentas_de_otras_empresas()', 'execute') || '|' ||
                 has_function_privilege('anon', 'retail.fn_cuentas_de_otras_empresas()', 'execute') || '|' ||
                 has_function_privilege('authenticated', 'retail.fn_claure_fuera(date, date, boolean, uuid[])', 'execute') || '|' ||
                 has_function_privilege('authenticated', 'retail.fn_cuenta_es_de_casa(uuid)', 'execute');`),
    "true|false|false|false",
  ));

caso("quien no tiene el módulo no lee fn_cuentas_de_otras_empresas", () =>
  contiene(
    dentro(`set local request.jwt.claim.sub = '22222222-2222-4222-8222-000000000003';
      set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-000000000003","role":"authenticated"}';
      select pg_temp.intento($$select * from retail.fn_cuentas_de_otras_empresas()$$);`),
    "necesita el módulo Cuentas y dinero",
  ));

console.log(`\n${total - fallas}/${total} casos.`);
if (fallas) {
  console.log(`${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("Todos los casos pasaron.");

#!/usr/bin/env node
/**
 * Prueba de `20261121160000_diario_y_balance_con_cualquier_aliada.sql` (ADR-0683, actividad 2): una SEGUNDA empresa aliada, en Trujillo, no rompe la 201.
 *
 * LA PROPIEDAD (la misma de pruebas:balance-claure, con otra dueña): entre dos momentos, lo que cambia la «mercadería» del Balance en Trujillo
 * (`fn_bal_stock`) es exactamente lo que cambia la 201 del Diario (`fn_asientos`). Antes de esta migración el Diario reclasificaba solo lo de CLAURE:
 * la venta de otra aliada bajaba la 201 por una prenda que el Balance ya no contaba, y el Balance no se dibujaba.
 *
 * La escena: Trujillo con CAYLA y «Otra Aliada» (cuenta desde ayer); una blusa de CAYLA (costo 26) y una de la aliada (costo 30), precio 59 con IGV.
 * Cada caso corre en su transacción con las dos migraciones de ADR-0683 aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * QUÉ CUBRE
 *   · Venta + anulación + devolución + merma de la aliada: Δ Balance = Δ 201; lo debido (lo cobrado con IGV) en la 479 y el IGV en la 1673.
 *   · Sus ventas no aparecen en fn_claure_ventas (la línea «de eso, CLAURE» de Impuestos y la cuenta con Claudia no cambian).
 *   · Darla de baja (activo = false) no devuelve su pasado a CAYLA: el Diario de ese día sigue igual.
 *   · Una pérdida suya no es pérdida de CAYLA (fn_movimiento_es_de_claure responde por cualquier aliada).
 *   · AUTOPRUEBA: si el Diario vuelve a leer solo lo de CLAURE, la propiedad se rompe.
 *
 * USO: pnpm pruebas:aliadas-balance   (necesita el stack local: `npx supabase start`; BASE_PG para otra base)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = `\\o /dev/null\n${leer("20261121152000_empresas_aliadas_desde_configuracion.sql")}\n${leer("20261121160000_diario_y_balance_con_cualquier_aliada.sql")}\n\\o\n`;
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Trujillo con CAYLA y una aliada nueva (cuenta desde ayer), su almacén, una categoría con talla, un color, una marca con su proveedor. */
const ESCENA = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
insert into retail.empresas (id, clave, nombre, orden, activo, ruc, regimen, cuenta_corriente_desde)
  values (gen_random_uuid(), 'otra_prueba', 'Otra Aliada', 90, true, '10999900011', 'nuevo_rus', retail.fn_hoy_lima() - 1) returning id as otra \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'cayla', :'tru'), (:'otra', :'tru') on conflict do nothing;
update retail.ubicaciones set carga_inicial_hasta = null where id = :'tru';
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
`;

const CREAR = (clave, nombre, empresa, unidades, costo) => `
select retail.crear_producto_con_empresa('${nombre}', :'cat',
   jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', ${costo}, 'cantidad', ${unidades})),
   :'${empresa}', :'tru', null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'tru', false) as p_${clave} \\gset
select id as v_${clave} from retail.variantes where producto_id = :'p_${clave}' limit 1 \\gset
`;
const MOVER = (variante, tipo, cantidad, motivo, { empresa = null, item = null, devItem = null } = {}) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id, venta_item_id, devolucion_item_id)
  values (:'${variante}', :'tru', :'alm', '${tipo}', ${cantidad}, '${motivo}', ${empresa ? `:'${empresa}'` : "null"},
          ${item ? `:'${item}'` : "null"}, ${devItem ? `:'${devItem}'` : "null"})
  returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
`;
const VENDER = (n, lineas) => `
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as vta_${n} \\gset
${lineas
  .map(
    ([k, v, cant, costo, dueno]) => `
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (:'vta_${n}', :'${v}', ${cant}, 59, ${costo}) returning id as i_${n}_${k} \\gset
${MOVER(v, "salida", cant, "venta", { empresa: dueno, item: `i_${n}_${k}` })}`,
  )
  .join("")}
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'vta_${n}', 'efectivo', ${lineas.reduce((s, l) => s + 59 * l[2], 0)});
`;

const MERC = `coalesce((select sum(valor) from retail.fn_bal_stock(retail.fn_hoy_lima()) where ubicacion_id = :'tru'), 0)`;
const SUMA = (cuenta, signo, ids) => `coalesce((select sum(${signo}) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a
   where a.cuenta = '${cuenta}' and a.origen_id in (${ids})), 0)`;
const D201 = (ids) => SUMA("201", "a.debe - a.haber", ids);
const D479 = (ids) => SUMA("479", "a.haber - a.debe", ids);
const D1673 = (ids) => SUMA("1673", "a.debe - a.haber", ids);

const CAYLA_PRENDA = CREAR("c", "Prueba Aliada CAYLA", "cayla", 3, 26);
const ALIADA_PRENDA = `select set_config('request.headers', json_build_object('x-dueno', :'otra')::text, true) as _h1 \\gset
${CREAR("k", "Prueba Otra Aliada", "otra", 5, 30)}
select set_config('request.headers', '{}', true) as _h2 \\gset`;

const CICLO = `
${CAYLA_PRENDA}
${ALIADA_PRENDA}
select ${MERC} as s_b \\gset
${VENDER(1, [["c", "v_c", 1, 26, null], ["k", "v_k", 2, 30, "otra"]])}
${VENDER(2, [["k", "v_k", 1, 30, "otra"]])}
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = :'vta_2';
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (:'vta_2', :'i_2_k', 'vendible');
${MOVER("v_k", "entrada", 1, "anulacion_venta", { empresa: "otra", item: "i_2_k" })}
insert into retail.devoluciones (venta_id, ubicacion_id, estado, motivo, aprobado_en) values (:'vta_1', :'tru', 'aprobada', 'prueba', now()) returning id as dev_1 \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev_1', :'i_1_k', 1, 'vendible') returning id as di_1 \\gset
${MOVER("v_k", "entrada", 1, "devolucion", { empresa: "otra", devItem: "di_1" })}
${MOVER("v_k", "ajuste", -1, "conteo", { empresa: "otra" })}
select id as mer_1 from retail.movimientos where variante_id = :'v_k' and tipo = 'ajuste' and cantidad = -1 order by created_at desc limit 1 \\gset
select ${MERC} as s_f \\gset
`;
const IDS = `:'vta_1', :'vta_2', :'dev_1', :'mer_1'`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACIONES}${ESCENA}\n${cuerpo}\nrollback;`);

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const num = (s) => Number(String(s).split("\n").at(-1));
const igual = (obtenido, esperado, que = "") => (Math.abs(Number(obtenido) - Number(esperado)) < 0.005 ? null : `${que} se esperaba ${esperado} y salió ${obtenido}`);

console.log("— Una segunda aliada en Trujillo no rompe la 201 —");

caso("venta + anulación + devolución + merma de la aliada: la mercadería del Balance y la 201 del Diario se mueven igual", () =>
  igual(num(dentro(`${CICLO}\nselect (:'s_f'::numeric - :'s_b'::numeric) - ${D201(IDS)};`)), 0, "(Δ Balance − Δ Diario):"));

caso("la mercadería del Balance solo se movió por lo de CAYLA (una blusa de costo 26)", () =>
  igual(num(dentro(`${CICLO}\nselect :'s_f'::numeric - :'s_b'::numeric;`)), -26, "Δ mercadería:"));

caso("lo debido a la aliada es lo cobrado con IGV, en la 479 (2×59 − 59 devuelta = 59), y el IGV (9) en la 1673", () => {
  const r = dentro(`${CICLO}\nselect ${D479(IDS)} || '|' || ${D1673(IDS)};`).split("\n").at(-1);
  const [d, i] = r.split("|").map(Number);
  return igual(d, 59, "479:") ?? igual(i, 9, "1673:");
});

caso("cada asiento de reclasificación cuadra solo (debe = haber)", () =>
  igual(
    num(
      dentro(`${CICLO}
    select count(*) from (select a.asiento, sum(a.debe) - sum(a.haber) as d
      from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a where a.regla like 'claure\\_%' group by a.asiento) x where abs(x.d) > 0.005;`),
    ),
    0,
    "asientos que no cuadran:",
  ));

caso("sus ventas no entran a lo de CLAURE (fn_claure_ventas: la línea de Impuestos y la cuenta con Claudia no cambian)", () =>
  igual(
    num(dentro(`${CICLO}\nselect count(*) from retail.fn_claure_ventas(retail.fn_hoy_lima(), retail.fn_hoy_lima(), true, null) x where x.id in (:'vta_1', :'vta_2', :'dev_1');`)),
    0,
    "filas de la aliada en fn_claure_ventas:",
  ));

caso("darla de baja no devuelve su pasado a CAYLA: el Diario del día sigue igual", () => {
  const r = dentro(`${CICLO}
    select ${D201(IDS)} || '|' || ${D479(IDS)} as antes \\gset
    update retail.empresas set activo = false where id = :'otra';
    select (${D201(IDS)} || '|' || ${D479(IDS)}) = :'antes';`);
  return r.split("\n").at(-1) === "t" ? null : `el Diario cambió al darla de baja: ${r.split("\n").at(-1)}`;
});

caso("una pérdida suya es de la aliada (fn_movimiento_es_de_claure responde por ella), aunque esté de baja", () => {
  const r = dentro(`${CICLO}
    update retail.empresas set activo = false where id = :'otra';
    select retail.fn_movimiento_es_de_claure(:'otra', :'tru', now()) and not retail.fn_movimiento_es_de_claure(:'cayla', :'tru', now());`);
  return r.split("\n").at(-1) === "t" ? null : `salida inesperada: ${r}`;
});

caso("una venta de CAYLA en Trujillo (con la aliada ahí) no genera reclasificaciones", () =>
  igual(
    num(
      dentro(`${CAYLA_PRENDA}
    ${VENDER(1, [["c", "v_c", 1, 26, null]])}
    select count(*) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a where a.regla like 'claure\\_%' and a.origen_id = :'vta_1';`),
    ),
    0,
    "reclasificaciones de una venta de CAYLA:",
  ));

console.log("— Autoprueba —");

caso("si el Diario vuelve a leer solo lo de CLAURE, la venta de la aliada descuadra la 201 (Δ ≠ 0)", () => {
  const r = dentro(`${CICLO}
    do $$ begin execute replace(replace(pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure),
      'retail.fn_aliadas_ventas(', 'retail.fn_claure_ventas('), 'retail.fn_aliadas_cambios(', 'retail.fn_claure_cambios('); end $$;
    select (:'s_f'::numeric - :'s_b'::numeric) - ${D201(IDS)};`);
  return num(r) === 0 ? "la prueba no ve la diferencia sin el arreglo (está ciega)" : null;
});

console.log("— Pegar y permisos —");

caso("pegar la migración dos veces no cambia el Diario", () => {
  const m2 = leer("20261121160000_diario_y_balance_con_cualquier_aliada.sql");
  const r = psql(`begin;\n${MIGRACIONES}\nselect md5(pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure)) as h1 \\gset
    \\o /dev/null
    ${m2}
    \\o
    select md5(pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure)) = :'h1';\nrollback;`);
  return r.split("\n").at(-1) === "t" ? null : `la huella cambió: ${r}`;
});

caso("las funciones nuevas son de uso interno: ni authenticated ni anon", () => {
  const r = dentro(`select bool_and(not has_function_privilege(rol, f, 'execute')) from unnest(array['authenticated', 'anon']) rol,
    unnest(array['retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[])', 'retail.fn_aliada_cambios(uuid, date, date, uuid[])',
                 'retail.fn_aliadas_ventas(date, date, boolean, uuid[])', 'retail.fn_aliadas_cambios(date, date, uuid[])']) f;`);
  return r.split("\n").at(-1) === "t" ? null : `salida inesperada: ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

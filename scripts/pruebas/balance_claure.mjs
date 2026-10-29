#!/usr/bin/env node
/**
 * Prueba de ADR-0558: la mercadería de CLAURE en Tienda LIM (consignación) no es mercadería de CAYLA en el Balance —
 * migración `20261028212000_balance_mercaderia_de_claure_en_consignacion.sql`, contra el Postgres local.
 *
 * LA PROPIEDAD QUE SE PRUEBA (la que hace cuadrar la cuenta 201 por sus dos caminos): entre dos momentos, lo que cambia la «mercadería» del
 * Balance (`fn_bal_stock`, stock × costo) es exactamente lo que cambia la 201 del diario (`fn_asientos`). Antes de ADR-0558 la entrada de
 * CLAURE subía el stock sin asiento y su venta bajaba la 201 con asiento: las dos se separaban y el Balance no se dibujaba.
 *
 * La escena: Lima con CAYLA y CLAURE, Trujillo solo con CAYLA (`empresa_sedes`, como en producción); una blusa de CAYLA (costo 26) y una de
 * CLAURE (costo 30). Cada caso corre en su transacción que TERMINA EN ROLLBACK, con las migraciones de ADR-0542 y la de ADR-0558 aplicadas dentro
 * (en la base del CI ya están: aplicarlas otra vez no cambia nada): el Postgres local compartido no cambia.
 *
 * QUÉ CUBRE
 *   · Entrada de CLAURE: no mueve la mercadería de CAYLA ni las causas de la 201.
 *   · Venta, anulación, devolución y merma de CLAURE: la 201 del diario y la mercadería del Balance se mueven igual; lo debido queda en la 4699.
 *   · Un corte en el pasado (antes de la escena) devuelve lo que había, también para lo ajeno.
 *   · Una venta de CAYLA en Trujillo no genera reclasificaciones; cada asiento de reclasificación cuadra solo.
 *   · AUTOPRUEBA: si se deshace una mitad del arreglo, la propiedad se rompe (la prueba no está ciega).
 *   · La migración pegada dos veces; los permisos (de uso interno).
 *
 * USO: pnpm pruebas:balance-claure   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const M_DUENO = leer("20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql");
const M_LECTURAS = leer("20261028153000_dueno_real_en_caja_historial_y_movimientos.sql");
const M_ARREGLO = leer("20261028212000_balance_mercaderia_de_claure_en_consignacion.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Las migraciones, sin imprimir su resultado. Con `sinArreglo` solo las de ADR-0542 (para ver el «antes» donde el arreglo no está pegado). */
const MIGRACIONES = `\\o /dev/null\n${M_DUENO}\n${M_LECTURAS}\n${M_ARREGLO}\n\\o\n`;

/** Las sedes, las dos empresas, un lugar de almacén por sede, una categoría con talla, un color y una marca con su proveedor. */
const SEDES = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as lim from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1 \\gset
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id)
  values (:'cayla', :'lim'), (:'cayla', :'tru'), (:'claure', :'lim') on conflict do nothing;
update retail.ubicaciones set carga_inicial_hasta = null where id in (:'lim', :'tru');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'lim', :'tru']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
select id as alm_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as alm_tru from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
`;

/** Una prenda nueva por el camino real; `ubic` es donde cae el stock inicial. Deja `p_<ref>` y `v_<ref>` (producto y variante). */
const CREAR = (clave, nombre, empresa, ubic, unidades, costo) => `
select retail.crear_producto_con_empresa('${nombre}', :'cat',
   jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', ${costo}, 'cantidad', ${unidades})),
   :'${empresa}', :'${ubic}', null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'${ubic}', false) as p_${clave} \\gset
select id as v_${clave} from retail.variantes where producto_id = :'p_${clave}' limit 1 \\gset
`;

/** Un movimiento directo (lo que escriben todas las funciones) y su efecto en el stock; `empresa` es el dueño elegido; `item`, la línea de venta. */
const MOVER = (variante, tipo, ubic, sub, cantidad, motivo, { empresa = null, item = null, devItem = null } = {}) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id, venta_item_id, devolucion_item_id)
  values (:'${variante}', :'${ubic}', :'${sub}', '${tipo}', ${cantidad}, '${motivo}', ${empresa ? `:'${empresa}'` : "null"},
          ${item ? `:'${item}'` : "null"}, ${devItem ? `:'${devItem}'` : "null"})
  returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
`;

/** Una venta en Lima con sus líneas `[clave, variante, cantidad, costo, dueño]` y el movimiento de salida de cada una. Deja `vta_<n>` e `i_<n>_<k>`. */
const VENDER = (n, lineas) => `
insert into retail.ventas (ubicacion_id) values (:'lim') returning id as vta_${n} \\gset
${lineas
  .map(
    ([k, v, cant, costo, dueno]) => `
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (:'vta_${n}', :'${v}', ${cant}, 59, ${costo}) returning id as i_${n}_${k} \\gset
${MOVER(v, "salida", "lim", "alm_lim", cant, "venta", { empresa: dueno, item: `i_${n}_${k}` })}`,
  )
  .join("")}
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'vta_${n}', 'efectivo', ${lineas.reduce((s, l) => s + 59 * l[2], 0)});
`;

/** Lo que se mide: la mercadería del Balance en Lima hoy, y la 201 / 4699 del diario sobre una lista de asientos de origen. */
const MERC = (corte = "retail.fn_hoy_lima()") => `coalesce((select sum(valor) from retail.fn_bal_stock(${corte}) where ubicacion_id = :'lim'), 0)`;
const D201 = (ids) => `coalesce((select sum(a.debe - a.haber) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a
   where a.cuenta = '201' and a.origen_id in (${ids})), 0)`;
const D4699 = (ids) => `coalesce((select sum(a.haber - a.debe) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a
   where a.cuenta = '4699' and a.origen_id in (${ids})), 0)`;

const COMPRADAS = `${CREAR("c", "Prueba Balance CAYLA", "cayla", "lim", 3, 26)}`;
/** Una prenda de CLAURE con su stock inicial de CLAURE: el dueño llega por el encabezado `x-dueno`, como lo manda la web (ADR-0542). */
const COMPRADAS_CLAURE = `select set_config('request.headers', json_build_object('x-dueno', :'claure')::text, true) as _h1 \\gset
${CREAR("k", "Prueba Balance CLAURE", "claure", "lim", 5, 30)}
select set_config('request.headers', '{}', true) as _h2 \\gset`;

/** Dentro de una transacción con las migraciones, la escena de siempre y el cuerpo; termina en ROLLBACK. */
const dentro = (cuerpo, { arreglo = true } = {}) =>
  psql(`begin;\n${arreglo ? MIGRACIONES : `\\o /dev/null\n${M_DUENO}\n${M_LECTURAS}\n\\o\n`}${SEDES}\n${cuerpo}\nrollback;`);

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

// ---- La escena completa: entrada, venta (1 de CAYLA + 2 de CLAURE), venta de 1 de CLAURE que se anula, devolución de 1 de CLAURE, merma de 1 de CLAURE.
const CICLO = `
${COMPRADAS}
select ${MERC()} as s_a \\gset
${COMPRADAS_CLAURE}
select ${MERC()} as s_b \\gset
${VENDER(1, [["c", "v_c", 1, 26, null], ["k", "v_k", 2, 30, "claure"]])}
${VENDER(2, [["k", "v_k", 1, 30, "claure"]])}
-- la segunda venta se anula y su prenda vuelve vendible a CLAURE
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = :'vta_2';
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (:'vta_2', :'i_2_k', 'vendible');
${MOVER("v_k", "entrada", "lim", "alm_lim", 1, "anulacion_venta", { empresa: "claure", item: "i_2_k" })}
-- una de las dos de CLAURE de la primera venta se devuelve
insert into retail.devoluciones (venta_id, ubicacion_id, estado, motivo, aprobado_en) values (:'vta_1', :'lim', 'aprobada', 'prueba', now()) returning id as dev_1 \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev_1', :'i_1_k', 1, 'vendible') returning id as di_1 \\gset
${MOVER("v_k", "entrada", "lim", "alm_lim", 1, "devolucion", { empresa: "claure", devItem: "di_1" })}
-- se pierde una de CLAURE (un conteo la da por faltante)
${MOVER("v_k", "ajuste", "lim", "alm_lim", -1, "conteo", { empresa: "claure" })}
select id as mer_1 from retail.movimientos where variante_id = :'v_k' and tipo = 'ajuste' and cantidad = -1 order by created_at desc limit 1 \\gset
select ${MERC()} as s_f \\gset
`;
const IDS = `:'vta_1', :'vta_2', :'dev_1', :'mer_1'`;

console.log("— La mercadería de CLAURE no es de CAYLA en el Balance —");

caso("entrar mercadería de CLAURE no mueve la mercadería de CAYLA del Balance", () =>
  igual(dentro(`${CICLO}\nselect :'s_b'::numeric - :'s_a'::numeric;`), 0, "diferencia al entrar CLAURE:"));

caso("entrar mercadería de CLAURE no aparece como «entrada sin asiento» en las causas de la 201", () => {
  const r = dentro(`${COMPRADAS}
    select coalesce(sum(monto), 0) as c_a from retail.fn_bal_causas_mercaderia(retail.fn_hoy_lima(), retail.fn_hoy_lima()) \\gset
    ${COMPRADAS_CLAURE}
    select coalesce(sum(monto), 0) - :'c_a' from retail.fn_bal_causas_mercaderia(retail.fn_hoy_lima(), retail.fn_hoy_lima());`);
  return igual(num(r), 0, "causas que sumó la entrada de CLAURE:");
});

caso("venta + anulación + devolución + merma de CLAURE: la mercadería del Balance y la 201 del diario se mueven igual", () => {
  const r = dentro(`${CICLO}\nselect (:'s_f'::numeric - :'s_b'::numeric) - ${D201(IDS)};`);
  return igual(num(r), 0, "(Δ Balance − Δ diario):");
});

caso("la mercadería del Balance solo se movió por lo de CAYLA (una blusa de costo 26 vendida)", () =>
  igual(num(dentro(`${CICLO}\nselect :'s_f'::numeric - :'s_b'::numeric;`)), -26, "Δ mercadería:"));

caso("lo debido a CLAURE (4699) = 2×30 + 1×30 − 30 (anulada) − 30 (devuelta) + 30 (perdida)", () =>
  igual(num(dentro(`${CICLO}\nselect ${D4699(IDS)};`)), 60, "4699:"));

caso("cada asiento de reclasificación cuadra solo (debe = haber)", () => {
  const r = dentro(`${CICLO}
    select count(*) from (select a.asiento, sum(a.debe) - sum(a.haber) as d
      from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a where a.regla like 'claure\\_%' group by a.asiento) x
     where abs(x.d) > 0.005;`);
  return igual(num(r), 0, "asientos que no cuadran:");
});

caso("hay 4 clases de reclasificación y cada una está ligada a su origen", () => {
  const r = dentro(`${CICLO}
    select count(distinct a.regla) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a
     where a.regla like 'claure\\_%' and a.origen_id in (${IDS});`);
  return igual(num(r), 4, "reglas distintas:");
});

caso("un corte en el pasado (antes de la escena) devuelve lo mismo antes y después, también con lo ajeno", () => {
  const r = dentro(`${COMPRADAS}
    select ${MERC("retail.fn_hoy_lima() - 1")} as p_a \\gset
    ${COMPRADAS_CLAURE}
    ${VENDER(1, [["c", "v_c", 1, 26, null], ["k", "v_k", 2, 30, "claure"]])}
    select ${MERC("retail.fn_hoy_lima() - 1")} - :'p_a';`);
  return igual(num(r), 0, "Δ de ayer:");
});

caso("una venta de CAYLA en Trujillo no genera ninguna reclasificación", () => {
  const r = dentro(`${CREAR("t", "Prueba Balance Trujillo", "cayla", "tru", 3, 26)}
    insert into retail.ventas (ubicacion_id) values (:'tru') returning id as vta_t \\gset
    insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vta_t', :'v_t', 1, 59, 26) returning id as i_t \\gset
    ${MOVER("v_t", "salida", "tru", "alm_tru", 1, "venta", { item: "i_t" })}
    select count(*) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a where a.regla like 'claure\\_%' and a.ubicacion_id = :'tru';`);
  return igual(num(r), 0, "reclasificaciones en Trujillo:");
});

caso("una venta de CAYLA en Lima (de una prenda sin unidades de CLAURE) tampoco genera reclasificaciones", () => {
  const r = dentro(`${COMPRADAS}
    ${VENDER(1, [["c", "v_c", 1, 26, null]])}
    select count(*) from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) a where a.regla like 'claure\\_%' and a.origen_id = :'vta_1';`);
  return igual(num(r), 0, "reclasificaciones de una venta de CAYLA:");
});

console.log("— Autoprueba: la propiedad se rompe si se deshace una mitad del arreglo —");

caso("sin el enganche del diario, la venta de CLAURE baja la 201 y el Balance no la sigue (Δ ≠ 0)", () => {
  const r = dentro(`${CICLO}
    do $$ begin
      execute replace(pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure),
        'union all select * from retail.fn_asientos_claure(p_desde, p_hasta, v_todo, v_ubics)', '');
    end $$;
    select (:'s_f'::numeric - :'s_b'::numeric) - ${D201(IDS)};`);
  return num(r) === 0 ? "la prueba no ve la diferencia sin el enganche (está ciega)" : null;
});

caso("sin restar lo ajeno en fn_bal_stock, entrar CLAURE sube la mercadería de CAYLA (Δ ≠ 0)", () => {
  const r = dentro(`${COMPRADAS}
    do $$ begin
      execute replace(pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure), 'union all select * from de_otros', '');
    end $$;
    select ${MERC()} as s_a \\gset
    ${COMPRADAS_CLAURE}
    select ${MERC()} - :'s_a';`);
  return igual(num(r), 150, "sin el arreglo, 5 × 30 entran como mercadería de CAYLA:");
});

caso("sin revertir lo ajeno movido después del corte, un corte pasado se desfasa (Δ ≠ 0)", () => {
  const r = dentro(`${COMPRADAS}
    do $$ begin
      execute replace(pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure), 'and m.ubicacion_id in (select u.id', 'and false and m.ubicacion_id in (select u.id');
    end $$;
    select ${MERC("retail.fn_hoy_lima() - 1")} as p_a \\gset
    ${COMPRADAS_CLAURE}
    select ${MERC("retail.fn_hoy_lima() - 1")} - :'p_a';`);
  return igual(num(r), -150, "sin revertir, el corte de ayer queda corto en 5 × 30:");
});

console.log("— Pegar y permisos —");

caso("pegar la migración dos veces no cambia nada ni falla", () => {
  const r = psql(`begin;\n${MIGRACIONES}${SEDES}\nselect md5(pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure) || pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)
     || pg_get_functiondef('retail.fn_bal_causas_mercaderia(date, date)'::regprocedure)) as h1 \\gset
    \\o /dev/null
    ${M_ARREGLO}
    \\o
    select md5(pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure) || pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)
     || pg_get_functiondef('retail.fn_bal_causas_mercaderia(date, date)'::regprocedure)) = :'h1';\nrollback;`);
  return r.split("\n").at(-1) === "t" ? null : `la huella cambió: ${r}`;
});

caso("la cuenta 4699 existe, es un pasivo y no es de resultados", () => {
  const r = dentro(`select exists (select 1 from retail.cuentas where codigo = '4699' and tipo = 'pasivo' and seccion_resultados is null);`);
  return r.split("\n").at(-1) === "t" ? null : `salida inesperada: ${r}`;
});

caso("las funciones nuevas son de uso interno: ni authenticated ni anon pueden ejecutarlas", () => {
  const r = dentro(`select not has_function_privilege('authenticated', 'retail.fn_asientos_claure(date, date, boolean, uuid[])', 'execute')
    and not has_function_privilege('anon', 'retail.fn_asientos_claure(date, date, boolean, uuid[])', 'execute')
    and not has_function_privilege('authenticated', 'retail.fn_dueno_del_movimiento(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'retail.fn_dueno_del_movimiento(uuid, uuid, uuid)', 'execute');`);
  return r.split("\n").at(-1) === "t" ? null : `salida inesperada: ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

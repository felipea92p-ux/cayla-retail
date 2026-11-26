#!/usr/bin/env node
/**
 * Prueba de `20261121162000_cuenta_con_cada_duena.sql` (ADR-0683, actividad 3): la cuenta con cada dueña, con DOS aliadas a la vez.
 *
 * La escena: CLAURE en Lima (como en producción) y «Otra Aliada» en Trujillo, con cuenta desde ayer. Una venta de dos prendas de la aliada en Trujillo
 * (2 × 59, por transferencia: entra a una cuenta de CAYLA y se le debe). Cada caso corre en su transacción con las tres migraciones de ADR-0683 aplicadas
 * dentro y TERMINA EN ROLLBACK.
 *
 * QUÉ CUBRE
 *   · Lo que se le debe a cada una es suyo: la venta de la aliada no mueve a CLAURE.
 *   · Un pago con `x-aliada` baja solo a esa; sin elegir y con dos aliadas, se rechaza; con una sola, va a ella (la pantalla de hoy sigue igual).
 *   · El efectivo que se queda la dueña al cerrar la caja de Trujillo es de la aliada de Trujillo.
 *   · Con los disparadores apagados (una carga, una prueba), un pago igual queda con su aliada: el candado es «siempre».
 *   · La proyección de caja descuenta lo de todas (cada una solo si se le debe).
 *   · No se da de baja una aliada con su cuenta fuera de cero.
 *   · Las de CLAURE no se tocaron.
 *
 * USO: pnpm pruebas:aliadas-cuenta   (necesita el stack local: `npx supabase start`; BASE_PG para otra base)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const M3 = leer("20261121162000_cuenta_con_cada_duena.sql");
const MIGRACIONES = `\\o /dev/null\n${leer("20261121152000_empresas_aliadas_desde_configuracion.sql")}\n${leer("20261121160000_diario_y_balance_con_cualquier_aliada.sql")}\n${M3}\n\\o\n`;
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const ESCENA = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select id as lim from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1 \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
update retail.empresas set cuenta_corriente_desde = coalesce(cuenta_corriente_desde, retail.fn_hoy_lima() - 1) where id = :'claure';
insert into retail.empresas (id, clave, nombre, orden, activo, ruc, regimen, cuenta_corriente_desde)
  values (gen_random_uuid(), 'otra_prueba', 'Otra Aliada', 90, true, '10999900011', 'nuevo_rus', retail.fn_hoy_lima() - 1) returning id as otra \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'cayla', :'tru'), (:'otra', :'tru'), (:'cayla', :'lim'), (:'claure', :'lim') on conflict do nothing;
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
select id as banco from retail.cuentas_dinero where tipo = 'banco' and empresa_id = :'cayla' and archivada_en is null order by orden limit 1 \\gset
select set_config('request.headers', json_build_object('x-dueno', :'otra')::text, true) as _h1 \\gset
select retail.crear_producto_con_empresa('Prueba Cuenta Aliada', :'cat',
   jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 30, 'cantidad', 5)),
   :'otra', :'tru', null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'tru', false) as p_k \\gset
select set_config('request.headers', '{}', true) as _h2 \\gset
select id as v_k from retail.variantes where producto_id = :'p_k' limit 1 \\gset
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as vta \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vta', :'v_k', 2, 59, 30) returning id as item \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id, venta_item_id)
  values (:'v_k', :'tru', :'alm', 'salida', 2, 'venta', :'otra', :'item') returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'vta', 'transferencia', 118);
`;

/** Un pago a una aliada (como lo guarda registrar_movimiento_dinero), con los disparadores de validación apagados como en las pruebas de CLAURE. */
const PAGAR = (monto, aliada) => `
${aliada ? `select set_config('request.headers', json_build_object('x-aliada', :'${aliada}')::text, true) as _hp \\gset` : `select set_config('request.headers', '{}', true) as _hp \\gset`}
set local session_replication_role = replica;
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado) values ('pago_claure', retail.fn_hoy_lima(), :'banco', ${monto}, 'vigente');
set local session_replication_role = origin;
select set_config('request.headers', '{}', true) as _hp2 \\gset
`;
const SALDO = (e) => `retail.fn_aliada_saldo_a(:'${e}', retail.fn_hoy_lima())`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACIONES}${ESCENA}\n${cuerpo}\nrollback;`);
const ultima = (s) => String(s).split("\n").at(-1);

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join("\n    ")}`);
  }
}
const igual = (obtenido, esperado, que = "") => (Math.abs(Number(obtenido) - Number(esperado)) < 0.005 ? null : `${que} se esperaba ${esperado} y salió ${obtenido}`);
const fallaCon = (fn, texto) => {
  try {
    fn();
    return `no falló (se esperaba «${texto}»)`;
  } catch (e) {
    return String(e.stderr).includes(texto) ? null : `falló por otra razón: ${String(e.stderr).split("\n").find((l) => l.includes("ERROR"))}`;
  }
};

console.log("— La cuenta con cada dueña —");

caso("a la aliada se le debe lo cobrado de sus prendas (2 × 59 por transferencia = 118); a CLAURE, nada de eso", () => {
  const r = ultima(dentro(`select ${SALDO("otra")} || '|' || (select count(*) from retail.fn_aliada_filas(:'claure', array[:'tru']::uuid[]));`));
  const [otra, deClaure] = r.split("|");
  return igual(otra, 118, "saldo de la aliada:") ?? igual(deClaure, 0, "filas de CLAURE en Trujillo:");
});

caso("un pago con x-aliada baja solo a esa aliada (118 − 40 = 78) y no toca a CLAURE", () => {
  const r = ultima(dentro(`select ${SALDO("claure")} as c0 \\gset\n${PAGAR(40, "otra")}\nselect ${SALDO("otra")} || '|' || (${SALDO("claure")} - :'c0'::numeric);`));
  const [otra, dc] = r.split("|");
  return igual(otra, 78, "saldo de la aliada:") ?? igual(dc, 0, "cambio de CLAURE:");
});

caso("con dos aliadas con cuenta, un pago sin elegir se rechaza (nunca cae en la equivocada)", () =>
  fallaCon(() => dentro(PAGAR(40, null)), "Elige a qué empresa aliada"));

caso("con una sola aliada con cuenta, un pago sin elegir va a ella (la pantalla de hoy sigue igual)", () => {
  const r = ultima(
    dentro(`update retail.empresas set cuenta_corriente_desde = null where id = :'claure';
${PAGAR(40, null)}
select ${SALDO("otra")};`),
  );
  return igual(r, 78, "saldo de la aliada:");
});

caso("una aliada que no vende en ninguna tienda de esa caja no recibe su efectivo; la de Trujillo sí", () => {
  const r = ultima(
    dentro(`insert into retail.cajas (ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en) values (:'tru', 'cerrada', 0, now() - interval '2 hours', now()) returning id as caja \\gset
set local session_replication_role = replica;
insert into retail.caja_traslados (caja_id, destino, monto) values (:'caja', 'claudia', 25) returning empresa_id as quien \\gset
set local session_replication_role = origin;
select (:'quien' = :'otra')::text || '|' || ${SALDO("otra")};`),
  );
  const [es, saldo] = r.split("|");
    return es === "true" ? igual(saldo, 93, "saldo de la aliada (118 − 25):") : `el efectivo no quedó con la aliada de Trujillo: ${r}`;
});

caso("la proyección de caja descuenta lo de todas, cada una solo si se le debe", () => {
  const r = ultima(dentro(`select retail.fn_aliadas_saldo_a(retail.fn_hoy_lima()) - greatest(${SALDO("claure")}, 0);`));
  return igual(r, 118, "lo de la aliada en la suma:");
});

caso("no se da de baja una aliada con su cuenta fuera de cero", () =>
  fallaCon(
    () =>
      dentro(`set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
select retail.programar_baja_empresa_aliada(:'otra', 'Otra Aliada');`),
    "Su cuenta no está en cero",
  ));

caso("con la cuenta en cero, sí", () => {
  const r = ultima(
    dentro(`${PAGAR(118, "otra")}
update retail.stock_dueno set cantidad = 0, cantidad_apartada = 0 where empresa_id = :'otra';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
select retail.programar_baja_empresa_aliada(:'otra', 'Otra Aliada') = retail.fn_hoy_lima() + 7;`),
  );
  return r === "t" ? null : `salió ${r}`;
});

caso("fn_aliadas_cierre da una fila por aliada de la tienda de la caja, con su nombre", () => {
  const r = ultima(
    dentro(`insert into retail.cajas (ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en) values (:'tru', 'cerrada', 0, now() - interval '2 hours', now()) returning id as caja \\gset
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
select jsonb_array_length(retail.fn_aliadas_cierre(:'caja')) || '|' || (retail.fn_aliadas_cierre(:'caja') -> 0 ->> 'nombre');`),
  );
  return r === "1|Otra Aliada" ? null : `salió ${r}`;
});

console.log("— Pegar, permisos y lo que no se tocó —");

caso("pegar la migración dos veces no falla", () => {
  const r = ultima(psql(`begin;\n${MIGRACIONES}\n\\o /dev/null\n${M3}\n\\o\nselect 'ok';\nrollback;`));
  return r === "ok" ? null : `salió ${r}`;
});

caso("las de CLAURE no se tocaron: siguen leyendo a CLAURE por su clave", () => {
  const r = ultima(dentro(`select bool_and(position('clave = ''claure''' in pg_get_functiondef(f::regprocedure)) > 0)
    from unnest(array['retail.fn_claure_filas(uuid[])', 'retail.fn_claure_saldo_a(date)', 'retail.fn_claure_cierre(uuid)']) f;`));
  return r === "t" ? null : `salió ${r}`;
});

caso("lo interno no lo llama una sesión; lo de la pantalla sí", () => {
  const r = ultima(dentro(`select not has_function_privilege('authenticated', 'retail.fn_aliada_filas(uuid, uuid[])', 'execute')
    and not has_function_privilege('authenticated', 'retail.fn_aliada_saldo_a(uuid, date)', 'execute')
    and not has_function_privilege('authenticated', 'retail.fn_aliada_de_la_llamada(uuid)', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_aliada_cuenta(uuid)', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_aliadas_cierre(uuid)', 'execute')
    and not has_function_privilege('anon', 'retail.fn_aliada_cuenta(uuid)', 'execute');`));
  return r === "t" ? null : `salió ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

#!/usr/bin/env node
/**
 * Prueba de ADR-0609: el cuadre de Ventas a Finanzas (`20261104212000_cuadre_ventas_finanzas.sql`) y lo que el Flujo no cubre cuando una
 * cuenta arrancó a mitad del período (`20261104211000_flujo_dice_lo_que_no_cubre.sql`).
 *
 * QUÉ CUBRE
 *   · el cuadre: vendido + igv + anulaciones_otro_mes + devoluciones + cambios + claure + otras = ventas_netas, y ventas_netas es la del
 *     Estado de resultados, sede por sede. Los números esperados están calculados a mano en cada escena.
 *   · una venta anulada dentro del mes no deja nada; una anulada en otro mes se ve en los dos meses, con signos contrarios.
 *   · permisos: lo mismo que el Estado de resultados; las piezas internas no se llaman desde afuera.
 *   · el Flujo: lo cobrado antes de que arranque una cuenta no suma, pero se dice; la identidad del saldo no se mueve; cobros − salidas +
 *     entre cuentas es TODO lo que el libro registró antes; una cuenta que arrancó antes del período no aparece.
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones). El cuadre se prueba en septiembre de 2030, un mes sin
 * datos de nadie más. USO: pnpm pruebas:cuadre-ventas-finanzas, con las migraciones ya aplicadas en el local.
 */

import { execFileSync } from "node:child_process";
import { ELEGIR_A, ELEGIR_B } from "./_claure_prendas.mjs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
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
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}') on conflict do nothing;\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado !== undefined) console.log(`    ${JSON.stringify(resultado).slice(0, 1400)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

const AYUDAS = `
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end $f$;
-- Una venta de una línea, pagada en efectivo.
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_precio numeric, p_anulada timestamptz default null)
returns void language plpgsql as $f$
begin
  insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, created_at)
  values (pg_temp.k(p_n), p_ubic, case when p_anulada is null then 'completada' else 'anulada' end, p_anulada,
          case when p_anulada is null then null else 'prueba ADR-0609' end, p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, 1, p_precio, 0, 10);
  insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), 'efectivo', p_precio);
end $f$;
-- Una fila del cuadre, como texto comparable.
create function pg_temp.fila(p_desde date, p_hasta date, p_u uuid) returns text language sql as $f$
  select concat_ws(',', c.vendido::numeric(12,2), c.igv::numeric(12,2), c.anulaciones_otro_mes::numeric(12,2), c.devoluciones::numeric(12,2),
                   c.cambios::numeric(12,2), c.claure::numeric(12,2), c.otras::numeric(12,2), c.ventas_netas::numeric(12,2))
    from retail.fn_cuadre_ventas_finanzas(p_desde, p_hasta) c where c.ubicacion_id = p_u
$f$;
`;

const ESCENA_VENTAS = `
begin;
${AYUDAS}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select id as lim from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1 \\gset
${ELEGIR_A}
${ELEGIR_B}
set local session_replication_role = replica;
-- Septiembre de 2030, con IGV de 18 % (a mano):
--   TRU  S1  118.00 (base 100, IGV 18), vigente
--        S2   59.00 (base 50, IGV 9), vigente; devuelta el 7-sep: −50 sin IGV
--        S4  118.00 (base 100) vendida en septiembre y anulada en octubre: Ventas no la cuenta, el diario de septiembre sí: +100
--        C1  cambio de S1 con +11.80 de diferencia: +10 sin IGV
--   LIM  S3  236.00 (base 200) vendida y anulada en septiembre: nada
--        S5  118.00 (base 100) vendida en agosto y anulada en septiembre: −100
select pg_temp.vender('S1', :'tru', '2030-09-05 12:00-05', :'va_b', 118);
select pg_temp.vender('S2', :'tru', '2030-09-06 12:00-05', :'va_b', 59);
select pg_temp.vender('S4', :'tru', '2030-09-10 12:00-05', :'va_b', 118, '2030-10-02 12:00-05');
select pg_temp.vender('S3', :'lim', '2030-09-08 12:00-05', :'va_b', 236, '2030-09-09 12:00-05');
select pg_temp.vender('S5', :'lim', '2030-08-20 12:00-05', :'va_b', 118, '2030-09-12 12:00-05');
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
values (pg_temp.k('D1'), pg_temp.k('S2'), :'tru', 'talla', 'aprobada', null, 'efectivo', '2030-09-07 10:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (pg_temp.k('D1'), pg_temp.k('S2i'), 1, 'vendible');
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, motivo, condicion, created_at)
values (pg_temp.k('C1'), pg_temp.k('S1i'), :'tru', :'va_b', 1, 11.80, 'efectivo', 'talla_chica', 'vendible', '2030-09-11 12:00-05');
`;

// 1. Cada fila, calculada a mano, y la identidad.
{
  const r = correr(`${ESCENA_VENTAS}
select pg_temp.fila('2030-09-01', '2030-09-30', :'tru');
select pg_temp.fila('2030-09-01', '2030-09-30', :'lim');
select pg_temp.fila('2030-10-01', '2030-10-31', :'tru');
select bool_and(round(c.vendido + c.igv + c.anulaciones_otro_mes + c.devoluciones + c.cambios + c.claure + c.otras, 2) = round(c.ventas_netas, 2))
  from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30') c;
select bool_and(round(c.ventas_netas, 2) = round(e.ventas_netas, 2))
  from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30') c
  join retail.fn_estado_resultados('2030-09-01', '2030-09-30') e on e.ubicacion_id = c.ubicacion_id;
`);
  const [tru, lim, trOct, identidad, igualER] = lineas(r);
  esperar("Trujillo: 177 con IGV → −27 de IGV, +100 de la venta anulada en octubre, −50 de devolución, +10 de cambio = 210", tru === "177.00,-27.00,100.00,-50.00,10.00,0.00,0.00,210.00", r.ok ? tru : r);
  esperar("Lima: lo anulado dentro del mes no deja nada; lo vendido en agosto y anulado en septiembre, −100", lim === "0.00,0.00,-100.00,0.00,0.00,0.00,0.00,-100.00", r.ok ? lim : r);
  esperar("la venta anulada en otro mes se ve al revés en octubre", trOct === "0.00,0.00,-100.00,0.00,0.00,0.00,0.00,-100.00", r.ok ? trOct : r);
  esperar("cada fila suma exacto, sin nada en «otras»", identidad === "t", identidad);
  esperar("ventas_netas es la del Estado de resultados, sede por sede", igualER === "t", igualER);
}

// 2. CLAURE: la base de lo suyo sale de Finanzas; Ventas sí lo cuenta.
{
  const r = correr(`${ESCENA_VENTAS}
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, :'lim') on conflict do nothing;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
select pg_temp.vender('SC', :'lim', '2030-09-15 12:00-05', :'va_a', 118);
select pg_temp.fila('2030-09-01', '2030-09-30', :'lim');
`);
  esperar("Lima con una prenda de CLAURE de S/ 118: Ventas +118, IGV −18, CLAURE −100, y el ingreso de CAYLA no sube", lineas(r)[0] === "118.00,-18.00,-100.00,0.00,0.00,-100.00,0.00,-100.00", r.ok ? lineas(r)[0] : r);
}

// 3. Permisos y corte de Finanzas.
{
  const r = correr(`${ESCENA_VENTAS}
${cambiaA(MICAELA)}
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'reportes_financieros';
select pg_temp.intento($$select * from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30')$$);
${conModulo("reportes_financieros")}
select (select coalesce(string_agg(c.ubicacion_id::text, ',' order by c.ubicacion_id), '') from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30') c)
     = (select coalesce(string_agg(e.ubicacion_id::text, ',' order by e.ubicacion_id), '') from retail.fn_estado_resultados('2030-09-01', '2030-09-30') e
         where e.ubicacion_id is not null and exists (select 1 from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30') c where c.ubicacion_id = e.ubicacion_id)),
       (select count(*) > 0 from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30') c where c.ubicacion_id = :'tru');
select has_function_privilege('anon', 'retail.fn_cuadre_ventas_finanzas(date, date)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_cuadre_ventas_finanzas(date, date)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_flujo_antes_del_arranque(date, date)', 'execute');
${cambiaA(FELIPE)}
update retail.parametros_finanzas set inicio_finanzas = '2030-10-01';
select count(*) from retail.fn_cuadre_ventas_finanzas('2030-09-01', '2030-09-30');
`);
  const [sinModulo, conEl, privs, tras] = lineas(r);
  esperar("sin el módulo no se lee: la base lo dice", (sinModulo ?? "").includes("necesita el módulo"), r.ok ? sinModulo : r);
  esperar("con el módulo se lee lo mismo que el Estado de resultados, y las filas de la sede de la integrante están", conEl === "t|t", r.ok ? conEl : r);
  esperar("no la llama anon; sí authenticated; la pieza interna del Flujo, no", privs === "f|t|f", privs);
  esperar("un mes anterior al inicio de Finanzas no devuelve nada, como el Estado de resultados", tras === "0", r.ok ? tras : r);
}

const ESCENA_CUENTA = `
begin;
${AYUDAS}
${cambiaA(FELIPE)}
select retail.fn_hoy_lima() as hoy \\gset
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select retail.crear_cuenta_dinero('Banco arranca hoy ADR-0609', 'banco', 1000, retail.fn_hoy_lima()) as nuevo \\gset
select retail.crear_cuenta_dinero('Banco de siempre ADR-0609', 'banco', 500, retail.fn_hoy_lima() - 60) as viejo \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'nuevo') as _m1 \\gset
select retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date) as antes \\gset
-- Un Yape de S/ 100 de hace 3 días (antes de que la cuenta arranque) y otro de S/ 40 de hoy.
insert into retail.ventas (ubicacion_id, created_at) values (:'tru', now() - interval '3 days') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'yape', 100);
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as v2 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v2', 'yape', 40);
select retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date) as despues \\gset
create function pg_temp.fila_cuenta(j jsonb, id uuid) returns jsonb language sql as $f$
  select e from jsonb_array_elements(j->'arranques') e where (e->>'cuenta_id')::uuid = id
$f$;
`;

// 4. Lo anterior al arranque no suma, y se dice.
{
  const r = correr(`${ESCENA_CUENTA}
select round((:'despues'::jsonb->>'saldo_inicial')::numeric + (:'despues'::jsonb->>'entro')::numeric - (:'despues'::jsonb->>'salio')::numeric + (:'despues'::jsonb->>'ajustes')::numeric, 2)
         = round((:'despues'::jsonb->>'saldo_final')::numeric, 2), (:'despues'::jsonb->>'descuadre')::numeric = 0;
select (:'despues'::jsonb->>'entro')::numeric - (:'antes'::jsonb->>'entro')::numeric;
select (pg_temp.fila_cuenta(:'despues', :'nuevo')->>'cobros')::numeric, (pg_temp.fila_cuenta(:'despues', :'nuevo')->>'desde') = :'hoy', (pg_temp.fila_cuenta(:'despues', :'nuevo')->>'saldo_inicial')::numeric;
select pg_temp.fila_cuenta(:'despues', :'viejo') is null;
select (select count(*) from jsonb_array_elements(retail.fn_flujo_caja_real(:'hoy'::date, :'hoy'::date)->'arranques') e where (e->>'cuenta_id')::uuid = :'nuevo');
`);
  const [cuadra, entro, fila, viejo, mismoDia] = lineas(r);
  esperar("la identidad del Flujo no se mueve", cuadra === "t|t", r.ok ? cuadra : r);
  esperar("solo el Yape de hoy (S/ 40) suma a lo que entró", Number(entro) === 40, r.ok ? entro : r);
  esperar("el de hace 3 días (S/ 100) se dice: cuenta, fecha de arranque y saldo con que arrancó", fila === "100.00|t|1000.00", r.ok ? fila : r);
  esperar("una cuenta que arrancó antes del período no aparece", viejo === "t", viejo);
  esperar("mirando desde el mismo día en que arrancó, tampoco", mismoDia === "0", mismoDia);
}

// 5. cobros − salidas + entre cuentas es todo lo que el libro registró antes del arranque.
{
  const r = correr(`${ESCENA_CUENTA}
select bool_and(round((e->>'cobros')::numeric - (e->>'salidas')::numeric + (e->>'entre_cuentas')::numeric, 2)
                = round(coalesce((select sum(l.monto) from retail.fn_dinero_libro(:'hoy'::date) l
                                   where l.cuenta_id = (e->>'cuenta_id')::uuid and l.fecha >= :'hoy'::date - 6 and l.fecha < (e->>'desde')::date), 0), 2))
  from jsonb_array_elements(:'despues'::jsonb->'arranques') e;
`);
  esperar("las tres columnas suman exacto lo que el libro de cada cuenta tiene antes de arrancar", lineas(r)[0] === "t", r.ok ? lineas(r)[0] : r);
}

console.log(`\n${casos - fallos}/${casos} casos en verde.`);
if (fallos) {
  console.error(`${fallos} caso(s) fallaron.`);
  process.exit(1);
}

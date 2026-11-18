#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F6 — Flujo de caja y escenarios (`20260925160000_finanzas_flujo_de_caja.sql`).
 *
 * QUÉ CUBRE
 *   · lo que ya pasó: saldo inicial + entró − salió ± ajustes = saldo final, SIEMPRE (con los datos que tenga la base, más
 *     cada escena); cada cosa en su categoría: cobros por medio, plata del dueño, gastos, pago de la tarjeta, comisión del
 *     POS; lo que solo cambia de lugar (depósito, traslado del cierre, abono del POS) suma cero; el faltante al cerrar; cada
 *     egreso de caja según lo que respalda; lo pagado con la tarjeta de crédito no sale de la plata (sube la deuda);
 *   · lo «sin cuenta» de F3 no suma en ningún saldo y se lista aparte;
 *   · las semanas: bloques de 7 días hacia atrás, contiguos, que suman el total, y el saldo de la última es el final;
 *   · lo que viene: saldo de hoy, bloques de 7 días desde mañana, la meta de cada día con su campaña, el promedio de 8
 *     semanas para la tienda sin meta, los vencimientos de F4 (lo vencido, en el primer bloque), los gastos fijos que vienen
 *     y los que faltan (no los registrados), la planilla de Dynamic, la semana bajo el mínimo y los días de caja;
 *   · permisos: solo el líder; las piezas internas no se llaman desde afuera; nada se guarda (funciones STABLE).
 *
 * CÓMO. Igual que `cuentas_dinero.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito. Como la base ya trae datos, las cifras
 * se comparan ANTES y DESPUÉS de lo que cada escena agrega; la identidad del saldo se exige sobre todo.
 *
 * USO
 *   pnpm pruebas:flujo-caja    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

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
const AYUDAS = `
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
-- El monto de una categoría en un flujo (0 si no aparece).
create function pg_temp.cat(j jsonb, k text) returns numeric language sql as $f$
  select coalesce((select (e->>'monto')::numeric from jsonb_array_elements(j->'categorias') e where e->>'clave' = k), 0);
$f$;
create function pg_temp.sin(j jsonb, k text) returns numeric language sql as $f$
  select coalesce((select (e->>'monto')::numeric from jsonb_array_elements(j->'sin_cuenta') e where e->>'origen' = k), 0);
$f$;
create function pg_temp.num(j jsonb, k text) returns numeric language sql as $f$ select (j->>k)::numeric; $f$;
-- La identidad: inicial + entró − salió + ajustes = final (y el descuadre que la función declara es cero).
create function pg_temp.cuadra(j jsonb) returns boolean language sql as $f$
  select round((j->>'saldo_inicial')::numeric + (j->>'entro')::numeric - (j->>'salio')::numeric + (j->>'ajustes')::numeric, 2)
           = round((j->>'saldo_final')::numeric, 2)
     and (j->>'descuadre')::numeric = 0;
$f$;
-- Lo que se espera cobrar de una tienda en la proyección (todos los días, o uno).
create function pg_temp.cobros(j jsonb, u uuid, f date default null) returns numeric language sql as $f$
  select coalesce(sum((c->>'monto')::numeric), 0) from jsonb_array_elements(j->'cobros') c
   where (c->>'ubicacion_id')::uuid = u and (f is null or (c->>'fecha')::date = f);
$f$;
-- Las salidas de la proyección que cumplen un filtro de texto sobre su id o su tipo.
create function pg_temp.salidas(j jsonb, tipo text, id_como text default '%') returns numeric language sql as $f$
  select coalesce(sum((s->>'monto')::numeric), 0) from jsonb_array_elements(j->'salidas') s
   where s->>'tipo' = tipo and s->>'id' like id_como;
$f$;
`;

/** Trujillo y Lima; un BCP con S/ 1,000 desde hace 20 días, el POS en cero y una Visa; en Trujillo el Yape y las
 *  transferencias entran al BCP y la tarjeta al POS; la caja de Trujillo abierta de nuevo con S/ 100. Lima no tiene
 *  ningún medio configurado. Deja `:tru`, `:lim`, `:cajon_tru`, `:fuerte_tru`, `:bcp`, `:pos`, `:visa`, `:caja`, `:hoy`. */
const ESCENA = `
begin;
${AYUDAS}
${cambiaA(FELIPE)}
select retail.fn_hoy_lima() as hoy \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
select retail.crear_cuenta_dinero('BCP prueba F6', 'banco', 1000, retail.fn_hoy_lima() - 20) as bcp \\gset
select retail.crear_cuenta_dinero('Niubiz prueba F6', 'por_abonar', 0, retail.fn_hoy_lima() - 20) as pos \\gset
select retail.crear_cuenta_dinero('Visa prueba F6', 'tarjeta_credito', 0, retail.fn_hoy_lima() - 20) as visa \\gset
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _m1 \\gset
select retail.guardar_medio_de_cobro(:'tru', 'transferencia', :'bcp') as _m2 \\gset
select retail.guardar_medio_de_cobro(:'tru', 'tarjeta', :'pos') as _m3 \\gset
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as caja \\gset
`;
/** Un comprobante de venta tal como lo deja Facturación (total con IGV; el IGV sale del 18 %): lo mismo que usa `impuestos.mjs`. */
const COMPROBANTE = `
create function pg_temp.comp(p_ubic uuid, p_tipo text, p_serie text, p_num int, p_total numeric, p_estado text, p_entorno text, p_dia date)
returns uuid language plpgsql as $f$
declare v_id uuid; v_igv numeric := round(p_total - p_total / 1.18, 2);
begin
  insert into retail.comprobantes (ubicacion_id, venta_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
                                   subtotal, igv, total, estado, entorno_transmision, created_at)
  values (p_ubic, null, p_tipo, p_serie, p_num, 'dni', '44556677', 'Clienta de prueba F6',
          p_total - v_igv, v_igv, p_total, p_estado, p_entorno, (p_dia + time '12:00') at time zone 'America/Lima')
  returning id into v_id;
  return v_id;
end $f$;
`;
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;
const REAL = `retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date)`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Un día movido: cada cosa en su lado y su categoría; lo que cambia de lugar suma cero; la Visa no es plata.
{
  const r = correr(`${ESCENA}
select ${REAL} as antes \\gset
insert into retail.ventas (ubicacion_id, caja_id) values (:'tru', :'caja') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'efectivo', 200), (:'v1', 'yape', 150), (:'v1', 'tarjeta', 80);
select retail.registrar_movimiento_dinero('deposito', 50, :'cajon_tru', :'bcp', null, 'V-1', 0, :'caja') as m1 \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'Envío F6', :'hoy'::date, 30, null, 'transferencia') as g1 \\gset
select retail.registrar_movimiento_dinero('aporte', 500, null, :'bcp') as m2 \\gset
select retail.registrar_movimiento_dinero('pago_tarjeta', 100, :'bcp', :'visa') as m3 \\gset
select retail.registrar_movimiento_dinero('abono_tarjeta', 78, :'pos', :'bcp', null, null, 2) as m4 \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio con la Visa', :'hoy'::date, 40, null, 'tarjeta') as g2 \\gset
select ${REAL} as despues \\gset
select pg_temp.cuadra(:'antes'), pg_temp.cuadra(:'despues');
select pg_temp.num(:'despues', 'saldo_final') - pg_temp.num(:'antes', 'saldo_final');
select string_agg((pg_temp.cat(:'despues', k) - pg_temp.cat(:'antes', k))::text, ',' order by o)
  from unnest(array['efectivo','yape','tarjeta','dueno_pone','gastos','pago_tarjeta','comision_pos','entre_cuentas']) with ordinality u(k, o);
select pg_temp.num(:'despues', 'entro') - pg_temp.num(:'antes', 'entro'), pg_temp.num(:'despues', 'salio') - pg_temp.num(:'antes', 'salio'),
       pg_temp.num(:'despues', 'ajustes') - pg_temp.num(:'antes', 'ajustes');
select (select sum((s->>'entro')::numeric) from jsonb_array_elements(:'despues'::jsonb->'semanas') s) = pg_temp.num(:'despues', 'entro'),
       (select (s->>'saldo')::numeric from jsonb_array_elements(:'despues'::jsonb->'semanas') s order by s->>'desde' desc limit 1) = pg_temp.num(:'despues', 'saldo_final');`);
  const [cuadra, delta, cats, lados, semanas] = lineas(r);
  esperar("antes y después: saldo inicial + entró − salió ± ajustes = saldo final, sin descuadre", r.ok && cuadra === "t|t", r);
  esperar("la plata disponible sube S/ 798: 200 + 150 + 80 − 30 + 500 − 100 − 2 (la Visa no cuenta: es deuda)", r.ok && Number(delta) === 798, r);
  esperar(
    "efectivo +200, Yape +150, tarjeta +80, dueño +500, gastos 30, pago de la Visa 100, comisión 2; depósito y abono suman cero",
    r.ok && cats.split(",").map(Number).join(",") === "200,150,80,500,30,100,2,0",
    r,
  );
  esperar("entró +930, salió +132, ajustes 0", r.ok && lados.split("|").map(Number).join(",") === "930,132,0", r);
  esperar("las semanas suman lo que entró y la última termina en el saldo final", r.ok && semanas === "t|t", r);
}

// 1b. El QR (`20261002130000_venta_pagos_qr.sql`) es plata que ENTRA. `fn_flujo_lado` solo conocía una lista de medios como «entra» y mandaba
// todo lo demás a «sale»: el QR (el 21 % de lo cobrado en octubre) restaba de lo que salió, el burn de «días de caja» salía la mitad y la
// identidad del saldo seguía en cero porque los dos errores se compensaban (auditoría de Finanzas 2026-10-16, G05).
{
  const r = correr(`${ESCENA}
select ${REAL} as antes \\gset
insert into retail.ventas (ubicacion_id, caja_id) values (:'tru', :'caja') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'qr', 100);
select ${REAL} as despues \\gset
select pg_temp.cuadra(:'despues');
select pg_temp.cat(:'despues', 'qr') - pg_temp.cat(:'antes', 'qr');
select pg_temp.num(:'despues', 'entro') - pg_temp.num(:'antes', 'entro'), pg_temp.num(:'despues', 'salio') - pg_temp.num(:'antes', 'salio');
select retail.fn_flujo_lado('qr');`);
  const [cuadra, qr, lados, lado] = lineas(r);
  esperar("un cobro con QR de S/ 100 cuenta como QR +100, y el flujo sigue cuadrando", r.ok && cuadra === "t" && Number(qr) === 100, r);
  esperar("el QR entra: entró +100 y lo que salió no cambia", r.ok && lados.split("|").map(Number).join(",") === "100,0", r);
  esperar("fn_flujo_lado('qr') es «entra»", r.ok && lado === "entra", r);
}

// 1c. La guarda de fondo: TODO medio de cobro que acepta `venta_pagos` entra como «entra». Un medio nuevo en el CHECK sin su lugar en
// `fn_flujo_lado` (como pasó con el QR) cae aquí, en el CI, y no en la pantalla del líder. «anticipo» (lo que paga un apartado) y
// «redondeo» (la diferencia de céntimos) no son un cobro con un medio y se cuentan por otro lado.
{
  const r = correr(`${ESCENA}
select 'sin:' || coalesce(string_agg(m, ',' order by m), '') from (
  select (regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'))[1] as m
    from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check') x
 where m not in ('anticipo', 'redondeo') and retail.fn_flujo_lado(m) <> 'entra';
select count(*) from (
  select (regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'))[1] as m
    from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check') x;`);
  const [sinLado, cuantos] = lineas(r);
  esperar("todo medio de cobro de venta_pagos entra por «entra» en el flujo (ninguno cae en «sale»)", r.ok && sinLado === "sin:", r);
  esperar("la guarda sí lee los medios del CHECK (si no los encuentra, no vigila nada)", r.ok && Number(cuantos) >= 8, r);
}

// 2. El cierre de caja: el faltante es un ajuste; el traslado a la caja fuerte o al banco solo cambia de lugar; el «banco»
//    de una tienda sin cuenta de transferencias sale del cajón sin decir a dónde.
{
  const r = correr(`${ESCENA}
insert into retail.ventas (ubicacion_id, caja_id) values (:'tru', :'caja') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'efectivo', 200);
select coalesce((select id::text from retail.cajas where ubicacion_id = :'lim' and estado = 'abierta' and not es_prueba limit 1), '') as caja_lim \\gset
select coalesce(nullif(:'caja_lim', ''), (select retail.abrir_caja(:'lim', 50.00, 'prueba automatizada'))::text) as caja_lim \\gset
select least(20, esperado) as tr_lim, esperado as esp_lim from retail.fn_calcular_esperado_caja(:'caja_lim') \\gset
select coalesce(sum(saldo), 0) as fuerte_antes from retail.fn_cuentas_dinero_saldos() where id = :'fuerte_tru' \\gset
select ${REAL} as antes \\gset
select * from retail.cerrar_caja(:'caja', 290, 150, 'caja_fuerte') \\gset cierre_
select * from retail.cerrar_caja(:'caja_lim', :'esp_lim', :'tr_lim', 'banco') \\gset lim_
select ${REAL} as despues \\gset
select pg_temp.cuadra(:'despues');
select pg_temp.cat(:'despues', 'faltantes_caja') - pg_temp.cat(:'antes', 'faltantes_caja'),
       pg_temp.cat(:'despues', 'entre_cuentas') - pg_temp.cat(:'antes', 'entre_cuentas'),
       pg_temp.cat(:'despues', 'deposito_sin_cuenta') - pg_temp.cat(:'antes', 'deposito_sin_cuenta'),
       pg_temp.cat(:'despues', 'efectivo') - pg_temp.cat(:'antes', 'efectivo');
select pg_temp.num(:'despues', 'saldo_final') - pg_temp.num(:'antes', 'saldo_final') + :'tr_lim'::numeric, :'tr_lim';
select pg_temp.sin(:'despues', 'traslado');
select (select saldo from retail.fn_cuentas_dinero_saldos() where id = :'cajon_tru'), (select saldo from retail.fn_cuentas_dinero_saldos() where id = :'fuerte_tru') - :'fuerte_antes'::numeric;`);
  const [cuadra, cats, deltaYTr, sinTraslado, saldos] = lineas(r);
  const [delta, trLim] = (deltaYTr ?? "").split("|").map(Number);
  const [faltante, entre, sinCuenta, efectivo] = (cats ?? "").split("|").map(Number);
  esperar("después de cerrar las dos cajas, el flujo cuadra", r.ok && cuadra === "t", r);
  esperar("contar S/ 290 donde se esperaban S/ 300 es un faltante de S/ 10 (ajuste)", r.ok && faltante === -10, r);
  esperar("el traslado a la caja fuerte y el cierre no mueven «entre cuentas» (sale del cajón y entra a la caja fuerte)", r.ok && entre === 0, r);
  esperar("Lima no tiene cuenta de transferencias: lo que su cierre manda «al banco» sale sin decir a dónde", r.ok && sinCuenta === trLim, r);
  esperar("cerrar no cambia lo cobrado: el efectivo ya contaba con la caja abierta", r.ok && efectivo === 0, r);
  esperar("la plata disponible baja solo el faltante (y lo que Lima mandó a un banco sin cuenta)", r.ok && delta === -10, r);
  esperar("ese traslado sin cuenta no se lista dos veces (ya salió del cajón)", r.ok && Number(sinTraslado) === 0, r);
  esperar("los saldos de F3 dicen lo mismo: cajón con S/ 140 de fondo y S/ 150 más en la caja fuerte", r.ok && saldos === "140.00|150.00", r);
}

// 3. Cada egreso de caja según lo que respalda.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_caja(:'caja', 'egreso', 40, 'Otro', 'bolsas', false, null::uuid) as e1 \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 60, 'Depósito bancario', 'sin voucher', false, null::uuid) as e2 \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 70, 'Otro', 'para el dueño', false, null::uuid) as e3 \\gset
select ${REAL} as antes \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 80, 'Otro', 'sin explicar', false, null::uuid) as e4 \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas F6', :'hoy'::date, 40, null, 'efectivo', null, :'e1') as g \\gset
select retail.marcar_egreso_no_gasto(:'e2', 'deposito') as _n1 \\gset
select retail.marcar_egreso_no_gasto(:'e3', 'retiro') as _n2 \\gset
select ${REAL} as despues \\gset
select pg_temp.cuadra(:'despues');
select string_agg((pg_temp.cat(:'despues', k) - pg_temp.cat(:'antes', k))::text, ',' order by o)
  from unnest(array['gastos','deposito_sin_cuenta','dueno_saca','por_clasificar']) with ordinality u(k, o);
select pg_temp.num(:'despues', 'saldo_final') - pg_temp.num(:'antes', 'saldo_final');`);
  const [cuadra, cats, delta] = lineas(r);
  esperar("con egresos de caja, el flujo cuadra", r.ok && cuadra === "t", r);
  esperar(
    "el egreso de un gasto va a Gastos; «no es gasto: depósito» sale sin cuenta; «retiro» es del dueño; el que nadie clasificó, «por clasificar»",
    r.ok && cats.split(",").map(Number).join(",") === "40,60,70,-90",
    r,
  );
  esperar("la plata solo baja el egreso nuevo (S/ 80): clasificar no mueve plata", r.ok && Number(delta) === -80, r);
}

// 4. Lo «sin cuenta» de F3 no suma en ningún saldo: se lista aparte.
{
  const r = correr(`${ESCENA}
select ${REAL} as antes \\gset
select retail.registrar_gasto(:'lim', 'transporte', 'Mototaxi F6', :'hoy'::date, 25, null, 'yape') as g \\gset
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'plin', 90);
select ${REAL} as despues \\gset
select pg_temp.cuadra(:'despues');
select pg_temp.num(:'despues', 'entro') - pg_temp.num(:'antes', 'entro'), pg_temp.num(:'despues', 'salio') - pg_temp.num(:'antes', 'salio'),
       pg_temp.num(:'despues', 'saldo_final') - pg_temp.num(:'antes', 'saldo_final');
select pg_temp.sin(:'despues', 'gasto') - pg_temp.sin(:'antes', 'gasto'), pg_temp.sin(:'despues', 'cobros') - pg_temp.sin(:'antes', 'cobros');`);
  const [cuadra, deltas, sin] = lineas(r);
  esperar("con cosas sin cuenta, el flujo cuadra igual", r.ok && cuadra === "t", r);
  esperar("un gasto por Yape de Lima (sin cuenta) y un Plin de Trujillo (sin configurar) no mueven entró, salió ni el saldo", r.ok && deltas.split("|").map(Number).join(",") === "0,0,0", r);
  esperar("se listan aparte: gasto −25 y cobros +90", r.ok && sin.split("|").map(Number).join(",") === "-25,90", r);
}

// 5. Las semanas y los rangos.
{
  const r = correr(`${ESCENA}
select retail.fn_flujo_caja_real(:'hoy'::date - 23, :'hoy'::date) as f \\gset
select jsonb_array_length(:'f'::jsonb->'semanas'),
       (:'f'::jsonb->'semanas'->0->>'desde')::date = :'hoy'::date - 23,
       (:'f'::jsonb->'semanas'->-1->>'hasta')::date = :'hoy'::date,
       (:'f'::jsonb->'semanas'->-1->>'desde')::date = :'hoy'::date - 6;
select bool_and(ok) from (select coalesce((s->>'desde')::date = lag((s->>'hasta')::date) over (order by o) + 1, true) as ok
  from jsonb_array_elements(:'f'::jsonb->'semanas') with ordinality x(s, o)) y;
select round(sum((s->>'entro')::numeric), 2) = pg_temp.num(:'f', 'entro'), round(sum((s->>'salio')::numeric), 2) = pg_temp.num(:'f', 'salio'),
       round((:'f'::jsonb->'semanas'->0->>'saldo')::numeric, 2) = round(pg_temp.num(:'f', 'saldo_inicial') + (:'f'::jsonb->'semanas'->0->>'entro')::numeric
         - (:'f'::jsonb->'semanas'->0->>'salio')::numeric + (:'f'::jsonb->'semanas'->0->>'ajustes')::numeric, 2)
  from jsonb_array_elements(:'f'::jsonb->'semanas') s;
select pg_temp.cuadra(retail.fn_flujo_caja_real(date_trunc('month', :'hoy'::date - 31)::date, (date_trunc('month', :'hoy'::date) - interval '1 day')::date));
select (retail.fn_flujo_caja_real(:'hoy'::date - 3, :'hoy'::date + 10)->>'hasta')::date = :'hoy'::date;
select pg_temp.intento(format('select retail.fn_flujo_caja_real(%L::date + 1, %L::date)', :'hoy', :'hoy'));`);
  const [forma, contiguas, suman, mesPasado, recorta, alReves] = lineas(r);
  esperar("24 días = 4 bloques de 7 hacia atrás desde hoy: el último termina hoy y el primero empieza el primer día", r.ok && forma === "4|t|t|t", r);
  esperar("las semanas son contiguas", r.ok && contiguas === "t", r);
  esperar("suman lo que entró y salió, y el saldo de la primera es el inicial más lo suyo", r.ok && suman === "t|t|t", r);
  esperar("el mes pasado (sin caja abierta) también cuadra", r.ok && mesPasado === "t", r);
  esperar("no se mira el futuro: «hasta» se recorta a hoy", r.ok && recorta === "t", r);
  esperar("un rango al revés se rechaza", r.ok && alReves.includes("no es válido"), r);
}

// 6. Lo que viene: saldo de hoy, bloques de 7 días desde mañana, y el saldo que corre.
{
  const r = correr(`${ESCENA}
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select pg_temp.num(:'p', 'saldo_hoy') = (select sum(saldo) from retail.fn_cuentas_dinero_saldos() where tipo <> 'tarjeta_credito'),
       pg_temp.num(:'p', 'saldo_hoy') = pg_temp.num(${REAL}, 'saldo_final');
select jsonb_array_length(:'p'::jsonb->'semanas'), (:'p'::jsonb->'semanas'->0->>'desde')::date = :'hoy'::date + 1,
       (:'p'::jsonb->'semanas'->-1->>'hasta')::date = :'hoy'::date + 42;
select bool_and(round((w->>'saldo')::numeric, 2) = round(pg_temp.num(:'p', 'saldo_hoy') + (
         select sum((x->>'entra')::numeric - (x->>'sale')::numeric) from jsonb_array_elements(:'p'::jsonb->'semanas') with ordinality y(x, j) where y.j <= o.i), 2))
  from jsonb_array_elements(:'p'::jsonb->'semanas') with ordinality o(w, i);
select bool_and(round((w->>'entra')::numeric, 2) = round((select coalesce(sum((c->>'monto')::numeric), 0) from jsonb_array_elements(:'p'::jsonb->'cobros') c
         where (c->>'fecha')::date between (w->>'desde')::date and (w->>'hasta')::date), 2)
       and round((w->>'sale')::numeric, 2) = round((select coalesce(sum((s->>'monto')::numeric), 0) from jsonb_array_elements(:'p'::jsonb->'salidas') s
         where (s->>'fecha')::date between (w->>'desde')::date and (w->>'hasta')::date), 2))
  from jsonb_array_elements(:'p'::jsonb->'semanas') w;
select jsonb_array_length(retail.fn_flujo_caja_proyeccion(4)->'semanas'), jsonb_array_length(retail.fn_flujo_caja_proyeccion(40)->'semanas');`);
  const [saldo, forma, corre, suma, tope] = lineas(r);
  esperar("el saldo de hoy es la suma de los saldos de F3 sin la tarjeta, y es el final de «lo que ya pasó»", r.ok && saldo === "t|t", r);
  esperar("6 bloques de 7 días: de mañana a hoy + 42", r.ok && forma === "6|t|t", r);
  esperar("el saldo de cada semana es el de hoy + lo que entra − lo que sale hasta esa semana", r.ok && corre === "t", r);
  esperar("lo que entra y sale cada semana es la suma de sus piezas (cobros y salidas con fecha)", r.ok && suma === "t", r);
  esperar("4 semanas si se piden 4; nunca más de 12", r.ok && tope === "4|12", r);
}

// 7. Cobros esperados: la meta de cada día con su campaña (sin meta, el promedio: casos 7b y 7c).
{
  const r = correr(`${ESCENA}
select id as aniv from retail.etiquetas where estilo = 'campana' and nombre = 'Aniversario CAYLA' \\gset
select retail.fn_flujo_caja_proyeccion(6) as antes \\gset
select retail.guardar_metas_tienda(:'tru', array[1000,1000,1000,1000,1000,1000,1000]::numeric[], 100) as _m \\gset
select retail.guardar_efecto_campana(:'aniv', :'tru', 50, null) as _e \\gset
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select (select count(*) from generate_series(:'hoy'::date + 1, :'hoy'::date + 42, interval '1 day') d
         where d::date between e.vigente_desde and e.vigente_hasta) as dias_aniv from retail.etiquetas e where e.id = :'aniv' \\gset
select pg_temp.cobros(:'p', :'tru') = 1000 * 42 + 500 * :'dias_aniv'::int;
select bool_and(c->>'origen' = 'meta') from jsonb_array_elements(:'p'::jsonb->'cobros') c where (c->>'ubicacion_id')::uuid = :'tru';
select :'dias_aniv'::int = 0 or exists (select 1 from jsonb_array_elements(:'p'::jsonb->'cobros') c, jsonb_array_elements(c->'campanas') k
                                         where (c->>'ubicacion_id')::uuid = :'tru' and k->>'nombre' = 'Aniversario CAYLA' and (c->>'monto')::numeric = 1500);
`);
  const [meta, origen, campana] = lineas(r);
  esperar("con meta de S/ 1,000 por día, Trujillo espera cobrar 1,000 × 42 días + 50 % en los días del Aniversario", r.ok && meta === "t", r);
  esperar("esos cobros dicen que salen de la meta", r.ok && origen === "t", r);
  esperar("el día de campaña dice cuál rige y espera S/ 1,500", r.ok && campana === "t", r);
}

// 7b. Sin meta, el promedio de cada día de la semana se divide por los días que de verdad pasaron (no por 8) y se contrae hacia el promedio
// diario de la tienda (ADR-0433, actividad 4). Lima con UN solo cobro, de S/ 800 hace una semana: no se proyecta S/ 800 cada semana ese día
// (un día atípico), ni 100 (÷ 8): (800 + 2 × 800/7) ÷ (1 + 2) = 342.86 ese día y 76.19 los demás, y la semana vuelve a sumar 800.
{
  const r = correr(`${ESCENA}
set local session_replication_role = replica;
update retail.ventas set es_prueba = true where ubicacion_id = :'lim';
reset session_replication_role;
insert into retail.ventas (ubicacion_id, created_at) values (:'lim', ((:'hoy'::date - 7)::timestamp + interval '12 hours') at time zone 'America/Lima') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'yape', 800);
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select pg_temp.cobros(:'p', :'lim', :'hoy'::date + 7);
select round(coalesce(sum((c->>'monto')::numeric), 0), 2) from jsonb_array_elements(:'p'::jsonb->'cobros') c
 where (c->>'ubicacion_id')::uuid = :'lim' and (c->>'fecha')::date between :'hoy'::date + 1 and :'hoy'::date + 7;
select bool_and(c->>'origen' = 'promedio_corto') from jsonb_array_elements(:'p'::jsonb->'cobros') c where (c->>'ubicacion_id')::uuid = :'lim';`);
  const [dia, semana, origen] = lineas(r);
  esperar("con un solo día de historia el día cobrado espera S/ 342.86 (contraído hacia el promedio diario), no 800 ni 100", r.ok && Number(dia) === 342.86, r);
  esperar("y la semana proyectada vuelve a sumar lo cobrado (S/ 800): no inventa ni pierde plata", r.ok && Number(semana) === 800, r);
  esperar("con menos de 4 días de historia lo dice: «promedio_corto»", r.ok && origen === "t", r);
}

// 7c. Con 4 de cada día de la semana (28 días de S/ 1,000) el promedio es S/ 1,000 por día y dice «promedio»: antes salía la mitad (4 000 ÷ 8).
{
  const r = correr(`${ESCENA}
set local session_replication_role = replica;
update retail.ventas set es_prueba = true where ubicacion_id = :'lim';
reset session_replication_role;
insert into retail.ventas (ubicacion_id, created_at)
  select :'lim', ((:'hoy'::date - g)::timestamp + interval '12 hours') at time zone 'America/Lima' from generate_series(1, 28) g;
insert into retail.venta_pagos (venta_id, metodo, monto)
  select v.id, 'yape', 1000 from retail.ventas v where v.ubicacion_id = :'lim' and not v.es_prueba;
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select round(coalesce(sum((c->>'monto')::numeric), 0), 2) from jsonb_array_elements(:'p'::jsonb->'cobros') c
 where (c->>'ubicacion_id')::uuid = :'lim' and (c->>'fecha')::date between :'hoy'::date + 1 and :'hoy'::date + 7;
select bool_and(c->>'origen' = 'promedio') from jsonb_array_elements(:'p'::jsonb->'cobros') c where (c->>'ubicacion_id')::uuid = :'lim';`);
  const [semana, origen] = lineas(r);
  esperar("28 días de S/ 1,000: la semana proyectada espera S/ 7,000 (antes salía S/ 3,500 por dividir entre 8)", r.ok && Number(semana) === 7000, r);
  esperar("con 4 días de cada uno dice «promedio»", r.ok && origen === "t", r);
}

// 8. Salidas: vencimientos de F4 (lo vencido, en el primer bloque) y gastos fijos que vienen o faltan (no los registrados).
{
  const r = correr(`${ESCENA}
insert into retail.proveedores (nombre, activo) values ('Rentas prueba F6', true) returning id as prov \\gset
select retail.fn_flujo_caja_proyeccion(6) as antes \\gset
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz F6', :'hoy'::date, 1180, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F006','numero','1','condicion','credito','fecha_vencimiento',(:'hoy'::date + 10)::text)) as g1 \\gset
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Agua F6', :'hoy'::date - 5, 236, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F006','numero','2','condicion','credito','fecha_vencimiento',(:'hoy'::date - 2)::text)) as g2 \\gset
select compra_id as c1 from retail.gastos where id = :'g1' \\gset
select compra_id as c2 from retail.gastos where id = :'g2' \\gset
select least(28, extract(day from :'hoy'::date + 3)::int) as dia_fijo \\gset
select retail.guardar_gasto_fijo(null, :'tru', 'alquileres', 'Alquiler F6', null, 'sin_comprobante', 2500, false, :'dia_fijo'::int) as f1 \\gset
select retail.guardar_gasto_fijo(null, :'tru', 'servicios_basicos', 'Internet F6', null, 'sin_comprobante', 129, false, 1) as f2 \\gset
select retail.guardar_gasto_fijo(null, :'tru', 'suministros', 'Bolsas F6', null, 'sin_comprobante', 90, false, 1) as f3 \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas del mes F6', date_trunc('month', :'hoy'::date)::date, 90, null, 'transferencia', null, null, null, null, :'f3') as g3 \\gset
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select (s->>'fecha')::date = :'hoy'::date + 10, s->>'monto', s->>'atrasada' from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = 'compras:' || :'c1';
select (s->>'fecha')::date = :'hoy'::date + 1, s->>'atrasada' from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = 'compras:' || :'c2';
select (:'p'::jsonb->'semanas'->1->>'sale')::numeric - (:'antes'::jsonb->'semanas'->1->>'sale')::numeric >= 1180;
select (select count(*) from generate_series(date_trunc('month', :'hoy'::date), date_trunc('month', :'hoy'::date + 42), interval '1 month') m
         where greatest((m::date + (:'dia_fijo'::int - 1)), :'hoy'::date + 1) <= :'hoy'::date + 42) * 2500 = pg_temp.salidas(:'p', 'fijo', :'f1' || ':%');
select (s->>'fecha')::date = :'hoy'::date + 1 from jsonb_array_elements(:'p'::jsonb->'salidas') s
 where s->>'id' = :'f2' || ':' || to_char(:'hoy'::date, 'YYYY-MM');
select count(*) from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = :'f3' || ':' || to_char(:'hoy'::date, 'YYYY-MM');`);
  const [luz, agua, semana, alquiler, internet, bolsas] = lineas(r);
  esperar("la luz a crédito sale el día que vence (hoy + 10), por su saldo", r.ok && luz === "t|1180.00|false", r);
  esperar("el agua vencida sale en el primer bloque (mañana) y dice que está atrasada", r.ok && agua === "t|true", r);
  esperar("la segunda semana suma la luz", r.ok && semana === "t", r);
  esperar("el alquiler fijo sale cada mes que cae en el horizonte, por su monto", r.ok && alquiler === "t", r);
  esperar("un fijo del día 1 que falta registrar sale en el primer bloque", r.ok && internet === "t", r);
  esperar("un fijo ya registrado este mes no se proyecta otra vez", r.ok && bolsas === "0", r);
}

// 8b. «Pagar N días antes» (20261023173000, ADR-0487): el fijo sale el día de pago, no el del vencimiento, y entra al horizonte aunque su
//     mes empiece después. Con el reloj en un día fijo (20 de oct.): un fijo que vence el 1 de nov. y se paga 5 días antes sale el 27 de oct.,
//     el último día de la semana proyectada; el mes de noviembre solo se pide por esa regla.
{
  const r = correr(`${ESCENA}
create or replace function retail.fn_hoy_lima() returns date language sql stable as $f$ select date '2026-10-20' $f$;
select retail.guardar_gasto_fijo(null, :'tru', 'suministros', 'Hilo F8b', null, 'sin_comprobante', 300, false, 1, 'dia', null, 5) as f1 \\gset
select retail.guardar_gasto_fijo(null, :'tru', 'suministros', 'Cierres F8b', null, 'sin_comprobante', 80, false, 1) as f2 \\gset
select retail.fn_flujo_caja_proyeccion(1) as p \\gset
select (s->>'fecha')::date, (s->>'vence')::date, s->>'monto' from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = :'f1' || ':2026-11';
select count(*) from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = :'f2' || ':2026-11';
select (s->>'fecha')::date, (s->>'vence')::date, s->>'atrasada' from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = :'f1' || ':2026-10';`);
  const [conAnticipo, sinAnticipo, vencido] = lineas(r);
  esperar("vence el 1 de nov. y se paga 5 días antes: sale el 27 de oct. (aunque su mes empiece después del horizonte), y dice que vence el 1", r.ok && conAnticipo === "2026-10-27|2026-11-01|300.00", r);
  esperar("el mismo fijo sin «pagar antes» no entra: su día (el 1 de nov.) cae fuera de la semana", r.ok && sinAnticipo === "0", r);
  esperar("el de octubre ya venció sin registrar: sale mañana (primer bloque) y está atrasado", r.ok && vencido === "2026-10-21|2026-10-01|true", r);
}

// 9. La planilla de Dynamic (con una vista de muestra): el mismo día de cada mes; sin la vista, se dice que no se ve.
{
  const r = correr(`${ESCENA}
select retail.fn_flujo_caja_proyeccion(6) as sin_planilla \\gset
create or replace function public.fn_es_admin_o_lider() returns boolean language sql as $f$ select true $f$;
select (:'hoy'::date + 5 - interval '1 month')::date as fin \\gset
create view retail.planilla_por_sede as
  select * from (values ('TRU'::text, 'tienda'::text, :'fin'::date, 12000.00::numeric),
                        ('LIM', 'taller', :'fin'::date, 4000.00),
                        ('CCO', 'central', :'fin'::date, 6000.00),
                        ('TRU', 'tienda', (:'fin'::date - interval '1 month')::date, 99999.00)) v(sede_codigo, sede_tipo, fecha_fin, pagado);
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select :'sin_planilla'::jsonb->>'planilla_visible', pg_temp.salidas(:'sin_planilla', 'planilla');
select :'p'::jsonb->>'planilla_visible';
select (select count(*) from generate_series(1, 15) k where (:'fin'::date + make_interval(months => k))::date between :'hoy'::date - 31 and :'hoy'::date + 42) * 22000
       = pg_temp.salidas(:'p', 'planilla');
select count(distinct s->>'unidad') from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'tipo' = 'planilla';
select (:'p'::jsonb->'salidas_30'->>'planilla')::numeric;`);
  const [sinVista, visible, total, sedes, dias] = lineas(r);
  esperar("sin la vista de Dynamic, la planilla sale como «no se ve» y no se inventa", r.ok && sinVista === "false|0", r);
  esperar("con la vista y siendo admin en Dynamic, se ve", r.ok && visible === "true", r);
  esperar("se proyecta lo pagado en el último período (S/ 22,000), el mismo día de cada mes, no el período anterior", r.ok && total === "t", r);
  esperar("por sede, con el Taller y la oficina", r.ok && sedes === "3", r);
  esperar("los días de caja la cuentan (S/ 22,000 del último mes)", r.ok && Number(dias) === 22000, r);
}

// 10. El mínimo de caja marca la semana que baja de él; los días de caja.
{
  const r = correr(`${ESCENA}
select retail.fn_flujo_caja_proyeccion(6) as p0 \\gset
select retail.guardar_parametros_finanzas(greatest((select max((w->>'saldo')::numeric) + 1 from jsonb_array_elements(:'p0'::jsonb->'semanas') w), 0), 25, 7) as _a \\gset
select retail.fn_flujo_caja_proyeccion(6) as p1 \\gset
select bool_and((w->>'bajo_minimo')::boolean) from jsonb_array_elements(:'p1'::jsonb->'semanas') w;
select greatest(round((:'p0'::jsonb->'semanas'->2->>'saldo')::numeric), 0) as min2 \\gset
select retail.guardar_parametros_finanzas(:'min2', 25, 7) as _b \\gset
select retail.fn_flujo_caja_proyeccion(6) as p2 \\gset
select bool_and((w->>'bajo_minimo')::boolean = ((w->>'saldo')::numeric < pg_temp.num(:'p2', 'minimo_caja'))) from jsonb_array_elements(:'p2'::jsonb->'semanas') w;
select pg_temp.num(:'p2', 'minimo_caja') = :'min2'::numeric;
select retail.registrar_gasto(:'tru', 'transporte', 'Envío grande F6', :'hoy'::date, 300, null, 'transferencia') as g \\gset
select retail.fn_flujo_caja_proyeccion(6) as p3 \\gset
select (:'p3'::jsonb->'salidas_30'->>'con_cuenta')::numeric - (:'p2'::jsonb->'salidas_30'->>'con_cuenta')::numeric;
select pg_temp.num(:'p3', 'salidas_diarias') = round(((:'p3'::jsonb->'salidas_30'->>'con_cuenta')::numeric + (:'p3'::jsonb->'salidas_30'->>'sin_cuenta')::numeric
         + (:'p3'::jsonb->'salidas_30'->>'planilla')::numeric) / 30, 2),
       pg_temp.num(:'p3', 'salidas_diarias') <= 0
         or pg_temp.num(:'p3', 'dias_de_caja') = greatest(floor(pg_temp.num(:'p3', 'saldo_hoy') / pg_temp.num(:'p3', 'salidas_diarias')), 0);`);
  const [todas, regla, minimo, gasto, dias] = lineas(r);
  esperar("con el mínimo por encima de todo, todas las semanas quedan bajo el mínimo", r.ok && todas === "t", r);
  esperar("cada semana se marca si y solo si su saldo queda por debajo del mínimo de Configuración", r.ok && regla === "t", r);
  esperar("el mínimo es el de Configuración ▸ Caja y avisos", r.ok && minimo === "t", r);
  esperar("un gasto de hoy suma S/ 300 a lo que salió los últimos 30 días", r.ok && Number(gasto) === 300, r);
  esperar("días de caja = saldo ÷ (lo que salió en 30 días, con lo sin cuenta y la planilla, ÷ 30)", r.ok && dias === "t|t", r);
}

// 11. Permisos y «nada se guarda».
{
  const r = correr(`${ESCENA}
${conModulo("reportes_financieros")}${conModulo("cuentas_dinero")}
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.fn_flujo_caja_real(%L::date - 6, %L::date)', :'hoy', :'hoy'));
select pg_temp.intento('select retail.fn_flujo_caja_proyeccion(6)');
select has_function_privilege('anon', 'retail.fn_flujo_caja_real(date, date)', 'execute'),
       has_function_privilege('anon', 'retail.fn_flujo_caja_proyeccion(integer)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_flujo_caja_real(date, date)', 'execute');
select bool_or(has_function_privilege('authenticated', f, 'execute')) from unnest(array[
  'retail.fn_flujo_lineas(date, date)', 'retail.fn_flujo_disponible(date)', 'retail.fn_flujo_planilla_pagada()',
  'retail.fn_flujo_planilla_visible()', 'retail.fn_flujo_lado(text)', 'retail.fn_flujo_exigir_lider()']) f;
select string_agg(distinct p.provolatile::text, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_flujo_caja_real', 'fn_flujo_caja_proyeccion', 'fn_flujo_lineas', 'fn_flujo_disponible');`);
  const [real, proy, privilegios, internas, volatil] = lineas(r);
  // ADR-0585 (Felipe 2026-10-30): con el módulo se ve el flujo de CAYLA entera (antes: «por ahora lo ve el líder»).
  esperar("con el módulo, una colaboradora ve el flujo de CAYLA entera", r.ok && real === "SIN_ERROR", r);
  esperar("y la proyección", r.ok && proy === "SIN_ERROR", r);
  esperar("anon no las llama; authenticated sí (el candado es el módulo, adentro)", r.ok && privilegios === "f|f|t", r);
  esperar("las piezas internas no se llaman desde afuera", r.ok && internas === "f", r);
  esperar("nada se guarda: las lecturas son STABLE", r.ok && volatil === "s", r);
}

// 11b. Sin el módulo (aunque tenga Cuentas y dinero) no ve el flujo de CAYLA entera (ADR-0585).
{
  const r = correr(`${ESCENA}
${conModulo("cuentas_dinero")}
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.fn_flujo_caja_real(%L::date - 6, %L::date)', :'hoy', :'hoy'));
select pg_temp.intento('select retail.fn_flujo_caja_proyeccion(6)');`);
  const [real, proy] = lineas(r);
  esperar("sin el módulo (solo con Cuentas y dinero) no ve el flujo de CAYLA entera", r.ok && real.includes("Estados financieros"), r);
  esperar("ni la proyección", r.ok && proy.includes("Estados financieros"), r);
}

// 10b. Con qué se proyecta (ADR-0433, actividad 4): la base dice cuántos días de historia hay, si algún banco o caja fuerte declaró su saldo
// de arranque, si hay facturas de proveedor y si el IGV entró; y da UN veredicto, `dias_de_caja_confiable` = 28 días de ventas y saldo declarado.
{
  const r = correr(`${ESCENA}
set local session_replication_role = replica;
update retail.ventas set es_prueba = true;
reset session_replication_role;
select retail.fn_flujo_caja_proyeccion(6) as p1 \\gset
insert into retail.ventas (ubicacion_id, created_at) values (:'lim', ((:'hoy'::date - 30)::timestamp + interval '12 hours') at time zone 'America/Lima');
select retail.fn_flujo_caja_proyeccion(6) as p2 \\gset
set local session_replication_role = replica;
update retail.cuentas_dinero set saldo_inicial = 0 where tipo in ('banco', 'caja_fuerte');
reset session_replication_role;
select retail.fn_flujo_caja_proyeccion(6) as p3 \\gset
select (:'p1'::jsonb->>'saldo_inicial_declarado') || '|' || (:'p1'::jsonb->>'dias_de_caja_confiable') || '|' || (:'p1'::jsonb->>'historia_dias');
select (:'p2'::jsonb->>'historia_dias') || '|' || (:'p2'::jsonb->>'dias_de_caja_confiable') || '|' || (:'p2'::jsonb->>'incluye_impuestos');
select (:'p3'::jsonb->>'saldo_inicial_declarado') || '|' || (:'p3'::jsonb->>'dias_de_caja_confiable');`);
  const [c1, c2, c3] = lineas(r);
  esperar("con el BCP declarado (S/ 1,000 de arranque) pero sin ventas, el saldo está declarado y los días de caja NO son confiables (0 días de historia)", r.ok && c1 === "true|false|0", r);
  esperar("con 30 días de historia y el saldo declarado SÍ son confiables, y el IGV entró", r.ok && c2 === "30|true|true", r);
  esperar("sin ningún saldo de arranque declarado, no son confiables aunque haya 30 días de historia", r.ok && c3 === "false|false", r);
}

// 10c. El IGV y el pago a cuenta de renta del mes en curso entran a lo que sale (lo acumulado hasta hoy, el día 15 del mes siguiente). La
// línea de IGV es EXACTAMENTE lo que Impuestos dice que se debe (`a_pagar` del mes, ya neto del crédito y del saldo a favor de la base de
// cada quien), y la de renta, el 1 % de lo vendido sin IGV. Una boleta de S/ 1,180,000 (base 1,000,000, IGV 180,000) asegura que hay algo
// que pagar aunque la base local traiga crédito de antes. Se piden 12 semanas para que el día 15 del mes que viene caiga dentro de la
// ventana sea cual sea el día de hoy.
{
  const r = correr(`${ESCENA}
${COMPROBANTE}
select retail.fn_flujo_caja_proyeccion(12) as antes \\gset
select pg_temp.comp(:'tru', 'boleta', 'B981', 1, 1180000, 'aceptado', 'produccion', :'hoy'::date) as b1 \\gset
select retail.fn_flujo_caja_proyeccion(12) as p \\gset
select pg_temp.salidas(:'p', 'impuesto', 'igv:' || to_char(:'hoy'::date, 'YYYY-MM')) > 0
   and pg_temp.salidas(:'p', 'impuesto', 'igv:' || to_char(:'hoy'::date, 'YYYY-MM')) = (select m.a_pagar from retail.fn_impuestos_igv_meses(date_trunc('month', :'hoy'::date)::date, date_trunc('month', :'hoy'::date)::date) m);
select pg_temp.salidas(:'p', 'impuesto', 'renta:%') - pg_temp.salidas(:'antes', 'impuesto', 'renta:%');
select (select (s->>'fecha')::date from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = 'igv:' || to_char(:'hoy'::date, 'YYYY-MM') limit 1)
     = ((date_trunc('month', :'hoy'::date) + interval '1 month')::date + 14);
select (:'p'::jsonb->>'incluye_impuestos');`);
  const [igv, renta, fecha15, incluye] = lineas(r);
  esperar("la línea de IGV es lo que Impuestos dice que se debe este mes (y es más que cero)", r.ok && igv === "t", r);
  esperar("el pago a cuenta de renta suma el 1 % de lo vendido sin IGV: S/ 10,000 por una boleta de base 1,000,000", r.ok && renta === "10000.00", r);
  esperar("las dos caen el día 15 del mes siguiente", r.ok && fecha15 === "t", r);
  esperar("la proyección dice que incluye los impuestos", r.ok && incluye === "true", r);
}


// 10d. El saldo a favor de IGV con que CAYLA arrancó (ADR-0433, actividad 4b): la proyección dice si está declarado (la web lo lista en «lo que falta»
// mientras no) y, una vez declarado, el IGV que proyecta lo descuenta: con un saldo mayor que el IGV del mes, la línea de IGV desaparece.
{
  const r = correr(`${ESCENA}
${COMPROBANTE}
select pg_temp.comp(:'tru', 'boleta', 'B981', 1, 1180000, 'aceptado', 'produccion', :'hoy'::date) as b1 \\gset
select retail.fn_flujo_caja_proyeccion(12) as sin \\gset
select retail.guardar_parametro_tributario('saldo_favor_igv', date_trunc('month', retail.fn_hoy_lima())::date, 5000000) as _g \\gset
select retail.fn_flujo_caja_proyeccion(12) as con \\gset
select (:'sin'::jsonb->>'saldo_favor_igv_declarado') || '|' || (:'con'::jsonb->>'saldo_favor_igv_declarado');
select pg_temp.salidas(:'sin', 'impuesto', 'igv:' || to_char(:'hoy'::date, 'YYYY-MM')) > 0;
select pg_temp.salidas(:'con', 'impuesto', 'igv:' || to_char(:'hoy'::date, 'YYYY-MM'));
select pg_temp.salidas(:'con', 'impuesto', 'renta:%') = pg_temp.salidas(:'sin', 'impuesto', 'renta:%');`);
  const [flags, haIgv, igvConSaldo, rentaIgual] = lineas(r);
  esperar("sin saldo declarado la base dice false; declarado, true", r.ok && flags === "false|true", r);
  esperar("(control) sin saldo declarado, el IGV de una boleta de S/ 1,180,000 sí entra a lo que sale", r.ok && haIgv === "t", r);
  esperar("con S/ 5,000,000 a favor declarados al empezar el mes, el IGV proyectado desaparece (180,000 − 5,000,000 < 0: no se paga)", r.ok && Number(igvConSaldo) === 0, r);
  esperar("y el pago a cuenta de renta no cambia (el saldo de IGV no lo toca)", r.ok && rentaIgual === "t", r);
}

// 10e. El IGV y la renta del mes ANTERIOR, que vencen ESTE mes (tarea 11 de «Las 36»). Antes la proyección solo miraba el mes en curso: del 1 al 15
// de cada mes no traía lo que estaba por vencer. La línea cae el día 15 o, pasado ese día, mañana; un pago a SUNAT de este mes la baja.
{
  const MES_ANT = `date_trunc('month', :'hoy'::date)::date - 1`;
  const ID_ANT = `to_char((${MES_ANT}), 'YYYY-MM')`;
  const r = correr(`${ESCENA}
${COMPROBANTE}
select retail.fn_flujo_caja_proyeccion(6) as antes \\gset
select pg_temp.comp(:'tru', 'boleta', 'B982', 1, 1180000, 'aceptado', 'produccion', (${MES_ANT})) as b1 \\gset
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select pg_temp.salidas(:'p', 'impuesto', 'igv:' || ${ID_ANT})
     = (select round(m.a_pagar) from retail.fn_impuestos_igv_meses(date_trunc('month', (${MES_ANT}))::date, date_trunc('month', (${MES_ANT}))::date) m)
   and pg_temp.salidas(:'p', 'impuesto', 'igv:' || ${ID_ANT}) > 0;
select pg_temp.salidas(:'p', 'impuesto', 'renta:' || ${ID_ANT}) - pg_temp.salidas(:'antes', 'impuesto', 'renta:' || ${ID_ANT});
select (select (s->>'fecha')::date from jsonb_array_elements(:'p'::jsonb->'salidas') s where s->>'id' = 'igv:' || ${ID_ANT})
     = greatest(date_trunc('month', :'hoy'::date)::date + 14, :'hoy'::date + 1);
select retail.registrar_movimiento_dinero('pago_sunat', 500, :'bcp', null, null, 'IGV de prueba tarea 11') as m1 \\gset
select retail.fn_flujo_caja_proyeccion(6) as tras_pago \\gset
select pg_temp.salidas(:'p', 'impuesto', 'igv:' || ${ID_ANT}) - pg_temp.salidas(:'tras_pago', 'impuesto', 'igv:' || ${ID_ANT});`);
  const [igv, renta, fecha, baja] = lineas(r);
  esperar("el IGV del mes anterior sale en la proyección, con lo que dice Impuestos en soles enteros (20261113220000)", r.ok && igv === "t", r);
  esperar("el pago a cuenta de renta del mes anterior suma el 1 % de lo vendido sin IGV: S/ 10,000", r.ok && Number(renta) === 10000, r);
  esperar("cae el día 15 de este mes o, si ya pasó, mañana: nunca fuera de lo que viene", r.ok && fecha === "t", r);
  esperar("un pago a SUNAT de S/ 500 hecho este mes baja la línea en S/ 500", r.ok && Number(baja) === 500, r);
}

// 10f. El mes anterior ya pagado completo no vuelve a salir, ni el IGV ni la renta.
{
  const MES_ANT = `date_trunc('month', :'hoy'::date)::date - 1`;
  const ID_ANT = `to_char((${MES_ANT}), 'YYYY-MM')`;
  const r = correr(`${ESCENA}
${COMPROBANTE}
select pg_temp.comp(:'tru', 'boleta', 'B983', 1, 11800, 'aceptado', 'produccion', (${MES_ANT})) as b1 \\gset
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select pg_temp.salidas(:'p', 'impuesto', 'igv:' || ${ID_ANT}) + pg_temp.salidas(:'p', 'impuesto', 'renta:' || ${ID_ANT}) as total \\gset
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, referencia)
values ('pago_sunat', :'hoy'::date, :'bcp', :'total'::numeric, 'Pago completo de prueba tarea 11');
select retail.fn_flujo_caja_proyeccion(6) as tras_pago \\gset
select pg_temp.salidas(:'tras_pago', 'impuesto', 'igv:' || ${ID_ANT}) + pg_temp.salidas(:'tras_pago', 'impuesto', 'renta:' || ${ID_ANT});`);
  const [resto] = lineas(r);
  esperar("con todo pagado este mes, el mes anterior ya no sale en lo que viene", r.ok && Number(resto) === 0, r);
}

// 10g. SUNAT cobra en soles enteros (20261113220000). El caso real de octubre de 2026: venta sin IGV S/ 112,307.93, 1 % = S/ 1,123.08, y la constancia de
// SUNAT y el banco dicen S/ 1,123. Antes, con el pago registrado, la proyección dejaba «Pago a cuenta de renta · S/ 0.08», atrasada desde el día 23.
{
  const MES_ANT = `date_trunc('month', :'hoy'::date)::date - 1`;
  const PRIMERO_ANT = `date_trunc('month', (${MES_ANT}))::date`;
  const ID_ANT = `to_char((${MES_ANT}), 'YYYY-MM')`;
  const r = correr(`${ESCENA}
${COMPROBANTE}
select coalesce((select m.base_ventas from retail.fn_impuestos_igv_meses(${PRIMERO_ANT}, ${PRIMERO_ANT}) m where m.mes = ${PRIMERO_ANT}), 0) as base0 \\gset
select round((112307.93 - mod(:'base0'::numeric, 100)) * 1.18, 2) as total \\gset
select pg_temp.comp(:'tru', 'boleta', 'B984', 1, :'total'::numeric, 'aceptado', 'produccion', (${MES_ANT})) as b1 \\gset
select m.base_ventas as base, m.a_pagar as igv_centimos from retail.fn_impuestos_igv_meses(${PRIMERO_ANT}, ${PRIMERO_ANT}) m where m.mes = ${PRIMERO_ANT} \\gset
select round(round(:'base'::numeric) * 0.01) as cobra_sunat \\gset
select retail.fn_flujo_caja_proyeccion(6) as p \\gset
select pg_temp.salidas(:'p', 'impuesto', 'renta:' || ${ID_ANT}) as renta \\gset
select pg_temp.salidas(:'p', 'impuesto', 'igv:' || ${ID_ANT}) as igv \\gset
select mod(:'base'::numeric, 100) = 7.93 and round(:'base'::numeric * 0.01, 2) - :'cobra_sunat'::numeric = 0.08;
select :'renta'::numeric = :'cobra_sunat'::numeric and :'renta'::numeric > 0;
select :'igv'::numeric = round(:'igv_centimos'::numeric);
select :'renta'::numeric = (retail.fn_impuestos_panel(${PRIMERO_ANT}) -> 'renta' ->> 'monto')::numeric;
select retail.registrar_pago_sunat(:'bcp', :'hoy'::date, jsonb_build_array(jsonb_build_object('mes', ${PRIMERO_ANT}, 'concepto', 'renta', 'monto', :'cobra_sunat'::numeric)), 'Renta de prueba 10g') as m1 \\gset
select retail.fn_flujo_caja_proyeccion(6) as tras_pago \\gset
select pg_temp.salidas(:'tras_pago', 'impuesto', 'renta:' || ${ID_ANT});
select (select count(*) from jsonb_array_elements(:'tras_pago'::jsonb -> 'salidas') s where s ->> 'id' = 'renta:' || ${ID_ANT});
select retail.fn_redondeo_sunat(1123.08), retail.fn_redondeo_sunat(446.87), retail.fn_redondeo_sunat(9230.49), retail.fn_redondeo_sunat(9230.50), retail.fn_renta_a_cuenta(112307.93, 0.01), retail.fn_renta_a_cuenta(99.60, 0.015);
select has_function_privilege('anon', 'retail.fn_redondeo_sunat(numeric)', 'execute') or has_function_privilege('authenticated', 'retail.fn_redondeo_sunat(numeric)', 'execute')
    or has_function_privilege('anon', 'retail.fn_renta_a_cuenta(numeric, numeric)', 'execute') or has_function_privilege('authenticated', 'retail.fn_renta_a_cuenta(numeric, numeric)', 'execute');`);
  const [conCentimos, rentaEntera, igvEntero, igualAlPanel, resto, filas, regla, abierta] = lineas(r);
  esperar("la escena es la de octubre: la venta sin IGV termina en 7.93 y el 1 % al céntimo deja 8 céntimos sobre lo que cobra SUNAT (si no, este caso no prueba nada)", r.ok && conCentimos === "t", r);
  esperar("la renta del mes anterior sale como la cobra SUNAT: la base en soles enteros por el 1 %, en soles enteros", r.ok && rentaEntera === "t", r);
  esperar("el IGV del mes anterior sale en soles enteros", r.ok && igvEntero === "t", r);
  esperar("y es la misma renta que dice Impuestos: una sola regla para las dos pantallas", r.ok && igualAlPanel === "t", r);
  esperar("pagado lo que cobra SUNAT (no lo que diga la proyección), no queda ni un céntimo por salir", r.ok && Number(resto) === 0, r);
  esperar("y la línea desaparece de lo que viene: no queda un «S/ 0» que desde el día 23 saldría atrasado", r.ok && Number(filas) === 0, r);
  esperar("la regla: 1,123.08 → 1,123 · 446.87 → 447 · 9,230.49 → 9,230 · 9,230.50 → 9,231; el 1 % de 112,307.93 es 1,123; el 1.5 % de 99.60 es 2 (100 × 1.5 %), como el formulario", r.ok && regla === "1123|447|9230|9231|1123|2", r);
  esperar("las dos funciones nuevas no se llaman desde afuera", r.ok && abierta === "f", r);
}


// 11. El pago de la planilla y el pago a SUNAT (20261016002000, ADR-0417 situaciones 15 y 16) son SALIDAS del Flujo real, cada una en su categoría
// («planilla», «impuestos»), y no cambian lo que sale en un «día normal» de la proyección (la planilla ya se suma aparte; un pago a SUNAT cae un día).
{
  const r = correr(`${ESCENA}
select ${REAL} as antes \\gset
select retail.fn_flujo_caja_proyeccion(6) as p_antes \\gset
select retail.registrar_movimiento_dinero('pago_planilla', 1000, :'bcp', null, null, 'Planilla de prueba F6') as m1 \\gset
select retail.registrar_movimiento_dinero('pago_sunat', 500, :'bcp', null, null, 'IGV de prueba F6') as m2 \\gset
select ${REAL} as despues \\gset
select retail.fn_flujo_caja_proyeccion(6) as p_despues \\gset
select pg_temp.cuadra(:'despues');
select pg_temp.cat(:'despues', 'planilla') - pg_temp.cat(:'antes', 'planilla'), pg_temp.cat(:'despues', 'impuestos') - pg_temp.cat(:'antes', 'impuestos');
select pg_temp.num(:'despues', 'salio') - pg_temp.num(:'antes', 'salio'), pg_temp.num(:'despues', 'entro') - pg_temp.num(:'antes', 'entro');
select pg_temp.num(:'p_despues', 'salidas_diarias') = pg_temp.num(:'p_antes', 'salidas_diarias');`);
  const [cuadra, cats, lados, diarias] = lineas(r);
  esperar("con los dos pagos, el flujo cuadra", r.ok && cuadra === "t", r);
  esperar("la planilla pagada es una salida de S/ 1,000 en «planilla» y el pago a SUNAT una de S/ 500 en «impuestos»", r.ok && cats.split("|").map(Number).join(",") === "1000,500", r);
  esperar("salió +1,500 y lo que entró no cambia (antes caían en «entre cuentas» y no se contaban)", r.ok && lados.split("|").map(Number).join(",") === "1500,0", r);
  esperar("lo que sale en un día normal no se mueve por esos pagos (no se cuenta dos veces la planilla)", r.ok && diarias === "t", r);
}

// 12. Lo que falta del mes (tarea 24 de «Las 36»): los fijos sin gasto de este mes, sin IGV y sin la parte de CLAURE. Solo los de la sede que se ve.
{
  const r = correr(`${ESCENA}
select codigo as cat from retail.categorias_gasto limit 1 \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
update retail.empresas set cuenta_corriente_desde = :'hoy'::date - 60, activo = true where id = :'claure';
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'lim') on conflict do nothing;
delete from retail.empresa_sedes where empresa_id = :'claure' and ubicacion_id = :'tru';
insert into retail.gasto_reparto_claure (categoria, pct_claure) values (:'cat', 50) on conflict (categoria) do update set pct_claure = 50;
update retail.gastos_fijos set activo = false;
insert into retail.gastos_fijos (ubicacion_id, categoria, descripcion, comprobante_tipo, monto, dia_del_mes) values
  (:'tru', :'cat', 'Fijo con factura prueba', 'factura', 1180, 20),
  (:'lim', :'cat', 'Fijo con CLAURE prueba', 'boleta', 1000, 20);
select coalesce(sum(fijos), 0) from retail.fn_lo_que_falta_del_mes(:'hoy'::date) where ubicacion_id = :'tru';
select coalesce(sum(fijos), 0) from retail.fn_lo_que_falta_del_mes(:'hoy'::date) where ubicacion_id = :'lim';
${cambiaA(MICAELA)}
select pg_temp.intento($q$select * from retail.fn_lo_que_falta_del_mes(retail.fn_hoy_lima())$q$);`);
  const [tru, lim, micaela] = lineas(r);
  esperar("un fijo con factura de S/ 1,180 cuenta S/ 1,000: sin IGV, como el Estado de resultados", r.ok && Number(tru) === 1000, r);
  esperar("de un fijo de S/ 1,000 en la sede de CLAURE con 50 % de reparto, cuenta la mitad", r.ok && Number(lim) === 500, r);
  esperar("quien no ve el Estado de resultados no lo lee", r.ok && /Reportes financieros/.test(micaela ?? ""), r);
}

// 13. Lo que solo cambia de lugar y lo que se deshace (tarea 36 de «Las 36»): `fn_flujo_disponible` es el saldo total que cada pantalla repite. Mover plata
// entre bancos no lo cambia, y anular un movimiento o un gasto deja el total EXACTO de antes, céntimo por céntimo.
{
  const r = correr(`${ESCENA}
select retail.crear_cuenta_dinero('Interbank prueba F6', 'banco', 500, retail.fn_hoy_lima() - 20) as ibk \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d0 \\gset
select retail.registrar_movimiento_dinero('entre_cuentas', 300, :'bcp', :'ibk') as m1 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d1 \\gset
select :'d1'::numeric - :'d0'::numeric;
select retail.anular_movimiento_dinero(:'m1', 'Prueba: se registró mal') as _a1 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d2 \\gset
select :'d2'::numeric - :'d0'::numeric;
select retail.registrar_movimiento_dinero('pago_sunat', 120.55, :'bcp', null, null, 'Prueba') as m2 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d3 \\gset
select :'d3'::numeric - :'d0'::numeric;
select retail.anular_movimiento_dinero(:'m2', 'Prueba: se registró mal') as _a2 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d4 \\gset
select :'d4'::numeric - :'d0'::numeric;
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio de prueba', :'hoy'::date, 77.10, p_medio_pago => 'transferencia', p_cuenta_id => :'bcp') as g1 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d5 \\gset
select :'d5'::numeric - :'d0'::numeric;
select retail.anular_gasto(:'g1', 'Prueba: se registró mal') as _a3 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d6 \\gset
select :'d6'::numeric - :'d0'::numeric;
select pg_temp.cuadra(${REAL});
select set_config('request.headers', '{"x-responsable-omitido": "fondo_entregar"}', true) \\g /dev/null
select c.persona_id as persona from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' limit 1 \\gset
select retail.entregar_fondo(:'persona', :'bcp', 100, 'Fondo de prueba', null, null) as e1 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as d7 \\gset
select :'d7'::numeric - :'d0'::numeric;`);
  const [entre, anEntre, sunat, anSunat, gasto, anGasto, cuadra, fondo] = lineas(r);
  esperar("mover S/ 300 entre dos bancos no cambia el disponible", r.ok && Number(entre) === 0, r);
  esperar("anularlo tampoco", r.ok && Number(anEntre) === 0, r);
  esperar("un pago a SUNAT de S/ 120.55 baja el disponible en S/ 120.55", r.ok && Number(sunat) === -120.55, r);
  esperar("anularlo lo devuelve exacto", r.ok && Number(anSunat) === 0, r);
  esperar("un gasto de S/ 77.10 por banco baja el disponible en S/ 77.10", r.ok && Number(gasto) === -77.1, r);
  esperar("anular ese gasto lo devuelve exacto", r.ok && Number(anGasto) === 0, r);
  esperar("después de todo eso, el flujo sigue cuadrando", r.ok && cuadra === "t", r);
  esperar("entregar un fondo de S/ 100 no cambia el disponible: sigue siendo plata de CAYLA, en otras manos", r.ok && Number(fondo) === 0, r);
}

console.log(`\n${casos - fallos}/${casos} casos en verde.`);
if (fallos) {
  console.error(`${fallos} caso(s) fallaron.`);
  process.exit(1);
}

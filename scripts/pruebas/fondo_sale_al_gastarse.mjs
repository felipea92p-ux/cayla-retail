#!/usr/bin/env node
/**
 * Prueba de ADR-0621, decisión 1 — lo gastado del fondo de compras deja de ser plata el día que se gasta
 * (`20261107165000_fondo_de_compras_sale_al_gastarse.sql`).
 *
 * QUÉ CUBRE
 *   · entregar el fondo no cambia el disponible (sigue siendo plata de CAYLA, en otras manos), pero sí lo «por volver»;
 *   · un papel «por completar» con lo pagado y un gasto del viaje bajan el disponible EL DÍA DEL PAPEL, no antes;
 *   · la cuenta del fondo en Cuentas y dinero dice lo que queda en la mano;
 *   · el Flujo cuadra (descuadre 0) y los cuenta como mercadería y gastos;
 *   · la proyección parte sin lo por volver (`saldo_hoy` = disponible − Claudia − por volver) y lo dice en `por_volver_compras`;
 *   · al completar el papel (como `completar_papel_compra`: compra + pago del fondo con la fecha del papel) nada se mueve:
 *     ni el disponible, ni la mercadería del Flujo, ni el saldo del fondo (sin doble conteo); anularlo lo devuelve;
 *   · gastar de más deja el fondo en negativo, pero «por volver» nunca baja de 0;
 *   · «Mi fondo» (el combo «Sale de») dice lo mismo que Cuentas y dinero;
 *   · las piezas internas no se llaman desde afuera y siguen STABLE.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`, como `flujo_caja.mjs`.
 * La migración se vuelve a correr dentro de la transacción (es idempotente: en el CI ya está y se salta), así la prueba
 * también sirve contra una base que todavía no la tiene. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:fondo-sale-al-gastarse              → contra `supabase_db_cayla-retail`
 *   RETAIL_CONTENEDOR_PG=<contenedor> pnpm pruebas:fondo-sale-al-gastarse
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // la compradora de la prueba
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261107165000_fondo_de_compras_sale_al_gastarse.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
const lineas = (r) => (r.ok ? r.salida.split("\n").filter((l) => l !== "") : []);
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

/** Un BCP con S/ 2,000 desde hace 20 días; el fondo de Micaela recibe S/ 500 hace 5 días. Deja `:hoy`, `:bcp`, `:persona`,
 *  `:fondo`, `:prov` y las cifras de antes de todo gasto: `:d0` (disponible hoy), `:v0` (por volver hoy). */
const ESCENA = `
begin;
${MIGRACION}
create function pg_temp.cuadra(j jsonb) returns boolean language sql as $f$
  select round((j->>'saldo_inicial')::numeric + (j->>'entro')::numeric - (j->>'salio')::numeric + (j->>'ajustes')::numeric, 2)
           = round((j->>'saldo_final')::numeric, 2)
     and (j->>'descuadre')::numeric = 0;
$f$;
create function pg_temp.cat(j jsonb, k text) returns numeric language sql as $f$
  select coalesce((select (e->>'monto')::numeric from jsonb_array_elements(j->'categorias') e where e->>'clave' = k), 0);
$f$;
create function pg_temp.saldo_fondo(p_cuenta uuid, p_corte date) returns numeric language sql as $f$
  select s.saldo from retail.fn_cuentas_dinero_saldos(p_corte, null) s where s.id = p_cuenta;
$f$;
${cambiaA(FELIPE)}
select retail.fn_hoy_lima() as hoy \\gset
select retail.crear_cuenta_dinero('BCP prueba fondo', 'banco', 2000, retail.fn_hoy_lima() - 20) as bcp \\gset
select c.persona_id as persona from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' limit 1 \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select retail.fn_flujo_disponible(:'hoy'::date) as antes_entrega \\gset
select retail.fn_flujo_por_volver(:'hoy'::date) as antes_por_volver \\gset
select set_config('request.headers', '{"x-responsable-omitido": "fondo_entregar"}', true) \\g /dev/null
select retail.entregar_fondo(:'persona', :'bcp', 500, 'Fondo de prueba', :'hoy'::date - 5, null) as _e \\gset
select set_config('request.headers', '{}', true) \\g /dev/null
select retail.fn_fondo_de(:'persona', false) as fondo \\gset
-- Sin una ronda de compras abierta la base no deja anotar (fn_compra_en_su_ronda).
insert into retail.compra_rondas (persona_id, abierta_por)
select :'persona', :'persona' where not exists (select 1 from retail.compra_rondas r where r.persona_id = :'persona' and r.cerrada_en is null);
select retail.fn_flujo_disponible(:'hoy'::date) as d0 \\gset
select retail.fn_flujo_por_volver(:'hoy'::date) as v0 \\gset
select retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date) as r0 \\gset
`;

/** Lo que gasta: un papel por S/ 200 pagado entero hace 3 días y un taxi de S/ 15 hace 2 días, los dos por completar. */
const GASTA = `
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, medio_pago, fecha, estado, huella, registrado_por)
values (gen_random_uuid(), :'persona', :'prov', 'nota_venta', 200, 200, 'efectivo', :'hoy'::date - 3, 'por_completar', md5(random()::text), :'persona')
returning id as papel \\gset
insert into retail.compra_gastos (id, persona_id, concepto, monto, fecha, estado, huella, registrado_por)
values (gen_random_uuid(), :'persona', 'taxi', 15, :'hoy'::date - 2, 'por_completar', md5(random()::text), :'persona')
returning id as cgasto \\gset
`;

/** Completar el papel como lo hace `completar_papel_compra`: la compra y el pago del fondo, con la fecha del papel, en la misma
 *  transacción en que el papel pasa a «completado». */
const COMPLETA = `
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, nota, token_cliente, naturaleza, ubicacion_gestion_id)
values (:'prov', 'nota_venta', 'NV', 'PRUEBA-FONDO', :'hoy'::date - 3, 'contado', 200, 0, 200, 'Prueba ADR-0621', :'papel', 'mercaderia',
        (select u.id from retail.ubicaciones u where u.nombre = 'Tienda Trujillo'))
returning id as compra \\gset
select set_config('retail.papel_paga_de', :'fondo', true) \\g /dev/null
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, ubicacion_id, cuenta_dinero_id)
values (:'compra', :'hoy'::date - 3, 200, 'efectivo', 'Plata para compras', null, :'fondo');
select set_config('retail.papel_paga_de', '', true) \\g /dev/null
update retail.compra_papeles set estado = 'completado' where id = :'papel';
`;

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

// 1. Entregar y gastar.
{
  const r = correr(`${ESCENA}
select :'d0'::numeric - :'antes_entrega'::numeric;
select :'v0'::numeric - :'antes_por_volver'::numeric;
select retail.fn_flujo_disponible(:'hoy'::date - 4) as a4 \\gset
select retail.fn_flujo_disponible(:'hoy'::date - 3) as a3 \\gset
${GASTA}
select retail.fn_flujo_disponible(:'hoy'::date) - :'d0'::numeric;
select retail.fn_flujo_disponible(:'hoy'::date - 4) - :'a4'::numeric;
select retail.fn_flujo_disponible(:'hoy'::date - 3) - :'a3'::numeric;
select pg_temp.saldo_fondo(:'fondo', :'hoy'::date);
select pg_temp.saldo_fondo(:'fondo', :'hoy'::date - 4);
select retail.fn_flujo_por_volver(:'hoy'::date) - :'antes_por_volver'::numeric;
select pg_temp.cuadra(retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date));
select pg_temp.cat(retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date), 'mercaderia') - pg_temp.cat(:'r0'::jsonb, 'mercaderia');
select pg_temp.cat(retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date), 'gastos') - pg_temp.cat(:'r0'::jsonb, 'gastos');
select (retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date)->>'por_volver_compras')::numeric = retail.fn_flujo_por_volver(:'hoy'::date);
select ((p->>'saldo_hoy')::numeric = retail.fn_flujo_disponible(:'hoy'::date) - (p->>'de_claudia')::numeric - retail.fn_flujo_por_volver(:'hoy'::date))
       and (p->>'por_volver_compras')::numeric = retail.fn_flujo_por_volver(:'hoy'::date)
  from (select retail.fn_flujo_caja_proyeccion(6) p) x;
select pg_temp.saldo_fondo(:'fondo', :'hoy'::date) as en_cuentas \\gset
select set_config('request.jwt.claim.sub', '${MICAELA}', true) \\g /dev/null
select (select m.saldo from retail.fn_mi_fondo() m) = :'en_cuentas'::numeric;`);
  const [entrega, volverEntrega, gasto, antesDelPapel, elDiaDelPapel, fondoHoy, fondoAntes, volver, cuadra, merca, gastos, realDice, proy, miFondo] = lineas(r);
  esperar("entregar S/ 500 no cambia el disponible", r.ok && Number(entrega) === 0, r);
  esperar("pero suma S/ 500 a lo por volver de compras", r.ok && Number(volverEntrega) === 500, r);
  esperar("el papel (S/ 200) y el taxi (S/ 15) por completar bajan el disponible en S/ 215", r.ok && Number(gasto) === -215, r);
  esperar("el día antes del papel nada cambió", r.ok && Number(antesDelPapel) === 0, r);
  esperar("el día del papel baja solo el papel (el taxi es del día siguiente)", r.ok && Number(elDiaDelPapel) === -200, r);
  esperar("Cuentas y dinero: el fondo dice S/ 285 en la mano", r.ok && Number(fondoHoy) === 285, r);
  esperar("y antes del primer gasto decía S/ 500", r.ok && Number(fondoAntes) === 500, r);
  esperar("lo por volver es lo que queda: S/ 285", r.ok && Number(volver) === 285, r);
  esperar("el Flujo sigue cuadrando, con el gasto adentro", r.ok && cuadra === "t", r);
  esperar("el papel sale como mercadería (S/ 200)", r.ok && Number(merca) === 200, r);
  esperar("el taxi sale como gastos (S/ 15)", r.ok && Number(gastos) === 15, r);
  esperar("el Flujo real dice cuánto está por volver", r.ok && realDice === "t", r);
  esperar("la proyección parte sin lo de Claudia ni lo por volver, y lo dice", r.ok && proy === "t", r);
  esperar("«Mi fondo» del combo «Sale de» dice lo mismo que Cuentas y dinero", r.ok && miFondo === "t", r);
}

// 2. Completar el papel no lo cuenta dos veces; anularlo lo devuelve.
{
  const r = correr(`${ESCENA}
${GASTA}
select retail.fn_flujo_disponible(:'hoy'::date) as d1 \\gset
select retail.fn_flujo_disponible(:'hoy'::date - 3) as d1_3 \\gset
select retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date) as r1 \\gset
${COMPLETA}
select retail.fn_flujo_disponible(:'hoy'::date) - :'d1'::numeric;
select retail.fn_flujo_disponible(:'hoy'::date - 3) - :'d1_3'::numeric;
select pg_temp.saldo_fondo(:'fondo', :'hoy'::date);
select pg_temp.cat(retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date), 'mercaderia') - pg_temp.cat(:'r1'::jsonb, 'mercaderia');
select pg_temp.cuadra(retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date));
select retail.fn_mi_plata_tiene(:'persona') = pg_temp.saldo_fondo(:'fondo', :'hoy'::date);
update retail.compra_gastos set estado = 'anulado' where id = :'cgasto';
select retail.fn_flujo_disponible(:'hoy'::date) - :'d1'::numeric;`);
  const [completo, elDia, fondo, merca, cuadra, igualAComprasDice, anulado] = lineas(r);
  esperar("completar el papel no mueve el disponible", r.ok && Number(completo) === 0, r);
  esperar("y lo sigue restando el día del papel", r.ok && Number(elDia) === 0, r);
  esperar("el fondo sigue en S/ 285", r.ok && Number(fondo) === 285, r);
  esperar("la mercadería del Flujo no se duplica", r.ok && Number(merca) === 0, r);
  esperar("y el Flujo sigue cuadrando", r.ok && cuadra === "t", r);
  esperar("Cuentas y dinero dice lo mismo que «En la mano» de Revisar compras", r.ok && igualAComprasDice === "t", r);
  esperar("anular el taxi devuelve sus S/ 15", r.ok && Number(anulado) === 15, r);
}

// 3. Gastar de más: el fondo queda en negativo (CAYLA le debe), lo por volver no baja de 0.
{
  const r = correr(`${ESCENA}
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, medio_pago, fecha, estado, huella, registrado_por)
values (gen_random_uuid(), :'persona', :'prov', 'nota_venta', 650, 650, 'efectivo', :'hoy'::date - 1, 'por_completar', md5(random()::text), :'persona');
select pg_temp.saldo_fondo(:'fondo', :'hoy'::date);
select retail.fn_flujo_por_volver(:'hoy'::date) - :'antes_por_volver'::numeric;
select retail.fn_flujo_disponible(:'hoy'::date) - :'d0'::numeric;
select pg_temp.cuadra(retail.fn_flujo_caja_real(:'hoy'::date - 6, :'hoy'::date));`);
  const [fondo, volver, disp, cuadra] = lineas(r);
  esperar("gastó S/ 650 de S/ 500: el fondo dice −S/ 150", r.ok && Number(fondo) === -150, r);
  esperar("y no queda nada por volver de ella", r.ok && Number(volver) === 0, r);
  esperar("el disponible baja los S/ 650 gastados", r.ok && Number(disp) === -650, r);
  esperar("el Flujo cuadra", r.ok && cuadra === "t", r);
}

// 4. Las piezas internas: nadie las llama desde afuera y no guardan nada.
{
  const r = correr(`begin;
${MIGRACION}
select has_function_privilege('authenticated', 'retail.fn_fondo_por_completar(date)', 'execute');
select has_function_privilege('authenticated', 'retail.fn_flujo_por_volver(date)', 'execute');
select string_agg(p.proname || ':' || p.provolatile::text, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_fondo_por_completar', 'fn_flujo_por_volver', 'fn_cuentas_dinero_saldos', 'fn_flujo_lineas', 'fn_mi_fondo');`);
  const [porCompletar, porVolver, volatilidad] = lineas(r);
  esperar("fn_fondo_por_completar no se llama desde afuera", r.ok && porCompletar === "f", r);
  esperar("fn_flujo_por_volver no se llama desde afuera", r.ok && porVolver === "f", r);
  esperar("las cinco funciones siguen STABLE", r.ok && volatilidad === "fn_cuentas_dinero_saldos:s,fn_flujo_lineas:s,fn_flujo_por_volver:s,fn_fondo_por_completar:s,fn_mi_fondo:s", r);
}

console.log(`\n${casos - fallos}/${casos} casos en verde.`);
if (fallos) {
  console.error(`${fallos} caso(s) fallaron.`);
  process.exit(1);
}

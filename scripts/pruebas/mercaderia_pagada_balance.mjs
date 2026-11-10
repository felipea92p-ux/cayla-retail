#!/usr/bin/env node
/**
 * Prueba de ADR-0636, actividad 1 — «Mercadería pagada» en el Balance
 * (`20261109231000_mercaderia_pagada_en_el_balance.sql`).
 *
 * QUÉ CUBRE
 *   · sin papeles, el Balance no trae las líneas nuevas y la 1413 dice lo entregado;
 *   · un papel pagado «por completar» baja la 1413 y aparece como `mercaderia_pagada` por el mismo total: el activo NO cambia;
 *   · solo la factura separa IGV (`mercaderia_pagada_igv`), con la misma cuenta que `completar_papel_compra`;
 *   · el gasto del viaje por completar no entra a la línea (es gasto, no mercadería);
 *   · el día antes del papel el Balance no lo ve;
 *   · al completar el papel (compra + pago del fondo con la fecha del papel) la línea baja, sube la 201 y el activo sigue igual:
 *     nada se cuenta dos veces ni cero veces;
 *   · el detalle dice cuántos papeles y cuánto está en camino;
 *   · la pieza interna no se llama desde afuera y sigue STABLE.
 *   NO CUBRE: «en la tienda» con envíos reales (pide órdenes y despachos); se comprobó leyendo producción (ver la bitácora).
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK, sesión simulada, como `fondo_sale_al_gastarse.mjs`. Las dos migraciones
 * se vuelven a correr dentro de la transacción (son idempotentes). Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:mercaderia-pagada-balance
 *   RETAIL_CONTENEDOR_PG=<contenedor> pnpm pruebas:mercaderia-pagada-balance
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // la compradora de la prueba
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = `${leer("20261107165000_fondo_de_compras_sale_al_gastarse.sql")}\n${leer("20261109231000_mercaderia_pagada_en_el_balance.sql")}`;

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

/** Un banco con S/ 2,000, el arranque del Balance hace 10 días y un fondo de S/ 500 entregado hace 5. */
const ESCENA = `
begin;
${MIGRACIONES}
create function pg_temp.linea(p_cuenta text, p_corte date) returns numeric language sql as $f$
  select coalesce((select b.monto from retail.fn_balance_general(p_corte) b where b.cuenta = p_cuenta), 0);
$f$;
create function pg_temp.activo(p_corte date) returns numeric language sql as $f$
  select coalesce(sum(b.monto), 0) from retail.fn_balance_general(p_corte) b where b.seccion = 'activo';
$f$;
${cambiaA(FELIPE)}
select retail.fn_hoy_lima() as hoy \\gset
select retail.crear_cuenta_dinero('BCP prueba mercaderia pagada', 'banco', 2000, retail.fn_hoy_lima() - 20) as bcp \\gset
select c.persona_id as persona from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' limit 1 \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select set_config('request.headers', '{"x-responsable-omitido": "fondo_entregar"}', true) \\g /dev/null
select retail.entregar_fondo(:'persona', :'bcp', 500, 'Fondo de prueba', :'hoy'::date - 5, null) as _e \\gset
select set_config('request.headers', '{}', true) \\g /dev/null
select retail.fn_fondo_de(:'persona', false) as fondo \\gset
insert into retail.compra_rondas (persona_id, abierta_por)
select :'persona', :'persona' where not exists (select 1 from retail.compra_rondas r where r.persona_id = :'persona' and r.cerrada_en is null);
-- El arranque, si esta base todavía no tiene: lo que el sistema propone para ese día, cuadrado contra el capital.
select coalesce(retail.fn_fecha_de_arranque(), :'hoy'::date - 10) as arr \\gset
select case when retail.fn_fecha_de_arranque() is null then (
  select retail.registrar_saldo_inicial(:'arr'::date, jsonb_build_array(
    jsonb_build_object('cuenta', '104', 'monto', 2000), jsonb_build_object('cuenta', '50', 'monto', 2000)))) end as _a \\gset
select pg_temp.activo(:'hoy'::date) as activo0 \\gset
select pg_temp.linea('1413', :'hoy'::date) as fondo0 \\gset
select pg_temp.linea('201', :'hoy'::date) as merca0 \\gset
`;

/** Una nota de venta de S/ 200 y una factura de S/ 236 (S/ 200 + IGV), pagadas enteras hace 3 días; un taxi de S/ 15 hace 2. */
const GASTA = `
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, medio_pago, fecha, estado, huella, registrado_por)
values (gen_random_uuid(), :'persona', :'prov', 'nota_venta', 200, 200, 'efectivo', :'hoy'::date - 3, 'por_completar', md5(random()::text), :'persona')
returning id as nota \\gset
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, pagado, medio_pago, fecha, estado, huella, registrado_por, serie, numero)
values (gen_random_uuid(), :'persona', :'prov', 'factura', 236, 236, 'efectivo', :'hoy'::date - 3, 'por_completar', md5(random()::text), :'persona', 'F001', 'PRUEBA-0636')
returning id as factura \\gset
insert into retail.compra_gastos (id, persona_id, concepto, monto, fecha, estado, huella, registrado_por)
values (gen_random_uuid(), :'persona', 'taxi', 15, :'hoy'::date - 2, 'por_completar', md5(random()::text), :'persona');
`;

/** Completar la factura como lo hace `completar_papel_compra`: la compra y el pago del fondo, con la fecha del papel. */
const COMPLETA = `
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, nota, token_cliente, naturaleza, ubicacion_gestion_id)
values (:'prov', 'factura', 'F001', 'PRUEBA-0636', :'hoy'::date - 3, 'contado', 200, 36, 236, 'Prueba ADR-0636', :'factura', 'mercaderia',
        (select u.id from retail.ubicaciones u where u.nombre = 'Tienda Trujillo'))
returning id as compra \\gset
select set_config('retail.papel_paga_de', :'fondo', true) \\g /dev/null
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, ubicacion_id, cuenta_dinero_id)
values (:'compra', :'hoy'::date - 3, 236, 'efectivo', 'Plata para compras', null, :'fondo');
select set_config('retail.papel_paga_de', '', true) \\g /dev/null
update retail.compra_papeles set estado = 'completado' where id = :'factura';
`;

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

// 1. Pagar: la plata cambia de casillero y el activo no cambia.
{
  const r = correr(`${ESCENA}
select (select count(*) from retail.fn_balance_general(:'hoy'::date) b where b.cuenta like 'mercaderia_pagada%');
${GASTA}
select pg_temp.linea('1413', :'hoy'::date) - :'fondo0'::numeric;
select pg_temp.linea('mercaderia_pagada', :'hoy'::date);
select pg_temp.linea('mercaderia_pagada_igv', :'hoy'::date);
select pg_temp.activo(:'hoy'::date) - :'activo0'::numeric;
select pg_temp.linea('201', :'hoy'::date) - :'merca0'::numeric;
select pg_temp.linea('mercaderia_pagada', :'hoy'::date - 4), pg_temp.linea('1413', :'hoy'::date - 4) - :'fondo0'::numeric;
select b.detalle->>'papeles', b.detalle->>'en_camino', b.detalle->>'en_tienda' from retail.fn_balance_general(:'hoy'::date) b where b.cuenta = 'mercaderia_pagada';
select b.seccion, b.orden = (select k.orden from retail.cuentas k where k.codigo = '201') from retail.fn_balance_general(:'hoy'::date) b where b.cuenta = 'mercaderia_pagada';`);
  const [sinPapeles, fondo, base, igv, activo, merca, antes, detalle, lugar] = lineas(r);
  esperar("sin papeles el Balance no trae las líneas nuevas", r.ok && Number(sinPapeles) === 0, r);
  esperar("dos papeles (S/ 200 + S/ 236) bajan la 1413 en S/ 436; el taxi no", r.ok && Number(fondo) === -436, r);
  esperar("«Mercadería pagada» dice la base: S/ 400", r.ok && Number(base) === 400, r);
  esperar("y el IGV de la factura va aparte: S/ 36", r.ok && Number(igv) === 36, r);
  esperar("el total del activo no cambia", r.ok && Number(activo) === 0, r);
  esperar("la 201 todavía no se mueve (el papel no entró al libro)", r.ok && Number(merca) === 0, r);
  esperar("el día antes del papel el Balance no lo ve", r.ok && (antes ?? "").split("|").every((x) => Number(x) === 0), r);
  esperar("el detalle: 2 papeles, S/ 400 en camino, nada en la tienda", r.ok && (detalle ?? "").split("|").map(Number).join("|") === "2|400|0", r);
  esperar("va en el activo, junto a la 201", r.ok && lugar === "activo|t", r);
}

// 2. Completar la factura: baja la línea, sube la 201, nada se cuenta dos veces.
{
  const r = correr(`${ESCENA}
${GASTA}
select pg_temp.activo(:'hoy'::date) as activo1 \\gset
select pg_temp.linea('1413', :'hoy'::date) as fondo1 \\gset
${COMPLETA}
select pg_temp.linea('mercaderia_pagada', :'hoy'::date);
select pg_temp.linea('mercaderia_pagada_igv', :'hoy'::date);
select pg_temp.linea('201', :'hoy'::date) - :'merca0'::numeric;
select pg_temp.linea('1413', :'hoy'::date) - :'fondo1'::numeric;
select pg_temp.activo(:'hoy'::date) - :'activo1'::numeric;
select (select coalesce(sum(case when b.seccion = 'activo' then b.monto else -b.monto end), 0) from retail.fn_balance_general(:'hoy'::date) b);`);
  const [base, igv, merca, fondo, activo, ecuacion] = lineas(r);
  esperar("al completar la factura quedan S/ 200 de la nota en la línea", r.ok && Number(base) === 200, r);
  esperar("y ya no hay IGV pendiente", r.ok && Number(igv) === 0, r);
  esperar("la 201 sube los S/ 200 de la factura", r.ok && Number(merca) === 200, r);
  esperar("la 1413 no se mueve (el pago real reemplaza al simulado)", r.ok && Number(fondo) === 0, r);
  esperar("el activo sigue igual: ni doble ni cero", r.ok && Number(activo) === 0, r);
  esperar("activo = pasivo + patrimonio", r.ok && Math.abs(Number(ecuacion)) < 0.005, r);
}

// 3. La pieza interna.
{
  const r = correr(`begin;
${MIGRACIONES}
select has_function_privilege('authenticated', 'retail.fn_mercaderia_pagada(date)', 'execute');
select p.provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_mercaderia_pagada';
select p.provolatile::text || p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_balance_general';`);
  const [afuera, vol, balance] = lineas(r);
  esperar("fn_mercaderia_pagada no se llama desde afuera", r.ok && afuera === "f", r);
  esperar("y es STABLE", r.ok && vol === "s", r);
  esperar("fn_balance_general sigue STABLE y security definer", r.ok && balance === "strue", r);
}

console.log(`\n${casos - fallos}/${casos} casos en verde.`);
if (fallos) {
  console.error(`${fallos} caso(s) fallaron.`);
  process.exit(1);
}

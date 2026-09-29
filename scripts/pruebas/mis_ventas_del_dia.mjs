#!/usr/bin/env node
/**
 * Prueba de `20260930040000_mis_ventas_del_dia.sql` — «Tus ventas» del Inicio deja de mostrar el total de la tienda.
 *
 * QUÉ CUBRE
 *   · cada persona ve SOLO las ventas de hoy cuya asesora es ella: no las de una compañera de la misma tienda, no las sin
 *     asesora, no las de ayer, no las anuladas ni las de prueba (la misma definición de Rendimiento, ADR-0219);
 *   · un LÍDER tampoco recibe el total de la tienda: solo lo suyo (para eso está `fn_ventas_del_dia`, que no cambia);
 *   · `p_ubicacion_id` acota a una tienda, y sin él entra todo el día de la persona aunque haya cubierto otra;
 *   · una terminal es un aparato, no una persona: 0 filas y sin error;
 *   · `fn_ventas_del_dia` sigue devolviendo el día de la tienda (Caja, Vender y Comprobantes lo necesitan así);
 *   · `anon` no puede ejecutarla; `authenticated` sí.
 *
 * CÓMO. Mismo patrón que `actividad.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el
 * Postgres local compartido) y la sesión simulada con `request.jwt.claim.sub`. Cada venta de prueba se anota en una tabla
 * temporal con su etiqueta, así la prueba dice EXACTAMENTE cuáles aparecen y no depende de lo que ya haya en el local.
 *
 * USO
 *   pnpm pruebas:mis-ventas    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder, sin tienda
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const T_VENTAS = "55555555-5555-4555-8555-0000000000b1";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

/** Seis ventas de hoy y una de ayer, de tres asesoras distintas, para que cada exclusión tenga su caso. */
const VENTAS = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
create temp table _t (etq text primary key, id uuid);
create function pg_temp.venta(p_etq text, p_ubic uuid, p_asesora uuid, p_estado text, p_prueba boolean, p_hace interval, p_cant int, p_precio numeric)
returns void language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, asesora_id, usuario_id, estado, es_prueba, created_at, anulado_en, motivo_anulacion)
  values (p_ubic, p_asesora, p_asesora, p_estado, p_prueba, now() - p_hace,
          case when p_estado = 'anulada' then now() end, case when p_estado = 'anulada' then 'prueba automatizada' end)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (v, (select id from retail.variantes order by id limit 1), p_cant, p_precio, 0);
  insert into _t values (p_etq, v);
end;
$f$;
select pg_temp.venta('mic_trujillo', :'trujillo', :'micaela', 'completada', false, interval '0', 2, 50);      -- 100: la suya
select pg_temp.venta('mic_lima',     :'lima',     :'micaela', 'completada', false, interval '0', 1, 40);      -- 40: la suya, cubriendo otra tienda
select pg_temp.venta('felipe',       :'trujillo', :'felipe',  'completada', false, interval '0', 1, 80);      -- 80: de otra persona de la misma tienda
select pg_temp.venta('prueba',       :'trujillo', :'micaela', 'completada', true,  interval '0', 1, 999);     -- de prueba: no cuenta
select pg_temp.venta('anulada',      :'trujillo', :'micaela', 'anulada',    false, interval '0', 1, 555);     -- anulada: no cuenta
select pg_temp.venta('ayer',         :'trujillo', :'micaela', 'completada', false, interval '26 hours', 1, 777); -- de ayer: no es de hoy
select pg_temp.venta('sin_asesora',  :'trujillo', null,       'completada', false, interval '0', 1, 333);     -- de nadie
`;

/** Qué etiquetas de las ventas de prueba aparecen en lo que devuelve `fn_mis_ventas_del_dia(<args>)`. */
const APARECEN = (args = "") =>
  `select coalesce(string_agg(t.etq, ',' order by t.etq), '(ninguna)') from retail.fn_mis_ventas_del_dia(${args}) f join _t t on t.id = f.venta_id;`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1200)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);

// 1. Micaela ve lo suyo de hoy: sus dos ventas válidas (una en cada tienda) y nada más.
{
  const r = correr(`${VENTAS}${cambiaA(MICAELA)}${APARECEN()}`);
  esperar("una integrante ve solo sus ventas válidas de hoy (no la de su compañera, ni prueba, anulada, ayer o sin asesora)", ultima(r) === "mic_lima,mic_trujillo", r);
}

// 2. Los totales de esas filas cuadran: 100 + 40, con sus prendas.
{
  const r = correr(`${VENTAS}${cambiaA(MICAELA)}
select sum(f.total) || '|' || sum(f.prendas) || '|' || count(*) from retail.fn_mis_ventas_del_dia() f join _t t on t.id = f.venta_id;`);
  esperar("cada fila trae su total y sus prendas (140 soles, 3 prendas, 2 ventas)", ultima(r) === "140.00|3|2", r);
}

// 3. p_ubicacion_id acota a una tienda.
{
  const r = correr(`${VENTAS}${cambiaA(MICAELA)}
select (${APARECEN(":'trujillo'").replace(/;$/, "")}) || '/' || (${APARECEN(":'lima'").replace(/;$/, "")});`);
  esperar("con p_ubicacion_id solo entra esa tienda", ultima(r) === "mic_trujillo/mic_lima", r);
}

// 4. Un líder tampoco recibe el total de la tienda: solo lo suyo.
{
  const r = correr(`${VENTAS}${cambiaA(FELIPE)}${APARECEN()}`);
  esperar("un líder recibe solo lo suyo, no el total de la tienda", ultima(r) === "felipe", r);
}

// 5. La función de siempre no cambia: Caja, Vender y Comprobantes necesitan el día de la tienda.
{
  const r = correr(`${VENTAS}${cambiaA(MICAELA)}
select count(*) filter (where f.venta_id in (select id from _t)) from retail.fn_ventas_del_dia() f;`);
  // Trujillo hoy, completadas: mic_trujillo, felipe, prueba y sin_asesora (la de Lima no es de su tienda; la anulada y la de ayer no entran).
  esperar("fn_ventas_del_dia no cambió: sigue devolviendo el día de la tienda (4 de las 7 de prueba)", ultima(r) === "4", r);
}

// 6. Una terminal no es una persona: 0 filas y sin error.
{
  const r = correr(`${VENTAS}
select id as trujillo2 from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into auth.users (id, aud, role, email) values ('${T_VENTAS}', 'authenticated', 'authenticated', 'terminal-mis-ventas@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'trujillo2', 'Terminal prueba mis ventas', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}');
${cambiaA(T_VENTAS)}
select count(*) from retail.fn_mis_ventas_del_dia();`);
  esperar("una terminal recibe 0 filas, sin error", ultima(r) === "0", r);
}

// 7. Permisos: solo cuentas con sesión.
{
  const r = correr(`select has_function_privilege('anon', 'retail.fn_mis_ventas_del_dia(uuid)', 'execute') || '|' || has_function_privilege('authenticated', 'retail.fn_mis_ventas_del_dia(uuid)', 'execute');`);
  esperar("anon no puede ejecutarla; authenticated sí", ultima(r) === "false|true", r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);

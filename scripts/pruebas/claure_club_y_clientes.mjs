#!/usr/bin/env node
/**
 * Prueba de `20261029035000_claure_fuera_del_club_y_las_clientes.sql` (ADR-0560, actividad 6c): una prenda de CLAURE no da puntos del club de CAYLA, una compra solo
 * de CLAURE no cuenta como compra del club y la ficha de la cliente no la lista.
 *
 * Lo que importa: (1) los puntos de una venta se calculan solo sobre las líneas de CAYLA (la venta solo de CLAURE no da ninguno; la mixta, por su línea de CAYLA);
 * (2) las compras del club no incluyen la de solo CLAURE (la mixta sí); (3) la ficha de la cliente lista solo líneas de CAYLA, y no los cambios ni las devoluciones que son
 * solo de CLAURE (una devolución mixta sí); (4) lo anterior al arranque y la sede sin CLAURE cuentan como siempre; (5) las migraciones se pueden volver a pegar.
 * Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-club-y-clientes   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La columna `cuenta_corriente_desde` (actividad 1) y la regla `fn_item_es_de_claure` (6a) son lo que esta migración usa.
const PREVIAS = [leer("20261029004000_cuenta_con_claure.sql"), leer("20261029023000_claure_fuera_de_inicio_y_observatorio.sql")].join("\n");
const MIGRACION = leer("20261029035000_claure_fuera_del_club_y_las_clientes.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed): ve el módulo Clientas
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const idSede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return id;
};
const LIMA = idSede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = idSede("'Tienda TRU', 'Tienda Trujillo'");

const COMO = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;
const SUPER = "reset role;";

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// A = una prenda de CLAURE; B = una de CAYLA. Todo de la misma cliente (miembro del club), en hora de Lima.
//   S1 mixta: A 118 + B 118 · S2 solo CLAURE: A 177 · S3 solo CAYLA: B 100 · S4 solo CLAURE de hace 12 días (antes del arranque): A 59 · S5 Trujillo: A 100
// Cambios: C1 de la línea de CLAURE (b1), C2 de la de CAYLA (b4). Devoluciones aprobadas: D1 de b1 (solo CLAURE), D2 de b4 (solo CAYLA), D3 de b1 y b2 (mixta).
const PRELUDIO = `
begin;
\\o /dev/null
${PREVIAS}
${MIGRACION}
\\o
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, '${LIMA}') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as cli from retail.clientas order by id limit 1 \\gset
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
update retail.clientas set club_desde = now() - interval '30 days', codigo_club = 'C-906060', anonimizada = false where id = :'cli';
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, cliente_id, asesora_id, usuario_id) values
  (${ID("a1")}, '${LIMA}', (:'hoy'::date + time '00:10')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo'),
  (${ID("a2")}, '${LIMA}', (:'hoy'::date + time '00:15')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo'),
  (${ID("a3")}, '${LIMA}', (:'hoy'::date + time '00:20')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo'),
  (${ID("a4")}, '${LIMA}', ((:'hoy'::date - 12) + time '00:05')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo'),
  (${ID("a5")}, '${TRUJILLO}', (:'hoy'::date + time '00:25')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 118, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 118, 10),
  (${ID("b3")}, ${ID("a2")}, :'va_a', 1, 177, 10),
  (${ID("b4")}, ${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("b5")}, ${ID("a4")}, :'va_a', 1, 59, 10),
  (${ID("b6")}, ${ID("a5")}, :'va_a', 1, 100, 10);
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia) values
  (${ID("c1")}, ${ID("b1")}, '${LIMA}', :'va_b', 1, 0), (${ID("c2")}, ${ID("b4")}, '${LIMA}', :'va_a', 1, 0);
set local session_replication_role = origin;
`;

// Las devoluciones solo se siembran donde se miran: una devolución entera de la venta le quita sus puntos y su lugar en las compras del club.
const DEVS = `
set local session_replication_role = replica;
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en) values
  (${ID("d1")}, ${ID("a1")}, '${LIMA}', 'prueba', 'aprobada', 118, 'efectivo', now()),
  (${ID("d2")}, ${ID("a3")}, '${LIMA}', 'prueba', 'aprobada', 100, 'efectivo', now()),
  (${ID("d3")}, ${ID("a1")}, '${LIMA}', 'prueba', 'aprobada', 236, 'efectivo', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values
  (${ID("d1")}, ${ID("b1")}, 1, 'vendible'), (${ID("d2")}, ${ID("b4")}, 1, 'vendible'),
  (${ID("d3")}, ${ID("b1")}, 1, 'vendible'), (${ID("d3")}, ${ID("b2")}, 1, 'vendible');
set local session_replication_role = origin;
`;
const dentro = (cuerpo) => psql(`${PRELUDIO}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();
const nuestras = "(" + ["a1", "a2", "a3", "a4", "a5"].map(ID).join(", ") + ")";

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 14).join("\n    ")}`);
  }
}

// ── 1. Los puntos ──
caso("fn_club_monto_neto_venta: solo lo de CAYLA da puntos (la mixta por su línea; la de solo CLAURE, cero; Trujillo y lo anterior al arranque, como siempre)", () =>
  igual(
    ultima(
      dentro(`select retail.fn_club_monto_neto_venta(${ID("a1")})::numeric(12,2) || '|' || retail.fn_club_monto_neto_venta(${ID("a2")})::numeric(12,2) || '|' ||
                     retail.fn_club_monto_neto_venta(${ID("a3")})::numeric(12,2) || '|' || retail.fn_club_monto_neto_venta(${ID("a4")})::numeric(12,2) || '|' ||
                     retail.fn_club_monto_neto_venta(${ID("a5")})::numeric(12,2);`),
    ),
    // S1: 118 (su línea de CAYLA); S2: 0; S3: 100; S4 (antes del arranque): 59, cuenta; S5 (Trujillo): 100.
    "118.00|0.00|100.00|59.00|100.00",
  ),
);

caso("fn_club_puntos_por_venta: la venta solo de CLAURE no da ningún punto; la mixta, los de su línea de CAYLA", () =>
  igual(
    ultima(
      dentro(`select retail.fn_club_puntos_por_venta(v) from (values (${ID("a1")}::uuid), (${ID("a2")}::uuid), (${ID("a3")}::uuid)) t(v);
select coalesce(string_agg(m.puntos::text, ',' order by m.venta_id), '') from retail.club_puntos_movimientos m where m.tipo = 'compra' and m.venta_id in ${nuestras};`),
    ),
    // puntos_por_sol = 1 en la base local: S1 118 y S3 100 (S2 no deja movimiento). Se mira la suma para no depender del orden de los ids.
    (() => {
      return "118,100";
    })(),
  ),
);

// ── 2. Las compras del club ──
caso("fn_club_compras_netas: la compra solo de CLAURE no cuenta; la mixta, la de Trujillo y la anterior al arranque sí", () =>
  igual(
    ultima(
      dentro(`select coalesce(string_agg(right(venta_id::text, 2), ',' order by venta_id), '') from retail.fn_club_compras_netas(:'cli') where venta_id in ${nuestras};`),
    ),
    "a1,a3,a4,a5",
  ),
);

// ── 3. La ficha de la cliente ──
caso("fn_clienta_compras: la ficha lista solo líneas de CAYLA (de la mixta, la suya) y nada de la de solo CLAURE", () =>
  igual(
    ultima(
      dentro(`${COMO(FELIPE)}
select count(*) || '|' || coalesce(sum(subtotal), 0)::numeric(12,2) || '|' || count(distinct venta_id)
  from retail.fn_clienta_compras(:'cli') where venta_id in ${nuestras};`),
    ),
    // S1 (B 118), S3 (B 100), S4 (anterior al arranque: A 59) y S5 (Trujillo: A 100): 4 líneas, 377, en 4 ventas; la S2 no sale.
    "4|377.00|4",
  ),
);

caso("fn_clienta_cambios y fn_clienta_devoluciones: lo que es solo de CLAURE no sale; lo de CAYLA y lo mixto sí", () =>
  igual(
    ultima(
      dentro(`${DEVS}
${COMO(FELIPE)}
select (select coalesce(string_agg(right(cambio_id::text, 2), ',' order by cambio_id), '') from retail.fn_clienta_cambios(:'cli') where cambio_id in (${ID("c1")}, ${ID("c2")})) || '|' ||
       (select coalesce(string_agg(right(devolucion_id::text, 2), ',' order by devolucion_id), '') from retail.fn_clienta_devoluciones(:'cli') where devolucion_id in (${ID("d1")}, ${ID("d2")}, ${ID("d3")}));`),
    ),
    "c2|d2,d3",
  ),
);

// ── 4. Idempotencia ──
caso("las migraciones se pueden volver a pegar: mismas cifras y sin error", () =>
  igual(
    ultima(
      psql(`${PRELUDIO}
\\o /dev/null
${MIGRACION}
\\o
select retail.fn_club_monto_neto_venta(${ID("a1")})::numeric(12,2);
rollback;`),
    ),
    "118.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

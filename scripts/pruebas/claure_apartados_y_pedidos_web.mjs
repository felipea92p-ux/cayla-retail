#!/usr/bin/env node
/**
 * Prueba de `20261029043000_claure_apartados_y_pedidos_web.sql` (ADR-0560, actividad 7): lo que CAYLA cobró por adelantado de un apartado o de un pedido web con prendas de
 * CLAURE también se le debe a Claudia, desde que la prenda sale (el día de la venta).
 *
 * Lo que importa: (1) el adelanto de un apartado entregado (abonos de `separacion_pagos`, no efectivo) entra a lo que se le debe, por la parte de CLAURE de la venta y en la cuenta
 * donde cayó cada abono; el abono en efectivo no entra; (2) el pago aprobado de un pedido web despachado también; (3) mientras la prenda no sale (apartado abierto, pedido sin
 * venta) no se debe nada; (4) lo cobrado de siempre (el saldo de la venta) no cambia; (5) las migraciones se pueden volver a pegar. Cada caso corre en su transacción con las
 * migraciones aplicadas dentro y TERMINA EN ROLLBACK; todo se mide como DIFERENCIA contra la foto de antes de la escena.
 *
 * USO: pnpm pruebas:claure-apartados-y-pedidos-web   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const PREVIAS = leer("20261029004000_cuenta_con_claure.sql");
const MIGRACION = leer("20261029043000_claure_apartados_y_pedidos_web.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
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

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// A = una prenda de CLAURE; B = una de CAYLA. Dos ventas de hoy en Lima, las dos con adelanto:
//   APARTADO (S1): A 177 + B 118 = 295, adelanto 100 = abono yape 60 (Interbank) + abono efectivo 40; al entregar paga el saldo 195 en yape (Interbank).
//     La parte de CLAURE es 177/295 = 60 %: yape 255 × 0,6 = 153; el abono en efectivo no entra.
//   PEDIDO WEB (S2): A 100 + B 100 = 200, pagado por adelantado en yape (Interbank) y despachado hoy. La parte de CLAURE es 50 %: 100.
//   APARTADO ABIERTO (sin venta): abono yape 50 (Interbank): no se debe nada todavía.
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
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
select id as cli from retail.clientas order by id limit 1 \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
`;

const FOTO = (n) =>
  `reset role;
select (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
          from retail.fn_claure_filas(array['${LIMA}']::uuid[]) x)::text as fi${n} \\gset`;

const ESCENA = `
reset role;
set local session_replication_role = replica;
-- El apartado entregado (S1) con sus abonos y su venta.
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, cliente_id, asesora_id, usuario_id) values
  (${ID("a1")}, '${LIMA}', (:'hoy'::date + time '00:10')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo'),
  (${ID("a2")}, '${LIMA}', (:'hoy'::date + time '00:20')::timestamp at time zone 'America/Lima', 'completada', false, :'cli', :'yo', :'yo');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 177, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 118, 10),
  (${ID("b3")}, ${ID("a2")}, :'va_a', 1, 100, 10), (${ID("b4")}, ${ID("a2")}, :'va_b', 1, 100, 10);
insert into retail.venta_pagos (venta_id, metodo, monto) values (${ID("a1")}, 'anticipo', 100);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (${ID("a1")}, 'yape', 195, :'interbank');
insert into retail.venta_pagos (venta_id, metodo, monto) values (${ID("a2")}, 'anticipo', 200);
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo, creado_por, total, adelanto,
                                 vence_el, devolucion_medio, devolucion_numero, estado, venta_id, entregada_en) values
  (${ID("c1")}, 'T7-ENTREGADO', '${LIMA}', gen_random_uuid(), :'cli', 'Prueba', 'Siete', '999888777', 'boleta', :'yo', 295, 100, :'hoy'::date + 30, 'yape', '999888777', 'entregada', ${ID("a1")}, now()),
  (${ID("c2")}, 'T7-ABIERTO', '${LIMA}', gen_random_uuid(), :'cli', 'Prueba', 'Ocho', '999888777', 'boleta', :'yo', 200, 50, :'hoy'::date + 30, 'yape', '999888777', 'abierta', null, null);
insert into retail.separacion_pagos (separacion_id, metodo, monto, cuenta_dinero_id, caja_movimiento_id) values
  (${ID("c1")}, 'yape', 60, :'interbank', null), (${ID("c1")}, 'efectivo', 40, null, gen_random_uuid()), (${ID("c2")}, 'yape', 50, :'interbank', null);
-- El pedido web despachado (S2) con su pago aprobado.
insert into retail.pedidos_web (id, clienta_id, ubicacion_id, estado, total, pagado, venta_id, confirmado_en, confirmado_por, pagado_en, entregado_en, entregado_por)
  values (${ID("d1")}, :'cli', '${LIMA}', 'entregado', 200, 200, ${ID("a2")}, now(), :'yo', now(), now(), :'yo');
insert into retail.pedido_web_pagos (pedido_id, origen, medio, monto, estado, numero_operacion, registrado_por, cuenta_dinero_id) values
  (${ID("d1")}, 'tienda', 'yape', 200, 'aprobado', '123456789', :'yo', :'interbank');
`;

const MONTO_YAPE_INTERBANK = (foto) =>
  `coalesce((select sum((e->>'monto')::numeric) from jsonb_array_elements(:'${foto}'::jsonb) e where e->>'origen' = 'venta' and e->>'medio' = 'yape' and e->>'cuenta_id' = :'interbank'), 0)`;
const MONTO_TODO = (foto) =>
  `coalesce((select sum((e->>'monto')::numeric) from jsonb_array_elements(:'${foto}'::jsonb) e where e->>'origen' = 'venta'), 0)`;

const dentro = (cuerpo) => psql(`${PRELUDIO}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();

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

caso("el adelanto de un apartado entregado y el pago de un pedido web despachado entran a lo que se le debe, en la cuenta donde cayeron", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${ESCENA}
${FOTO(1)}
select (${MONTO_YAPE_INTERBANK("fi1")} - ${MONTO_YAPE_INTERBANK("fi0")})::numeric(12,2);`),
    ),
    // Apartado: (60 del abono + 195 del saldo) × 177/295 = 153. Pedido web: 200 × 100/200 = 100. Total 253 en yape/Interbank.
    "253.00",
  ),
);

caso("el abono en efectivo no entra, y un apartado abierto (sin venta) no debe nada", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${ESCENA}
${FOTO(1)}
select (${MONTO_TODO("fi1")} - ${MONTO_TODO("fi0")})::numeric(12,2);`),
    ),
    // Todo lo cobrado de las dos ventas: solo yape/Interbank (253); ni el efectivo del apartado ni el abono del apartado abierto suman.
    "253.00",
  ),
);

caso("lo cobrado de siempre (el saldo de la venta) no cambia: sin las tablas del adelanto el saldo sigue siendo su parte de CLAURE", () =>
  igual(
    ultima(
      dentro(`${ESCENA}
delete from retail.separacion_pagos where separacion_id in (${ID("c1")}, ${ID("c2")});
delete from retail.pedido_web_pagos where pedido_id = ${ID("d1")};
${FOTO(1)}
select (${MONTO_YAPE_INTERBANK("fi1")})::numeric(12,2);`),
    ),
    // Sin los adelantos solo queda el saldo del apartado en yape: 195 × 177/295 = 117.00.
    (() => "117.00")(),
  ),
);

caso("las migraciones se pueden volver a pegar: mismas cifras y sin error", () =>
  igual(
    ultima(
      psql(`${PRELUDIO}
\\o /dev/null
${MIGRACION}
\\o
${FOTO(0)}
${ESCENA}
${FOTO(1)}
select (${MONTO_YAPE_INTERBANK("fi1")} - ${MONTO_YAPE_INTERBANK("fi0")})::numeric(12,2);
rollback;`),
    ),
    "253.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

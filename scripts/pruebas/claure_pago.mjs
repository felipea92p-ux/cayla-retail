#!/usr/bin/env node
/**
 * Prueba de `20261029011000_pagar_a_claure.sql` (ADR-0560, actividad 2): el pago a CLAURE sale de un banco de CAYLA, baja lo que se le debe y el
 * resto de Finanzas lo ve solo. Es un tipo más de `movimientos_dinero`, como el pago a SUNAT (ADR-0417).
 *
 * Lo que importa: (1) el pago se registra con `registrar_movimiento_dinero`, es de la empresa, sin destino, y el mismo token no lo duplica;
 * (2) baja el saldo del banco de donde salió; (3) `fn_claure_pagos` lo lista (y lo quita al anularlo); (4) solo el líder lo registra;
 * (5) no sale de un cajón o una máquina, ni lleva destino ni comisión; (6) el Diario lo asienta 479 | banco; (7) el Flujo real lo cuenta como una salida «Pago a CLAURE» (desde la actividad 5); (8) lleva su nombre; (9) quien no tiene el módulo no lo lee y `anon` no ejecuta; (10) la migración se puede volver
 * a pegar. Cada caso corre en su transacción con la migración aplicada dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-pago   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261029011000_pagar_a_claure.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo Cuentas y dinero (seed)
const TOKEN = "00000000-0000-4000-8000-0000000000ab";

const sesion = (id) =>
  `set local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

// Las cuentas se buscan por nombre y tipo (un banco, una máquina «por depositar» y un cajón del seed local).
const ESCENA = `
select id as banco from retail.cuentas_dinero where tipo = 'banco' and archivada_en is null order by nombre limit 1 \\gset
select id as maquina from retail.cuentas_dinero where tipo = 'por_abonar' and archivada_en is null order by nombre limit 1 \\gset
select id as cajon from retail.cuentas_dinero where tipo = 'cajon' and archivada_en is null order by nombre limit 1 \\gset
select retail.fn_hoy_lima() as hoy \\gset
`;
const PAGO = (monto = 100, origen = ":'banco'", extra = "") =>
  `select retail.registrar_movimiento_dinero('pago_claure', ${monto}, ${origen}, null, :'hoy'::date, 'OP-12345', 0, null, null, '${TOKEN}'::uuid${extra});`;

const PAGO_CON_ID = (monto = 100) =>
  `select retail.registrar_movimiento_dinero('pago_claure', ${monto}, :'banco', null, :'hoy'::date, 'OP-12345', 0, null, null, '${TOKEN}'::uuid) as mov \\gset`;

const dentro = (consulta, { sesionDe = FELIPE, antes = "" } = {}) =>
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${ESCENA}\n\\o\n${antes}\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const falla = (consulta, { texto, sesionDe = FELIPE } = {}) => {
  try {
    dentro(consulta, { sesionDe });
    return "no falló y debía fallar";
  } catch (e) {
    const err = String(e.stderr ?? e.message);
    return texto && !err.includes(texto) ? `falló por otra razón: ${err.split("\n")[0]}` : null;
  }
};

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 12).join("\n    ")}`);
  }
}

caso("se registra: es de la empresa (sin tienda), sale de un banco, sin destino, y es del tipo pago_claure", () => {
  // La primera línea es el uuid que devuelve la función; la última, la fila.
  const filas = dentro(
    `${PAGO()}
     reset role;
     select tipo || '|' || (ubicacion_id is null)::text || '|' || (cuenta_destino_id is null)::text || '|' || (cuenta_origen_id = :'banco'::uuid)::text || '|' || monto::numeric(12,2) || '|' || referencia || '|' || estado
       from retail.movimientos_dinero where token_cliente = '${TOKEN}'::uuid;`,
  ).split("\n");
  return igual(filas[filas.length - 1], "pago_claure|true|true|true|100.00|OP-12345|vigente");
});

caso("el mismo token no lo duplica", () =>
  igual(dentro(`${PAGO()}\n${PAGO()}\nreset role;\nselect count(*) from retail.movimientos_dinero where token_cliente = '${TOKEN}'::uuid;`).split("\n").pop(), "1"),
);

caso("baja el saldo del banco de donde salió", () =>
  igual(
    dentro(
      `select (select saldo from retail.fn_cuentas_dinero_saldos(null, null) where id = :'banco'::uuid)::numeric(12,2) as antes \\gset
       ${PAGO(100)}
       select (:'antes'::numeric - (select saldo from retail.fn_cuentas_dinero_saldos(null, null) where id = :'banco'::uuid))::numeric(12,2);`,
    )
      .split("\n")
      .pop(),
    "100.00",
  ),
);

caso("fn_claure_pagos lo lista con su fecha, su banco, su monto y su n.º de operación; al anularlo ya no sale", () => {
  const lista = dentro(
    `${PAGO_CON_ID()}
     select count(*) || '|' || min(monto)::numeric(12,2) || '|' || min(referencia) || '|' || (min(cuenta_id::text) = :'banco'::text)::text from retail.fn_claure_pagos();
     select retail.anular_movimiento_dinero(:'mov'::uuid, 'prueba');
     select count(*) from retail.fn_claure_pagos();`,
  ).split("\n");
  return igual(`${lista[0]}/${lista[lista.length - 1]}`, "1|100.00|OP-12345|true/0"); // la línea del medio es el vacío de la anulación
});

caso("solo el líder lo registra", () => falla(PAGO(), { texto: "Registrar movimientos de dinero necesita", sesionDe: MICAELA }));

caso("no sale de un cajón ni de una máquina de cobro", () =>
  falla(PAGO(100, ":'cajon'")) ?? falla(PAGO(100, ":'maquina'")),
);

caso("no lleva destino ni comisión", () =>
  falla(`select retail.registrar_movimiento_dinero('pago_claure', 100, :'banco', :'maquina', :'hoy'::date, null, 0, null, null, null);`) ??
  falla(`select retail.registrar_movimiento_dinero('pago_claure', 100, :'banco', null, :'hoy'::date, null, 5, null, null, null);`),
);

caso("no se paga cero ni un negativo", () => falla(PAGO(0)) ?? falla(PAGO(-5)));

caso("el Diario lo asienta contra la 479 (debe) y el banco (haber)", () =>
  igual(
    dentro(
      `${PAGO_CON_ID()}
       reset role;
       select string_agg(cuenta || ':' || debe::numeric(12,2) || ':' || haber::numeric(12,2), ' ' order by cuenta)
         from retail.fn_asientos_dinero_y_caja(:'hoy'::date, :'hoy'::date, true, null) where asiento = 'dinero:' || :'mov';`,
    )
      .split("\n")
      .pop(),
    "104:0.00:100.00 479:100.00:0.00",
  ),
);

caso("el Flujo real lo cuenta como una salida «pago_claure» (20261029020000, actividad 5) y no como plata entre cuentas", () =>
  igual(
    dentro(`${PAGO()}\nreset role;\nselect count(*) filter (where categoria = 'pago_claure' and monto = -100)::text || ':' || count(*) filter (where categoria = 'entre_cuentas')::text from retail.fn_flujo_lineas(:'hoy'::date, :'hoy'::date);`).split("\n").pop(),
    "1:0",
  ),
);

caso("lleva su nombre", () => igual(dentro(`select retail.fn_texto_movimiento_dinero('pago_claure');`, { sesionDe: null }), "Pago a CLAURE"));

caso("quien no tiene el módulo Cuentas y dinero no lee los pagos", () =>
  falla(`select * from retail.fn_claure_pagos();`, { texto: "necesita el módulo Cuentas y dinero", sesionDe: MICAELA }),
);

caso("anon no ejecuta fn_claure_pagos", () => {
  try {
    dentro(`set local role anon;\nselect * from retail.fn_claure_pagos();`, { sesionDe: null });
    return "anon pudo ejecutar fn_claure_pagos";
  } catch (e) {
    return String(e.stderr).includes("permission denied") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("la migración se puede volver a pegar y el pago sigue andando", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${MIGRACION}\n${ESCENA}\n\\o\n${sesion(FELIPE)}\n${PAGO()}\nselect count(*) from retail.fn_claure_pagos();\nrollback;`).split("\n").pop(),
    "1",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

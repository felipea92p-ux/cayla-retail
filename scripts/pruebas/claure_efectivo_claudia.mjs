#!/usr/bin/env node
/**
 * Prueba de `20261029144000_claure_efectivo_se_queda_con_claudia.sql` (ADR-0560, actividad 11): al cerrar la caja de Tienda LIM, el efectivo de CAYLA que se queda con
 * Claudia (destino de traslado `claudia`) SALE del cajón, no llega a ninguna cuenta de CAYLA y baja lo que se le debe.
 *
 * Lo que importa: (1) `cerrar_caja` acepta el destino solo donde opera CLAURE, y los demás destinos siguen igual; (2) `fn_claure_cierre` resta ese efectivo del saldo (y trae
 * `hoy.efectivo_claudia`) y `fn_claure_pagos` lo lista; (3) el Diario lo asienta cuadrado: 479 al debe y la caja (101) al haber; (4) el libro de dinero NO lo trata como un
 * depósito (sin cuenta) y el flujo de caja lo cuenta como `pago_claure`; (5) la actividad lo dice; (6) la caja cerrada sigue cuadrando su fondo; (7) un destino cualquiera sigue
 * rechazado; (8) la migración se puede volver a pegar y, con un texto distinto en una función, aborta sin cambiar nada. Cada caso corre en su transacción y TERMINA EN ROLLBACK.
 * La prueba parte del estado de ANTES de la migración (deshace sus reemplazos dentro de la transacción) y luego la aplica: sin ella, los casos fallan.
 *
 * USO: pnpm pruebas:claure-efectivo-claudia   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlDeshacer } from "./_deshacer_claure.mjs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const ARCHIVO = "20261029144000_claure_efectivo_se_queda_con_claudia.sql";
// La cadena que deja las funciones de CLAURE como estaban antes de esta actividad (con el IGV de la actividad 10)...
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029011000_pagar_a_claure.sql"),
  leer("20261029013000_cierre_de_caja_con_claudia.sql"),
  leer("20261029020000_claure_fuera_de_las_cifras_de_cayla.sql"),
  leer("20261029044000_claure_gastos_por_empresa.sql"),
  leer("20261029142000_claure_igv_se_descuenta.sql"),
].join("\n");
// ...y lo que NO es de CLAURE (el cierre de caja, el libro, el flujo, el Diario, la actividad y el `check` del destino) devuelto a como estaba antes de la migración.
const FIRMAS_AJENAS = [
  "retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)",
  "retail.fn_dinero_libro(date)",
  "retail.fn_flujo_lineas(date, date)",
  "retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])",
  "retail.fn_actividad_caja_traslado(uuid, text)",
];
const ANTES = `${sqlDeshacer(ARCHIVO, FIRMAS_AJENAS)}
reset role;
alter table retail.caja_traslados drop constraint if exists caja_traslados_destino_check;
alter table retail.caja_traslados add constraint caja_traslados_destino_check check (destino in ('caja_fuerte', 'banco', 'lider'));`;
const MIGRACION = leer(ARCHIVO);
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const LUCIA = "22222222-2222-4222-8222-0000000000b1"; // cierra la caja de Tienda Lima y no es líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const sesion = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;`;

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// La escena del IGV (actividad 10): hoy se cobró 168 en cuentas de CAYLA (IGV 25.63, comisión 1.40, pagado 40), ayer 59 (IGV 9.00, pagado 10) → saldo 140.97.
// Más: la caja de Lima de hoy ABIERTA (e9) con una venta en efectivo de 200 (100 de CLAURE y 100 de CAYLA) y una caja abierta en Trujillo (e8) para ver que allá no se puede.
const ESCENA = `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
select id as izipay from retail.cuentas_dinero where nombre = 'Por depositar Izipay' \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
delete from retail.pos_tarifas where maquina_id in (select id from retail.pos_maquinas where cuenta_id = :'izipay');
delete from retail.medios_de_cobro where ubicacion_id = ${LIMA};
insert into retail.pos_maquinas (nombre, cuenta_id) select 'Izipay prueba', :'izipay' where not exists (select 1 from retail.pos_maquinas m where m.cuenta_id = :'izipay');
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde)
  select m.id, 'tarjeta', 2.38, true, 0, 0, date '2026-01-01' from retail.pos_maquinas m where m.cuenta_id = :'izipay';
-- Las cajas abiertas que ya haya en la base local (una por tienda) se cierran dentro de esta transacción para que la escena pueda abrir las suyas.
update retail.cajas set estado = 'cerrada', cerrada_en = now(), monto_cierre_real = 0, monto_fondo = 0 where estado = 'abierta' and ubicacion_id in (${LIMA}, ${TRUJILLO});
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en) values
  (${ID("e1")}, ${LIMA}, 'cerrada', 100, now() - interval '3 hours', now() - interval '2 hours'),
  (${ID("e2")}, ${LIMA}, 'cerrada', 100, now() - interval '1 day 3 hours', now() - interval '1 day');
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en) values
  (${ID("e9")}, ${LIMA}, 'abierta', 100, now() - interval '1 hour'),
  (${ID("e8")}, ${TRUJILLO}, 'abierta', 100, now() - interval '1 hour');
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id) values
  (${ID("a1")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a2")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a3")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a5")}, ${LIMA}, now() - interval '1 day 2 hours', 'completada', false, ${ID("e2")}),
  (${ID("a8")}, ${LIMA}, now() - interval '30 minutes', 'completada', false, ${ID("e9")});
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("a1")}, :'va_a', 1, 100, 10), (${ID("a1")}, :'va_b', 1, 100, 10),
  (${ID("a2")}, :'va_a', 1, 118, 10),
  (${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("a5")}, :'va_a', 1, 59, 10),
  (${ID("a8")}, :'va_a', 1, 100, 10), (${ID("a8")}, :'va_b', 1, 100, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${ID("a1")}, 'tarjeta', 100, :'izipay'), (${ID("a1")}, 'efectivo', 100, null),
  (${ID("a2")}, 'yape', 118, :'interbank'),
  (${ID("a3")}, 'yape', 100, :'interbank'),
  (${ID("a5")}, 'yape', 59, :'interbank'),
  (${ID("a8")}, 'efectivo', 200, null);
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado)
  values ('pago_claure', (now() at time zone 'America/Lima')::date, :'interbank', 40, 'vigente'),
         ('pago_claure', (now() at time zone 'America/Lima')::date - 1, :'interbank', 10, 'vigente');
set local session_replication_role = origin;
`;

const dentro = (consulta, { sesionDe = FELIPE, sinMigracion = false, previas = PREVIAS } = {}) =>
  psql(
    `begin;\n\\o /dev/null\n${previas}\n${ANTES}\n${sinMigracion ? "" : MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`,
  );
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

// Cierra la caja de Lima contando lo que dice el sistema y trasladando `monto` con ese destino (como el líder o quien cierra).
const CERRAR = (destino, monto = 100, referencia = "null", caja = "e9") =>
  `select esperado as esperado from retail.fn_esperado_caja(${ID(caja)}) \\gset
   select monto_trasladado || '|' || monto_fondo from retail.cerrar_caja(${ID(caja)}, :esperado, ${monto}, '${destino}', ${referencia});`;
const TRAS = `(select id from retail.caja_traslados where caja_id = ${ID("e9")})`;

caso("cerrar la caja de Lima con «se queda con Claudia»: sale 100 del cajón y deja 200 de fondo (esperado 300)", () =>
  igual(dentro(CERRAR("claudia")), "100|200.00"),
);

caso("el aviso del cierre resta ese efectivo: saldo 140.97 − 100, y lo dice en «hoy»", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       select (j->>'saldo') || '|' || (j->>'saldo_anterior') || '|' || (j->'hoy'->>'efectivo_claudia') || '|' || (j->'hoy'->>'pagado')
         from (select retail.fn_claure_cierre(${ID("e9")}) as j) x;`,
    ).split("\n").pop(),
    "40.97|40.00|100.00|40.00",
  ),
);

caso("sin traslado a Claudia el aviso es el de antes (efectivo_claudia = 0): el saldo del cierre sigue siendo 140.97", () =>
  igual(
    dentro(
      `select (j->>'saldo') || '|' || (j->'hoy'->>'efectivo_claudia') from (select retail.fn_claure_cierre(${ID("e9")}) as j) x;`,
    ),
    "140.97|0.00",
  ),
);

caso("la pantalla CLAURE lo lista como un pago más: «Efectivo del cajón · Tienda …»", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       select count(*) || '|' || min(monto) || '|' || bool_and(cuenta_nombre like 'Efectivo del cajón · %') from retail.fn_claure_pagos() where cuenta_id is null;`,
    ).split("\n").pop(),
    "1|100.00|true",
  ),
);

caso("el Diario lo asienta cuadrado: la 479 al debe y la caja (101) al haber", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       reset role;
       select string_agg(cuenta || ':' || debe || ':' || haber, ' ' order by cuenta) || '|' || sum(debe - haber)
         from retail.fn_asientos_dinero_y_caja((now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date, true, null)
        where regla = 'traslado_claudia';`,
    ).split("\n").pop(),
    "101:0:100.00 479:100.00:0|0.00",
  ),
);

caso("el libro de dinero NO lo trata como un depósito: queda sin cuenta y dice «se queda con Claudia»", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       reset role;
       select count(*) || '|' || bool_and(cuenta_id is null) || '|' || bool_and(detalle like '%se queda con Claudia%')
         from retail.fn_dinero_libro((now() at time zone 'America/Lima')::date) where clave = 'traslado:' || ${TRAS};`,
    ).split("\n").pop(),
    "1|true|true",
  ),
);

caso("el flujo de caja lo cuenta como pago a CLAURE (salida), no como «depósito sin cuenta»", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       reset role;
       select coalesce(sum(monto) filter (where categoria = 'pago_claure'), 0) || '|' || coalesce(sum(monto) filter (where categoria = 'deposito_sin_cuenta'), 0)
         from retail.fn_flujo_lineas((now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date);`,
    ).split("\n").pop(),
    "-140.00|0", // los 100 del cajón + los 40 que ya se le pagaron desde un banco hoy
  ),
);

caso("la actividad dice «para que se quede con Claudia»", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       reset role;
       select count(*) from retail.actividad where accion = 'caja_traslado' and descripcion like '%para que se quede con Claudia%';`,
    ).split("\n").pop(),
    "1",
  ),
);

caso("quien cierra y no es líder también puede dejar el efectivo con Claudia", () =>
  igual(dentro(CERRAR("claudia", 50), { sesionDe: LUCIA }), "50|250.00"),
);

caso("en una tienda donde CLAURE no opera no se puede: lo dice", () =>
  falla(
    `select retail.cerrar_caja(${ID("e8")}, 100, 100, 'claudia', null);`,
    { texto: "solo se queda con Claudia en una tienda donde opera CLAURE" },
  ),
);

caso("un destino cualquiera sigue rechazado, y «líder» sigue pidiendo a quién se lo entregaste", () =>
  falla(`select retail.cerrar_caja(${ID("e9")}, 100, 50, 'otro', null);`, { texto: "Elige a dónde va el efectivo" }) ??
  falla(`select retail.cerrar_caja(${ID("e9")}, 100, 50, 'lider', null);`, { texto: "Escribe a quién le entregaste el efectivo" }),
);

caso("la caja de Lima sigue cuadrando su fondo (contado = fondo + trasladado): la base no rechaza el cierre", () =>
  igual(
    dentro(
      `select esperado as esperado from retail.fn_esperado_caja(${ID("e9")}) \\gset
       select retail.cerrar_caja(${ID("e9")}, :esperado, 100, 'claudia', null) is not null;
       reset role;
       set constraints all immediate;
       select (monto_fondo + (select sum(monto) from retail.caja_traslados where caja_id = k.id)) = monto_cierre_real from retail.cajas k where id = ${ID("e9")};`,
    ).split("\n").pop(),
    "t",
  ),
);

caso("la migración se puede volver a pegar: mismo cierre", () =>
  igual(
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${sesion(FELIPE)}\n${CERRAR("claudia")}\nrollback;`,
    ).split("\n").pop(),
    "100|200.00",
  ),
);

caso("si una función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n` +
        `do $$ begin execute replace(pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure), '''lider'')', '''lider'', ''otro'')'); end $$;\n${MIGRACION}\nrollback;`,
    );
    return "la migración no abortó con una función distinta a la esperada";
  } catch (e) {
    return String(e.stderr).includes("cambió desde que se escribió esta migración") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

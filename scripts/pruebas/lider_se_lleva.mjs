#!/usr/bin/env node
/**
 * Prueba de `20261127010000_lider_se_lleva_de_la_caja_fuerte.sql` (ADR-0710): el líder anota que se llevó efectivo de la caja fuerte de una
 * sede sin depositarlo todavía. Es un «entre cuentas» de una caja fuerte a «Efectivo entregado al líder» (`por_rendir`).
 *
 * Lo que importa: (1) se registra con `registrar_movimiento_dinero`, es de la sede de la caja fuerte y lleva su fecha y su nota; (2) baja la caja
 * fuerte y sube lo que tiene el líder en el mismo monto: la plata total no cambia; (3) el mismo token no lo duplica; (4) la caja fuerte no queda
 * bajo cero; (5) solo el líder, también escribiendo directo en la tabla; (6) el camino de vuelta y las demás parejas siguen cerradas; (7) después
 * se deposita al banco con el depósito de siempre; (8) anularlo devuelve la plata a la caja fuerte. Cada caso corre en su transacción con la
 * migración aplicada dentro (se puede pegar dos veces) y TERMINA EN ROLLBACK. Los montos son inventados.
 *
 * USO: pnpm pruebas:lider-se-lleva   (necesita el stack local: `npx supabase start`)
 * Control: en una base SIN la migración, `SIN_MIGRACION=1` no la aplica y los casos del movimiento deben fallar (medido: 9 de 13).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = process.env.SIN_MIGRACION ? "" : readFileSync(join(RAIZ, "supabase/migrations/20261127010000_lider_se_lleva_de_la_caja_fuerte.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo Cuentas y dinero (seed)
const TOKEN = "00000000-0000-4000-8000-0000000007a0";

const sesion = (id) =>
  `set local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

// La caja fuerte de una tienda arranca la prueba con S/ 500 más (un aporte del dueño, como líder): así no depende de lo que traiga el seed.
const ESCENA = `
select c.id as fuerte, c.ubicacion_id as sede from retail.cuentas_dinero c join retail.ubicaciones u on u.id = c.ubicacion_id
 where c.tipo = 'caja_fuerte' and c.archivada_en is null order by c.nombre limit 1 \\gset
select id as lider from retail.cuentas_dinero where tipo = 'por_rendir' and archivada_en is null limit 1 \\gset
select id as banco from retail.cuentas_dinero where tipo = 'banco' and archivada_en is null and empresa_id = retail.fn_empresa_casa_id() order by nombre limit 1 \\gset
select retail.fn_hoy_lima() as hoy \\gset
${sesion(FELIPE)}
select retail.registrar_movimiento_dinero('aporte', 500, null, :'fuerte', :'hoy'::date, 'siembra de la prueba', 0, null, null, null);
reset role;
`;
const SALDO = (cuenta) => `(select saldo from retail.fn_cuentas_dinero_saldos(null, null) where id = :'${cuenta}'::uuid)`;
const LLEVAR = (monto = 300, { de = "fuerte", a = "lider", token = `'${TOKEN}'::uuid` } = {}) =>
  `select retail.registrar_movimiento_dinero('entre_cuentas', ${monto}, :'${de}', :'${a}', :'hoy'::date, 'para depositar', 0, null, null, ${token});`;
// El candado del efectivo es diferido (se revisa al terminar la operación): la prueba lo adelanta, porque termina en ROLLBACK.
const AL_TERMINAR = "set constraints all immediate;";

const dentro = (consulta, { sesionDe = FELIPE } = {}) =>
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${ESCENA}\n\\o\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`);
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

caso("se registra: es un «entre cuentas» de la sede de la caja fuerte, con su fecha, su monto y su nota", () =>
  igual(
    dentro(
      `${LLEVAR()}
       ${AL_TERMINAR}
       reset role;
       select tipo || '|' || (ubicacion_id = :'sede'::uuid)::text || '|' || (cuenta_origen_id = :'fuerte'::uuid)::text || '|' || (cuenta_destino_id = :'lider'::uuid)::text
              || '|' || monto::numeric(12,2) || '|' || (fecha = :'hoy'::date)::text || '|' || referencia || '|' || estado
         from retail.movimientos_dinero where token_cliente = '${TOKEN}'::uuid;`,
    )
      .split("\n")
      .pop(),
    "entre_cuentas|true|true|true|300.00|true|para depositar|vigente",
  ),
);

caso("baja la caja fuerte, sube lo que tiene el líder y la plata de las dos juntas no cambia", () =>
  igual(
    dentro(
      `select ${SALDO("fuerte")}::numeric(12,2) as f0, ${SALDO("lider")}::numeric(12,2) as l0 \\gset
       \\o /dev/null
       ${LLEVAR(300)}
       \\o
       select (${SALDO("fuerte")} - :'f0'::numeric)::numeric(12,2) || '|' || (${SALDO("lider")} - :'l0'::numeric)::numeric(12,2)
              || '|' || (${SALDO("fuerte")} + ${SALDO("lider")} - :'f0'::numeric - :'l0'::numeric)::numeric(12,2);`,
    )
      .split("\n")
      .pop(),
    "-300.00|300.00|0.00",
  ),
);

caso("el libro del dinero lo lee como dos líneas que se anulan entre sí", () =>
  igual(
    dentro(
      `select retail.registrar_movimiento_dinero('entre_cuentas', 300, :'fuerte', :'lider', :'hoy'::date, 'para depositar', 0, null, null, '${TOKEN}'::uuid) as mov \\gset
       reset role;
       select count(*) || '|' || sum(monto)::numeric(12,2) from retail.fn_dinero_libro(:'hoy'::date) where clave = 'mov:' || :'mov';`,
    )
      .split("\n")
      .pop(),
    "2|0.00",
  ),
);

caso("el mismo token no lo duplica (doble clic)", () =>
  igual(dentro(`${LLEVAR()}\n${LLEVAR()}\nreset role;\nselect count(*) from retail.movimientos_dinero where token_cliente = '${TOKEN}'::uuid;`).split("\n").pop(), "1"),
);

caso("el mismo token con otro monto se rechaza", () => falla(`${LLEVAR(300)}\n${LLEVAR(200)}`));

caso("la caja fuerte no queda bajo cero: llevarse más de lo que hay se rechaza", () =>
  falla(
    `select (${SALDO("fuerte")} + 1)::numeric(12,2) as demas \\gset
     select retail.registrar_movimiento_dinero('entre_cuentas', :'demas'::numeric, :'fuerte', :'lider', :'hoy'::date, null, 0, null, null, null);
     ${AL_TERMINAR}`,
    { texto: "No hay tanta plata" },
  ),
);

caso("llevarse justo todo lo que hay sí se puede", () =>
  igual(
    dentro(
      `select ${SALDO("fuerte")}::numeric(12,2) as todo \\gset
       \\o /dev/null
       select retail.registrar_movimiento_dinero('entre_cuentas', :'todo'::numeric, :'fuerte', :'lider', :'hoy'::date, null, 0, null, null, null);
       ${AL_TERMINAR}
       \\o
       select ${SALDO("fuerte")}::numeric(12,2);`,
    )
      .split("\n")
      .pop(),
    "0.00",
  ),
);

caso("quien no es líder no lo registra", () => falla(LLEVAR(), { sesionDe: MICAELA, texto: "necesita el módulo Cuentas y dinero" }));

// Con el rol dueño de la tabla (sin RLS) pero con la identidad de quien no es líder: lo frena el disparador, no la función.
caso("ni escribiendo directo en la tabla: sin sesión de líder, el candado lo rechaza", () =>
  falla(
    `set local request.jwt.claim.sub = '${MICAELA}';
     set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
     insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, registrado_por)
     select 'entre_cuentas', :'hoy'::date, :'fuerte', :'lider', 50, p.id from public.personas p limit 1;`,
    { sesionDe: null, texto: "Solo el líder anota" },
  ),
);

caso("no se lleva cero, un negativo ni con fecha futura", () =>
  falla(LLEVAR(0)) ?? falla(LLEVAR(-5)) ?? falla(`select retail.registrar_movimiento_dinero('entre_cuentas', 50, :'fuerte', :'lider', :'hoy'::date + 1, null, 0, null, null, null);`, { texto: "futura" }),
);

caso("el camino de vuelta y las demás parejas siguen cerradas", () =>
  falla(LLEVAR(50, { de: "lider", a: "fuerte", token: "null" }), { texto: "no va entre esas cuentas" }) ??
  falla(LLEVAR(50, { de: "fuerte", a: "banco", token: "null" }), { texto: "no va entre esas cuentas" }) ??
  falla(LLEVAR(50, { de: "banco", a: "lider", token: "null" }), { texto: "no va entre esas cuentas" }),
);

caso("después se deposita al banco con el depósito de siempre, y lo del líder vuelve a donde estaba", () =>
  igual(
    dentro(
      `select ${SALDO("lider")}::numeric(12,2) as l0, ${SALDO("banco")}::numeric(12,2) as b0 \\gset
       \\o /dev/null
       ${LLEVAR(300)}
       select retail.registrar_movimiento_dinero('deposito', 300, :'lider', :'banco', :'hoy'::date, 'voucher de prueba', 0, null, null, null);
       ${AL_TERMINAR}
       \\o
       select (${SALDO("lider")} - :'l0'::numeric)::numeric(12,2) || '|' || (${SALDO("banco")} - :'b0'::numeric)::numeric(12,2);`,
    )
      .split("\n")
      .pop(),
    "0.00|300.00",
  ),
);

caso("anularlo devuelve la plata a la caja fuerte", () =>
  igual(
    dentro(
      `select ${SALDO("fuerte")}::numeric(12,2) as f0 \\gset
       select retail.registrar_movimiento_dinero('entre_cuentas', 300, :'fuerte', :'lider', :'hoy'::date, null, 0, null, null, null) as mov \\gset
       \\o /dev/null
       select retail.anular_movimiento_dinero(:'mov'::uuid, 'prueba');
       ${AL_TERMINAR}
       \\o
       select (${SALDO("fuerte")} - :'f0'::numeric)::numeric(12,2);`,
    )
      .split("\n")
      .pop(),
    "0.00",
  ),
);

console.log(fallas ? `\n${fallas} caso(s) con falla.` : "\nTodo bien.");
process.exit(fallas ? 1 : 0);

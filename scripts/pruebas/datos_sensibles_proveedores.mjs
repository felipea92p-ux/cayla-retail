#!/usr/bin/env node
/**
 * Prueba del punto 18 de la auditoría del 2026-10-13 (decisiones de Felipe del mismo día):
 *   · `20261013161000_datos_bancarios_de_proveedores.sql`: el CCI, la cuenta, el Yape y el titular de un proveedor solo los ve
 *     quien ve Proveedores, Por pagar o Cuentas y dinero; cada cambio de cuenta queda en un historial y avisa al líder.
 *
 * Cuentas del seed: el líder (…001) y una integrante (…003) cuyo rol ve Caja y NO ve Proveedores, Por pagar ni Cuentas y
 * dinero. Cada caso corre en una transacción que TERMINA EN ROLLBACK con la migración aplicada dentro (o deshecha, en el
 * control): el Postgres local compartido no cambia.
 *
 * USO: pnpm pruebas:datos-sensibles-proveedores   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACIONES = leer("20261013161000_datos_bancarios_de_proveedores.sql");
// Lo que deshace el control (que prueba que el hueco existía), dentro de su transacción: la lectura de la tabla entera. En el CI
// la migración ya está aplicada, así que «sin migración» se arma deshaciendo.
const DESHACER = `grant select on retail.proveedores to authenticated;`;
const LIDER = "22222222-2222-4222-8222-000000000001";
const INTEGRANTE = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Un proveedor con cuenta cargada (primera carga: antes no tenía); deja `:prov` y `:rol_integrante`. */
const ESCENA = `
select id as prov from retail.proveedores order by nombre limit 1 \\gset
select c.rol_id as rol_integrante from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${INTEGRANTE}' \\gset
update retail.proveedores set banco = 'BCP', cci = '00219300123456789012', titular_cuenta = 'Proveedor de prueba' where id = :'prov';
`;

/** Ejecuta `cuerpo` con la sesión de `quien` (rol authenticated: aplican permisos y políticas). */
const como = (quien, cuerpo) =>
  `set local role authenticated;\nset local request.jwt.claim.sub = '${quien}';\nset local request.jwt.claim.role = 'authenticated';\n${cuerpo}\nreset role;`;

const dentro = (cuerpo, { conMigracion = true } = {}) =>
  psql(`begin;\n${conMigracion ? MIGRACIONES : DESHACER}\n${ESCENA}\n${cuerpo}\nrollback;`);

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}
const pasa = (sql, opciones) => () => {
  try {
    const salida = dentro(sql, opciones);
    if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida || "(vacía)"}`;
  } catch (e) {
    return `se rechazó y debía pasar: ${String(e.stderr ?? e.message).split("\n")[0]}`;
  }
};
const rechaza = (sql, patron) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!patron.test(String(e.stderr))) throw e;
  }
};

// Datos bancarios.
caso(
  "CONTROL: sin la migración, la integrante (sin Proveedores) lee el CCI de la tabla (el hueco existía)",
  pasa(como(INTEGRANTE, `select cci = '00219300123456789012' from retail.proveedores where id = :'prov';`), { conMigracion: false })
);
caso(
  "la integrante ya no puede leer el CCI de la tabla",
  rechaza(como(INTEGRANTE, `select cci from retail.proveedores where id = :'prov';`), /permission denied for (column|table)/)
);
caso("la integrante sigue leyendo el nombre y el RUC (las pantallas de compras no cambian)", pasa(como(INTEGRANTE, `select count(*) > 0 from retail.proveedores where nombre is not null and ruc is not distinct from ruc;`)));
caso(
  "fn_proveedores le devuelve los datos bancarios en blanco a la integrante",
  pasa(como(INTEGRANTE, `select cci is null and banco is null and titular_cuenta is null from retail.fn_proveedores() where id = :'prov';`))
);
caso("fn_proveedores se los devuelve al líder", pasa(como(LIDER, `select cci = '00219300123456789012' and banco = 'BCP' from retail.fn_proveedores() where id = :'prov';`)));
caso("la ficha (fn_proveedor_datos_bancarios) no le da nada a la integrante", pasa(como(INTEGRANTE, `select count(*) = 0 from retail.fn_proveedor_datos_bancarios(:'prov');`)));
caso(
  "si su rol pasa a ver Por pagar, la integrante sí los ve",
  pasa(`insert into retail.rol_modulos (rol_id, modulo) values (:'rol_integrante', 'por_pagar') on conflict do nothing;
${como(INTEGRANTE, `select cci = '00219300123456789012' from retail.fn_proveedor_datos_bancarios(:'prov');`)}`)
);

caso(
  "la lista de facturas de proveedor (compras_resumen, que corre con los permisos de quien la lee) sigue funcionando para el líder y la integrante",
  pasa(`${como(LIDER, "select count(*) >= 0 as _l from retail.compras_resumen \\gset")}
${como(INTEGRANTE, "select count(*) >= 0 from retail.compras_resumen;")}`)
);

caso(
  "un líder con Proveedores, Por pagar y Cuentas y dinero ocultos igual ve la cuenta que puede editar (si no, guardar la borraría)",
  pasa(`insert into retail.lider_modulos_ocultos (modulo) select m from unnest(array['proveedores', 'por_pagar', 'cuentas_dinero']) m on conflict do nothing;
${como(LIDER, `select cci = '00219300123456789012' from retail.fn_proveedor_datos_bancarios(:'prov');`)}`)
);

// Historial y aviso.
caso(
  "cambiar el CCI deja una fila con antes y después",
  pasa(`update retail.proveedores set cci = '00219300999999999999' where id = :'prov';
select count(*) = 1 from retail.proveedores_cambios_bancarios where proveedor_id = :'prov' and campo = 'cci'
   and antes = '00219300123456789012' and despues = '00219300999999999999';`)
);
caso(
  "cambiar el nombre, o volver a guardar la misma cuenta, no anota nada",
  pasa(`select count(*) as antes from retail.proveedores_cambios_bancarios \\gset
update retail.proveedores set nombre = nombre || ' ' where id = :'prov';
update retail.proveedores set cci = cci where id = :'prov';
select count(*) = :antes from retail.proveedores_cambios_bancarios;`)
);
caso(
  "un proveedor nuevo con cuenta también se anota (es una cuenta nueva)",
  pasa(`insert into retail.proveedores (nombre, cci) values ('Proveedor nuevo de prueba', '00211111111111111111') returning id as nuevo \\gset
select count(*) = 1 from retail.proveedores_cambios_bancarios where proveedor_id = :'nuevo' and campo = 'cci' and antes is null;`)
);
caso("las cuentas de tienda no pueden leer el historial directo", rechaza(como(INTEGRANTE, `select count(*) from retail.proveedores_cambios_bancarios;`), /permission denied/));
caso(
  "la primera carga de una cuenta queda en el historial pero no enciende el aviso",
  pasa(como(LIDER, `select (retail.fn_cuentas_bancarias_cambiadas(7) ->> 'cambios')::int = 0;`))
);
caso(
  "una cuenta que ya existía y otra persona cambió enciende el aviso del líder",
  pasa(`update retail.proveedores set cci = '00219300999999999999' where id = :'prov';
${como(LIDER, `select (retail.fn_cuentas_bancarias_cambiadas(7) ->> 'cambios')::int = 1;`)}`)
);
caso(
  "el cambio que hizo la propia líder no la avisa a ella",
  pasa(`set local request.jwt.claim.sub = '${LIDER}';
set local request.jwt.claim.role = 'authenticated';
update retail.proveedores set cci = '00219300888888888888' where id = :'prov';
reset request.jwt.claim.sub;
select (select count(*) from retail.proveedores_cambios_bancarios where proveedor_id = :'prov' and cambiado_por is not null) >= 1 as _firmado \\gset
${como(LIDER, `select (retail.fn_cuentas_bancarias_cambiadas(7) ->> 'cambios')::int = 0;`)}`)
);
caso("el aviso no le responde a la integrante (es para el líder)", pasa(como(INTEGRANTE, `select retail.fn_cuentas_bancarias_cambiadas(7) is null;`)));

// Re-pegable.
caso("pegar la migración dos veces no cambia nada la segunda", pasa(`${MIGRACIONES}\nselect not has_column_privilege('authenticated', 'retail.proveedores', 'cci', 'select');`));

console.log(`\n${total - fallas}/${total} casos pasan.`);
process.exit(fallas ? 1 : 0);

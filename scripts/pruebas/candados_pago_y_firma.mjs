#!/usr/bin/env node
/**
 * Prueba de los dos candados de `20261013155000_candados_anticipo_y_hora_declarada.sql` (auditoría 2026-10-13, punto 17):
 *
 * 1. Un pago «anticipo» solo existe en una venta que viene de un apartado (disparador diferido sobre `venta_pagos`).
 * 2. La hora declarada (`x-momento`) solo vale en lo que la web encola sin conexión: la venta, las recepciones y las altas
 *    (`registrar_venta`, `recibir_lote`, `recibir_envio`, `crear_producto_con_stock_inicial`, `crear_producto_con_variantes`).
 *    Para verlo sin depender de marcajes reales, cada caso manda una hora del año 2020: donde la hora vale, la base la rechaza
 *    por «fuera de rango»; donde no vale, la ignora y no protesta.
 *
 * Cada caso corre en una transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro (o deshecha, en los controles):
 * el Postgres local compartido no cambia. El disparador es diferido, así que cada caso lo fuerza con `set constraints … immediate`.
 *
 * USO: pnpm pruebas:candados-pago-y-firma   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261013155000_candados_anticipo_y_hora_declarada.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

// Lo que deshace la migración, para los controles (que prueban que el hueco existía): sin el disparador y con la línea de
// `x-momento` como estaba. El bloque nuevo se reconoce por su primera línea propia.
const DESHACER = `
drop trigger if exists venta_pagos_anticipo_solo_de_apartado on retail.venta_pagos;
do $d$
declare v_def text := pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure);
        v_ini int; v_fin int;
begin
  v_ini := position('  -- Auditoría 2026-10-13, punto 17' in v_def);
  if v_ini = 0 then return; end if;
  v_fin := position('    v_texto := null;' || chr(10) || '  end if;' || chr(10) in v_def);
  execute substr(v_def, 1, v_ini - 1) || substr(v_def, v_fin + length('    v_texto := null;' || chr(10) || '  end if;' || chr(10)));
end;
$d$;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Ventas de la base local: una que viene de un apartado, una que no, y un apartado abierto sin venta. */
const ESCENA = `
select v.id as con_apartado from retail.ventas v where exists (select 1 from retail.separaciones s where s.venta_id = v.id) limit 1 \\gset
select v.id as sin_apartado from retail.ventas v where not exists (select 1 from retail.separaciones s where s.venta_id = v.id) limit 1 \\gset
select s.id as apartado_abierto from retail.separaciones s where s.venta_id is null limit 1 \\gset
`;

const dentro = (cuerpo, { conCandado = true } = {}) =>
  psql(`begin;\n${conCandado ? MIGRACION : DESHACER}\n${ESCENA}\n${cuerpo}\nrollback;`);

const PAGO = (venta, metodo) => `
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'${venta}', '${metodo}', 1);
set constraints all immediate;
select true;`;

/** Llama a `fn_actor_persona_id` como si viniera por PostgREST a `ruta` (o sin ruta), con una hora declarada del año 2020. */
const FIRMA = (ruta) => `
set local request.jwt.claim.sub = '${FELIPE}';
set local request.headers = '{"x-momento": "2020-01-01T12:00:00Z"}';
${ruta ? `set local request.path = '${ruta}';` : ""}
-- coalesce y no «… or true»: Postgres simplifica «x or true» sin llamar a la función.
select coalesce(retail.fn_actor_persona_id(true)::text, 'nadie') <> '';`;

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
    if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida}`;
  } catch (e) {
    return `se rechazó y debía pasar: ${String(e.stderr ?? e.message).split("\n")[0]}`;
  }
};
const rechaza = (sql, patron, opciones) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql, opciones)}`;
  } catch (e) {
    if (!patron.test(String(e.stderr))) throw e;
  }
};
/** Pasa si la llamada no se rechaza por la hora (puede fallar por otra razón de la firma, que aquí no se mide). */
const sinRechazoPorHora = (sql, opciones) => () => {
  try {
    dentro(sql, opciones);
  } catch (e) {
    if (/fuera de rango/.test(String(e.stderr))) return `la hora declarada se aplicó y debía ignorarse: ${String(e.stderr).split("\n")[0]}`;
  }
};

const ANTICIPO_SIN_APARTADO = /anticipo solo existe al entregar un apartado/;
const FUERA_DE_RANGO = /fuera de rango/;

// 1. El anticipo.
caso("CONTROL: sin el candado, una venta sin apartado acepta un pago «anticipo» (el hueco existía)", pasa(PAGO("sin_apartado", "anticipo"), { conCandado: false }));
caso("un pago «anticipo» en una venta que no viene de un apartado se rechaza", rechaza(PAGO("sin_apartado", "anticipo"), ANTICIPO_SIN_APARTADO));
caso("un pago «anticipo» en una venta que viene de un apartado pasa", pasa(PAGO("con_apartado", "anticipo")));
caso(
  "el orden de entregar_separacion pasa: el anticipo se inserta ANTES de enlazar el apartado (el candado es diferido)",
  pasa(`insert into retail.venta_pagos (venta_id, metodo, monto) values (:'sin_apartado', 'anticipo', 1);
update retail.separaciones set estado = 'entregada', venta_id = :'sin_apartado', entregada_en = now() where id = :'apartado_abierto';
set constraints all immediate;
select true;`)
);
caso("los demás medios no cambian: efectivo en una venta sin apartado pasa", pasa(PAGO("sin_apartado", "efectivo")));
caso("cambiar a «anticipo» una fila ya guardada también se revisa", rechaza(`
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'sin_apartado', 'yape', 1) returning id as pago \\gset
update retail.venta_pagos set metodo = 'anticipo', referencia = null where id = :'pago';
set constraints all immediate;
select true;`, ANTICIPO_SIN_APARTADO));

// 2. La hora declarada.
caso("CONTROL: sin el candado, un retiro de caja aplicaba la hora declarada (y la rechazaba por fuera de rango)", rechaza(FIRMA("/rpc/registrar_retiro_caja"), FUERA_DE_RANGO, { conCandado: false }));
caso("en un retiro de caja la hora declarada se ignora (firma quien está de turno ahora)", sinRechazoPorHora(FIRMA("/rpc/registrar_retiro_caja")));
caso("en un ajuste de stock la hora declarada se ignora", sinRechazoPorHora(FIRMA("/rpc/ajustar_inventario")));
caso("en la venta sin conexión la hora declarada sigue valiendo (registrar_venta)", rechaza(FIRMA("/rpc/registrar_venta"), FUERA_DE_RANGO));
caso("en el alta sin conexión la hora declarada sigue valiendo (crear_producto_con_stock_inicial)", rechaza(FIRMA("/rpc/crear_producto_con_stock_inicial"), FUERA_DE_RANGO));
caso("en la recepción sin conexión la hora declarada sigue valiendo (recibir_lote, cola genérica)", rechaza(FIRMA("/rpc/recibir_lote"), FUERA_DE_RANGO));
caso("en la recepción de un envío sin conexión también (recibir_envio)", rechaza(FIRMA("/rpc/recibir_envio"), FUERA_DE_RANGO));
caso("con un prefijo delante de la ruta sigue reconociendo la función (se mira el final)", rechaza(FIRMA("/rest/v1/rpc/registrar_venta"), FUERA_DE_RANGO));
caso("un nombre que solo EMPIEZA igual no cuela (registrar_venta_falsa ignora la hora)", sinRechazoPorHora(FIRMA("/rpc/registrar_venta_falsa")));
caso("sin ruta conocida (llamada directa, no por PostgREST) queda como antes", rechaza(FIRMA(null), FUERA_DE_RANGO));

// 3. Re-pegable, también sobre una versión vieja de este mismo parche.
const PARCHE_VIEJO = `select pg_temp.reemplazar('retail.fn_actor_persona_id(boolean)', $v$  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
$v$, $n$  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  -- Auditoría 2026-10-13, punto 17: versión vieja de prueba.
  if v_texto is not null
     and coalesce(current_setting('request.path', true), '') <> ''
     and current_setting('request.path', true) not in ('/rpc/registrar_venta', '/rpc/crear_producto_con_stock_inicial') then
    v_texto := null;
  end if;
$n$, 1);`;
caso(
  "pegada sobre una versión vieja del parche, la quita y deja un solo bloque: la recepción conserva su hora",
  rechaza(`${DESHACER}
${MIGRACION.slice(0, MIGRACION.indexOf("select pg_temp.reemplazar("))}
${PARCHE_VIEJO}
${MIGRACION}
${FIRMA("/rpc/recibir_lote")}`, FUERA_DE_RANGO, { conCandado: false })
);
// 3. Re-pegable.
caso("pegar la migración dos veces no cambia nada la segunda", pasa(`${MIGRACION}\nselect count(*) = 1 from pg_trigger where tgname = 'venta_pagos_anticipo_solo_de_apartado';`));

console.log(`\n${total - fallas}/${total} casos pasan.`);
process.exit(fallas ? 1 : 0);

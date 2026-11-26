#!/usr/bin/env node
/**
 * Prueba de `20261121164000_cobro_al_numero_de_cada_duena.sql` (ADR-0683, actividad 4): en Vender, un Yape, Plin o transferencia de una prenda de una aliada
 * se anota en el número de su dueña, si la caja lo pide (`x-cuentas-pagos`), sin tocar `registrar_venta`.
 *
 * La escena: CLAURE en Lima con su Yape (como en producción) y «Otra Aliada» en Trujillo con su Yape y su cuenta bancaria. Cada caso inserta una venta y sus
 * pagos como lo hace `registrar_venta` (el disparador `fn_venta_pagos_sellar` sella cada pago) y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:aliadas-cobro   (necesita el stack local: `npx supabase start`; BASE_PG para otra base)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const M4 = leer("20261121164000_cobro_al_numero_de_cada_duena.sql");
const MIGRACIONES = `\\o /dev/null\n${[
  "20261121152000_empresas_aliadas_desde_configuracion.sql",
  "20261121160000_diario_y_balance_con_cualquier_aliada.sql",
  "20261121162000_cuenta_con_cada_duena.sql",
].map(leer).join("\n")}\n${M4}\n\\o\n`;
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const ESCENA = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select id as lim from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1 \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
update retail.empresas set cuenta_corriente_desde = coalesce(cuenta_corriente_desde, retail.fn_hoy_lima() - 1) where id = :'claure';
insert into retail.empresas (id, clave, nombre, orden, activo, ruc, regimen, cuenta_corriente_desde)
  values (gen_random_uuid(), 'otra_prueba', 'Otra Aliada', 90, true, '10999900011', 'mype', retail.fn_hoy_lima() - 1) returning id as otra \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'cayla', :'tru'), (:'otra', :'tru'), (:'cayla', :'lim'), (:'claure', :'lim') on conflict do nothing;
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, empresa_id, saldo_inicial, orden, numero, medio_ajeno)
  values ('Yape de Otra', 'banco', '104', :'otra', 0, 900, '911111111', 'yape') returning id as yape_otra \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, empresa_id, saldo_inicial, orden, numero, medio_ajeno)
  values ('BCP de Otra', 'banco', '104', :'otra', 0, 900, '191-0000000-0-45', 'transferencia') returning id as banco_otra \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, empresa_id, saldo_inicial, orden, numero, medio_ajeno)
  select 'Yape de Claudia prueba', 'banco', '104', :'claure', 0, 900, '922222222', 'yape'
   where not exists (select 1 from retail.cuentas_dinero where empresa_id = :'claure' and archivada_en is null);
select id as yape_claure from retail.cuentas_dinero where empresa_id = :'claure' and archivada_en is null order by created_at limit 1 \\gset
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as vta \\gset
`;
const PEDIR = (lista) => `select set_config('request.headers', json_build_object('x-cuentas-pagos', ${lista})::text, true) as _h \\gset`;
const PAGO = (metodo, monto, como) => `insert into retail.venta_pagos (venta_id, metodo, monto) values (:'vta', '${metodo}', ${monto}) returning coalesce(cuenta_dinero_id::text, '-') as ${como} \\gset`;

const dentro = (cuerpo) => psql(`begin;\n${MIGRACIONES}${ESCENA}\n${cuerpo}\nrollback;`);
const ultima = (s) => String(s).split("\n").at(-1);

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join("\n    ")}`);
  }
}
const es = (sql, esperado) => {
  const r = ultima(dentro(sql));
  return r === esperado ? null : `salió «${r}», se esperaba «${esperado}»`;
};

console.log("— El cobro al número de cada dueña —");

caso("un Yape que la caja anota en el número de la aliada se sella en su cuenta", () =>
  es(`${PEDIR(`json_build_array(json_build_object('metodo', 'yape', 'monto', 59, 'cuenta', :'yape_otra'))`)}
${PAGO("yape", 59, "c")}
select (:'c' = :'yape_otra')::text;`, "true"));

caso("sin pedido, el Yape se sella como siempre (en una cuenta de CAYLA o sin cuenta, nunca en la de la aliada)", () =>
  es(`${PAGO("yape", 59, "c")}
select (coalesce((select (empresa_id = :'cayla')::text from retail.cuentas_dinero where id::text = :'c'), 'sin cuenta') in ('true', 'sin cuenta'))::text;`, "true"),
);

caso("la cuenta de una aliada de OTRA tienda no se acepta: el pago se sella como siempre", () =>
  es(`${PEDIR(`json_build_array(json_build_object('metodo', 'yape', 'monto', 59, 'cuenta', :'yape_claure'))`)}
${PAGO("yape", 59, "c")}
select (:'c' <> :'yape_claure')::text;`, "true"));

caso("una transferencia anotada en la cuenta bancaria de la aliada se sella ahí", () =>
  es(`${PEDIR(`json_build_array(json_build_object('metodo', 'transferencia', 'monto', 100, 'cuenta', :'banco_otra'))`)}
${PAGO("transferencia", 100, "c")}
select (:'c' = :'banco_otra')::text;`, "true"));

caso("el pedido se usa una sola vez: el segundo pago igual va por lo de siempre", () =>
  es(`${PEDIR(`json_build_array(json_build_object('metodo', 'yape', 'monto', 59, 'cuenta', :'yape_otra'))`)}
${PAGO("yape", 59, "c1")}
${PAGO("yape", 59, "c2")}
select (:'c1' = :'yape_otra')::text || '|' || (:'c2' <> :'yape_otra')::text;`, "true|true"));

caso("un pedido de otro medio o de otro monto no se mezcla", () =>
  es(`${PEDIR(`json_build_array(json_build_object('metodo', 'plin', 'monto', 59, 'cuenta', :'yape_otra'), json_build_object('metodo', 'yape', 'monto', 60, 'cuenta', :'yape_otra'))`)}
${PAGO("yape", 59, "c")}
select (:'c' <> :'yape_otra')::text;`, "true"));

caso("un encabezado roto no tumba la venta", () =>
  es(`select set_config('request.headers', '{"x-cuentas-pagos": "no es json"}', true) as _h \\gset
${PAGO("yape", 59, "c")}
select 'sigue';`, "sigue"));

caso("lo cobrado directo en su número no se le debe (no es plata que tenga CAYLA)", () => {
  const r = ultima(
    dentro(`${PEDIR(`json_build_array(json_build_object('metodo', 'yape', 'monto', 59, 'cuenta', :'yape_otra'))`)}
${PAGO("yape", 59, "c")}
select retail.fn_aliada_saldo_a(:'otra', retail.fn_hoy_lima());`),
  );
  return Number(r) === 0 ? null : `se le debería 0 y sale ${r}`;
});

caso("fn_cuentas_de_aliadas_en_sede: los dos números de la aliada en Trujillo, con su medio", () =>
  es(`set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
select string_agg(medio || ':' || numero, ',' order by medio) from retail.fn_cuentas_de_aliadas_en_sede(:'tru') where clave = 'otra_prueba';`, "transferencia:191-0000000-0-45,yape:911111111"));

caso("quien opera Trujillo los ve; anon no ejecuta", () =>
  es(`set local request.jwt.claim.sub = '${MICAELA}';
set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
set local role authenticated;
select (count(*) >= 2)::text from retail.fn_cuentas_de_aliadas_en_sede(:'tru') where clave = 'otra_prueba';
reset role;
select ((select count(*) >= 2 from retail.fn_cuentas_de_aliadas_en_sede(:'tru') where clave = 'otra_prueba') and not has_function_privilege('anon', 'retail.fn_cuentas_de_aliadas_en_sede(uuid)', 'execute'))::text;`, "true"));

caso("pegar la migración dos veces no falla", () => {
  const r = ultima(psql(`begin;\n${MIGRACIONES}\n\\o /dev/null\n${M4}\n\\o\nselect 'ok';\nrollback;`));
  return r === "ok" ? null : `salió ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

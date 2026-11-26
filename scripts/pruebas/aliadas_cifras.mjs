#!/usr/bin/env node
/**
 * Prueba de `20261121173000_cifras_de_cayla_sin_ninguna_aliada.sql` (ADR-0683, actividad 6): las cifras de CAYLA dejan fuera lo de cualquier empresa
 * aliada, también después de darla de baja; con CLAURE, igual que antes.
 *
 * La escena: «Otra Aliada», nueva, en Trujillo, con cuenta desde hace 10 días; una venta de hoy en Trujillo con una prenda suya y una de CAYLA, y otra
 * de hace 20 días (antes de su arranque). Cada caso TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:aliadas-cifras   (necesita el stack local: `npx supabase start`; CONTENEDOR_PG / BASE_PG para otra base)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const M6 = leer("20261121173000_cifras_de_cayla_sin_ninguna_aliada.sql");
const MIGRACIONES = `\\o /dev/null\n${[
  "20261121152000_empresas_aliadas_desde_configuracion.sql",
  "20261121160000_diario_y_balance_con_cualquier_aliada.sql",
  "20261121162000_cuenta_con_cada_duena.sql",
  "20261121164000_cobro_al_numero_de_cada_duena.sql",
  "20261121171000_campanas_y_gastos_por_aliada.sql",
].map(leer).join("\n")}\n${M6}\n\\o\n`;
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const ID = (n) => `'00000000-0000-4683-8000-0000000000${n}'`;
const ESCENA = `
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select retail.fn_empresa_casa_id() as cayla \\gset
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select va.id as va_otra, va.producto_id as p_otra from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_casa, va.producto_id as p_casa from retail.variantes va where va.producto_id <> :'p_otra' order by va.id limit 1 \\gset
insert into retail.empresas (id, clave, nombre, orden, activo, ruc, regimen, cuenta_corriente_desde)
  values (gen_random_uuid(), 'otra_prueba', 'Otra Aliada', 90, true, '10999900011', 'mype', :'hoy'::date - 10) returning id as otra \\gset
set local session_replication_role = replica;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'cayla', :'tru'), (:'otra', :'tru') on conflict do nothing;
update retail.productos set empresa_id = :'otra' where id = :'p_otra';
update retail.productos set empresa_id = :'cayla' where id = :'p_casa';
insert into retail.ventas (id, ubicacion_id, created_at, estado) values
  (${ID("01")}, :'tru', now() - interval '1 minute', 'completada'),
  (${ID("02")}, :'tru', now() - interval '20 days', 'completada');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("51")}, ${ID("01")}, :'va_otra', 1, 80, 10),
  (${ID("52")}, ${ID("01")}, :'va_casa', 1, 50, 10),
  (${ID("53")}, ${ID("02")}, :'va_otra', 1, 80, 10);
set local session_replication_role = origin;
`;
const ES = (item) => `retail.fn_item_es_de_claure(${ID(item)}, :'tru', (select v.created_at from retail.ventas v join retail.venta_items i on i.venta_id = v.id where i.id = ${ID(item)}))::text`;

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

console.log("— Las cifras de CAYLA sin ninguna aliada —");

caso("la prenda de una aliada nueva vendida hoy no es de CAYLA; la de CAYLA sí", () => es(`select ${ES("51")} || '|' || ${ES("52")};`, "true|false"));

caso("lo vendido antes de que arranque su cuenta sigue siendo de CAYLA", () => es(`select ${ES("53")};`, "false"));

caso("al darla de baja, su pasado sigue siendo suyo (no vuelve a CAYLA)", () =>
  es(`update retail.empresas set activo = false where id = :'otra';
select ${ES("51")};`, "true"));

caso("fn_lineas_de_claure (en lote) dice lo mismo que la de una línea", () =>
  es(`select string_agg(x::text, ',' order by x) from retail.fn_lineas_de_claure(now() - interval '30 days', 'infinity', :'tru') x
 where x in (${ID("51")}, ${ID("52")}, ${ID("53")});`, "00000000-0000-4683-8000-000000000051"));

caso("el Inicio deja fuera de «Hoy» lo de la aliada: 80 de una venta con una línea de CAYLA", () =>
  es(`set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
select (r->>'hay_claure') || '|' || (r->'hoy'->0->>'de_claure') || '|' || (r->'hoy'->0->>'lineas_de_casa')
  from (select retail.fn_claure_de_hoy(:'tru') r) x;`, "true|80.00|1"));

caso("una tienda sin aliadas no tiene nada que dejar fuera", () =>
  es(`delete from retail.empresa_sedes where empresa_id = :'otra';
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
select retail.fn_claure_de_hoy(:'tru')->>'hay_claure';`, "false"));

caso("ninguna cifra de CAYLA (fuera de las fn_claure_* de su cuenta) pregunta solo por CLAURE activa", () =>
  es(`select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname not like 'fn\\_claure\\_%' escape '\\'
   and p.prosrc like '%e.clave = ''claure'' and e.activo and e.cuenta_corriente_desde is not null%';`, "0"));

caso("«lo vendido en un período» (Impuestos, Estado de resultados) suma a todas las aliadas", () =>
  es(`select (position('fn_aliadas_ventas(' in pg_get_functiondef('retail.fn_claure_ventas_en(date, date, uuid)'::regprocedure)) > 0)::text;`, "true"));

caso("pegar la migración dos veces no falla", () => {
  const r = ultima(psql(`begin;\n${MIGRACIONES}\n\\o /dev/null\n${M6}\n\\o\nselect 'ok';\nrollback;`));
  return r === "ok" ? null : `salió ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

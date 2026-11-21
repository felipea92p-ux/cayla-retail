#!/usr/bin/env node
/**
 * Prueba de `20261121171000_campanas_y_gastos_por_aliada.sql` (ADR-0683, actividad 5): las campañas y el reparto de gastos valen para cualquier empresa
 * aliada, no solo para CLAURE.
 *
 * La escena: CLAURE en Lima (como en producción) y «Otra Aliada», nueva, en Trujillo. Cada caso TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:aliadas-campanas-gastos   (necesita el stack local: `npx supabase start`; BASE_PG / CONTENEDOR_PG para otra base)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const M5 = leer("20261121171000_campanas_y_gastos_por_aliada.sql");
const MIGRACIONES = `\\o /dev/null\n${[
  "20261121152000_empresas_aliadas_desde_configuracion.sql",
  "20261121160000_diario_y_balance_con_cualquier_aliada.sql",
  "20261121162000_cuenta_con_cada_duena.sql",
  "20261121164000_cobro_al_numero_de_cada_duena.sql",
].map(leer).join("\n")}\n${M5}\n\\o\n`;
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

const COMO = (id) => `set local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;
const ESCENA = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1 \\gset
select id as lim from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1 \\gset
select retail.fn_empresa_casa_id() as cayla \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
update retail.empresas set cuenta_corriente_desde = coalesce(cuenta_corriente_desde, retail.fn_hoy_lima() - 30), activo = true where id = :'claure';
insert into retail.empresas (id, clave, nombre, orden, activo, ruc, regimen, cuenta_corriente_desde)
  values (gen_random_uuid(), 'otra_prueba', 'Otra Aliada', 90, true, '10999900011', 'mype', retail.fn_hoy_lima() - 30) returning id as otra \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'cayla', :'tru'), (:'otra', :'tru'), (:'cayla', :'lim'), (:'claure', :'lim') on conflict do nothing;
`;
const GASTO = (sede, categoria, monto, igv) => `set local session_replication_role = replica;
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, registrado_por)
  values (:'${sede}', '${categoria}', 'Prueba', retail.fn_hoy_lima(), ${monto}, ${igv}, 'transferencia', 'vigente', '${FELIPE}') returning id as gasto \\gset
set local session_replication_role = origin;`;

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
const falla = (sql, texto) => {
  try {
    dentro(sql);
    return "pasó y debía fallar";
  } catch (e) {
    return String(e.stderr ?? e.message).includes(texto) ? null : `falló por otra cosa: ${String(e.stderr ?? e.message).split("\n")[0]}`;
  }
};
const alcanza = (empresa, incluye) => `retail.fn_campana_alcanza_empresa(${empresa}, ${incluye})::text`;

console.log("— Campañas —");

caso("lo de CAYLA (y lo sin dueña) entra siempre, incluya o no a las aliadas", () =>
  es(`select ${alcanza(":'cayla'", "false")} || ${alcanza("null", "false")} || ${alcanza(":'cayla'", "null")};`, "truetruetrue"));

caso("CLAURE sigue como hoy: entra solo si la campaña la incluye", () =>
  es(`select ${alcanza(":'claure'", "true")} || '|' || ${alcanza(":'claure'", "false")};`, "true|false"));

caso("una aliada nueva queda fuera aunque la campaña incluya a las aliadas", () =>
  es(`select ${alcanza(":'otra'", "true")} || '|' || (select entra_a_campanas::text from retail.empresas where id = :'otra');`, "false|false"));

caso("con el interruptor encendido por el Admin, entra si la campaña la incluye (y queda en la historia)", () =>
  es(`${COMO(FELIPE)}
select retail.fijar_aliada_en_campanas(:'otra', true);
reset role;
select ${alcanza(":'otra'", "true")} || '|' || ${alcanza(":'otra'", "false")} || '|' || (select count(*)::text from retail.configuracion_historial where que = 'aliada_campanas' and detalle->>'empresa_id' = :'otra');`, "true|false|1"));

caso("quien no es Admin no enciende a una aliada", () =>
  falla(`${COMO(MICAELA)}
select retail.fijar_aliada_en_campanas(:'otra', true);`, "Solo un Admin"));

caso("no se enciende a CAYLA ni a una aliada dada de baja", () =>
  falla(`update retail.empresas set activo = false where id = :'otra';
${COMO(FELIPE)}
select retail.fijar_aliada_en_campanas(:'otra', true);`, "no existe o está dada de baja"));

caso("ninguna función de ofertas nombra a CLAURE a mano", () =>
  es(`select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.prosrc like '%p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = ''claure'')%';`, "0"));

console.log("\n— Gastos —");

caso("CLAURE trae su reparto de antes, igual que su tabla", () =>
  es(`select (select count(*) from retail.gasto_reparto_claure where pct_claure > 0)::text || '|' ||
       (select count(*) from retail.gasto_reparto_aliadas r join retail.gasto_reparto_claure c on c.categoria = r.categoria and c.pct_claure = r.pct where r.empresa_id = :'claure' and r.pct > 0)::text;`,
    ultima(psql(`select (select count(*) from retail.gasto_reparto_claure where pct_claure > 0)::text || '|' || (select count(*) from retail.gasto_reparto_claure where pct_claure > 0)::text;`))));

caso("una aliada nueva empieza en 0 %: su gasto de luz es todo de CAYLA", () =>
  es(`${GASTO("tru", "luz", 100, 0)}
select count(*)::text from retail.fn_aliada_gastos_base(:'otra', retail.fn_hoy_lima() - 1, retail.fn_hoy_lima(), true, null);`, "0"));

caso("con 40 %, su parte de una luz de S/ 100 es 40, y el Diario la resta", () =>
  es(`${GASTO("tru", "luz", 100, 0)}
${COMO(FELIPE)}
select retail.guardar_reparto_aliada(:'otra', 'luz', 40);
reset role;
select (select parte::text || '/' || parte_base::text from retail.fn_aliada_gastos_base(:'otra', retail.fn_hoy_lima(), retail.fn_hoy_lima(), true, null) where gasto_id = :'gasto') || '|' ||
       (select parte_base::text from retail.fn_aliadas_gastos_base(retail.fn_hoy_lima(), retail.fn_hoy_lima(), true, null) where gasto_id = :'gasto') || '|' ||
       (select coalesce(sum(debe), 0)::text from retail.fn_asientos_claure(retail.fn_hoy_lima(), retail.fn_hoy_lima(), true, null) a where a.oid = :'gasto' and a.cuenta = '479');`, "40.00/40.00|40.00|40.00"));

caso("la parte de una aliada no toca la de otra tienda: la luz de Lima sigue con lo de CLAURE", () =>
  es(`${GASTO("lim", "luz", 100, 0)}
${COMO(FELIPE)}
select retail.guardar_reparto_aliada(:'otra', 'luz', 40);
reset role;
select count(*)::text from retail.fn_aliada_gastos_base(:'otra', retail.fn_hoy_lima(), retail.fn_hoy_lima(), true, null) where gasto_id = :'gasto';`, "0"));

caso("en una tienda, entre todas las aliadas no pasan de 100 %", () =>
  falla(`insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (:'claure', :'tru') on conflict do nothing;
${COMO(FELIPE)}
select retail.guardar_reparto_aliada(:'otra', 'alquileres', 70);
select retail.guardar_reparto_aliada(:'claure', 'alquileres', 40);`, "no pueden pasar de 100"));

caso("guardar el reparto de CLAURE deja su tabla de antes igual (y la pantalla vieja guarda en la nueva)", () =>
  es(`${COMO(FELIPE)}
select retail.guardar_reparto_aliada(:'claure', 'luz', 35);
select retail.guardar_reparto_claure('agua', 15);
reset role;
select (select pct_claure::text from retail.gasto_reparto_claure where categoria = 'luz') || '|' || (select pct::text from retail.gasto_reparto_aliadas where empresa_id = :'claure' and categoria = 'agua');`, "35.00|15.00"));

caso("«lo que falta del mes» resta la parte de la aliada de esa tienda", () =>
  es(`${COMO(FELIPE)}
select retail.guardar_reparto_aliada(:'otra', 'luz', 40);
reset role;
select retail.fn_parte_de_aliadas('luz', :'tru')::text || '|' || retail.fn_parte_de_aliadas('internet_prueba_no_existe', :'tru')::text;`, "40.00|0"));

caso("solo el líder con Configuración ve o cambia el reparto", () =>
  falla(`${COMO(MICAELA)}
select retail.guardar_reparto_aliada(:'otra', 'luz', 40);`, "lo hace el líder"));

caso("fn_reparto_aliadas lista a cada aliada con sus categorías, la nueva en 0", () =>
  es(`${COMO(FELIPE)}
select (count(*) filter (where clave = 'otra_prueba') > 0 and coalesce(max(pct) filter (where clave = 'otra_prueba'), 0) = 0)::text from retail.fn_reparto_aliadas();`, "true"));

caso("pegar la migración dos veces no falla", () => {
  const r = ultima(psql(`begin;\n${MIGRACIONES}\n\\o /dev/null\n${M5}\n\\o\nselect 'ok';\nrollback;`));
  return r === "ok" ? null : `salió ${r}`;
});

console.log(`\n${total - fallas}/${total} casos${fallas ? ` — ${fallas} fallaron` : ""}`);
process.exit(fallas ? 1 : 0);

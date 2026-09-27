#!/usr/bin/env node
/**
 * Pruebas de «Reposición no toca el piso» (ADR-0208, paso 1; migración 20260926000400_reposicion_no_toca_el_piso.sql).
 *
 * QUÉ PRUEBA. Que el candado esté EN LA BASE: un ajuste con motivo «reposicion» sobre el piso de una tienda que separa
 * piso y almacén se rechaza, suba o baje, con cualquier escritura del motivo; y que todo lo demás siga igual: la
 * «Reposición» en el almacén, el «Conteo físico» en el piso, el ajuste del Taller (sin sububicación), «Reponer»
 * (`mover_interno`) y el mensaje de permiso para quien no puede ajustar. Además, que la migración se pega dos veces sin
 * duplicar el bloque y sin borrar los parches en vivo (firma del responsable y candado por capacidad).
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK (seguro contra una base compartida), como Felipe (líder) o
 * Micaela (colaboradora de Tienda Trujillo) con `set local request.jwt.claim.sub`. `pg_temp.intento` devuelve
 * «SQLSTATE|hint|mensaje» sin abortar la transacción, para verificar después que el stock no se movió.
 *
 * `--en-seco`: carga la migración dentro de cada escenario (sin aplicarla a la base). Sin el flag asume que ya está.
 *
 * USO
 *   pnpm pruebas:reposicion-piso-cerrada            → migración ya aplicada
 *   pnpm pruebas:reposicion-piso-cerrada --en-seco  → la carga en cada escenario
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260926000400_reposicion_no_toca_el_piso.sql"), "utf8");
const PRELUDIO = process.argv.includes("--en-seco") ? MIGRACION : "";
const HINT = "reposicion_piso_cerrada";
const PERMISO = "Solo un líder de equipo puede ajustar stock fuera de una venta";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const ESCENA = (quien) => `
begin;
${PRELUDIO}
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as va from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
-- Un Taller sin piso ni almacén separados: el ajuste va sin sububicación.
select u.id as taller from retail.ubicaciones u where u.tipo = 'taller'
  and not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u.id and s.tipo in ('piso_venta', 'almacen_tienda'))
  order by u.nombre limit 1 \\gset
-- Stock de partida conocido en el almacén para poder mover y bajar (como postgres, dentro del ROLLBACK).
with m as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'va', :'tru', :'alm', 'ajuste', 5, 'conteo_fisico') returning id)
select count(retail.fn_aplicar_movimiento(m.id)::text) as _aplicado from m \\gset
select coalesce(sum(cantidad), 0) as piso0 from retail.stock where variante_id = :'va' and ubicacion_id = :'tru' and sububicacion_id = :'piso' \\gset
select coalesce(sum(cantidad), 0) as alm0 from retail.stock where variante_id = :'va' and ubicacion_id = :'tru' and sububicacion_id = :'alm' \\gset
select count(*) as mov0 from retail.movimientos where variante_id = :'va' \\gset
set local request.jwt.claim.sub = '${quien}';
`;
const AJUSTE = (cantidad, motivo, sub = ":'piso'", ubic = ":'tru'") =>
  `pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', ${cantidad}, %L, null, %L)', :'va', ${ubic}, '${motivo}', ${sub === "null" ? "null::uuid" : sub}))`;
const PISO = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'va' and ubicacion_id = :'tru' and sububicacion_id = :'piso')`;
const ALM = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'va' and ubicacion_id = :'tru' and sububicacion_id = :'alm')`;
const MOVS = `(select count(*) from retail.movimientos where variante_id = :'va')`;

const CASOS = [];
const caso = (nombre, sql, esperado) => CASOS.push({ nombre, sql, esperado });

caso(
  "líder: «Reposición» +2 en el piso se rechaza con su hint y el stock no se mueve",
  `${ESCENA(FELIPE)}select ${AJUSTE(2, "reposicion")} as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2), split_part(:'r', '|', 3) like '«Reposición» no se usa en el piso:%',
  ${PISO} = :piso0, ${MOVS} = :mov0;
rollback;`,
  [`P0001|${HINT}|t|t|t`]
);
caso(
  "líder: «Reposición» −1 en el piso también se rechaza (las prendas no desaparecen del piso sin llegar al almacén)",
  `${ESCENA(FELIPE)}select ${AJUSTE(-1, "reposicion")} as r \\gset
select split_part(:'r', '|', 2), ${MOVS} = :mov0;
rollback;`,
  [`${HINT}|t`]
);
caso(
  "líder: la misma puerta con otra escritura del motivo («Reposición», « reposicion ») sigue cerrada",
  `${ESCENA(FELIPE)}select split_part(${AJUSTE(1, "Reposición")}, '|', 2), split_part(${AJUSTE(1, " REPOSICION ")}, '|', 2);
rollback;`,
  [`${HINT}|${HINT}`]
);
caso(
  "líder: «Reposición» en el ALMACÉN sigue abierta (fuera del alcance de esta puerta)",
  `${ESCENA(FELIPE)}select ${AJUSTE(1, "reposicion", ":'alm'")};
select ${ALM} = :alm0 + 1, ${PISO} = :piso0;
rollback;`,
  ["SIN_ERROR", "t|t"]
);
caso(
  "líder: «Conteo físico» +1 en el piso sigue funcionando (lo que se encuentra de más al contar)",
  `${ESCENA(FELIPE)}select ${AJUSTE(1, "conteo_fisico")};
select ${PISO} = :piso0 + 1;
rollback;`,
  ["SIN_ERROR", "t"]
);
caso(
  "líder: en el Taller (sin piso ni almacén separados) el ajuste «Reposición» sin sububicación no cambia",
  `${ESCENA(FELIPE)}select case when :'taller' = '' then 'SIN_TALLER' else ${AJUSTE(1, "reposicion", "null", ":'taller'")} end;
rollback;`,
  ["SIN_ERROR"]
);
caso(
  "«Reponer» (mover_interno almacén → piso) sigue siendo el camino que saca del almacén",
  `${ESCENA(FELIPE)}select pg_temp.intento(format('select retail.mover_interno(%L, %L, 2, %L, %L, null)', :'tru', :'va', :'alm', :'piso'));
select ${PISO} = :piso0 + 2, ${ALM} = :alm0 - 2;
rollback;`,
  ["SIN_ERROR", "t|t"]
);
caso(
  "colaboradora que no puede ajustar: el mensaje sigue siendo el de permiso (el candado nuevo va después)",
  `${ESCENA(FELIPE)}insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000a1', 'Solo vender (prueba reposición)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000a1', 'vender');
update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000a1' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
select split_part(${AJUSTE(1, "reposicion")}, '|', 1), split_part(${AJUSTE(1, "reposicion")}, '|', 3) = '${PERMISO}';
rollback;`,
  ["42501|t"]
);
caso(
  "colaboradora con Existencias: se topa con el candado nuevo, con su mismo texto",
  `${ESCENA(FELIPE)}insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000a2', 'Ve Existencias (prueba reposición)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000a2', 'existencias');
update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000a2' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
select split_part(${AJUSTE(1, "reposicion")}, '|', 2);
rollback;`,
  [HINT]
);
caso(
  "la migración se pega DOS veces: el bloque queda una sola vez y conserva la firma del responsable y el candado por capacidad",
  `begin;
${MIGRACION}
${MIGRACION}
select (length(d) - length(replace(d, 'ADR-0208: «Reposición» no sube', ''))) / length('ADR-0208: «Reposición» no sube'),
  position('fn_actor_persona_id(true)' in d) > 0, position('fn_puede_ajustar_inventario()' in d) > 0,
  (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_movimiento')
from (select pg_get_functiondef('retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)'::regprocedure) d) x;
rollback;`,
  ["1|t|t|1"]
);

let rojos = 0;
for (const c of CASOS) {
  let obtenido;
  try {
    obtenido = psql(c.sql).split("\n").map((l) => l.trim()).filter((l) => l && l !== "insertar_antes" && !/^-+$/.test(l));
  } catch (e) {
    obtenido = [`ERROR_DE_SCRIPT ${(e.stderr ?? e.message ?? "").trim().split("\n").slice(-2).join(" ")}`];
  }
  const ultimas = obtenido.slice(-c.esperado.length);
  const ok = JSON.stringify(ultimas) === JSON.stringify(c.esperado);
  if (!ok) rojos++;
  console.log(`${ok ? "✓" : "✗"} ${c.nombre}`);
  if (!ok) console.log(`    esperado: ${c.esperado.join(" / ")}\n    obtenido: ${ultimas.join(" / ")}`);
}
console.log(`\n${CASOS.length - rojos}/${CASOS.length} casos en verde${rojos ? ` — ${rojos} en rojo` : ""}.`);
process.exit(rojos ? 1 : 0);

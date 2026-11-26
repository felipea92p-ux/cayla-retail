#!/usr/bin/env node
/**
 * Prueba de «Compradores lee la plata del fondo» (ADR-0704, act. 2026-11-26): `20261126223000_compradores_plata_del_fondo.sql`.
 *
 * QUÉ PROMETE
 *   · Una ronda ABIERTA dice lo que la persona tiene hoy en la mano (`tiene` = `fn_mi_plata_tiene`), aunque esa plata no se haya anotado
 *     dentro de la ronda: es el caso de producción del 2026-11-26 (Bhekam, S/ 13,800 entregados por la oficina y «Le diste S/ 0»).
 *   · Una ronda CERRADA manda `tiene` nulo: conserva su cuaderno.
 *   · Quien tiene plata y no abrió su ronda sale en `fn_compradores_sin_ronda` con su monto (Claudia); al abrir su ronda, deja de salir
 *     ahí y pasa a `fn_compradores`. Quien no tiene plata no sale.
 *   · Sin el módulo «fondos», la lectura nueva responde 42501.
 *   · Pegar la migración dos veces no rompe nada.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, filas escritas directo en las tablas y ROLLBACK siempre. La plata en la mano se
 * pone con una fila «por confirmar» de `fondo_plata_anotada` SIN ronda: `fn_mi_plata_tiene` la cuenta y `fn_ronda_compras_cuenta` no,
 * que es justo la diferencia que la pantalla no veía.
 *
 * USO
 *   pnpm pruebas:compras-compradores-plata                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_compradores_plata.mjs --contenedor <otro>  → contra otro contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261126223000_compradores_plata_del_fondo.sql"), "utf8").replace(/^set lock_timeout.*$/gm, "");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todo
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: sin Compras

const como = (auth) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

const SQL = `
set client_min_messages = warning;
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;

select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Tres personas nuevas, sin historia: con plata y ronda abierta, con plata y sin ronda, y sin plata ni ronda.
insert into public.personas (nombres, apellidos, sede_base_id) select 'ConRonda', 'Prueba', sede_base_id from public.personas where id = :'micaela' returning id as con_ronda \\gset
insert into public.personas (nombres, apellidos, sede_base_id) select 'SinRonda', 'Prueba', sede_base_id from public.personas where id = :'micaela' returning id as sin_ronda \\gset
insert into public.personas (nombres, apellidos, sede_base_id) select 'SinNada', 'Prueba', sede_base_id from public.personas where id = :'micaela' returning id as sin_nada \\gset
insert into retail.fondo_plata_anotada (persona_id, medio, monto, fecha, anotada_por) values (:'con_ronda', 'efectivo', 13800, current_date, :'con_ronda');
insert into retail.fondo_plata_anotada (persona_id, medio, monto, fecha, anotada_por) values (:'sin_ronda', 'efectivo', 4967, current_date, :'sin_ronda');
insert into retail.compra_rondas (persona_id, abierta_por) values (:'con_ronda', :'con_ronda') returning id as abierta \\gset
-- Una ronda cerrada lleva su cierre (candado compra_rondas_cerrada_con_cierre).
insert into retail.compra_rondas (persona_id, abierta_por) values (:'sin_nada', :'sin_nada') returning id as cerrada \\gset
insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id)
values (:'sin_nada', current_date, 'se_queda', 0, :'sin_nada', :'cerrada') returning id as cierre \\gset
update retail.compra_rondas set cerrada_en = now(), cierre_id = :'cierre' where id = :'cerrada';

\\echo ==sin-modulo
${como(MICAELA)}
select pg_temp.intento('select retail.fn_compradores_sin_ronda()');

-- La cifra de «Mis compras», leída como dueño de la base (la función no se le da a authenticated: solo se llama desde otras).
reset role;
select retail.fn_mi_plata_tiene(:'con_ronda') as en_mis_compras \\gset
\\echo ==abierta
${como(FELIPE)}
select (r ->> 'tiene')::numeric, (r -> 'cuenta' ->> 'dieron')::numeric, (r ->> 'tiene')::numeric = :'en_mis_compras'::numeric
  from jsonb_array_elements(retail.fn_compradores()) r where r ->> 'id' = :'abierta';

\\echo ==cerrada
select r ? 'tiene', r ->> 'tiene' is null from jsonb_array_elements(retail.fn_compradores()) r where r ->> 'id' = :'cerrada';

\\echo ==sin-ronda
select count(*) filter (where x ->> 'persona_id' = :'sin_ronda'),
       max((x ->> 'tiene')::numeric) filter (where x ->> 'persona_id' = :'sin_ronda'),
       max(x ->> 'ultima_entrega') filter (where x ->> 'persona_id' = :'sin_ronda') = current_date::text,
       max(x ->> 'persona') filter (where x ->> 'persona_id' = :'sin_ronda'),
       count(*) filter (where x ->> 'persona_id' = :'con_ronda'),
       count(*) filter (where x ->> 'persona_id' = :'sin_nada')
  from jsonb_array_elements(retail.fn_compradores_sin_ronda()) x;

-- Abre su ronda: sale de «sin ronda» y entra a Compradores con lo que tiene.
reset role;
insert into retail.compra_rondas (persona_id, abierta_por) values (:'sin_ronda', :'sin_ronda') returning id as nueva \\gset
\\echo ==al-abrir
${como(FELIPE)}
select (select count(*) from jsonb_array_elements(retail.fn_compradores_sin_ronda()) x where x ->> 'persona_id' = :'sin_ronda'),
       (select (r ->> 'tiene')::numeric from jsonb_array_elements(retail.fn_compradores()) r where r ->> 'id' = :'nueva');
rollback;
`;

const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
  input: SQL,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

const bloques = {};
let actual = null;
for (const linea of salida.split("\n")) {
  if (linea.startsWith("==")) actual = bloques[linea.slice(2)] = [];
  else if (actual && linea.trim()) actual.push(linea.trim());
}

const casos = [
  ["sin el módulo, la lectura nueva dice 42501", bloques["sin-modulo"]?.[0], "42501"],
  ["ronda abierta: tiene 13,800 aunque en la ronda no se anotó nada, y es la cifra de «Mis compras»", bloques["abierta"]?.[0], "13800.00|0|t"],
  ["ronda cerrada: manda `tiene`, y es nulo", bloques["cerrada"]?.[0], "t|t"],
  ["sin ronda: sale quien tiene plata, con su monto, su fecha y su nombre; no quien ya tiene ronda ni quien no tiene plata", bloques["sin-ronda"]?.[0], "1|4967.00|t|SinRonda Prueba|0|0"],
  ["al abrir su ronda deja de salir en «sin ronda» y Compradores dice lo que tiene", bloques["al-abrir"]?.[0], "0|4967.00"],
];

let fallas = 0;
for (const [nombre, obtenido, esperado] of casos) {
  const ok = obtenido === esperado;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}${ok ? "" : ` — esperaba «${esperado}», salió «${obtenido}»`}`);
}
if (fallas > 0) {
  console.error(`\n${fallas} de ${casos.length} fallaron.`);
  process.exit(1);
}
console.log(`\n${casos.length} de ${casos.length} pasan.`);

#!/usr/bin/env node
/**
 * Pruebas de CÓMO SE PAGA la campaña (ADR-0527) — migración `20261026212000_plan_compra_pagos_y_visibilidad.sql`: la columna `planes_compra.visibilidad_finanzas` (si Finanzas la ve), la tabla
 * `planes_compra_pagos` (la lista de pagos —fecha y %— como fotos que solo se agregan) y las funciones `fn_plan_compra_pagos` (la lectura), `guardar_plan_compra_pagos`,
 * `cambiar_visibilidad_plan_compra` y `fn_plan_compra_pagado` (cuánto de lo facturado de la campaña ya se pagó, sin IGV).
 *
 * LO QUE VIGILA. Que guardar rechace lo imposible (pagos que no suman 100 %, una fecha que no existe o repetida, un % fuera de rango, demasiados pagos, una categoría de IGV que no existe) sin
 * escribir nada; que la BASE misma lo rechace aunque la función no esté (el CHECK de la tabla); que una foto idéntica a la última no cree otra (un doble clic, un reintento) y que quien edita sobre una
 * versión vieja no pise lo que otra persona guardó; que la tabla no se edite ni se borre; que la visibilidad solo tome uno de los tres valores y diga quién la cambió; que «lo pagado» cuente solo
 * comprobantes vigentes de mercadería de órdenes generadas de la campaña y lo cuente SIN IGV; que cada puerta responda a la sesión de la tienda (el rol `authenticated`, no el dueño: ADR-0496 rompió
 * a toda la tienda 16 h por probar solo como dueño) y se cierre sin el módulo y a `anon`; que la migración se pueda pegar dos veces; y que cuatro personas guardando a la vez la MISMA forma de pago
 * dejen una sola foto y nadie reciba un error que no sea el de «otra persona guardó».
 *
 * USO
 *   pnpm pruebas:plan-compra-pagos              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK; la concurrencia, con filas reales que borra al terminar:
 *                                                 solo toca lo que ella creó, «ZZ Pagos …»)
 *   pnpm pruebas:plan-compra-pagos --base otra  → contra otra base del mismo contenedor
 */

import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");
const MIGRACION = sinControl(readFileSync(join(RAIZ, "supabase", "migrations", "20261026212000_plan_compra_pagos_y_visibilidad.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    const salida = execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Los datos de la prueba: un plan propio con fechas futuras («ZZ Pagos Plan», del hoy + 40 al hoy + 60) y una categoría. Todo se deshace al terminar el caso.
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
create function pg_temp.ok(p text) returns text language plpgsql as $$
begin
  if p <> 'SIN_ERROR' then raise exception 'la preparación del caso falló: %', p; end if;
  return p;
end $$;
${como(FELIPE)}
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Pagos Plan', current_date + 40, current_date + 60) returning id as plan \\gset
insert into retail.categorias (nombre) values ('ZZ Pagos Categoria') returning id as cat \\gset
select set_config('pp.plan', :'plan', true) as _p, set_config('pp.cat', :'cat', true) as _c \\gset
-- Un pago: (fecha, %).
create function pg_temp.pago(p_fecha text, p_pct numeric) returns jsonb language sql as $$ select jsonb_build_object('fecha', p_fecha, 'pct', p_pct) $$;
-- Tres pagos que suman 100: 40 + 30 + 30.
create function pg_temp.pagos_ok() returns jsonb language sql as $$
  select jsonb_build_array(pg_temp.pago('2027-01-10', 40), pg_temp.pago('2027-02-10', 30), pg_temp.pago('2027-03-10', 30)) $$;
-- Guarda con todos los argumentos y dice cómo salió: 'SIN_ERROR' o 'estado|mensaje'.
create function pg_temp.guarda(p_pagos jsonb, p_esperada integer default 0, p_tandas jsonb default '[]'::jsonb, p_igv jsonb default '[]'::jsonb) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_pagos(%L::uuid, %L::jsonb, %L::jsonb, %L::jsonb, %L::integer)', current_setting('pp.plan'), p_pagos, p_tandas, p_igv, p_esperada));
end $$;
-- Cuántas fotos hay de pagos del plan de prueba, y la versión más alta.
create function pg_temp.fotos() returns text language sql as $$
  select count(*) || ':' || coalesce(max(version), 0) from retail.planes_compra_pagos where plan_id = current_setting('pp.plan')::uuid $$;
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
const codigo = (r) => `split_part(${r}, '|', 1)`;
const LEE = `retail.fn_plan_compra_pagos(current_setting('pp.plan')::uuid)`;
const PLAN = `current_setting('pp.plan')`;

console.log("— La lectura —");
caso(
  "L1 sin nada guardado dice «guardado: null», que Finanzas la ve (por defecto «todo») y que nadie lo ha cambiado",
  `select (${LEE}->>'soportado') || ',' || ((${LEE}->'guardado') = 'null'::jsonb)::text || ',' || (${LEE}->'plan'->>'visibilidad_finanzas') || ',' || ((${LEE}->'plan'->>'por') is null)::text;`,
  "true,true,todo,true",
);
caso(
  "L2 un plan que no existe da null (no un error ni un cero) en las dos lecturas",
  `select (retail.fn_plan_compra_pagos('00000000-0000-0000-0000-000000000000') is null)::text || ',' || (retail.fn_plan_compra_pagado('00000000-0000-0000-0000-000000000000') is null)::text;`,
  "true,true",
);
caso(
  "L3 con una foto guardada trae la última con quién y cuándo, los pagos en orden de fecha aunque se hayan guardado al revés, las tandas y el IGV incluido",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-03-10', 30), pg_temp.pago('2027-01-10', 40), pg_temp.pago('2027-02-10', 30)), 0,
          jsonb_build_object('tandas', jsonb_build_array(1, 2)), jsonb_build_array(current_setting('pp.cat')))) as _1 \\gset
   select (${LEE}->'guardado'->>'version') || ',' || (${LEE}->'guardado'->'pagos'->0->>'fecha') || ',' || (${LEE}->'guardado'->'pagos'->2->>'fecha') || ',' ||
          ((${LEE}->'guardado'->>'por') is not null)::text || ',' || ((${LEE}->'guardado'->>'en') is not null)::text || ',' ||
          (${LEE}->'guardado'->'tandas'->'tandas'->1) || ',' || jsonb_array_length(${LEE}->'guardado'->'igv_incluido');`,
  "1,2027-01-10,2027-03-10,true,true,2,1",
);

console.log("\n— Guardar —");
caso(
  "G1 guardar crea la versión 1; con cambios y la versión que se leyó (1) crea la 2; la lectura trae la última y las dos quedan guardadas",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda(pg_temp.pagos_ok(), 0)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 50), pg_temp.pago('2027-02-10', 50)), 1)) as _2 \\gset
   select pg_temp.fotos() || ',' || (${LEE}->'guardado'->>'version') || ',' || jsonb_array_length(${LEE}->'guardado'->'pagos');`,
  "2:2,2,2",
);
caso(
  "G2 lo idéntico a lo ya guardado (un doble clic, un reintento tras un corte de red) no crea otra foto y responde con la misma versión; los mismos pagos en otro orden también son lo mismo",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda(pg_temp.pagos_ok(), 0)) as _1 \\gset
   select retail.guardar_plan_compra_pagos(${PLAN}::uuid, jsonb_build_array(pg_temp.pago('2027-03-10', 30), pg_temp.pago('2027-01-10', 40), pg_temp.pago('2027-02-10', 30)), '[]'::jsonb, '[]'::jsonb, 0)->>'sin_cambios' as r \\gset
   select :'r' || ',' || pg_temp.fotos();`,
  "true,1:1",
);
caso(
  "G3 quien edita sobre una versión vieja NO pisa lo que otra persona guardó: se rechaza con «guardó otra forma de pago» (PT409) y no se escribe nada; con la versión al día sí se guarda",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda(pg_temp.pagos_ok(), 0)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 50), pg_temp.pago('2027-02-10', 50)), 1)) as _2 \\gset
   select pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 20), pg_temp.pago('2027-02-10', 80)), 1) as r \\gset
   select ${codigo(":'r'")} || ',' || (:'r' like '%guardó otra forma de pago%') || ',' || pg_temp.fotos() || ',' ||
          ${codigo(`pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 20), pg_temp.pago('2027-02-10', 80)), 2)`)};`,
  "PT409,true,2:2,SIN_ERROR",
);
caso(
  "G4 la suma manda: 70 %, 99,99 % y 101 % se rechazan diciendo cuánto suman y sin escribir nada; 33,33 + 33,33 + 33,34 suma exacto 100 y se guarda",
  `${como(FELIPE)}
   select pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 40), pg_temp.pago('2027-02-10', 30))) as a \\gset
   select pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 33.33), pg_temp.pago('2027-02-10', 33.33), pg_temp.pago('2027-03-10', 33.33))) as b \\gset
   select pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 50), pg_temp.pago('2027-02-10', 51))) as c \\gset
   select ${codigo(":'a'")} || ',' || (:'a' like '%suman 70.00 %') || ',' || (:'b' like '%suman 99.99 %') || ',' || (:'c' like '%suman 101.00 %') || ',' || pg_temp.fotos() || ',' ||
          pg_temp.guarda(jsonb_build_array(pg_temp.pago('2027-01-10', 33.33), pg_temp.pago('2027-02-10', 33.33), pg_temp.pago('2027-03-10', 33.34))) || ',' || pg_temp.fotos();`,
  "P0001,true,true,true,0:0,SIN_ERROR,1:1",
);

const IMPOSIBLES = [
  ["una fecha que no existe (31 de febrero)", `jsonb_build_array(pg_temp.pago('2027-02-31', 100))`],
  ["una fecha que no es fecha", `jsonb_build_array(pg_temp.pago('mañana', 100))`],
  ["una fecha con hora", `jsonb_build_array(pg_temp.pago('2027-01-10T08:00', 100))`],
  ["dos pagos el mismo día", `jsonb_build_array(pg_temp.pago('2027-01-10', 50), pg_temp.pago('2027-01-10', 50))`],
  ["un pago de 0 %", `jsonb_build_array(pg_temp.pago('2027-01-10', 0), pg_temp.pago('2027-02-10', 100))`],
  ["un pago de menos de 0,01 %", `jsonb_build_array(pg_temp.pago('2027-01-10', 0.001), pg_temp.pago('2027-02-10', 100))`],
  ["un pago negativo", `jsonb_build_array(pg_temp.pago('2027-01-10', -10), pg_temp.pago('2027-02-10', 110))`],
  ["un pago de más de 100 %", `jsonb_build_array(pg_temp.pago('2027-01-10', 101))`],
  ["una lista vacía", `'[]'::jsonb`],
  ["algo que no es una lista", `'{}'::jsonb`],
  ["nada (null)", `null::jsonb`],
  ["25 pagos", `(select jsonb_agg(pg_temp.pago(to_char(date '2027-01-01' + n, 'YYYY-MM-DD'), 4)) from generate_series(1, 25) n)`],
  ["filas que no son pagos", `jsonb_build_array(5, 'x')`],
  ["un % que es texto", `jsonb_build_array(jsonb_build_object('fecha', '2027-01-10', 'pct', 'abc'))`],
  ["un pago sin fecha", `jsonb_build_array(jsonb_build_object('pct', 100))`],
];
caso(
  `G5 lo imposible se rechaza sin escribir (P0001, no un error crudo de Postgres): ${IMPOSIBLES.map(([n]) => n).join("; ")}`,
  `${como(FELIPE)}
   select ${IMPOSIBLES.map(([, p]) => codigo(`pg_temp.guarda(${p})`)).join(" || ',' || ")} || ',' || pg_temp.fotos();`,
  `${IMPOSIBLES.map(() => "P0001").join(",")},0:0`,
);

caso(
  "G6 el IGV incluido: una categoría que no existe, un texto que no es un id, algo que no es una lista o números se rechazan con P0001; repetidas se guardan una sola vez y la misma lista en otro orden es lo mismo",
  `${como(FELIPE)}
   select ${codigo(`pg_temp.guarda(pg_temp.pagos_ok(), 0, '[]'::jsonb, jsonb_build_array('00000000-0000-4000-8000-000000000000'))`)} || ',' ||
          ${codigo(`pg_temp.guarda(pg_temp.pagos_ok(), 0, '[]'::jsonb, jsonb_build_array('abc'))`)} || ',' ||
          ${codigo(`pg_temp.guarda(pg_temp.pagos_ok(), 0, '[]'::jsonb, '{}'::jsonb)`)} || ',' ||
          ${codigo(`pg_temp.guarda(pg_temp.pagos_ok(), 0, '[]'::jsonb, jsonb_build_array(1, 2))`)} || ',' ||
          pg_temp.fotos() as antes \\gset
   select pg_temp.guarda(pg_temp.pagos_ok(), 0, '[]'::jsonb, jsonb_build_array(current_setting('pp.cat'), current_setting('pp.cat'))) as guardo \\gset
   select :'antes' || ',' || :'guardo' || ',' || jsonb_array_length(${LEE}->'guardado'->'igv_incluido') || ',' ||
          (retail.guardar_plan_compra_pagos(${PLAN}::uuid, pg_temp.pagos_ok(), '[]'::jsonb, jsonb_build_array(current_setting('pp.cat')), 0)->>'sin_cambios') || ',' || pg_temp.fotos();`,
  "P0001,P0001,P0001,P0001,0:0,SIN_ERROR,1,true,1:1",
);
caso(
  "G7 las tandas (lo que la pantalla necesita para reabrirse) son opacas pero acotadas: un texto suelto o más de 16 KB se rechazan; un objeto, una lista o nada (null → lista vacía) se guardan",
  `${como(FELIPE)}
   select ${codigo(`pg_temp.guarda(pg_temp.pagos_ok(), 0, '"texto"'::jsonb)`)} || ',' || ${codigo(`pg_temp.guarda(pg_temp.pagos_ok(), 0, jsonb_build_array(repeat('x', 17000)))`)} || ',' ||
          pg_temp.guarda(pg_temp.pagos_ok(), 0, jsonb_build_object('a', 1)) || ',' || pg_temp.guarda(pg_temp.pagos_ok(), 1, null::jsonb) as guardo \\gset
   select :'guardo' || ',' || (${LEE}->'guardado'->'tandas')::text || ',' || pg_temp.fotos();`,
  "P0001,P0001,SIN_ERROR,SIN_ERROR,[],2:2",
);
caso(
  "G8 la tabla no se edita ni se borra, ni con el dueño: una foto guardada es la que fue",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda(pg_temp.pagos_ok(), 0)) as _1 \\gset
   select ${codigo("pg_temp.intento('update retail.planes_compra_pagos set tandas = ''[]''::jsonb')")} || ',' || ${codigo("pg_temp.intento('delete from retail.planes_compra_pagos')")} || ',' || pg_temp.fotos();`,
  (o) => /^(P0001|23000|[0-9A-Z]{5}),(P0001|23000|[0-9A-Z]{5}),1:1$/.test(o) && !o.startsWith("SIN_ERROR"),
);
caso(
  "G9 la BASE rechaza lo imposible aunque nadie pase por la función (el CHECK de la tabla): pagos que suman 99, una fecha imposible, 25 pagos, más de 500 categorías de IGV, tandas de más de 16 KB, la misma versión dos veces y la versión 0",
  `${como(FELIPE)}
   create function pg_temp.directo(p_version integer, p_pagos jsonb, p_igv jsonb default '[]'::jsonb, p_tandas jsonb default '[]'::jsonb) returns text language plpgsql as $$
   begin
     return pg_temp.intento(format('insert into retail.planes_compra_pagos (plan_id, version, pagos, igv_incluido, tandas, por) values (%L::uuid, %L::integer, %L::jsonb, %L::jsonb, %L::jsonb, retail.fn_actor_persona_id(true))',
       current_setting('pp.plan'), p_version, p_pagos, p_igv, p_tandas));
   end $$;
   select ${codigo(`pg_temp.directo(1, jsonb_build_array(pg_temp.pago('2027-01-10', 99)))`)} || ',' ||
          ${codigo(`pg_temp.directo(1, jsonb_build_array(pg_temp.pago('2027-02-31', 100)))`)} || ',' ||
          ${codigo(`pg_temp.directo(1, (select jsonb_agg(pg_temp.pago(to_char(date '2027-01-01' + n, 'YYYY-MM-DD'), 4)) from generate_series(1, 25) n))`)} || ',' ||
          ${codigo(`pg_temp.directo(1, pg_temp.pagos_ok(), (select jsonb_agg(gen_random_uuid()::text) from generate_series(1, 501)))`)} || ',' ||
          ${codigo(`pg_temp.directo(1, pg_temp.pagos_ok(), '[]'::jsonb, jsonb_build_array(repeat('x', 17000)))`)} || ',' ||
          ${codigo(`pg_temp.directo(0, pg_temp.pagos_ok())`)} || ',' || pg_temp.fotos() || ',' ||
          pg_temp.directo(1, pg_temp.pagos_ok()) || ',' || ${codigo(`pg_temp.directo(1, pg_temp.pagos_ok())`)} || ',' || pg_temp.fotos();`,
  "23514,23514,23514,23514,23514,23514,0:0,SIN_ERROR,23505,1:1",
);
caso(
  "G10 guardar los pagos de un plan que no existe se rechaza con claridad",
  `${como(FELIPE)}
   select ${codigo(`pg_temp.intento(format('select retail.guardar_plan_compra_pagos(%L::uuid, %L::jsonb, %L::jsonb, %L::jsonb, 0)', '00000000-0000-0000-0000-000000000000', pg_temp.pagos_ok(), '[]', '[]'))`)} || ',' || pg_temp.fotos();`,
  "P0001,0:0",
);

console.log("\n— Si Finanzas la ve —");
caso(
  "V1 por defecto «todo»; cambiarla a «solo en Escenarios» deja quién y cuándo; repetir el mismo valor no cambia nada (ni la hora)",
  `${como(FELIPE)}
   select (${LEE}->'plan'->>'visibilidad_finanzas') as a \\gset
   select (retail.cambiar_visibilidad_plan_compra(${PLAN}::uuid, 'escenarios')->>'sin_cambios') as b \\gset
   select (${LEE}->'plan'->>'en') as en1 \\gset
   select (retail.cambiar_visibilidad_plan_compra(${PLAN}::uuid, 'escenarios')->>'sin_cambios') as c \\gset
   select :'a' || ',' || :'b' || ',' || (${LEE}->'plan'->>'visibilidad_finanzas') || ',' || ((${LEE}->'plan'->>'por') is not null)::text || ',' || :'c' || ',' || ((${LEE}->'plan'->>'en') = :'en1')::text;`,
  "todo,false,escenarios,true,true,true",
);
caso(
  "V2 volver a «todo» y apagarla del todo («nada») también quedan firmadas; un valor que no es uno de los tres, null o un plan que no existe se rechazan sin cambiar nada",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.intento(format('select retail.cambiar_visibilidad_plan_compra(%L::uuid, %L)', ${PLAN}, 'nada'))) as _1 \\gset
   select (${LEE}->'plan'->>'visibilidad_finanzas') as a \\gset
   select pg_temp.ok(pg_temp.intento(format('select retail.cambiar_visibilidad_plan_compra(%L::uuid, %L)', ${PLAN}, 'todo'))) as _2 \\gset
   select :'a' || ',' || (${LEE}->'plan'->>'visibilidad_finanzas') || ',' || ((${LEE}->'plan'->>'por') is not null)::text || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.cambiar_visibilidad_plan_compra(%L::uuid, %L)', ${PLAN}, 'cualquiera'))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.cambiar_visibilidad_plan_compra(%L::uuid, %L)', ${PLAN}, null))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.cambiar_visibilidad_plan_compra(%L::uuid, %L)', '00000000-0000-0000-0000-000000000000', 'todo'))`)} || ',' ||
          (${LEE}->'plan'->>'visibilidad_finanzas');`,
  "nada,todo,true,P0001,P0001,P0001,todo",
);
caso(
  "V3 la BASE rechaza una visibilidad que no sea «todo», «escenarios» o «nada», y una firma a medias (quién sin cuándo, cuándo sin quién)",
  `${como(FELIPE)}
   select ${codigo(`pg_temp.intento(format('update retail.planes_compra set visibilidad_finanzas = %L where id = %L::uuid', 'raro', ${PLAN}))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('update retail.planes_compra set visibilidad_finanzas_por = retail.fn_actor_persona_id(true) where id = %L::uuid', ${PLAN}))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('update retail.planes_compra set visibilidad_finanzas_en = now() where id = %L::uuid', ${PLAN}))`)} || ',' ||
          (${LEE}->'plan'->>'visibilidad_finanzas');`,
  "23514,23514,23514,todo",
);

console.log("\n— Lo pagado —");
// Una campaña con sus órdenes y comprobantes. Las fechas del plan de prueba van del hoy + 40 al hoy + 60.
//   O1 generada (emisión +45, dentro)           → factura A 1000 + 180 de IGV, pagada 590 (la mitad)      → cuenta: pagado sin IGV 500
//                                                  factura anulada (400)                                 → NO cuenta (anulada)
//                                                  gasto (100 + 18, pagado)                              → NO cuenta (no es mercadería)
//   O2 generada (emisión hoy, entrega +50)       → factura B 500 + 90 sin pagar                            → cuenta: 0 pagado
//                                                  nota de venta C 200 sin IGV, pagada 200               → cuenta: 200 pagado (sin IGV no hay que quitar)
//   O3 ANULADA (emisión +45)                     → factura 700 pagada                                     → NO cuenta (orden anulada)
//   O4 generada (emisión +100, fuera)            → factura 300 pagada                                     → NO cuenta (fuera de las fechas)
//   O5 generada (emisión +45, entrega +90)       → factura 250 pagada                                     → NO cuenta (manda la entrega, que cae fuera)
//   Una factura sin orden (100 + 18, pagada)                                                              → NO cuenta (no es de la campaña)
// Resultado: 3 comprobantes, facturado sin IGV 1700, pagado sin IGV 700, pagado con IGV 790.
const SEMILLA_PAGADO = `
${como(FELIPE)}
select retail.fn_actor_persona_id(true) as persona \\gset
insert into retail.proveedores (nombre) values ('ZZ Pagos Proveedor') returning id as prov \\gset
select id as sede from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select set_config('pp.persona', :'persona', true) as _1, set_config('pp.prov', :'prov', true) as _2, set_config('pp.sede', :'sede', true) as _3 \\gset
create function pg_temp.orden(p_emision integer, p_entrega integer, p_estado text default 'generada') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into retail.ordenes_compra (proveedor_id, fecha_emision, fecha_entrega_estimada, estado, creada_por, anulada_por, anulada_en, motivo_anulacion)
  values (current_setting('pp.prov')::uuid, current_date + p_emision, case when p_entrega is null then null else current_date + p_entrega end, p_estado, current_setting('pp.persona')::uuid,
          case when p_estado = 'anulada' then current_setting('pp.persona')::uuid end, case when p_estado = 'anulada' then now() end, case when p_estado = 'anulada' then 'ZZ prueba de pagos' end)
  returning id into v;
  return v;
end $$;
create function pg_temp.compra(p_orden uuid, p_numero text, p_tipo text, p_subtotal numeric, p_igv numeric, p_pagado numeric, p_estado text default 'vigente', p_naturaleza text default 'mercaderia') returns void language plpgsql as $$
begin
  insert into retail.compras (proveedor_id, tipo, serie, numero, condicion, fecha_emision, subtotal, igv, total, pagado, estado, naturaleza, orden_compra_id, ubicacion_gestion_id)
  values (current_setting('pp.prov')::uuid, p_tipo, 'ZZ01', p_numero, 'contado', current_date + 45, p_subtotal, p_igv, p_subtotal + p_igv, p_pagado, p_estado, p_naturaleza, p_orden,
          current_setting('pp.sede')::uuid);
end $$;
select pg_temp.orden(45, null) as o1, pg_temp.orden(0, 50) as o2, pg_temp.orden(45, null, 'anulada') as o3, pg_temp.orden(100, null) as o4, pg_temp.orden(45, 90) as o5 \\gset
select pg_temp.compra(:'o1', 'A1', 'factura', 1000, 180, 590) as _a, pg_temp.compra(:'o1', 'A2', 'factura', 400, 72, 0, 'anulada') as _b, pg_temp.compra(:'o1', 'A3', 'factura', 100, 18, 118, 'vigente', 'gasto') as _c,
       pg_temp.compra(:'o2', 'B1', 'factura', 500, 90, 0) as _d, pg_temp.compra(:'o2', 'B2', 'nota_venta', 200, 0, 200) as _e,
       pg_temp.compra(:'o3', 'C1', 'factura', 700, 126, 826) as _f, pg_temp.compra(:'o4', 'D1', 'factura', 300, 54, 354) as _g, pg_temp.compra(:'o5', 'E1', 'factura', 250, 45, 295) as _h,
       pg_temp.compra(null, 'F1', 'factura', 100, 18, 118) as _i \\gset
`;
const PAGADO = `retail.fn_plan_compra_pagado(current_setting('pp.plan')::uuid)`;
caso(
  "P1 lo pagado cuenta solo comprobantes vigentes de mercadería de órdenes generadas de la campaña (manda la entrega, si la hay, sobre la emisión), SIN IGV: la factura pagada a medias aporta la mitad de su subtotal, la nota de venta aporta todo",
  `${SEMILLA_PAGADO}
   select (${PAGADO}->>'soportado') || ',' || (${PAGADO}->>'comprobantes') || ',' || (${PAGADO}->>'facturado_sin_igv')::numeric || ',' || (${PAGADO}->>'pagado_sin_igv')::numeric || ',' || (${PAGADO}->>'pagado_total')::numeric;`,
  "true,3,1700.00,700.00,790.00",
);
caso(
  "P2 una campaña sin comprobantes dice 0 de verdad (es un dato: no se ha facturado ni pagado nada), no null",
  `select (${PAGADO}->>'comprobantes') || ',' || (${PAGADO}->>'facturado_sin_igv')::numeric || ',' || (${PAGADO}->>'pagado_sin_igv')::numeric || ',' || (${PAGADO}->>'pagado_total')::numeric;`,
  "0,0,0,0",
);
caso(
  "P3 pagar el resto de la factura sube lo pagado sin IGV hasta su subtotal, nunca más (un comprobante no aporta más de lo que vale)",
  `${SEMILLA_PAGADO}
   update retail.compras set pagado = total where serie = 'ZZ01' and numero = 'A1';
   select (${PAGADO}->>'pagado_sin_igv')::numeric || ',' || (${PAGADO}->>'pagado_total')::numeric;`,
  "1200.00,1380.00",
);

console.log("\n— Puertas —");
caso(
  "U1 con el rol de la tienda (authenticated, no el dueño) las cuatro funciones responden y guardan",
  `${como(FELIPE)}
   set local role authenticated;
   select (retail.fn_plan_compra_pagos(${PLAN}::uuid)->>'soportado') || ',' || (retail.fn_plan_compra_pagado(${PLAN}::uuid)->>'soportado') || ',' ||
          (retail.guardar_plan_compra_pagos(${PLAN}::uuid, pg_temp.pagos_ok(), '[]'::jsonb, '[]'::jsonb, 0)->>'version') || ',' ||
          (retail.cambiar_visibilidad_plan_compra(${PLAN}::uuid, 'nada')->>'visibilidad_finanzas');`,
  "true,true,1,nada",
);
caso(
  "U2 sin el módulo (Micaela) las cuatro dan 42501, no escriben nada y la visibilidad sigue como estaba",
  `${como(MICAELA)}
   select ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_pagos(%L::uuid)', ${PLAN}))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_pagado(%L::uuid)', ${PLAN}))`)} || ',' ||
          ${codigo("pg_temp.guarda(pg_temp.pagos_ok())")} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.cambiar_visibilidad_plan_compra(%L::uuid, %L)', ${PLAN}, 'nada'))`)} || ',' ||
          pg_temp.fotos() || ',' || (select visibilidad_finanzas from retail.planes_compra where id = ${PLAN}::uuid);`,
  "42501,42501,42501,42501,0:0,todo",
);
caso(
  "U3 anon no ejecuta ninguna y la tabla no se lee ni se escribe desde la web (sin permisos de tabla y con RLS sin políticas); el validador interno tampoco lo ejecuta nadie de la web",
  `select (has_function_privilege('anon', 'retail.fn_plan_compra_pagos(uuid)', 'execute') or has_function_privilege('anon', 'retail.fn_plan_compra_pagado(uuid)', 'execute') or
           has_function_privilege('anon', 'retail.guardar_plan_compra_pagos(uuid, jsonb, jsonb, jsonb, integer)', 'execute') or has_function_privilege('anon', 'retail.cambiar_visibilidad_plan_compra(uuid, text)', 'execute'))::text || ',' ||
          (has_function_privilege('authenticated', 'retail.fn_plan_compra_pagos(uuid)', 'execute') and has_function_privilege('authenticated', 'retail.fn_plan_compra_pagado(uuid)', 'execute') and
           has_function_privilege('authenticated', 'retail.guardar_plan_compra_pagos(uuid, jsonb, jsonb, jsonb, integer)', 'execute') and has_function_privilege('authenticated', 'retail.cambiar_visibilidad_plan_compra(uuid, text)', 'execute'))::text || ',' ||
          (has_table_privilege('authenticated', 'retail.planes_compra_pagos', 'select') or has_table_privilege('authenticated', 'retail.planes_compra_pagos', 'insert'))::text || ',' ||
          (select c.relrowsecurity::text from pg_class c where c.oid = 'retail.planes_compra_pagos'::regclass) || ',' ||
          (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'planes_compra_pagos') || ',' ||
          (has_function_privilege('anon', 'retail.fn_pagos_de_compra_validos(jsonb)', 'execute') or has_function_privilege('authenticated', 'retail.fn_pagos_de_compra_validos(jsonb)', 'execute'))::text;`,
  "false,true,false,true,0,false",
);
caso(
  "U4 las cuatro públicas son security definer con search_path fijo (una función con permisos del dueño sin esto se podría engañar con otro esquema); el validador también fija el suyo",
  `select count(*) filter (where p.prosecdef) || ',' || count(*) filter (where p.proconfig::text like '%search_path=retail, public, extensions%')
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_plan_compra_pagos', 'fn_plan_compra_pagado', 'guardar_plan_compra_pagos', 'cambiar_visibilidad_plan_compra', 'fn_pagos_de_compra_validos');`,
  "4,5",
);

console.log("\n— La migración —");
caso(
  "M1 pegarla dos veces deja lo mismo: sin error, una sola de cada función, un solo disparador, una sola tabla, una sola restricción y las tres columnas",
  `${MIGRACION}
   select (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_plan_compra_pagos', 'fn_plan_compra_pagado', 'guardar_plan_compra_pagos', 'cambiar_visibilidad_plan_compra', 'fn_pagos_de_compra_validos')) || ',' ||
          (select count(*) from pg_trigger where tgrelid = 'retail.planes_compra_pagos'::regclass and tgname = 'planes_compra_pagos_inmutable' and not tgisinternal) || ',' ||
          (select count(*) from pg_class where relname = 'planes_compra_pagos' and relnamespace = 'retail'::regnamespace) || ',' ||
          (select count(*) from pg_constraint where conname = 'planes_compra_visibilidad_finanzas_valida' and conrelid = 'retail.planes_compra'::regclass) || ',' ||
          (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'planes_compra' and column_name in ('visibilidad_finanzas', 'visibilidad_finanzas_por', 'visibilidad_finanzas_en'));`,
  "5,1,1,1,3",
);
caso(
  "M2 los planes que ya existían quedan en «todo» sin firma (por defecto todo se ve) y la restricción de la tabla no se queja de ellos",
  `select count(*) filter (where visibilidad_finanzas = 'todo' and visibilidad_finanzas_por is null and visibilidad_finanzas_en is null) = count(*) from retail.planes_compra;`,
  "t",
);

// Concurrencia con sesiones reales: cuatro personas guardan a la vez la MISMA forma de pago desde la versión 0, y otras cuatro cambian a la vez si Finanzas la ve. Se crean los datos de verdad (con
// commit), se corre y se borra todo al terminar.
console.log("\n— Dos personas a la vez —");
const SEMILLA_REAL = `
set search_path = retail, public, extensions;
${MIGRACION}
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Pagos Concurrencia', current_date + 40, current_date + 60) returning id as plan \\gset
select :'plan';
`;
const LIMPIEZA_REAL = `
set session_replication_role = replica;
delete from retail.planes_compra_pagos where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Pagos Concurrencia');
delete from retail.planes_compra where nombre = 'ZZ Pagos Concurrencia';
`;
const enParalelo = (plan, sqls) =>
  Promise.all(
    sqls.map(
      (sql) =>
        new Promise((resolver) => {
          const h = execFile("docker", ARGS_PSQL, { maxBuffer: 1 << 20 }, (err, salida, stderr) =>
            resolver(err ? `ERR ${((stderr ?? "").split("\n").find((l) => l.includes("ERROR")) ?? stderr).trim()}` : `OK ${salida.trim()}`),
          );
          h.stdin.end(`begin;\n${como(FELIPE)}${sql}\ncommit;`);
        }),
    ),
  );
async function concurrencia() {
  casos += 2;
  // Quita cualquier resto de una corrida anterior que se cortó a medias.
  correr(LIMPIEZA_REAL);
  const sem = correr(SEMILLA_REAL);
  if (!sem.ok) {
    fallas += 2;
    console.log(`✗ C1/C2 la preparación falló: ${sem.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? sem.mensaje}`);
    return;
  }
  const plan = sem.salida.split("\n").at(-1);
  const guardar = (n) =>
    `select coalesce((select retail.guardar_plan_compra_pagos('${plan}', jsonb_build_array(jsonb_build_object('fecha', '2027-01-1${n}', 'pct', 100)), '[]'::jsonb, '[]'::jsonb, 0))::text, 'x');`;
  const res1 = await enParalelo(plan, [1, 2, 3, 4].map(guardar));
  const fotos = correr(`select count(*) || ':' || coalesce(max(version), 0) || ':' || count(distinct version) from retail.planes_compra_pagos where plan_id = '${plan}';`);
  const ganaron = res1.filter((r) => r.startsWith("OK")).length;
  const perdieron = res1.filter((r) => /guardó otra forma de pago/.test(r)).length;
  if (fotos.ok && fotos.salida === "1:1:1" && ganaron === 1 && perdieron === 3) {
    console.log("✓ C1 cuatro personas guardan a la vez la misma forma de pago desde la versión 0: gana UNA y las otras tres reciben «guardó otra forma de pago», sin fotos repetidas");
  } else {
    fallas++;
    console.log(`✗ C1 cuatro personas guardan a la vez la misma forma de pago desde la versión 0: gana UNA y las otras tres reciben «guardó otra forma de pago», sin fotos repetidas\n    obtenido: ganaron ${ganaron}, perdieron ${perdieron}, fotos ${fotos.ok ? fotos.salida : fotos.mensaje}\n    ${res1.join("\n    ")}`);
  }
  const cambiar = (valor) => `select (retail.cambiar_visibilidad_plan_compra('${plan}', '${valor}'))::text;`;
  const res2 = await enParalelo(plan, ["escenarios", "nada", "escenarios", "nada"].map(cambiar));
  const final = correr(`select visibilidad_finanzas || ':' || (visibilidad_finanzas_por is not null) || ':' || (visibilidad_finanzas_en is not null) from retail.planes_compra where id = '${plan}';`);
  correr(LIMPIEZA_REAL);
  const sinErrores = res2.every((r) => r.startsWith("OK"));
  if (sinErrores && final.ok && /^(escenarios|nada):true:true$/.test(final.salida)) {
    console.log("✓ C2 cuatro personas cambian a la vez si Finanzas la ve: se turnan sin ningún error y queda uno de los valores, firmado");
  } else {
    fallas++;
    console.log(`✗ C2 cuatro personas cambian a la vez si Finanzas la ve: se turnan sin ningún error y queda uno de los valores, firmado\n    obtenido: ${final.ok ? final.salida : final.mensaje}\n    ${res2.join("\n    ")}`);
  }
}

await concurrencia();
console.log(`\n${casos - fallas}/${casos} casos bien.`);
process.exit(fallas ? 1 : 0);

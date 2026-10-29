#!/usr/bin/env node
/**
 * Prueba de `20261029030000_claure_fuera_de_rendimiento_y_metas.sql` (ADR-0560, actividad 6b): lo vendido de CLAURE no suma en Rendimiento, en las metas del
 * equipo, en el panel Comercial ni en el «Tu día» de cada integrante.
 *
 * Lo que importa: (1) Rendimiento (equipo, detalle por hora, serie contra la meta) cuenta solo lo de CAYLA: una venta solo de CLAURE no cuenta como venta,
 * la mixta por su línea de CAYLA; (2) las metas del equipo (`fn_metas_equipo`) llenan «vendido» solo con lo de CAYLA; (3) Comercial (por tienda, por
 * colaboradora, por hora) igual, y una devolución de una prenda de CLAURE no resta a CAYLA mientras la de una prenda de CAYLA sí; (4) «Tu día»
 * (`fn_mis_ventas_del_dia`, `fn_mis_ventas_por_dia`) igual; (5) lo anterior al arranque y la sede sin CLAURE cuentan como siempre; (6) las migraciones se pueden
 * volver a pegar. Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK; todo se mide como DIFERENCIA contra la foto de
 * antes de la escena, porque la base local la comparten varias sesiones.
 *
 * USO: pnpm pruebas:claure-rendimiento-y-metas   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La columna `cuenta_corriente_desde` (actividad 1) y la regla `fn_item_es_de_claure` (6a) son lo que esta migración usa.
const PREVIAS = [leer("20261029004000_cuenta_con_claure.sql"), leer("20261029023000_claure_fuera_de_inicio_y_observatorio.sql")].join("\n");
const MIGRACION = leer("20261029030000_claure_fuera_de_rendimiento_y_metas.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed), con Tienda Lima de partida
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const idSede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return id;
};
const LIMA = idSede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = idSede("'Tienda TRU', 'Tienda Trujillo'");

const COMO = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;
const SUPER = "reset role;";

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// A = una prenda de CLAURE; B = una de CAYLA. Todo en hora de Lima, vendido por Felipe (asesora y quien cobró).
//   S1 mixta: A 118 + B 118 · S2 solo CLAURE: A 177 · S3 solo CAYLA: B 100 · S5 Trujillo: A 100 (la sede sin CLAURE no separa nada)
//   S4 (solo en el caso de «antes del arranque»): A 59 hace 12 días.
// Devoluciones aprobadas hoy: D1 de la línea de CLAURE de la S1 (118) y D2 de la línea de CAYLA de la S3 (100).
const PRELUDIO = `
begin;
\\o /dev/null
${PREVIAS}
${MIGRACION}
\\o
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, '${LIMA}') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select date_trunc('month', (now() at time zone 'America/Lima')::date)::date::text as mes \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
`;

const FOTO = (n) =>
  `${COMO(FELIPE)}
select (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_rendimiento_equipo(:'mes'::date) x)::text as eq${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_rendimiento_detalle('${LIMA}', :'hoy'::date, :'hoy'::date) x)::text as de${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_rendimiento_serie('${LIMA}', :'hoy'::date, :'hoy'::date) x)::text as se${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_metas_equipo(:'mes'::date) x)::text as me${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_comercial_sedes(:'hoy'::date) x)::text as cs${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_comercial_colaboradoras(:'hoy'::date) x)::text as cc${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_comercial_horas(:'hoy'::date) x)::text as ch${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_mis_ventas_del_dia('${LIMA}') x)::text as md${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_mis_ventas_por_dia(:'hoy'::date, :'hoy'::date) x)::text as mp${n} \\gset
${SUPER}`;

const VENTAS = (conS4 = false) => `
${SUPER}
set local session_replication_role = replica;
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, asesora_id, usuario_id) values
  (${ID("a1")}, '${LIMA}', (:'hoy'::date + time '00:10')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a2")}, '${LIMA}', (:'hoy'::date + time '00:15')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a3")}, '${LIMA}', (:'hoy'::date + time '00:20')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a5")}, '${TRUJILLO}', (:'hoy'::date + time '00:25')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo')${
    conS4 ? `,\n  (${ID("a4")}, '${LIMA}', ((:'hoy'::date - 12) + time '00:05')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo')` : ""
  };
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 118, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 118, 10),
  (${ID("b3")}, ${ID("a2")}, :'va_a', 1, 177, 10),
  (${ID("b4")}, ${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("b6")}, ${ID("a5")}, :'va_a', 1, 100, 10)${conS4 ? `,\n  (${ID("b5")}, ${ID("a4")}, :'va_a', 1, 59, 10)` : ""};
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en) values
  (${ID("d1")}, ${ID("a1")}, '${LIMA}', 'prueba', 'aprobada', 118, 'efectivo', now()),
  (${ID("d2")}, ${ID("a3")}, '${LIMA}', 'prueba', 'aprobada', 100, 'efectivo', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values
  (${ID("d1")}, ${ID("b1")}, 1, 'vendible'), (${ID("d2")}, ${ID("b4")}, 1, 'vendible');
`;

// Sumas de un campo, de las filas de una foto que cumplen una condición: `suma(foto, campo, "e->>'x' = ...")`.
const SUMA = (foto, campo, donde = "true") =>
  `coalesce((select sum((e->>'${campo}')::numeric) from jsonb_array_elements(:'${foto}'::jsonb) e where ${donde}), 0)`;
const DELTA = (n1, n0, campo, donde = "true") => `(${SUMA(n1, campo, donde)} - ${SUMA(n0, campo, donde)})::numeric(12,2)`;
const LIMA_FILA = `e->>'ubicacion_id' = '${LIMA}'`;
const YO_LIMA = `e->>'ubicacion_id' = '${LIMA}' and e->>'persona_id' = :'yo'`;

const dentro = (cuerpo) => psql(`${PRELUDIO}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 14).join("\n    ")}`);
  }
}
const conEscena = (consulta, conS4 = false) => ultima(dentro(`${FOTO(0)}\n${VENTAS(conS4)}\n${FOTO(1)}\n${consulta}`));

// ── 1. Rendimiento ──
caso("Rendimiento (equipo): cada persona suma solo lo de CAYLA; una venta solo de CLAURE no cuenta como venta", () =>
  igual(
    conEscena(`select ${DELTA("eq1", "eq0", "ventas", YO_LIMA)} || '/' || ${DELTA("eq1", "eq0", "soles", YO_LIMA)} || '|' ||
                      ${DELTA("eq1", "eq0", "ventas", `e->>'ubicacion_id' = '${TRUJILLO}' and e->>'persona_id' = :'yo'`)} || '/' ||
                      ${DELTA("eq1", "eq0", "soles", `e->>'ubicacion_id' = '${TRUJILLO}' and e->>'persona_id' = :'yo'`)};`),
    // Lima: la S1 mixta (118 de CAYLA) y la S3 (100): 2 ventas y 218; la S2 solo de CLAURE no suma. Trujillo (sin CLAURE) cuenta su venta entera.
    "2.00/218.00|1.00/100.00",
  ),
);

caso("Rendimiento (detalle por hora y serie contra la meta): solo lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("de1", "de0", "total")} || '/' || ${DELTA("de1", "de0", "ventas")} || '/' || ${DELTA("de1", "de0", "prendas")} || '|' ||
                      ${DELTA("se1", "se0", "total")} || '/' || ${DELTA("se1", "se0", "ventas")};`),
    "218.00/2.00/2.00|218.00/2.00",
  ),
);

caso("Rendimiento: lo anterior al arranque cuenta como siempre (nada cambia antes de la fecha de arranque)", () =>
  igual(
    ultima(
      dentro(`${COMO(FELIPE)}
select (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_rendimiento_detalle('${LIMA}', :'hoy'::date - 12, :'hoy'::date - 12) x)::text as a0 \\gset
${VENTAS(true)}
${COMO(FELIPE)}
select (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_rendimiento_detalle('${LIMA}', :'hoy'::date - 12, :'hoy'::date - 12) x)::text as a1 \\gset
select ${DELTA("a1", "a0", "total")};`),
    ),
    "59.00",
  ),
);

// ── 2. Metas ──
caso("Metas del equipo: «vendido» hoy y en el mes se llena solo con lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("me1", "me0", "vendido_hoy", YO_LIMA)} || '/' || ${DELTA("me1", "me0", "ventas_hoy", YO_LIMA)} || '|' ||
                      ${DELTA("me1", "me0", "vendido_mes", YO_LIMA)} || '/' || ${DELTA("me1", "me0", "ventas_mes", YO_LIMA)};`),
    "218.00/2.00|218.00/2.00",
  ),
);

// ── 3. Comercial ──
caso("Comercial por tienda: lo vendido de hoy y del mes solo de CAYLA, y la devolución de una prenda de CLAURE no resta", () =>
  igual(
    conEscena(`select ${DELTA("cs1", "cs0", "ventas_hoy", LIMA_FILA.replace("ubicacion_id", "ubicacion_id"))} || '/' || ${DELTA("cs1", "cs0", "tickets_hoy", LIMA_FILA)} || '/' ||
                      ${DELTA("cs1", "cs0", "unidades_hoy", LIMA_FILA)} || '|' || ${DELTA("cs1", "cs0", "ventas_mes", LIMA_FILA)} || '|' ||
                      ${DELTA("cs1", "cs0", "devuelto_hoy", LIMA_FILA)};`),
    // 218 en 2 tickets y 2 prendas; devuelto: solo la D2 de CAYLA (100), no la D1 de CLAURE (118).
    "218.00/2.00/2.00|218.00|100.00",
  ),
);

caso("Comercial por colaboradora y por hora: solo lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("cc1", "cc0", "ventas_hoy", `e->>'ubicacion_id' = '${LIMA}' and e->>'persona_id' = :'yo'`)} || '/' ||
                      ${DELTA("cc1", "cc0", "tickets_mes", `e->>'ubicacion_id' = '${LIMA}' and e->>'persona_id' = :'yo'`)} || '/' ||
                      ${DELTA("cc1", "cc0", "unidades_mes", `e->>'ubicacion_id' = '${LIMA}' and e->>'persona_id' = :'yo'`)} || '|' ||
                      ${DELTA("ch1", "ch0", "ventas", LIMA_FILA)} || '/' || ${DELTA("ch1", "ch0", "tickets", LIMA_FILA)};`),
    "218.00/2.00/2.00|218.00/2.00",
  ),
);

// ── 4. «Tu día» ──
caso("«Tu día»: sus ventas de hoy no traen la de solo CLAURE y la mixta trae solo su parte; por día, solo lo de CAYLA", () =>
  igual(
    conEscena(`select ((select count(*) from jsonb_array_elements(:'md1'::jsonb)) - (select count(*) from jsonb_array_elements(:'md0'::jsonb))) || '|' ||
                      (select (e->>'total')::numeric(12,2) || '/' || (e->>'prendas') from jsonb_array_elements(:'md1'::jsonb) e where e->>'venta_id' = ${ID("a1")}) || '|' ||
                      ${DELTA("mp1", "mp0", "total")} || '/' || ${DELTA("mp1", "mp0", "ventas")};`),
    // En Lima, 2 ventas (S1 y S3; la S2 no) y la S1 trae solo su línea de CAYLA: 118 en 1 prenda. Por día es de la persona en TODAS las sedes: 218 de Lima
    // en 2 ventas más la de Trujillo (100, sin CLAURE) = 318 en 3.
    "2|118.00/1|318.00/3.00",
  ),
);

// ── 5. Idempotencia ──
caso("las migraciones se pueden volver a pegar: mismas cifras y sin error", () =>
  igual(
    ultima(
      psql(`${PRELUDIO}
\\o /dev/null
${MIGRACION}
\\o
${FOTO(0)}
${VENTAS()}
${FOTO(1)}
select ${DELTA("eq1", "eq0", "soles", YO_LIMA)};
rollback;`),
    ),
    "218.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

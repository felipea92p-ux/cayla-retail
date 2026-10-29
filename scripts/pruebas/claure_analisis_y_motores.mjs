#!/usr/bin/env node
/**
 * Prueba de `20261029041000_claure_fuera_de_analisis_y_motores.sql` (ADR-0560, actividad 6d): lo vendido de CLAURE no cuenta en Análisis, en el Plan del piso, en la
 * demanda, en el plan de compra (lo que lee `fn_unidades_vendidas` y su historial), en la rentabilidad, en la calidad por origen ni en el costo estimado del Resumen.
 *
 * Lo que importa: (1) cada una cuenta SOLO las líneas de CAYLA (una prenda de CLAURE vendida en Lima no suma; la de CAYLA sí; la misma prenda en Trujillo, donde CLAURE no
 * opera, tampoco se toca); (2) lo anterior al arranque de la cuenta de CLAURE cuenta como siempre; (3) las migraciones se pueden volver a pegar. Lo que NO cubre esta prueba
 * con una cifra, y solo vigila el chequeo final de la migración (que cada función quedó llamando a la regla) y la idempotencia: `fn_plan_compra`, `fn_frescura_decisiones`,
 * `fn_motor_demanda_preparacion` y las dos de la vitrina de la tienda web, porque sembrar su escena (un plan, una decisión, una vitrina publicada) es más grande que su
 * cambio, que es la misma línea que las demás. Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK; todo se mide como DIFERENCIA
 * contra la foto de antes de la escena, porque la base local la comparten varias sesiones.
 *
 * USO: pnpm pruebas:claure-analisis-y-motores   (necesita el stack local: `npx supabase start`)
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
const MIGRACION = leer("20261029041000_claure_fuera_de_analisis_y_motores.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
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
// A = una prenda de CLAURE; B = una de CAYLA (las dos con categoría que entra a los motores). Todo en hora de Lima, hoy.
//   S1 mixta: A 118 + B 118 · S2 solo CLAURE: A 177 · S3 solo CAYLA: B 100 · S5 Trujillo: A 100 (la sede sin CLAURE no separa nada)
//   AYER (la demanda y la calidad solo miran días cerrados): S6 solo CLAURE: A 50 · S7 solo CAYLA: B 30
//   S4 (solo en el caso de «antes del arranque»): A 59 hace 12 días.
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
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select va.id as va_a, va.producto_id as p_a
  from retail.variantes va join retail.productos pr on pr.id = va.producto_id
 where pr.categoria_id is not null and retail.fn_categoria_entra_a_motores(pr.categoria_id) and not pr.es_prueba
 order by va.id limit 1 \\gset
select va.id as va_b
  from retail.variantes va join retail.productos pr on pr.id = va.producto_id
 where pr.categoria_id is not null and retail.fn_categoria_entra_a_motores(pr.categoria_id) and not pr.es_prueba and va.producto_id <> :'p_a'
 order by va.id limit 1 \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
delete from retail.stock where variante_id in (:'va_a', :'va_b') and ubicacion_id = '${LIMA}';
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'va_a', '${LIMA}', 5), (:'va_b', '${LIMA}', 5);
`;

const FOTO = (n) =>
  `${COMO(FELIPE)}
select retail.fn_analisis_sede('${LIMA}')::text as an${n},
       retail.fn_piso_plan_lectura('${LIMA}')::text as pi${n},
       retail.fn_demanda_sede('${LIMA}', 14)::text as de${n},
       retail.fn_historial_ventas(:'hoy'::date - 12, :'hoy'::date)::text as hi${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_costo_estimado_resumen(:'hoy'::date, :'hoy'::date, null) x)::text as co${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_rentabilidad(:'hoy'::date, 1, 0.18) x)::text as re${n},
       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from retail.fn_calidad(:'hoy'::date, 1, 0) x)::text as ca${n} \\gset
${SUPER}
select (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
          from retail.fn_unidades_vendidas((:'hoy'::date - 13)::timestamp at time zone 'America/Lima', (:'hoy'::date + 1)::timestamp at time zone 'America/Lima') x)::text as un${n} \\gset`;

const VENTAS = (conS4 = false) => `
${SUPER}
set local session_replication_role = replica;
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, asesora_id, usuario_id) values
  (${ID("a1")}, '${LIMA}', (:'hoy'::date + time '00:10')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a2")}, '${LIMA}', (:'hoy'::date + time '00:15')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a3")}, '${LIMA}', (:'hoy'::date + time '00:20')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a5")}, '${TRUJILLO}', (:'hoy'::date + time '00:25')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a6")}, '${LIMA}', ((:'hoy'::date - 1) + time '00:05')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo'),
  (${ID("a7")}, '${LIMA}', ((:'hoy'::date - 1) + time '00:10')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo')${
    conS4 ? `,\n  (${ID("a4")}, '${LIMA}', ((:'hoy'::date - 12) + time '00:05')::timestamp at time zone 'America/Lima', 'completada', false, :'yo', :'yo')` : ""
  };
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 118, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 118, 10),
  (${ID("b3")}, ${ID("a2")}, :'va_a', 1, 177, 10),
  (${ID("b4")}, ${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("b6")}, ${ID("a5")}, :'va_a', 1, 100, 10),
  (${ID("b7")}, ${ID("a6")}, :'va_a', 1, 50, 10),
  (${ID("b8")}, ${ID("a7")}, :'va_b', 1, 30, 10)${conS4 ? `,\n  (${ID("b5")}, ${ID("a4")}, :'va_a', 1, 59, 10)` : ""};
`;

// Sumas de un campo de las filas de una foto jsonb (un arreglo, o el arreglo de una clave) que cumplen una condición.
const SUMA = (foto, campo, donde = "true", camino = "") =>
  `coalesce((select sum((e->>'${campo}')::numeric) from jsonb_array_elements(:'${foto}'::jsonb${camino}) e where ${donde}), 0)`;
const DELTA = (n1, n0, campo, donde = "true", camino = "") => `(${SUMA(n1, campo, donde, camino)} - ${SUMA(n0, campo, donde, camino)})::numeric(12,2)`;

const dentro = (cuerpo) => psql(`${PRELUDIO}\n${cuerpo}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const ultima = (s) => s.split("\n").pop();
const conEscena = (consulta, conS4 = false) => ultima(dentro(`${FOTO(0)}\n${VENTAS(conS4)}\n${FOTO(1)}\n${consulta}`));

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

// ── 1. Lo vendido que leen el plan de compra y sus resultados ──
caso("fn_unidades_vendidas: Lima cuenta solo lo de CAYLA; Trujillo (sin CLAURE) cuenta su venta entera", () =>
  igual(
    conEscena(`select ${DELTA("un1", "un0", "unidades", `e->>'ubicacion_id' = '${LIMA}'`)} || '/' || ${DELTA("un1", "un0", "soles", `e->>'ubicacion_id' = '${LIMA}'`)} || '|' ||
                      ${DELTA("un1", "un0", "unidades", `e->>'ubicacion_id' = '${TRUJILLO}'`)} || '/' || ${DELTA("un1", "un0", "soles", `e->>'ubicacion_id' = '${TRUJILLO}'`)};`),
    // Lima: las prendas de CAYLA (B de la S1, 118; B de la S3, 100; B de ayer, 30): 3 unidades y 248; las de CLAURE (A) no. Trujillo: la A vendida allá (100), que sí cuenta.
    "3.00/248.00|1.00/100.00",
  ),
);

caso("fn_unidades_vendidas: lo anterior al arranque cuenta como siempre", () =>
  igual(conEscena(`select ${DELTA("un1", "un0", "unidades", `e->>'ubicacion_id' = '${LIMA}' and e->>'fecha' = (:'hoy'::date - 12)::text`)};`, true), "1.00"),
);

caso("fn_historial_ventas: lo vendido por tienda y día solo de CAYLA (lo de antes del arranque, entero)", () =>
  igual(
    conEscena(
      `select ${DELTA("hi1", "hi0", "s", `e->>'u' = '${LIMA}' and e->>'f' = :'hoy'`, "->'dias'")} || '|' ||
              ${DELTA("hi1", "hi0", "s", `e->>'u' = '${LIMA}' and e->>'f' = (:'hoy'::date - 12)::text`, "->'dias'")};`,
      true,
    ),
    "218.00|59.00",
  ),
);

// ── 2. Análisis y los motores del piso ──
caso("Análisis: las unidades vendidas de cada prenda en 30 días solo cuentan lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("an1", "an0", "vendidas_30", "e->>'variante_id' = :'va_a'", "->'prendas'")} || '|' || ${DELTA("an1", "an0", "vendidas_30", "e->>'variante_id' = :'va_b'", "->'prendas'")};`),
    // La prenda de CLAURE (A) no suma nada en Lima; la de CAYLA (B) suma sus tres unidades (dos de hoy y una de ayer).
    "0.00|3.00",
  ),
);

caso("Plan del piso: lo que se llevó el cliente solo cuenta lo de CAYLA", () =>
  igual(conEscena(`select ${DELTA("pi1", "pi0", "escaneadas", "true", "->'ventas'")};`), "3.00"),
);

caso("Demanda (días cerrados: hasta ayer): las unidades vendidas de cada prenda solo cuentan lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("de1", "de0", "vendidas", "e->>'variante_id' = :'va_a'", "->'variantes'")} || '|' || ${DELTA("de1", "de0", "vendidas", "e->>'variante_id' = :'va_b'", "->'variantes'")};`),
    "0.00|1.00",
  ),
);

// ── 3. Rentabilidad, calidad y el costo estimado del Resumen ──
caso("Rentabilidad (hoy) y calidad por origen (ayer): el total cuenta solo lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("re1", "re0", "unidades", "e->>'nivel' = 'total'")} || '|' || ${DELTA("ca1", "ca0", "unidades_vendidas", "e->>'nivel' = 'total'")};`),
    // Rentabilidad de hoy: las 2 de CAYLA en Lima y la de Trujillo (3). Calidad de ayer: la B de CAYLA (1); la A de CLAURE no.
    "3.00|1.00",
  ),
);

caso("Costo estimado del Resumen: unidades, costo y venta solo de lo de CAYLA", () =>
  igual(
    conEscena(`select ${DELTA("co1", "co0", "unidades_total", "true")} || '|' || ${DELTA("co1", "co0", "costo_total", "true")} || '|' || ${DELTA("co1", "co0", "venta_total", "true")};`),
    // 3 unidades (las 2 de CAYLA en Lima + la de Trujillo), 30 de costo y 318 de venta (118 + 100 + 100).
    "3.00|30.00|318.00",
  ),
);

// ── 4. Idempotencia ──
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
select ${DELTA("an1", "an0", "vendidas_30", "e->>'variante_id' = :'va_b'", "->'prendas'")};
rollback;`),
    ),
    "3.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

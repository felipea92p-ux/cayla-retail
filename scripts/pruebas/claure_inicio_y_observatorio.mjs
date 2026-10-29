#!/usr/bin/env node
/**
 * Prueba de `20261029023000_claure_fuera_de_inicio_y_observatorio.sql` (ADR-0560, actividad 6a): lo vendido de CLAURE no suma en el Inicio de la
 * líder ni en el Observatorio del Admin, y Caja (`fn_ventas_del_dia`) no cambia.
 *
 * Lo que importa: (1) `fn_item_es_de_claure` dice «de CLAURE» solo si la sede es de las que CLAURE opera, la venta es del arranque de su cuenta
 * (`empresas.cuenta_corriente_desde`) o después y el dueño real de la línea es CLAURE; (2) `fn_claure_de_hoy` dice cuánto de cada venta de hoy es de
 * CLAURE y cuántas líneas de CAYLA le quedan, y lo de CLAURE de la semana pasada a esta hora; (3) el Observatorio de todas las tiendas suma solo lo de
 * CAYLA (una venta solo de CLAURE no cuenta ni como ticket; la mixta, por sus líneas de CAYLA; lo anterior al arranque y lo de otra sede, como siempre);
 * (4) el de una tienda también, y sus prendas quietas miden solo las unidades de CAYLA; (5) los candados; (6) las migraciones se pueden volver a pegar.
 * Cada caso corre en su transacción con la migración aplicada dentro y TERMINA EN ROLLBACK; todo se mide como DIFERENCIA contra la foto de antes de la
 * escena, porque la base local la comparten varias sesiones.
 *
 * USO: pnpm pruebas:claure-inicio-y-observatorio   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La columna `cuenta_corriente_desde` la crea la actividad 1; esta migración se apoya en ella.
const MIGRACION = leer("20261029023000_claure_fuera_de_inicio_y_observatorio.sql");
const PREVIAS = leer("20261029004000_cuenta_con_claure.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)
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
// A = una prenda de CLAURE; B = una de CAYLA. Todo en hora de Lima: hoy a las 00:xx, hace 12 días (antes del arranque) y hace 7 días.
//   S1 mixta: A 118 + B 118 · S2 solo CLAURE: A 177 · S3 solo CAYLA: B 100 · S4 CLAURE de antes del arranque: A 59 ·
//   S5 Trujillo: A 100 (la sede sin CLAURE no separa nada) · S6 semana pasada Lima: A 50 · S7 semana pasada Lima: B 30
const PRELUDIO = `
begin;
\\o /dev/null
${PREVIAS}
${MIGRACION}
\\o
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, '${LIMA}') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';
update public.personas set rol = 'admin' where auth_user_id = '${FELIPE}';
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
-- Las unidades de A en Lima: se limpian para medir con la foto de antes (la escena de las quietas las pone después).
delete from retail.stock_dueno where variante_id = :'va_a' and ubicacion_id = '${LIMA}';
delete from retail.stock where variante_id = :'va_a' and ubicacion_id = '${LIMA}';
update retail.variantes set created_at = now() - interval '40 days' where id = :'va_a';
create function pg_temp.dia(o jsonb, u text, f text) returns numeric[] language sql as $$
  select array[coalesce(sum((e->>'s')::numeric), 0), coalesce(sum((e->>'t')::numeric), 0), coalesce(sum((e->>'p')::numeric), 0)]
    from jsonb_array_elements(o->'dias') e where e->>'u' = u and e->>'f' = f $$;
create function pg_temp.semana(o jsonb, u text) returns numeric language sql as $$
  select coalesce(sum((e->>'s')::numeric), 0) from jsonb_array_elements(o->'semana_pasada') e where e->>'u' = u $$;
create function pg_temp.lista(o jsonb, ids text[]) returns integer language sql as $$
  select count(*)::integer from jsonb_array_elements(o->'hoy_ventas') e where e->>'id' = any (ids) $$;
create function pg_temp.equipo(l jsonb, ventana text) returns numeric[] language sql as $$
  select array[coalesce(sum((e->>'s')::numeric), 0), coalesce(sum((e->>'t')::numeric), 0)] from jsonb_array_elements(l->'equipo'->ventana) e $$;
create function pg_temp.categorias(l jsonb, ventana text) returns numeric language sql as $$
  select coalesce(sum((e->>'s')::numeric), 0) from jsonb_array_elements(l->'categorias'->ventana) e $$;
`;

const FOTO = (n) =>
  `${COMO(FELIPE)}
select retail.fn_observatorio(60)::text as o${n}, retail.fn_observatorio_tienda('${LIMA}')::text as l${n}, retail.fn_observatorio_tienda('${TRUJILLO}')::text as t${n},
       retail.fn_claure_de_hoy('${LIMA}')::text as c${n} \\gset
${SUPER}`;

const VENTAS = `
${SUPER}
set local session_replication_role = replica;
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba) values
  (${ID("a1")}, '${LIMA}', (:'hoy'::date + time '00:10')::timestamp at time zone 'America/Lima', 'completada', false),
  (${ID("a2")}, '${LIMA}', (:'hoy'::date + time '00:15')::timestamp at time zone 'America/Lima', 'completada', false),
  (${ID("a3")}, '${LIMA}', (:'hoy'::date + time '00:20')::timestamp at time zone 'America/Lima', 'completada', false),
  (${ID("a4")}, '${LIMA}', ((:'hoy'::date - 12) + time '00:05')::timestamp at time zone 'America/Lima', 'completada', false),
  (${ID("a5")}, '${TRUJILLO}', (:'hoy'::date + time '00:25')::timestamp at time zone 'America/Lima', 'completada', false),
  (${ID("a6")}, '${LIMA}', ((:'hoy'::date - 7) + time '00:01')::timestamp at time zone 'America/Lima', 'completada', false),
  (${ID("a7")}, '${LIMA}', ((:'hoy'::date - 7) + time '00:02')::timestamp at time zone 'America/Lima', 'completada', false);
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 118, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 118, 10),
  (${ID("b3")}, ${ID("a2")}, :'va_a', 1, 177, 10),
  (${ID("b4")}, ${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("b5")}, ${ID("a4")}, :'va_a', 1, 59, 10),
  (${ID("b6")}, ${ID("a5")}, :'va_a', 1, 100, 10),
  (${ID("b7")}, ${ID("a6")}, :'va_a', 1, 50, 10),
  (${ID("b8")}, ${ID("a7")}, :'va_b', 1, 30, 10);
-- Las unidades de A en Lima: 8 en el estante, 5 de ellas de CLAURE (stock_dueno guarda lo de los demás dueños).
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'va_a', '${LIMA}', 8);
insert into retail.stock_dueno (variante_id, ubicacion_id, empresa_id, cantidad) values (:'va_a', '${LIMA}', ${CLAURE}, 5);
`;

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

// ── 1. La regla de «esta línea es de CLAURE» ──
caso("fn_item_es_de_claure: sí en Lima desde el arranque; no si es de CAYLA, anterior al arranque o de una sede sin CLAURE", () =>
  igual(
    ultima(
      dentro(`${VENTAS}
select retail.fn_item_es_de_claure(${ID("b1")}, '${LIMA}', now())::text || ',' ||
       retail.fn_item_es_de_claure(${ID("b2")}, '${LIMA}', now())::text || ',' ||
       retail.fn_item_es_de_claure(${ID("b5")}, '${LIMA}', now() - interval '12 days')::text || ',' ||
       retail.fn_item_es_de_claure(${ID("b6")}, '${TRUJILLO}', now())::text;`),
    ),
    "true,false,false,false",
  ),
);

// ── 2. Lo de CLAURE en las ventas de hoy (para el Inicio) ──
caso("fn_claure_de_hoy: dice cuánto de cada venta de hoy es de CLAURE y cuántas líneas de CAYLA le quedan; la semana pasada, lo de CLAURE", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${VENTAS}
${FOTO(1)}
select (select string_agg(e->>'venta_id' || ':' || (e->>'de_claure')::numeric(12,2) || ':' || (e->>'lineas_de_casa'), ' ' order by e->>'venta_id')
          from jsonb_array_elements(:'c1'::jsonb->'hoy') e where e->>'venta_id' in (${ID("a1")}, ${ID("a2")}, ${ID("a3")}))
       || '|' || ((:'c1'::jsonb->>'semana_pasada')::numeric - (:'c0'::jsonb->>'semana_pasada')::numeric)::numeric(12,2)
       || '|' || (:'c1'::jsonb->>'hay_claure');`),
    ),
    // S1: 118 de CLAURE y 1 línea de CAYLA; S2: 177 y 0; S3 no sale. Semana pasada: A 50 de CLAURE (B 30 es de CAYLA).
    "00000000-0000-4000-8000-0000000000a1:118.00:1 00000000-0000-4000-8000-0000000000a2:177.00:0|50.00|true",
  ),
);

caso("fn_claure_de_hoy: una sede donde CLAURE no opera responde «no hay» sin recorrer nada", () =>
  igual(ultima(dentro(`${COMO(FELIPE)}\nselect retail.fn_claure_de_hoy('${TRUJILLO}')::text;`)), '{"hoy": [], "hay_claure": false, "semana_pasada": 0}'),
);

// ── 3. El Observatorio de todas las tiendas ──
caso("fn_observatorio: Lima suma solo lo de CAYLA (una venta solo de CLAURE no cuenta ni como ticket; la mixta, por su línea de CAYLA)", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${VENTAS}
${FOTO(1)}
select ((pg_temp.dia(:'o1'::jsonb, '${LIMA}', :'hoy'))[1] - (pg_temp.dia(:'o0'::jsonb, '${LIMA}', :'hoy'))[1])::numeric(12,2) || '/' ||
       ((pg_temp.dia(:'o1'::jsonb, '${LIMA}', :'hoy'))[2] - (pg_temp.dia(:'o0'::jsonb, '${LIMA}', :'hoy'))[2]) || '/' ||
       ((pg_temp.dia(:'o1'::jsonb, '${LIMA}', :'hoy'))[3] - (pg_temp.dia(:'o0'::jsonb, '${LIMA}', :'hoy'))[3]);`),
    ),
    // S1: la línea de CAYLA 118 (1 prenda); S3: 100 (1 prenda). La S2 (solo CLAURE) no suma nada ni cuenta como ticket: 218 / 2 tickets / 2 prendas.
    "218.00/2/2",
  ),
);

caso("fn_observatorio: las ventas de hoy de la lista no traen la de solo CLAURE, y la mixta trae solo su parte de CAYLA", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${VENTAS}
${FOTO(1)}
select pg_temp.lista(:'o1'::jsonb, array[${ID("a1")}, ${ID("a2")}, ${ID("a3")}]) || '|' ||
       (select (e->>'s')::numeric(12,2) from jsonb_array_elements(:'o1'::jsonb->'hoy_ventas') e where e->>'id' = ${ID("a1")});`),
    ),
    "2|118.00",
  ),
);

caso("fn_observatorio: lo anterior al arranque, lo de la sede sin CLAURE y la semana pasada (solo lo de CAYLA) se miden como se debe", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${VENTAS}
${FOTO(1)}
select ((pg_temp.dia(:'o1'::jsonb, '${LIMA}', (:'hoy'::date - 12)::text))[1] - (pg_temp.dia(:'o0'::jsonb, '${LIMA}', (:'hoy'::date - 12)::text))[1])::numeric(12,2) || '|' ||
       ((pg_temp.dia(:'o1'::jsonb, '${TRUJILLO}', :'hoy'))[1] - (pg_temp.dia(:'o0'::jsonb, '${TRUJILLO}', :'hoy'))[1])::numeric(12,2) || '|' ||
       (pg_temp.semana(:'o1'::jsonb, '${LIMA}') - pg_temp.semana(:'o0'::jsonb, '${LIMA}'))::numeric(12,2);`),
    ),
    // Antes del arranque nada cambia (59); Trujillo cuenta su venta entera (100); la semana pasada de Lima, solo la de CAYLA (30; la de 50 era de CLAURE).
    "59.00|100.00|30.00",
  ),
);

// ── 4. El Observatorio de una tienda ──
caso("fn_observatorio_tienda: las ventas por equipo y categoría suman solo lo de CAYLA; lo anterior al arranque cuenta", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${VENTAS}
${FOTO(1)}
select ((pg_temp.equipo(:'l1'::jsonb, 'hoy'))[1] - (pg_temp.equipo(:'l0'::jsonb, 'hoy'))[1])::numeric(12,2) || '/' ||
       ((pg_temp.equipo(:'l1'::jsonb, 'hoy'))[2] - (pg_temp.equipo(:'l0'::jsonb, 'hoy'))[2]) || '|' ||
       (pg_temp.categorias(:'l1'::jsonb, 'd30') - pg_temp.categorias(:'l0'::jsonb, 'd30'))::numeric(12,2);`),
    ),
    // Hoy: 118 + 100 en 2 tickets. En 30 días además la S4 de antes del arranque (59) y la S7 de la semana pasada (30): 218 + 59 + 30 = 307.
    "218.00/2|307.00",
  ),
);

caso("fn_observatorio_tienda: Trujillo (sin CLAURE) cuenta su venta entera", () =>
  igual(
    ultima(
      dentro(`${FOTO(0)}
${VENTAS}
${FOTO(1)}
select ((pg_temp.equipo(:'t1'::jsonb, 'hoy'))[1] - (pg_temp.equipo(:'t0'::jsonb, 'hoy'))[1])::numeric(12,2) || '/' ||
       ((pg_temp.equipo(:'t1'::jsonb, 'hoy'))[2] - (pg_temp.equipo(:'t0'::jsonb, 'hoy'))[2]);`),
    ),
    "100.00/1",
  ),
);

caso("fn_observatorio_tienda: las prendas quietas miden solo las unidades de CAYLA (8 en el estante, 5 de CLAURE: quedan 3)", () =>
  igual(
    ultima(
      // Sin la venta de antes del arranque: esa SÍ cuenta como de CAYLA (nada cambia antes del arranque) y la prenda no estaría quieta.
      dentro(`${FOTO(0)}
${VENTAS}
delete from retail.venta_items where venta_id = ${ID("a4")};
delete from retail.ventas where id = ${ID("a4")};
${FOTO(1)}
select ((:'l1'::jsonb->'quietas'->>'variantes')::int - (:'l0'::jsonb->'quietas'->>'variantes')::int) || '|' ||
       ((:'l1'::jsonb->'quietas'->>'unidades')::int - (:'l0'::jsonb->'quietas'->>'unidades')::int);`),
    ),
    "1|3",
  ),
);

// ── 5. Candados ──
caso("quien no es líder no lee otra sede (42501) y su propia sede sí; anon no ejecuta y nadie ejecuta el ayudante", () => {
  const sede = (id, como) => {
    try {
      return ultima(dentro(`${COMO(MICAELA)}\nselect (retail.fn_claure_de_hoy('${id}')->>'hay_claure');`));
    } catch (e) {
      return String(e.stderr).includes("No puedes ver las ventas de esa sede") ? "42501" : `otro error: ${String(e.stderr).split("\n")[0]}`;
    }
  };
  const privilegios = ultima(
    dentro(`select has_function_privilege('anon', 'retail.fn_claure_de_hoy(uuid)', 'execute')::text || ',' ||
                   has_function_privilege('authenticated', 'retail.fn_claure_de_hoy(uuid)', 'execute')::text || ',' ||
                   has_function_privilege('authenticated', 'retail.fn_item_es_de_claure(uuid,uuid,timestamptz)', 'execute')::text;`),
  );
  return igual(`${sede(LIMA)}|${sede(TRUJILLO)}|${privilegios}`, "42501|false|false,true,false");
});

// ── 6. Idempotencia ──
caso("las migraciones se pueden volver a pegar: mismas cifras y sin error", () =>
  igual(
    ultima(
      psql(`${PRELUDIO}
\\o /dev/null
${MIGRACION}
\\o
${FOTO(0)}
${VENTAS}
${FOTO(1)}
select ((pg_temp.dia(:'o1'::jsonb, '${LIMA}', :'hoy'))[1] - (pg_temp.dia(:'o0'::jsonb, '${LIMA}', :'hoy'))[1])::numeric(12,2);
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

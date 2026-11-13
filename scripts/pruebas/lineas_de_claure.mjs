#!/usr/bin/env node
/**
 * Prueba de `20261113201000_claure_de_una_pasada_en_los_motores.sql` (ADR-0658): `fn_lineas_de_claure` pregunta CLAURE de una pasada, y el plan del
 * piso y el plan de compra dicen lo mismo que cuando preguntaban `fn_item_es_de_claure` línea por línea.
 *
 * Lo que importa:
 *   (1) el ayudante devuelve EXACTAMENTE las líneas que `fn_item_es_de_claure` marca (diferencia simétrica vacía), en varias ventanas y por sede;
 *   (2) en una escena con todos los bordes (ticket mixto, antes y después del arranque de la cuenta, el borde del día de arranque, una sede sin
 *       CLAURE, dueño por la salida del libro en las dos direcciones, devolución, cambio, prenda anotada pendiente y regularizada, venta anulada),
 *       las líneas de CLAURE son las que deben ser, con nombre;
 *   (3) la salida del plan del piso (dos sedes) y del plan de compra (una campaña de la escena) tiene el MISMO md5 con el cambio y sin él (el
 *       reemplazo se deshace dentro de la transacción con `sqlDeshacer`), y el control: sin CLAURE ligada a la sede, esa salida CAMBIA (la escena
 *       sí ejercita la regla);
 *   (4) la web no puede llamar al ayudante, y la migración se puede volver a pegar sin cambiar nada.
 * Cada caso corre en su transacción y TERMINA EN ROLLBACK: la base local la comparten varias sesiones.
 *
 * USO: pnpm pruebas:lineas-de-claure   (necesita el stack local: `npx supabase start`, con todas las migraciones)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlDeshacer } from "./_deshacer_claure.mjs";
import { ELEGIR_A, ELEGIR_B } from "./_claure_prendas.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ARCHIVO = "20261113201000_claure_de_una_pasada_en_los_motores.sql";
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations", ARCHIVO), "utf8");
const SIN_EL_CAMBIO = sqlDeshacer(ARCHIVO, ["retail.fn_piso_plan_lectura(uuid)", "retail.fn_plan_compra(uuid)"]);
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";
const CENTINELA = "'22222222-2222-4222-8222-222222222222'";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const idSede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = idSede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = idSede("'Tienda TRU', 'Tienda Trujillo'");
const COMO_FELIPE = `reset role;\nset local request.jwt.claim.sub = '${FELIPE}';\nset local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';\nset local role authenticated;`;

const ID = (n) => `'00000000-0000-4658-8000-0000000000${n}'`;
const LIMA_A = (dias, hora) => `((:'hoy'::date - ${dias}) + time '${hora}')::timestamp at time zone 'America/Lima'`;

// La escena. A es de CLAURE (su producto), B de CAYLA. CLAURE opera en Lima desde hace 10 días. Cada línea dice si es de CLAURE:
//   i01 Lima hoy, ticket mixto, A ×1 ............ SÍ      i02 el mismo ticket, B ×2 ........................ no
//   i03 Lima hace 3 días, A ×1, devuelta ......... SÍ      i04 Lima hace 12 días (antes del arranque), A .... no
//   i05 Lima el día del arranque, 00:30, A ....... SÍ      i06 Lima la víspera del arranque, 23:30, A ....... no
//   i07 Trujillo hoy, A (sede sin CLAURE) ........ no      i08 Lima hoy, B, pero su salida es de CLAURE ...... SÍ
//   i09 Lima hoy, A, pero su salida es de CAYLA .. no      i10 Lima hace 2 días, A, cambiada por B ........... SÍ
//   i11 Lima ayer, anotada (centinela) pendiente . según su prenda centinela (se compara, no se nombra)
//   i12 Lima ayer, anotada y ya regularizada a A . SÍ      i13 Lima hoy, A, venta anulada ................... SÍ (la regla no mira el estado)
const ESCENA = `
${ELEGIR_A}
${ELEGIR_B}
select (now() at time zone 'America/Lima')::date::text as hoy \\gset
select p.categoria_id as cat_a, va.talla_id as talla_a, va.color_codigo as color_a
  from retail.variantes va join retail.productos p on p.id = va.producto_id where va.id = :'va_a' \\gset
reset role;
set local session_replication_role = replica;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;
update retail.empresas set activo = true, cuenta_corriente_desde = :'hoy'::date - 10 where clave = 'claure';
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
insert into retail.ventas (id, ubicacion_id, created_at, estado) values
  (${ID("01")}, ${LIMA}, ${LIMA_A(0, "00:10")}, 'completada'),
  (${ID("02")}, ${LIMA}, ${LIMA_A(3, "10:00")}, 'completada'),
  (${ID("03")}, ${LIMA}, ${LIMA_A(12, "10:00")}, 'completada'),
  (${ID("04")}, ${LIMA}, ${LIMA_A(10, "00:30")}, 'completada'),
  (${ID("05")}, ${LIMA}, ${LIMA_A(11, "23:30")}, 'completada'),
  (${ID("06")}, ${TRUJILLO}, ${LIMA_A(0, "00:20")}, 'completada'),
  (${ID("07")}, ${LIMA}, ${LIMA_A(0, "00:30")}, 'completada'),
  (${ID("08")}, ${LIMA}, ${LIMA_A(0, "00:40")}, 'completada'),
  (${ID("09")}, ${LIMA}, ${LIMA_A(2, "10:00")}, 'completada'),
  (${ID("10")}, ${LIMA}, ${LIMA_A(1, "10:00")}, 'completada'),
  (${ID("11")}, ${LIMA}, ${LIMA_A(1, "11:00")}, 'completada');
insert into retail.ventas (id, ubicacion_id, created_at, estado, anulado_en, motivo_anulacion) values
  (${ID("12")}, ${LIMA}, ${LIMA_A(0, "00:50")}, 'anulada', now(), 'Prueba ADR-0658');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("51")}, ${ID("01")}, :'va_a', 1, 100, 10), (${ID("52")}, ${ID("01")}, :'va_b', 2, 100, 10),
  (${ID("53")}, ${ID("02")}, :'va_a', 1, 100, 10), (${ID("54")}, ${ID("03")}, :'va_a', 1, 100, 10),
  (${ID("55")}, ${ID("04")}, :'va_a', 1, 100, 10), (${ID("56")}, ${ID("05")}, :'va_a', 1, 100, 10),
  (${ID("57")}, ${ID("06")}, :'va_a', 1, 100, 10), (${ID("58")}, ${ID("07")}, :'va_b', 1, 100, 10),
  (${ID("59")}, ${ID("08")}, :'va_a', 1, 100, 10), (${ID("60")}, ${ID("09")}, :'va_a', 1, 100, 10),
  (${ID("61")}, ${ID("10")}, ${CENTINELA}, 1, 100, 10), (${ID("62")}, ${ID("11")}, :'va_a', 1, 100, 10),
  (${ID("63")}, ${ID("12")}, :'va_a', 1, 100, 10);
-- El dueño por la salida del libro: i08 (B) salió como de CLAURE, i09 (A) como de CAYLA.
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, venta_item_id, empresa_id, created_at) values
  (:'va_b', ${LIMA}, 'salida', 1, ${ID("58")}, ${CLAURE}, ${LIMA_A(0, "00:30")}),
  (:'va_a', ${LIMA}, 'salida', 1, ${ID("59")}, ${CAYLA}, ${LIMA_A(0, "00:40")});
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, aprobado_en) values (${ID("71")}, ${ID("02")}, ${LIMA}, 'Prueba ADR-0658', 'aprobada', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (${ID("71")}, ${ID("53")}, 1, 'vendible');
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, motivo) values (${ID("60")}, ${LIMA}, :'va_b', 1, 'talla_chica');
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, estado) values
  (${ID("61")}, ${LIMA}, 'Prueba ADR-0658 pendiente', :'cat_a', :'talla_a', :'color_a', 100, 'pendiente');
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, estado,
                                            variante_id, forma, precio_oficial, diferencia, regularizado_en) values
  (${ID("62")}, ${LIMA}, 'Prueba ADR-0658 regularizada', :'cat_a', :'talla_a', :'color_a', 100, 'regularizada', :'va_a', 'ya_registrada', 100, 0, now());
insert into retail.planes_compra (id, nombre, desde, hasta) values (${ID("81")}, 'Prueba ADR-0658', :'hoy'::date - 20, :'hoy'::date + 10);
set local session_replication_role = origin;
`;

// Las líneas que marca la regla de siempre en una ventana (todas las de la base, no solo las de la escena).
const POR_LINEA = (desde, hasta, sede = "null") => `
  select vi.id from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
   where v.created_at >= ${desde} and v.created_at < ${hasta} and (${sede}::uuid is null or v.ubicacion_id = ${sede}::uuid)
     and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)`;
const DE_UNA_PASADA = (desde, hasta, sede = "null") => `select l from retail.fn_lineas_de_claure(${desde}, ${hasta}, ${sede}::uuid) l`;
const DIFERENCIA = (desde, hasta, sede) =>
  `(select count(*) from ((${POR_LINEA(desde, hasta, sede)} except ${DE_UNA_PASADA(desde, hasta, sede)})
                        union all (${DE_UNA_PASADA(desde, hasta, sede)} except ${POR_LINEA(desde, hasta, sede)})) x)`;

const enEscena = (cuerpo) => psql(`begin;\n\\o /dev/null\n${ESCENA}\n\\o\n${cuerpo}\nrollback;`).split("\n").pop();
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);

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

caso("(1) el ayudante y fn_item_es_de_claure marcan las mismas líneas, en seis ventanas (toda la red, por sede, el borde del arranque)", () =>
  igual(
    enEscena(`reset role;
select concat_ws(',',
  ${DIFERENCIA("(:'hoy'::date - 30)::timestamp at time zone 'America/Lima'", "'infinity'::timestamptz")},
  ${DIFERENCIA("now() - interval '90 days'", "now()")},
  ${DIFERENCIA("now() - interval '30 days'", "now()", LIMA)},
  ${DIFERENCIA("now() - interval '30 days'", "'infinity'::timestamptz", TRUJILLO)},
  ${DIFERENCIA(LIMA_A(10, "00:00"), LIMA_A(9, "00:00"))},
  ${DIFERENCIA("'-infinity'::timestamptz", "'infinity'::timestamptz")});`),
    "0,0,0,0,0,0",
  ),
);

caso("(2) en la escena, las líneas de CLAURE son i01, i03, i05, i08, i10, i12 e i13 (y la anotada pendiente dice lo mismo por las dos vías)", () =>
  igual(
    enEscena(`reset role;
select (select string_agg('i' || (right(l::text, 2)::int - 50)::text, ',' order by l)
          from retail.fn_lineas_de_claure('-infinity', 'infinity') l
         where l::text like '00000000-0000-4658-8000-%' and l <> ${ID("61")})
       || '|' || ((select count(*) from retail.fn_lineas_de_claure('-infinity', 'infinity') l where l = ${ID("61")})
                  = (select count(*) from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
                      where vi.id = ${ID("61")} and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)))::text;`),
    "i1,i3,i5,i8,i10,i12,i13|true",
  ),
);

// La salida de un motor, con el cambio, sin el cambio, y sin CLAURE ligada a Lima (el control).
const TRES_FOTOS = (consulta) => `${COMO_FELIPE}
select md5((${consulta})::text) as con \\gset
\\o /dev/null
${SIN_EL_CAMBIO}
\\o
${COMO_FELIPE}
select md5((${consulta})::text) as sin \\gset
reset role;
delete from retail.empresa_sedes where empresa_id = ${CLAURE};
${COMO_FELIPE}
select md5((${consulta})::text) as sin_claure \\gset
select concat_ws(',', (:'con' = :'sin')::text, (:'con' <> :'sin_claure')::text);`;

caso("(3a) el plan del piso de Lima sale idéntico con el cambio y sin él, y cambia si Lima no fuera de CLAURE (control)", () =>
  igual(enEscena(TRES_FOTOS(`retail.fn_piso_plan_lectura(${LIMA})`)), "true,true"),
);

caso("(3b) el plan del piso de Trujillo (sin CLAURE) sale idéntico con el cambio y sin él", () =>
  igual(enEscena(TRES_FOTOS(`retail.fn_piso_plan_lectura(${TRUJILLO})`)).split(",")[0], "true"),
);

caso("(3c) el plan de compra (90 días, 30 días y la campaña de la escena) sale idéntico con el cambio y sin él, y cambia sin CLAURE (control)", () =>
  igual(enEscena(TRES_FOTOS(`retail.fn_plan_compra(${ID("81")})`)), "true,true"),
);

caso("(4a) la web no puede llamar al ayudante (anon ni authenticated)", () =>
  igual(
    psql(`select concat_ws(',', has_function_privilege('anon', 'retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid)', 'execute')::text,
                                has_function_privilege('authenticated', 'retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid)', 'execute')::text);`),
    "false,false",
  ),
);

caso("(4b) la migración se puede volver a pegar: los dos cuerpos quedan con el mismo md5", () =>
  igual(
    psql(`begin;
select string_agg(md5(prosrc), ',' order by proname) as antes from pg_proc where oid in ('retail.fn_piso_plan_lectura(uuid)'::regprocedure, 'retail.fn_plan_compra(uuid)'::regprocedure) \\gset
\\o /dev/null
${MIGRACION}
\\o
select (string_agg(md5(prosrc), ',' order by proname) = :'antes')::text from pg_proc where oid in ('retail.fn_piso_plan_lectura(uuid)'::regprocedure, 'retail.fn_plan_compra(uuid)'::regprocedure);
rollback;`).split("\n").pop(),
    "true",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

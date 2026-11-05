#!/usr/bin/env node
/**
 * Prueba de `20261029154000_claure_perdidas_y_danadas.sql` (ADR-0560, actividad 14): la merma y la prenda dañada de CLAURE no son de CAYLA. Pérdidas (`fn_perdidas_hechos`),
 * la calidad de dañadas (`fn_calidad_danadas`), el Diario (cuenta 6951, `fn_asientos`) y las mermas sin costo del Estado de resultados apartan lo que es de CLAURE; lo de CAYLA sigue igual.
 *
 * Lo que importa: (1) Pérdidas lista la merma de CAYLA y no la de CLAURE (movimiento ni anulación); (2) la calidad de dañadas cuenta la devolución y la anulación de una prenda de CAYLA y no
 * las de CLAURE; (3) el Diario no asienta la merma de CLAURE y sí la de CAYLA; (4) las mermas sin costo del Estado de resultados no cuentan la de CLAURE; (5) una merma de CLAURE ANTES del
 * arranque de su cuenta, o de una sede donde CLAURE no opera, sigue siendo de CAYLA; (6) la migración se puede volver a pegar y, con un texto distinto en una función, aborta sin cambiar nada.
 * Cada caso corre en su transacción y TERMINA EN ROLLBACK. Parte del estado de ANTES de la migración (deshace sus reemplazos dentro de la transacción) y luego la aplica: sin ella, los casos fallan.
 *
 * USO: pnpm pruebas:claure-perdidas-y-danadas   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlDeshacer } from "./_deshacer_claure.mjs";
import { ELEGIR_A, ELEGIR_B } from "./_claure_prendas.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const ARCHIVO = "20261029154000_claure_perdidas_y_danadas.sql";
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029020000_claure_fuera_de_las_cifras_de_cayla.sql"),
].join("\n");
const FIRMAS = [
  "retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)",
  "retail.fn_calidad_danadas(date, integer)",
  "retail.fn_asientos(date, date, uuid)",
  "retail.fn_estado_resultados(date, date, uuid)",
];
const ANTES = sqlDeshacer(ARCHIVO, FIRMAS);
const MIGRACION = leer(ARCHIVO);
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const sesion = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';`;

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// A = prenda de CLAURE, B = de CAYLA (sin costo cargado: así cuentan como «merma sin costo»). Movimientos de HOY en Lima:
//   m1 ajuste −2 de A (dueño CLAURE) · m2 ajuste −3 de B (dueño CAYLA) · m3 salida «cuarentena_se_boto» 1 de A (CLAURE) · m4 ajuste −4 de A de HACE 12 DÍAS (antes del arranque: es de CAYLA) · m5 ajuste −5 de A en TRUJILLO.
// Más: una venta anulada con una línea de A y otra de B, ambas dañadas, y una devolución aprobada con una de A y una de B, ambas dañadas.
const ESCENA = `
${ELEGIR_A}
${ELEGIR_B}
reset role;
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
update retail.variantes set costo = 0 where id in (:'va_a', :'va_b');
delete from retail.costo_historial where variante_id in (:'va_a', :'va_b');
insert into retail.movimientos (id, variante_id, ubicacion_id, tipo, cantidad, motivo, empresa_id, created_at) values
  (${ID("c1")}, :'va_a', ${LIMA}, 'ajuste', -2, 'perdida', ${CLAURE}, now()),
  (${ID("c2")}, :'va_b', ${LIMA}, 'ajuste', -3, 'perdida', ${CAYLA}, now()),
  (${ID("c3")}, :'va_a', ${LIMA}, 'salida', 1, 'cuarentena_se_boto', ${CLAURE}, now()),
  (${ID("c4")}, :'va_a', ${LIMA}, 'ajuste', -4, 'perdida', ${CLAURE}, now() - interval '12 days'),
  (${ID("c5")}, :'va_a', ${TRUJILLO}, 'ajuste', -5, 'perdida', ${CLAURE}, now());
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, anulado_en, motivo_anulacion) values
  (${ID("a1")}, ${LIMA}, now() - interval '2 hours', 'anulada', false, now(), 'prueba');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 100, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 100, 10);
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values
  (${ID("a1")}, ${ID("b1")}, 'danada_reparacion'), (${ID("a1")}, ${ID("b2")}, 'danada_reparacion');
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba) values
  (${ID("a2")}, ${LIMA}, now() - interval '3 hours', 'completada', false);
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b3")}, ${ID("a2")}, :'va_a', 2, 100, 10), (${ID("b4")}, ${ID("a2")}, :'va_b', 3, 100, 10);
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
  values (${ID("d1")}, ${ID("a2")}, ${LIMA}, 'prueba', 'aprobada', 0, 'efectivo', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values
  (${ID("d1")}, ${ID("b3")}, 2, 'danada_reparacion'), (${ID("d1")}, ${ID("b4")}, 3, 'danada_reparacion');
set local session_replication_role = origin;
`;
const MOVS = `(${["c1", "c2", "c3", "c4", "c5"].map(ID).join(", ")})`;

// `fn_perdidas_hechos` y la del Diario se leen como dueño de la base (la pantalla las llama con el candado de su RPC); la calidad, como líder.
const medir = (consulta, { sinMigracion = false, conEscena = true } = {}) =>
  ultima(psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${sinMigracion ? "" : MIGRACION}\n${ESCENA_EMPRESAS}\n${conEscena ? ESCENA : ""}\n\\o\n${consulta}\nrollback;`));
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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 12).join("\n    ")}`);
  }
}

const HOY = `(now() at time zone 'America/Lima')::date`;
// Los hechos de Pérdidas de nuestras prendas, de los últimos 30 días, en Lima.
const HECHOS = `reset role;
select coalesce(string_agg(fuente || ':' || coalesce(right(fuente_id::text, 2), '') || ':' || unidades, ' ' order by fuente, fuente_id), '')
  from retail.fn_perdidas_hechos(${LIMA}, ((now() at time zone 'America/Lima')::date - 30)::timestamp at time zone 'America/Lima', ((now() at time zone 'America/Lima')::date + 1)::timestamp at time zone 'America/Lima')
 where variante_id in (:'va_a', :'va_b');`;

caso("Pérdidas: la merma de CAYLA sí y la de CLAURE no; la de antes del arranque sigue siendo de CAYLA; la anulación de una prenda de CLAURE tampoco", () =>
  igual(
    medir(HECHOS),
    // m2 (CAYLA, 3) · m4 (CLAURE pero de hace 12 días: antes del arranque, 4) · la anulación de la prenda de CAYLA (b2, 1). m1 y m3 (CLAURE de hoy) y la anulación de A (b1) no.
    "anulacion:b2:1 movimiento:c2:3 movimiento:c4:4",
  ),
);

const CALIDAD = `${sesion(FELIPE)}
select coalesce(sum(unidades) filter (where origen = 'devolucion'), 0) || '|' || coalesce(sum(unidades) filter (where origen = 'anulacion'), 0)
  from retail.fn_calidad_danadas(${HOY}, 1) where ubicacion_id = ${LIMA};`;
// Lo de la base local se suma a lo de la escena: se mide la DIFERENCIA entre la base con la escena y sin ella.
const diferencia = (consulta, opciones) => {
  const con = medir(consulta, opciones).split("|").map(Number);
  const sin = medir(consulta, { ...opciones, conEscena: false }).split("|").map(Number);
  return con.map((n, k) => n - sin[k]).join("|");
};

caso("la calidad de dañadas cuenta la devolución (3) y la anulación (1) de una prenda de CAYLA, y no las de CLAURE; sin la migración contaba 5 y 2", () =>
  igual(diferencia(CALIDAD), "3|1") ?? igual(diferencia(CALIDAD, { sinMigracion: true }), "5|2"),
);

caso("el Diario asienta la merma de CAYLA (6951) y no la de CLAURE de hoy; la de antes del arranque y la de otra sede sí", () =>
  igual(
    medir(`reset role;
-- Con costo cargado la merma vale plata y el Diario la asienta (con costo 0 no hay nada que asentar).
update retail.variantes set costo = 10 where id in (:'va_a', :'va_b');
${sesion(FELIPE)}
select coalesce(string_agg(right(origen_id::text, 2), ' ' order by origen_id), '')
  from retail.fn_asientos(${HOY} - 30, ${HOY}, null) where cuenta = '6951' and origen_id in ${MOVS};`),
    // c2 (CAYLA), c4 (CLAURE, pero de antes del arranque) y c5 (Trujillo: CLAURE no opera allá) cuentan; c1 y c3 (CLAURE de hoy en Lima) no.
    "c2 c4 c5",
  ),
);

const MERMAS_SIN_COSTO = `${sesion(FELIPE)}
select mermas_sin_costo from retail.fn_estado_resultados(${HOY} - 30, ${HOY}, null) where ubicacion_id = ${LIMA};`;
caso("las mermas sin costo del Estado de resultados de Lima no cuentan las de CLAURE de hoy (3 de CAYLA + 4 de antes del arranque); sin la migración eran 10", () =>
  igual(diferencia(MERMAS_SIN_COSTO), "7") ?? igual(diferencia(MERMAS_SIN_COSTO, { sinMigracion: true }), "10"),
);

caso("la migración se puede volver a pegar: mismos hechos", () =>
  igual(
    ultima(psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${HECHOS}\nrollback;`)),
    "anulacion:b2:1 movimiento:c2:3 movimiento:c4:4",
  ),
);

caso("si una función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n` +
        `do $$ begin execute replace(pg_get_functiondef('retail.fn_calidad_danadas(date, integer)'::regprocedure), 'ai.condicion <> ''vendible''', 'ai.condicion <> ''sana'''); end $$;\n${MIGRACION}\nrollback;`,
    );
    return "la migración no abortó con una función distinta a la esperada";
  } catch (e) {
    return String(e.stderr).includes("cambió desde que se escribió esta migración") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");

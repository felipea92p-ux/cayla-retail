#!/usr/bin/env node
/**
 * Prueba de `20261028153000_dueno_real_en_caja_historial_y_movimientos.sql` (ADR-0542, que reemplaza la regla por marca de ADR-0532): de quién es
 * cada línea vendida en Lima (el dueño que marcó la persona en el movimiento de la venta; la ficha si la venta es anterior al libro) y cuánto de lo
 * vendido es de cada empresa.
 *
 * Lo que importa: (1) el dueño de una línea: el del movimiento manda sobre la ficha; (2) en el Historial, la suma de las empresas es EXACTAMENTE el
 * «vendido» de `fn_totales_historial_ventas` con los mismos filtros, y lo de CLAURE es lo vendido en Lima de lo que es de CLAURE; (3) en Caja, lo de
 * cada turno es lo de `fn_resumen_caja`; (4) cada venta suma su total entre las empresas; (5) en Movimientos, CAYLA + CLAURE = sin filtro, en la lista
 * y en las cifras; (6) sin sesión no se lee y `anon` no ejecuta; (7) la migración se aplica dos veces. Cada caso corre en su transacción con la
 * migración aplicada dentro y TERMINA EN ROLLBACK. Las migraciones de ADR-0532 NO se repiten aquí: la nueva las supone aplicadas (y su parche de
 * Movimientos tiene huella propia).
 *
 * USO: pnpm pruebas:vendido-por-empresa   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const MIGRACION = leer("20261028153000_dueno_real_en_caja_historial_y_movimientos.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const SESION = `set local request.jwt.claim.sub = '${FELIPE}';\nset local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
// Las sedes se buscan por su nombre («Tienda LIM» en producción, «Tienda Lima» en el seed). La base limpia del CI corre las migraciones
// ANTES de que el seed cree las sedes, así que allí `empresa_sedes` no tiene a CLAURE en Lima: cada transacción arma esa escena (como en
// producción). Mismo patrón que `empresa_solo_en_sus_sedes.mjs`.
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");
const ESCENA = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;`;
// `antes`: lo que se hace como postgres antes de entrar con la sesión (pasar una prenda a CLAURE).
const dentro = (consulta, { sesion = true, antes = "" } = {}) =>
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${ESCENA}\n\\o\n${antes}\n${sesion ? SESION : ""}\n${consulta}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba «${esperado}» y salió «${obtenido}»`);

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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

// La suma de las empresas contra el «vendido» del Historial, con los mismos argumentos.
const sumaContraTotal = (args) =>
  dentro(`select (select coalesce(sum(total), 0) from retail.fn_vendido_por_empresa(${args}))::text || '|' ||
                 ((retail.fn_totales_historial_ventas(${args}))->>'total');`);

// La primera prenda vendida en Lima, pasada a CLAURE en su ficha (como postgres): las ventas de antes del libro se leen con la ficha.
const UNA_DE_CLAURE = `update retail.productos set empresa_id = ${CLAURE} where id = (select va.producto_id from retail.venta_items i
   join retail.ventas v on v.id = i.venta_id join retail.variantes va on va.id = i.variante_id
   where v.estado <> 'anulada' and v.ubicacion_id = ${LIMA} order by v.created_at, i.id limit 1);`;
// El dueño de una línea contado a mano, sin la función: el del movimiento de la venta si lo tiene; si no, el de la ficha.
const DUENO_A_MANO = (i, p) => `coalesce((select m.empresa_id from retail.movimientos m where m.venta_item_id = ${i}.id and m.tipo = 'salida' and m.empresa_id is not null order by m.created_at limit 1), ${p}.empresa_id)`;
// Lo vendido en Lima cuyo dueño es CLAURE: lo que tiene que sumar CLAURE.
const VENDIDO_LIMA_DE_CLAURE = `(select coalesce(round(sum(i.subtotal), 2), 0) from retail.venta_items i join retail.ventas v on v.id = i.venta_id
   join retail.variantes va on va.id = i.variante_id join retail.productos p on p.id = va.producto_id
   where v.estado <> 'anulada' and v.ubicacion_id = ${LIMA} and ${DUENO_A_MANO("i", "p")} = ${CLAURE}::uuid)`;

caso("el dueño de una línea: el del movimiento de la venta si lo tiene; si no, el de la ficha de la prenda", () =>
  igual(
    dentro(
      `select bool_and(retail.fn_dueno_de_la_linea(i.id) = ${DUENO_A_MANO("i", "p")}) from retail.venta_items i
         join retail.variantes va on va.id = i.variante_id join retail.productos p on p.id = va.producto_id;`,
      { sesion: false, antes: UNA_DE_CLAURE },
    ),
    "t",
  ));

caso("el dueño del movimiento manda sobre la ficha (una venta de CLAURE de una prenda que la ficha dice de CAYLA)", () =>
  igual(
    dentro(
      `select retail.fn_dueno_de_la_linea(i.id) = ${CLAURE}::uuid from retail.venta_items i where i.id = (select id from retail.venta_items order by id limit 1);`,
      {
        sesion: false,
        // Un movimiento de venta con su dueño, escrito como postgres sin pasar por el disparador (la prueba solo lee).
        antes: `set local session_replication_role = replica;
          update retail.productos set empresa_id = ${CAYLA} where id = (select va.producto_id from retail.venta_items i join retail.variantes va on va.id = i.variante_id order by i.id limit 1);
          insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, empresa_id)
            select i.variante_id, v.ubicacion_id, 'salida', 1, 'venta', i.id, ${CLAURE} from retail.venta_items i join retail.ventas v on v.id = i.venta_id order by i.id limit 1;
          set local session_replication_role = origin;`,
      },
    ),
    "t",
  ));

caso("hay ventas con las que probar", () => {
  const n = Number(dentro(`select count(*) from retail.ventas where estado <> 'anulada';`, { sesion: false }));
  return n > 0 ? null : "la base local no tiene ventas";
});

for (const [nombre, args] of [
  ["sin filtros (con las de prueba)", "p_incluir_prueba => true"],
  ["sin filtros (sin las de prueba, lo de siempre)", "p_incluir_prueba => false"],
  ["solo completadas", "p_estado => 'completada', p_incluir_prueba => true"],
  ["solo anuladas: las dos en cero", "p_estado => 'anulada', p_incluir_prueba => true"],
  ["pagadas en efectivo", "p_pago => 'efectivo', p_incluir_prueba => true"],
  ["con comprobante", "p_comprobante => 'con', p_incluir_prueba => true"],
  ["sin comprobante", "p_comprobante => 'sin', p_incluir_prueba => true"],
  ["un rango de fechas", "p_desde => now() - interval '30 days', p_hasta => now(), p_incluir_prueba => true"],
]) {
  caso(`Historial · ${nombre}: la suma de las empresas es el vendido`, () => {
    const [suma, vendido] = sumaContraTotal(args).split("|");
    return Number(suma) === Number(vendido) ? null : `empresas ${suma}, vendido ${vendido}`;
  });
}

caso("Historial · por tienda: cada sede suma su vendido", () => {
  const sedes = dentro(`select distinct ubicacion_id from retail.ventas;`, { sesion: false }).split("\n").filter(Boolean);
  for (const s of sedes) {
    const [suma, vendido] = sumaContraTotal(`p_sede_id => '${s}', p_incluir_prueba => true`).split("|");
    if (Number(suma) !== Number(vendido)) return `sede ${s}: empresas ${suma}, vendido ${vendido}`;
  }
  return null;
});

caso("en Lima, CLAURE suma lo vendido de lo que es de CLAURE, y el total no cambia", () => {
  const r = dentro(
    `select coalesce(sum(total) filter (where clave = 'claure'), 0)::text || '|' || ${VENDIDO_LIMA_DE_CLAURE}::text || '|' ||
            coalesce(sum(total), 0)::text || '|' || ((retail.fn_totales_historial_ventas(p_sede_id => ${LIMA}, p_incluir_prueba => true))->>'total')
       from retail.fn_vendido_por_empresa(p_sede_id => ${LIMA}, p_incluir_prueba => true);`,
    { antes: UNA_DE_CLAURE },
  );
  const [claure, esperado, suma, vendido] = r.split("|").map(Number);
  if (claure !== esperado) return `CLAURE ${claure}, lo vendido en Lima que es de CLAURE ${esperado}`;
  return suma === vendido ? null : `empresas ${suma}, vendido ${vendido}`;
});

caso("en Trujillo todo es CAYLA (CLAURE no opera allí)", () =>
  igual(
    dentro(`select count(*) from retail.fn_vendido_por_empresa(p_sede_id => ${TRUJILLO}, p_incluir_prueba => true) where clave <> 'cayla';`),
    0,
  ));

caso("cada venta suma su total entre las empresas (la marca del Historial)", () =>
  igual(
    dentro(`
      with mia as (select venta_id, sum(monto) as total from retail.fn_empresa_de_ventas(array(select id from retail.ventas)) group by venta_id),
      esperado as (select i.venta_id, round(sum(i.subtotal), 2) as total from retail.venta_items i group by i.venta_id)
      select count(*) from esperado e full join mia m on m.venta_id = e.venta_id where coalesce(e.total, -1) <> coalesce(m.total, -1);`),
    0,
  ));

caso("Movimientos · en Lima, CAYLA + CLAURE es la lista sin filtro (todas y solo las ventas)", () => {
  const cuenta = (extra) => `(select count(*) from retail.fn_movimientos(p_ubicacion_id => ${LIMA}, p_limite => 200${extra}))`;
  for (const cat of ["", ", p_categoria => 'venta'"]) {
    const r = dentro(`select ${cuenta(cat)}::text || '|' || (${cuenta(`${cat}, p_empresa_id => ${CAYLA}`)} + ${cuenta(`${cat}, p_empresa_id => ${CLAURE}`)})::text;`, {
      antes: UNA_DE_CLAURE,
    });
    const [todo, partes] = r.split("|");
    if (todo !== partes) return `${cat || "todas"}: sin filtro ${todo}, CAYLA + CLAURE ${partes}`;
  }
  return null;
});

caso("Movimientos · las cifras también: CAYLA + CLAURE = sin filtro, grupo por grupo", () => {
  const filas = (extra) => `select grupo, sum(filas) as n from retail.fn_movimientos_resumen_procesos(p_ubicacion_id => ${LIMA}${extra}) group by grupo`;
  return igual(
    dentro(
      `with todo as (${filas("")}), c as (${filas(`, p_empresa_id => ${CAYLA}`)}), l as (${filas(`, p_empresa_id => ${CLAURE}`)})
       select count(*) from todo t left join c on c.grupo = t.grupo left join l on l.grupo = t.grupo
        where t.n <> coalesce(c.n, 0) + coalesce(l.n, 0);`,
      { antes: UNA_DE_CLAURE },
    ),
    0,
  );
});

caso("Movimientos · en Trujillo, filtrar por CLAURE no trae nada", () =>
  igual(dentro(`select count(*) from retail.fn_movimientos(p_ubicacion_id => ${TRUJILLO}, p_limite => 200, p_empresa_id => ${CLAURE});`), 0));

caso("Movimientos · una sola firma de cada función (con dos, la llamada sin el filtro sería ambigua)", () =>
  igual(dentro(`select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_movimientos', 'fn_movimientos_resumen_procesos');`, { sesion: false }), 2));

caso("Caja · cada turno suma lo vendido de sus ventas sin anuladas", () => {
  const r = dentro(`
    with mia as (select caja_id, sum(total) as total from retail.fn_vendido_por_empresa_de_cajas(array(select id from retail.cajas)) group by caja_id),
    esperado as (
      select v.caja_id, round(sum(i.subtotal), 2) as total
        from retail.ventas v join retail.venta_items i on i.venta_id = v.id
       where v.caja_id is not null and v.estado <> 'anulada' group by v.caja_id)
    select count(*) from esperado e full join mia m on m.caja_id = e.caja_id where coalesce(e.total, -1) <> coalesce(m.total, -1);`);
  return igual(r, 0);
});

caso("Caja · lo del turno coincide con lo cobrado de fn_resumen_caja (efectivo + otros + redondeo)", () => {
  const r = dentro(`
    select count(*) from retail.cajas c
     where (select coalesce(sum(total), 0) from retail.fn_vendido_por_empresa_de_cajas(array[c.id]))
           <> (select (r->>'ventas_efectivo')::numeric + (r->>'ventas_otros')::numeric + (r->>'redondeo')::numeric from retail.fn_resumen_caja(c.id) r);`);
  return igual(r, 0);
});

caso("Caja · los turnos de Lima reparten entre las dos; los de Trujillo, solo CAYLA", () =>
  igual(
    dentro(`select count(*) from retail.fn_vendido_por_empresa_de_cajas(array(select id from retail.cajas)) r
              join retail.cajas c on c.id = r.caja_id where c.ubicacion_id = ${TRUJILLO} and r.clave <> 'cayla';`),
    0,
  ));

caso("sin sesión no se lee nada", () => {
  const sinSesion = `set local role authenticated;\n`;
  const r = dentro(
    `${sinSesion}select (select count(*) from retail.fn_vendido_por_empresa(p_incluir_prueba => true))::text || '|' ||
       (select count(*) from retail.fn_vendido_por_empresa_de_cajas(array(select id from retail.cajas)))::text;`,
    { sesion: false, antes: `grant select on retail.cajas to authenticated;` },
  );
  return igual(r, "0|0");
});

caso("anon no ejecuta; authenticated sí (y la función del dueño de una línea no la ejecuta nadie por la API)", () =>
  igual(
    dentro(
      `select string_agg(p.proname || '=' || has_function_privilege('anon', p.oid, 'execute')::text || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname)
         from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_vendido_por_empresa', 'fn_vendido_por_empresa_de_cajas',
           'fn_empresa_de_ventas', 'fn_dueno_de_la_linea', 'fn_movimientos', 'fn_movimientos_resumen_procesos');`,
      { sesion: false },
    ),
    "fn_dueno_de_la_linea=false/false,fn_empresa_de_ventas=false/true,fn_movimientos=false/true,fn_movimientos_resumen_procesos=false/true,fn_vendido_por_empresa=false/true,fn_vendido_por_empresa_de_cajas=false/true",
  ));

caso("la regla por marca ya no existe en la base", () =>
  igual(dentro(`select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_empresa_de_prenda_en_sede', 'fn_marcas_de_empresas');`, { sesion: false }), 0));

caso("aplicar la migración dos veces no falla", () => {
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${MIGRACION}\n\\o\nrollback;`);
  return null;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);

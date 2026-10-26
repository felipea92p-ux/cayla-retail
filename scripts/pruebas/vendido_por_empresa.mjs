#!/usr/bin/env node
/**
 * Prueba de `20261026232000_vendido_por_empresa.sql` (ADR-0532): cuánto de lo vendido es de CAYLA y cuánto de CLAURE.
 *
 * Lo que importa: (1) en el Historial, la suma de las empresas es EXACTAMENTE el «vendido» de `fn_totales_historial_ventas` con los
 * mismos filtros (si una función cambia sus filtros y la otra no, esto falla); (2) una prenda de CLAURE suma a CLAURE por lo que se
 * cobró de ella, y el total no cambia; (3) en Caja, lo de cada turno es lo vendido de sus ventas sin anuladas, como `fn_resumen_caja`;
 * (4) sin sesión no se lee nada y `anon` no ejecuta; (5) la migración se puede aplicar dos veces. Cada caso corre en su transacción
 * con la migración aplicada dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:vendido-por-empresa   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261026232000_vendido_por_empresa.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";
const SESION = `set local request.jwt.claim.sub = '${FELIPE}';\nset local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
// `antes`: lo que se hace como postgres antes de entrar con la sesión (pasar una prenda a CLAURE).
const dentro = (consulta, { sesion = true, antes = "" } = {}) =>
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n\\o\n${antes}\n${sesion ? SESION : ""}\n${consulta}\nrollback;`);
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

// Una prenda vendida (en una venta no anulada) pasa a CLAURE; el resto sigue en CAYLA. El candado de ADR-0505 es diferido: con ROLLBACK
// no llega a juzgarse, como en tienda_empresas y productos_filtro_por_empresa.
const PRENDA_VENDIDA = `(select va.producto_id from retail.venta_items i join retail.ventas v on v.id = i.venta_id
   join retail.variantes va on va.id = i.variante_id where v.estado <> 'anulada' order by v.created_at, i.id limit 1)`;
const UNA_DE_CLAURE = `update retail.productos set empresa_id = ${CLAURE} where id = ${PRENDA_VENDIDA};`;

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

caso("una prenda de CLAURE suma a CLAURE lo cobrado por ella, y el total no cambia", () => {
  const r = dentro(
    `select coalesce(sum(total) filter (where clave = 'claure'), 0)::text || '|' || coalesce(sum(total), 0)::text || '|' ||
            (select round(sum(i.subtotal), 2) from retail.venta_items i join retail.ventas v on v.id = i.venta_id
               join retail.variantes va on va.id = i.variante_id
              where v.estado <> 'anulada' and va.producto_id = ${PRENDA_VENDIDA})::text || '|' ||
            ((retail.fn_totales_historial_ventas(p_incluir_prueba => true))->>'total')
       from retail.fn_vendido_por_empresa(p_incluir_prueba => true);`,
    { antes: UNA_DE_CLAURE },
  );
  const [claure, suma, esperadoClaure, vendido] = r.split("|").map(Number);
  if (!(claure > 0)) return `CLAURE salió en ${claure}`;
  if (claure !== esperadoClaure) return `CLAURE ${claure}, lo cobrado por esa prenda ${esperadoClaure}`;
  return suma === vendido ? null : `empresas ${suma}, vendido ${vendido}`;
});

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

caso("Caja · una prenda de CLAURE sale en su turno", () =>
  igual(
    dentro(
      `select count(*) > 0 from retail.fn_vendido_por_empresa_de_cajas(array(select id from retail.cajas)) where clave = 'claure';`,
      { antes: UNA_DE_CLAURE },
    ),
    "t",
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

caso("anon no ejecuta; authenticated sí", () =>
  igual(
    dentro(
      `select string_agg(p.proname || '=' || has_function_privilege('anon', p.oid, 'execute')::text || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname)
         from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_vendido_por_empresa', 'fn_vendido_por_empresa_de_cajas');`,
      { sesion: false },
    ),
    "fn_vendido_por_empresa=false/true,fn_vendido_por_empresa_de_cajas=false/true",
  ));

caso("aplicar la migración dos veces no falla", () => {
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${MIGRACION}\n\\o\nrollback;`);
  return null;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);

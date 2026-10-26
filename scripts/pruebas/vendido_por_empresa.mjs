#!/usr/bin/env node
/**
 * Prueba de `20261026232000_vendido_por_empresa.sql` y `20261026234000_movimientos_filtro_por_empresa.sql` (ADR-0532): de quién es
 * cada prenda en Lima (la marca CAYLA es de CAYLA; cualquier otra, de CLAURE) y cuánto de lo vendido es de cada una.
 *
 * Lo que importa: (1) la regla: en Lima manda la marca, en Trujillo el dato de la prenda, y sin la marca de la casa no se pasa nada a
 * CLAURE; (2) en el Historial, la suma de las empresas es EXACTAMENTE el «vendido» de `fn_totales_historial_ventas` con los mismos
 * filtros, y lo de CLAURE es lo vendido en Lima de las prendas que no son de marca CAYLA; (3) en Caja, lo de cada turno es lo de
 * `fn_resumen_caja`; (4) cada venta suma su total entre las empresas; (5) en Movimientos, CAYLA + CLAURE = sin filtro, en la lista y en
 * las cifras; (6) sin sesión no se lee y `anon` no ejecuta; (7) las migraciones se aplican dos veces. Cada caso corre en su transacción
 * con las migraciones aplicadas dentro y TERMINA EN ROLLBACK.
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
const MIGRACION = `${leer("20261026232000_vendido_por_empresa.sql")}\n${leer("20261026234000_movimientos_filtro_por_empresa.sql")}`;
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
// Las sedes y la marca de CAYLA se resuelven una vez, como postgres: la sesión de la tienda no lee `empresa_sedes` ni `empresas`.
const LIMA = `'${psql(`select ubicacion_id from retail.empresa_sedes where empresa_id = 'c1a07e00-0000-4000-8000-000000000002' limit 1;`)}'`;
const TRUJILLO = `'${psql(`select id from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda Trujillo') limit 1;`)}'`;
// Con las migraciones ya aplicadas (local y CI). Si sale vacío, el primer caso lo dice.
const MARCA_CAYLA = `'${psql(`select coalesce(marca_id::text, '') from retail.empresas where clave = 'cayla';`) || "00000000-0000-0000-0000-000000000000"}'::uuid`;
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

// Una prenda vendida en Lima que es de marca CAYLA (si la escena no tiene ninguna, se le pone la marca CAYLA a la primera vendida allí).
const UNA_DE_MARCA_CAYLA = `update retail.productos set marca_id = ${MARCA_CAYLA} where id = (select va.producto_id from retail.venta_items i
   join retail.ventas v on v.id = i.venta_id join retail.variantes va on va.id = i.variante_id
   where v.estado <> 'anulada' and v.ubicacion_id = ${LIMA} order by v.created_at, i.id limit 1);`;
// Lo vendido en Lima de las prendas que NO son de marca CAYLA: lo que tiene que sumar CLAURE.
const VENDIDO_LIMA_NO_CAYLA = `(select coalesce(round(sum(i.subtotal), 2), 0) from retail.venta_items i join retail.ventas v on v.id = i.venta_id
   join retail.variantes va on va.id = i.variante_id join retail.productos p on p.id = va.producto_id
   where v.estado <> 'anulada' and v.ubicacion_id = ${LIMA} and p.marca_id is distinct from ${MARCA_CAYLA})`;

caso("la marca CAYLA quedó como la marca de CAYLA", () =>
  igual(dentro(`select (select marca_id from retail.empresas where clave = 'cayla') = (select id from retail.marcas where upper(btrim(nombre)) = 'CAYLA');`, { sesion: false }), "t"));

caso("regla: en Lima, marca CAYLA → CAYLA; otra marca o sin marca → CLAURE; en Trujillo, el dato de la prenda", () => {
  const r = dentro(
    `with p as (select id, marca_id, empresa_id from retail.productos order by id limit 40)
     select bool_and(retail.fn_empresa_de_prenda_en_sede(p.id, ${LIMA}) =
                       case when p.marca_id = ${MARCA_CAYLA} then ${CAYLA}::uuid else ${CLAURE}::uuid end)::text || '|' ||
            bool_and(retail.fn_empresa_de_prenda_en_sede(p.id, ${TRUJILLO}) = p.empresa_id)::text
       from p;`,
    { sesion: false, antes: UNA_DE_MARCA_CAYLA },
  );
  return igual(r, "true|true");
});

caso("regla: sin la marca de la casa, en Lima manda el dato de la prenda (nada pasa a CLAURE por un dato que falta)", () =>
  igual(
    dentro(
      `select bool_and(retail.fn_empresa_de_prenda_en_sede(p.id, ${LIMA}) = p.empresa_id) from retail.productos p;`,
      { sesion: false, antes: "update retail.empresas set marca_id = null;" },
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

caso("en Lima, CLAURE suma lo vendido de las prendas que no son de marca CAYLA, y el total no cambia", () => {
  const r = dentro(
    `select coalesce(sum(total) filter (where clave = 'claure'), 0)::text || '|' || ${VENDIDO_LIMA_NO_CAYLA}::text || '|' ||
            coalesce(sum(total), 0)::text || '|' || ((retail.fn_totales_historial_ventas(p_sede_id => ${LIMA}, p_incluir_prueba => true))->>'total')
       from retail.fn_vendido_por_empresa(p_sede_id => ${LIMA}, p_incluir_prueba => true);`,
    { antes: UNA_DE_MARCA_CAYLA },
  );
  const [claure, esperado, suma, vendido] = r.split("|").map(Number);
  if (claure !== esperado) return `CLAURE ${claure}, lo vendido en Lima que no es marca CAYLA ${esperado}`;
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
      antes: UNA_DE_MARCA_CAYLA,
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
      { antes: UNA_DE_MARCA_CAYLA },
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

caso("anon no ejecuta; authenticated sí", () =>
  igual(
    dentro(
      `select string_agg(p.proname || '=' || has_function_privilege('anon', p.oid, 'execute')::text || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text, ',' order by p.proname)
         from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_vendido_por_empresa', 'fn_vendido_por_empresa_de_cajas',
           'fn_empresa_de_ventas', 'fn_empresa_de_prenda_en_sede', 'fn_marcas_de_empresas', 'fn_movimientos', 'fn_movimientos_resumen_procesos');`,
      { sesion: false },
    ),
    "fn_empresa_de_prenda_en_sede=false/true,fn_empresa_de_ventas=false/true,fn_marcas_de_empresas=false/true,fn_movimientos=false/true,fn_movimientos_resumen_procesos=false/true,fn_vendido_por_empresa=false/true,fn_vendido_por_empresa_de_cajas=false/true",
  ));

caso("aplicar las migraciones dos veces no falla", () => {
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${MIGRACION}\n\\o\nrollback;`);
  return null;
});

console.log(`\n${total - fallas}/${total} casos en verde`);
process.exit(fallas ? 1 : 0);

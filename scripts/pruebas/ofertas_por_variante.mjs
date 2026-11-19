#!/usr/bin/env node
/**
 * Pruebas de las ofertas por VARIANTE (`20261118232000_oferta_por_variante.sql`, ADR-0682; Felipe 2026-11-18) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · el alcance: una oferta con una variante suelta rige en esa talla y color y en ninguna otra de su modelo; se suma a sus categorías y a
 *     sus modelos; con variantes y nada más ya no cae en las prendas de su campaña; «dejar fuera» la saca. La caja (`fn_campanas_en_sede`),
 *     la regla de una oferta guardada (`fn_regla_alcanza_variante`) y la de todas de una vez (`fn_variantes_de_regla`) dicen lo mismo;
 *   · lo de siempre no cambia: una oferta sin variantes rige como antes;
 *   · guardar: las variantes quedan con la oferta y en su historia; sin la clave no se tocan; las tallas de un modelo elegido entero no se
 *     guardan; un monto de toda la compra no las lleva; una variante que no existe se rechaza; `campana_reglas()` las devuelve;
 *   · un 3x2 y un monto con variantes sueltas (`20261118233000`): el grupo se arma solo con ellas, y lo que la caja lee para el ticket
 *     (`ofertas_de_grupo_vigentes`, `ofertas_de_monto_vigentes`) dice lo mismo que lo que la base cobra;
 *   · las migraciones se pegan dos veces y cada función queda con una sola firma.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Si la base local todavía no tiene la migración, la aplica dentro de cada escenario.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed, con al menos 3 variantes en su modelo y una prenda de otra categoría;
 * y las ofertas hasta 20261116180000 ya pegadas (una base local atrás de `main` no sirve: dice cuál falta y sale con 2).
 *
 * USO
 *   pnpm pruebas:ofertas-por-variante
 *   pnpm pruebas:ofertas-por-variante -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261118232000_oferta_por_variante.sql";
const LECTURAS = "supabase/migrations/20261118233000_ofertas_de_grupo_y_monto_por_variante.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? (r.salida.split("\n").filter(Boolean).at(-1) ?? "") : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, r.ok && ultima(r) === esperado, r.ok ? `dio «${ultima(r)}», se esperaba «${esperado}»` : r.mensaje);
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»` : r.mensaje);

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
  process.exit(2);
}
const falta = (sql) => correr(sql).salida === "t";
if (falta("select to_regprocedure('retail.fn_variantes_de_regla(uuid)') is null or to_regclass('retail.campana_regla_insignias') is null;")) {
  console.error(
    `La base del contenedor ${CONTENEDOR_LOCAL} está atrás de main: le faltan las ofertas por insignia (20261114060000) o fn_variantes_de_regla (20261116175000).\n` +
      "Corre la prueba contra una base al día: pnpm pruebas:ofertas-por-variante -- --contenedor supabase_db_<mi-pila>",
  );
  process.exit(2);
}

// Lo que la base local todavía no tenga, dentro de cada escenario.
const ANTES = [
  falta("select to_regclass('retail.campana_regla_variantes') is null;") ? readFileSync(MIGRACION, "utf8") : "",
  falta("select position('fn_variantes_de_regla(g.id)' in pg_get_functiondef('retail.ofertas_de_grupo_vigentes(uuid)'::regprocedure)) = 0;") ? readFileSync(LECTURAS, "utf8") : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Una campaña «ZZ» con la categoría de la Blusa Emma (a1, a2, a3 de su modelo; `fuera`, de otra categoría). Sin variantes, una oferta suya
// rige en a1, a2 y a3 (las prendas de la campaña): es el control de que la variante suelta apaga esa caída.
const PARTIDA = `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
select v.id as fuera, p.id as modelo_fuera, p.categoria_id as cat_fuera from retail.variantes v join retail.productos p on p.id = v.producto_id
 where p.categoria_id <> :'cat' and v.activo
   and p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure') order by v.id limit 1 \\gset
-- Las ofertas que la base local ya tenga activas se apagan dentro de la transacción: un monto de toda la compra chocaría con las de la prueba.
update retail.campana_reglas set estado = 'desactivada' where estado = 'activa';
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña variantes (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
`;
/** Una oferta con su forma (por defecto, −20 %), sus variantes sueltas y, si se pide, categorías «solo», «fuera» y modelos enteros. */
const OFERTA = ({
  forma = { tipo: "pct", porcentaje: 20 },
  variantes = "jsonb_build_array(:'a1')",
  solo = "'{}'::uuid[]",
  fuera = "'{}'::uuid[]",
  productos = "'{}'::uuid[]",
  nombre = "ZZ por variante",
  v = "r",
  id = "null",
  activar = "true",
} = {}) =>
  `select retail.guardar_oferta_completa(${id}, :'camp', '${nombre}', '${JSON.stringify(forma)}'::jsonb${variantes === null ? "" : ` || jsonb_build_object('variantes', ${variantes})`},
     ${HOY}, ${HOY} + 3, null, ${solo}, ${fuera}, false, '{}'::uuid[], ${productos}, '{}'::uuid[], ${activar}) as ${v} \\gset\n`;
/** Cuánto baja la caja hoy en Lima cada prenda: «a1:20|a2:0|…». */
const CAJA = (vs = ["a1", "a2", "fuera"]) =>
  `select string_agg(x.k || ':' || coalesce((select max(c.descuento_pct)::integer from retail.fn_campanas_en_sede(${HOY}, 0, array[x.v]::uuid[], :'u') c where c.etiqueta_id = :'camp'), 0), '|' order by x.n)
   from (values ${vs.map((k, i) => `(${i}, '${k}', :'${k}'::uuid)`).join(", ")}) x(n, k, v);\n`;
/** Las variantes guardadas de la oferta :r, en palabras: «a1,a2». */
const GUARDADAS = `select coalesce(string_agg(case rv.variante_id when :'a1' then 'a1' when :'a2' then 'a2' when :'a3' then 'a3' when :'fuera' then 'fuera' else '?' end, ',' order by 1), '')
  from retail.campana_regla_variantes rv where rv.regla_id = :'r';\n`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);

console.log("\n— El alcance de una oferta por variante —");
esperarValor(
  "control: sin variantes, la oferta rige en las prendas de su campaña (las dos de la Blusa Emma), como siempre",
  caso(`${OFERTA({ variantes: null })}${CAJA()}`),
  "a1:20|a2:20|fuera:0",
);
esperarValor(
  "−20 % en UNA variante: baja esa talla y color; la otra talla de su mismo modelo y la de otra categoría, no",
  caso(`${OFERTA()}${CAJA()}`),
  "a1:20|a2:0|fuera:0",
);
esperarValor(
  "dos variantes de modelos distintos: bajan las dos y nada más",
  caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'fuera')" })}${CAJA(["a1", "a2", "a3", "fuera"])}`),
  "a1:20|a2:0|a3:0|fuera:20",
);
esperarValor(
  "se suma a las categorías elegidas: la categoría de fuera entera y la variante suelta",
  caso(`${OFERTA({ solo: "array[:'cat_fuera']::uuid[]" })}${CAJA()}`),
  "a1:20|a2:0|fuera:20",
);
esperarValor(
  "se suma a un modelo elegido entero: todas las tallas del modelo de fuera y la variante suelta",
  caso(`${OFERTA({ productos: "array[:'modelo_fuera']::uuid[]" })}${CAJA()}`),
  "a1:20|a2:0|fuera:20",
);
esperarValor(
  "«dejar fuera» su categoría saca también a la variante suelta",
  caso(`${OFERTA({ fuera: "array[:'cat']::uuid[]" })}${CAJA()}`),
  "a1:0|a2:0|fuera:0",
);
esperarValor(
  "una oferta en borrador no baja nada",
  caso(`${OFERTA({ activar: "false" })}${CAJA()}`),
  "a1:0|a2:0|fuera:0",
);
esperarValor(
  "las tres caras dicen lo mismo: la de una prenda, la de todas de una vez y la caja",
  caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'fuera')" })}select concat_ws('|',
  retail.fn_regla_alcanza_variante(:'r', :'a1'), retail.fn_regla_alcanza_variante(:'r', :'a2'), retail.fn_regla_alcanza_variante(:'r', :'fuera'),
  (select count(*) from retail.fn_variantes_de_regla(:'r')),
  (select count(*) from retail.fn_variantes_de_regla(:'r') x) = (select count(*) from retail.variantes v where v.activo and retail.fn_regla_alcanza_variante(:'r', v.id)),
  (select count(*) from retail.fn_variantes_de_regla(:'r') x) = (select count(*) from retail.variantes v where v.activo and exists (
     select 1 from retail.fn_campanas_en_sede(${HOY}, 0, array[v.id]::uuid[], :'u') c where c.etiqueta_id = :'camp' and c.descuento_pct > 0)));\n`),
  "t|f|t|2|t|t",
);
esperarValor(
  "con una categoría además de la variante, las tres caras siguen iguales y ninguna prenda sale dos veces",
  caso(`${OFERTA({ solo: "array[:'cat']::uuid[]" })}select concat_ws('|',
  (select count(*) = count(distinct x.variante_id) from retail.fn_variantes_de_regla(:'r') x),
  (select count(*) from retail.fn_variantes_de_regla(:'r') x) = (select count(*) from retail.variantes v where v.activo and retail.fn_regla_alcanza_variante(:'r', v.id)),
  (select count(*) from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u') c where c.etiqueta_id = :'camp'));\n`),
  "t|t|1",
);

console.log("\n— Guardar —");
esperarValor("las variantes quedan con la oferta", caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'a2')" })}${GUARDADAS}`), "a1,a2");
esperarValor(
  "`campana_reglas()` las devuelve",
  caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'a2')" })}select cardinality(variantes) from retail.campana_reglas() where id = :'r';\n`),
  "2",
);
esperarValor(
  "sin la clave «variantes», guardar de nuevo no las toca",
  caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'a2')" })}${OFERTA({ id: ":'r'", variantes: null, v: "r2" })}${GUARDADAS}`),
  "a1,a2",
);
esperarValor(
  "al cambiarlas, quedan las nuevas y la historia guarda las de antes",
  caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'a2')" })}${OFERTA({ id: ":'r'", variantes: "jsonb_build_array(:'a3')", v: "r2" })}select concat_ws('|',
  (select string_agg(case rv.variante_id when :'a3' then 'a3' else '?' end, ',') from retail.campana_regla_variantes rv where rv.regla_id = :'r'),
  (select jsonb_array_length(h.antes -> 'variantes') from retail.campana_regla_historial h where h.regla_id = :'r' and h.antes ? 'variantes'));\n`),
  "a3|2",
);
esperarValor(
  "con la lista vacía se quitan todas, y la oferta vuelve a regir en las prendas de su campaña",
  caso(`${OFERTA()}${OFERTA({ id: ":'r'", variantes: "'[]'::jsonb", v: "r2" })}${CAJA()}`),
  "a1:20|a2:20|fuera:0",
);
esperarValor(
  "las tallas de un modelo elegido entero no se guardan sueltas: sobran",
  caso(`${OFERTA({ variantes: "jsonb_build_array(:'a1', :'fuera')", productos: "array[:'modelo']::uuid[]" })}${GUARDADAS}`),
  "fuera",
);
esperarValor(
  "un monto de toda la compra no lleva variantes",
  caso(`${OFERTA({ forma: { tipo: "monto", escalones: [{ desde: 300, ahorra: 30 }], ahorro_en: "soles", cuenta: "compra" }, activar: "false" })}${GUARDADAS}`),
  "",
);
esperarError(
  "una variante que no existe se rechaza y no se guarda nada",
  caso(OFERTA({ variantes: "jsonb_build_array('00000000-0000-4000-8000-000000000000')" })),
  "ya no existe",
);
esperarValor(
  "eliminar la oferta se lleva sus variantes (cascada)",
  caso(`${OFERTA({ activar: "false" })}delete from retail.campana_regla_historial where regla_id = :'r';
delete from retail.campana_reglas where id = :'r';
select count(*) from retail.campana_regla_variantes where regla_id = :'r';\n`),
  "0",
);

console.log("\n— Un 3x2 y un monto con variantes sueltas —");
const TRES = "jsonb_build_array(:'a1', :'a2', :'fuera')";
/** Cuánto descuenta la base en una compra de tres prendas a S/ 50. */
const COBRO = (vs) =>
  `(select coalesce(sum(descuento), 0) from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(${vs
    .map((k) => `jsonb_build_object('variante_id', :'${k}', 'precio_unitario', 50, 'cantidad', 1)`)
    .join(", ")})))`;
esperarValor(
  "un 3x2 en tres variantes sueltas: la base regala una, y la caja lee esas tres prendas para el ticket",
  caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 2 }, variantes: TRES })}select concat_ws('|', ${COBRO(["a1", "a2", "fuera"])},
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') o where o.regla_id = :'r'),
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') o where o.regla_id = :'r' and o.variante_id in (:'a1', :'a2', :'fuera')));\n`),
  "50.00|3|3",
);
esperarValor(
  "la tercera talla del mismo modelo, que no se eligió, no arma grupo: sin ella no hay 3x2",
  caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 2 }, variantes: TRES })}select concat_ws('|', ${COBRO(["a1", "a2", "a3"])},
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') o where o.regla_id = :'r' and o.variante_id = :'a3'));\n`),
  "0.00|0",
);
esperarValor(
  "control: el mismo 3x2 sin variantes arma grupo con las tres tallas del modelo de la campaña",
  caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 2 }, variantes: null })}select ${COBRO(["a1", "a2", "a3"])};\n`),
  "50.00",
);
esperarValor(
  "un monto que cuenta las prendas de la campaña, con variantes sueltas: la caja lee solo esas dos",
  caso(`${OFERTA({ forma: { tipo: "monto", escalones: [{ desde: 80, ahorra: 10 }], ahorro_en: "soles", cuenta: "campana" }, variantes: "jsonb_build_array(:'a1', :'fuera')" })}select concat_ws('|',
  (select cardinality(m.variantes) from retail.ofertas_de_monto_vigentes(:'u') m where m.regla_id = :'r'),
  (select m.variantes @> array[:'a1', :'fuera']::uuid[] from retail.ofertas_de_monto_vigentes(:'u') m where m.regla_id = :'r'),
  (select :'a2'::uuid = any (m.variantes) from retail.ofertas_de_monto_vigentes(:'u') m where m.regla_id = :'r'));\n`),
  "2|t|f",
);
esperarValor(
  "lo que la caja lee y lo que la base cobra coinciden, prenda por prenda, en una oferta de grupo con variantes y una categoría",
  caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 2 }, variantes: "jsonb_build_array(:'a1')", solo: "array[:'cat_fuera']::uuid[]" })}select
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') o where o.regla_id = :'r')
   = (select count(*) from retail.variantes v where v.activo and retail.fn_regla_alcanza_variante(:'r', v.id));\n`),
  "t",
);

console.log("\n— Pegar —");
esperarValor(
  "la migración se pega dos veces y cada función queda con una sola firma",
  correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}
select string_agg(proname || ':' || n, ',' order by proname) from (
  select p.proname, count(*) as n from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('fn_regla_alcanza_variante', 'fn_variantes_de_regla', 'fn_campanas_en_sede', 'guardar_oferta_completa', 'campana_reglas',
                     'fn_regla_solo_variantes', 'fn_variantes_sueltas_de_regla', 'fn_regla_con_variantes')
  group by p.proname) x;\nrollback;`),
  "campana_reglas:1,fn_campanas_en_sede:1,fn_regla_alcanza_variante:1,fn_regla_con_variantes:1,fn_regla_solo_variantes:1,fn_variantes_de_regla:1,fn_variantes_sueltas_de_regla:1,guardar_oferta_completa:1",
);
esperar(
  "la de las lecturas de la caja (20261118233000) se pega dos veces",
  correr(`begin;\n${ANTES}\n${readFileSync(LECTURAS, "utf8")}\n${readFileSync(LECTURAS, "utf8")}\nrollback;`).ok,
);
esperarValor(
  "pegada dos veces, la caja no repite la rama de las variantes",
  correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}
select (length(d) - length(replace(d, 'retail.campana_regla_variantes rv on rv.regla_id = r.id', ''))) / length('retail.campana_regla_variantes rv on rv.regla_id = r.id')
  from (select pg_get_functiondef('retail.fn_campanas_en_sede(date, integer, uuid[], uuid)'::regprocedure) as d) x;\nrollback;`),
  "1",
);

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);

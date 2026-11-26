// Pruebas del candado de partes (ADR-0195). Sin base: `node --test scripts/migraciones/partes-sin-deadlock.test.mjs`.
// La medida contra un Postgres de Supabase de verdad es `pnpm pruebas:partes-sin-deadlock` (corre en las tandas del CI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analizar,
  guionDeMedida,
  informe,
  leerMedida,
  marcaDeParte,
  medirMigracion,
  motivoParaNoMedir,
  partir,
  sentencias,
} from "./partes-sin-deadlock.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "partes-sin-deadlock.mjs");

test("parte en sentencias de primer nivel, sin perder un carácter, con la línea donde empieza cada una", () => {
  const sql = "-- cabecera\nset search_path = retail;\n\nalter table t add column x int;  -- al lado\nselect 1";
  const l = sentencias(sql);
  assert.deepEqual(l.map((s) => s.texto), ["set search_path = retail;", "alter table t add column x int;", "select 1"]);
  assert.deepEqual(l.map((s) => s.linea), [2, 4, 5]);
  assert.equal(l.map((s, i) => sql.slice(i === 0 ? 0 : l[i - 1].hasta, s.hasta)).join(""), sql);
});

test("un «;» dentro de un cuerpo $$, un texto, un E'…', un identificador o un comentario no corta", () => {
  const sql = [
    "create function f() returns void language plpgsql as $f$ begin perform 1; perform 2; end $f$;",
    "select 'a;b', E'c\\';d', \"raro;nombre\" from t;",
    "comment on table t is $$Don't; nunca$$;",
    "/* uno; /* dos; */ tres; */ select 2;",
  ].join("\n");
  assert.equal(sentencias(sql).length, 4);
});

test("las marcas de parte que usan las migraciones del repo, y la prosa que no es marca", () => {
  for (const [linea, etiqueta] of [
    ["-- ============================== PARTE 1 · ubicaciones (sola) ==============================", "PARTE 1"],
    ["-- ═════════════════ PARTE 2 ═════════════════", "PARTE 2"],
    ["-- ============================== PARTE 2: funciones y disparadores =====", "PARTE 2"],
    ["-- ---------- 7. PARTE 2 · Leer las telas ----------", "PARTE 2"],
    ["-- PARTE 3 · políticas (se pega SOLA y al final, ADR-0195)", "PARTE 3"],
    ["-- PARTE 2 de 6 · `productos.temporada` pasa a ser una clave", "PARTE 2"],
    ["-- FIN DE LA PARTE 1", "después de la PARTE 1"],
    ["-- FIN DE LA PARTE 1 (pega hasta aquí; la PARTE 2 va aparte, después) -----", "después de la PARTE 1"],
    ["-- ============================== fin de la PARTE 2 ==============================", "después de la PARTE 2"],
    ["-- ============================== PARTE FINAL · la política de subida de la foto (SOLA, al final) =====", "PARTE FINAL"],
    ["-- PARTE FINAL · políticas", "PARTE FINAL"],
  ]) {
    assert.equal(marcaDeParte(linea), etiqueta, linea);
  }
  for (const linea of [
    "-- PARTE 3: si una caja se cierra entre las dos, el disparador no la encuentra",
    "-- La cabecera deja de ser la fuente del destino; la parte 2 la elimina.",
    "--   disparador de abajo, las funciones del arranque (parte 2) y la lectura",
    "-- ============================== ACTIVIDAD 2 · el orden de las tiendas ======",
    "-- Se pega en DOS partes: TODO hasta la línea «PARTE FINAL» primero",
    "select 'PARTE 1 · x';",
  ]) {
    assert.equal(marcaDeParte(linea), null, linea);
  }
});

test("las marcas parten la migración; la que va en el cuerpo de una función no parte nada", () => {
  const sql = [
    "-- cabecera: va en PARTE 1 · ubicaciones y PARTE 2 · políticas",
    "-- ===== PARTE 1 · ubicaciones =====",
    "alter table retail.ubicaciones add column x int;",
    "create function f() returns void language plpgsql as $$",
    "-- ===== PARTE 9 · esto es un comentario del cuerpo =====",
    "begin null; end $$;",
    "-- ===== PARTE 2 · políticas =====",
    "create policy p on retail.ubicaciones using (true);",
  ].join("\n");
  const { partes, sentencias: l } = partir(sql);
  assert.deepEqual(partes.map((p) => p.etiqueta), ["antes de la PARTE 1", "PARTE 1", "PARTE 2"]);
  assert.deepEqual(l.map((s) => s.parte), [1, 1, 2]);
  assert.deepEqual(partir("select 1;").partes.map((p) => p.etiqueta), ["el archivo entero"]);
});

test("no se mide lo que maneja su propia transacción o trae órdenes de psql; un begin de plpgsql sí se mide", () => {
  assert.match(motivoParaNoMedir(sentencias("select 1;\ncommit;\n")), /línea 2 maneja la transacción/);
  assert.match(motivoParaNoMedir(sentencias("begin;\nselect 1;\n")), /línea 1/);
  assert.match(motivoParaNoMedir(sentencias("\\set x 1\nselect 1;")), /orden de psql/);
  assert.equal(motivoParaNoMedir(sentencias("do $$ begin perform 1; end $$;\ncreate function f() returns int language plpgsql as $$ begin return 1; end $$;")), null);
});

test("el guion va entre begin y rollback, con una foto tras cada sentencia, y la última sin «;» se cierra en su propia línea", () => {
  const sql = "alter table t add column x int;\nselect 1 -- sin punto y coma";
  const l = sentencias(sql);
  const g = guionDeMedida(sql, l);
  assert.match(g, /^begin;\n/);
  assert.match(g, /\nrollback;\n$/);
  assert.equal(g.match(/§cayla§inicio§/g).length, 1);
  assert.equal(g.match(/'§cayla§\d+§'/g).length, 2);
  assert.ok(g.includes("select 1 -- sin punto y coma\n;"));
  assert.ok(!/\bcommit\b/i.test(g));
});

test("la salida de psql se lee por su prefijo y lo demás se ignora; si falta una foto, no se inventa", () => {
  const salida = [
    "§cayla§inicio§100",
    "lo que imprime la migración",
    '§cayla§0§[[50, "retail", "ubicaciones", "p"]]',
    "§cayla§1§[]",
  ].join("\n");
  assert.deepEqual(leerMedida(salida, 2), {
    maxOid: 100,
    fotos: [[{ oid: 50, esquema: "retail", nombre: "ubicaciones", persistencia: "p" }], []],
  });
  assert.throws(() => leerMedida(salida, 3), /no trae todas las fotos/);
});

// Fotos de juguete: relaciones con oid ≤ 100 ya existían; las de más, nacen en la pegada.
const UBICACIONES = { oid: 10, esquema: "retail", nombre: "ubicaciones", persistencia: "p" };
const CAJAS = { oid: 11, esquema: "retail", nombre: "cajas", persistencia: "p" };
const NUEVA = { oid: 150, esquema: "retail", nombre: "nueva", persistencia: "p" };
const AUTH = [
  { oid: 1, esquema: "auth", nombre: "users", persistencia: "p" },
  { oid: 2, esquema: "storage", nombre: "buckets", persistencia: "p" },
];
/** Analiza un SQL con las fotos dadas (lo que queda tomado después de cada sentencia). */
const con = (sql, fotos) => analizar(partir(sql), { maxOid: 100, fotos });

test("el alter de una tabla que ya existía y una política en la misma parte: rojo, con las dos líneas", () => {
  const sql = "alter table retail.ubicaciones add column x int;\ncreate policy p on retail.nueva using (true);";
  const [m] = con(sql, [[UBICACIONES], [UBICACIONES, NUEVA, ...AUTH]]);
  assert.equal(m.etiqueta, "el archivo entero");
  assert.deepEqual(m.otras.map((o) => [o.linea, o.relacion]), [[1, "retail.ubicaciones"]]);
  assert.deepEqual(m.politicas.map((p) => p.linea), [2]);
});

test("lo mismo partido en dos partes: verde", () => {
  const sql = "-- ===== PARTE 1 · ubicaciones =====\nalter table retail.ubicaciones add column x int;\n-- ===== PARTE 2 · políticas =====\ncreate policy p on retail.nueva using (true);";
  assert.deepEqual(con(sql, [[UBICACIONES], [UBICACIONES, NUEVA, ...AUTH]]), []);
});

test("lo que se toma DESPUÉS de la primera política no cierra el ciclo: con storage ya en exclusiva, el Asesor no lo tiene", () => {
  const sql = "create policy p on retail.ubicaciones using (true);\nalter table retail.cajas add column x int;";
  assert.deepEqual(con(sql, [[UBICACIONES, ...AUTH], [UBICACIONES, ...AUTH, CAJAS]]), []);
  // La forma de 20261005100200 (la parte «solo políticas»): una función que reescribe políticas, después de la primera.
  const conFuncion = "do $p$ begin execute 'create policy p on retail.nueva using (true)'; end $p$;\nselect retail.fn_rls_una_vez_por_consulta();";
  assert.deepEqual(con(conFuncion, [[NUEVA, ...AUTH], [NUEVA, ...AUTH, UBICACIONES]]), []);
});

test("una parte con políticas y otra después que mezcla: la segunda sale roja aunque auth ya estuviera tomado", () => {
  const sql = "-- ===== PARTE 1 · políticas =====\ncreate policy a on retail.nueva using (true);\n-- ===== PARTE 2 · otra =====\nalter table retail.cajas add column x int;\ncreate policy b on retail.ubicaciones using (true);";
  const [m] = con(sql, [[NUEVA, ...AUTH], [NUEVA, ...AUTH, CAJAS], [NUEVA, ...AUTH, CAJAS, UBICACIONES]]);
  assert.equal(m.etiqueta, "PARTE 2");
  assert.deepEqual(m.otras.map((o) => o.relacion), ["retail.cajas"]);
  assert.deepEqual(m.politicas.map((p) => p.linea), [5]);
});

test("una política sola sobre una tabla en uso es la forma correcta: su propia tabla no cuenta", () => {
  assert.deepEqual(con("create policy p on retail.ubicaciones using (true);", [[UBICACIONES, ...AUTH]]), []);
});

test("varias políticas seguidas: la segunda ya no toma auth de nuevo, y su tabla sigue siendo suya", () => {
  const sql = "create policy a on retail.ubicaciones using (true);\ncreate policy b on retail.cajas using (true);\ndo $$ begin execute 'alter policy b on retail.cajas using (false)'; end $$;";
  assert.deepEqual(con(sql, [[UBICACIONES, ...AUTH], [UBICACIONES, ...AUTH, CAJAS], [UBICACIONES, ...AUTH, CAJAS]]), []);
});

test("lo que nace en la pegada (y lo temporal, y el TOAST) no es una tabla en uso", () => {
  const sql = "create table retail.nueva (id int);\nalter table retail.nueva enable row level security;\ncreate temp table t (id int);\ncreate policy p on retail.nueva using (true);";
  const TEMP = { oid: 90, esquema: "pg_temp_3", nombre: "t", persistencia: "t" };
  const TOAST = { oid: 91, esquema: "pg_toast", nombre: "pg_toast_10", persistencia: "p" };
  assert.deepEqual(con(sql, [[NUEVA], [NUEVA], [NUEVA, TEMP, TOAST], [NUEVA, TEMP, TOAST, ...AUTH]]), []);
});

test("una tabla que ya existía y se borra en la misma pegada cuenta, aunque ya no tenga nombre", () => {
  const BORRADA = { oid: 12, esquema: null, nombre: null, persistencia: null };
  const [m] = con("drop table retail.vieja;\ncreate policy p on retail.ubicaciones using (true);", [[BORRADA], [BORRADA, UBICACIONES, ...AUTH]]);
  assert.match(m.otras[0].relacion, /relación 12 \(borrada/);
});

test("lo que pasa dentro de un solo bloque do se lee como la política (límite declarado del candado)", () => {
  const sql = "do $$ begin alter table retail.cajas add column x int; execute 'create policy p on retail.cajas using (true)'; end $$;";
  assert.deepEqual(con(sql, [[CAJAS, ...AUTH]]), []);
});

test("medirMigracion arma el guion, lo corre con el psql que le den y analiza lo que vuelve", () => {
  const sql = "alter table retail.ubicaciones add column x int;\ncreate policy p on retail.ubicaciones using (true);";
  const fotos = ['[[10, "retail", "ubicaciones", "p"]]', '[[10, "retail", "ubicaciones", "p"], [1, "auth", "users", "p"]]'];
  let guion = "";
  const psql = (g) => { guion = g; return ["§cayla§inicio§100", ...fotos.map((f, i) => `§cayla§${i}§${f}`)].join("\n"); };
  const r = medirMigracion(sql, psql);
  assert.ok(guion.startsWith("begin;"));
  assert.equal(r.partes, 1);
  assert.deepEqual(r.mezclas[0].otras.map((o) => o.relacion), ["retail.ubicaciones"]);
  assert.deepEqual(medirMigracion("commit;", () => assert.fail("no debía correr")), { sinMedir: "la línea 1 maneja la transacción por su cuenta (`commit;`)" });
});

test("el informe: rojo con archivo, parte y líneas; verde de una línea; lo que no se midió nunca dice que está bien", () => {
  const rojo = informe([{ archivo: "x.sql", partes: 1, mezclas: con("alter table retail.ubicaciones add column x int;\ncreate policy p on retail.nueva using (true);", [[UBICACIONES], [UBICACIONES, NUEVA, ...AUTH]]) }]);
  assert.equal(rojo.rojo, true);
  assert.match(rojo.texto, /✗ x\.sql — el archivo entero \(línea 1\) mezcla/);
  assert.match(rojo.texto, /línea 1: `alter table retail\.ubicaciones add column x int;` toma en exclusiva retail\.ubicaciones/);
  assert.match(rojo.texto, /línea 2: `create policy p on retail\.nueva using \(true\);` toma en exclusiva las tablas de auth y storage/);
  assert.match(rojo.texto, /PARTE N · políticas/);
  const verde = informe([{ archivo: "y.sql", partes: 3, mezclas: [] }]);
  assert.deepEqual(verde, { texto: "✓ y.sql: 3 partes, ninguna mezcla una política con el alter de una tabla que ya existía.", rojo: false });
  const sinMedir = informe([{ archivo: "z.sql", error: "relation does not exist" }], { reproduce: false });
  assert.equal(sinMedir.rojo, false);
  assert.match(sinMedir.texto, /::warning::Este Postgres ya no toma auth\/storage/);
  assert.match(sinMedir.texto, /::warning::z\.sql: no se pudo medir \(relation does not exist\)\. Eso no dice que esté bien/);
});

test("revisar (lo que corre el CI): sin archivo no hay nada; con una mezcla sale con 1; limpio sale con 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "partes-"));
  const correr = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  const nada = correr("revisar", join(dir, "no-existe.json"));
  assert.equal(nada.status, 0);
  assert.match(nada.stdout, /no agrega migraciones/);
  const mezclas = con("alter table retail.ubicaciones add column x int;\ncreate policy p on retail.nueva using (true);", [[UBICACIONES], [UBICACIONES, NUEVA, ...AUTH]]);
  writeFileSync(join(dir, "rojo.json"), JSON.stringify({ reproduce: true, archivos: [{ archivo: "x.sql", partes: 1, mezclas }] }));
  const rojo = correr("revisar", join(dir, "rojo.json"));
  assert.equal(rojo.status, 1);
  assert.match(rojo.stdout, /✗ x\.sql/);
  writeFileSync(join(dir, "verde.json"), JSON.stringify({ reproduce: true, archivos: [{ archivo: "y.sql", partes: 1, mezclas: [] }] }));
  assert.equal(correr("revisar", join(dir, "verde.json")).status, 0);
  assert.equal(correr("otra-cosa").status, 2);
});

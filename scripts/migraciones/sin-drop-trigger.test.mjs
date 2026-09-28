// Pruebas del candado de `drop trigger`. Sin dependencias: `node --test scripts/migraciones/sin-drop-trigger.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGADO, lineasConDropTrigger, migracionesConDropTrigger, sinComentarios } from "./sin-drop-trigger.mjs";

test("un drop trigger suelto se detecta con su línea, en mayúsculas o partido en dos líneas", () => {
  assert.deepEqual(lineasConDropTrigger("select 1;\ndrop trigger if exists t_x on retail.t;\n"), [2]);
  assert.deepEqual(lineasConDropTrigger("DROP TRIGGER t_x ON retail.t;"), [1]);
  assert.deepEqual(lineasConDropTrigger("select 1;\ndrop\n   trigger t_x on retail.t;"), [2]);
});

test("el que va dentro de un bloque do (texto de un execute) también cuenta: corre al pegar", () => {
  const sql = "do $$\nbegin\n  execute 'drop trigger if exists t_x on retail.t';\nend $$;";
  assert.deepEqual(lineasConDropTrigger(sql), [3]);
});

test("en un comentario de línea o de bloque (también anidado) no cuenta", () => {
  assert.deepEqual(lineasConDropTrigger("-- nunca drop trigger (ADR-0195)\ncreate or replace trigger t_x after insert on retail.t for each row execute function retail.f();"), []);
  assert.deepEqual(lineasConDropTrigger("/* antes: drop trigger t_x on t; */ select 1;"), []);
  assert.deepEqual(lineasConDropTrigger("/* uno /* dos: drop trigger x */ sigue drop trigger y */ select 1;"), []);
  assert.deepEqual(lineasConDropTrigger("create function f() returns void language plpgsql as $$\nbegin\n  -- drop trigger x on t\n  null;\nend $$;"), []);
});

test("un -- dentro de un texto no esconde lo que sigue en la línea", () => {
  assert.deepEqual(lineasConDropTrigger("select '--'; drop trigger x on t;"), [1]);
  assert.deepEqual(lineasConDropTrigger("select 'it''s -- no'; drop trigger x on t;"), [1]);
  assert.deepEqual(lineasConDropTrigger("select E'\\' -- no'; drop trigger x on t;"), [1]);
});

test("borrar comentarios conserva los saltos de línea (la línea reportada es la del archivo)", () => {
  const sql = "/* uno\ndos\ntres */\ndrop trigger x on t;";
  assert.equal(sinComentarios(sql).split("\n").length, 4);
  assert.deepEqual(lineasConDropTrigger(sql), [4]);
});

test("create or replace trigger, drop table triggers o disable trigger no cuentan", () => {
  assert.deepEqual(lineasConDropTrigger("create or replace trigger t_x before update on retail.t for each row execute function retail.f();"), []);
  assert.deepEqual(lineasConDropTrigger("drop table if exists retail.triggers_viejos;"), []);
  assert.deepEqual(lineasConDropTrigger("alter table retail.t disable trigger t_x;"), []);
});

test("un archivo nuevo con drop trigger sale; uno del legado se tolera pero no puede crecer", () => {
  const legado = new Map([["20260914165703_viejo.sql", 1]]);
  const nuevo = ["20260929100000_nuevo.sql", "select 1;\ndrop trigger x on t;"];
  assert.deepEqual(migracionesConDropTrigger([nuevo], legado), [{ archivo: nuevo[0], lineas: [2], legado: 0 }]);
  assert.deepEqual(migracionesConDropTrigger([["20260914165703_viejo.sql", "drop trigger x on t;"]], legado), []);
  assert.deepEqual(
    migracionesConDropTrigger([["20260914165703_viejo.sql", "drop trigger x on t;\ndrop trigger y on t;"]], legado),
    [{ archivo: "20260914165703_viejo.sql", lineas: [1, 2], legado: 1 }],
  );
});

test("un archivo que se pega a mano (pegar-en-produccion-*.sql) también se revisa", () => {
  assert.equal(migracionesConDropTrigger([["pegar-en-produccion-algo-nuevo.sql", "drop trigger x on t;"]], new Map()).length, 1);
});

test("el repo de hoy: ninguna migración fuera del legado usa drop trigger, y el legado dice la verdad", () => {
  const carpeta = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations");
  const archivos = readdirSync(carpeta).filter((n) => n.endsWith(".sql")).map((n) => [n, readFileSync(join(carpeta, n), "utf8")]);
  assert.deepEqual(migracionesConDropTrigger(archivos), []);
  // Cada línea del legado existe y tiene exactamente esa cantidad: un legado inflado dejaría pasar un drop trigger nuevo.
  const porNombre = new Map(archivos);
  for (const [nombre, cantidad] of LEGADO) {
    assert.ok(porNombre.has(nombre), `el legado nombra ${nombre}, que no existe`);
    assert.equal(lineasConDropTrigger(porNombre.get(nombre)).length, cantidad, `${nombre} en el legado`);
  }
});

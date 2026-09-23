// `pnpm terminales:probar` — las partes puras de `pnpm terminales:crear` (ADR-0162, sin tipo). No tocan red ni base.
// Las reglas compartidas con la pantalla (clave, correo, tienda) se prueban a fondo en `apps/web/lib/terminales-reglas.test.ts`;
// aquí se prueba lo propio del script y que las importa bien desde el archivo TypeScript.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ALFABETO_CLAVE, correoTerminal, generarClave, leerArgumentos, resolverRol, resolverTienda } from "./reglas.mjs";

test("argumentos: tienda y nombre, sin importar mayúsculas de la tienda; el nombre sin espacios de sobra", () => {
  assert.deepEqual(leerArgumentos(["tru", "  Terminal  Caja TRU "]), { ayuda: false, tienda: "TRU", nombre: "Terminal Caja TRU", rol: null, cambiarClave: false });
  assert.deepEqual(leerArgumentos(["AQP", "Almacén", "--rol", "Terminal administrativa"]), {
    ayuda: false,
    tienda: "AQP",
    nombre: "Almacén",
    rol: "Terminal administrativa",
    cambiarClave: false,
  });
  assert.deepEqual(leerArgumentos(["LIM", "Caja", "--cambiar-clave"]), { ayuda: false, tienda: "LIM", nombre: "Caja", rol: null, cambiarClave: true });
});

test("argumentos: --help gana a todo, aun con datos incompletos", () => {
  assert.deepEqual(leerArgumentos(["--help"]), { ayuda: true });
  assert.deepEqual(leerArgumentos(["TRU", "-h"]), { ayuda: true });
});

test("argumentos: rechaza lo que no cuadra con un mensaje legible", () => {
  assert.throws(() => leerArgumentos([]), /Faltan datos/);
  assert.throws(() => leerArgumentos(["TRU"]), /Faltan datos/);
  assert.throws(() => leerArgumentos(["CUS", "Caja"]), /no es una tienda/);
  assert.throws(() => leerArgumentos(["TRU", "   "]), /no puede ir vacío/);
  assert.throws(() => leerArgumentos(["TRU", "x".repeat(61)]), /muy largo/);
  assert.throws(() => leerArgumentos(["TRU", "Caja", "--forzar"]), /No conozco la opción --forzar/);
  assert.throws(() => leerArgumentos(["TRU", "Caja", "--rol"]), /Falta el nombre del rol/);
  assert.throws(() => leerArgumentos(["TRU", "Caja", "--rol", "X", "--cambiar-clave"]), /no cambia el rol/);
  assert.throws(() => leerArgumentos(["TRU", "Caja", "extra"]), /Faltan datos/);
});

const ROLES = [
  { id: "l", nombre: "Líder de equipo", clave: "lider", fijo: true, archivado_at: null },
  { id: "tv", nombre: "Terminal de ventas", clave: "terminal_ventas", fijo: false, archivado_at: null },
  { id: "ta", nombre: "Terminal administrativa", clave: "terminal_administrativa", fijo: false, archivado_at: null },
  { id: "v", nombre: "Viejo", clave: null, fijo: false, archivado_at: "2026-09-01" },
];

test("rol: sin --rol, «Terminal de ventas»; con --rol, por nombre sin importar mayúsculas", () => {
  assert.equal(resolverRol(ROLES, null).id, "tv");
  assert.equal(resolverRol(ROLES, "terminal ADMINISTRATIVA").id, "ta");
});

test("rol: nunca Líder ni uno archivado; dice cuáles hay", () => {
  assert.throws(() => resolverRol(ROLES, "Líder de equipo"), /No hay un rol vigente.*«Terminal de ventas», «Terminal administrativa»/);
  assert.throws(() => resolverRol(ROLES, "Viejo"), /No hay un rol vigente/);
  assert.throws(() => resolverRol(ROLES.filter((r) => r.id !== "tv"), null), /Elige uno con --rol/);
});

test("reglas compartidas con la pantalla: tienda, correo y clave (importadas del archivo TypeScript)", () => {
  const ubicaciones = [
    { id: "1", nombre: "Tienda TRU", tipo: "tienda", activo: true },
    { id: "2", nombre: "Taller LIM", tipo: "taller", activo: true },
  ];
  assert.equal(resolverTienda(ubicaciones, "TRU").id, "1");
  assert.throws(() => resolverTienda(ubicaciones, "LIM"), /No encontré una tienda activa para LIM/);
  assert.equal(correoTerminal("tru", "Terminal Caja TRU", "k7m2"), "terminal-tru-caja-k7m2@cayla.pe");
  const clave = generarClave(crypto.randomBytes);
  assert.match(clave, /^[^-]{5}-[^-]{5}-[^-]{5}-[^-]{5}$/);
  for (const c of clave.replaceAll("-", "")) assert.ok(ALFABETO_CLAVE.includes(c));
});

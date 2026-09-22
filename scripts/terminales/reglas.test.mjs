// `pnpm terminales:probar` — las partes puras de `pnpm terminales:crear` (ADR-0162). No tocan red ni base.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ALFABETO_CLAVE, correoDe, generarClave, leerArgumentos, nombreDe, resolverTienda } from "./reglas.mjs";

test("argumentos: tienda y tipo, sin importar mayúsculas", () => {
  assert.deepEqual(leerArgumentos(["tru", "Ventas"]), { ayuda: false, tienda: "TRU", tipo: "ventas", cambiarClave: false });
  assert.deepEqual(leerArgumentos(["AQP", "administrativa", "--cambiar-clave"]), {
    ayuda: false,
    tienda: "AQP",
    tipo: "administrativa",
    cambiarClave: true,
  });
});

test("argumentos: --help gana a todo, aun con datos incompletos", () => {
  assert.deepEqual(leerArgumentos(["--help"]), { ayuda: true });
  assert.deepEqual(leerArgumentos(["TRU", "-h"]), { ayuda: true });
});

test("argumentos: rechaza lo que no cuadra con un mensaje legible", () => {
  assert.throws(() => leerArgumentos([]), /Faltan datos/);
  assert.throws(() => leerArgumentos(["TRU"]), /Faltan datos/);
  assert.throws(() => leerArgumentos(["CUS", "ventas"]), /no es una tienda/);
  assert.throws(() => leerArgumentos(["TRU", "caja"]), /no es un tipo/);
  assert.throws(() => leerArgumentos(["TRU", "ventas", "--forzar"]), /No conozco la opción --forzar/);
  assert.throws(() => leerArgumentos(["TRU", "ventas", "extra"]), /Faltan datos/);
});

test("correo y nombre de la terminal", () => {
  assert.equal(correoDe("ventas", "TRU"), "terminal-ventas-tru@cayla.pe");
  assert.equal(correoDe("administrativa", "AQP"), "terminal-administrativa-aqp@cayla.pe");
  assert.equal(nombreDe("ventas", "TRU"), "Terminal Ventas TRU");
  assert.equal(nombreDe("administrativa", "LIM"), "Terminal Administrativa LIM");
});

const UBICACIONES = [
  { id: "1", nombre: "Tienda TRU", tipo: "tienda", activo: true },
  { id: "2", nombre: "Tienda Arequipa", tipo: "tienda", activo: true },
  { id: "3", nombre: "Taller LIM", tipo: "taller", activo: true },
  { id: "4", nombre: "Tienda LIM", tipo: "tienda", activo: false },
  { id: "5", nombre: "Almacén Trujillo", tipo: "almacen", activo: true },
];

test("tienda: por código (producción) o por ciudad (local), solo tiendas activas", () => {
  assert.equal(resolverTienda(UBICACIONES, "TRU").id, "1");
  assert.equal(resolverTienda(UBICACIONES, "AQP").id, "2");
});

test("tienda: el Taller y una tienda desactivada no cuentan — se detiene y dice cuáles hay", () => {
  assert.throws(() => resolverTienda(UBICACIONES, "LIM"), /No encontré una tienda activa para LIM.*«Tienda TRU», «Tienda Arequipa»/);
});

test("tienda: con dos candidatas se detiene en vez de adivinar", () => {
  const dobles = [...UBICACIONES, { id: "6", nombre: "Tienda Trujillo Mall", tipo: "tienda", activo: true }];
  assert.throws(() => resolverTienda(dobles, "TRU"), /más de una tienda/);
});

test("tienda: «Lima» no se confunde con otra palabra que la contenga", () => {
  const u = [{ id: "7", nombre: "Tienda Limatambo", tipo: "tienda", activo: true }];
  assert.throws(() => resolverTienda(u, "LIM"), /No encontré/);
});

test("clave: 4 grupos de 5, solo del alfabeto sin símbolos confundibles", () => {
  for (let i = 0; i < 200; i++) {
    const clave = generarClave(crypto.randomBytes);
    assert.match(clave, /^[^-]{5}-[^-]{5}-[^-]{5}-[^-]{5}$/);
    for (const c of clave.replaceAll("-", "")) assert.ok(ALFABETO_CLAVE.includes(c), `símbolo fuera del alfabeto: ${c}`);
    assert.ok(!/[0O1lI]/.test(clave));
  }
});

test("clave: descarta los bytes que sesgarían el reparto", () => {
  // Un azar que solo devuelve 255 (fuera del tope) y luego ceros: la clave sale solo del primer símbolo, sin colgarse.
  let llamadas = 0;
  const azar = (n) => Buffer.alloc(n, llamadas++ === 0 ? 255 : 0);
  assert.equal(generarClave(azar), "aaaaa-aaaaa-aaaaa-aaaaa");
});

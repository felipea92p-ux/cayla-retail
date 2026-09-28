import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONCEPTO_UNIDADES_EN_STOCK, leerSePuedeEliminar, salidaSinEliminar, textoNoSePuede, textoSeBorra } from "./eliminar-producto-reglas";

describe("leerSePuedeEliminar", () => {
  it("lee la fila única que entrega PostgREST (arreglo de una fila)", () => {
    expect(leerSePuedeEliminar([{ puede: true, razon: null }])).toEqual({ puede: true, razon: null });
    expect(leerSePuedeEliminar([{ puede: false, razon: "tiene líneas de venta (7)" }])).toEqual({ puede: false, razon: "tiene líneas de venta (7)" });
  });

  it("acepta un objeto suelto y trata una razón vacía como ausente", () => {
    expect(leerSePuedeEliminar({ puede: false, razon: "  " })).toEqual({ puede: false, razon: null });
  });

  it("cualquier otra forma es null: la ventana no ofrece borrar a ciegas", () => {
    expect(leerSePuedeEliminar(null)).toBeNull();
    expect(leerSePuedeEliminar([])).toBeNull();
    expect(leerSePuedeEliminar([{ razon: "x" }])).toBeNull();
    expect(leerSePuedeEliminar([{ puede: "true" }])).toBeNull();
    expect(leerSePuedeEliminar("hola")).toBeNull();
  });
});

describe("textoSeBorra", () => {
  it("dice qué se borra, en singular y plural, y que no se deshace", () => {
    expect(textoSeBorra(1)).toContain("su única variante");
    expect(textoSeBorra(12)).toContain("sus 12 variantes");
    expect(textoSeBorra(2)).toMatch(/No se puede deshacer\.$/);
  });
});

describe("textoNoSePuede", () => {
  it("en 0 con historia: primero dice que no hay unidades, para que el número no se lea como stock (caso «Fdhh», 2026-09-28)", () => {
    expect(textoNoSePuede("Fdhh", "tiene movimientos de stock (12)")).toBe(
      "«Fdhh» no tiene unidades en stock, pero ya tiene historia: movimientos de stock (12). Eliminarlo borraría esa historia."
    );
  });

  it("con unidades: la razón ya las cuenta y no se afirma nada más", () => {
    expect(textoNoSePuede("Top Aurora", "tiene líneas de venta (7), movimientos de stock (15), unidades en stock (3)")).toBe(
      "«Top Aurora» tiene líneas de venta (7), movimientos de stock (15), unidades en stock (3). Eliminarlo borraría esa historia."
    );
  });

  it("una pieza del sistema no dice que «borraría historia»: no la tiene", () => {
    expect(textoNoSePuede("Prenda sin Registrar", "es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita")).toBe(
      "«Prenda sin Registrar» es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita."
    );
  });

  it("sin razón (la base no la dio) sigue siendo una frase completa", () => {
    expect(textoNoSePuede("X", null)).toBe("«X» ya se usó. Eliminarlo borraría esa historia.");
  });

  // «No tiene unidades» se deduce de que la base NO trajo su renglón de unidades: si la última versión de la función lo
  // renombra, la ventana afirmaría 0 de una prenda con stock. Se compara contra el SQL, no contra una copia del texto.
  it("la base sigue llamando así al renglón de unidades", () => {
    const dir = new URL("../../../supabase/migrations/", import.meta.url);
    const ultima = readdirSync(dir)
      .filter((f) => /^\d{14}_.+\.sql$/.test(f))
      .sort()
      .map((f) => readFileSync(new URL(f, dir), "utf8"))
      .filter((sql) => /function\s+retail\.fn_producto_se_puede_eliminar\s*\(/i.test(sql))
      .at(-1);
    expect(ultima).toBeDefined();
    expect(ultima).toContain(`'${CONCEPTO_UNIDADES_EN_STOCK}'`);
  });
});

describe("salidaSinEliminar", () => {
  it("activo con historia: se descontinúa desde Editar", () => {
    expect(salidaSinEliminar("activo", "tiene movimientos de stock (2)")).toEqual({
      texto: "Si ya no lo quieres a la venta, márcalo como descontinuado: su historia se conserva.",
      irAEditar: true,
    });
  });

  it("descontinuado con historia: ya está retirado, no hay nada que sugerir", () => {
    expect(salidaSinEliminar("descontinuado", "tiene líneas de venta (1)")).toEqual({ texto: "Ya está descontinuado: su historia se conserva.", irAEditar: false });
  });

  it("una pieza del sistema no tiene salida: no se retira de ninguna manera", () => {
    expect(salidaSinEliminar("activo", "es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita")).toBeNull();
  });
});

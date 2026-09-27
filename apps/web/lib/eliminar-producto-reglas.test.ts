import { describe, expect, it } from "vitest";
import { leerSePuedeEliminar, salidaSinEliminar, textoNoSePuede, textoSeBorra } from "./eliminar-producto-reglas";

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
  it("con historia: nombra el producto, la razón y por qué no", () => {
    expect(textoNoSePuede("Top Aurora", "tiene líneas de venta (7), movimientos de stock (15)")).toBe(
      "«Top Aurora» tiene líneas de venta (7), movimientos de stock (15). Eliminarlo borraría esa historia."
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

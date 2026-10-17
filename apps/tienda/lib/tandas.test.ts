import { describe, expect, it } from "vitest";
import { conMostrar, leerMostrar, PRIMERA_TANDA, siguienteTanda, tandaDe } from "./tandas";

describe("cuántas tarjetas pide la dirección", () => {
  it("sin `mostrar`, con algo raro o con menos que la primera tanda: la primera tanda", () => {
    expect(leerMostrar(undefined)).toBe(PRIMERA_TANDA);
    expect(leerMostrar("")).toBe(PRIMERA_TANDA);
    expect(leerMostrar("muchas")).toBe(PRIMERA_TANDA);
    expect(leerMostrar("-5")).toBe(PRIMERA_TANDA);
    expect(leerMostrar("3")).toBe(PRIMERA_TANDA);
    expect(leerMostrar(["60", "156"])).toBe(60);
  });

  it("lo pedido, con un tope para una dirección escrita a mano", () => {
    expect(leerMostrar("60")).toBe(60);
    expect(leerMostrar("156")).toBe(156);
    expect(leerMostrar("999999")).toBe(2000);
  });
});

describe("las tandas crecen", () => {
  it("24 → 60 → 156 → 396: a las 298 prendas de producción se llega con tres pedidos", () => {
    expect(siguienteTanda(24)).toBe(60);
    expect(siguienteTanda(60)).toBe(156);
    expect(siguienteTanda(156)).toBe(396);
    let mostrar = PRIMERA_TANDA;
    let pedidos = 0;
    while (tandaDe(298, mostrar).siguiente !== null) {
      mostrar = tandaDe(298, mostrar).siguiente as number;
      pedidos++;
    }
    expect(pedidos).toBe(3);
    expect(mostrar).toBe(298);
  });

  it("siempre en múltiplos de 12 (llena las filas de 2, 3 y 4 columnas)", () => {
    for (const m of [24, 60, 156, 396]) expect(siguienteTanda(m) % 12).toBe(0);
  });
});

describe("la tanda de una lista", () => {
  it("una lista corta se ve entera, sin «Ver más»", () => {
    expect(tandaDe(7, PRIMERA_TANDA)).toEqual({ visibles: 7, quedan: 0, siguiente: null, cuantasMas: 0 });
    expect(tandaDe(24, PRIMERA_TANDA)).toEqual({ visibles: 24, quedan: 0, siguiente: null, cuantasMas: 0 });
    expect(tandaDe(0, PRIMERA_TANDA)).toEqual({ visibles: 0, quedan: 0, siguiente: null, cuantasMas: 0 });
  });

  it("una lista larga muestra la primera tanda y dice cuántas llegan después", () => {
    expect(tandaDe(298, 24)).toEqual({ visibles: 24, quedan: 274, siguiente: 60, cuantasMas: 36 });
    expect(tandaDe(298, 156)).toEqual({ visibles: 156, quedan: 142, siguiente: 298, cuantasMas: 142 });
    expect(tandaDe(298, 298)).toEqual({ visibles: 298, quedan: 0, siguiente: null, cuantasMas: 0 });
  });

  it("si se publicaron menos prendas que las pedidas (una dirección vieja), se ven todas", () => {
    expect(tandaDe(40, 156)).toEqual({ visibles: 40, quedan: 0, siguiente: null, cuantasMas: 0 });
  });

  it("la última tanda no pide más de las que hay", () => {
    expect(tandaDe(70, 60)).toEqual({ visibles: 60, quedan: 10, siguiente: 70, cuantasMas: 10 });
  });
});

describe("la dirección con `mostrar`", () => {
  it("se suma a lo que la lista ya tiene, sin tocarlo", () => {
    expect(conMostrar("/catalogo", 60)).toBe("/catalogo?mostrar=60");
    expect(conMostrar("/catalogo?lista=nuevo&sede=lima", 156)).toBe("/catalogo?lista=nuevo&sede=lima&mostrar=156");
    expect(conMostrar("/catalogo?mostrar=60&orden=precio", 156)).toBe("/catalogo?mostrar=156&orden=precio");
  });

  it("la primera tanda no se escribe: es la dirección de siempre", () => {
    expect(conMostrar("/catalogo?mostrar=60", PRIMERA_TANDA)).toBe("/catalogo");
    expect(conMostrar("/catalogo?lista=nuevo&mostrar=60", PRIMERA_TANDA)).toBe("/catalogo?lista=nuevo");
  });
});

import { describe, it, expect } from "vitest";
import { etiquetaSede } from "./etiqueta-sede";

// La etiqueta es lo ÚNICO que la persona lee para saber dónde está parada. Estas
// pruebas la fijan contra las filas reales de las dos bases que existen hoy: la de
// producción (vista puente sobre Dynamic) y la del seed local. Que "003" muestre
// "TND LIM" y no "TND 003" es el punto entero del cambio.

describe("etiquetaSede — producción (retail.sedes sobre Dynamic)", () => {
  it("la tienda de Lima dice su ciudad aunque su código sea 003", () => {
    expect(etiquetaSede({ codigo: "003", nombre: "Tienda LIM", tipo: "tienda" })).toBe("TND LIM");
  });

  it("el Taller se distingue de la tienda de la misma ciudad", () => {
    expect(etiquetaSede({ codigo: "LIM", nombre: "Taller LIM", tipo: "fabrica" })).toBe("TLL LIM");
  });

  it("las tiendas con código de ciudad lo conservan", () => {
    expect(etiquetaSede({ codigo: "AQP", nombre: "Tienda AQP", tipo: "tienda" })).toBe("TND AQP");
    expect(etiquetaSede({ codigo: "TRU", nombre: "Tienda TRU", tipo: "tienda" })).toBe("TND TRU");
  });

  it("Central se queda con su código: no es tienda ni taller", () => {
    expect(etiquetaSede({ codigo: "CCO", nombre: "Central", tipo: "corporativo" })).toBe("CCO");
  });
});

describe("etiquetaSede — seed local (0001_init)", () => {
  it("los nombres de ciudad completos no rompen la etiqueta", () => {
    expect(etiquetaSede({ codigo: "TRU", nombre: "Trujillo", tipo: "tienda" })).toBe("TND TRU");
    expect(etiquetaSede({ codigo: "AQP", nombre: "Arequipa", tipo: "tienda" })).toBe("TND AQP");
    expect(etiquetaSede({ codigo: "LIM", nombre: "Lima", tipo: "tienda" })).toBe("TND LIM");
  });

  it("sin ciudad legible queda el prefijo solo, nunca basura", () => {
    expect(etiquetaSede({ codigo: "TALLER", nombre: "Taller (Lima)", tipo: "fabrica" })).toBe("TLL");
  });
});

describe("etiquetaSede — lo que venga después", () => {
  it("una tienda nueva de Dynamic sale legible sin tocar el código", () => {
    expect(etiquetaSede({ codigo: "004", nombre: "Tienda CUS", tipo: "tienda" })).toBe("TND CUS");
  });

  it("un tipo que no abreviamos cae al código en vez de inventar", () => {
    expect(etiquetaSede({ codigo: "OTRU", nombre: "Oficina TRU", tipo: "oficina" })).toBe("OTRU");
  });
});

// La lista que ve el Líder, armada igual que en `app/(app)/layout.tsx`: filtra
// almacenes, etiqueta y ordena. Deja escrito, negro sobre blanco, qué se ve en la
// cabecera de producción — si alguien cambia la regla, esto falla primero.
describe("la lista del selector de sede", () => {
  const PRODUCCION = [
    { codigo: "003", nombre: "Tienda LIM", tipo: "tienda" },
    { codigo: "AQP", nombre: "Tienda AQP", tipo: "tienda" },
    { codigo: "CCO", nombre: "Central", tipo: "corporativo" },
    { codigo: "LIM", nombre: "Taller LIM", tipo: "fabrica" },
    { codigo: "TRU", nombre: "Tienda TRU", tipo: "tienda" },
  ];

  it("se lee corrida y ordenada, sin un solo código críptico", () => {
    const lista = PRODUCCION.filter((s) => s.tipo !== "almacen")
      .map(etiquetaSede)
      .sort((a, b) => a.localeCompare(b, "es"));

    expect(lista).toEqual(["CCO", "TLL LIM", "TND AQP", "TND LIM", "TND TRU"]);
  });
});

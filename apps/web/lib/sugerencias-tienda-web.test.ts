import { describe, expect, it } from "vitest";
import { DIRECCION_NEUTRA, NOMBRE_NEUTRO, sugerirDireccion, sugerirNombreWeb } from "./sugerencias-tienda-web";

// El «control» de cada tarjeta es la tienda: se recorren los nombres que tienen hoy (producción y la base local) y los que un
// líder podría crear mañana sin deploy.
const DE_CAYLA = [
  ["Tienda TRU", "Trujillo"],
  ["Tienda AQP", "Arequipa"],
  ["Tienda LIM", "Lima"],
  ["Tienda Trujillo", "Trujillo"],
  ["Tienda Lima", "Lima"],
  ["Tienda Arequipa", "Arequipa"],
] as const;
const NUEVAS = ["Tienda Chiclayo", "Outlet Centro", "Tienda XYZ"];
const SIN_NOMBRE = ["", "   ", "Tienda", "tienda "];

describe("los ejemplos de Tienda web siguen a la tienda de la tarjeta", () => {
  it("es total: toda tienda da un ejemplo de nombre y de dirección que cabe en la tarjeta", () => {
    for (const nombre of [...DE_CAYLA.map(([n]) => n), ...NUEVAS, ...SIN_NOMBRE]) {
      for (const ejemplo of [sugerirNombreWeb(nombre), sugerirDireccion(nombre)]) {
        expect(ejemplo.length).toBeGreaterThan(0);
        expect(ejemplo.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it("en una tienda de CAYLA, el nombre es su ciudad y la dirección es de su ciudad («Tienda TRU» → Trujillo)", () => {
    for (const [nombre, ciudad] of DE_CAYLA) {
      expect(sugerirNombreWeb(nombre)).toBe(`Ej. ${ciudad}`);
      expect(sugerirDireccion(nombre)).not.toBe(DIRECCION_NEUTRA);
    }
    expect(sugerirDireccion("Tienda LIM")).toBe("Ej. Av. Larco 345, Miraflores");
  });

  it("sin contradicción: el ejemplo de una tienda nunca trae la ciudad ni la dirección de otra", () => {
    const direcciones = new Map(DE_CAYLA.map(([n, c]) => [c, sugerirDireccion(n)]));
    for (const [nombre, ciudad] of DE_CAYLA) {
      for (const [otraCiudad, otraDireccion] of direcciones) {
        if (otraCiudad === ciudad) continue;
        expect(sugerirNombreWeb(nombre)).not.toContain(otraCiudad);
        expect(sugerirDireccion(nombre)).not.toBe(otraDireccion);
      }
    }
  });

  it("una tienda nueva toma su propio nombre, sin inventarle una calle de otra ciudad", () => {
    expect(sugerirNombreWeb("Tienda Chiclayo")).toBe("Ej. Chiclayo");
    expect(sugerirNombreWeb("Outlet Centro")).toBe("Ej. Outlet Centro");
    for (const nombre of NUEVAS) expect(sugerirDireccion(nombre)).toBe(DIRECCION_NEUTRA);
  });

  it("sin un nombre que se lea, el neutro: no promete nada", () => {
    for (const nombre of SIN_NOMBRE) {
      expect(sugerirNombreWeb(nombre)).toBe(NOMBRE_NEUTRO);
      expect(sugerirDireccion(nombre)).toBe(DIRECCION_NEUTRA);
    }
  });

  it("sigue al control y es estable: A → B → A da lo mismo que A", () => {
    const a = [sugerirNombreWeb("Tienda TRU"), sugerirDireccion("Tienda TRU")];
    sugerirNombreWeb("Tienda AQP");
    sugerirDireccion("Tienda AQP");
    expect([sugerirNombreWeb("Tienda TRU"), sugerirDireccion("Tienda TRU")]).toEqual(a);
  });
});

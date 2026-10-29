import { describe, expect, it } from "vitest";
import type { SedeTelar } from "./finanzas-telar-reglas";
import { sedeDeLaCabecera } from "./impuestos-telar-reglas";

describe("sedeDeLaCabecera", () => {
  const sedes: SedeTelar[] = [
    { clave: "u-lim", nombre: "Lima", color: "lim" },
    { clave: "empresa", nombre: "Empresa", color: "emp" },
  ];
  it("todas, una sede, la empresa y una sede que ya no existe", () => {
    expect(sedeDeLaCabecera("todas", sedes)).toBe("Todas las sedes");
    expect(sedeDeLaCabecera("u-lim", sedes)).toBe("Lima");
    expect(sedeDeLaCabecera("empresa", sedes)).toBe("Empresa");
    expect(sedeDeLaCabecera("u-vieja", sedes)).toBe("Todas las sedes");
  });
});

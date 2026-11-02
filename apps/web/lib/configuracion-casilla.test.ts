import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VISTO_MS, cambioLaCasilla } from "./configuracion-casilla";

describe("la casilla de Configuración ▸ Tiendas", () => {
  it("solo guarda si el número cambió (los espacios de los bordes no cuentan)", () => {
    expect(cambioLaCasilla("3800", "3800")).toBe(false);
    expect(cambioLaCasilla(" 3800 ", "3800")).toBe(false);
    expect(cambioLaCasilla("", "")).toBe(false);
    expect(cambioLaCasilla("4200", "3800")).toBe(true);
    // Vaciarla también es un cambio: la tienda queda sin meta ese día.
    expect(cambioLaCasilla("", "3800")).toBe(true);
    expect(cambioLaCasilla("21:00", "")).toBe(true);
  });

  it("el ✓ vive lo mismo que su animación del CSS", () => {
    const css = readFileSync(join(__dirname, "../app/estilos/vidrio/campos-y-botones.css"), "utf8");
    const regla = css.match(/\.cfg-casilla-visto\s*\{[^}]*\}/)?.[0] ?? "";
    expect(regla, "falta la regla .cfg-casilla-visto en campos-y-botones.css").not.toBe("");
    const duracion = regla.match(/animation:\s*cfg-visto\s+(\d+)ms/)?.[1];
    expect(Number(duracion)).toBe(VISTO_MS);
  });
});

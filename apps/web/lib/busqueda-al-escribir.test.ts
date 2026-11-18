import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PAUSA_BUSQUEDA_MS, terminoParaBuscar } from "@cayla-retail/shared/busqueda";
import { describe, expect, it } from "vitest";
import { cambiosTipeados } from "./productos-filtros";

describe("lo que se manda a buscar", () => {
  it("una letra sola todavía no busca, con o sin tilde", () => {
    expect(terminoParaBuscar("a")).toBe("");
    expect(terminoParaBuscar(" ñ ")).toBe("");
    expect(terminoParaBuscar("á")).toBe("");
  });

  it("desde dos caracteres se busca, sin los espacios de los bordes", () => {
    expect(terminoParaBuscar("bl")).toBe("bl");
    expect(terminoParaBuscar("  blusa roja ")).toBe("blusa roja");
  });

  it("un número solo sí se busca: es el número de una orden", () => {
    expect(terminoParaBuscar("7")).toBe("7");
  });

  it("vacío sigue siendo vacío, y respeta el largo máximo", () => {
    expect(terminoParaBuscar("   ")).toBe("");
    expect(terminoParaBuscar("abcdef", 3)).toBe("abc");
  });

  it("la pausa no baja de lo que tarda en dejar de teclear una persona", () => {
    expect(PAUSA_BUSQUEDA_MS).toBeGreaterThanOrEqual(300);
  });
});

describe("Productos sigue la misma regla", () => {
  it("una letra no cambia la URL; dos sí", () => {
    expect(cambiosTipeados("", { q: "a" })).toEqual({});
    expect(cambiosTipeados("", { q: "bl" })).toEqual({ q: "bl" });
  });

  it("borrar hasta quedar con una letra vuelve a la lista sin buscar", () => {
    expect(cambiosTipeados("q=bl", { q: "b" })).toEqual({ q: "" });
  });
});

function archivosDe(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivosDe(ruta);
    return /\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe("la pausa vive en un solo lugar", () => {
  it("un buscador nuevo usa useBuscarAlEscribir, no su propio temporizador", () => {
    const quienesNavegan = archivosDe(join(__dirname, "..", "components"))
      .filter((ruta) => /\buseBusquedaEnUrl\(\)/.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.slice(ruta.lastIndexOf("components") + "components/".length))
      .sort();
    // Productos se queda con lo suyo porque su pausa también cubre las cajas de precio.
    expect(quienesNavegan).toEqual(["FiltrosProductos.tsx", "ui/BusquedaEnUrl.tsx"]);
  });
});

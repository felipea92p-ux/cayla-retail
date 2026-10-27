import { describe, expect, it } from "vitest";
import { estadoAnotada, lineasAnotadas, nombreAnotado, siguienteAnotada } from "./recibir-papel-reglas";
import type { LineaParaContar } from "./recepcion-conteo-reglas";

const linea = (clave: string, dijeron: number, contadas: number | null, extra: Partial<NonNullable<LineaParaContar["linea"]>> = {}): LineaParaContar =>
  ({
    clave,
    dijeron,
    categoria: { id: "c", nombre: "Blusas", prefijo: "BL", familia: null },
    marca: null,
    proveedor: null,
    linea: { id: clave, compraItemId: `ci-${clave}`, descripcion: null, prendaElegida: null, enviado: dijeron, ...extra },
    conteo: contadas === null ? null : { contadas },
  }) as unknown as LineaParaContar;

describe("recibir mirando el papel", () => {
  it("lo anotado es la guía del envío; lo que la tienda agrega fuera de la guía no", () => {
    const fuera = { ...linea("x", 0, 2), linea: null, dijeron: null } as LineaParaContar;
    expect(lineasAnotadas([linea("a", 12, null), fuera, linea("y", 3, null, { compraItemId: null })]).map((l) => l.clave)).toEqual(["a", "y"]);
  });
  it("cada una dice cómo va", () => {
    expect(estadoAnotada(linea("a", 12, null))).toBe("pendiente");
    expect(estadoAnotada(linea("a", 12, 12))).toBe("contada");
    expect(estadoAnotada(linea("a", 12, 14))).toBe("contada");
    expect(estadoAnotada(linea("a", 12, 10))).toBe("a-medias");
    expect(estadoAnotada(linea("a", 12, 0))).toBe("a-medias");
  });
  it("se llama como la eligió o la escribió la compradora; si no, por su categoría", () => {
    expect(nombreAnotado(linea("a", 1, null, { prendaElegida: { productoId: "p", nombre: "Blusa Emma", codigo: null } }))).toBe("Blusa Emma");
    expect(nombreAnotado(linea("a", 1, null, { descripcion: "Casaca nueva" }))).toBe("Casaca nueva");
    expect(nombreAnotado(linea("a", 1, null))).toBe("Blusas");
  });
  it("la que sigue salta las contadas y las que van a medias; sin ninguna por contar, no hay", () => {
    expect(siguienteAnotada([linea("a", 12, 12), linea("b", 20, 5), linea("c", 3, null)])?.clave).toBe("c");
    expect(siguienteAnotada([linea("a", 12, 12), linea("b", 20, null), linea("c", 3, null)])?.clave).toBe("b");
    expect(siguienteAnotada([linea("a", 12, 12), linea("b", 20, 20)])).toBeNull();
  });
});

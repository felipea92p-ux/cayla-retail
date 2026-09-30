import { describe, expect, it } from "vitest";
import { claveResponsableConteo, recordarResponsableGuardar, recordarResponsableLeer, recordarResponsableOlvidar } from "./responsable-conteo";

/** Un almacén en memoria, con la forma de `Storage` que usa el helper. */
function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

describe("responsable del conteo: se elige al abrir y se recuerda", () => {
  it("cada conteo tiene su propia clave: dos conteos no se pisan el responsable", () => {
    expect(claveResponsableConteo("a")).not.toBe(claveResponsableConteo("b"));
  });

  it("lo que se guarda al abrir lo lee la pantalla siguiente, y se olvida cuando la base rechaza al responsable", () => {
    const a = almacen();
    const clave = claveResponsableConteo("conteo-17");
    expect(recordarResponsableLeer(clave, a)).toBeNull();
    recordarResponsableGuardar(clave, "persona-angie", a);
    expect(recordarResponsableLeer(clave, a)).toBe("persona-angie");
    recordarResponsableOlvidar(clave, a);
    expect(recordarResponsableLeer(clave, a)).toBeNull();
  });

  it("un valor vacío no cuenta como responsable", () => {
    expect(recordarResponsableLeer("k", almacen({ k: "   " }))).toBeNull();
  });

  it("sin almacenamiento (ventana privada) o si este lanza, no se cae: simplemente no recuerda", () => {
    expect(recordarResponsableLeer("k", null)).toBeNull();
    expect(() => recordarResponsableGuardar("k", "p", null)).not.toThrow();
    const roto = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(recordarResponsableLeer("k", roto)).toBeNull();
    expect(() => recordarResponsableGuardar("k", "p", roto)).not.toThrow();
    expect(() => recordarResponsableOlvidar("k", roto)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { CLAVE_AVISO, guardarAviso, tomarAviso } from "./filtros-aviso";

const almacen = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const AVISO = { texto: "En Pantalones no hay talla M: quitamos esa talla.", destino: "/catalogo?sede=trujillo&categoria=PAN&color=negro", volver: "/catalogo?sede=trujillo&color=negro&talla=M" };

describe("el aviso que cruza de una página a otra", () => {
  it("se guarda al tocar y se recoge una sola vez, al llegar adonde llevaba", () => {
    const a = almacen();
    guardarAviso(a, AVISO);
    expect(a.m.has(CLAVE_AVISO)).toBe(true);
    expect(tomarAviso(a, AVISO.destino)).toEqual({ texto: AVISO.texto, volver: AVISO.volver });
    expect(a.m.has(CLAVE_AVISO)).toBe(false);
    expect(tomarAviso(a, AVISO.destino)).toBeNull();
  });

  it("si se llegó a otra parte, el aviso ya no habla de lo que se ve: se descarta (y no queda para otra visita)", () => {
    const a = almacen();
    guardarAviso(a, AVISO);
    expect(tomarAviso(a, "/catalogo?sede=lima")).toBeNull();
    expect(a.m.has(CLAVE_AVISO)).toBe(false);
  });

  it("lo que no se puede leer o no es de la tienda se descarta sin romper nada", () => {
    for (const raro of ["no es json", "null", "[]", JSON.stringify({ ...AVISO, texto: "" }), JSON.stringify({ ...AVISO, texto: "x".repeat(241) }), JSON.stringify({ ...AVISO, volver: "https://otro.sitio/" }), JSON.stringify({ texto: 3 })]) {
      const a = almacen();
      a.setItem(CLAVE_AVISO, raro);
      expect(tomarAviso(a, AVISO.destino), raro).toBeNull();
      expect(a.m.has(CLAVE_AVISO), raro).toBe(false);
    }
  });

  it("sin almacén (ventana privada, bloqueado) no se cae: el aviso solo no cruza", () => {
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
    expect(() => guardarAviso(roto, AVISO)).not.toThrow();
    expect(tomarAviso(roto, AVISO.destino)).toBeNull();
  });
});

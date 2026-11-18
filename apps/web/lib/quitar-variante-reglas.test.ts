import { describe, expect, it } from "vitest";
import { queHaceAlQuitar, totalDelEje } from "./quitar-variante-reglas";
import type { EstadoVariante, FilaFicha } from "./variantes-ficha-reglas";

const SEDE = "lima";
const guardada = (id: string): FilaFicha => ({ clave: id, id, colorCodigo: "BEI", tallaId: "S", guardada: { colorCodigo: "BEI", tallaId: "S" }, activo: true }) as unknown as FilaFicha;
const nueva = (clave: string): FilaFicha => ({ clave, id: null, colorCodigo: "CAM", tallaId: "S", guardada: null, activo: true }) as unknown as FilaFicha;
const estado = (e: Record<string, { lima?: number; trujillo?: number }>): Record<string, EstadoVariante> =>
  Object.fromEntries(
    Object.entries(e).map(([id, s]) => [
      id,
      { stock: (s.lima ?? 0) + (s.trujillo ?? 0), apartado: 0, vendida: false, sedes: [...(s.lima ? [{ ubicacionId: SEDE, nombre: "Tienda Lima", cantidad: s.lima }] : []), ...(s.trujillo ? [{ ubicacionId: "tru", nombre: "Tienda Trujillo", cantidad: s.trujillo }] : [])] },
    ])
  );

describe("quitar un color o una talla: solo se archiva con 0 unidades", () => {
  it("lo que todavía no existe se quita sin rastro", () => {
    expect(queHaceAlQuitar([nueva("a"), nueva("b")], estado({}), SEDE)).toEqual({ tipo: "directo" });
  });

  it("con 0 unidades en todas las sedes se pide confirmar el archivado", () => {
    expect(queHaceAlQuitar([guardada("v1"), guardada("v2")], estado({ v1: {}, v2: {} }), SEDE)).toEqual({ tipo: "confirmar", sinDato: false });
  });

  it("con unidades en esta sede se bloquea y manda a ajustar la primera variante que las tiene", () => {
    const q = queHaceAlQuitar([guardada("v1"), guardada("v2")], estado({ v1: {}, v2: { lima: 5 } }), SEDE);
    expect(q).toMatchObject({ tipo: "bloqueado", enEstaSede: 5, varianteParaAjustar: "v2", enOtrasSedes: [] });
  });

  it("con unidades solo en otra sede se bloquea, dice dónde y no ofrece ajustar desde aquí", () => {
    const q = queHaceAlQuitar([guardada("v1")], estado({ v1: { trujillo: 3 } }), SEDE);
    expect(q).toEqual({ tipo: "bloqueado", enEstaSede: 0, enOtrasSedes: [{ nombre: "Tienda Trujillo", cantidad: 3 }], varianteParaAjustar: null });
    if (q.tipo === "bloqueado") expect(totalDelEje(q)).toBe(3);
  });

  it("suma las sedes: el total es el de todas", () => {
    const q = queHaceAlQuitar([guardada("v1"), guardada("v2")], estado({ v1: { lima: 2, trujillo: 1 }, v2: { lima: 4 } }), SEDE);
    if (q.tipo !== "bloqueado") throw new Error("debía bloquear");
    expect(q.enEstaSede).toBe(6);
    expect(totalDelEje(q)).toBe(7);
  });

  it("sin la lectura del stock no se sabe: no se bloquea (se degrada con gracia) y se confirma", () => {
    expect(queHaceAlQuitar([guardada("v1")], null, SEDE)).toEqual({ tipo: "confirmar", sinDato: true });
  });

  it("una cuenta que no ajusta stock no recibe una variante para ajustar, pero igual se bloquea", () => {
    const q = queHaceAlQuitar([guardada("v1")], estado({ v1: { lima: 2 } }), null);
    expect(q).toMatchObject({ tipo: "bloqueado", enEstaSede: 0, varianteParaAjustar: null });
  });

  it("una variante que no sale en la lectura cuenta como sin unidades, no rompe", () => {
    expect(queHaceAlQuitar([guardada("v1"), guardada("fuera")], estado({ v1: {} }), SEDE)).toEqual({ tipo: "confirmar", sinDato: false });
  });
});

import { describe, expect, it } from "vitest";
import { conteoResumenDesdeFila, type ConteoResumen, type FilaResumenConteo } from "./conteo-reglas";
import { sufijoVariantes, textoAvanceHistorial, textoFaltaElegir, textoUltimoConteo } from "./conteo-inicio-reglas";

const NOMBRES = new Map<string, string>();

function conteo(p: Partial<FilaResumenConteo> & { id: string; numero: number }): ConteoResumen {
  return conteoResumenDesdeFila(
    {
      estado: "cerrado",
      created_at: "2026-09-28T14:00:00Z",
      cerrado_en: "2026-09-28T16:00:00Z",
      sububicacion_id: "piso",
      sububicacion_nombre: "Piso de venta",
      sububicacion_tipo: "piso_venta",
      alcance: "todo",
      alcance_categoria_nombre: null,
      abierto_por: null,
      cerrado_por: null,
      lineas: 10,
      lineas_con_diferencia: 0,
      sistema: 10,
      contado: 10,
      diferencia: 0,
      pendientes: 0,
      parcial: false,
      ...p,
    },
    NOMBRES
  );
}

describe("textoUltimoConteo", () => {
  it("dice el número y el día (en Lima) del último conteo terminado de ese lugar", () => {
    const c = [conteo({ id: "a", numero: 12, cerrado_en: "2026-09-29T03:30:00Z" })];
    // 03:30 UTC es las 22:30 del 28/09 en Lima: el día es el de allá.
    expect(textoUltimoConteo(c, "piso")).toBe("Último conteo: 12 · 28/09");
  });

  it("no mezcla el piso con el almacén", () => {
    const c = [conteo({ id: "a", numero: 12, sububicacion_id: "almacen" })];
    expect(textoUltimoConteo(c, "piso")).toBe("Nunca se contó");
    expect(textoUltimoConteo(c, "almacen")).toMatch(/^Último conteo: 12/);
  });

  it("un cancelado, uno cerrado sin verificar nada y uno en curso no cuentan como «último»", () => {
    const c = [
      conteo({ id: "en-curso", numero: 15, estado: "abierto", cerrado_en: null, lineas: 3, pendientes: 20 }),
      conteo({ id: "anulado", numero: 14, estado: "anulado", cerrado_en: null }),
      conteo({ id: "legado-vacio", numero: 13, lineas: 0, sistema: 0, contado: 0 }),
      conteo({ id: "bueno", numero: 11 }),
    ];
    expect(textoUltimoConteo(c, "piso")).toMatch(/^Último conteo: 11/);
  });

  it("un conteo parcial sí cuenta: verificó una parte", () => {
    const c = [conteo({ id: "p", numero: 9, pendientes: 5, parcial: true })];
    expect(textoUltimoConteo(c, "piso")).toMatch(/^Último conteo: 9/);
  });

  it("sin historial dice «Nunca se contó»; con el historial lleno no afirma tanto", () => {
    expect(textoUltimoConteo([], "piso")).toBe("Nunca se contó");
    const lleno = Array.from({ length: 3 }, (_, i) => conteo({ id: `x${i}`, numero: i + 1, sububicacion_id: "almacen" }));
    expect(textoUltimoConteo(lleno, "piso", 3)).toBe("Sin conteo reciente");
    expect(textoUltimoConteo(lleno, "piso", 20)).toBe("Nunca se contó");
  });
});

describe("textoAvanceHistorial", () => {
  it("un conteo terminado dice cuántas variantes verificó, con su singular", () => {
    expect(textoAvanceHistorial(conteo({ id: "a", numero: 1, lineas: 37 }))).toBe("37 variantes verificadas");
    expect(textoAvanceHistorial(conteo({ id: "a", numero: 1, lineas: 1 }))).toBe("1 variante verificada");
  });

  it("uno en curso o parcial dice «X de Y»", () => {
    expect(textoAvanceHistorial(conteo({ id: "a", numero: 1, estado: "abierto", cerrado_en: null, lineas: 18, pendientes: 19 }))).toBe("18 de 37 variantes verificadas");
    expect(textoAvanceHistorial(conteo({ id: "a", numero: 1, lineas: 30, pendientes: 7, parcial: true }))).toBe("30 de 37 variantes verificadas");
  });

  it("uno cancelado no dice nada: lo contado se perdió", () => {
    expect(textoAvanceHistorial(conteo({ id: "a", numero: 1, estado: "anulado", lineas: 12 }))).toBeNull();
    expect(textoAvanceHistorial(conteo({ id: "a", numero: 1, lineas: 0 }))).toBeNull();
  });
});

describe("textoFaltaElegir", () => {
  it("une lo que falta como se dice en voz alta", () => {
    expect(textoFaltaElegir([])).toBeNull();
    expect(textoFaltaElegir(["dónde vas a contar"])).toBe("Falta elegir dónde vas a contar.");
    expect(textoFaltaElegir(["dónde vas a contar", "quién cuenta"])).toBe("Falta elegir dónde vas a contar y quién cuenta.");
    expect(textoFaltaElegir(["dónde vas a contar", "la categoría", "quién cuenta"])).toBe("Falta elegir dónde vas a contar, la categoría y quién cuenta.");
  });
});

describe("sufijoVariantes", () => {
  it("arrastra las prendas de «Contar esta prenda» a la ruta del conteo", () => {
    expect(sufijoVariantes([])).toBe("");
    expect(sufijoVariantes(["a"])).toBe("?variantes=a");
    expect(sufijoVariantes(["a", "b"])).toBe("?variantes=a,b");
  });
});

import { describe, expect, it } from "vitest";
import {
  construirRankingNumeroVentas,
  construirRankingSolesPorHora,
  contraerSolesPorHora,
  esMuestraChica,
  UMBRAL_MUESTRA_VENTAS,
  type FilaRendimientoCruda,
} from "./rendimiento-reglas";

function fila(p: Partial<FilaRendimientoCruda> & { personaId: string }): FilaRendimientoCruda {
  return {
    nombre: p.personaId,
    esEncargada: false,
    ventas: 0,
    soles: 0,
    horas: null,
    ...p,
  };
}

describe("esMuestraChica (D-66)", () => {
  it("es chica justo debajo del umbral y deja de serlo en el umbral", () => {
    expect(esMuestraChica(UMBRAL_MUESTRA_VENTAS - 1)).toBe(true);
    expect(esMuestraChica(UMBRAL_MUESTRA_VENTAS)).toBe(false);
    expect(esMuestraChica(0)).toBe(true);
  });
});

describe("contraerSolesPorHora", () => {
  it("encoge hacia el RESTO de la tienda (sin la propia persona), no hacia el total con ella adentro", () => {
    // A: 8 horas, S/400 (S/50/h, un mes de suerte con poca evidencia).
    // B: 160 horas, S/2880 (S/18/h, un mes normal con mucha evidencia).
    const filas = [
      fila({ personaId: "A", horas: 8, soles: 400, ventas: 5 }),
      fila({ personaId: "B", horas: 160, soles: 2880, ventas: 80 }),
    ];
    const contraidos = contraerSolesPorHora(filas);

    // El resto de A es solo B: promedioResto_A = 2880/160 = 18. El resto de B es solo A:
    // promedioResto_B = 400/8 = 50. horasPrior = 40 / (85/168) ≈ 79,07.
    const horasPrior = UMBRAL_MUESTRA_VENTAS / (85 / 168);
    const esperadoA = (8 * 50 + horasPrior * 18) / (8 + horasPrior);
    const esperadoB = (160 * 18 + horasPrior * 50) / (160 + horasPrior);

    expect(contraidos.get("A")).toBeCloseTo(esperadoA, 6);
    expect(contraidos.get("B")).toBeCloseTo(esperadoB, 6);

    // A (poca evidencia) se acerca mucho a 18 (el resto); B (mucha evidencia) casi no se
    // mueve de su propio 18. La contracción de A es mucho más fuerte que la de B.
    expect(contraidos.get("A")!).toBeLessThan(50);
    expect(contraidos.get("A")! - 18).toBeLessThan(50 - 18);
    expect(Math.abs(contraidos.get("B")! - 18)).toBeLessThan(Math.abs(50 - 18));

    // Con esta evidencia tan dispareja, B —el mes normal y sostenido— termina ordenado
    // adelante de A —el mes corto con un golpe de suerte—, aunque el crudo de A sea mayor.
    expect(contraidos.get("B")!).toBeGreaterThan(contraidos.get("A")!);
  });

  it("no contrae a quien no tiene con quién compararse (sola con horas en su tienda)", () => {
    const filas = [
      fila({ personaId: "solaConHoras", horas: 40, soles: 800, ventas: 20 }),
      fila({ personaId: "sinHoras", horas: null, soles: 100, ventas: 3 }),
    ];
    expect(contraerSolesPorHora(filas).has("solaConHoras")).toBe(false);
  });

  it("da un mapa vacío si nadie en la tienda tiene horas", () => {
    const filas = [
      fila({ personaId: "A", horas: null, soles: 500, ventas: 10 }),
      fila({ personaId: "B", horas: 0, soles: 300, ventas: 5 }),
    ];
    expect(contraerSolesPorHora(filas).size).toBe(0);
  });

  it("con ritmo de la tienda en cero (nadie con horas vendió), no revienta: usa las horas totales como prior", () => {
    const filas = [
      fila({ personaId: "A", horas: 20, soles: 100, ventas: 0 }),
      fila({ personaId: "B", horas: 30, soles: 200, ventas: 0 }),
    ];
    expect(() => contraerSolesPorHora(filas)).not.toThrow();
    expect(contraerSolesPorHora(filas).size).toBe(2);
  });
});

describe("construirRankingSolesPorHora", () => {
  it("ordena por el número contraído, manda sin horas al final marcadas, y excluye a quien no vendió", () => {
    const filas = [
      fila({ personaId: "nueva", nombre: "Nueva", horas: 8, soles: 400, ventas: 5 }),
      fila({ personaId: "veterana", nombre: "Veterana", horas: 160, soles: 2880, ventas: 80 }),
      fila({ personaId: "sinHoras", nombre: "Sin horas", horas: null, soles: 200, ventas: 10 }),
      fila({ personaId: "noVendio", nombre: "No vendió", horas: 100, soles: 0, ventas: 0 }),
    ];
    const ranking = construirRankingSolesPorHora(filas);

    expect(ranking.map((f) => f.personaId)).toEqual(["veterana", "nueva", "sinHoras"]);
    expect(ranking.find((f) => f.personaId === "sinHoras")!.sinHoras).toBe(true);
    expect(ranking.find((f) => f.personaId === "sinHoras")!.solesPorHoraContraido).toBeNull();
    expect(ranking.find((f) => f.personaId === "nueva")!.muestraChica).toBe(true);
    expect(ranking.find((f) => f.personaId === "veterana")!.muestraChica).toBe(false);
    // El crudo se conserva sin tocar, para que la tabla siga mostrando el número real.
    expect(ranking.find((f) => f.personaId === "nueva")!.solesPorHoraCrudo).toBeCloseTo(50, 6);
  });
});

describe("construirRankingNumeroVentas", () => {
  it("ordena por el conteo CRUDO, sin contraer, y funciona sin ninguna hora en la tienda", () => {
    const filas = [
      fila({ personaId: "A", nombre: "A", horas: null, soles: 900, ventas: 30 }),
      fila({ personaId: "B", nombre: "B", horas: null, soles: 300, ventas: 45 }),
      fila({ personaId: "C", nombre: "C", horas: null, soles: 0, ventas: 0 }),
    ];
    const ranking = construirRankingNumeroVentas(filas);

    expect(ranking.map((f) => f.personaId)).toEqual(["B", "A"]);
    expect(ranking.find((f) => f.personaId === "A")!.muestraChica).toBe(true); // 30 < 40
    expect(ranking.find((f) => f.personaId === "B")!.muestraChica).toBe(false); // 45 >= 40
  });
});

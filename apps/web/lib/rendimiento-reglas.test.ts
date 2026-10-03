import { describe, expect, it } from "vitest";
import {
  construirRankingNumeroVentas,
  construirRankingSolesPorHora,
  contraerSolesPorHora,
  cotaPrudente,
  CV_TICKET,
  esMuestraChica,
  UMBRAL_MUESTRA_VENTAS,
  Z_COTA_PRUDENTE,
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
  it("encoge hacia el promedio de TODA la tienda (con la persona adentro), tanto más cuanto menos evidencia", () => {
    // A: 8 horas, S/400 (S/50/h, un mes de suerte con poca evidencia).
    // B: 160 horas, S/2880 (S/18/h, un mes normal con mucha evidencia).
    const filas = [
      fila({ personaId: "A", horas: 8, soles: 400, ventas: 5 }),
      fila({ personaId: "B", horas: 160, soles: 2880, ventas: 80 }),
    ];
    const contraidos = contraerSolesPorHora(filas);

    // El centro es el promedio de toda la tienda: 3280 / 168 ≈ 19,52. horasPrior = 40 / (85/168) ≈ 79,07.
    const promedioTienda = 3280 / 168;
    const horasPrior = UMBRAL_MUESTRA_VENTAS / (85 / 168);
    expect(contraidos.get("A")).toBeCloseTo((8 * 50 + horasPrior * promedioTienda) / (8 + horasPrior), 6);
    expect(contraidos.get("B")).toBeCloseTo((160 * 18 + horasPrior * promedioTienda) / (160 + horasPrior), 6);

    // A (poca evidencia) se acerca mucho al centro; B (mucha evidencia) casi no se mueve de su propio 18.
    expect(Math.abs(contraidos.get("A")! - promedioTienda)).toBeLessThan(Math.abs(50 - promedioTienda));
    expect(Math.abs(contraidos.get("B")! - 18)).toBeLessThan(Math.abs(contraidos.get("A")! - 50));

    // El número contraído de la veterana queda cerca de lo que vende (antes, con el centro en «el resto», salía 28,58 por un 18 real).
    expect(contraidos.get("B")!).toBeLessThan(20);
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

describe("construirRankingSolesPorHora: el orden respeta al crudo cuando la exposición es la misma (ADR-0318, «El centro de la contracción»)", () => {
  // Antes del 2026-10-03, con el centro en «el resto», 100 h y 30 ventas cada una, crudo 15 y 9, salían 11,57 y 12,43: invertido.
  it("con las MISMAS horas y las MISMAS ventas, quien tiene el crudo más alto no queda por debajo de quien lo tiene más bajo", () => {
    const crudos = ["A", "E", "C", "D", "B"]; // de mayor a menor crudo: 90, 80, 75, 70, 60 por venta
    const montos: Record<string, number> = { A: 90, E: 80, C: 75, D: 70, B: 60 };
    for (const personas of [2, 3, 5]) {
      for (const horas of [60, 100, 150, 200]) {
        for (const ventas of [1, 5, 10, 20, 30, 40, 60, 80]) {
          const filas = crudos.slice(0, personas).map((id) => fila({ personaId: id, horas, ventas, soles: ventas * montos[id] }));
          const orden = construirRankingSolesPorHora(filas).map((f) => f.personaId);
          expect(orden, `${personas} personas · ${horas} h · ${ventas} ventas c/u`).toEqual(crudos.slice(0, personas).filter((id) => orden.includes(id)));
        }
      }
    }
  });

  it("el caso que lo mostró: 100 h y 30 ventas c/u, crudo 15 y 9, queda en el orden del crudo y con números cerca de lo real", () => {
    const r = construirRankingSolesPorHora([
      fila({ personaId: "a", horas: 100, ventas: 30, soles: 1500 }),
      fila({ personaId: "b", horas: 100, ventas: 30, soles: 900 }),
    ]);
    expect(r.map((f) => f.personaId)).toEqual(["a", "b"]);
    expect(r[0].solesPorHoraContraido).toBeCloseTo(13.29, 2);
    expect(r[1].solesPorHoraContraido).toBeCloseTo(10.71, 2);
  });
});

describe("construirRankingSolesPorHora: ordena por la cota prudente, muestra el número contraído (opción C, Felipe 2026-10-03)", () => {
  const nueva = fila({ personaId: "nueva", nombre: "Nueva", horas: 8, soles: 400, ventas: 5 });
  const veterana = fila({ personaId: "veterana", nombre: "Veterana", horas: 160, soles: 2880, ventas: 80 });

  it("la veterana con mucha evidencia queda adelante de la nueva con una racha de suerte, aunque el número contraído de la nueva sea mayor", () => {
    const r = construirRankingSolesPorHora([nueva, veterana]);
    expect(r.map((f) => f.personaId)).toEqual(["veterana", "nueva"]);
    const n = r.find((f) => f.personaId === "nueva")!;
    const v = r.find((f) => f.personaId === "veterana")!;
    // Lo que se MUESTRA es el contraído (la nueva, mayor); lo que ORDENA es la cota (la veterana, mayor).
    expect(n.solesPorHoraContraido!).toBeGreaterThan(v.solesPorHoraContraido!);
    expect(v.cotaPrudente!).toBeGreaterThan(n.cotaPrudente!);
    expect(v.cotaPrudente).toBeCloseTo(13.73, 2);
    expect(n.cotaPrudente).toBeCloseTo(12.91, 2);
  });

  it("el número mostrado no cambia por ordenar con la cota: sigue siendo el contraído, y el crudo sigue intacto", () => {
    const r = construirRankingSolesPorHora([nueva, veterana]);
    const n = r.find((f) => f.personaId === "nueva")!;
    expect(n.solesPorHoraCrudo).toBeCloseTo(50, 6);
    expect(n.solesPorHoraContraido).toBeCloseTo(22.32, 2);
  });

  it("la cota nunca supera al número contraído y nunca es negativa", () => {
    for (const ventas of [1, 2, 5, 40, 200]) {
      const r = construirRankingSolesPorHora([
        fila({ personaId: "x", horas: 50, ventas, soles: ventas * 70 }),
        fila({ personaId: "y", horas: 50, ventas: 30, soles: 30 * 60 }),
      ]);
      for (const f of r) {
        expect(f.cotaPrudente!).toBeGreaterThanOrEqual(0);
        expect(f.cotaPrudente!).toBeLessThanOrEqual(f.solesPorHoraContraido!);
      }
    }
  });

  it("quien no tiene horas va al final sin cota, como antes", () => {
    const r = construirRankingSolesPorHora([fila({ personaId: "s", horas: null, ventas: 9, soles: 900 }), veterana]);
    expect(r.map((f) => f.personaId)).toEqual(["veterana", "s"]);
    expect(r[1].cotaPrudente).toBeNull();
  });

  it("sola con horas en su tienda: sin contraer, con cota calculada solo con sus ventas (sin prior)", () => {
    const [f] = construirRankingSolesPorHora([fila({ personaId: "sola", horas: 100, ventas: 50, soles: 3000 })]);
    expect(f.solesPorHoraContraido).toBeCloseTo(30, 6);
    expect(f.cotaPrudente).toBeCloseTo(30 * (1 - Z_COTA_PRUDENTE * Math.sqrt((1 + CV_TICKET ** 2) / 50)), 6);
  });

  it("un empate exacto conserva el orden en que llegó (la RPC ordena por tienda y nombre: es determinista)", () => {
    const x = fila({ personaId: "x", nombre: "X", horas: 50, ventas: 10, soles: 1000 });
    const y = fila({ personaId: "y", nombre: "Y", horas: 50, ventas: 10, soles: 1000 });
    expect(construirRankingSolesPorHora([x, y]).map((f) => f.personaId)).toEqual(["x", "y"]);
    expect(construirRankingSolesPorHora([y, x]).map((f) => f.personaId)).toEqual(["y", "x"]);
  });
});

describe("cotaPrudente", () => {
  it("con más evidencia, la cota queda más cerca del número (menos penalización)", () => {
    const pocas = cotaPrudente(20, 10, true);
    const muchas = cotaPrudente(20, 200, true);
    expect(muchas).toBeGreaterThan(pocas);
    expect(muchas).toBeLessThan(20);
  });
  it("sin ventas o sin número, 0 (no se divide por cero ni sale un valor inventado)", () => {
    expect(cotaPrudente(20, 0, false)).toBe(0);
    expect(cotaPrudente(0, 30, true)).toBe(0);
    expect(cotaPrudente(Number.NaN, 30, true)).toBe(0);
  });
  it("quien no se contrajo (sin prior) se penaliza más que quien sí, con las mismas ventas", () => {
    expect(cotaPrudente(20, 10, false)).toBeLessThan(cotaPrudente(20, 10, true));
  });
  it("con 1 sola venta y sin prior, la penalización la deja en 0 (una venta no dice nada)", () => {
    expect(cotaPrudente(20, 1, false)).toBe(0);
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

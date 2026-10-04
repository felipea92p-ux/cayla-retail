import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  colgadasQueNoSonRopa,
  explicarCapacidadPiso,
  FAMILIAS_FUERA_DEL_RIEL,
  leerCapacidadPiso,
  notaCapacidadPiso,
  type CapacidadPiso,
} from "./capacidad-piso";

// Lo que devuelve `fn_capacidad_piso` por PostgREST: un arreglo de 0 o 1 filas, con los numeric como número.
const TRU = { m2_sala: 20, densidad: 30, capacidad: 600, provisional: false, contada_el: "2026-09-30", version: 1, cuadrado_en: null };
const AQP = { m2_sala: 60, densidad: 30, capacidad: 1800, provisional: true, contada_el: null, version: 1, cuadrado_en: null };
const CUADRE = "2026-10-12T15:30:00.123456+00:00";

describe("leer la capacidad que manda la base", () => {
  it("una fila contada y una provisional, las dos sin cuadrar (así están hoy las tres tiendas)", () => {
    expect(leerCapacidadPiso([TRU])).toEqual({ m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: null });
    expect(leerCapacidadPiso([AQP])).toEqual({ m2Sala: 60, densidad: 30, capacidad: 1800, provisional: true, cuadradoEn: null });
  });

  it("con la fecha del último cuadre, la sede queda cuadrada", () => {
    expect(leerCapacidadPiso([{ ...TRU, cuadrado_en: CUADRE }])?.cuadradoEn).toBe(CUADRE);
  });

  it("una fecha de cuadre que falta o no es fecha se lee como «por cuadrar» (del lado seguro), sin perder la capacidad", () => {
    const sinColumna: Record<string, unknown> = { ...TRU };
    delete sinColumna.cuadrado_en;
    for (const fila of [sinColumna, { ...TRU, cuadrado_en: "" }, { ...TRU, cuadrado_en: "ayer" }, { ...TRU, cuadrado_en: 20261012 }]) {
      expect(leerCapacidadPiso([fila])).toEqual({ m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: null });
    }
  });

  it("los numeric que llegan como texto también se leen (12,5 m²)", () => {
    expect(leerCapacidadPiso([{ ...TRU, m2_sala: "12.50", densidad: "30.00", capacidad: 375 }])).toEqual({
      m2Sala: 12.5,
      densidad: 30,
      capacidad: 375,
      provisional: false,
      cuadradoEn: null,
    });
  });

  it("sin fila (Taller, tienda sin medir) o sin datos: sin capacidad, nunca un 0", () => {
    expect(leerCapacidadPiso([])).toBeNull();
    expect(leerCapacidadPiso(null)).toBeNull();
    expect(leerCapacidadPiso(undefined)).toBeNull();
    expect(leerCapacidadPiso("600")).toBeNull();
  });

  it("una fila rara no se convierte en un número inventado", () => {
    expect(leerCapacidadPiso([{ ...TRU, capacidad: 0 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, capacidad: 600.5 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, capacidad: null }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, m2_sala: 0 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, densidad: "abc" }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, provisional: "false" }])).toBeNull();
  });
});

describe("la nota de «Colgadas en el piso»", () => {
  const contada: CapacidadPiso = { m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: CUADRE };
  const provisional: CapacidadPiso = { m2Sala: 60, densidad: 30, capacidad: 1800, provisional: true, cuadradoEn: CUADRE };
  const sinCuadrar = (c: CapacidadPiso): CapacidadPiso => ({ ...c, cuadradoEn: null });

  it("dice cuántas caben: «de 600» (lo que acordó la sesión de UI/UX, ADR-0331) cuando la sede ya cuadró su piso", () => {
    expect(notaCapacidadPiso(contada)).toBe("de 600");
  });

  it("marca «(provisional)» si la sede no se ha contado, sin separador de miles como el número de al lado", () => {
    expect(notaCapacidadPiso(provisional)).toBe("de 1800 (provisional)");
    expect(notaCapacidadPiso({ ...contada, m2Sala: 6, capacidad: 180, provisional: true })).toBe("de 180 (provisional)");
  });

  it("mientras la sede no cuadró su piso, «por cuadrar» (ADR-0328: hoy TRU diría «138 de 600» sobre un piso lleno)", () => {
    expect(notaCapacidadPiso(sinCuadrar(contada))).toBe("de 600 · por cuadrar");
    expect(notaCapacidadPiso(sinCuadrar(provisional))).toBe("de 1800 (provisional) · por cuadrar");
  });

  it("las cuatro combinaciones: «por cuadrar» sale si y solo si no hay fecha de cuadre; «(provisional)», si y solo si no se contó", () => {
    for (const prov of [false, true]) {
      for (const cuadradoEn of [null, CUADRE]) {
        const nota = notaCapacidadPiso({ ...contada, provisional: prov, cuadradoEn }) ?? "";
        expect(nota.startsWith("de 600")).toBe(true);
        expect(nota.includes("(provisional)")).toBe(prov);
        expect(nota.endsWith(" · por cuadrar")).toBe(cuadradoEn === null);
      }
    }
  });

  it("sin capacidad no hay nota (ni «de 0» ni «de —» ni un «por cuadrar» suelto)", () => {
    expect(notaCapacidadPiso(null)).toBeUndefined();
  });

  it("la nota y la explicación salen de la misma lectura: si una existe, la otra también", () => {
    for (const c of [contada, provisional, sinCuadrar(contada), null]) {
      expect(notaCapacidadPiso(c) === undefined).toBe(explicarCapacidadPiso(c) === undefined);
    }
  });

  it("la explicación dice de dónde sale el número, por qué es provisional y por qué está por cuadrar", () => {
    expect(explicarCapacidadPiso(contada)).toBe("Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m².");
    expect(explicarCapacidadPiso({ ...provisional, m2Sala: 12.5, capacidad: 375 })).toBe(
      "Caben unas 375 prendas colgadas: 12.5 m² de sala × 30 por m². Provisional: esta sede todavía no contó las prendas de su piso."
    );
    expect(explicarCapacidadPiso(sinCuadrar(contada))).toBe(
      "Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m². Por cuadrar: el piso de esta sede todavía no se cuadró, y el sistema puede tener como guardadas prendas que ya cuelgan."
    );
  });
});

describe("las colgadas que no son ropa (ADR-0329: la capacidad cuenta solo ropa colgada)", () => {
  const productos = [
    { id: "blusa", familia: "indumentaria" },
    { id: "aretes", familia: "bisuteria" },
    { id: "cartera", familia: "accesorios" },
    { id: "sandalia", familia: "calzado" },
    { id: "sin-familia", familia: null },
    { id: "familia-nueva", familia: "lenceria" },
  ];
  const fila = (productoId: string, pisoDisponible: number | null) => ({ productoId, pisoDisponible });

  it("suma lo libre en el piso de bisutería, accesorios y calzado; la ropa no", () => {
    expect(colgadasQueNoSonRopa([fila("blusa", 40), fila("aretes", 12), fila("cartera", 3), fila("sandalia", 2)], productos)).toBe(17);
  });

  it("lo que no se sabe no se cuenta: sin catálogo, sin familia o con una familia que un líder creó después", () => {
    const filas = [fila("aretes", 12), fila("sin-familia", 5), fila("familia-nueva", 4), fila("no-llego", 9)];
    expect(colgadasQueNoSonRopa(filas, productos)).toBe(12);
    expect(colgadasQueNoSonRopa(filas, [])).toBe(0);
  });

  it("una sede sin piso separado (null) o con un número raro no resta ni inventa", () => {
    expect(colgadasQueNoSonRopa([fila("aretes", null), fila("aretes", -2)], productos)).toBe(0);
  });

  it("las familias de la lista existen en la base y la ropa no está en ella (una errata la dejaría vacía sin avisar)", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20260918010000_familias_tabla_propia.sql", import.meta.url), "utf8");
    for (const codigo of FAMILIAS_FUERA_DEL_RIEL) expect(sql).toContain(`('${codigo}',`);
    expect(sql).toContain("('indumentaria',");
    expect(FAMILIAS_FUERA_DEL_RIEL.has("indumentaria")).toBe(false);
  });

  it("la explicación dice cuántas no son ropa, en singular y en plural, y calla si no hay ninguna", () => {
    const tru: CapacidadPiso = { m2Sala: 20, densidad: 30, capacidad: 600, provisional: false, cuadradoEn: CUADRE };
    expect(explicarCapacidadPiso(tru, 17)).toBe(
      "Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m². 17 de las colgadas no son ropa (accesorios, bisutería, calzado…): las 600 cuentan solo ropa colgada."
    );
    expect(explicarCapacidadPiso(tru, 1)).toContain(" 1 de las colgadas no es ropa (");
    expect(explicarCapacidadPiso(tru, 0)).toBe(explicarCapacidadPiso(tru));
    expect(explicarCapacidadPiso(null, 17)).toBeUndefined();
  });
});

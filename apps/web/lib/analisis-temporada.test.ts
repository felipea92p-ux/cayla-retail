import { describe, expect, it } from "vitest";
import { sumarDias } from "./fechas-lima";
import { ANIOS_TEMPORADA_MIN, lecturaDelAnio, notaDeTemporada, rangosDeTemporada, temporadaDe, type TemporadaDatos } from "./analisis-temporada";

const HOY = "2026-10-17";

/** Soles por día de MENTIRA: `base` por día en la ventana de cada año y `meta` por día de ahí a la meta. */
function dias(rangos: ReturnType<typeof rangosDeTemporada>, porAnio: Record<number, [number, number] | null>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rangos) {
    const v = porAnio[r.anio];
    if (!v) continue;
    for (let f = r.base.desde; f <= r.base.hasta; f = sumarDias(f, 1)) m.set(f, v[0]);
    for (let f = r.meta.desde; f <= r.meta.hasta; f = sumarDias(f, 1)) m.set(f, v[1]);
  }
  return m;
}

describe("las ventanas de cada año", () => {
  it("5 años hacia atrás, con el mismo día y mes; la base termina hoy y la meta empieza mañana (una sola lectura por año)", () => {
    const r = rangosDeTemporada(HOY, 17, "2026-12-25");
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ anio: 2025, base: { desde: "2025-10-01", hasta: "2025-10-17" }, meta: { desde: "2025-10-18", hasta: "2025-12-25" } });
    expect(lecturaDelAnio(r[0]!)).toEqual({ desde: "2025-10-01", hasta: "2025-12-25" });
    expect(r[4]!.anio).toBe(2021);
  });

  it("el 29-feb de un año bisiesto cae en el 28-feb del que no lo es", () => {
    const r = rangosDeTemporada("2028-02-29", 1, "2028-03-15");
    expect(r[0]!.base).toEqual({ desde: "2027-02-28", hasta: "2027-02-28" });
  });

  it("la base y la meta de cada año quedan pegadas: ningún día se pierde ni se cuenta dos veces (28 y 29 de febrero)", () => {
    for (const hoy of ["2027-02-28", "2028-02-28", "2028-02-29", "2026-10-17"]) {
      for (const r of rangosDeTemporada(hoy, 5, sumarDias(hoy, 40))) {
        expect(r.meta.desde).toBe(sumarDias(r.base.hasta, 1));
      }
    }
    // Hoy 28-feb-2027 mirando 2024 (bisiesto): el 29-feb de 2024 es el primer día de la meta, no se pierde.
    expect(rangosDeTemporada("2027-02-28", 3, "2027-03-20").find((r) => r.anio === 2024)!.meta.desde).toBe("2024-02-29");
  });
});

describe("la temporada (D5): la mediana de cuánto más se vende de hoy a la meta que en los días del ritmo", () => {
  const rangos = rangosDeTemporada(HOY, 17, "2026-12-25");

  it("con 3 o más años que sirven, el factor es la mediana y se ven el mínimo y el máximo", () => {
    const t = temporadaDe(dias(rangos, { 2025: [100, 130], 2024: [100, 110], 2023: [100, 170], 2022: [100, 120], 2021: [100, 150] }), rangos);
    expect(t).toMatchObject({ estado: "ok", anios: 5, minimo: 1.1, maximo: 1.7 });
    expect(t.estado === "ok" && t.factor).toBeCloseTo(1.3, 5);
  });

  it("con menos de 3 años, «poca historia» (Arequipa tiene 2; Lima, ninguno): la cifra base no se toca", () => {
    expect(temporadaDe(dias(rangos, { 2025: [100, 130], 2024: [100, 110] }), rangos)).toEqual({ estado: "poca_historia", anios: 2 });
    expect(temporadaDe(new Map(), rangos)).toEqual({ estado: "poca_historia", anios: 0 });
    expect(ANIOS_TEMPORADA_MIN).toBe(3);
  });

  it("un año sin ventas en alguna de las dos ventanas no cuenta (pandemia, tienda que aún no abría)", () => {
    const t = temporadaDe(dias(rangos, { 2025: [100, 130], 2024: [100, 120], 2023: [100, 140], 2022: null, 2021: [0, 90] }), rangos);
    expect(t).toMatchObject({ estado: "ok", anios: 3 });
  });

  it("un día sin venta cuenta como día: un año de venta rala no infla la temporada", () => {
    // La meta solo tiene venta la mitad de los días (justo el mínimo): 100 en esos días = 50 por día contra 100 de la base.
    const m = dias(rangos, { 2025: [100, 100], 2024: [100, 100], 2023: [100, 100] });
    for (const r of rangos) {
      let k = 0;
      for (let f = r.meta.desde; f <= r.meta.hasta; f = sumarDias(f, 1)) if (k++ % 2 === 1) m.delete(f);
    }
    const t = temporadaDe(m, rangos);
    expect(t.estado === "ok" && t.factor).toBeLessThan(0.6);
  });
});

describe("lo que se dice de la temporada", () => {
  const hasta = "hasta el 31 dic.";
  it("con historia: de dónde sale y entre qué cifras", () => {
    const t: TemporadaDatos = { estado: "ok", factor: 1.3, minimo: 1.1, maximo: 1.7, anios: 5 };
    expect(notaDeTemporada(t, hasta, "Trujillo")).toBe("Temporada: en los últimos 5 años, de aquí hasta el 31 dic. se vendió por día 30 % más que en estos días (entre 10 % más y 70 % más).");
  });

  it("sin historia o sin permiso: lo dice y el ritmo se toma plano; si la lectura falló o no hay meta fija, no repite lo que ya dicen las fallas", () => {
    expect(notaDeTemporada({ estado: "poca_historia", anios: 2 }, hasta, "Arequipa")).toBe("Sin historia suficiente de Arequipa para ver la temporada (2 años con ventas comparables): cuento con el ritmo de hoy, sin temporada.");
    expect(notaDeTemporada({ estado: "poca_historia", anios: 0 }, hasta, "Lima")).toContain("sin años con ventas comparables");
    expect(notaDeTemporada({ estado: "sin_modulo" }, hasta, "Lima")).toMatch(/no ve el historial/);
    expect(notaDeTemporada({ estado: "fallo" }, hasta, "Lima")).toBeNull();
    expect(notaDeTemporada({ estado: "sin_horizonte" }, hasta, "Lima")).toBeNull();
  });
});

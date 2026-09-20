import { describe, expect, it } from "vitest";
import { costoUnitario, semaforoMargen, ETAPAS_MUESTRA, ETAPAS_PRODUCCION } from "./produccion-reglas";

describe("semaforoMargen", () => {
  it("gana con 60% o más de margen", () => {
    expect(semaforoMargen(100, 40)?.tono).toBe("gana");
  });
  it("al filo entre 40% y 60%", () => {
    expect(semaforoMargen(100, 50)?.tono).toBe("filo");
  });
  it("pierde por debajo de 40%", () => {
    expect(semaforoMargen(100, 70)?.tono).toBe("pierde");
  });
  it("sin precio o sin costo no opina", () => {
    expect(semaforoMargen(0, 40)).toBeNull();
    expect(semaforoMargen(100, 0)).toBeNull();
  });
});

describe("costoUnitario", () => {
  it("reparte los tres costos entre las prendas, a 2 decimales como la base", () => {
    expect(costoUnitario(100, 20, 5, 3)).toBe(41.67);
  });
  it("la merma sube el unitario: menos buenas, mismo costo", () => {
    expect(costoUnitario(120, 0, 0, 12)).toBe(10);
    expect(costoUnitario(120, 0, 0, 10)).toBe(12);
  });
  it("sin prendas no divide por cero", () => {
    expect(costoUnitario(120, 0, 0, 0)).toBe(0);
  });
});

describe("etapas", () => {
  it("las claves son las que set_etapa_produccion acepta", () => {
    const claves = [...ETAPAS_MUESTRA, ...ETAPAS_PRODUCCION].map((e) => e.clave);
    expect(claves).toEqual(["patronaje", "muestra", "escalado", "corte", "confeccion", "acabado"]);
  });
});

import {
  COLUMNAS_TABLERO,
  DIAS_ENTREGA_PRONTO,
  claveCelda,
  desgloseCosto,
  estadoEntrega,
  etapaActual,
  etapasDe,
  matrizDeLineas,
  posicionEnMedidor,
  resumenTablero,
  segundas,
  totalBuenas,
} from "./produccion-reglas";

describe("etapaActual", () => {
  it("es la primera etapa sin marcar como hecha", () => {
    expect(etapaActual({}, false)).toBe("corte");
    expect(etapaActual({ corte: "hecho" }, false)).toBe("confeccion");
    expect(etapaActual({ corte: "hecho", confeccion: "hecho" }, false)).toBe("acabado");
  });
  it("una etapa tercerizada sigue en curso: la prenda no volvió", () => {
    expect(etapaActual({ corte: "hecho", confeccion: "tercerizado" }, false)).toBe("confeccion");
  });
  it("todas hechas: lista para cerrar", () => {
    expect(etapaActual({ corte: "hecho", confeccion: "hecho", acabado: "hecho" }, false)).toBe("listo");
  });
  it("una muestra recorre otras etapas", () => {
    expect(etapaActual({}, true)).toBe("patronaje");
    expect(etapaActual({ patronaje: "hecho", muestra: "hecho", escalado: "hecho" }, true)).toBe("listo");
    expect(etapasDe(true)).toBe(ETAPAS_MUESTRA);
    expect(etapasDe(false)).toBe(ETAPAS_PRODUCCION);
  });
  it("las columnas del tablero son las etapas de producción más «listo», en orden", () => {
    expect(COLUMNAS_TABLERO.map((c) => c.clave)).toEqual([...ETAPAS_PRODUCCION.map((e) => e.clave), "listo"]);
  });
});

describe("estadoEntrega", () => {
  const hoy = "2026-09-19";
  it("sin fecha no opina", () => {
    expect(estadoEntrega(null, hoy)).toEqual({ tipo: "sin_fecha" });
  });
  it("una fecha pasada está vencida, con los días que lleva", () => {
    expect(estadoEntrega("2026-09-18", hoy)).toEqual({ tipo: "vencida", dias: 1 });
    expect(estadoEntrega("2026-09-09", hoy)).toEqual({ tipo: "vencida", dias: 10 });
  });
  it(`hoy y hasta ${DIAS_ENTREGA_PRONTO} días antes avisa «pronto»`, () => {
    expect(estadoEntrega("2026-09-19", hoy)).toEqual({ tipo: "pronto", dias: 0 });
    expect(estadoEntrega("2026-09-21", hoy)).toEqual({ tipo: "pronto", dias: 2 });
  });
  it("más allá es holgada", () => {
    expect(estadoEntrega("2026-09-22", hoy)).toEqual({ tipo: "holgada", dias: 3 });
  });
});

describe("matrizDeLineas", () => {
  const lin = (color: string | null, talla: string | null, plan: number, buenas: number | null = null) => ({
    varianteId: `${color}-${talla}`,
    color,
    colorHex: color === "Negro" ? "#111" : null,
    talla,
    cantidadPlan: plan,
    cantidadBuenas: buenas,
  });
  const m = matrizDeLineas([lin("Crudo", "L", 8), lin("Crudo", "S", 6), lin("Crudo", "M", 10), lin("Negro", "S", 4), lin("Negro", "M", 8)]);

  it("ordena las tallas en su orden canónico, no en el que llegaron", () => {
    expect(m.tallas).toEqual(["S", "M", "L"]);
  });
  it("conserva los colores en el orden en que aparecen, con su tono", () => {
    expect(m.colores).toEqual([
      { nombre: "Crudo", hex: null },
      { nombre: "Negro", hex: "#111" },
    ]);
  });
  it("suma por talla, por color y el total", () => {
    expect(m.totalPorTalla).toEqual({ S: 10, M: 18, L: 8 });
    expect(m.totalPorColor).toEqual({ Crudo: 24, Negro: 12 });
    expect(m.total).toBe(36);
  });
  it("una combinación que no está en la orden no tiene celda", () => {
    expect(m.celdas[claveCelda("Negro", "L")]).toBeUndefined();
    expect(m.celdas[claveCelda("Crudo", "M")]).toMatchObject({ plan: 10, buenas: null });
  });
  it("sin color o sin talla igual se dibuja", () => {
    const u = matrizDeLineas([lin(null, null, 5)]);
    expect(u.colores[0].nombre).toBe("Sin color");
    expect(u.tallas).toEqual(["Única"]);
  });
});

describe("cierre: buenas y segundas", () => {
  it("suma las buenas ignorando vacíos, negativos y decimales", () => {
    expect(totalBuenas({ a: 6, b: "10", c: "", d: -3, e: "4.9" })).toBe(20);
  });
  it("las segundas nunca son negativas", () => {
    expect(segundas(48, 46)).toBe(2);
    expect(segundas(48, 50)).toBe(0);
  });
});

describe("desgloseCosto", () => {
  it("reparte los tres costos como partes de un todo", () => {
    const d = desgloseCosto(700, 100, 200);
    expect(d.total).toBe(1000);
    expect(d.partes.map((p) => [p.clave, p.parte])).toEqual([
      ["tela", 0.7],
      ["avios", 0.1],
      ["maquila", 0.2],
    ]);
  });
  it("con costo cero no hay partes que dibujar", () => {
    expect(desgloseCosto(0, 0, 0).partes.every((p) => p.parte === 0)).toBe(true);
  });
  it("el medidor recorta el margen a 0–1", () => {
    expect(posicionEnMedidor(-0.2)).toBe(0);
    expect(posicionEnMedidor(0.83)).toBe(0.83);
    expect(posicionEnMedidor(1.4)).toBe(1);
  });
});

describe("resumenTablero", () => {
  const base = { estado: "en_proceso" as const, esMuestra: false, cantidadPlan: 10, fechaEntrega: null, precioVenta: 100, costoUnitario: 30 };
  const hoy = "2026-09-19";
  it("cuenta solo órdenes de producción abiertas: ni muestras, ni terminadas, ni anuladas", () => {
    const r = resumenTablero(
      [base, { ...base, esMuestra: true }, { ...base, estado: "terminada" }, { ...base, estado: "anulada" }, { ...base, cantidadPlan: 5 }],
      hoy
    );
    expect(r.enCurso).toBe(2);
    expect(r.prendas).toBe(15);
  });
  it("separa las entregas vencidas de las que vencen pronto", () => {
    const r = resumenTablero([{ ...base, fechaEntrega: "2026-09-10" }, { ...base, fechaEntrega: "2026-09-20" }, { ...base, fechaEntrega: "2026-10-30" }], hoy);
    expect(r.vencidas).toBe(1);
    expect(r.pronto).toBe(1);
  });
  it("el margen promedio ignora las órdenes sin precio o sin costo", () => {
    const r = resumenTablero([base, { ...base, precioVenta: 0 }, { ...base, costoUnitario: 0 }, { ...base, costoUnitario: 50 }], hoy);
    expect(r.margenPromedio).toBeCloseTo((0.7 + 0.5) / 2, 5);
  });
  it("sin nada con qué comparar, el margen es null", () => {
    expect(resumenTablero([], hoy).margenPromedio).toBeNull();
  });
});

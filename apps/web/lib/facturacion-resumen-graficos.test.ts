import { describe, expect, it } from "vitest";
import { acumuladoPorHora, alturaEnLienzo, barrasDeTicket, MAX_BARRAS, posicionEnEje, trazoDeSerie } from "./facturacion-resumen-graficos";

describe("posicionEnEje", () => {
  it("las 10 h están al inicio, las 18 h al final y las 14 h justo en medio", () => {
    expect(posicionEnEje(10)).toBe(0);
    expect(posicionEnEje(14)).toBe(50);
    expect(posicionEnEje(18)).toBe(100);
  });

  it("13:09 (13.15) cae al 39.375 % — la posición del punto en la maqueta aprobada (~39.5 %)", () => {
    expect(posicionEnEje(13.15)).toBeCloseTo(39.375, 3);
  });

  it("una venta antes de las 10 h o después de las 18 h se pega al borde, no se sale del eje", () => {
    expect(posicionEnEje(8.5)).toBe(0);
    expect(posicionEnEje(19.8)).toBe(100);
  });
});

describe("acumuladoPorHora", () => {
  const ventas = [
    { hora: 10.5, monto: 100 },
    { hora: 12.25, monto: 50 },
    { hora: 13.15, monto: 200 },
  ];

  it("una marca por hora en punto desde las 10 h y un último punto en la hora de ahora", () => {
    const puntos = acumuladoPorHora(ventas, 13.5);
    expect(puntos.map((p) => p.x)).toEqual([0, 0.125, 0.25, 0.375, 3.5 / 8]);
  });

  it("el acumulado suma lo vendido hasta cada marca (nunca baja)", () => {
    const puntos = acumuladoPorHora(ventas, 13.5);
    expect(puntos.map((p) => p.acumulado)).toEqual([0, 100, 100, 150, 350]);
  });

  it("después de las 18 h la línea termina en el borde con el total del día (incluye lo vendido tras las 18 h)", () => {
    const tarde = [...ventas, { hora: 19.25, monto: 75 }];
    const puntos = acumuladoPorHora(tarde, 19.8);
    expect(puntos[puntos.length - 1]).toEqual({ x: 1, acumulado: 425 });
  });

  it("antes de las 10 h no hay línea que dibujar más que un punto en el origen", () => {
    expect(acumuladoPorHora([], 9)).toEqual([{ x: 0, acumulado: 0 }]);
  });

  it("una venta de antes de las 10 h ya cuenta en el primer punto", () => {
    expect(acumuladoPorHora([{ hora: 9.5, monto: 30 }], 11)[0]).toEqual({ x: 0, acumulado: 30 });
  });
});

describe("alturaEnLienzo", () => {
  it("0 abajo (34), el máximo arriba (4) y lo demás en proporción", () => {
    expect(alturaEnLienzo(0, 100)).toBe(34);
    expect(alturaEnLienzo(100, 100)).toBe(4);
    expect(alturaEnLienzo(50, 100)).toBe(19);
  });

  it("sin máximo (nada vendido) todo queda abajo", () => {
    expect(alturaEnLienzo(5, 0)).toBe(34);
  });
});

describe("trazoDeSerie", () => {
  it("escala al máximo común: 0 abajo (y=34) y el máximo arriba (y=4), sobre un lienzo de 200×36", () => {
    const puntos = [
      { x: 0, acumulado: 0 },
      { x: 0.5, acumulado: 50 },
      { x: 1, acumulado: 100 },
    ];
    expect(trazoDeSerie(puntos, 100)).toBe("M0 34 L100 19 L200 4");
  });

  it("con máximo 0 (sin ventas en ninguna de las dos líneas) es una raya plana abajo", () => {
    expect(trazoDeSerie([{ x: 0, acumulado: 0 }, { x: 1, acumulado: 0 }], 0)).toBe("M0 34 L200 34");
  });

  it("dos líneas con el mismo máximo son comparables: la de menos ventas queda más baja", () => {
    const hoy = trazoDeSerie([{ x: 1, acumulado: 100 }], 200);
    const semanaPasada = trazoDeSerie([{ x: 1, acumulado: 200 }], 200);
    expect(hoy).toBe("M200 19");
    expect(semanaPasada).toBe("M200 4");
  });
});

describe("barrasDeTicket", () => {
  it("la más alta mide 100 % y el resto es proporcional (537, 338 y 75 como en la maqueta)", () => {
    const { alturas } = barrasDeTicket([537, 338, 75]);
    expect(alturas[0]).toBe(100);
    expect(alturas[1]).toBeCloseTo(62.9, 1);
    expect(alturas[2]).toBeCloseTo(14, 0);
  });

  it("la línea del promedio queda a la altura del promedio (316.67 sobre 537 = 59 %)", () => {
    expect(barrasDeTicket([537, 338, 75]).promedio).toBeCloseTo(59, 0);
  });

  it("una venta chica no desaparece: nunca menos de 4 %", () => {
    expect(barrasDeTicket([1000, 1]).alturas[1]).toBe(4);
  });

  it("solo se dibujan las últimas ventas si hay más de las que caben", () => {
    const muchas = Array.from({ length: MAX_BARRAS + 5 }, (_, i) => (i + 1) * 10);
    const { alturas } = barrasDeTicket(muchas);
    expect(alturas).toHaveLength(MAX_BARRAS);
    expect(alturas[alturas.length - 1]).toBe(100);
  });

  it("la línea es el promedio de TODAS las ventas, no solo de las barras que se ven (cuatro de 1000 y dieciséis de 100 = 280)", () => {
    const totales = [...Array(4).fill(1000), ...Array(MAX_BARRAS).fill(100)];
    const { alturas, promedio } = barrasDeTicket(totales);
    expect(alturas).toHaveLength(MAX_BARRAS);
    // el promedio real (280) supera a la barra más alta visible (100): la escala sube para que la línea entre
    expect(promedio).toBe(100);
    expect(alturas.every((a) => a < 100)).toBe(true);
    expect(alturas[0]).toBeCloseTo((100 / 280) * 100, 5);
  });

  it("sin ventas no hay barras ni línea", () => {
    expect(barrasDeTicket([])).toEqual({ alturas: [], promedio: 0 });
  });
});

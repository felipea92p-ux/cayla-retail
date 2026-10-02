import { describe, expect, it } from "vitest";
import {
  leerMonto,
  limitesRedondeados,
  montoParaCaja,
  montoParaUrl,
  pasoDePrecio,
  posicionEnControl,
  rangoDesdeControl,
  solesFiltro,
  textoRangoPrecio,
} from "./productos-filtro-precio";

describe("productos-filtro-precio — los límites salen de los precios reales", () => {
  it("el catálogo de producción de hoy (S/ 22 a S/ 119) da S/ 20 – S/ 120, nunca 999", () => {
    expect(limitesRedondeados({ min: 22, max: 119 })).toEqual({ min: 20, max: 120 });
    expect(limitesRedondeados({ min: 39.9, max: 39.9 })).toEqual({ min: 30, max: 40 });
    expect(limitesRedondeados({ min: 40, max: 40 })).toEqual({ min: 40, max: 50 }); // un solo precio redondo: se abre hacia arriba
  });

  it("sin precios (lista vacía o la consulta falló) no hay límites: el control no se dibuja, las cajas siguen", () => {
    expect(limitesRedondeados(null)).toBeNull();
    expect(limitesRedondeados({ min: null, max: 80 })).toBeNull();
    expect(limitesRedondeados({ min: Number.NaN, max: 80 })).toBeNull();
  });

  it("el paso crece con el rango: nunca cientos de paradas en un control de 130 px", () => {
    expect(pasoDePrecio({ min: 20, max: 120 })).toBe(5);
    expect(pasoDePrecio({ min: 0, max: 1200 })).toBe(10);
    expect(pasoDePrecio({ min: 0, max: 5000 })).toBe(50);
    for (const l of [{ min: 20, max: 120 }, { min: 0, max: 1200 }, { min: 0, max: 5000 }]) {
      expect((l.max - l.min) / pasoDePrecio(l)).toBeLessThanOrEqual(150);
    }
  });
});

describe("productos-filtro-precio — cajas, texto y control", () => {
  it("una caja acepta coma o punto y descarta lo que no es un monto", () => {
    expect(leerMonto("39,90")).toBe(39.9);
    expect(leerMonto(" 80 ")).toBe(80);
    expect(leerMonto("80.5")).toBe(80.5);
    for (const malo of ["", "abc", "-5", "1.234,50", "12.345", "1e3"]) expect(leerMonto(malo)).toBeNull();
    expect(montoParaUrl("39,90")).toBe("39.9"); // antes la coma hacía que la URL ignorara el filtro en silencio
    expect(montoParaUrl("x")).toBe("");
    expect(montoParaCaja("79.9")).toBe("79.90");
    expect(montoParaCaja("80")).toBe("80");
  });

  it("el texto dice lo filtrado con números de verdad, nunca un tope inventado", () => {
    expect(textoRangoPrecio("40", "80")).toBe("S/ 40 – S/ 80");
    expect(textoRangoPrecio("40", "")).toBe("Desde S/ 40");
    expect(textoRangoPrecio(null, "39.9")).toBe("Hasta S/ 39.90");
    expect(textoRangoPrecio("", "")).toBeNull();
    expect(solesFiltro(120)).toBe("S/ 120");
  });

  it("los tiradores en las puntas mandan «sin tope», no el número de la punta", () => {
    const l = { min: 20, max: 120 };
    expect(rangoDesdeControl(20, 120, l)).toEqual({ precioMin: "", precioMax: "" });
    expect(rangoDesdeControl(40, 120, l)).toEqual({ precioMin: "40", precioMax: "" });
    expect(rangoDesdeControl(20, 80, l)).toEqual({ precioMin: "", precioMax: "80" });
  });

  it("un enlace viejo con un precio fuera de los límites no saca el tirador de la barra", () => {
    const l = { min: 20, max: 120 };
    expect(posicionEnControl("", "999", l)).toEqual([20, 120]);
    expect(posicionEnControl("5", "", l)).toEqual([20, 120]);
    expect(posicionEnControl("40", "80", l)).toEqual([40, 80]);
    expect(posicionEnControl("", "", l)).toEqual([20, 120]);
  });
});

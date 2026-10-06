import { describe, expect, it } from "vitest";
import type { PreparacionAnalisis } from "./analisis-tipos";
import { avisoDatosDeHoy, leerQueFalta, META_CON_PRENDA, modoAnalisis, ventasConPrendaDe100 } from "./analisis-aviso";
import { diaAntes, preparacionDeSede, type DiaVenta, type FilaPreparacion } from "./motor-demanda-reglas";

// Las tiendas de prueba pasan por el motor real (`preparacionDeSede`): el aviso se prueba contra las mismas condiciones que ve «Todavía no».
const HOY = "2026-10-06";
const dia = (haceDias: number, unidades: number, identificadas: number): DiaVenta => ({ dia: diaAntes(HOY, haceDias), unidades, identificadas });

function tienda(f: Partial<FilaPreparacion> = {}): PreparacionAnalisis {
  const fila: FilaPreparacion = {
    ubicacionId: "tienda-de-prueba",
    nombre: "Tienda de prueba",
    hoy: HOY,
    primeraVenta: "2026-08-01",
    cuadradoEn: "2026-09-01",
    almacenContado: true,
    dias: [],
    ...f,
  };
  return { ...preparacionDeSede(fila), dias: fila.dias, hoy: fila.hoy };
}

describe("qué muestra Análisis mientras la tienda no cumple (ADR-0357, decisión 2)", () => {
  it("abre con los datos de hoy y su aviso; «Ver qué falta» lleva a «Todavía no»", () => {
    expect(modoAnalisis(false, false)).toBe("datos-de-hoy");
    expect(modoAnalisis(false, true)).toBe("que-falta");
  });

  it("si la tienda cumple, no hay aviso ni «Todavía no», aunque la URL lo pida", () => {
    expect(modoAnalisis(true, false)).toBe("confiable");
    expect(modoAnalisis(true, true)).toBe("confiable");
  });

  it("la URL pide ver qué falta solo con ?ver=falta", () => {
    expect(leerQueFalta("falta")).toBe(true);
    expect(leerQueFalta(["falta"])).toBe(true);
    expect(leerQueFalta("hoy")).toBe(false);
    expect(leerQueFalta(undefined)).toBe(false);
  });

  it("la meta es la del motor: 90 de cada 100", () => {
    expect(META_CON_PRENDA).toBe(90);
  });
});

describe("la cifra de «Veo X de cada 100 ventas con su prenda»", () => {
  it("es la de los últimos 14 días cerrados, redondeando hacia abajo", () => {
    expect(ventasConPrendaDe100(tienda({ dias: [dia(3, 10, 4)] }))).toBe(40);
  });
  it("sin ventas en esos 14 días, es la de los últimos 30 (hoy incluido)", () => {
    expect(ventasConPrendaDe100(tienda({ primeraVenta: HOY, dias: [dia(0, 10, 5)] }))).toBe(50);
  });
  it("sin ventas con qué medirlo, no inventa un 0", () => {
    expect(ventasConPrendaDe100(tienda({ primeraVenta: null, dias: [] }))).toBeNull();
    expect(ventasConPrendaDe100(undefined)).toBeNull();
  });
});

describe("el aviso dice lo PRIMERO que le falta a la tienda, como «Todavía no»", () => {
  it("si las ventas cumplen y falta el piso, dice el piso (no «no hubo ventas»)", () => {
    // El caso que se vio en local: una sola venta hace 18 días (racha cumplida) y ni piso ni almacén.
    const p = tienda({ primeraVenta: diaAntes(HOY, 18), dias: [dia(18, 4, 4)], cuadradoEn: null, almacenContado: false });
    expect(avisoDatosDeHoy(p)).toBe("Falta cuadrar el piso: estas cifras pueden fallar.");
  });

  it("si solo falta el almacén, dice el almacén", () => {
    const p = tienda({ dias: [dia(3, 10, 10)], almacenContado: false });
    expect(avisoDatosDeHoy(p)).toBe("Falta contar el almacén: estas cifras pueden fallar.");
  });

  it("si las ventas no llegan a 90, dice cuántas tienen su prenda, aunque también falte el piso", () => {
    const p = tienda({ dias: [dia(3, 10, 4)], cuadradoEn: null });
    expect(avisoDatosDeHoy(p)).toBe("Solo 40 de cada 100 ventas tienen su prenda: estas cifras pueden fallar.");
  });

  it("la cifra del aviso es la misma que muestra «Todavía no», también con la de 30 días", () => {
    const p = tienda({ primeraVenta: HOY, dias: [dia(0, 10, 5)] });
    expect(avisoDatosDeHoy(p)).toBe(`Solo ${ventasConPrendaDe100(p)} de cada 100 ventas tienen su prenda: estas cifras pueden fallar.`);
  });

  it("si las ventas ya llevan su prenda pero no 14 días seguidos, dice cuántos lleva", () => {
    const p = tienda({ primeraVenta: diaAntes(HOY, 5), dias: [dia(5, 10, 10), dia(2, 10, 10)] });
    expect(avisoDatosDeHoy(p)).toBe("Llevas 5 de 14 días cobrando con la prenda: estas cifras pueden fallar.");
  });

  it("si la tienda nunca vendió en el ERP, lo dice así", () => {
    expect(avisoDatosDeHoy(tienda({ primeraVenta: null, dias: [] }))).toBe("Esta tienda todavía no tiene ventas en el ERP: estas cifras pueden fallar.");
  });

  it("si no se pudo leer el motor, no adivina", () => {
    expect(avisoDatosDeHoy(undefined)).toBe("No se pudo saber qué le falta a esta tienda: estas cifras pueden fallar.");
  });
});

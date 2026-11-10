import { describe, expect, it } from "vitest";
import { aplicaNotaDeCosto, conteoAlcanzaLoPedido, leerCostoEstimado, notaCostoEstimado, pctCostoEstimado } from "./costo-estimado-reglas";

const base = { unidades_estimadas: 0, venta_estimada: 0, unidades_sin_costo: 0, venta_sin_costo: 0, venta_total: 1000 };

describe("notaCostoEstimado", () => {
  it("sin lectura o sin ventas, no avisa nada", () => {
    expect(notaCostoEstimado(null)).toBeNull();
    expect(notaCostoEstimado(leerCostoEstimado({ ...base, venta_total: 0 }))).toBeNull();
  });

  it("con todo el costo real, no avisa nada", () => {
    expect(notaCostoEstimado(leerCostoEstimado(base))).toBeNull();
  });

  it("dice el porcentaje de la venta, igual que el medidor de confianza (octubre: 38 %)", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 12, venta_estimada: 380 }));
    expect(n?.texto).toBe("38 % de lo vendido lleva costo estimado (12 prendas sin registrar)");
    expect(n?.tono).toBe("ambar");
    expect(n?.href).toBe("/inventario/por-regularizar");
  });

  it("una sola prenda va en singular", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 1, venta_estimada: 100 }));
    expect(n?.texto).toContain("(1 prenda sin registrar)");
  });

  it("un estimado chico no se esconde: dice «menos del 1 %»", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, venta_total: 100000, unidades_estimadas: 1, venta_estimada: 100 }));
    expect(n?.texto).toMatch(/^Menos del 1 % de lo vendido/);
  });

  it("lo que no tiene costo ninguno es peor que lo estimado: tono rojo", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 5, venta_estimada: 200, unidades_sin_costo: 2, venta_sin_costo: 100 }));
    expect(n?.tono).toBe("rojo");
    expect(n?.texto).toContain("20 % de lo vendido lleva costo estimado");
    expect(n?.texto).toContain("10 % no tiene costo (2 prendas)");
  });

  it("nunca pasa de 100 % aunque la base mande una venta estimada mayor al total", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 3, venta_estimada: 5000 }));
    expect(n?.texto).toContain("100 %");
  });
});

// Tarea 75: la mayoría de esas ventas ya está cerrada sin prenda y no se va a corregir sola. El aviso no promete lo que casi nunca pasa.
describe("lo que promete el aviso", () => {
  const c = leerCostoEstimado({ ...base, unidades_estimadas: 12, venta_estimada: 380 });
  it("dice que se queda así, y cuántas quedan", () => {
    const n = notaCostoEstimado(c, { periodo: "octubre", pendientes: 47 });
    expect(n?.detalle.replace(/\u00a0/g, " ")).toBe("De octubre, S/ 380 vendidos con IGV llevan un costo estimado que se queda así, salvo que reabras esas ventas. Quedan 47 por registrar.");
    expect(n?.conBoton).toBe(true);
  });
  it("sin pendientes no hay botón ni se promete registrar nada", () => {
    const n = notaCostoEstimado(c, { periodo: "octubre", pendientes: 0 });
    expect(n?.conBoton).toBe(false);
    expect(n?.detalle).not.toContain("Quedan");
  });
  it("una sola en singular", () => {
    expect(notaCostoEstimado(c, { periodo: "octubre", pendientes: 1 })?.detalle).toContain("Queda 1 por registrar.");
  });
  it("con otras fechas no nombra un mes", () => {
    expect(notaCostoEstimado(c, { periodo: null, pendientes: 2 })?.detalle).toMatch(/^De estas fechas, /);
  });
  it("si no se pudo contar, lo dice y no esconde el botón", () => {
    const n = notaCostoEstimado(c, { periodo: "octubre", pendientes: null });
    expect(n?.conBoton).toBe(true);
    expect(n?.detalle).toContain("No se pudo contar cuántas quedan");
  });
});

describe("pctCostoEstimado", () => {
  it("con un decimal, sobre lo vendido", () => {
    expect(pctCostoEstimado(leerCostoEstimado({ ...base, venta_estimada: 425 }))).toBe(42.5);
  });
  it("todo real es 0", () => {
    expect(pctCostoEstimado(leerCostoEstimado(base))).toBe(0);
  });
  it("sin ventas o sin lectura no hay dato", () => {
    expect(pctCostoEstimado(null)).toBeNull();
    expect(pctCostoEstimado(leerCostoEstimado({ ...base, venta_total: 0 }))).toBeNull();
  });
  it("nunca pasa de 100", () => {
    expect(pctCostoEstimado(leerCostoEstimado({ ...base, venta_estimada: 5000 }))).toBe(100);
  });
});

describe("a quién le toca la nota de costo (tarea 58)", () => {
  it("la empresa nunca vende: lo que se leería es de todas las tiendas", () => expect(aplicaNotaDeCosto("empresa")).toBe(false));
  it("una tienda y todas las sedes sí", () => {
    expect(aplicaNotaDeCosto("u-lim")).toBe(true);
    expect(aplicaNotaDeCosto(null)).toBe(true);
  });
});

// La cifra de la nota es de todas las sedes que da `fn_diario_ubicaciones()`, pero el conteo pasa por la RLS (`fn_puede_operar_ubicacion`: el líder, o la sede propia).
describe("el conteo de «por registrar» alcanza a lo que se pide", () => {
  it("el líder cuenta cualquier sede y todas", () => {
    expect(conteoAlcanzaLoPedido({ esLider: true, sedePropia: "u-tru", pedida: null })).toBe(true);
    expect(conteoAlcanzaLoPedido({ esLider: true, sedePropia: "u-tru", pedida: "u-aqp" })).toBe(true);
  });
  it("quien no es líder solo cuenta su propia sede", () => {
    expect(conteoAlcanzaLoPedido({ esLider: false, sedePropia: "u-tru", pedida: "u-tru" })).toBe(true);
  });
  it("con otra sede o con todas, la RLS le daría un cero falso: no se cuenta", () => {
    expect(conteoAlcanzaLoPedido({ esLider: false, sedePropia: "u-tru", pedida: "u-aqp" })).toBe(false);
    expect(conteoAlcanzaLoPedido({ esLider: false, sedePropia: "u-tru", pedida: null })).toBe(false);
  });
  it("sin sede propia, nada", () => {
    expect(conteoAlcanzaLoPedido({ esLider: false, sedePropia: null, pedida: null })).toBe(false);
  });
});

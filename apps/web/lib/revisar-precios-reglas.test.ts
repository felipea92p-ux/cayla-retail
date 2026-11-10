import { describe, expect, it } from "vitest";
import { filtroDeUrl, leerPreciosARevisar, textoMotivo } from "./revisar-precios-reglas";

const fila = (o: Record<string, unknown> = {}) => ({
  producto_id: "p1",
  referencia: "Blusa Emma",
  codigo: "BLU-001",
  categoria_id: "c1",
  categoria: "Camisas y Blusas",
  tejido_id: null,
  precio: "79.90",
  costo: "30.17",
  costo_estimado: false,
  margen: "62.2",
  mediana_categoria: "55.00",
  desvio: "45.3",
  unidades_90: 4,
  stock: "12",
  motivo: "caro",
  total: "9",
  cuenta_pierde: "1",
  cuenta_margen: "2",
  cuenta_lejos: "3",
  cuenta_sin_costo: "4",
  ...o,
});

describe("leerPreciosARevisar", () => {
  it("convierte los numeric de la base a números y lee las cuentas", () => {
    const r = leerPreciosARevisar([fila()]);
    expect(r.total).toBe(9);
    expect(r.cuentas).toEqual({ pierde: 1, margen: 2, lejos: 3, sinCosto: 4 });
    expect(r.prendas[0]).toMatchObject({ precio: 79.9, costo: 30.17, margen: 62.2, desvio: 45.3, stock: 12, motivo: "caro" });
  });
  it("sin costo, el costo y el margen quedan vacíos (no en 0)", () => {
    const r = leerPreciosARevisar([fila({ costo: null, margen: null, motivo: "sin_costo" })]);
    expect(r.prendas[0]?.costo).toBeNull();
    expect(r.prendas[0]?.margen).toBeNull();
  });
  it("una fila con motivo desconocido o sin precio se descarta", () => {
    expect(leerPreciosARevisar([fila({ motivo: "otro" }), fila({ precio: null }), fila({ precio: "0" })]).prendas).toHaveLength(0);
  });
  it("sin filas, todo en cero", () => {
    expect(leerPreciosARevisar([])).toEqual({ prendas: [], total: 0, cuentas: { pierde: 0, margen: 0, lejos: 0, sinCosto: 0 } });
  });
});

describe("filtroDeUrl", () => {
  it("solo acepta los cuatro filtros", () => {
    expect(filtroDeUrl("lejos")).toBe("lejos");
    expect(filtroDeUrl("caro")).toBeNull();
    expect(filtroDeUrl(undefined)).toBeNull();
  });
});

describe("textoMotivo", () => {
  it("dice por qué en palabras de tienda, con cuánto se aleja", () => {
    expect(textoMotivo({ motivo: "caro", desvio: 45.3, categoria: "Blusas" }).texto).toBe("45 % más cara que sus parecidas");
    expect(textoMotivo({ motivo: "barato", desvio: -52.1, categoria: "Vestidos" }).texto).toBe("52 % más barata que sus parecidas");
    expect(textoMotivo({ motivo: "pierde_dinero", desvio: null, categoria: "x" })).toEqual({ texto: "Pierdes en cada venta", tono: "rojo" });
    expect(textoMotivo({ motivo: "caro", desvio: null, categoria: "x" }).texto).toBe("Más cara que sus parecidas");
  });
});

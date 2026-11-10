import { describe, expect, it } from "vitest";
import { esMismoPrecio, filtroDeUrl, leerPreciosARevisar, mensajeAplicar, pideReleer, textoAplicado, textoMotivo } from "./revisar-precios-reglas";

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
    expect(textoMotivo({ motivo: "caro", desvio: 45.3, categoria: "Blusas" }).texto).toBe("45 % más cara");
    expect(textoMotivo({ motivo: "caro", desvio: 45.3, categoria: "Blusas" }).frase).toBe("45 % más cara que el precio del medio de Blusas.");
    expect(textoMotivo({ motivo: "barato", desvio: -52.1, categoria: "Vestidos" }).texto).toBe("52 % más barata");
    expect(textoMotivo({ motivo: "pierde_dinero", desvio: null, categoria: "x" }).tono).toBe("rojo");
    expect(textoMotivo({ motivo: "caro", desvio: null, categoria: "x" }).texto).toBe("Más cara");
  });
});

describe("aplicar", () => {
  it("el mensaje de la base pasa tal cual si es uno de los suyos", () => {
    const e = { message: "El precio de esta prenda cambió después de la propuesta: pide una nueva", hint: "precio_cambio", code: "22023" };
    expect(mensajeAplicar(e)).toBe(e.message);
    expect(pideReleer(e)).toBe(true);
    expect(pideReleer({ message: "x", hint: "bajo_el_piso", code: "22023" })).toBe(false);
  });
  it("el aviso dice qué cambió y qué no", () => {
    expect(textoAplicado("Blusa Emma", 69.9, { cambiadas: 4, con_precio_propio: 0 })).toBe("Blusa Emma queda en S/ 69.90.");
    expect(textoAplicado("Blusa Emma", 69.9, { cambiadas: 3, con_precio_propio: 1 })).toBe("Blusa Emma queda en S/ 69.90. Una talla con precio propio sigue igual.");
    expect(textoAplicado("Blusa Emma", 69.9, { cambiadas: 2, con_precio_propio: 2 })).toContain("2 tallas con precio propio siguen igual");
  });
  it("una propuesta igual al precio de hoy no se aplica", () => {
    expect(esMismoPrecio(79.9, 79.9)).toBe(true);
    expect(esMismoPrecio(79.9, 69.9)).toBe(false);
  });
});

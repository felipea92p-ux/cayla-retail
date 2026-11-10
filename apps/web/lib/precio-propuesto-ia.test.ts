import { describe, expect, it } from "vitest";
import { costoDelContexto, leerRespuestaPrecio, mensajePrecio, type ContextoPrecio } from "./precio-propuesto-ia";

const contexto: ContextoPrecio = {
  categoria: { nombre: "Polos", familia: "indumentaria", prefijo: "POL" },
  costo_categoria: 24,
  prendas_con_costo: 5,
  producto: null,
  parecidas: [
    { referencia: "Polo Bianca", tejido: "Algodón", mismo_tejido: true, precio: 49.9, costo: 22, unidades_90: 30, stock: 4, dias_desde_alta: 80 },
    { referencia: "Polo Mia", tejido: "Rib", mismo_tejido: false, precio: 39.9, costo: null, unidades_90: 2, stock: 40, dias_desde_alta: 120 },
  ],
};

describe("costoDelContexto", () => {
  it("el escrito manda; si no hay, el de la categoría (estimado)", () => {
    expect(costoDelContexto(contexto, 30)).toEqual({ costo: 30, estimado: false });
    expect(costoDelContexto(contexto, null)).toEqual({ costo: 24, estimado: true });
    expect(costoDelContexto({ ...contexto, costo_categoria: null }, null)).toBeNull();
  });
  it("en una revisión, usa el costo de la prenda", () => {
    const conProducto = { ...contexto, producto: { referencia: "Polo X", precio: 45.9, costo: 20, unidades_90: 1, stock: 9, dias_desde_alta: 40 } };
    expect(costoDelContexto(conProducto, null)).toEqual({ costo: 20, estimado: false });
  });
});

describe("leerRespuestaPrecio: la IA propone, la regla manda", () => {
  const costo = { costo: 30, estimado: false };
  it("lleva el precio a .90 y nunca bajo el piso", () => {
    const r = leerRespuestaPrecio({ precio: 39, razon: "Como el Polo Bianca, que se vende bien.", parecidas: [] }, costo, contexto);
    expect(r?.precio).toBe(42.9);
    expect(r?.subidoAlPiso).toBe(true);
  });
  it("solo deja las parecidas que estaban en la lista (no inventa prendas)", () => {
    const r = leerRespuestaPrecio(
      {
        precio: 49.9,
        razon: "Va al precio del Polo Bianca, que se vende bien.",
        parecidas: [
          { referencia: "polo bianca ", precio: 1 },
          { referencia: "Polo Inventado", precio: 59.9 },
          { referencia: "Polo Bianca", precio: 49.9 },
        ],
      },
      costo,
      contexto,
    );
    expect(r?.parecidas).toEqual([{ referencia: "Polo Bianca", precio: 49.9 }]);
  });
  it("una respuesta vacía o sin razón no se muestra", () => {
    expect(leerRespuestaPrecio(null, costo, contexto)).toBeNull();
    expect(leerRespuestaPrecio({ precio: 49.9, razon: "ok", parecidas: [] }, costo, contexto)).toBeNull();
    expect(leerRespuestaPrecio({ precio: -1, razon: "Una razón larga de verdad.", parecidas: [] }, costo, contexto)).toBeNull();
  });
});

describe("mensajePrecio", () => {
  it("lleva el costo y dice si es estimado; en el alta no manda precio actual", () => {
    const m = mensajePrecio({ origen: "alta", contexto, costo: { costo: 24, estimado: true }, referencia: "Polo Luna" });
    expect(m).toContain("Polo Luna");
    expect(m).toContain("estimado");
    expect(m).not.toContain("precio_actual");
    expect(m).toContain("Polo Bianca");
  });
});

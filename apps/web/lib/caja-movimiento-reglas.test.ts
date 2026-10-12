import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filaDeMovimiento, gastoDeLaNota, MARCA_GASTO } from "./caja-movimiento-reglas";

// Los casos salen de producción (consultados el 2026-10-12): las 26 salidas con motivo «Otro» son gastos, y su nota la
// escribió `registrar_gasto`. Las notas de abajo son esas, tal cual.

describe("gastoDeLaNota", () => {
  it("una nota de gasto: separa la categoría de lo que se compró", () => {
    expect(gastoDeLaNota("Gasto · Servicios básicos — Baño")).toEqual({
      categoria: "Servicios básicos",
      descripcion: "Baño",
      comprobante: null,
    });
  });

  it("la descripción puede traer su propia raya: solo se corta en la primera", () => {
    expect(gastoDeLaNota("Gasto · Suministros y útiles — Útiles — pegatina para tallas")).toEqual({
      categoria: "Suministros y útiles",
      descripcion: "Útiles — pegatina para tallas",
      comprobante: null,
    });
  });

  it("con comprobante: el número sale de la descripción y se devuelve aparte", () => {
    expect(gastoDeLaNota("Gasto · Seguros — vigilancia (F001-00001234)")).toEqual({
      categoria: "Seguros",
      descripcion: "vigilancia",
      comprobante: "F001-00001234",
    });
  });

  it("un paréntesis que no es un comprobante se queda en la descripción", () => {
    expect(gastoDeLaNota("Gasto · Suministros y útiles — Bolsas (las chicas)")?.descripcion).toBe("Bolsas (las chicas)");
    expect(gastoDeLaNota("Gasto · Suministros y útiles — Bolsas (las chicas)")?.comprobante).toBeNull();
  });

  it("no es un gasto: una nota cualquiera, vacía o sin nota", () => {
    expect(gastoDeLaNota("agua mineral")).toBeNull();
    expect(gastoDeLaNota("")).toBeNull();
    expect(gastoDeLaNota(null)).toBeNull();
    expect(gastoDeLaNota("Gasto ·   ")).toBeNull();
  });

  it("una nota cortada a la mitad por la base todavía dice qué fue", () => {
    expect(gastoDeLaNota("Gasto · Tributos y licencias")).toEqual({ categoria: null, descripcion: "Tributos y licencias", comprobante: null });
  });
});

describe("filaDeMovimiento", () => {
  it("un gasto se llama por lo que se compró y muestra su categoría", () => {
    expect(filaDeMovimiento({ motivo: "Otro", nota: "Gasto · Servicios básicos — Baño" })).toEqual({
      titulo: "Gasto · Baño",
      detalle: "Servicios básicos",
      esGasto: true,
    });
  });

  it("nunca vuelve a decir «Otro» por un gasto (lo que Felipe vio el 2026-10-12)", () => {
    expect(filaDeMovimiento({ motivo: "Otro", nota: "Gasto · Suministros y útiles — Limpieza" }).titulo).not.toBe("Otro");
  });

  it("un movimiento que no es gasto se llama por su motivo, con la nota como detalle", () => {
    expect(filaDeMovimiento({ motivo: "Retiro de efectivo", nota: "baño" })).toEqual({
      titulo: "Retiro de efectivo",
      detalle: "baño",
      esGasto: false,
    });
    expect(filaDeMovimiento({ motivo: "Compra de insumos", nota: null })).toEqual({
      titulo: "Compra de insumos",
      detalle: null,
      esGasto: false,
    });
  });

  it("una entrada con su motivo propio (ADR-0375) se queda como está", () => {
    expect(filaDeMovimiento({ motivo: "Sencillo de la caja fuerte", nota: null }).titulo).toBe("Sencillo de la caja fuerte");
    expect(filaDeMovimiento({ motivo: "Entrega del líder", nota: "Trajo: Sandra" })).toEqual({
      titulo: "Entrega del líder",
      detalle: "Trajo: Sandra",
      esGasto: false,
    });
  });
});

describe("la marca es la que escribe la base", () => {
  // Si alguien cambia el texto de la nota en `registrar_gasto`, el nombre de la fila deja de salir y esta prueba lo dice.
  const MIGRACION = new URL("../../../supabase/migrations/20260924235100_finanzas_gastos_y_comprobante_de_proveedor.sql", import.meta.url);

  it("`registrar_gasto` arma la nota del egreso con «Gasto · categoría — descripción»", () => {
    const sql = readFileSync(MIGRACION, "utf8");
    expect(sql).toContain("v_nota_caja := left('Gasto · ' || v_cat.nombre || ' — ' || trim(p_descripcion)");
    expect(MARCA_GASTO).toBe("Gasto · ");
  });
});

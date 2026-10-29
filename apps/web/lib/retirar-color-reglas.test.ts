import { describe, expect, it } from "vitest";
import { UNIDADES_INSUMO } from "./insumos-reglas";
import { motivoParaNoRetirar, RPC_RETIRAR_COLOR } from "./retirar-color-reglas";

describe("Retirar color: lo que se dice de antemano por el saldo", () => {
  it("un color sin saldo se puede retirar", () => {
    expect(motivoParaNoRetirar({ saldo: 0, unidad: "metro" })).toBeNull();
  });

  it("el polvo de un redondeo no cuenta como saldo (el libro lleva tres decimales)", () => {
    expect(motivoParaNoRetirar({ saldo: 0.0004, unidad: "metro" })).toBeNull();
    expect(motivoParaNoRetirar({ saldo: -0.0004, unidad: "metro" })).toBeNull();
  });

  it("con saldo dice cuánto tiene, con la unidad del color, y lo mismo que diría la base", () => {
    expect(motivoParaNoRetirar({ saldo: 9, unidad: "metro" })).toBe("Este color todavía tiene 9 m: solo se retira un color sin saldo.");
    // La coma o el punto decimal los pone el idioma del navegador (`cantidadTexto`): la prueba no depende de cuál.
    expect(motivoParaNoRetirar({ saldo: 12.5, unidad: "metro" })).toMatch(/^Este color todavía tiene 12[.,]5 m: solo se retira un color sin saldo\.$/);
  });

  it("un saldo negativo (un libro que quedó mal) tampoco se esconde: se dice", () => {
    expect(motivoParaNoRetirar({ saldo: -2, unidad: "metro" })).toContain("todavía tiene -2 m");
  });

  it("sirve para toda unidad de insumo (un color de avío también lo pregunta)", () => {
    for (const unidad of Object.keys(UNIDADES_INSUMO) as (keyof typeof UNIDADES_INSUMO)[]) {
      expect(motivoParaNoRetirar({ saldo: 3, unidad })).toContain(UNIDADES_INSUMO[unidad].corta);
      expect(motivoParaNoRetirar({ saldo: 0, unidad })).toBeNull();
    }
  });

  it("la función de la base se llama como la migración la crea", () => {
    expect(RPC_RETIRAR_COLOR).toBe("retirar_color_de_material");
  });
});

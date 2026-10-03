import { describe, expect, it } from "vitest";
import { estiloMosaicoColor } from "./color-prenda-reglas";

describe("estiloMosaicoColor", () => {
  it("sin hex o con hex roto devuelve null (la pantalla cae al tono de la familia)", () => {
    for (const malo of [null, undefined, "", "azul", "#12", "#gggggg", "123456", "#1234567"]) {
      expect(estiloMosaicoColor(malo)).toBeNull();
    }
  });

  it("devuelve el fondo en minúscula y sin espacios", () => {
    expect(estiloMosaicoColor(" #4F7CAC ")?.fondo).toBe("#4f7cac");
  });

  it("colores oscuros y medios llevan trazo crema", () => {
    for (const hex of ["#1f1f1d", "#4f7cac", "#6b4a2f", "#6e6b33", "#b8412d"]) {
      expect(estiloMosaicoColor(hex)?.trazo).toBe("var(--color-crema)");
    }
  });

  it("colores claros llevan trazo tinta", () => {
    for (const hex of ["#9fd0ea", "#d9c7a8", "#ffffff", "#f5f0e8"]) {
      expect(estiloMosaicoColor(hex)?.trazo).toBe("var(--color-tinta)");
    }
  });

  it("los claros piden filo y los medios y oscuros no", () => {
    for (const hex of ["#ffffff", "#f5f0e8", "#9fd0ea", "#d9c7a8"]) expect(estiloMosaicoColor(hex)?.filo).toBe(true);
    for (const hex of ["#4f7cac", "#6b4a2f", "#1f1f1d"]) expect(estiloMosaicoColor(hex)?.filo).toBe(false);
  });
});

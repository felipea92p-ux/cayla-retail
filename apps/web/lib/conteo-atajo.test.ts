import { describe, expect, it } from "vitest";
import { funcionNoExiste, textoAtajoEnRevision } from "./conteo-atajo";

describe("funcionNoExiste", () => {
  const SIN_FUNCION = { code: "PGRST202", message: "Could not find the function retail.conteo_completar_tarjeta(p_conteo_id, p_lineas) in the schema cache" };

  it("reconoce el aviso de PostgREST cuando la función nueva todavía no está en la base", () => {
    expect(funcionNoExiste(SIN_FUNCION, "conteo_completar_tarjeta")).toBe(true);
  });

  it("también por el texto, si el código no llega", () => {
    expect(funcionNoExiste({ message: "Could not find the function retail.conteo_completar_tarjeta in the schema cache" }, "conteo_completar_tarjeta")).toBe(true);
  });

  it("no tapa otros errores: la función no existe pero es OTRA, un rechazo de la base o ningún error", () => {
    expect(funcionNoExiste({ code: "PGRST202", message: "Could not find the function retail.conteo_contar(p_x) in the schema cache" }, "conteo_completar_tarjeta")).toBe(false);
    expect(funcionNoExiste({ code: "P0001", message: "Ese conteo ya está cerrado" }, "conteo_completar_tarjeta")).toBe(false);
    expect(funcionNoExiste({ code: "42501", message: "No tienes permiso para contar en esa ubicación (conteo_completar_tarjeta)" }, "conteo_completar_tarjeta")).toBe(false);
    expect(funcionNoExiste(null, "conteo_completar_tarjeta")).toBe(false);
    expect(funcionNoExiste(undefined, "conteo_completar_tarjeta")).toBe(false);
  });
});

describe("textoAtajoEnRevision", () => {
  it("dice cuántas de las contadas se completaron con el atajo", () => {
    expect(textoAtajoEnRevision(23, 40)).toBe("23 de 40 variantes contadas se completaron con «Completar todo»: nadie escribió su cantidad.");
  });

  it("singular, y todas las contadas", () => {
    expect(textoAtajoEnRevision(1, 12)).toBe("1 de 12 variantes contadas se completó con «Completar todo»: nadie escribió su cantidad.");
    expect(textoAtajoEnRevision(1, 1)).toBe("1 de 1 variante contada se completó con «Completar todo»: nadie escribió su cantidad.");
    expect(textoAtajoEnRevision(40, 40)).toBe("40 de 40 variantes contadas se completaron con «Completar todo»: nadie escribió su cantidad.");
  });

  it("si no hay ninguna, no dice nada (una frase que siempre sale se deja de leer)", () => {
    expect(textoAtajoEnRevision(0, 40)).toBeNull();
    expect(textoAtajoEnRevision(-1, 40)).toBeNull();
  });

  it("jamás dice más completadas que contadas (si la lectura de la marca y la del resumen no son de la misma foto)", () => {
    expect(textoAtajoEnRevision(41, 40)).toBe("40 de 40 variantes contadas se completaron con «Completar todo»: nadie escribió su cantidad.");
  });
});

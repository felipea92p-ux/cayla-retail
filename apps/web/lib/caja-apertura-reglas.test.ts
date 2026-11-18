import { describe, it, expect } from "vitest";
import { DENOMINACIONES, estadoApertura, hayConteo, montoEscrito, sumaConteo, textoFalta, textoFaltas } from "./caja-apertura-reglas";

describe("sumaConteo", () => {
  it("suma billetes y monedas", () => {
    expect(sumaConteo({ "200": 1, "50": 1, "5": 1, "2": 1, "1": 1, "0.5": 1 })).toBe(258.5);
  });
  it("las monedas chicas no arrastran error de coma flotante", () => {
    expect(sumaConteo({ "0.1": 3, "0.2": 1 })).toBe(0.5);
    expect(sumaConteo({ "0.1": 1, "0.2": 2 })).toBe(0.5);
  });
  it("vacío es cero y un número negativo no resta", () => {
    expect(sumaConteo({})).toBe(0);
    expect(sumaConteo({ "100": -3, "10": 2 })).toBe(20);
  });
  it("cubre las once denominaciones", () => {
    const todo = Object.fromEntries(DENOMINACIONES.map((d) => [String(d.valor), 1]));
    expect(sumaConteo(todo)).toBe(388.8);
  });
});

describe("hayConteo", () => {
  it("solo cuenta si hay algo mayor que cero", () => {
    expect(hayConteo({})).toBe(false);
    expect(hayConteo({ "100": 0 })).toBe(false);
    expect(hayConteo({ "100": 0, "5": 2 })).toBe(true);
  });
});

describe("estadoApertura", () => {
  it("campo vacío: falta el monto", () => {
    const e = estadoApertura({ texto: "", esperado: 258.5, motivo: "" });
    expect(e).toMatchObject({ monto: null, diferencia: null, pideMotivo: false, listo: false, falta: "monto" });
  });
  it("coincide con el último cierre: se puede abrir sin motivo", () => {
    const e = estadoApertura({ texto: "258.50", esperado: 258.5, motivo: "" });
    expect(e).toMatchObject({ monto: 258.5, diferencia: 0, pideMotivo: false, listo: true, falta: null });
  });
  it("faltante: pide motivo y no deja abrir sin él", () => {
    const e = estadoApertura({ texto: "250", esperado: 258.5, motivo: "" });
    expect(e).toMatchObject({ diferencia: -8.5, pideMotivo: true, listo: false, falta: "motivo" });
  });
  it("sobrante: también pide motivo; con 3 letras o más ya se puede", () => {
    expect(estadoApertura({ texto: "260", esperado: 258.5, motivo: "ab" })).toMatchObject({ diferencia: 1.5, listo: false, falta: "motivo" });
    expect(estadoApertura({ texto: "260", esperado: 258.5, motivo: "Vuelto" })).toMatchObject({ listo: true, falta: null });
  });
  it("primera apertura (sin cierre previo): no hay diferencia ni motivo", () => {
    const e = estadoApertura({ texto: "300", esperado: null, motivo: "" });
    expect(e).toMatchObject({ monto: 300, diferencia: null, pideMotivo: false, listo: true });
  });
  it("la coma decimal se entiende y lo que no se lee no abre", () => {
    expect(estadoApertura({ texto: "258,50", esperado: 258.5, motivo: "" }).diferencia).toBe(0);
    expect(estadoApertura({ texto: "abc", esperado: 258.5, motivo: "" }).falta).toBe("monto");
  });
});

describe("textos", () => {
  it("montoEscrito siempre con dos decimales", () => {
    expect(montoEscrito(258.5)).toBe("258.50");
    expect(montoEscrito(250)).toBe("250.00");
  });
  it("textoFalta dice lo que falta, corto", () => {
    expect(textoFalta("monto")).toBe("el monto");
    expect(textoFalta("motivo")).toBe("qué pasó con la diferencia");
    expect(textoFalta(null)).toBe("");
  });
});

describe("lo que no se entiende no se adivina (ataque de /chaos, 2026-11-03)", () => {
  it("un pegado con texto es ilegible: no abre con un monto inventado", () => {
    for (const texto of ["Total: 3,50 (2 monedas)", "12 8 5", "1e5", "abc"]) {
      const e = estadoApertura({ texto, esperado: 258.5, motivo: "" });
      expect(e, texto).toMatchObject({ monto: null, ilegible: true, listo: false, falta: "monto" });
    }
  });
  it("un monto negativo tampoco abre: se dice que no se entiende", () => {
    expect(estadoApertura({ texto: "-5", esperado: 258.5, motivo: "" })).toMatchObject({ ilegible: true, listo: false, falta: "monto" });
  });
  it("vacío no es ilegible (todavía no escribió nada)", () => {
    expect(estadoApertura({ texto: "", esperado: 258.5, motivo: "" }).ilegible).toBe(false);
    expect(estadoApertura({ texto: "   ", esperado: 258.5, motivo: "" }).ilegible).toBe(false);
  });
  it("un monto bien escrito no es ilegible", () => {
    expect(estadoApertura({ texto: "258,50", esperado: 258.5, motivo: "" }).ilegible).toBe(false);
  });
});

describe("textoFaltas", () => {
  it("junta todo lo que falta", () => {
    expect(textoFaltas("monto", true)).toBe("el monto y el responsable");
    expect(textoFaltas("motivo", true)).toBe("qué pasó con la diferencia y el responsable");
  });
  it("una sola cosa, o ninguna", () => {
    expect(textoFaltas(null, true)).toBe("el responsable");
    expect(textoFaltas("monto", false)).toBe("el monto");
    expect(textoFaltas(null, false)).toBe("");
  });
});

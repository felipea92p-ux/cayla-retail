import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeCorreccionCosto } from "./costo-correccion-guia";
import {
  esCorreccionYaHecha,
  fraseDeErrorDeCorreccion,
  fraseDeVistaPrevia,
  hoyTrasCorregir,
  leerVistaPrevia,
  problemaDeLaCorreccion,
  problemaDelCosto,
  problemaDelMotivo,
  type BorradorCorreccion,
} from "./costo-correccion-reglas";

const base: BorradorCorreccion = { costo: "", motivo: "", costoActual: 20.5 };

describe("problemaDelCosto", () => {
  it("pide un monto, lo lee como lo escribe una persona y no deja el que ya tiene", () => {
    expect(problemaDelCosto("", 20.5)).toMatch(/Escribe el costo/);
    expect(problemaDelCosto("abc", 20.5)).toMatch(/monto/);
    expect(problemaDelCosto("19,50", 20.5)).toBeNull();
    expect(problemaDelCosto("S/ 19.50", 20.5)).toBeNull();
    expect(problemaDelCosto("20.5", 20.5)).toMatch(/ya es el costo/);
    expect(problemaDelCosto("20,50", 20.5)).toMatch(/ya es el costo/);
  });

  it("los topes son los de la base: de S/ 0.01 a S/ 5000", () => {
    expect(problemaDelCosto("0", 20.5)).not.toBeNull();
    expect(problemaDelCosto("0.01", 20.5)).toBeNull();
    expect(problemaDelCosto("5000", 20.5)).toBeNull();
    expect(problemaDelCosto("5000.01", 20.5)).toMatch(/entre/);
  });
});

describe("problemaDelMotivo", () => {
  it("de 3 a 300 letras, sin contar los espacios de las puntas", () => {
    expect(problemaDelMotivo("  ab ")).not.toBeNull();
    expect(problemaDelMotivo("era 19.50")).toBeNull();
    expect(problemaDelMotivo("x".repeat(300))).toBeNull();
    expect(problemaDelMotivo("x".repeat(301))).not.toBeNull();
  });
});

describe("la guía de la hoja", () => {
  it("al abrir, lo que sigue es el costo; con costo, el motivo; con los dos, quién firma", () => {
    expect(estadosDe(camposDeCorreccionCosto(base, false)).costo).toBe("ahora");
    expect(estadosDe(camposDeCorreccionCosto({ ...base, costo: "19.5" }, false)).motivo).toBe("ahora");
    expect(estadosDe(camposDeCorreccionCosto({ ...base, costo: "19.5", motivo: "precio mal tecleado" }, false)).responsable).toBe("ahora");
  });

  it("la frase de lo que falta es la de la regla real", () => {
    const campos = camposDeCorreccionCosto({ ...base, costo: "20.5" }, true);
    expect(campos.find((c) => c.id === "costo")?.pendiente).toBe(problemaDelCosto("20.5", 20.5));
  });

  // La coherencia que importa: «se puede guardar» según la guía ⇔ la regla real (sin contar quién firma).
  it("coincide con problemaDeLaCorreccion en cada combinación", () => {
    const costos = ["", "abc", "0", "0.01", "19,5", "20.50", "5000", "5001", "S/ 18"];
    const motivos = ["", "ab", "abc", "x".repeat(300), "x".repeat(301)];
    for (const costo of costos)
      for (const motivo of motivos) {
        const b = { ...base, costo, motivo };
        expect(sePuedeConfirmar(camposDeCorreccionCosto(b, true)), JSON.stringify(b)).toBe(problemaDeLaCorreccion(b) === null);
      }
  });
});

describe("la vista previa", () => {
  it("lee lo que devuelve la base y lo dice en una frase", () => {
    const v = leerVistaPrevia({ llegaron: 24, stock: 47, hoy_antes: "19.57", hoy_despues: 19.49 })!;
    expect(v).toEqual({ llegaron: 24, stock: 47, hoyAntes: 19.57, hoyDespues: 19.49 });
    expect(fraseDeVistaPrevia(v)).toBe("Hoy cada prenda te cuesta S/ 19.57; con la corrección, S/ 19.49.");
    expect(fraseDeVistaPrevia({ ...v, hoyDespues: 19.57 })).toMatch(/seguiría igual/);
    expect(fraseDeVistaPrevia({ ...v, hoyAntes: null })).toBe("");
  });

  it("sin respuesta (no es líder o la compra ya no es la última) no hay vista previa", () => {
    expect(leerVistaPrevia(null)).toBeNull();
    expect(leerVistaPrevia({})).toBeNull();
  });
});

describe("los rechazos de la base", () => {
  it("usa el hint de un código costo_*, que ya está en palabras de tienda", () => {
    expect(fraseDeErrorDeCorreccion({ message: "costo_no_es_la_ultima", hint: "Solo se corrige la última compra" })).toBe("Solo se corrige la última compra");
    expect(fraseDeErrorDeCorreccion({ message: "otra cosa", hint: "x" })).toBeNull();
    expect(fraseDeErrorDeCorreccion(null)).toBeNull();
  });

  it("«sin cambios» es un doble clic o una corrección ya hecha: se toma como hecho", () => {
    expect(esCorreccionYaHecha({ message: "costo_sin_cambios" })).toBe(true);
    expect(esCorreccionYaHecha({ message: "costo_invalido" })).toBe(false);
  });
});

describe("lo que devolvió el guardado", () => {
  it("dice cuánto cuesta cada prenda hoy, ya corregido", () => {
    expect(hoyTrasCorregir({ hoy_despues: "19.49", lineas: 2 })).toBe(19.49);
    expect(hoyTrasCorregir({})).toBeNull();
    expect(hoyTrasCorregir(null)).toBeNull();
  });
});

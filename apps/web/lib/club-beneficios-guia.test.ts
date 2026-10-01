import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeBeneficios } from "./club-beneficios-guia";
import {
  beneficiosDelBorrador,
  borradorDe,
  cambiosDeBeneficios,
  escalaParaGuardar,
  leerBeneficios,
  problemasBeneficios,
  type BorradorBeneficios,
} from "./club-beneficios-reglas";

// Los valores propuestos por Felipe (ADR-0288 G-13): cumpleaños 10 %, 6 compras o S/ 600, 60 días, S/ 20·30·40·50·60.
const VIGENTES = { pct: 10, compras: 6, monto: 600, dias: 60, escala: [20, 30, 40, 50, 60] };
const PAGINA = {
  tienda: "Trujillo",
  whatsapp: "987654321",
  pct: 10,
  escala: [
    { anio: 3, monto: "40.00" },
    { anio: 1, monto: "20.00" },
    { anio: 2, monto: 30 },
    { anio: 5, monto: 60 },
    { anio: 4, monto: 50 },
  ],
  compras: 6,
  monto_minimo: "600.00",
  dias: 60,
  textos: {},
};

describe("leerBeneficios: lo vigente, de fn_club_pagina", () => {
  it("lee los montos aunque lleguen como texto (numeric) y la escala en cualquier orden", () => {
    expect(leerBeneficios(PAGINA)).toEqual(VIGENTES);
  });

  it("sin la página, sin un número o sin los cinco años de la escala, no inventa: null", () => {
    expect(leerBeneficios(null)).toBeNull();
    expect(leerBeneficios({ ...PAGINA, pct: undefined })).toBeNull();
    expect(leerBeneficios({ ...PAGINA, dias: "x" })).toBeNull();
    expect(leerBeneficios({ ...PAGINA, escala: PAGINA.escala.slice(1) })).toBeNull();
    expect(leerBeneficios({ ...PAGINA, escala: null })).toBeNull();
  });
});

describe("problemasBeneficios: la regla del modal", () => {
  const bien = borradorDe(VIGENTES);

  it("lo vigente no tiene problemas y se guarda tal cual", () => {
    expect(Object.values(problemasBeneficios(bien)).every((p) => p === null)).toBe(true);
    expect(beneficiosDelBorrador(bien)).toEqual(VIGENTES);
  });

  it("el % va de 1 a 50 con hasta 2 decimales, y acepta coma", () => {
    expect(problemasBeneficios({ ...bien, pct: "12,5" }).pct).toBeNull();
    expect(beneficiosDelBorrador({ ...bien, pct: "12,5" })?.pct).toBe(12.5);
    for (const mal of ["0", "51", "10.555", "diez", "-5"]) expect(problemasBeneficios({ ...bien, pct: mal }).pct, mal).toMatch(/1 a 50/);
    expect(problemasBeneficios({ ...bien, pct: " " }).pct).toMatch(/Escribe/);
  });

  it("compras y días son enteros de 1 o más", () => {
    expect(problemasBeneficios({ ...bien, compras: "0" }).compras).toMatch(/entero/);
    expect(problemasBeneficios({ ...bien, compras: "6.5" }).compras).toMatch(/entero/);
    expect(problemasBeneficios({ ...bien, dias: "0" }).dias).toMatch(/entero/);
    expect(problemasBeneficios({ ...bien, dias: "" }).dias).toMatch(/Escribe/);
  });

  it("el monto y cada vale van en soles, mayores que 0", () => {
    expect(problemasBeneficios({ ...bien, monto: "0" }).monto).toMatch(/mayor que 0/);
    expect(problemasBeneficios({ ...bien, escala: ["20", "30", "", "50", "60"] }).escala).toMatch(/Escribe/);
    expect(problemasBeneficios({ ...bien, escala: ["20", "30", "0", "50", "60"] }).escala).toMatch(/mayor que 0/);
    expect(problemasBeneficios({ ...bien, escala: ["20", "30", "40", "50"] }).escala).toMatch(/del 1 al 5/);
  });

  it("con un problema no hay nada que guardar", () => {
    expect(beneficiosDelBorrador({ ...bien, monto: "abc" })).toBeNull();
  });

  it("la escala se manda con su año, como la devuelve la base", () => {
    expect(escalaParaGuardar([20, 30, 40, 50, 60])).toEqual([
      { anio: 1, monto: 20 },
      { anio: 2, monto: 30 },
      { anio: 3, monto: 40 },
      { anio: 4, monto: 50 },
      { anio: 5, monto: 60 },
    ]);
  });
});

describe("cambiosDeBeneficios: qué cambia, en palabras", () => {
  it("sin cambios, nada", () => {
    expect(cambiosDeBeneficios(VIGENTES, VIGENTES)).toEqual([]);
  });
  it("dice cada cambio con el antes y el después; el vale del 5 se lee «en adelante»", () => {
    expect(cambiosDeBeneficios(VIGENTES, { ...VIGENTES, pct: 12, monto: 700, escala: [20, 30, 40, 50, 80] })).toEqual([
      "Cumpleaños: 10 % → 12 %",
      "Monto en el año: S/ 600.00 → S/ 700.00",
      "Vale del año 5 en adelante: S/ 60.00 → S/ 80.00",
    ]);
  });
});

describe("guía de «Beneficios del club»", () => {
  const bien = borradorDe(VIGENTES);

  it("abre con todo hecho salvo quién firma, que es lo que sigue", () => {
    expect(estadosDe(camposDeBeneficios(bien, false))).toEqual({ pct: "hecho", compras: "hecho", monto: "hecho", dias: "hecho", escala: "hecho", responsable: "ahora" });
  });

  it("si se borra el %, el % es lo que sigue, con la frase de la regla real", () => {
    const b = { ...bien, pct: "" };
    const campos = camposDeBeneficios(b, true);
    expect(estadosDe(campos).pct).toBe("ahora");
    expect(campos.find((c) => c.id === "pct")?.pendiente).toBe(problemasBeneficios(b).pct);
  });

  // La coherencia que importa: «se puede guardar» según la guía ⇔ la regla real no tiene problemas (sin contar quién firma).
  it("coincide con problemasBeneficios en cada combinación", () => {
    const pcts = ["10", "", "0", "12,5", "51"];
    const enteros = ["6", "", "0", "6.5"];
    const montos = ["600", "", "0", "600.123"];
    const escalas: BorradorBeneficios["escala"][] = [["20", "30", "40", "50", "60"], ["20", "", "40", "50", "60"], ["20", "30", "40", "50", "-1"]];
    for (const pct of pcts)
      for (const compras of enteros)
        for (const dias of enteros)
          for (const monto of montos)
            for (const escala of escalas) {
              const b: BorradorBeneficios = { pct, compras, monto, dias, escala };
              const sinProblemas = Object.values(problemasBeneficios(b)).every((p) => p === null);
              expect(sePuedeConfirmar(camposDeBeneficios(b, true)), JSON.stringify(b)).toBe(sinProblemas);
              expect(beneficiosDelBorrador(b) !== null, JSON.stringify(b)).toBe(sinProblemas);
            }
  });

  it("sin quién firma no se puede guardar, aunque todo lo demás esté bien", () => {
    expect(sePuedeConfirmar(camposDeBeneficios(bien, false))).toBe(false);
  });
});

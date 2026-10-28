import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeFichaDeLaTela, camposDeIngresoDeInsumo, camposDeInsumoNuevo, ingresoListo, problemasDeInsumoNuevo, type EntradaInsumoNuevo } from "./insumos-guia";
import { CANTIDAD_ILEGIBLE } from "./insumos-reglas";
import { MONTO_ILEGIBLE } from "./monto-plata-reglas";

// La guía de las hojas de Insumos dice lo mismo que la hoja: se puede guardar exactamente cuando `problemasDeInsumoNuevo` no encuentra nada y alguien firma.

const base: EntradaInsumoNuevo = { tipo: "tela", codigo: "LIN-01", nombre: "Lino", merma: "", minimo: "", tejidoId: "", colorCodigo: "", responsableListo: true };

describe("problemasDeInsumoNuevo", () => {
  it("código y nombre son obligatorios; la merma va de 0 a menos de 50 %; el mínimo es un número desde cero", () => {
    expect(problemasDeInsumoNuevo(base)).toEqual([]);
    expect(problemasDeInsumoNuevo({ ...base, codigo: " " })).toEqual(["Ponle un código y un nombre al insumo."]);
    expect(problemasDeInsumoNuevo({ ...base, nombre: "" })).toEqual(["Ponle un código y un nombre al insumo."]);
    for (const m of ["50", "75", "-1", "abc"]) expect(problemasDeInsumoNuevo({ ...base, merma: m }), m).toEqual(["La merma va de 0 % a menos de 50 %."]);
    for (const m of ["0", "5", "49.9"]) expect(problemasDeInsumoNuevo({ ...base, merma: m }), m).toEqual([]);
    for (const m of ["-3", "abc"]) expect(problemasDeInsumoNuevo({ ...base, minimo: m }), m).toEqual(["El mínimo es un número desde 0 (o déjalo vacío si no hay)."]);
    for (const m of ["0", "12.5"]) expect(problemasDeInsumoNuevo({ ...base, minimo: m }), m).toEqual([]);
  });

  it("la coma decimal se entiende en la merma y en el mínimo («2,5»)", () => {
    expect(problemasDeInsumoNuevo({ ...base, merma: "2,5", minimo: "12,5" })).toEqual([]);
    expect(problemasDeInsumoNuevo({ ...base, merma: "49,9" })).toEqual([]);
    expect(problemasDeInsumoNuevo({ ...base, merma: "50,0" })).toEqual(["La merma va de 0 % a menos de 50 %."]);
  });

  it("una tela se lleva en metros: otra unidad se rechaza; un avío, en cualquiera (ADR-0554)", () => {
    for (const u of ["kilo", "unidad", "par", "cono", "docena"] as const) {
      expect(problemasDeInsumoNuevo({ ...base, tipo: "tela", unidad: u }), `tela en ${u}`).toEqual(["Una tela se lleva siempre en metros."]);
      expect(problemasDeInsumoNuevo({ ...base, tipo: "avio", unidad: u }), `avío en ${u}`).toEqual([]);
    }
    expect(problemasDeInsumoNuevo({ ...base, tipo: "tela", unidad: "metro" })).toEqual([]);
  });
});

describe("la guía de «Nuevo insumo»", () => {
  const casos: [string, Partial<EntradaInsumoNuevo>][] = [
    ["completa", {}],
    ["sin código", { codigo: "" }],
    ["sin nombre", { nombre: "  " }],
    ["merma buena", { merma: "5" }],
    ["merma rota", { merma: "80" }],
    ["mínimo bueno", { minimo: "20" }],
    ["mínimo roto", { minimo: "x" }],
    ["un avío", { tipo: "avio" }],
    ["con tejido y color", { tejidoId: "t1", colorCodigo: "VEBO" }],
  ];
  for (const [nombre, cambio] of casos) {
    for (const firma of [true, false]) {
      it(`${nombre}${firma ? "" : " · sin responsable"}: el botón se enciende justo cuando la hoja lo aceptaría`, () => {
        const e = { ...base, ...cambio, responsableListo: firma };
        expect(sePuedeConfirmar(camposDeInsumoNuevo(e))).toBe(problemasDeInsumoNuevo(e).length === 0 && firma);
      });
    }
  }

  it("el tejido y el color se SUGIEREN (se ven en «falta») pero nunca bloquean", () => {
    const campos = camposDeInsumoNuevo(base);
    expect(faltanDe(campos).map((c) => c.id)).toEqual(["tejido", "color"]);
    expect(sePuedeConfirmar(campos)).toBe(true);
  });

  it("un avío no pide tejido", () => {
    expect(camposDeInsumoNuevo({ ...base, tipo: "avio" }).map((c) => c.id)).not.toContain("tejido");
  });

  it("lo opcional vacío no se lista; escrito bien marca ✓", () => {
    const vacio = estadosDe(camposDeInsumoNuevo(base));
    expect(vacio).toMatchObject({ minimo: "opcional", merma: "opcional" });
    expect(estadosDe(camposDeInsumoNuevo({ ...base, minimo: "10", merma: "5" }))).toMatchObject({ minimo: "hecho", merma: "hecho" });
  });

  it("lo que sigue es lo primero que falta, en el orden de la hoja", () => {
    expect(estadosDe(camposDeInsumoNuevo({ ...base, codigo: "", nombre: "", responsableListo: false }))).toMatchObject({ codigo: "ahora", nombre: "falta", tejido: "falta", quien: "falta" });
  });
});

describe("la guía de la «Ficha de la tela»", () => {
  it("solo exige quién la anota; el tejido y el color se sugieren; un avío no pide tejido", () => {
    const tela = camposDeFichaDeLaTela({ tipo: "tela", tejidoId: "", colorCodigo: "", responsableListo: true });
    expect(sePuedeConfirmar(tela)).toBe(true);
    expect(faltanDe(tela).map((c) => c.id)).toEqual(["tejido", "color"]);
    expect(sePuedeConfirmar(camposDeFichaDeLaTela({ tipo: "tela", tejidoId: "t", colorCodigo: "c", responsableListo: false }))).toBe(false);
    expect(camposDeFichaDeLaTela({ tipo: "avio", tejidoId: "", colorCodigo: "", responsableListo: true }).map((c) => c.id)).toEqual(["color", "quien"]);
  });
});

describe("la guía de «Ingresar insumo»", () => {
  const entradas = [
    { tieneInsumo: true, cantidad: "100", costo: "12.5" },
    { tieneInsumo: true, cantidad: "100", costo: "0" },
    { tieneInsumo: true, cantidad: "100", costo: "" },
    { tieneInsumo: true, cantidad: "0", costo: "12" },
    { tieneInsumo: true, cantidad: "", costo: "12" },
    { tieneInsumo: true, cantidad: "abc", costo: "12" },
    { tieneInsumo: true, cantidad: "10", costo: "-3" },
    { tieneInsumo: false, cantidad: "10", costo: "12" },
  ];
  for (const e of entradas) {
    for (const firma of [true, false]) {
      it(`${JSON.stringify(e)}${firma ? "" : " · sin responsable"}: el botón se enciende justo cuando la hoja lo aceptaría`, () => {
        expect(sePuedeConfirmar(camposDeIngresoDeInsumo({ ...e, responsableListo: firma }))).toBe(ingresoListo(e) && firma);
      });
    }
  }
  it("un costo de cero escrito es válido (un regalo), un costo vacío no", () => {
    expect(ingresoListo({ tieneInsumo: true, cantidad: "5", costo: "0" })).toBe(true);
    expect(ingresoListo({ tieneInsumo: true, cantidad: "5", costo: " " })).toBe(false);
  });

  it("la coma decimal se entiende en la cantidad y en el costo", () => {
    expect(ingresoListo({ tieneInsumo: true, cantidad: "48,2", costo: "2,5" })).toBe(true);
    expect(ingresoListo({ tieneInsumo: true, cantidad: "48.2", costo: "2.5" })).toBe(true);
  });

  it("un costo que no se entiende NO se lee como cero: la hoja no deja guardar (antes «2,5,5» abría el lote gratis)", () => {
    for (const costo of ["abc", "2,5,5", "1e3", "S/ x"]) expect(ingresoListo({ tieneInsumo: true, cantidad: "5", costo }), costo).toBe(false);
  });

  it("una cantidad ambigua no se adivina: «1,299» ¿mil doscientos noventa y nueve o uno con tres?", () => {
    expect(ingresoListo({ tieneInsumo: true, cantidad: "1,299", costo: "2" })).toBe(false);
  });

  it("la guía dice QUÉ no se entendió, no solo que falta", () => {
    const campos = camposDeIngresoDeInsumo({ tieneInsumo: true, cantidad: "1,299", costo: "abc", responsableListo: true });
    expect(campos.find((c) => c.id === "cantidad")?.pendiente).toBe(CANTIDAD_ILEGIBLE);
    expect(campos.find((c) => c.id === "costo")?.pendiente).toBe(MONTO_ILEGIBLE);
    // Vacío no es «ilegible»: dice lo que falta.
    const vacios = camposDeIngresoDeInsumo({ tieneInsumo: true, cantidad: "", costo: "", responsableListo: true });
    expect(vacios.find((c) => c.id === "cantidad")?.pendiente).toBe("Escribe cuánto llegó (más de cero).");
    expect(vacios.find((c) => c.id === "costo")?.pendiente).toBe("Escribe el costo por unidad, sin IGV (0 si fue un regalo).");
  });
});

import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeFichaDeLaTela, camposDeIngresoDeInsumo, camposDeInsumoNuevo, ingresoListo, problemasDeInsumoNuevo, type EntradaInsumoNuevo } from "./insumos-guia";

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
});

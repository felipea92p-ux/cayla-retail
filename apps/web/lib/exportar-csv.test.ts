import { describe, expect, it } from "vitest";
import { celdaCsv, sinFormula, textoCsv } from "./exportar-csv";

describe("sinFormula — Excel no ejecuta lo que alguien escribió", () => {
  it.each(["=1+1", "=HYPERLINK(\"x\")", "+51 999 888", "-2+3", "@SUM(A1)", "\tTab", "\rRetorno"])("«%s» sale como texto", (t) => {
    expect(sinFormula(t)).toBe(`'${t}`);
  });

  it.each(["-12.50", "-5", "+3", "7", "0.5"])("un número puro «%s» no se toca: tiene que seguir sumando", (t) => {
    expect(sinFormula(t)).toBe(t);
  });

  it.each(["Polos", "A-B", "BLU-0042-AZM-M", "2026-10-12", "20123456789", "Boleta B004-000029"])("«%s» no cambia", (t) => {
    expect(sinFormula(t)).toBe(t);
  });
});

describe("celdaCsv — la única celda del ERP", () => {
  it("comillas si trae coma, comilla o salto de línea; vacío para nulos; números tal cual", () => {
    expect(celdaCsv("Hilados, del Norte")).toBe('"Hilados, del Norte"');
    expect(celdaCsv('Dijo "hola"')).toBe('"Dijo ""hola"""');
    expect(celdaCsv("dos\nlíneas")).toBe('"dos\nlíneas"');
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv(undefined)).toBe("");
    expect(celdaCsv(12.5)).toBe("12.5");
    expect(celdaCsv(-3)).toBe("-3");
  });

  it("neutraliza la fórmula antes de poner comillas", () => {
    expect(celdaCsv("=1,2")).toBe(`"'=1,2"`);
    expect(celdaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("con «;» (Finanzas) las comillas las pide el punto y coma, no la coma", () => {
    expect(celdaCsv("Hilados, del Norte", ";")).toBe("Hilados, del Norte");
    expect(celdaCsv("Uno; dos", ";")).toBe('"Uno; dos"');
    expect(celdaCsv("=1+1", ";")).toBe("'=1+1");
  });

  it("textoCsv la usa en cada celda, con el BOM al inicio", () => {
    expect(textoCsv(["Proveedor", "Monto"], [["=cmd", -12.5]])).toBe("﻿Proveedor,Monto\r\n'=cmd,-12.5");
  });
});

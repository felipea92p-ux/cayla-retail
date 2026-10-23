import { describe, expect, it } from "vitest";
import { chipsDeGastos, preguntaDeGastos, sedeDeLaCabecera } from "./gastos-telar-reglas";

const UBIC = [
  { id: "l", nombre: "Tienda Lima" },
  { id: "t", nombre: "Taller" },
];
const todas = { clave: "todas", ubicacionId: null, soloEmpresa: false };
const empresa = { clave: "empresa", ubicacionId: null, soloEmpresa: true };
const lima = { clave: "l", ubicacionId: "l", soloEmpresa: false };
const taller = { clave: "t", ubicacionId: "t", soloEmpresa: false };

describe("la cabecera de Gastos en el telar", () => {
  it("pregunta por quien se mira, en el mes elegido", () => {
    expect(preguntaDeGastos(todas, UBIC, "2026-10")).toBe("¿Cuánto gastó CAYLA en octubre?");
    expect(preguntaDeGastos(lima, UBIC, "2026-09")).toBe("¿Cuánto gastó Lima en septiembre?");
    expect(preguntaDeGastos(taller, UBIC, "2026-10")).toBe("¿Cuánto gastó el Taller en octubre?");
    expect(preguntaDeGastos(empresa, UBIC, "2026-10")).toBe("¿Cuánto gastó la empresa en octubre?");
  });

  it("arriba nombra la sede como su hilo", () => {
    expect([todas, lima, taller, empresa].map((v) => sedeDeLaCabecera(v, UBIC))).toEqual(["Todas las sedes", "Lima", "Taller", "Empresa"]);
  });

  it("los chips cuentan los gastos y avisan los que no tienen comprobante", () => {
    expect(chipsDeGastos({ n: 1, sinComprobante: 0 })).toEqual([{ texto: "1 gasto", tono: "pizarra" }]);
    expect(chipsDeGastos({ n: 12, sinComprobante: 3 })).toEqual([
      { texto: "12 gastos", tono: "pizarra" },
      { texto: "3 sin comprobante", tono: "ambar" },
    ]);
  });
});

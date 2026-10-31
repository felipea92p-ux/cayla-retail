import { describe, expect, it } from "vitest";
import { SIN_FILTROS, chipsDeGastos, fallaLegible, filtrarGastos, filtrosPuestosDeGastos, preguntaDeGastos, sedeDeLaCabecera } from "./gastos-telar-reglas";

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

describe("la lista de Gastos", () => {
  const G = [
    { categoria: "luz", estado: "vigente" as const, montoTotal: 180, ubicacionId: "l", categoriaNombre: "Servicios básicos", fecha: "2026-10-05", descripcion: "Luz del Baño", proveedorNombre: "Hidrandina", comprobante: "F001-1", comprobanteTipo: "factura" },
    { categoria: "taxi", estado: "vigente" as const, montoTotal: 12, ubicacionId: null, categoriaNombre: "Movilidad", fecha: "2026-10-07", descripcion: "Taxi a Gamarra", proveedorNombre: null, comprobante: null, comprobanteTipo: "sin_comprobante" },
  ];
  const nada = SIN_FILTROS;

  it("busca sin tildes ni mayúsculas, también por la categoría", () => {
    expect(filtrarGastos(G, { ...nada, q: "bano" }, "2026-10").map((g) => g.categoria)).toEqual(["luz"]);
    expect(filtrarGastos(G, { ...nada, q: "MOVILIDAD" }, "2026-10").map((g) => g.categoria)).toEqual(["taxi"]);
  });

  it("filtra por categoría, día y comprobante a la vez", () => {
    expect(filtrarGastos(G, { ...nada, dia: 7 }, "2026-10")).toHaveLength(1);
    expect(filtrarGastos(G, { ...nada, comprobante: "sin" }, "2026-10").map((g) => g.categoria)).toEqual(["taxi"]);
    expect(filtrarGastos(G, { ...nada, comprobante: "con" }, "2026-10").map((g) => g.categoria)).toEqual(["luz"]);
    expect(filtrarGastos(G, { ...nada, categoria: "luz", dia: 7 }, "2026-10")).toEqual([]);
  });

  it("«sin comprobante, de S/ 300 o más» deja solo lo que marca la lista (lo chico sin papel no)", () => {
    const grande = { ...G[1]!, descripcion: "Arreglo de la vitrina", montoTotal: 450 };
    const anulado = { ...grande, estado: "anulado" as const };
    expect(filtrarGastos([...G, grande, anulado], { ...nada, comprobante: "sin_grande" }, "2026-10").map((g) => g.descripcion)).toEqual(["Arreglo de la vitrina"]);
    expect(filtrosPuestosDeGastos({ ...nada, comprobante: "sin_grande" }, () => "", "octubre").map((f) => f.texto)).toEqual(["Sin comprobante, de S/\u00a0300 o más"]);
  });

  it("filtra por la sede que se eligió en «En qué se va» (la empresa también)", () => {
    expect(filtrarGastos(G, { ...nada, sede: "l" }, "2026-10").map((g) => g.categoria)).toEqual(["luz"]);
    expect(filtrarGastos(G, { ...nada, sede: "empresa" }, "2026-10").map((g) => g.categoria)).toEqual(["taxi"]);
    expect(filtrarGastos(G, { ...nada, categoria: "luz", sede: "empresa" }, "2026-10")).toEqual([]);
  });

  it("los filtros puestos se leen como píldoras", () => {
    expect(filtrosPuestosDeGastos({ q: " gamarra ", categoria: "taxi", sede: "l", dia: 7, comprobante: "sin" }, () => "Movilidad", "octubre", () => "Lima").map((f) => f.texto)).toEqual([
      "Movilidad",
      "En Lima",
      "El 7 de octubre",
      "Sin comprobante",
      "«gamarra»",
    ]);
    expect(filtrosPuestosDeGastos(nada, () => "", "octubre")).toEqual([]);
  });

  it("una falla se dice sin el texto técnico de la base", () => {
    expect(fallaLegible("No se pudo leer el IGV perdido por pagar sin banco: Could not find the function retail.fn_x in the schema cache")).toBe(
      "No se pudo leer el IGV perdido por pagar sin banco.",
    );
    expect(fallaLegible("No se pudo leer los gastos.")).toBe("No se pudo leer los gastos.");
  });
});

import { describe, expect, it } from "vitest";
import { calendarioDelMes, chipsDeGastos, fallaLegible, filtrarGastos, filtrosPuestosDeGastos, preguntaDeGastos, sedeDeLaCabecera } from "./gastos-telar-reglas";

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

describe("el calendario", () => {
  it("octubre de 2026 empieza en jueves: tres huecos; lo de después de hoy es futuro", () => {
    const c = calendarioDelMes(
      [
        { fecha: "2026-10-05", montoTotal: 400, estado: "vigente" },
        { fecha: "2026-10-05", montoTotal: 0, estado: "vigente" },
        { fecha: "2026-10-07", montoTotal: 100, estado: "vigente" },
        { fecha: "2026-10-07", montoTotal: 900, estado: "anulado" },
        { fecha: "2026-09-30", montoTotal: 50, estado: "vigente" },
      ],
      "2026-10",
      "2026-10-23",
    );
    expect(c.huecos).toBe(3);
    expect(c.dias).toHaveLength(31);
    expect(c.dias[4]).toMatchObject({ dia: 5, total: 400, n: 2, intensidad: 1, futuro: false });
    expect(c.dias[6]).toMatchObject({ dia: 7, total: 100, intensidad: 0.5 });
    expect(c.dias[22]!.futuro).toBe(false);
    expect(c.dias[23]!.futuro).toBe(true);
  });
});

describe("la lista de Gastos", () => {
  const G = [
    { categoria: "luz", categoriaNombre: "Servicios básicos", fecha: "2026-10-05", descripcion: "Luz del Baño", proveedorNombre: "Hidrandina", comprobante: "F001-1", comprobanteTipo: "factura" },
    { categoria: "taxi", categoriaNombre: "Movilidad", fecha: "2026-10-07", descripcion: "Taxi a Gamarra", proveedorNombre: null, comprobante: null, comprobanteTipo: "sin_comprobante" },
  ];
  const nada = { q: "", categoria: "", dia: null, comprobante: "todos" as const };

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

  it("los filtros puestos se leen como píldoras", () => {
    expect(filtrosPuestosDeGastos({ q: " gamarra ", categoria: "taxi", dia: 7, comprobante: "sin" }, () => "Movilidad", "octubre").map((f) => f.texto)).toEqual([
      "Movilidad",
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

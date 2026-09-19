import { describe, expect, it } from "vitest";
import {
  avisosDe,
  esEmpresa,
  etiquetaOrigenMerma,
  porcentajeMargen,
  separarFilas,
  sinActividad,
  solesConSigno,
  textoPorcentaje,
  type FilaResultados,
} from "./resultados-reglas";

const fila = (over: Partial<FilaResultados> = {}): FilaResultados => ({
  ubicacionId: "tru",
  nombre: "Tienda TRU",
  esConsolidado: false,
  ventasNetas: 0,
  costoVentas: 0,
  fletes: 0,
  mermas: 0,
  margenBruto: 0,
  gastosOperacion: 0,
  utilidadOperativa: 0,
  igvVentas: 0,
  ventasBrutas: 0,
  detalleMermas: [],
  detalleGastos: [],
  unidadesSinCosto: 0,
  mermasSinCosto: 0,
  asientosDescuadrados: 0,
  ...over,
});

describe("solesConSigno", () => {
  it("un negativo lleva el signo menos de verdad y el símbolo pegado a la cifra", () => {
    expect(solesConSigno(-93.57)).toBe("−S/ 93.57");
    expect(solesConSigno(1234.5)).toBe("S/ 1,234.50");
  });
  it("cero, y un negativo que redondea a cero, no llevan signo", () => {
    expect(solesConSigno(0)).toBe("S/ 0.00");
    expect(solesConSigno(-0.001)).toBe("S/ 0.00");
  });
});

describe("porcentajeMargen", () => {
  it("es margen sobre ventas netas, con un decimal", () => expect(porcentajeMargen({ margenBruto: 37.12, ventasNetas: 127.12 })).toBe(29.2));
  it("puede ser negativo", () => expect(porcentajeMargen({ margenBruto: -93.57, ventasNetas: 186.43 })).toBe(-50.2));
  it("sin ventas no hay margen: null, no infinito ni cero", () => {
    expect(porcentajeMargen({ margenBruto: -50, ventasNetas: 0 })).toBeNull();
    expect(textoPorcentaje(null)).toBe("—");
    expect(textoPorcentaje(29.2)).toBe("29.2 %");
    expect(textoPorcentaje(-50.2)).toBe("−50.2 %");
  });
});

describe("separarFilas", () => {
  it("distingue consolidado, «De la empresa» y sedes aunque comparta ubicacionId nulo", () => {
    const filas = [fila({ ubicacionId: "a" }), fila({ ubicacionId: null, nombre: "De la empresa" }), fila({ ubicacionId: null, nombre: "Consolidado", esConsolidado: true })];
    const r = separarFilas(filas);
    expect(r.consolidado?.nombre).toBe("Consolidado");
    expect(r.empresa?.nombre).toBe("De la empresa");
    expect(r.sedes.map((s) => s.ubicacionId)).toEqual(["a"]);
  });
});

describe("esEmpresa", () => {
  it("«De la empresa» tiene ubicación nula y no es el consolidado; el consolidado también tiene ubicación nula", () => {
    expect(esEmpresa(fila({ ubicacionId: null, nombre: "De la empresa" }))).toBe(true);
    expect(esEmpresa(fila({ ubicacionId: null, esConsolidado: true }))).toBe(false);
    expect(esEmpresa(fila({ ubicacionId: "tru" }))).toBe(false);
  });
});

describe("sinActividad", () => {
  it("una sede sin nada se apaga; con un solo gasto ya no", () => {
    expect(sinActividad(fila())).toBe(true);
    expect(sinActividad(fila({ gastosOperacion: 10 }))).toBe(false);
  });
});

describe("avisosDe", () => {
  it("sin problemas no avisa nada", () => expect(avisosDe(fila())).toEqual([]));
  it("un descuadre es rojo y va primero: sin él las cifras no valen", () => {
    const a = avisosDe(fila({ asientosDescuadrados: 2, unidadesSinCosto: 3 }));
    expect(a[0].tono).toBe("rojo");
    expect(a[0].texto).toMatch(/2 operaciones/);
    expect(a[1].tono).toBe("ambar");
  });
  it("dice el margen sale MÁS ALTO cuando faltan costos, y singular/plural bien", () => {
    expect(avisosDe(fila({ unidadesSinCosto: 1 }))[0].texto).toMatch(/1 prenda vendida sin costo cargado.*más alto/);
    expect(avisosDe(fila({ unidadesSinCosto: 3 }))[0].texto).toMatch(/3 prendas vendidas/);
  });
  it("las mermas sin valorizar dicen que están SUBESTIMADAS", () => {
    expect(avisosDe(fila({ mermasSinCosto: 2 }))[0].texto).toMatch(/subestimadas/);
  });
});

describe("etiquetaOrigenMerma", () => {
  it("traduce los códigos de regla y deja pasar uno desconocido (no lo esconde)", () => {
    expect(etiquetaOrigenMerma("merma_conteo")).toBe("Faltantes de conteo");
    expect(etiquetaOrigenMerma("anulacion")).toMatch(/anuladas/);
    expect(etiquetaOrigenMerma("regla_nueva")).toBe("regla_nueva");
  });
});

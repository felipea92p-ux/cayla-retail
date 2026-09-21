import { describe, expect, it } from "vitest";
import type { CodigoDescuento } from "./codigos-descuento";
import { camposDeBusquedaDelCodigo, chipDelCodigo, detalleDelCodigo, DIAS_CODIGO_POR_VENCER, estadoDelCodigo, ordenarCodigos, resumenDeCodigos, textoDeVigencia } from "./facturacion-codigos-reglas";

const HOY = "2026-09-19";

function codigo(extra: Partial<CodigoDescuento> = {}): CodigoDescuento {
  return {
    codigo: "VERANO26",
    porcentaje: 10,
    vigenteDesde: null,
    vigenteHasta: null,
    activo: true,
    ubicacionId: null,
    ubicacionNombre: null,
    createdAt: "2026-09-01T12:00:00Z",
    ...extra,
  };
}

describe("estadoDelCodigo", () => {
  it("un código prendido y sin fechas siempre vale", () => {
    expect(estadoDelCodigo(codigo(), HOY)).toBe("vigente");
  });

  it("apagado manda sobre las fechas: un código apagado no funciona aunque esté en su vigencia", () => {
    expect(estadoDelCodigo(codigo({ activo: false, vigenteDesde: "2026-09-01", vigenteHasta: "2026-12-31" }), HOY)).toBe("apagado");
  });

  it("antes de su primer día es programado; después de su último día, vencido", () => {
    expect(estadoDelCodigo(codigo({ vigenteDesde: "2026-09-20" }), HOY)).toBe("programado");
    expect(estadoDelCodigo(codigo({ vigenteHasta: "2026-09-18" }), HOY)).toBe("vencido");
  });

  it("el primer y el último día todavía valen", () => {
    expect(estadoDelCodigo(codigo({ vigenteDesde: HOY, vigenteHasta: "2026-12-31" }), HOY)).toBe("vigente");
    expect(estadoDelCodigo(codigo({ vigenteDesde: "2026-09-01", vigenteHasta: HOY }), HOY)).not.toBe("vencido");
  });

  it(`vence pronto si le quedan ${DIAS_CODIGO_POR_VENCER} días o menos, contando hoy`, () => {
    expect(estadoDelCodigo(codigo({ vigenteHasta: HOY }), HOY)).toBe("porVencer");
    expect(estadoDelCodigo(codigo({ vigenteHasta: "2026-09-26" }), HOY)).toBe("porVencer");
    expect(estadoDelCodigo(codigo({ vigenteHasta: "2026-09-27" }), HOY)).toBe("vigente");
  });
});

describe("resumenDeCodigos", () => {
  it("cuenta cada estado; los que vencen pronto también son vigentes", () => {
    const r = resumenDeCodigos(
      [
        codigo(),
        codigo({ vigenteHasta: "2026-09-22" }),
        codigo({ vigenteDesde: "2026-10-01" }),
        codigo({ vigenteHasta: "2026-08-31" }),
        codigo({ activo: false }),
        codigo({ activo: false, vigenteHasta: "2026-01-01" }),
      ],
      HOY
    );
    expect(r).toEqual({ vigentes: 2, porVencer: 1, programados: 1, vencidos: 1, apagados: 2 });
  });

  it("sin códigos todo es cero", () => {
    expect(resumenDeCodigos([], HOY)).toEqual({ vigentes: 0, porVencer: 0, programados: 0, vencidos: 0, apagados: 0 });
  });
});

describe("ordenarCodigos (excepciones primero)", () => {
  it("por vencer, vigentes, programados, vencidos y al final los apagados", () => {
    const orden = ordenarCodigos(
      [
        codigo({ codigo: "APAGADO", activo: false }),
        codigo({ codigo: "VENCIDO-VIEJO", vigenteHasta: "2026-07-01" }),
        codigo({ codigo: "VIGENTE", createdAt: "2026-09-10T00:00:00Z" }),
        codigo({ codigo: "PROGRAMADO-LEJOS", vigenteDesde: "2026-12-01" }),
        codigo({ codigo: "VENCIDO-RECIENTE", vigenteHasta: "2026-09-15" }),
        codigo({ codigo: "PROGRAMADO-CERCA", vigenteDesde: "2026-09-25" }),
        codigo({ codigo: "POR-VENCER", vigenteHasta: "2026-09-21" }),
        codigo({ codigo: "POR-VENCER-HOY", vigenteHasta: HOY }),
      ],
      HOY
    ).map((c) => c.codigo);
    expect(orden).toEqual(["POR-VENCER-HOY", "POR-VENCER", "VIGENTE", "PROGRAMADO-CERCA", "PROGRAMADO-LEJOS", "VENCIDO-RECIENTE", "VENCIDO-VIEJO", "APAGADO"]);
  });

  it("entre los vigentes va primero el más nuevo", () => {
    const orden = ordenarCodigos([codigo({ codigo: "VIEJO", createdAt: "2026-01-01T00:00:00Z" }), codigo({ codigo: "NUEVO", createdAt: "2026-09-01T00:00:00Z" })], HOY).map((c) => c.codigo);
    expect(orden).toEqual(["NUEVO", "VIEJO"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [codigo({ codigo: "B", activo: false }), codigo({ codigo: "A" })];
    ordenarCodigos(original, HOY);
    expect(original.map((c) => c.codigo)).toEqual(["B", "A"]);
  });
});

describe("chipDelCodigo", () => {
  it("cada estado con su palabra y su tono; ninguno en rojo", () => {
    expect(chipDelCodigo(codigo(), HOY)).toEqual({ tono: "verde", texto: "Vigente" });
    expect(chipDelCodigo(codigo({ vigenteHasta: "2026-09-21" }), HOY)).toEqual({ tono: "ambar", texto: "Por vencer" });
    expect(chipDelCodigo(codigo({ vigenteDesde: "2026-10-01" }), HOY)).toEqual({ tono: "neutro", texto: "Programado" });
    expect(chipDelCodigo(codigo({ vigenteHasta: "2026-08-01" }), HOY)).toEqual({ tono: "apagado", texto: "Vencido" });
    expect(chipDelCodigo(codigo({ activo: false }), HOY)).toEqual({ tono: "apagado", texto: "Apagado" });
  });
});

describe("detalleDelCodigo", () => {
  it("cuándo vence: hoy, mañana o en N días; solo lo que vence pronto pide ámbar", () => {
    expect(detalleDelCodigo(codigo({ vigenteHasta: HOY }), HOY)).toEqual({ texto: "Vence hoy", urgente: true });
    expect(detalleDelCodigo(codigo({ vigenteHasta: "2026-09-20" }), HOY)).toEqual({ texto: "Vence mañana", urgente: true });
    expect(detalleDelCodigo(codigo({ vigenteHasta: "2026-09-24" }), HOY)).toEqual({ texto: "Vence en 5 d", urgente: true });
    expect(detalleDelCodigo(codigo({ vigenteHasta: "2026-12-31" }), HOY)).toEqual({ texto: "Vence en 103 d", urgente: false });
  });

  it("cuándo empieza y hace cuánto venció", () => {
    expect(detalleDelCodigo(codigo({ vigenteDesde: "2026-09-20" }), HOY)).toEqual({ texto: "Empieza mañana", urgente: false });
    expect(detalleDelCodigo(codigo({ vigenteDesde: "2026-09-29" }), HOY)).toEqual({ texto: "Empieza en 10 d", urgente: false });
    expect(detalleDelCodigo(codigo({ vigenteHasta: "2026-09-18" }), HOY)).toEqual({ texto: "Venció ayer", urgente: false });
    expect(detalleDelCodigo(codigo({ vigenteHasta: "2026-09-09" }), HOY)).toEqual({ texto: "Venció hace 10 d", urgente: false });
  });

  it("vigente sin fecha límite y apagado no dicen nada", () => {
    expect(detalleDelCodigo(codigo(), HOY)).toBeNull();
    expect(detalleDelCodigo(codigo({ vigenteDesde: "2026-09-01" }), HOY)).toBeNull();
    expect(detalleDelCodigo(codigo({ activo: false, vigenteHasta: "2026-12-31" }), HOY)).toBeNull();
  });
});

describe("textoDeVigencia", () => {
  it("las cuatro formas", () => {
    expect(textoDeVigencia(codigo())).toBe("Sin fecha límite");
    expect(textoDeVigencia(codigo({ vigenteHasta: "2026-12-31" }))).toBe("Hasta 31/12/2026");
    expect(textoDeVigencia(codigo({ vigenteDesde: "2026-10-01" }))).toBe("Desde 01/10/2026");
    expect(textoDeVigencia(codigo({ vigenteDesde: "2026-10-01", vigenteHasta: "2026-12-31" }))).toBe("01/10/2026 — 31/12/2026");
  });
});

describe("camposDeBusquedaDelCodigo", () => {
  it("se encuentra por código, porcentaje, sede, estado y vigencia", () => {
    const texto = camposDeBusquedaDelCodigo(codigo({ codigo: "TRUJILLO15", porcentaje: 15, ubicacionNombre: "Tienda Trujillo", vigenteHasta: "2026-12-31" }), HOY).join(" ");
    for (const esperado of ["TRUJILLO15", "15%", "Tienda Trujillo", "Vigente", "31/12/2026"]) expect(texto).toContain(esperado);
  });

  it("sin sede se encuentra escribiendo «todas»", () => {
    expect(camposDeBusquedaDelCodigo(codigo(), HOY).join(" ")).toContain("Todas las sedes");
  });
});

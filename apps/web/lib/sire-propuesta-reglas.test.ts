import { describe, expect, it } from "vitest";
import { decodificarTexto, leerPropuestaSire, normalizarTitulo, numeroSinCeros } from "./sire-propuesta-reglas";

// Ejemplo INVENTADO con los títulos de la propuesta del RCE (anexo de la RS 112-2021/SUNAT). Los proveedores no existen: el repo es
// público y una propuesta real trae los RUC de los proveedores de CAYLA.
const RUC = "20605964550";
const TITULOS_RCE = [
  "RUC", "Apellidos y Nombres o Razón social", "Periodo", "CAR SUNAT", "Fecha de emisión", "Fecha Vcto/Pago", "Tipo CP/Doc.",
  "Serie del CDP", "Año", "Nro CP o Doc. Nro Inicial (Rango)", "Nro Final (Rango)", "Tipo Doc Identidad", "Nro Doc Identidad",
  "Apellidos Nombres/ Razón Social", "BI Gravado DG", "IGV / IPM DG", "BI Gravado DGNG", "IGV / IPM DGNG", "BI Gravado DNG",
  "IGV / IPM DNG", "Valor Adq. NG", "ISC", "ICBPER", "Otros Trib/ Cargos", "Total CP", "Moneda", "Tipo de Cambio",
  "Fecha Emisión Doc Modificado", "Tipo CP Modificado", "Serie CP Modificado", "COD. DAM O DSI", "Nro CP Modificado",
].join("|");

type Fila = { periodo?: string; tipo?: string; serie: string; numero: string; ruc: string; nombre?: string; base: number; igv: number; total: number; moneda?: string; tc?: string; fecha?: string; rucPropio?: string };
function filaRce(f: Fila): string {
  return [
    f.rucPropio ?? RUC, "CAYLA S.A.C.", f.periodo ?? "202610", "CAR0001", f.fecha ?? "05/10/2026", "", f.tipo ?? "01", f.serie, "",
    f.numero, "", "6", f.ruc, f.nombre ?? "PROVEEDOR DE PRUEBA S.A.C.", f.base.toFixed(2), f.igv.toFixed(2), "0.00", "0.00", "0.00",
    "0.00", "0.00", "0.00", "0.00", "0.00", f.total.toFixed(2), f.moneda ?? "PEN", f.tc ?? "", "", "", "", "", "",
  ].join("|");
}

const OCTUBRE = { registro: "compras" as const, mes: "2026-10", ruc: RUC };

describe("normalizarTitulo y numeroSinCeros", () => {
  it("quita tildes, mayúsculas y signos", () => {
    expect(normalizarTitulo("IGV / IPM DG")).toBe("igv ipm dg");
    expect(normalizarTitulo("Fecha de emisión")).toBe("fecha de emision");
  });
  it("quita los ceros de la izquierda sin dejar vacío", () => {
    expect(numeroSinCeros("00001234")).toBe("1234");
    expect(numeroSinCeros("0")).toBe("0");
    expect(numeroSinCeros("000")).toBe("0");
  });
});

describe("leerPropuestaSire", () => {
  it("lee una propuesta de compras con sus montos", () => {
    const texto = [TITULOS_RCE, filaRce({ serie: "f001", numero: "00000123", ruc: "20100000001", base: 100, igv: 18, total: 118 })].join("\r\n");
    const r = leerPropuestaSire(texto, OCTUBRE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.propuesta.lineas).toHaveLength(1);
    const l = r.propuesta.lineas[0]!;
    expect(l).toMatchObject({ tipo: "01", serie: "F001", numero: "123", docNumero: "20100000001", base: 100, igv: 18, total: 118, moneda: "PEN", fecha: "2026-10-05" });
  });

  it("suma la base y el IGV de los tres destinos de compras", () => {
    const fila = filaRce({ serie: "F001", numero: "9", ruc: "20100000001", base: 100, igv: 18, total: 236 }).split("|");
    fila[16] = "100.00"; // BI Gravado DGNG
    fila[17] = "18.00"; // IGV DGNG
    const r = leerPropuestaSire([TITULOS_RCE, fila.join("|")].join("\n"), OCTUBRE);
    expect(r.ok && r.propuesta.lineas[0]).toMatchObject({ base: 200, igv: 36 });
  });

  it("una propuesta sin comprobantes es válida", () => {
    const r = leerPropuestaSire(TITULOS_RCE + "\n", OCTUBRE);
    expect(r.ok && r.propuesta.lineas).toEqual([]);
  });

  it("el BOM del principio no estorba", () => {
    const r = leerPropuestaSire("﻿" + TITULOS_RCE, OCTUBRE);
    expect(r.ok).toBe(true);
  });

  it("dice qué columna falta si no es una propuesta", () => {
    const r = leerPropuestaSire("fecha;proveedor;monto\n05/10/2026;X;10", OCTUBRE);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("falta la columna «RUC»") });
  });

  it("rechaza la propuesta de ventas donde va la de compras", () => {
    const titulosVentas = TITULOS_RCE.replace("BI Gravado DG", "BI Gravada").replace(/\|BI Gravado DGNG|\|BI Gravado DNG/g, "|X");
    const r = leerPropuestaSire(titulosVentas, OCTUBRE);
    expect(r).toEqual({ ok: false, error: "Este archivo es la propuesta de ventas. Aquí va la de compras." });
  });

  it("rechaza otro mes y otro RUC, diciendo cuál es", () => {
    const setiembre = leerPropuestaSire([TITULOS_RCE, filaRce({ periodo: "202609", serie: "F001", numero: "1", ruc: "20100000001", base: 1, igv: 0.18, total: 1.18 })].join("\n"), OCTUBRE);
    expect(setiembre).toEqual({ ok: false, error: expect.stringContaining("Es la propuesta de septiembre 2026 y estás comparando octubre 2026") });
    const otro = leerPropuestaSire([TITULOS_RCE, filaRce({ rucPropio: "20999999999", serie: "F001", numero: "1", ruc: "20100000001", base: 1, igv: 0.18, total: 1.18 })].join("\n"), OCTUBRE);
    expect(otro).toEqual({ ok: false, error: expect.stringContaining("otro RUC (20999999999)") });
  });

  it("lee las columnas por su nombre aunque cambien de lugar", () => {
    const titulos = TITULOS_RCE.split("|");
    const fila = filaRce({ serie: "F002", numero: "7", ruc: "20100000002", base: 50, igv: 9, total: 59 }).split("|");
    const orden = titulos.map((_, i) => i).reverse();
    const texto = [orden.map((i) => titulos[i]).join("|"), orden.map((i) => fila[i]).join("|")].join("\n");
    const r = leerPropuestaSire(texto, OCTUBRE);
    expect(r.ok && r.propuesta.lineas[0]).toMatchObject({ serie: "F002", numero: "7", total: 59 });
  });

  it("guarda la moneda y el tipo de cambio de una factura en dólares", () => {
    const r = leerPropuestaSire([TITULOS_RCE, filaRce({ serie: "F001", numero: "5", ruc: "20100000001", base: 100, igv: 18, total: 118, moneda: "USD", tc: "3.750" })].join("\n"), OCTUBRE);
    expect(r.ok && r.propuesta.lineas[0]).toMatchObject({ moneda: "USD", tipoCambio: 3.75 });
  });
});

describe("decodificarTexto", () => {
  it("lee UTF-8 y, si no lo es, Windows-1252", () => {
    expect(decodificarTexto(new TextEncoder().encode("Razón"))).toBe("Razón");
    expect(decodificarTexto(new Uint8Array([0x52, 0x61, 0x7a, 0xf3, 0x6e]))).toBe("Razón");
  });
});

describe("leerPropuestaGuardada y lineasParaGuardar", () => {
  it("lo que se guarda vuelve igual al leerlo", async () => {
    const { leerPropuestaGuardada, lineasParaGuardar } = await import("./sire-propuesta-reglas");
    const r = leerPropuestaSire([TITULOS_RCE, filaRce({ serie: "F001", numero: "12", ruc: "20100000001", base: 100, igv: 18, total: 118, moneda: "USD", tc: "3.75" })].join("\n"), OCTUBRE);
    if (!r.ok) throw new Error(r.error);
    // La base devuelve los montos como texto (numeric) y la fecha como «AAAA-MM-DD».
    const comoTexto = lineasParaGuardar(r.propuesta.lineas).map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === "number" ? v.toFixed(2) : v])));
    const guardada = leerPropuestaGuardada({ id: "x", registro: "compras", mes: "2026-10", origen: "archivo", archivo: "p.txt", subida_at: "2026-11-02T10:00:00Z", subida_por: "Ana", versiones: 2, lineas: comoTexto });
    expect(guardada?.lineas).toEqual(r.propuesta.lineas);
    expect(guardada).toMatchObject({ versiones: 2, subidaPor: "Ana", archivo: "p.txt" });
  });
  it("sin propuesta devuelve null", async () => {
    const { leerPropuestaGuardada } = await import("./sire-propuesta-reglas");
    expect(leerPropuestaGuardada(null)).toBeNull();
  });
});

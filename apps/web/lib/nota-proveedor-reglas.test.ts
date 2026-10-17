import { describe, expect, it } from "vitest";
import {
  argsNotaProveedor,
  borradorNotaProveedor,
  camposNotaProveedor,
  cifrasDeLaNota,
  detalleNotaProveedor,
  documentosParaLaNota,
  leerNotaProveedor,
  mensajeDeNotaProveedor,
  problemasNotaProveedor,
  seriesDelComprobante,
  sugiereRecargarNotaProveedor,
} from "./nota-proveedor-reglas";
import { armarFilas, type FilaTablero } from "./notas-credito-reglas";
import { sePuedeConfirmar } from "./guia-campos";

// «Llegó su nota de crédito» (ADR-0362, fase 5b, actividad 3): la lógica pura de la hoja. El espejo de `adjuntar_nota_proveedor`.

const HOY = "2026-10-15";

function fila(p: Partial<FilaTablero> & Pick<FilaTablero, "id">): FilaTablero {
  return {
    clase: "nota",
    compraId: "fac-1",
    documento: "F001-901",
    proveedorId: "prov-1",
    proveedorNombre: "Hilandería Andina SAC",
    serieNumero: null,
    fecha: HOY,
    monto: 0,
    aplicado: 0,
    aFavor: 0,
    igv: 0,
    motivo: "faltante",
    nota: null,
    cierreId: null,
    compraTotal: 236,
    compraSaldo: 165.2,
    compraFechaEmision: "2026-10-10",
    compraEstado: "vigente",
    unidadesCerradas: 1,
    montoEsperado: 0,
    cerradoEn: null,
    creadoEn: `${HOY}T12:00:00Z`,
    resuelto: true,
    ...p,
    notaProveedor: p.notaProveedor ?? null,
  };
}

// Dos documentos internos de la F001-901 (1 y 2 camisas), uno de otra factura, uno de una boleta y una nota del proveedor ya registrada.
const filas = armarFilas(
  [
    fila({ id: "di-1", serieNumero: "DI-000045", monto: 23.6, igv: 3.6, aplicado: 23.6 }),
    fila({ id: "di-2", serieNumero: "DI-000046", monto: 47.2, igv: 7.2, aplicado: 47.2 }),
    fila({ id: "di-otra", compraId: "fac-2", documento: "F001-902", serieNumero: "DI-000047", monto: 70.8, igv: 10.8, aplicado: 70.8 }),
    fila({ id: "di-bol", compraId: "bol-1", documento: "B001-903", serieNumero: "DI-000048", monto: 25, igv: 0, aplicado: 25 }),
    fila({ id: "nc", serieNumero: "FC01-000001", motivo: "devolucion", monto: 11.8, igv: 1.8, aplicado: 11.8 }),
  ],
  { hoy: HOY, saldoPorProveedor: {}, movimientos: [] },
);
const por = (id: string) => filas.find((f) => f.id === id)!;

describe("qué respalda la nota", () => {
  it("los documentos internos de la misma factura que la esperan, el tocado primero; nunca los de otra factura ni de una boleta", () => {
    expect(documentosParaLaNota(filas, por("di-2")).map((f) => f.id)).toEqual(["di-2", "di-1"]);
    expect(documentosParaLaNota(filas, por("di-otra")).map((f) => f.id)).toEqual(["di-otra"]);
    expect(documentosParaLaNota(filas, por("di-bol"))).toEqual([]);
  });
  it("uno que ya tiene su nota ya no se ofrece", () => {
    const conNota = armarFilas([fila({ id: "di-1", serieNumero: "DI-000045", monto: 23.6, igv: 3.6, notaProveedor: { id: "np", serie: "FC01-7", fecha: HOY } }), fila({ id: "di-2", serieNumero: "DI-000046", monto: 47.2, igv: 7.2 })], { hoy: HOY, saldoPorProveedor: {}, movimientos: [] });
    expect(documentosParaLaNota(conNota, conNota[1]!).map((f) => f.id)).toEqual(["di-2"]);
    expect(seriesDelComprobante(conNota, "fac-1")).toEqual(["DI-000045", "FC01-7", "DI-000046"]);
  });
  it("lo que la nota tiene que decir: la suma de lo elegido, con su IGV", () => {
    const docs = documentosParaLaNota(filas, por("di-1"));
    expect(cifrasDeLaNota(docs, ["di-1", "di-2"])).toEqual({ monto: 70.8, base: 60, igv: 10.8 });
    expect(cifrasDeLaNota(docs, ["di-2"])).toEqual({ monto: 47.2, base: 40, igv: 7.2 });
  });
});

describe("la hoja: espejo de lo que rechaza adjuntar_nota_proveedor", () => {
  const docs = documentosParaLaNota(filas, por("di-1"));
  const usadas = seriesDelComprobante(filas, "fac-1");
  const problemas = (cambios: Partial<ReturnType<typeof borradorNotaProveedor>>) =>
    problemasNotaProveedor({ borrador: { ...borradorNotaProveedor(docs, HOY), ...cambios }, docs, seriesUsadas: usadas, emision: "2026-10-10", hoy: HOY });

  it("la serie: obligatoria, sin DI-, hasta 30 letras y sin repetir la del comprobante", () => {
    expect(problemas({}).serie).toBe("Escribe la serie y el número, como dice la nota.");
    expect(problemas({ serie: "di-000001" }).serie).toBe("La serie DI- es de los documentos internos de CAYLA: escribe la de la nota del proveedor.");
    expect(problemas({ serie: "9".repeat(31) }).serie).toBe("La serie y el número van hasta 30 letras.");
    expect(problemas({ serie: "fc01-000001" }).serie).toBe("La nota FC01-000001 ya está registrada en este comprobante.");
    expect(problemas({ serie: " fc01-000777 " }).serie).toBeUndefined();
  });
  it("la fecha: ni futura ni anterior al comprobante", () => {
    expect(problemas({ fecha: "" }).fecha).toBe("Elige la fecha de la nota.");
    expect(problemas({ fecha: "2026-10-16" }).fecha).toBe("La fecha de la nota no puede ser futura.");
    expect(problemas({ fecha: "2026-10-09" }).fecha).toBe("La nota no puede ser anterior al comprobante (emitido el 10/10).");
    expect(problemas({ fecha: "2026-10-10" }).fecha).toBeUndefined();
  });
  it("el monto: como dice el papel, y lo mismo que lo que no llegó", () => {
    expect(problemas({}).monto).toBe("Escribe el monto, como dice la nota.");
    expect(problemas({ monto: "abc" }).monto).toBe("Escribe el monto en soles, con hasta 2 decimales.");
    expect(problemas({ monto: "70.801" }).monto).toBe("Escribe el monto en soles, con hasta 2 decimales.");
    expect(problemas({ monto: "70" }).monto).toBe("La nota tiene que decir S/\u00a070.80: si dice otra cifra, pídele al proveedor que la corrija.");
    expect(problemas({ monto: "70,80" }).monto).toBeUndefined();
    expect(problemas({ monto: "47.20", elegidos: ["di-2"] }).monto).toBeUndefined();
    expect(problemas({ elegidos: [] }).documentos).toBe("Elige qué documento interno respalda la nota.");
  });
  it("la guía: la fecha viene sugerida; con todo bien, se puede confirmar; los argumentos van limpios", () => {
    const listo = { listo: true, motivo: null };
    const b = { ...borradorNotaProveedor(docs, HOY), serie: " fc01-000777 ", monto: "70.80" };
    const p = problemasNotaProveedor({ borrador: b, docs, seriesUsadas: usadas, emision: "2026-10-10", hoy: HOY });
    const campos = camposNotaProveedor(p, docs, listo);
    expect(campos.map((c) => c.id)).toEqual(["documentos", "serie", "fecha", "monto", "responsable"]);
    expect(campos.find((c) => c.id === "fecha")).toMatchObject({ requerido: false, sugerido: true });
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(sePuedeConfirmar(camposNotaProveedor(p, docs, { listo: false, motivo: "Elige quién." }))).toBe(false);
    expect(camposNotaProveedor(p, [docs[0]!], listo).map((c) => c.id)).toEqual(["serie", "fecha", "monto", "responsable"]);
    expect(argsNotaProveedor(b, docs, "tok")).toEqual({ p_documentos: ["di-1", "di-2"], p_serie_numero: "FC01-000777", p_fecha: HOY, p_monto: 70.8, p_token: "tok" });
  });
});

describe("lo que contesta la base y lo que se dice", () => {
  it("lee la respuesta y arma el aviso", () => {
    const r = leerNotaProveedor({ serie_numero: "FC01-000777", fecha: "2026-10-15", monto: 70.8, igv: 10.8, comprobante: "F001-901", documentos: ["DI-000045", "DI-000046"] })!;
    expect(r).toMatchObject({ serie: "FC01-000777", igv: 10.8, documentos: ["DI-000045", "DI-000046"] });
    expect(detalleNotaProveedor(r)).toBe("Respalda los DI-000045 y DI-000046. Sus S/\u00a010.80 de IGV bajan el crédito fiscal de octubre.");
    expect(detalleNotaProveedor({ ...r, documentos: ["DI-000045"] })).toBe("Respalda el DI-000045. Sus S/\u00a010.80 de IGV bajan el crédito fiscal de octubre.");
    expect(leerNotaProveedor(null)).toBeNull();
    expect(leerNotaProveedor({ nada: 1 })).toBeNull();
  });
  it("los avisos de la base se dicen tal cual; el de permisos no; y cuándo recargar", () => {
    expect(mensajeDeNotaProveedor({ message: "La nota FC01-5 ya está registrada en F001-901", hint: "nota_proveedor_serie" })).toBe("La nota FC01-5 ya está registrada en F001-901");
    expect(mensajeDeNotaProveedor({ message: "x", hint: "nota_proveedor_sin_modulo" })).toBeNull();
    expect(mensajeDeNotaProveedor({ message: "x", hint: null })).toBeNull();
    expect(sugiereRecargarNotaProveedor({ hint: "nota_proveedor_ya_adjunta" })).toBe(true);
    expect(sugiereRecargarNotaProveedor({ hint: "nota_proveedor_monto" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import type { CuentaElegible } from "./cuenta-sellada-reglas";
import {
  aCredito,
  borradorDeLaHoja,
  camposDeLaHoja,
  hojaDePlantilla,
  hojaSiguiente,
  hojaVacia,
  plantillasDe,
  proveedorDelRuc,
  serieNumeroLegible,
  salidaDeLaHoja,
  ticketDeLaHoja,
  validarHoja,
  type HojaGasto,
  type SalidaDeLaHoja,
} from "./hoja-gasto-reglas";

const HOY = "2026-10-23";
const RUC = "20100070970"; // un RUC con su dígito de control correcto
const listo = { proveedorListo: true, salidaLista: true, responsableListo: true, responsableMotivo: null };
const efectivo: SalidaDeLaHoja = { medio: "efectivo", cajaId: "caja-1", referencia: "" };
const llena = (cambios: Partial<HojaGasto> = {}): HojaGasto => ({
  ...hojaVacia(HOY, "lima"),
  monto: "80",
  categoria: "suministros",
  descripcion: "Bolsas",
  comprobante: "sin_comprobante",
  ...cambios,
});

describe("la guía de la hoja dice lo mismo que su validación", () => {
  // Cada camino de la hoja: lo que la guía deja confirmar es lo que la hoja deja guardar (validarHoja = validarGasto + «¿tiene comprobante?»).
  const caminos: [string, HojaGasto, typeof listo, SalidaDeLaHoja][] = [
    ["vacía", hojaVacia(HOY), { ...listo, proveedorListo: false, salidaLista: false }, { medio: "", cajaId: "", referencia: "" }],
    ["sin comprobante, en efectivo", llena(), listo, efectivo],
    ["sin monto", llena({ monto: "" }), listo, efectivo],
    ["sin sede", llena({ sede: "" }), listo, efectivo],
    ["sin categoría", llena({ categoria: "" }), listo, efectivo],
    ["sin decir qué fue", llena({ descripcion: "  " }), listo, efectivo],
    ["sin decir si tiene comprobante", llena({ comprobante: "" }), listo, efectivo],
    ["factura completa, pagada", llena({ comprobante: "factura", ruc: RUC, serieNumero: "f001 2231" }), listo, { medio: "transferencia", cuentaId: "bcp", cajaId: "", referencia: "" }],
    ["factura sin serie", llena({ comprobante: "factura", ruc: RUC, serieNumero: "F001" }), listo, efectivo],
    ["factura a crédito con vencimiento", llena({ comprobante: "factura", ruc: RUC, serieNumero: "F001-9", pagado: "no", vence: "2026-11-10" }), listo, { medio: "", cajaId: "", referencia: "" }],
    ["factura a crédito sin vencimiento", llena({ comprobante: "factura", ruc: RUC, serieNumero: "F001-9", pagado: "no" }), listo, { medio: "", cajaId: "", referencia: "" }],
    ["factura a crédito que vence antes", llena({ comprobante: "factura", ruc: RUC, serieNumero: "F001-9", pagado: "no", vence: "2026-10-01" }), listo, { medio: "", cajaId: "", referencia: "" }],
    ["boleta completa", llena({ comprobante: "boleta", ruc: RUC, serieNumero: "B002-15" }), listo, efectivo],
    ["sin decir de dónde salió", llena(), { ...listo, salidaLista: false }, { medio: "", cajaId: "", referencia: "" }],
  ];

  it.each(caminos)("%s", (_nombre, h, ctx, salida) => {
    const campos = camposDeLaHoja(h, ctx);
    const v = validarHoja(h, ctx.proveedorListo ? "prov-1" : "", salida, HOY);
    expect(sePuedeConfirmar(campos)).toBe(v.ok);
  });

  it("sin comprobante no pide RUC ni serie; a crédito pide cuándo vence en vez de «salió de»", () => {
    expect(camposDeLaHoja(llena(), listo).map((c) => c.id)).toEqual(["monto", "sede", "categoria", "descripcion", "comprobante", "salida", "responsable"]);
    expect(camposDeLaHoja(llena({ comprobante: "factura", pagado: "no" }), listo).map((c) => c.id)).toEqual([
      "monto", "sede", "categoria", "descripcion", "comprobante", "ruc", "serie", "vence", "responsable",
    ]);
  });

  it("sin comprobante no se puede dejar por pagar", () => {
    expect(aCredito(llena({ pagado: "no" }))).toBe(false);
    expect(borradorDeLaHoja(llena({ pagado: "no" }), "", efectivo).condicion).toBe("contado");
  });
});

describe("la serie y el proveedor", () => {
  it("la serie se escribe como sea y queda como en SUNAT", () => {
    expect(serieNumeroLegible("f001 2231")).toBe("F001-2231");
    expect(serieNumeroLegible("F001-0002231")).toBe("F001-2231");
    expect(serieNumeroLegible("F001")).toBeNull();
  });

  it("el proveedor se reconoce por su RUC", () => {
    const provs = [{ id: "p", nombre: "Hidrandina", ruc: "20132023540", rubros: [] }];
    expect(proveedorDelRuc("2013 2023 540", provs)?.id).toBe("p");
    expect(proveedorDelRuc("2013202354", provs)).toBeNull();
  });

  it("el borrador lleva la serie partida y el proveedor del RUC", () => {
    const b = borradorDeLaHoja(llena({ comprobante: "factura", ruc: RUC, serieNumero: "f001 2231" }), "prov-1", efectivo);
    expect(b).toMatchObject({ comprobante: "factura", proveedorId: "prov-1", serie: "F001", numero: "2231", condicion: "contado", medio: "efectivo" });
  });
});

describe("«Así queda»", () => {
  const ctx = { categoriaNombre: "Suministros", sedeNombre: "Lima", salidaNombre: "Cajón · Tienda Lima", proveedorNombre: "Sodimac" };

  it("una factura muestra base e IGV y dice cuánto IGV se recupera", () => {
    const t = ticketDeLaHoja(llena({ comprobante: "factura", serieNumero: "f001 2231", monto: "118" }), ctx);
    expect(t.lineas.map((l) => [l.etiqueta, l.valor.replace(/\u00a0/g, " ")])).toEqual([
      ["Qué fue", "Bolsas"],
      ["En", "Suministros"],
      ["Sede", "Lima"],
      ["Factura", "F001-2231"],
      ["De", "Sodimac"],
      ["Base", "S/ 100.00"],
      ["IGV 18 %", "S/ 18.00"],
      ["Total", "S/ 118.00"],
    ]);
    expect(t.pasara.map((x) => x.replace(/\u00a0/g, " "))).toEqual(["Se suma a lo gastado en suministros de Lima.", "Recuperas S/ 18.00 de IGV.", "Sale de Cajón · Tienda Lima."]);
  });

  it("a crédito dice hasta cuándo queda por pagar; sin datos, no inventa líneas", () => {
    expect(ticketDeLaHoja(llena({ comprobante: "factura", pagado: "no", vence: "2026-11-10" }), ctx).pasara).toContain("Queda en Por pagar hasta el 10/11/2026.");
    expect(ticketDeLaHoja(hojaVacia(HOY), { categoriaNombre: null, sedeNombre: null, salidaNombre: null, proveedorNombre: null })).toEqual({ lineas: [], pasara: [] });
  });
});

describe("repetir y registrar otro", () => {
  it("las plantillas no repiten el mismo gasto y se saltan los anulados", () => {
    const g = (descripcion: string, ubicacionId: string | null, estado = "vigente") => ({ descripcion, categoria: "luz", ubicacionId, comprobanteTipo: "factura", proveedorNombre: "Hidrandina", proveedorRuc: "20132023540", montoTotal: 120, estado });
    const p = plantillasDe([g("Luz", "lima"), g("luz ", "lima"), g("Luz", null), g("Agua", "lima", "anulado")]);
    expect(p.map((x) => [x.descripcion, x.sede])).toEqual([
      ["Luz", "lima"],
      ["Luz", "empresa"],
    ]);
    const h = hojaDePlantilla(p[0]!, HOY);
    expect(h).toMatchObject({ descripcion: "Luz", categoria: "luz", sede: "lima", comprobante: "factura", ruc: "20132023540", serieNumero: "", fecha: HOY, monto: "120" });
  });

  it("registrar otro conserva la sede y la fecha", () => {
    const s = hojaSiguiente(llena({ fecha: "2026-10-20" }));
    expect(s).toMatchObject({ sede: "lima", fecha: "2026-10-20", monto: "", descripcion: "", comprobante: "" });
  });
});

describe("«Salió de» (chaos 2026-10-23, hallazgo 1: proponía un banco y cambiaba en silencio lo elegido)", () => {
  const c = (id: string, tipo: CuentaElegible["tipo"], ubicacionId: string | null, cajaAbierta = true, propuestaPara: string[] = []): CuentaElegible => ({
    id, nombre: id, tipo, ubicacionId, ubicacionNombre: ubicacionId, cajaAbierta, propuestaPara,
  });
  const CUENTAS = [c("interbank", "banco", null, true, ["transferencia"]), c("fuerte-lima", "caja_fuerte", "lima"), c("cajon-lima", "cajon", "lima"), c("cajon-tru", "cajon", "tru", false)];

  it("sin comprobante y con la caja de esa sede abierta, propone el cajón (no un banco)", () => {
    expect(salidaDeLaHoja(CUENTAS, { sede: "lima", comprobante: "sin_comprobante" }, "", false)).toBe("cajon-lima");
    expect(salidaDeLaHoja(CUENTAS, { sede: "lima", comprobante: "" }, "", false)).toBe("cajon-lima");
  });

  it("con comprobante, o con la caja cerrada, propone lo de siempre", () => {
    expect(salidaDeLaHoja(CUENTAS, { sede: "lima", comprobante: "factura" }, "", false)).toBe("interbank");
    expect(salidaDeLaHoja(CUENTAS, { sede: "tru", comprobante: "sin_comprobante" }, "", false)).toBe("interbank");
  });

  it("lo que la persona eligió se queda mientras sirva", () => {
    expect(salidaDeLaHoja(CUENTAS, { sede: "lima", comprobante: "sin_comprobante" }, "fuerte-lima", false)).toBe("fuerte-lima");
  });

  it("al cambiar de sede, si la cuenta ya no sirve, queda por elegir; si sirve (un banco), se queda", () => {
    const sinCajonDeLima = CUENTAS.filter((x) => x.id !== "cajon-lima");
    expect(salidaDeLaHoja(sinCajonDeLima, { sede: "tru", comprobante: "sin_comprobante" }, "cajon-lima", true)).toBeNull();
    expect(salidaDeLaHoja(sinCajonDeLima, { sede: "tru", comprobante: "sin_comprobante" }, "interbank", true)).toBe("interbank");
  });
});

describe("el monto sobre el tope (chaos 2026-10-23, hallazgo 2: la guía lo daba por bueno y la base lo rechazaba)", () => {
  it("cien millones no cuenta como hecho ni llega al ticket", () => {
    const h = llena({ monto: "100000000" });
    expect(camposDeLaHoja(h, listo).find((c) => c.id === "monto")?.hecho).toBe(false);
    expect(ticketDeLaHoja(h, { categoriaNombre: null, sedeNombre: null, salidaNombre: null, proveedorNombre: null }).lineas.some((l) => l.etiqueta === "Total")).toBe(false);
    expect(sePuedeConfirmar(camposDeLaHoja(h, listo))).toBe(validarHoja(h, "prov-1", efectivo, HOY).ok);
  });
});

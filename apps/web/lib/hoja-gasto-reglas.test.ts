import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import type { CuentaElegible } from "./cuenta-sellada-reglas";
import {
  aCredito,
  borradorDeLaHoja,
  camposDeLaHoja,
  hojaDeEgreso,
  hojaDeFijo,
  hojaDePlantilla,
  motivoDelMonto,
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

describe("el aviso al guardar sigue el orden de la guía (chaos 2026-10-23, hallazgo 3)", () => {
  const sin: SalidaDeLaHoja = { medio: "", cajaId: "", referencia: "" };
  it.each([
    ["vacía", hojaVacia(HOY)],
    ["solo el monto", { ...hojaVacia(HOY), monto: "20" }],
    ["monto y sede", { ...hojaVacia(HOY, "lima"), monto: "20" }],
    ["sin decir qué fue", llena({ descripcion: "" })],
    ["sin comprobante elegido", llena({ comprobante: "" })],
    ["monto sobre el tope", llena({ monto: "100000000", comprobante: "" })],
    ["factura sin RUC ni serie", llena({ comprobante: "factura" })],
    ["factura con RUC y sin serie", llena({ comprobante: "factura", ruc: RUC })],
    ["todo lleno menos de dónde salió", llena()],
    ["a crédito sin vencimiento", llena({ comprobante: "factura", ruc: RUC, serieNumero: "F001-9", pagado: "no" })],
  ])("%s: el primer aviso es el primer campo que falta", (_n, h) => {
    const proveedorListo = Boolean(h.ruc);
    const v = validarHoja(h, "", sin, HOY, proveedorListo);
    const primero = camposDeLaHoja(h, { ...listo, proveedorListo, salidaLista: false }).find((c) => !c.hecho && c.requerido)!;
    expect(v.ok).toBe(false);
    if (!v.ok && primero.id !== "monto") expect(v.error).toBe(primero.pendiente);
    if (!v.ok && primero.id === "monto") expect(v.error).toMatch(/monto|cuánto/i);
  });
});

describe("un monto que no sirve dice por qué (chaos 2026-10-23, hallazgo 4)", () => {
  it("vacío no regaña; cero, negativo, tres decimales, letras y el tope sí dicen qué pasa", () => {
    expect(motivoDelMonto("")).toBeNull();
    expect(motivoDelMonto("12.50")).toBeNull();
    for (const v of ["0", "-0.01", "12.505", "abc", "100000000"]) expect(motivoDelMonto(v), v).toMatch(/\S/);
    expect(motivoDelMonto("0")).toMatch(/mayor que cero/);
    expect(motivoDelMonto("100000000")).toMatch(/1 000 000/);
  });
});

describe("cerrar un gasto fijo desde la hoja (#1271: «¿es ese fijo?»)", () => {
  it("el gasto lleva el fijo que cierra solo si se eligió", () => {
    expect(borradorDeLaHoja(llena(), "", efectivo).gastoFijoId).toBeUndefined();
    expect(borradorDeLaHoja(llena(), "", efectivo, "fijo-luz").gastoFijoId).toBe("fijo-luz");
    const v = validarHoja(llena(), "", efectivo, HOY, true, "fijo-luz");
    expect(v.ok && v.valor.p_gasto_fijo_id).toBe("fijo-luz");
  });
});

describe("clasificar una salida de caja y registrar un fijo en la hoja nueva", () => {
  const sin: SalidaDeLaHoja = { medio: "", cajaId: "", referencia: "" };

  it("la salida de caja trae su monto, su sede y su fecha, y no pide de dónde salió", () => {
    const h = { ...hojaDeEgreso({ id: "egr-1", ubicacionId: "lima", monto: 20, nota: "Bolsas" }, "2026-10-20"), categoria: "suministros" };
    expect(h).toMatchObject({ monto: "20", sede: "lima", fecha: "2026-10-20", descripcion: "Bolsas", comprobante: "sin_comprobante", egresoId: "egr-1" });
    expect(camposDeLaHoja(h, { ...listo, salidaLista: false }).map((c) => c.id)).not.toContain("salida");
    expect(ticketDeLaHoja(h, { categoriaNombre: null, sedeNombre: null, salidaNombre: "el cajón de Tienda Lima", proveedorNombre: null }).pasara).toContain("Sale del cajón de Tienda Lima.");
    const v = validarHoja(h, "", sin, HOY);
    expect(v.ok && v.valor).toMatchObject({ p_caja_movimiento_id: "egr-1", p_medio_pago: "efectivo", p_caja_id: null });
  });

  it("una salida de caja con comprobante no queda por pagar", () => {
    const h = { ...hojaDeEgreso({ id: "egr-1", ubicacionId: "lima", monto: 20, nota: null }, "2026-10-20"), categoria: "suministros", descripcion: "Bolsas", comprobante: "boleta" as const, ruc: RUC, serieNumero: "B001-5", pagado: "no" as const };
    expect(aCredito(h)).toBe(false);
    expect(validarHoja(h, "prov-1", sin, HOY).ok).toBe(true);
  });

  it("el fijo llega lleno, con su proveedor por RUC o por su id aunque no tenga RUC", () => {
    const f = { ubicacionId: "lima", categoria: "servicios_basicos", descripcion: "Luz del local", comprobanteTipo: "factura" as const, proveedorId: "hid", monto: 180, montoVariable: true, fechaEsperada: "2026-10-10" };
    const { hoja, proveedor } = hojaDeFijo(f, HOY, [{ id: "hid", nombre: "Hidrandina", ruc: "20132023540", rubros: [] }]);
    expect(hoja).toMatchObject({ sede: "lima", categoria: "servicios_basicos", descripcion: "Luz del local", comprobante: "factura", monto: "", ruc: "20132023540", fecha: "2026-10-10" });
    expect(proveedor?.id).toBe("hid");
    expect(hojaDeFijo({ ...f, montoVariable: false, fechaEsperada: "2026-11-10" }, HOY, []).hoja).toMatchObject({ monto: "180", fecha: HOY, ruc: "" });
  });
});

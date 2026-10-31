import { describe, expect, it } from "vitest";
import { SIN_FILTROS } from "./gastos-telar-reglas";
import {
  avisoDelGasto,
  comoSePago,
  DIAS_A_LA_VISTA,
  detalleDelGasto,
  detalleDeRepetidos,
  diasALaVista,
  extractoPorDia,
  filasDelDia,
  loQueEsconden,
  marcaDelGasto,
  pagoACredito,
  resumenDelDia,
  sinComprobanteGrande,
  textoDiasDeAntes,
  tituloDelDia,
  TOPE_REPETIDO,
  UMBRAL_SIN_COMPROBANTE,
  type GastoParaExtracto,
} from "./gastos-extracto-reglas";

const HOY = "2026-10-30";
let siguiente = 0;
const g = (fecha: string, montoTotal: number, extra: Partial<GastoParaExtracto> = {}): GastoParaExtracto => ({
  id: `g${String(++siguiente).padStart(3, "0")}`,
  fecha,
  descripcion: "Baño",
  proveedorNombre: null,
  categoria: "movilidad",
  categoriaNombre: "Movilidad",
  ubicacionId: "lim",
  ubicacionNombre: "Tienda Lima",
  montoTotal,
  estado: "vigente",
  motivoAnulacion: null,
  compraId: null,
  condicion: null,
  fechaVencimiento: null,
  saldo: null,
  tienePagos: false,
  medioPago: null,
  cajaMovimientoId: "mov",
  comprobanteTipo: "sin_comprobante",
  comprobante: null,
  ...extra,
});
const factura = (fecha: string, monto: number, vence: string | null, saldo = monto) =>
  g(fecha, monto, { descripcion: "Tela", categoria: "insumos", categoriaNombre: "Insumos", compraId: "c1", condicion: "credito", fechaVencimiento: vence, saldo, cajaMovimientoId: null, comprobanteTipo: "factura", comprobante: "F001-12" });

describe("la marca de cada gasto", () => {
  it("un gasto normal no lleva marca", () => {
    expect(marcaDelGasto(g(HOY, 5), HOY)).toBeNull();
    expect(marcaDelGasto(g(HOY, 900, { comprobanteTipo: "factura", comprobante: "F1-1", cajaMovimientoId: null, medioPago: "transferencia" }), HOY)).toBeNull();
  });

  it("anulado gana a todo y dice su motivo", () => {
    // Una factura vencida que se anuló dice «Anulado», no «Vencida».
    const m = marcaDelGasto({ ...factura(HOY, 1000, "2026-10-01"), estado: "anulado", motivoAnulacion: "se registró dos veces" }, HOY);
    expect(m).toEqual({ clase: "anulado", texto: "Anulado", tono: "apagado", porque: "Anulado: se registró dos veces" });
  });

  it("lo que se debe: rojo si venció (como Por pagar), ámbar hasta 7 días, pizarra si hay tiempo", () => {
    expect(marcaDelGasto(factura("2026-10-01", 1180, "2026-10-29"), HOY)).toMatchObject({ texto: "Vencida · 29 oct", tono: "rojo" });
    expect(marcaDelGasto(factura("2026-10-01", 1180, HOY), HOY)).toMatchObject({ texto: "Por pagar · vence hoy", tono: "ambar" });
    expect(marcaDelGasto(factura("2026-10-01", 1180, "2026-11-06"), HOY)).toMatchObject({ texto: "Por pagar · vence 6 nov", tono: "ambar", porque: "Faltan S/ 1,180.00: vence el 6 nov (en 7 días)." });
    expect(marcaDelGasto(factura("2026-10-01", 1180, "2026-11-07"), HOY)).toMatchObject({ tono: "pizarra" });
    expect(marcaDelGasto(factura("2026-10-01", 1180, null), HOY)).toMatchObject({ texto: "Por pagar", tono: "pizarra" });
  });

  it("un pago parcial dice cuánto falta de cuánto; una factura ya pagada no lleva marca", () => {
    expect(marcaDelGasto(factura("2026-10-01", 1000, "2026-11-20", 400), HOY)?.porque).toBe("Faltan S/ 400.00 de S/ 1,000.00: vence el 20 nov (en 21 días).");
    expect(marcaDelGasto(factura("2026-10-01", 1000, "2026-10-20", 0), HOY)).toBeNull();
  });

  it(`sin comprobante solo desde S/ ${UMBRAL_SIN_COMPROBANTE}, con el IGV que se recuperaría con factura`, () => {
    expect(marcaDelGasto(g(HOY, UMBRAL_SIN_COMPROBANTE - 0.01), HOY)).toBeNull();
    expect(marcaDelGasto(g(HOY, 354), HOY)).toEqual({ clase: "sin-comprobante", texto: "Sin comprobante", tono: "ambar", porque: "Sin boleta ni factura: con factura recuperarías S/ 54.00 de IGV." });
    // La planilla de movilidad es el papel del viaje: no es «sin comprobante» aunque no dé IGV.
    expect(marcaDelGasto(g(HOY, 500, { comprobanteTipo: "planilla_movilidad" }), HOY)).toBeNull();
  });
});

describe("lo que dice la hoja del gasto", () => {
  it("la misma marca de la fila y su porqué; el tono del aviso sigue al de la marca", () => {
    expect(avisoDelGasto(factura("2026-10-22", 708, "2026-10-27"), HOY)).toEqual({ tono: "error", titulo: "Vencida · 27 oct", texto: "Faltan S/\u00a0708.00: venció el 27 oct.", deuda: true });
    expect(avisoDelGasto(factura("2026-10-29", 1770, "2026-11-04"), HOY)).toMatchObject({ tono: "atencion", titulo: "Por pagar · vence 4 nov", deuda: true });
    expect(avisoDelGasto(factura("2026-10-29", 1770, "2026-11-20"), HOY)).toMatchObject({ tono: "info", deuda: true });
    expect(avisoDelGasto(g(HOY, 450), HOY)).toMatchObject({ tono: "atencion", titulo: "Sin comprobante", deuda: false });
  });

  it("lo normal y lo anulado no llevan aviso (lo anulado ya lo dice la hoja)", () => {
    expect(avisoDelGasto(g(HOY, 5), HOY)).toBeNull();
    expect(avisoDelGasto(g(HOY, 900, { estado: "anulado", motivoAnulacion: "doble" }), HOY)).toBeNull();
  });

  it("«Pago» de una factura que se debe habla en pasado si ya venció", () => {
    expect(pagoACredito("2026-10-27", HOY)).toBe("A crédito, venció el 27 oct");
    expect(pagoACredito(HOY, HOY)).toBe("A crédito, vence hoy");
    expect(pagoACredito("2026-11-04", HOY)).toBe("A crédito, vence el 4 nov");
    expect(pagoACredito(null, HOY)).toBe("A crédito");
  });
});

describe("lo grande sin comprobante del mes", () => {
  it("cuenta lo que marca la lista (vigente, sin papel, desde S/ 300) y suma el IGV que se recuperaría", () => {
    const r = sinComprobanteGrande([g(HOY, 354), g(HOY, 472), g(HOY, 299), g(HOY, 600, { estado: "anulado", motivoAnulacion: "x" }), g(HOY, 500, { comprobanteTipo: "planilla_movilidad" })]);
    expect(r).toEqual({ n: 2, igv: 126 });
    expect(sinComprobanteGrande([])).toEqual({ n: 0, igv: 0 });
  });
});

describe("la línea de debajo", () => {
  it("categoría · cómo se pagó · comprobante; sin comprobante no se escribe", () => {
    expect(detalleDelGasto(g(HOY, 5))).toBe("Movilidad · Cajón de Lima");
    expect(detalleDelGasto(g(HOY, 90, { cajaMovimientoId: null, medioPago: "yape", comprobanteTipo: "boleta", comprobante: "B001-77" }))).toBe("Movilidad · Yape · Boleta B001-77");
    expect(detalleDelGasto(g(HOY, 90, { comprobanteTipo: "planilla_movilidad" }))).toBe("Movilidad · Cajón de Lima · Sin comprobante (planilla de movilidad)");
  });

  it("una factura que se debe dice «A crédito» (el vencimiento va en la marca); pagada, cómo se pagó", () => {
    expect(comoSePago(factura(HOY, 1000, "2026-11-20"))).toBe("A crédito");
    expect(comoSePago({ ...factura(HOY, 1000, "2026-11-20", 0), tienePagos: true })).toBe("Pagado");
    expect(comoSePago(g(HOY, 10, { cajaMovimientoId: null, ubicacionNombre: null }))).toBeNull();
  });

  it("un anulado suma su motivo", () => {
    expect(detalleDelGasto(g(HOY, 40, { estado: "anulado", motivoAnulacion: "duplicado" }))).toBe("Movilidad · Cajón de Lima · anulado: duplicado");
  });
});

describe("los días", () => {
  it("«Hoy · …», «Ayer · …» y el resto con mayúscula", () => {
    expect(tituloDelDia(HOY, HOY)).toBe("Hoy · viernes 30 de octubre");
    expect(tituloDelDia("2026-10-29", HOY)).toBe("Ayer · jueves 29 de octubre");
    expect(tituloDelDia("2026-10-27", HOY)).toBe("Martes 27 de octubre");
    expect(tituloDelDia(HOY, HOY, true)).toBe("Hoy · viernes 30");
    expect(tituloDelDia("2026-09-30", HOY, true)).toBe("Miércoles 30");
    // En un mes que ya pasó no hay «Hoy».
    expect(tituloDelDia("2026-09-30", HOY)).toBe("Miércoles 30 de septiembre");
  });

  it("del más nuevo al más viejo; el total y la cuenta del día sin los anulados", () => {
    const dias = extractoPorDia([g("2026-10-27", 100), g(HOY, 20), g("2026-10-27", 60, { estado: "anulado" }), g(HOY, 30.5)], HOY);
    expect(dias.map((d) => [d.fecha, d.hoy, d.total, d.n])).toEqual([
      [HOY, true, 50.5, 2],
      ["2026-10-27", false, 100, 1],
    ]);
  });

  it("lo que dice el día: el monto y cuántos; un día de solo anulados no suma", () => {
    expect(resumenDelDia({ total: 514.5, n: 7 })).toEqual({ monto: "S/ 514.50", cuenta: "7 gastos" });
    expect(resumenDelDia({ total: 12, n: 1 })).toEqual({ monto: "S/ 12.00", cuenta: "1 gasto" });
    expect(resumenDelDia({ total: 0, n: 0 })).toEqual({ monto: null, cuenta: "Solo anulados" });
  });
});

describe("lo que se repite el mismo día", () => {
  it("junta lo chico con el mismo nombre (sin mirar tildes), sede, categoría y forma de pago", () => {
    const filas = filasDelDia([g(HOY, 1), g(HOY, 1, { descripcion: "baño " }), g(HOY, 1), g(HOY, 25, { descripcion: "Mototaxi" })], HOY);
    expect(filas.map((f) => (f.tipo === "gasto" ? f.gasto.descripcion : `×${f.gastos.length} ${f.total}`))).toEqual(["Mototaxi", "×3 3"]);
  });

  it("no junta lo de otra sede, otra forma de pago, lo que lleva marca ni lo de S/ 50 o más", () => {
    const filas = filasDelDia(
      [
        g(HOY, 2),
        g(HOY, 2, { ubicacionId: "tru", ubicacionNombre: "Tienda Trujillo" }),
        g(HOY, 2, { cajaMovimientoId: null, medioPago: "yape" }),
        g(HOY, 2, { estado: "anulado" }),
        g(HOY, TOPE_REPETIDO),
        g(HOY, TOPE_REPETIDO),
      ],
      HOY,
    );
    expect(filas.every((f) => f.tipo === "gasto")).toBe(true);
    expect(filas).toHaveLength(6);
  });

  it("del más grande al más chico (un grupo pesa lo que suma) y los anulados al final", () => {
    const filas = filasDelDia([g(HOY, 900, { estado: "anulado", descripcion: "Anulado" }), g(HOY, 20, { descripcion: "Taxi" }), g(HOY, 15), g(HOY, 15)], HOY);
    expect(filas.map((f) => (f.tipo === "gasto" ? f.gasto.descripcion : "Baño ×2"))).toEqual(["Baño ×2", "Taxi", "Anulado"]);
  });

  it("la línea de debajo de un grupo dice en qué y cómo se pagó (sin comprobante: es lo chico)", () => {
    expect(detalleDeRepetidos([g(HOY, 1), g(HOY, 1)])).toBe("Movilidad · Cajón de Lima");
    expect(detalleDeRepetidos([])).toBe("");
  });

  it("la clave de un grupo es única entre días", () => {
    const [a, b] = extractoPorDia([g(HOY, 1), g(HOY, 1), g("2026-10-29", 1), g("2026-10-29", 1)], HOY);
    const clave = (f: unknown) => (f as { clave: string }).clave;
    expect(clave(a!.filas[0])).not.toBe(clave(b!.filas[0]));
  });
});

describe("cuántos días se ven", () => {
  it(`al llegar, ${DIAS_A_LA_VISTA}; si los de antes serían uno solo, todos`, () => {
    expect(diasALaVista(20, SIN_FILTROS)).toBe(DIAS_A_LA_VISTA);
    expect(diasALaVista(DIAS_A_LA_VISTA + 1, SIN_FILTROS)).toBe(DIAS_A_LA_VISTA + 1);
    expect(diasALaVista(3, SIN_FILTROS)).toBe(3);
  });

  it("con cualquier filtro puesto se ven todos (también los que pone «Ver cuáles» o «Ver en la tabla»)", () => {
    expect(diasALaVista(20, { ...SIN_FILTROS, q: "luz" })).toBe(20);
    expect(diasALaVista(20, { ...SIN_FILTROS, q: "   " })).toBe(DIAS_A_LA_VISTA);
    expect(diasALaVista(20, { ...SIN_FILTROS, dia: 12 })).toBe(20);
    expect(diasALaVista(20, { ...SIN_FILTROS, categoria: "luz" })).toBe(20);
    expect(diasALaVista(20, { ...SIN_FILTROS, sede: "empresa" })).toBe(20);
    expect(diasALaVista(20, { ...SIN_FILTROS, comprobante: "sin" })).toBe(20);
  });

  it("lo que esconden los días de antes: vencidas en rojo, lo que vence esta semana y lo grande sin comprobante en ámbar", () => {
    const dias = extractoPorDia(
      [
        factura("2026-10-02", 708, "2026-10-27"),
        factura("2026-10-03", 500, "2026-10-12"),
        factura("2026-10-04", 900, "2026-11-03"),
        factura("2026-10-05", 900, "2026-11-20"),
        g("2026-10-06", 450),
        g("2026-10-07", 60, { estado: "anulado", motivoAnulacion: "doble" }),
        g("2026-10-08", 5),
      ],
      HOY,
    );
    expect(loQueEsconden(dias)).toEqual([
      { texto: "2 vencidas", tono: "rojo" },
      { texto: "1 vence esta semana", tono: "ambar" },
      { texto: "1 sin comprobante", tono: "ambar" },
    ]);
    expect(loQueEsconden(extractoPorDia([g("2026-10-08", 5), factura("2026-10-05", 900, "2026-11-20")], HOY))).toEqual([]);
  });

  it("el botón dice cuántos faltan", () => {
    expect(textoDiasDeAntes(12)).toBe("Ver los 12 días de antes");
  });
});

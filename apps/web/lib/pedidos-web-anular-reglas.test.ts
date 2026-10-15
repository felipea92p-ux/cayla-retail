import { describe, expect, it } from "vitest";
import {
  adondeIrPorLaBoleta,
  avisoTrasAnular,
  devueltoAlCliente,
  efectivoADevolver,
  errorDeAnularPagado,
  leerRespuestaAnulacion,
  pagosADevolver,
  problemaParaAnularPagado,
  textoDeDevolucion,
  textoDePrenda,
  tieneCobroDePasarela,
  tituloDeBoleta,
  totalADevolver,
} from "./pedidos-web-anular-reglas";
import { leerCaminoBoleta, leerDetalle, textoCierre, MOTIVOS_ANULAR_PAGADO, type CaminoBoleta, type PagoDeLista } from "./pedidos-web-reglas";

const pago = (extra: Partial<PagoDeLista>): PagoDeLista => ({
  id: "p",
  origen: "tienda",
  medio: "yape",
  monto: 10,
  estado: "aprobado",
  numeroOperacion: "04812793",
  observacion: null,
  registradoEn: "2026-10-15T10:00:00-05:00",
  registradoPor: "Felipe",
  enCaja: false,
  anuladoEn: null,
  anuladoPor: null,
  anuladoMotivo: null,
  ...extra,
});

const camino = (c: CaminoBoleta["camino"], hint: string | null = null): CaminoBoleta => ({
  camino: c,
  texto: "B001-000013",
  estado: "aceptado",
  total: 189.9,
  explicacion: `explicación ${c}`,
  hint,
});

describe("lo que se le devuelve", () => {
  const pagos = [
    pago({ id: "a", medio: "efectivo", monto: 30, enCaja: true }),
    pago({ id: "b", medio: "yape", monto: 159.9 }),
    pago({ id: "c", medio: "plin", monto: 5, estado: "anulado", anuladoMotivo: "error_al_anotar" }),
    pago({ id: "d", origen: "pasarela", medio: "tarjeta", monto: 7, estado: "por_revisar" }),
  ];
  it("solo los pagos vivos que anotó la tienda; lo anulado antes y lo de la pasarela, no", () => {
    expect(pagosADevolver({ pagos }).map((g) => g.id)).toEqual(["a", "b"]);
    expect(totalADevolver({ pagos })).toBe(189.9);
    expect(efectivoADevolver({ pagos })).toBe(30);
  });
  it("lo ya devuelto: solo lo anulado como «se le devolvió» (lo anotado por error nunca fue del cliente)", () => {
    const anulados = [
      pago({ id: "a", medio: "efectivo", monto: 30, estado: "anulado", anuladoMotivo: "devuelto_al_cliente" }),
      pago({ id: "b", monto: 15, estado: "anulado", anuladoMotivo: "error_al_anotar" }),
      pago({ id: "c", monto: 159.9, estado: "anulado", anuladoMotivo: "devuelto_al_cliente" }),
    ];
    expect(devueltoAlCliente({ pagos: anulados })).toBe(189.9);
    expect(devueltoAlCliente({ pagos })).toBe(0);
  });
  it("un cobro aprobado de la pasarela se devuelve desde la pasarela (la tienda no anula)", () => {
    expect(tieneCobroDePasarela({ pagos })).toBe(false);
    expect(tieneCobroDePasarela({ pagos: [pago({ origen: "pasarela", medio: "tarjeta" })] })).toBe(true);
  });
  it("cada medio dice cómo se devuelve: el efectivo, de la caja de hoy", () => {
    expect(textoDeDevolucion({ medio: "efectivo" }, "Trujillo")).toBe("Sale de la caja abierta de hoy de Trujillo: entrégaselo en la mano.");
    expect(textoDeDevolucion({ medio: "yape" }, "Trujillo")).toBe("Devuélveselo por Yape: sale de la cuenta donde entró.");
    expect(textoDeDevolucion({ medio: "transferencia" }, "Trujillo")).toBe("Devuélveselo por transferencia: sale de la cuenta donde entró.");
  });
});

describe("lo que pasa con cada prenda", () => {
  const base = { ubicacionId: "tru", tiendaReserva: "Trujillo", lugar: null, traslado: null } as const;
  it("reservada aquí, en su lugar; en otra tienda, allá; lo que se conseguía o viaja deja de ser del pedido; la quitada no cuenta", () => {
    expect(textoDePrenda({ ...base, estado: "reservada", lugar: "almacen" }, "tru", "Trujillo")).toBe("Vuelve a estar libre en el almacén.");
    expect(textoDePrenda({ ...base, estado: "reservada", lugar: "piso" }, "tru", "Trujillo")).toBe("Vuelve a estar libre en el piso.");
    expect(textoDePrenda({ ...base, estado: "reservada" }, "tru", "Trujillo")).toBe("Vuelve a estar libre en Trujillo.");
    expect(textoDePrenda({ ...base, estado: "reservada", ubicacionId: "lim", tiendaReserva: "Lima" }, "tru", "Trujillo")).toBe("Vuelve a estar libre en Lima.");
    expect(textoDePrenda({ ...base, estado: "por_conseguir", ubicacionId: null }, "tru", "Trujillo")).toBe("Ya no se consigue para este pedido.");
    expect(
      textoDePrenda(
        {
          ...base,
          estado: "por_conseguir",
          ubicacionId: null,
          traslado: { transferenciaId: "t", numero: 4, estado: "en_transito", desde: "Lima", desdeId: "lim", llegaEl: null },
        },
        "tru",
        "Trujillo",
      ),
    ).toBe("Viene en camino: al llegar, entra libre a Trujillo.");
    expect(textoDePrenda({ ...base, estado: "quitada", ubicacionId: null }, "tru", "Trujillo")).toBeNull();
  });
});

describe("la boleta: lo que dice la base", () => {
  it("se lee sin caerse; un camino desconocido no se ofrece (se lee «esperar»)", () => {
    expect(leerCaminoBoleta({ camino: "liberar", texto: "B001-000013", estado: "pendiente", total: "189.90", explicacion: "x" })).toEqual({
      camino: "liberar",
      texto: "B001-000013",
      estado: "pendiente",
      total: 189.9,
      explicacion: "x",
      hint: null,
    });
    expect(leerCaminoBoleta({ camino: "otro", explicacion: "x" })?.camino).toBe("esperar");
    expect(leerCaminoBoleta(null)).toBeNull();
    expect(leerCaminoBoleta({ camino: "liberar" })).toBeNull();
  });
  it("el título de cada camino y adónde ir a destrabarla", () => {
    expect(tituloDeBoleta(camino("liberar"))).toBe("Se libera sin enviarla");
    expect(tituloDeBoleta(camino("nota_credito"))).toBe("Sale su nota de crédito");
    expect(tituloDeBoleta(camino("nada"))).toBe("No queda nada que anular");
    expect(tituloDeBoleta(camino("esperar", "pedido_web_boleta_enviandose"))).toBe("Se está enviando a SUNAT");
    expect(adondeIrPorLaBoleta(camino("nota_credito"))).toBeNull();
    expect(adondeIrPorLaBoleta(camino("esperar", "pedido_web_boleta_enviandose"))).toBeNull();
    expect(adondeIrPorLaBoleta(camino("esperar", "pedido_web_boleta_en_camino"))?.href).toBe("/vender/comprobantes/por-reintentar");
    expect(adondeIrPorLaBoleta(camino("esperar", "pedido_web_sin_serie_nota"))?.href).toBe("/vender/comprobantes/series");
  });
  it("la lectura del pedido trae el camino y la nota de crédito", () => {
    const d = leerDetalle({
      pedido_id: "w",
      codigo: "W-0001",
      estado: "pagado",
      anulacion_boleta: { camino: "nota_credito", texto: "B001-000013", estado: "aceptado", total: 10, explicacion: "sale" },
      nota_credito: { comprobante_id: "n", texto: "BC01-000001", estado: "pendiente", total: 10 },
    });
    expect(d?.anulacionBoleta?.camino).toBe("nota_credito");
    expect(d?.notaCredito).toEqual({ comprobanteId: "n", texto: "BC01-000001", estado: "pendiente", total: 10 });
    expect(leerDetalle({ pedido_id: "w", codigo: "W-0001" })?.anulacionBoleta).toBeNull();
  });
});

describe("qué falta para anular (lo mismo que rechazaría la base, en el orden de la hoja)", () => {
  const listo = { camino: camino("liberar"), efectivo: 30, cajaAbierta: true, tienda: "Trujillo", pasarela: false, motivo: "cliente_desistio" as const };
  it("con todo listo, nada", () => {
    expect(problemaParaAnularPagado(listo)).toBeNull();
    expect(problemaParaAnularPagado({ ...listo, camino: null })).toBeNull();
    expect(problemaParaAnularPagado({ ...listo, cajaAbierta: null })).toBeNull();
  });
  it("primero la boleta, después la pasarela, la caja (solo si hay efectivo) y el motivo", () => {
    expect(problemaParaAnularPagado({ ...listo, camino: camino("esperar", "pedido_web_boleta_en_camino"), motivo: null })?.campo).toBe("boleta");
    expect(problemaParaAnularPagado({ ...listo, pasarela: true, cajaAbierta: false })?.campo).toBe("pasarela");
    expect(problemaParaAnularPagado({ ...listo, cajaAbierta: false, motivo: null })).toEqual({
      campo: "caja",
      detalle: "Hay que devolverle S/\u00a030.00 en efectivo: abre la caja de Trujillo.",
    });
    expect(problemaParaAnularPagado({ ...listo, efectivo: 0, cajaAbierta: false })).toBeNull();
    expect(problemaParaAnularPagado({ ...listo, motivo: null })?.campo).toBe("motivo");
  });
});

describe("lo que dijo la base", () => {
  it("la respuesta: lo devuelto, la boleta y su nota de crédito", () => {
    const r = leerRespuestaAnulacion({
      codigo: "W-0007",
      boleta: { texto: "B001-000013", estado: "aceptado" },
      nota_credito: { texto: "BC01-000001", estado: "pendiente" },
      devuelto: [
        { medio: "efectivo", monto: 30, de_la_caja: true },
        { medio: "yape", monto: "159.90", de_la_caja: false },
        { raro: true },
      ],
    });
    expect(r.devuelto).toEqual([
      { medio: "efectivo", monto: 30, deLaCaja: true },
      { medio: "yape", monto: 159.9, deLaCaja: false },
    ]);
    expect(avisoTrasAnular("W-0007", r, "Trujillo")).toEqual({
      titulo: "Pedido W-0007 anulado",
      detalle:
        "Se le devolvieron S/\u00a0189.90 (S/\u00a030.00 en efectivo, de la caja de Trujillo). Sus prendas volvieron a estar libres. Su boleta B001-000013 se anula con la nota de crédito BC01-000001, que sale sola a SUNAT.",
    });
  });
  it("la boleta liberada lo dice; sin pagos, también", () => {
    const r = leerRespuestaAnulacion({ boleta: { texto: "B001-000014", estado: "no_emitido" }, devuelto: [{ medio: "plin", monto: 20 }] });
    expect(avisoTrasAnular("W-0008", r, "Lima").detalle).toBe("Se le devolvieron S/\u00a020.00. Sus prendas volvieron a estar libres. Su boleta B001-000014 se liberó sin enviarla.");
    expect(avisoTrasAnular("W-0009", leerRespuestaAnulacion(null), "Lima").detalle).toBe("No había pagos que devolver. Sus prendas volvieron a estar libres.");
  });
  it("cada error a su lugar: el pedido que cambió se relee; la boleta, la caja y el motivo, en su sitio", () => {
    const h = { efectivo: 30, tienda: "Trujillo" };
    expect(errorDeAnularPagado({ hint: "pedido_web_estado", message: "ya está anulado" }, h)?.releer).toBe(true);
    expect(errorDeAnularPagado({ hint: "pedido_web_boleta_enviandose", message: "x" }, h)?.campo).toBe("boleta");
    expect(errorDeAnularPagado({ hint: "pedido_web_sin_serie_nota", message: "x" }, h)?.campo).toBe("boleta");
    expect(errorDeAnularPagado({ hint: "pedido_web_sin_caja", message: "x" }, h)?.campo).toBe("caja");
    expect(errorDeAnularPagado({ hint: "efectivo_insuficiente", message: "usa otro medio" }, h)?.detalle).toBe(
      "La caja de hoy de Trujillo no tiene los S/\u00a030.00 en efectivo que hay que devolverle. No se anuló nada: completa la caja o espera a que entre efectivo.",
    );
    expect(errorDeAnularPagado({ hint: "pedido_web_motivo", message: "x" }, h)?.campo).toBe("motivo");
    expect(errorDeAnularPagado({ hint: "otra_cosa", message: "x" }, h)).toBeNull();
    expect(errorDeAnularPagado(null, h)).toBeNull();
  });
});

describe("los motivos de un pedido pagado", () => {
  it("son los tres que acepta la base, cada uno con su etiqueta de tienda y su texto de cierre", () => {
    expect(MOTIVOS_ANULAR_PAGADO.map((m) => m.clave)).toEqual(["cliente_desistio", "error_en_pedido", "no_se_puede_entregar"]);
    expect(MOTIVOS_ANULAR_PAGADO.find((m) => m.clave === "no_se_puede_entregar")?.etiqueta).toBe("No se puede entregar");
    expect(textoCierre("no_se_puede_entregar")).toBe("No se puede entregar");
  });
});

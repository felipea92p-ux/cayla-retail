// Anular un pedido web PAGADO que todavía no se entrega (ADR-0408; Felipe, 2026-10-15: «Se debería poder anular el pedido y la boleta,
// cualquier persona con el módulo lo debería poder hacer»): la parte pura de la hoja «Anular el pedido», sin React ni red.
//
// CONTRATO
//   PROMETE: decir en palabras de tienda, ANTES de confirmar, qué va a pasar con cada prenda, con cada pago (por su medio; el efectivo
//            sale de la caja abierta de hoy) y con la boleta (lo que diga la base: se libera, sale su nota de crédito, o todavía no se
//            puede y qué hacer); qué falta para poder anular; qué decir al terminar; y llevar cada error de la base a su lugar.
//   ASUME:   que la base manda (`anular_pedido_web_pagado`, 20261015114000): el camino de la boleta lo calcula ella
//            (`fn_pedido_web_camino_boleta`) y llega en la lectura del pedido; aquí no se decide ninguna regla de SUNAT. Que la caja
//            abierta y su efectivo los vuelve a mirar la base al guardar (sin efectivo suficiente, no anula nada).
//   NO HACE: no transmite nada a SUNAT: la nota de crédito nace pendiente y la manda la cola de siempre.

import { soles } from "./precio-sede-reglas";
import { nombreDelMedio } from "./pedidos-web-cobro-reglas";
import type { CaminoBoleta, LineaDetalle, MotivoAnularPagado, PagoDeLista, PedidoDetalle } from "./pedidos-web-reglas";

// ---------------------------------------------------------------------------------------------------------------------------
// Lo que se devuelve
// ---------------------------------------------------------------------------------------------------------------------------

/** Los pagos que se le devuelven al anular: los vivos que anotó la tienda (uno de la pasarela se devuelve desde la pasarela). */
export function pagosADevolver(p: Pick<PedidoDetalle, "pagos">): PagoDeLista[] {
  return p.pagos.filter((g) => g.estado === "aprobado" && g.origen === "tienda");
}

const sumar = (pagos: readonly Pick<PagoDeLista, "monto">[]) => Math.round(pagos.reduce((a, g) => a + g.monto, 0) * 100) / 100;

/** Todo lo que se le devuelve. */
export const totalADevolver = (p: Pick<PedidoDetalle, "pagos">): number => sumar(pagosADevolver(p));

/** Lo que ya se le devolvió (cada pago anulado como «se le devolvió»): lo que dice el pedido anulado en vez de «por devolver». */
export const devueltoAlCliente = (p: Pick<PedidoDetalle, "pagos">): number =>
  sumar(p.pagos.filter((g) => g.estado === "anulado" && g.anuladoMotivo === "devuelto_al_cliente"));

/** Lo que sale en efectivo de la caja de hoy. */
export const efectivoADevolver = (p: Pick<PedidoDetalle, "pagos">): number => sumar(pagosADevolver(p).filter((g) => g.medio === "efectivo"));

/** ¿Tiene un cobro de la pasarela vivo? Ese no se devuelve desde la tienda (la base no anula nada). */
export const tieneCobroDePasarela = (p: Pick<PedidoDetalle, "pagos">): boolean => p.pagos.some((g) => g.estado === "aprobado" && g.origen !== "tienda");

/** Qué pasa con un pago al anular, en una frase. */
export function textoDeDevolucion(g: Pick<PagoDeLista, "medio">, tienda: string): string {
  if (g.medio === "efectivo") return `Sale de la caja abierta de hoy de ${tienda}: entrégaselo en la mano.`;
  if (g.medio === "transferencia") return "Devuélveselo por transferencia: sale de la cuenta donde entró.";
  return `Devuélveselo por ${nombreDelMedio(g.medio)}: sale de la cuenta donde entró.`;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Lo que pasa con cada prenda
// ---------------------------------------------------------------------------------------------------------------------------

/** Qué pasa con una prenda del pedido al anular: reservada, vuelve a estar libre donde está; la que se conseguía o viaja, ya no es del
 *  pedido (lo que llega, entra libre). La quitada al confirmar no está en el pedido: null. */
export function textoDePrenda(
  l: Pick<LineaDetalle, "estado" | "ubicacionId" | "tiendaReserva" | "lugar" | "traslado">,
  tiendaPedidoId: string,
  tienda: string,
): string | null {
  if (l.estado === "reservada") {
    if (l.ubicacionId && l.ubicacionId !== tiendaPedidoId) return `Vuelve a estar libre en ${l.tiendaReserva ?? "la otra tienda"}.`;
    if (l.lugar === "almacen") return "Vuelve a estar libre en el almacén.";
    if (l.lugar === "piso") return "Vuelve a estar libre en el piso.";
    return `Vuelve a estar libre en ${tienda}.`;
  }
  if (l.estado === "por_conseguir") {
    const t = l.traslado;
    if (t && (t.estado === "en_transito" || t.estado === "recibido_con_diferencia")) return `Viene en camino: al llegar, entra libre a ${tienda}.`;
    return "Ya no se consigue para este pedido.";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// La boleta
// ---------------------------------------------------------------------------------------------------------------------------

/** El título corto de lo que le pasa a la boleta (el detalle es la `explicacion` de la base). */
export function tituloDeBoleta(c: Pick<CaminoBoleta, "camino" | "hint">): string {
  if (c.camino === "liberar") return "Se libera sin enviarla";
  if (c.camino === "nota_credito") return "Sale su nota de crédito";
  if (c.camino === "nada") return "No queda nada que anular";
  if (c.hint === "pedido_web_boleta_enviandose") return "Se está enviando a SUNAT";
  if (c.hint === "pedido_web_sin_serie_nota") return "Falta la serie de nota de crédito";
  if (c.hint === "pedido_web_boleta_con_baja") return "Tiene una baja en trámite";
  if (c.hint === "pedido_web_boleta_con_nota") return "Ya tiene una nota de crédito";
  return "Todavía no se puede anular";
}

/** Adónde ir a destrabarla, si la frase lo pide (Comprobantes ▸ Por enviar o Series, o Comprobantes). null si no hay nada que hacer allá. */
export function adondeIrPorLaBoleta(c: Pick<CaminoBoleta, "camino" | "hint">): { href: string; texto: string } | null {
  if (c.camino !== "esperar") return null;
  if (c.hint === "pedido_web_boleta_enviandose") return null;
  if (c.hint === "pedido_web_sin_serie_nota") return { href: "/vender/comprobantes/series", texto: "Ir a Series" };
  if (c.hint === "pedido_web_boleta_en_camino") return { href: "/vender/comprobantes/por-reintentar", texto: "Ir a Por enviar" };
  return { href: "/vender/comprobantes", texto: "Ir a Comprobantes" };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Qué falta para poder anular (lo mismo que la base rechazaría, en el orden de la hoja)
// ---------------------------------------------------------------------------------------------------------------------------

export type FaltaParaAnular = { campo: "boleta" | "caja" | "pasarela" | "motivo"; detalle: string };

/** Lo primero que impide anular, o null si se puede. `camino` null = una base sin la lectura: no se bloquea (decide la base). */
export function problemaParaAnularPagado(h: {
  camino: CaminoBoleta | null;
  efectivo: number;
  cajaAbierta: boolean | null;
  tienda: string;
  pasarela: boolean;
  motivo: MotivoAnularPagado | null;
}): FaltaParaAnular | null {
  if (h.camino?.camino === "esperar") return { campo: "boleta", detalle: h.camino.explicacion };
  if (h.pasarela) return { campo: "pasarela", detalle: "Tiene un cobro de la pasarela: ese se devuelve desde la pasarela, no desde la tienda." };
  if (h.efectivo > 0 && h.cajaAbierta === false)
    return { campo: "caja", detalle: `Hay que devolverle ${soles(h.efectivo)} en efectivo: abre la caja de ${h.tienda}.` };
  if (!h.motivo) return { campo: "motivo", detalle: "Elige por qué se anula." };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Lo que dijo la base
// ---------------------------------------------------------------------------------------------------------------------------

/** Lo que respondió `anular_pedido_web_pagado` (o, revisando un envío en duda, `fn_resolver_intento`), leído sin caerse. */
export type RespuestaAnulacion = {
  codigo: string | null;
  boleta: { texto: string; estado: string } | null;
  notaCredito: { texto: string; estado: string } | null;
  devuelto: { medio: string; monto: number; deLaCaja: boolean }[];
};

export function leerRespuestaAnulacion(x: unknown): RespuestaAnulacion {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const comp = (y: unknown) => {
    const c = (y && typeof y === "object" ? y : {}) as Record<string, unknown>;
    return typeof c.texto === "string" && c.texto !== "" ? { texto: c.texto, estado: typeof c.estado === "string" ? c.estado : "pendiente" } : null;
  };
  const devuelto = Array.isArray(o.devuelto)
    ? o.devuelto.flatMap((d) => {
        const g = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
        const monto = Number(g.monto);
        return typeof g.medio === "string" && Number.isFinite(monto) ? [{ medio: g.medio, monto, deLaCaja: g.de_la_caja === true }] : [];
      })
    : [];
  return { codigo: typeof o.codigo === "string" ? o.codigo : null, boleta: comp(o.boleta), notaCredito: comp(o.nota_credito), devuelto };
}

/** El aviso de éxito: cuánto se le devolvió (y cuánto salió de la caja), que sus prendas volvieron y qué pasó con la boleta. */
export function avisoTrasAnular(codigo: string, r: RespuestaAnulacion, tienda: string): { titulo: string; detalle: string } {
  const total = sumar(r.devuelto);
  const caja = sumar(r.devuelto.filter((d) => d.deLaCaja));
  const plata =
    total > 0
      ? `Se le devolvieron ${soles(total)}${caja > 0 ? ` (${soles(caja)} en efectivo, de la caja de ${tienda})` : ""}.`
      : "No había pagos que devolver.";
  const boleta = r.notaCredito
    ? ` Su boleta ${r.boleta?.texto ?? ""} se anula con la nota de crédito ${r.notaCredito.texto}, que sale sola a SUNAT.`.replace("  ", " ")
    : r.boleta?.estado === "no_emitido"
      ? ` Su boleta ${r.boleta.texto} se liberó sin enviarla.`
      : "";
  return { titulo: `Pedido ${codigo} anulado`, detalle: `${plata} Sus prendas volvieron a estar libres.${boleta}` };
}

/** Lo que la base dijo al anular. `releer`: el pedido cambió mientras la hoja estaba abierta (otra caja lo anuló o lo entregó): la hoja
 *  se cierra y el pedido se vuelve a leer. `campo`: dónde se dice. Los mensajes de la base ya están en palabras de tienda. */
export function errorDeAnularPagado(
  error: { message?: string; hint?: string | null } | null | undefined,
  h: { efectivo: number; tienda: string },
): { campo: FaltaParaAnular["campo"] | null; titulo: string; detalle: string; releer: boolean } | null {
  if (!error) return null;
  const hint = error.hint ?? "";
  const detalle = (error.message ?? "").trim();
  if (hint === "pedido_web_estado") return { campo: null, titulo: "El pedido ya cambió", detalle, releer: true };
  if (hint.startsWith("pedido_web_boleta_") || hint === "pedido_web_sin_serie_nota")
    return { campo: "boleta", titulo: "La boleta todavía no se puede anular", detalle, releer: false };
  if (hint === "pedido_web_sin_caja") return { campo: "caja", titulo: "No hay una caja abierta", detalle, releer: false };
  if (hint === "efectivo_insuficiente")
    return {
      campo: "caja",
      titulo: "No hay tanto efectivo en la caja",
      detalle: `La caja de hoy de ${h.tienda} no tiene los ${soles(h.efectivo)} en efectivo que hay que devolverle. No se anuló nada: completa la caja o espera a que entre efectivo.`,
      releer: false,
    };
  if (hint === "pedido_web_pago_pasarela") return { campo: "pasarela", titulo: "Se devuelve desde la pasarela", detalle, releer: false };
  if (hint === "pedido_web_motivo") return { campo: "motivo", titulo: "Elige por qué se anula", detalle, releer: false };
  if (hint === "pedido_web_sin_modulo") return { campo: null, titulo: "Tu rol no tiene «Pedidos web»", detalle, releer: false };
  if (hint === "pedido_web_otra_tienda") return { campo: null, titulo: "Ese pedido es de otra tienda", detalle, releer: false };
  return null;
}

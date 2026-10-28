// Mandarle la boleta al cliente por WhatsApp, desde el WhatsApp de la tienda (ADR-0288, «Actualización 2026-10-03 (o)»).
// Lógica pura, sin React ni red: la usan «Venta registrada» (Vender), Comprobantes y las opciones de un comprobante.
//
// CONTRATO
//   PROMETE: armar UN solo mensaje para cualquier comprobante (las tres pantallas antes lo escribían cada una a su manera, una con
//            el primer nombre y otra con el nombre completo), y decir si a esta venta se le puede ofrecer «Enviar por WhatsApp» y por
//            qué no, cuando no.
//   ASUME:   el celular es el que la cajera anotó o el de la ficha (9 dígitos); el enlace al PDF es el que devolvió Lucode y vive en
//            `comprobantes.respuesta_sunat.pdfUrl`; quien manda es una persona, desde el WhatsApp de la tienda: no hay envío automático
//            (decisión de Felipe del 2026-09-30, docs/investigacion/2026-09-30-whatsapp-bot-y-consentimiento.md).
//   NO HACE: no manda nada ni guarda que se mandó; no suscribe al cliente a nada (es un aviso del comprobante, no publicidad).
//
// El mensaje NO lleva nombre: el padrón trae «APELLIDO APELLIDO NOMBRE», así que «el primer nombre» saludaría con el apellido, y el
// nombre completo en mayúsculas grita. Sin nombre tampoco viaja un dato personal más a un chat que puede ser el equivocado.

import { ETIQUETA_TIPO, type EntornoTransmision, type EstadoComprobante, type TipoComprobante } from "./comprobantes-reglas";
import { celularLegible } from "./club-caja-reglas";
import { enlaceWhatsAppA, numeroWhatsApp } from "./facturacion-comprobantes-reglas";

/** Cuánto se espera, con el cliente en el mostrador, a que Lucode entregue el PDF antes de decir que se envía después. */
export const ESPERA_PDF_MS = 20_000;
/** Cada cuánto se le pregunta a la base si ya llegó. */
export const CONSULTA_PDF_CADA_MS = 2_000;

/** El enlace del PDF tal como lo guardó Lucode, o null si no es un https (no se pone en un mensaje algo que no se entiende). */
export function pdfUrlDeRespuesta(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const url = valor.trim();
  return /^https:\/\/\S+$/i.test(url) ? url : null;
}

/** «Hola, gracias por tu compra en CAYLA. Aquí está tu boleta B001-000123: https://…» */
export function mensajeDelComprobante(c: { tipo: TipoComprobante; serie: string; numero: number | string; pdfUrl: string }): string {
  const numero = `${c.serie}-${String(c.numero).padStart(6, "0")}`;
  return `Hola, gracias por tu compra en CAYLA. Aquí está tu ${ETIQUETA_TIPO[c.tipo].toLowerCase()} ${numero}: ${c.pdfUrl}`;
}

/** Los estados en los que ya no va a haber un PDF que mandar. */
const SIN_PDF_PARA_SIEMPRE: readonly EstadoComprobante[] = ["rechazado", "anulado", "no_emitido", "interna"];

/** Qué se le ofrece a la cajera en «Venta registrada». */
export type EnvioDeBoleta =
  /** No hay nada que ofrecer: sin celular, o un documento que no es boleta ni factura. La tarjeta no aparece. */
  | { fase: "nada" }
  /** Hay celular pero Lucode todavía no entrega el PDF: se espera (hasta `ESPERA_PDF_MS`). */
  | { fase: "esperando"; celular: string }
  /** Se puede mandar: `href` abre el chat de ese celular con el mensaje escrito. */
  | { fase: "listo"; celular: string; href: string }
  /** Hay celular pero no se puede mandar ahora, y por qué (se dice, no se esconde). */
  | { fase: "sin_pdf"; celular: string; motivo: string };

export type EntradaEnvio = {
  /** El celular de quien compra, como esté (con o sin espacios); null = sin celular. */
  celular: string | null;
  comprobante: { tipo: TipoComprobante; serie: string; numero: number };
  estado: EstadoComprobante | null;
  entorno: EntornoTransmision;
  pdfUrl: string | null;
  /** Cuánto lleva esperando el PDF, en milisegundos. */
  esperadoMs: number;
};

export function envioDeLaBoleta(e: EntradaEnvio): EnvioDeBoleta {
  const celular = numeroWhatsApp(e.celular) ? celularLegible(e.celular ?? "") : null;
  // Solo boleta y factura tienen un PDF de SUNAT que mandar (la nota de venta es interna, la nota de crédito va por Posventa).
  if (!celular || (e.comprobante.tipo !== "boleta" && e.comprobante.tipo !== "factura")) return { fase: "nada" };

  if (e.estado !== null && SIN_PDF_PARA_SIEMPRE.includes(e.estado)) {
    return { fase: "sin_pdf", celular, motivo: "SUNAT no la aceptó: no hay PDF que enviar. Avisa a tu líder." };
  }
  if (e.pdfUrl) {
    // Un PDF del sandbox de Lucode no es válido ante SUNAT: mandarlo le daría a la clienta una boleta que no vale.
    if (e.entorno !== "produccion") {
      return { fase: "sin_pdf", celular, motivo: "Se emitió en modo de pruebas: ese PDF no es válido y no se envía." };
    }
    return { fase: "listo", celular, href: enlaceWhatsAppA(e.celular, mensajeDelComprobante({ ...e.comprobante, pdfUrl: e.pdfUrl })) };
  }
  if (e.esperadoMs >= ESPERA_PDF_MS) {
    return {
      fase: "sin_pdf",
      celular,
      motivo: "SUNAT todavía no entrega el PDF. Cuando lo tenga, se envía desde Comprobantes, con el botón WhatsApp de esta boleta.",
    };
  }
  return { fase: "esperando", celular };
}

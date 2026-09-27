// Cambios conectado con las pantallas vecinas (spike 2026-09-26, `docs/maquetas/cambios-mejoras-2026-09/`).
// Lógica pura, sin DOM ni Supabase, para que la pantalla solo pinte:
//   · qué buscar después de leer un código con la cámara (la etiqueta de una prenda o el QR de una boleta);
//   · qué salidas ofrecer cuando la talla elegida no está en esta sede (traslado, apartado, pedido no atendido);
//   · el texto del ticket del cambio que se le manda a la clienta por WhatsApp.
// Nada de esto mueve stock ni dinero: los accesos llevan a la pantalla que sí lo hace, con lo elegido ya puesto.

import { nombreCortoSede, type SedeConStock } from "./stock-por-sede";

/**
 * Lo que se busca en Cambios después de una lectura de la cámara. La etiqueta de la prenda trae su código tal cual
 * («CMS-0001-NEG-M»), y la búsqueda de ventas ya lo entiende. El QR de una boleta o factura electrónica es el de SUNAT
 * (`RUC|03|B004|00000031|…`, `textoQrSunat`): de ahí sale «B004-31», que es como se busca una boleta.
 */
export function busquedaDesdeLectura(crudo: string): string {
  const texto = crudo.trim();
  const partes = texto.split("|");
  if (partes.length >= 4 && /^\d{11}$/.test(partes[0]!) && /^(01|03)$/.test(partes[1]!)) {
    const serie = partes[2]!.trim().toUpperCase();
    const numero = Number(partes[3]);
    if (/^[A-Z0-9]{4}$/.test(serie) && Number.isInteger(numero) && numero > 0) return `${serie}-${numero}`;
  }
  return texto;
}

export type SedeConId = { id: string; nombre: string };

/** Una sede donde sí hay la prenda elegida, con su id (para prellenar el traslado) y cuántas hay. */
export type SedeOrigen = { id: string; sede: string; cantidad: number };

/**
 * Las sedes desde donde se podría pedir la prenda, de más a menos. `stockOtrasSedes` trae nombres cortos
 * («AQP»), no ids (`agruparStockPorSede`); se cruzan con la lista de sedes por ese mismo nombre corto. Una sede que no
 * se puede identificar no se ofrece: mejor una salida menos que un traslado prellenado con la sede equivocada.
 */
export function sedesDeOrigen(otrasSedes: readonly SedeConStock[], sedes: readonly SedeConId[]): SedeOrigen[] {
  const idPorNombre = new Map(sedes.map((s) => [nombreCortoSede(s.nombre), s.id]));
  return otrasSedes.flatMap((o) => {
    const id = idPorNombre.get(o.sede);
    return id && o.cantidad > 0 ? [{ id, sede: o.sede, cantidad: o.cantidad }] : [];
  });
}

/**
 * El traslado prellenado (`/inventario/mover`, ADR-0101): de la sede que tiene la prenda a esta, una unidad. El origen
 * por URL solo lo respeta un líder (la página lo ignora para una integrante, que siempre despacha desde su sede); por eso
 * la pantalla solo ofrece el enlace a quien puede usarlo.
 */
export function hrefPedirTraslado(origenId: string, destinoId: string, varianteId: string, cantidad: number): string {
  const p = new URLSearchParams({ origen: origenId, destino: destinoId, variante: varianteId, cantidad: String(Math.max(1, cantidad)) });
  return `/inventario/mover?${p}`;
}

/** Lo que la clienta se lleva escrito del cambio: qué devolvió, qué se llevó y la diferencia. No es comprobante de
 *  SUNAT y lo dice, para que nadie lo tome por una boleta. */
export function textoTicketCambio(t: {
  operacion: string;
  comprobante: string | null;
  devolvio: string;
  sellevo: string;
  diferencia: number;
  sede: string;
}): string {
  const diferencia =
    t.diferencia === 0
      ? "Sin diferencia de precio"
      : t.diferencia > 0
        ? `Pagaste S/ ${t.diferencia.toFixed(2)} de diferencia`
        : `Te devolvimos S/ ${(-t.diferencia).toFixed(2)}`;
  return [
    `Hola, este es el resumen de tu cambio en CAYLA ${t.sede}:`,
    `Cambio N.º ${t.operacion}${t.comprobante ? ` · de la ${t.comprobante}` : ""}`,
    `Devolviste: ${t.devolvio}`,
    `Te llevaste: ${t.sellevo}`,
    diferencia,
    "(Resumen del cambio, no es un comprobante de pago.)",
  ].join("\n");
}

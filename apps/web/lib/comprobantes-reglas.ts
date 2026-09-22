// Tipos + reglas puras de Facturación — sin `createClient`, sin
// `next/headers`, cero dependencia de servidor. Mismo patrón que
// `proformas-reglas.ts`: lo que un componente cliente necesita como VALOR
// (no solo como tipo) tiene que vivir en un archivo que ningún fetcher
// server-only pueda arrastrar al bundle del navegador — si esto viviera en
// `comprobantes.ts` junto a `getComprobantesMes`, importar `ETIQUETA_TIPO`
// desde un "use client" traería `next/headers` al navegador y Next.js
// rechaza el build entero (se encontró exactamente así, 2026-09-12, al
// conectar Vender con Facturación).

// "nota_venta" (ADR-0164): documento INTERNO de la tienda, con serie propia (NV01…), sin IGV
// desglosado y que NUNCA se transmite a SUNAT — por eso nace en su propio estado, "interna".
export type TipoComprobante = "boleta" | "factura" | "nota_credito" | "nota_debito" | "nota_venta";
// "no_emitido" (ADR-0093): un líder liberó un comprobante `pendiente` que nunca se
// transmitió a SUNAT — su número queda sin usar para siempre, nunca se reutiliza. Distinto
// de "anulado": eso es una baja real ANTE SUNAT de algo que sí llegó a transmitirse.
export type EstadoComprobante = "pendiente" | "enviado" | "aceptado" | "rechazado" | "anulado" | "no_emitido" | "interna";
/** `null` = todavía no se transmitió. `sandbox` = se transmitió, pero a la
 *  plataforma de pruebas: SUNAT no lo vio y el comprobante NO es válido. */
export type EntornoTransmision = "sandbox" | "produccion" | null;

export type Comprobante = {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  cliente_tipo_doc: "dni" | "ruc" | "sin_documento";
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  total: number;
  estado: EstadoComprobante;
  entorno_transmision: EntornoTransmision;
  motivo_rechazo: string | null;
  motivo_anulacion: string | null;
  /** Por qué se liberó — solo tiene sentido con `estado === "no_emitido"` (ADR-0093). */
  motivo_no_emitido: string | null;
  /** Con esto lleno y `estado` todavía "aceptado", la baja se pidió pero SUNAT
   *  no la confirmó: el resumen diario de boletas se procesa diferido. */
  anulacion_solicitada_at: string | null;
  created_at: string;
  ubicacion_id: string;
  /** Sacados de `respuesta_sunat` (lo que Lucode devolvió al transmitir) —
   *  `null` mientras no se transmite o si el proveedor no los mandó. SUNAT
   *  ya los tiene desde que `estado` pasa a "enviado"/"aceptado"; sin esto
   *  la clienta nunca los ve, aunque el documento ya sea legal (hueco
   *  encontrado en la auditoría de Facturación, 2026-09-17). */
  pdfUrl: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
};

export type SerieComprobante = {
  id: string;
  ubicacion_id: string;
  tipo: TipoComprobante;
  serie: string;
  siguiente_numero: number;
};

export type ItemVentaDelDia = {
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
  precio_unitario: number;
};

export type VentaDelDia = {
  venta_id: string;
  hora: string;
  ubicacion_nombre: string;
  vendedor: string;
  cliente_nombre: string;
  items: ItemVentaDelDia[];
  total: number;
  metodos_pago: string | null;
  comprobante_tipo: TipoComprobante | null;
  comprobante_texto: string | null;
  comprobante_estado: EstadoComprobante | null;
};

export const ETIQUETA_TIPO: Record<TipoComprobante, string> = {
  boleta: "Boleta",
  factura: "Factura",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  nota_venta: "Nota de venta",
};

export const ESTADO_ESTILO: Record<EstadoComprobante, string> = {
  pendiente: "border-ambar/30 bg-ambar/10 text-ambar-profundo",
  enviado: "border-ambar/30 bg-ambar/10 text-ambar-profundo",
  aceptado: "border-verde/45 bg-verde/10 text-verde-profundo",
  rechazado: "border-rojo/30 bg-rojo/10 text-rojo-profundo",
  anulado: "border-tinta/20 bg-tinta/5 text-tinta/65",
  // Mismo tono apagado que "anulado" — ambos son estados cerrados que ya no piden
  // acción — pero es un color, no una palabra: la etiqueta de abajo es la que dice
  // la diferencia real (nunca se transmitió, nada que ver con SUNAT).
  no_emitido: "border-tinta/20 bg-tinta/5 text-tinta/65",
  // La nota de venta: cerrada desde que nace, no pide ninguna acción ante SUNAT.
  interna: "border-tinta/20 bg-tinta/5 text-tinta/65",
};

export const ESTADO_ETIQUETA: Record<EstadoComprobante, string> = {
  pendiente: "Pendiente de enviar",
  enviado: "Enviado a SUNAT",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  anulado: "Anulado",
  no_emitido: "No emitido",
  interna: "Interna — no va a SUNAT",
};

/** El tipo de documento (DNI/RUC/sin documento) no es una decisión aparte
 *  del tipo de comprobante — se deriva de él (una factura SIEMPRE exige
 *  RUC). Vivía copiada, carácter por carácter, en ComprobantesPanel.tsx y
 *  ProformasPanel.tsx; Vender la necesita también — a la tercera vez, se
 *  extrae en vez de copiarse de nuevo. */
export function tipoDocumentoDeCliente(
  tipo: TipoComprobante,
  clienteNumDoc: string
): "dni" | "ruc" | "sin_documento" {
  return tipo === "factura" ? "ruc" : clienteNumDoc ? "dni" : "sin_documento";
}

/** Lo que se puede leer de "B001-000010" (o "B001-10", o solo "10") escrito a mano en
 *  Devoluciones o Cambios para encontrar una venta que ya no está entre las últimas 30.
 *  `numero` viene sin ceros a la izquierda — así vive en `comprobantes.numero`. `null`
 *  en los dos significa que no se pudo leer ningún número: no hay nada que buscar. */
export function parsearComprobante(texto: string): { serie: string | null; numero: number | null } {
  const limpio = texto.trim().toUpperCase();
  if (!limpio) return { serie: null, numero: null };

  const conSerie = limpio.match(/^([A-Z]+\d*)[\s-]+(\d+)$/);
  if (conSerie) return { serie: conSerie[1], numero: Number(conSerie[2]) };

  const soloNumero = limpio.match(/^(\d+)$/);
  if (soloNumero) return { serie: null, numero: Number(soloNumero[1]) };

  return { serie: null, numero: null };
}

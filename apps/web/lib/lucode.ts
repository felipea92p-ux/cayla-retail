// Conector con Lucode (app.apisunat.pe / sandbox.apisunat.pe) — el PSE
// (tercerización SUNAT, ADR-0005) elegido para transmitir los comprobantes
// que ya reserva `emitir_comprobante`/`emitir_nota` (ADR-0007, ADR-0009).
//
// CONTRATO
//   PROMETE: transmite un comprobante ya reservado en `comprobantes` a SUNAT
//            vía Lucode, y traduce su respuesta al mismo vocabulario de
//            estado que ya usa el esquema (pendiente/enviado/aceptado/
//            rechazado — ver `comprobantes.estado`, ADR-0007).
//   ASUME:   el comprobante ya existe con serie/número/ítems asignados — esto
//            NO reserva número ni valida reglas de negocio, eso ya lo hizo la
//            RPC. Solo transmite y traduce.
//   NO HACE: no decide CUÁNDO transmitir (eso es el route handler que llama a
//            esto) ni reintenta solo — reintentar un documento tributario es
//            una decisión de negocio, no de este adaptador. Si Lucode no
//            responde, el comprobante se queda en su estado real
//            ("pendiente"), nunca se le inventa un estado (principio 9,
//            "todo puede fallar").
//
// POR QUÉ ES UN ADAPTADOR Y NO UNA LLAMADA DIRECTA DESDE EL ROUTE HANDLER:
// Felipe ya cambió de proveedor una vez (Nubefact → Lucode, ver ADR-0005)
// antes de transmitir el primer comprobante real. El formato interno de
// `comprobantes.items` (ADR-0009) es deliberadamente más simple que el que
// pide cualquier PSE — la traducción a la forma exacta de Lucode vive aquí,
// aislada, con el mismo criterio que `padron.ts` aísla a RENIEC/SUNAT de sus
// proveedores: cambiar de PSE otra vez es cambiar este archivo, no una
// migración ni el esquema.
//
// LO VERIFICADO CONTRA LA DOCUMENTACIÓN PÚBLICA (docs.apisunat.pe) Y LO QUE
// FALTA CONFIRMAR EN SANDBOX REAL antes de dar esto por probado:
//   - Base URLs, endpoints, autenticación Bearer, forma de factura/boleta:
//     confirmado con la documentación pública.
//   - Forma exacta de nota_credito/nota_debito (mismo nombre de campo
//     `nota_credito_codigo_tipo` reusado para nota_debito): la documentación
//     lo describe como "estructura similar", no lo confirma campo por campo.
//     Verificar con una nota_debito real en sandbox antes de confiar en esto.
//   - El catálogo MOTIVO_NC/MOTIVO_ND de abajo solo cubre los motivos que
//     CAYLA puede llegar a usar en retail — no es el catálogo 09/10 completo.

export type EntornoLucode = "sandbox" | "produccion";

const BASE_URL: Record<EntornoLucode, string> = {
  sandbox: "https://sandbox.apisunat.pe",
  produccion: "https://app.apisunat.pe",
};

export type TipoDocumentoLucode = "boleta" | "factura" | "nota_credito" | "nota_debito";

export type ItemComprobante = {
  descripcion: string;
  cantidad: number;
  /** Sin IGV — mismo criterio que `comprobantes.subtotal` (ver ADR-0007). */
  precio_unitario: number;
};

export type DatosComprobante = {
  tipo: TipoDocumentoLucode;
  serie: string;
  numero: number;
  moneda: "PEN" | "USD";
  clienteTipoDoc: "dni" | "ruc" | "sin_documento";
  clienteNumDoc: string | null;
  clienteNombre: string | null;
  total: number;
  items: ItemComprobante[];
  /** Solo NC/ND: el comprobante que corrige. */
  original?: { tipo: "boleta" | "factura"; serie: string; numero: number } | null;
  /** Solo NC/ND: código del Catálogo 09 (crédito) o 10 (débito) de SUNAT —
   *  es lo que `comprobantes.motivo` ya guarda desde la Fase 0. */
  motivoCodigo?: string | null;
};

export type MotivoErrorLucode = "sin_credenciales" | "sin_respuesta" | "credenciales_invalidas" | "rechazado_por_lucode";

export type ResultadoLucode =
  | {
      ok: true;
      estado: "ACEPTADO" | "PENDIENTE" | "RECHAZADO";
      hash: string | null;
      xmlUrl: string | null;
      cdrUrl: string | null;
      pdfUrl: string | null;
      mensaje: string | null;
    }
  | { ok: false; motivo: MotivoErrorLucode; detalle: string };

// Catálogo 09 (Notas de Crédito) y 10 (Notas de Débito) de SUNAT — la
// descripción textual que Lucode exige además del código, para los motivos
// que CAYLA puede llegar a usar en un negocio de retail (devoluciones,
// anulaciones, descuentos). "10"/"Otros" cubre cualquier caso no listado.
const MOTIVO_NC: Record<string, string> = {
  "01": "Anulación de la operación",
  "02": "Anulación por error en el RUC",
  "03": "Corrección por error en la descripción",
  "04": "Descuento global",
  "05": "Descuento por ítem",
  "06": "Devolución total",
  "07": "Devolución por ítem",
  "08": "Bonificación",
  "09": "Disminución en el valor",
  "10": "Otros",
};
const MOTIVO_ND: Record<string, string> = {
  "01": "Intereses por mora",
  "02": "Aumento en el valor",
  "03": "Penalidades / otros conceptos",
  "10": "Otros",
};

function itemLucode(it: ItemComprobante) {
  return {
    unidad_de_medida: "NIU",
    descripcion: it.descripcion,
    cantidad: String(it.cantidad),
    valor_unitario: it.precio_unitario.toFixed(6),
    porcentaje_igv: "18",
    codigo_tipo_afectacion_igv: "10", // gravado — operación onerosa (el caso normal de CAYLA)
    nombre_tributo: "IGV",
  };
}

function payloadDe(c: DatosComprobante): Record<string, unknown> {
  // Catálogo 06 de SUNAT: "1" = DNI, "6" = RUC. Sin documento reusa "1" con el
  // número placeholder que el propio Lucode documenta para boletas sin
  // identificar al cliente — no es una convención inventada acá.
  const sinDoc = c.clienteTipoDoc === "sin_documento" || !c.clienteNumDoc;
  const base = {
    documento: c.tipo,
    serie: c.serie,
    numero: c.numero,
    fecha_de_emision: new Date().toISOString().slice(0, 10),
    moneda: c.moneda,
    tipo_operacion: "0101",
    cliente_tipo_de_documento: sinDoc ? "1" : c.clienteTipoDoc === "ruc" ? "6" : "1",
    cliente_numero_de_documento: sinDoc ? "99999999" : c.clienteNumDoc!,
    cliente_denominacion: c.clienteNombre?.trim() || "CLIENTE VARIOS",
    cliente_direccion: "-",
    items: c.items.map(itemLucode),
    total: c.total.toFixed(2),
  };

  if (c.tipo === "nota_credito" || c.tipo === "nota_debito") {
    if (!c.original || !c.motivoCodigo) {
      throw new Error(`${c.tipo} requiere comprobante original y código de motivo`);
    }
    const catalogo = c.tipo === "nota_credito" ? MOTIVO_NC : MOTIVO_ND;
    return {
      ...base,
      nota_credito_codigo_tipo: c.motivoCodigo,
      nota_credito_motivo: catalogo[c.motivoCodigo] ?? "Otros",
      documento_afectado: { documento: c.original.tipo, serie: c.original.serie, numero: c.original.numero },
    };
  }

  return base;
}

function entorno(): EntornoLucode {
  return process.env.LUCODE_ENTORNO === "produccion" ? "produccion" : "sandbox";
}

type LlamadaCruda = { ok: true; json: Record<string, unknown> } | { ok: false; motivo: MotivoErrorLucode; detalle: string };

async function llamar(ruta: string, body: unknown): Promise<LlamadaCruda> {
  const token = process.env.LUCODE_TOKEN;
  if (!token) {
    return { ok: false, motivo: "sin_credenciales", detalle: "Falta LUCODE_TOKEN en el entorno" };
  }

  let respuesta: Response;
  try {
    // 15s: transmitir a SUNAT es más lento que consultar un padrón — no se
    // corta tan agresivo como padron.ts (5s), pero tampoco se deja colgado
    // indefinidamente a quien está cerrando una venta.
    respuesta = await fetch(`${BASE_URL[entorno()]}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, motivo: "sin_respuesta", detalle: "Lucode no respondió a tiempo" };
  }

  if (respuesta.status === 401 || respuesta.status === 403) {
    return { ok: false, motivo: "credenciales_invalidas", detalle: "Lucode rechazó el token" };
  }

  let json: Record<string, unknown>;
  try {
    json = (await respuesta.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, motivo: "sin_respuesta", detalle: "Lucode devolvió algo que no es JSON" };
  }

  if (!respuesta.ok) {
    return {
      ok: false,
      motivo: "rechazado_por_lucode",
      detalle: typeof json.message === "string" ? json.message : `Lucode respondió ${respuesta.status}`,
    };
  }
  return { ok: true, json };
}

function traducirEstado(json: Record<string, unknown>): ResultadoLucode {
  const payload = (json.payload as Record<string, unknown>) ?? {};
  const estadoCrudo = String(payload.estado ?? "").toUpperCase();
  const estado: "ACEPTADO" | "PENDIENTE" | "RECHAZADO" =
    estadoCrudo === "ACEPTADO" ? "ACEPTADO" : estadoCrudo === "RECHAZADO" ? "RECHAZADO" : "PENDIENTE";
  const pdf = (payload.pdf as Record<string, unknown>) ?? {};
  return {
    ok: true,
    estado,
    hash: typeof payload.hash === "string" ? payload.hash : null,
    xmlUrl: typeof payload.xml === "string" ? payload.xml : null,
    cdrUrl: typeof payload.cdr === "string" ? payload.cdr : null,
    pdfUrl: typeof pdf.a4 === "string" ? pdf.a4 : typeof pdf.ticket === "string" ? pdf.ticket : null,
    mensaje: typeof json.message === "string" ? json.message : null,
  };
}

/** Transmite un comprobante ya reservado. Devuelve el estado REAL que Lucode
 *  reporta — nunca asume "aceptado" solo porque la llamada respondió 200: la
 *  aceptación es de SUNAT, no de Lucode, y a veces llega como PENDIENTE para
 *  consultar después con `consultarEstadoLucode`. */
export async function emitirDocumentoLucode(c: DatosComprobante): Promise<ResultadoLucode> {
  const r = await llamar("/api/v3/documents", payloadDe(c));
  if (!r.ok) return r;
  return traducirEstado(r.json);
}

export async function consultarEstadoLucode(tipo: TipoDocumentoLucode, serie: string, numero: number): Promise<ResultadoLucode> {
  const r = await llamar("/api/v3/status", { documento: tipo, serie, numero });
  if (!r.ok) return r;
  return traducirEstado(r.json);
}

export async function anularDocumentoLucode(
  tipo: Exclude<TipoDocumentoLucode, "boleta">,
  serie: string,
  numero: number,
  motivo: string
): Promise<ResultadoLucode> {
  const r = await llamar("/api/v3/voided", { documento: tipo, serie, numero, motivo_de_anulacion: motivo });
  if (!r.ok) return r;
  return traducirEstado(r.json);
}

// Los comprobantes de un cambio con diferencia (ADR-0671), dichos en la pantalla de Cambios. Lógica pura, sin React ni Supabase: la
// pantalla, el ticket y `getVentasRecientes` leen de aquí, y `cambios-documentos-reglas.test.ts` recorre todos los casos.
//
// QUÉ DECIDE LA BASE (supabase/migrations/20261116213000_cambio_con_comprobantes_parte2_funciones.sql) Y AQUÍ SOLO SE REPITE:
//   · Sin diferencia (mismo precio, o el mismo modelo en otra talla o color que no cuesta más): no sale nada.
//   · Con diferencia: un comprobante NUEVO por todo lo que se lleva, siempre en el acto, del mismo tipo que el original (sin original,
//     boleta); y una NOTA DE CRÉDITO por lo pagado de lo devuelto sobre el original, si es una boleta o factura viva y se pagó algo.
//   · La nota sale en el acto si SUNAT ya aceptó el original (y no tiene una baja en trámite); si no, sale sola cuando lo acepte.
//   · nuevo − nota = diferencia, al céntimo: son las MISMAS cifras que dieron la diferencia (`totalesDelCambio`).
// La pantalla pregunta además a la base (`previsualizar_documentos_cambio`), que tiene la última palabra: lo de aquí es lo que se dice
// mientras esa respuesta llega (y si no llega).

import { soles } from "./compras-reglas";
import type { EstadoComprobante } from "./comprobantes-reglas";
import { esTipoDocComprobante, documentoLegibleComprobante, problemaDocumentoComprobante, tipoDocDelComprobante, type TipoDocComprobante } from "./documento-comprobante-reglas";
import type { TipoDocumentoClienta } from "./documento-clienta-reglas";

/** Lo que puede ser el original de un cambio, y por eso también su comprobante nuevo. */
export type TipoDocumentoCambio = "boleta" | "factura" | "nota_venta";

/** El documento de la venta que un cambio corrige: el MISMO que elige `retail.fn_original_del_cambio`. */
export type DocumentoOriginal = {
  id: string;
  tipo: TipoDocumentoCambio;
  /** «B005-000224». */
  numero: string;
  estado: EstadoComprobante;
  /** Tiene pedida su baja ante SUNAT: su nota no sale mientras tanto (la base tampoco la emite). */
  bajaEnTramite: boolean;
  clienteTipoDoc: TipoDocComprobante;
  clienteNumDoc: string | null;
  clienteNombre: string | null;
};

/** Una fila de `comprobantes` de la venta, como la lee `getVentasRecientes`. */
export type FilaComprobanteDeVenta = {
  id: string;
  tipo: string;
  serie: string;
  numero: number;
  estado: string;
  esAnticipo: boolean;
  anulacionSolicitadaAt: string | null;
  clienteTipoDoc: string | null;
  clienteNumDoc: string | null;
  clienteNombre: string | null;
  creadoEn: string;
};

const ES_TIPO_CAMBIO = new Set<string>(["boleta", "factura", "nota_venta"]);
const MUERTO = new Set<string>(["anulado", "no_emitido"]);

/** «B005-000224»: el mismo formato de 6 dígitos que el resto del ERP. */
export function numeroDeDocumento(d: { serie: string; numero: number }): string {
  return `${d.serie}-${String(d.numero).padStart(6, "0")}`;
}

/**
 * El original de un cambio entre los comprobantes de su venta, con la regla de `fn_original_del_cambio`: boleta, factura o nota de venta
 * (nunca un anticipo de apartado); el vivo primero (uno liberado o anulado solo si no hay otro) y, entre iguales, el más reciente.
 * Si la pantalla eligiera otro, prometería una nota de crédito sobre un documento y la base la emitiría sobre otro.
 */
export function originalDelCambio(filas: readonly FilaComprobanteDeVenta[]): DocumentoOriginal | null {
  const elegido = filas
    .filter((f) => ES_TIPO_CAMBIO.has(f.tipo) && !f.esAnticipo)
    .slice()
    .sort((a, b) => Number(MUERTO.has(a.estado)) - Number(MUERTO.has(b.estado)) || b.creadoEn.localeCompare(a.creadoEn))[0];
  if (!elegido) return null;
  return {
    id: elegido.id,
    tipo: elegido.tipo as TipoDocumentoCambio,
    numero: numeroDeDocumento(elegido),
    estado: elegido.estado as EstadoComprobante,
    bajaEnTramite: elegido.anulacionSolicitadaAt !== null,
    clienteTipoDoc: esTipoDocComprobante(elegido.clienteTipoDoc) ? elegido.clienteTipoDoc : "sin_documento",
    clienteNumDoc: elegido.clienteNumDoc?.trim() || null,
    clienteNombre: elegido.clienteNombre?.trim() || null,
  };
}

/** Cuándo sale la nota de crédito: en el acto, cuando SUNAT acepte el original, o no lleva. */
export type CuandoNota = "ahora" | "despues" | "no";

/** Qué sale de un cambio. Los montos son los que dieron la diferencia: `nuevo.total − nota.total = diferencia` cuando hay nota. */
export type DocumentosDelCambio =
  | { emite: false }
  | {
      emite: true;
      nuevo: { tipo: TipoDocumentoCambio; total: number };
      nota: { cuando: CuandoNota; total: number; original: string | null; originalTipo: TipoDocumentoCambio | null };
    };

export type DocumentosQueSalen = Extract<DocumentosDelCambio, { emite: true }>;

const aCentimos = (n: number) => Math.round(n * 100) / 100;

/** Cuándo sale la nota sobre ese original (la misma cuenta que `previsualizar_documentos_cambio`). */
function cuandoSaleLaNota(original: DocumentoOriginal | null, pagado: number): CuandoNota {
  if (!original || original.tipo === "nota_venta" || MUERTO.has(original.estado) || !(pagado > 0)) return "no";
  return original.estado === "aceptado" && !original.bajaEnTramite ? "ahora" : "despues";
}

/**
 * Lo que va a salir de un cambio. `totalNuevo`: el valor de TODO lo que se lleva, cada prenda a su precio de cambio (`valorNuevo` de
 * `totalesDelCambio`); `pagado`: lo que pagó por lo que devuelve. `original` ausente (una línea armada antes de existir esto): se toma
 * como sin original, y la respuesta de la base lo corrige.
 */
export function documentosDelCambio(e: { diferencia: number; totalNuevo: number; pagado: number; original: DocumentoOriginal | null | undefined }): DocumentosDelCambio {
  if (aCentimos(e.diferencia) === 0) return { emite: false };
  const original = e.original ?? null;
  const pagado = aCentimos(e.pagado);
  return {
    emite: true,
    nuevo: { tipo: original?.tipo ?? "boleta", total: aCentimos(e.totalNuevo) },
    nota: { cuando: cuandoSaleLaNota(original, pagado), total: pagado, original: original?.numero ?? null, originalTipo: original?.tipo ?? null },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La respuesta de `previsualizar_documentos_cambio` (jsonb). Se lee con cuidado: lo que no tenga la forma esperada no se usa.
// ---------------------------------------------------------------------------------------------------------------------------------

export type PreviaDocumentos = {
  documentos: DocumentosDelCambio;
  /** El cliente con que saldría el comprobante nuevo, y si se puede cambiar (boleta o nota de venta; una factura va al mismo RUC). */
  cliente: { tipoDoc: TipoDocComprobante; numDoc: string | null; nombre: string | null; editable: boolean } | null;
  /** Lo que impediría guardar el cambio, en palabras de la base, o null. */
  problema: string | null;
};

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const numero = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x.trim() : null);
const tipoCambio = (x: unknown): TipoDocumentoCambio | null => (typeof x === "string" && ES_TIPO_CAMBIO.has(x) ? (x as TipoDocumentoCambio) : null);

/** «B005-224» (como lo arma la base) → «B005-000224», como lo escribe el resto de la pantalla. */
function numeroLargo(x: unknown): string | null {
  const t = texto(x);
  const m = t ? /^([A-Z0-9]{2,4})-(\d+)$/i.exec(t) : null;
  return m ? numeroDeDocumento({ serie: m[1]!.toUpperCase(), numero: Number(m[2]) }) : t;
}

export function leerPrevia(json: unknown): PreviaDocumentos | null {
  if (!esObjeto(json) || typeof json.emite !== "boolean") return null;
  const problema = texto(json.problema);
  if (!json.emite) return { documentos: { emite: false }, cliente: null, problema };
  const nuevo = esObjeto(json.nuevo) ? json.nuevo : null;
  const nota = esObjeto(json.nota) ? json.nota : null;
  const tipo = tipoCambio(nuevo?.tipo);
  const total = numero(nuevo?.total);
  const cuando = nota?.cuando === "ahora" || nota?.cuando === "despues" || nota?.cuando === "no" ? nota.cuando : null;
  const totalNota = numero(nota?.total);
  if (!nuevo || !nota || !tipo || total === null || !cuando || totalNota === null) return null;
  const tipoDoc = esTipoDocComprobante(nuevo.cliente_tipo_doc) ? nuevo.cliente_tipo_doc : "sin_documento";
  return {
    documentos: {
      emite: true,
      nuevo: { tipo, total: aCentimos(total) },
      nota: { cuando, total: aCentimos(totalNota), original: numeroLargo(nota.original), originalTipo: tipoCambio(nota.original_tipo) },
    },
    cliente: { tipoDoc, numDoc: texto(nuevo.cliente_num_doc), nombre: texto(nuevo.cliente_nombre), editable: nuevo.editable !== false && tipo !== "factura" },
    problema,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Cómo se dice (poco texto: el nombre del documento y una línea).
// ---------------------------------------------------------------------------------------------------------------------------------

const NOMBRE_NUEVO: Record<TipoDocumentoCambio, string> = { boleta: "Boleta nueva", factura: "Factura nueva", nota_venta: "Nota de venta nueva" };
const NOMBRE_TIPO: Record<TipoDocumentoCambio, string> = { boleta: "boleta", factura: "factura", nota_venta: "nota de venta" };

/**
 * Para el impacto del cambio (`ImpactoOperacion.documento`): el título nombra los documentos y el detalle dice SOLO lo que el título no
 * dice (poco texto, Felipe 2026-11-13): los montos, en el mismo orden del título, o cuándo sale la nota si espera a SUNAT.
 */
export function textoDelImpacto(d: DocumentosQueSalen): { titulo: string; detalle: string } {
  if (d.nota.cuando === "no") return { titulo: NOMBRE_NUEVO[d.nuevo.tipo], detalle: `Por ${soles(d.nuevo.total)}` };
  return {
    titulo: `Nota de crédito y ${NOMBRE_TIPO[d.nuevo.tipo]} nueva`,
    detalle: d.nota.cuando === "ahora" ? `${soles(d.nota.total)} y ${soles(d.nuevo.total)}` : `Nota: cuando SUNAT acepte ${d.nota.original ?? "la compra"}`,
  };
}

/** Una línea del bloque «Comprobantes» del paso «Revisa y confirma». */
export type LineaDocumento = { clave: "nota" | "nuevo"; titulo: string; detalle: string | null; monto: number; cuando: "ahora" | "despues" };

/** Los documentos que salen, nota primero (corrige lo de antes) y el nuevo después (lo que se lleva). */
export function lineasDeDocumentos(d: DocumentosQueSalen): LineaDocumento[] {
  const lineas: LineaDocumento[] = [];
  if (d.nota.cuando !== "no") {
    lineas.push({ clave: "nota", titulo: "Nota de crédito", detalle: d.nota.original ? `Sobre la ${d.nota.original}` : null, monto: d.nota.total, cuando: d.nota.cuando });
  }
  lineas.push({ clave: "nuevo", titulo: NOMBRE_NUEVO[d.nuevo.tipo], detalle: "Por todo lo que se lleva", monto: d.nuevo.total, cuando: "ahora" });
  return lineas;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// El cliente del comprobante nuevo (ADR-0671, decisión 6): el mismo del original y, en una boleta o una nota de venta, se puede cambiar
// (un regalo). Una factura va siempre al mismo RUC.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que la persona escribe: el documento de identidad (DNI por defecto), su número (vacío = sin documento) y el nombre. */
export type ClienteDelComprobante = { identidad: TipoDocumentoClienta; numero: string; nombre: string };

/** Una boleta de más de esto lleva el documento del cliente (Reglamento de Comprobantes de Pago, art. 8; la base lo exige). */
export const TOPE_BOLETA_SIN_DOCUMENTO = 700;

/** La regla del tope en una línea. Es a la vez el pie del número vacío y el error al confirmar: con el mismo texto, `CampoGuiado` esconde
 *  el pie cuando sale el error y la regla no se dice dos veces (poco texto, regla 4). */
export const TEXTO_BOLETA_PIDE_DOCUMENTO = `Más de S/\u00a0${TOPE_BOLETA_SIN_DOCUMENTO}: lleva documento.`;

/** El cliente con que arranca el comprobante nuevo: el del original. */
export function clienteInicial(original: Pick<DocumentoOriginal, "clienteTipoDoc" | "clienteNumDoc" | "clienteNombre"> | null | undefined): ClienteDelComprobante {
  const t = original?.clienteTipoDoc;
  const identidad: TipoDocumentoClienta = t === "carne_extranjeria" || t === "pasaporte" ? t : "dni";
  const conNumero = t && t !== "sin_documento" && t !== "ruc";
  return { identidad, numero: conNumero ? (original?.clienteNumDoc ?? "") : "", nombre: original?.clienteNombre ?? "" };
}

/** Como lo recibe la base (`p_cliente`): el tipo sale del número (sin número, «sin documento»), como en Vender. */
export function clienteParaBase(tipo: TipoDocumentoCambio, c: ClienteDelComprobante): { tipo_doc: TipoDocComprobante; num_doc: string | null; nombre: string | null } {
  const numeroLimpio = c.numero.trim();
  const tipoDoc = tipoDocDelComprobante(tipo, numeroLimpio, c.identidad);
  return { tipo_doc: tipoDoc, num_doc: tipoDoc === "sin_documento" ? null : numeroLimpio, nombre: c.nombre.trim() || null };
}

/** ¿La persona cambió el cliente? Solo entonces viaja `p_cliente` (y entra a la huella del envío): si no, la base usa el del original. */
export function clienteCambiado(tipo: TipoDocumentoCambio, c: ClienteDelComprobante | null | undefined, original: DocumentoOriginal | null | undefined): boolean {
  if (!c || tipo === "factura") return false;
  const ahora = clienteParaBase(tipo, c);
  const antes = clienteParaBase(tipo, clienteInicial(original));
  return ahora.tipo_doc !== antes.tipo_doc || ahora.num_doc !== antes.num_doc || ahora.nombre !== antes.nombre;
}

/**
 * Lo que impide emitir el comprobante nuevo a ese cliente, o null: espejo de `retail.fn_problema_cliente_del_cambio` para lo que se puede
 * corregir en la pantalla (el número mal escrito y la boleta de más de S/ 700 sin documento). Una nota de venta no va a SUNAT: nada.
 */
export function problemaClienteDelCambio(tipo: TipoDocumentoCambio, c: ClienteDelComprobante, total: number): string | null {
  if (tipo !== "boleta") return null;
  const numeroLimpio = c.numero.trim();
  if (numeroLimpio) return problemaDocumentoComprobante("boleta", c.identidad, numeroLimpio);
  if (aCentimos(total) > TOPE_BOLETA_SIN_DOCUMENTO) return TEXTO_BOLETA_PIDE_DOCUMENTO;
  return null;
}

/**
 * El cliente después de UN cambio de la persona. Recibe solo lo que cambió (`parche`) porque el control del documento cambia el tipo y el
 * número en el mismo evento: si cada uno copiara el cliente entero de la pantalla, el segundo pisaría al primero y el tipo volvería al
 * de antes (Carné o Pasaporte no se podían elegir).
 *
 * El nombre va con el documento: si el documento deja de ser el de la compra y el nombre sigue siendo el de la compra, se vacía (el padrón
 * trae el nuevo, o se escribe a mano; sin documento sale a «Cliente varios», como dice el pie). Si vuelve al documento de la compra con el
 * nombre vacío, recupera el de la compra. Un nombre que la persona escribió no se toca.
 */
export function conCambioDelCliente(
  tipo: TipoDocumentoCambio,
  actual: ClienteDelComprobante,
  parche: Partial<ClienteDelComprobante>,
  original: DocumentoOriginal | null | undefined,
): ClienteDelComprobante {
  const siguiente = { ...actual, ...parche };
  if (parche.nombre !== undefined) return siguiente;
  const documento = (c: ClienteDelComprobante) => {
    const b = clienteParaBase(tipo, c);
    return `${b.tipo_doc}:${b.num_doc ?? ""}`;
  };
  if (documento(siguiente) === documento(actual)) return siguiente;
  const inicial = clienteInicial(original);
  const nombreDeLaCompra = inicial.nombre.trim();
  if (!nombreDeLaCompra) return siguiente;
  if (documento(siguiente) === documento(inicial)) {
    // De vuelta al documento de la compra: su nombre, si no hay otro escrito. Una compra sin documento no tiene a quién devolvérselo.
    return inicial.numero.trim() && !siguiente.nombre.trim() ? { ...siguiente, nombre: inicial.nombre } : siguiente;
  }
  return siguiente.nombre.trim() === nombreDeLaCompra ? { ...siguiente, nombre: "" } : siguiente;
}

/** El nombre que ya se conoce para el DNI escrito (el del original): con él no se consulta el padrón por gusto. Otro número, null. */
export function nombreConocido(c: ClienteDelComprobante, original: DocumentoOriginal | null | undefined): string | null {
  if (!original || original.clienteTipoDoc !== "dni" || c.identidad !== "dni") return null;
  return c.numero.trim() === (original.clienteNumDoc ?? "") && original.clienteNombre ? original.clienteNombre : null;
}

/** A quién va el comprobante, en una línea: «Ana Pérez · DNI 45879632», «Cliente varios». */
export function clienteLegible(tipoDoc: TipoDocComprobante, numDoc: string | null, nombre: string | null): string {
  const doc = documentoLegibleComprobante(tipoDoc, numDoc);
  return [nombre?.trim() || null, doc].filter(Boolean).join(" · ") || "Cliente varios";
}

/** Los problemas de la base que no son del cliente sino del bloque entero (series de la tienda, el techo de las notas). Son los textos de
 *  `previsualizar_documentos_cambio`: la prueba los lee de la migración que la define, así que si la base los reescribe, la prueba falla. */
const PROBLEMA_DEL_BLOQUE = /^(Esta tienda no tiene serie|La tienda de la compra no tiene serie|Las notas de crédito de )/;

/** Dónde se dice un problema de `previsualizar_documentos_cambio`: bajo el cliente (si se puede corregir ahí) o en el bloque. */
export function campoDelProblema(problema: string, editable: boolean): "cliente" | "comprobantes" {
  return editable && !PROBLEMA_DEL_BLOQUE.test(problema) ? "cliente" : "comprobantes";
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que la pantalla recuerda de la base mientras se escribe el cliente. Cada tecla del cliente es una pregunta nueva; si la pantalla
// soltara la respuesta anterior mientras llega la siguiente, el chip y los avisos del bloque —que están ARRIBA del campo— entrarían y
// saldrían con cada pausa y empujarían el campo donde se escribe (ADR-0284 regla 7, ADR-0185).
// ---------------------------------------------------------------------------------------------------------------------------------

export type MemoriaPrevia = {
  /** La línea consultada sin el cliente (prenda, cantidad, total): otra línea, otra memoria. */
  linea: string;
  /** La consulta completa (con el cliente) que respondió la base por última vez. */
  consulta: string;
  previa: PreviaDocumentos;
  /** Lo último que dijo la base de la tienda (series, techo de las notas). La base no lo revisa mientras el cliente tiene un problema,
   *  así que un problema del cliente no lo borra. */
  problemaBloque: string | null;
};

const editableDeLaPrevia = (p: PreviaDocumentos) => p.documentos.emite && p.documentos.nuevo.tipo !== "factura" && (p.cliente?.editable ?? true);

/** Guarda una respuesta de la base. Sin respuesta (sin red, un error), queda la última de la misma línea. */
export function recordarPrevia(antes: MemoriaPrevia | null, llega: { linea: string; consulta: string; previa: PreviaDocumentos | null }): MemoriaPrevia | null {
  const misma = antes && antes.linea === llega.linea ? antes : null;
  if (!llega.previa) return misma;
  const problema = llega.previa.problema;
  const donde = problema ? campoDelProblema(problema, editableDeLaPrevia(llega.previa)) : null;
  return {
    linea: llega.linea,
    consulta: llega.consulta,
    previa: llega.previa,
    problemaBloque: donde === "comprobantes" ? problema : donde === "cliente" ? (misma?.problemaBloque ?? null) : null,
  };
}

/**
 * Lo que la pantalla usa para lo armado ahora: los documentos y el problema de la tienda, de la última respuesta de esta línea (no
 * dependen del cliente); el problema del cliente, solo si la respuesta es para el cliente escrito AHORA.
 */
export function leerMemoriaPrevia(
  m: MemoriaPrevia | null,
  linea: string | null,
  consulta: string | null,
): { previa: PreviaDocumentos | null; problemaBloque: string | null; problemaCliente: string | null } {
  const deLaLinea = m && linea !== null && m.linea === linea ? m : null;
  if (!deLaLinea) return { previa: null, problemaBloque: null, problemaCliente: null };
  const problema = deLaLinea.consulta === consulta ? deLaLinea.previa.problema : null;
  return {
    previa: deLaLinea.previa,
    problemaBloque: deLaLinea.problemaBloque,
    problemaCliente: problema && campoDelProblema(problema, editableDeLaPrevia(deLaLinea.previa)) === "cliente" ? problema : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// El ticket del cambio: los documentos REALES (leídos por `cambio_id`), nunca los que calculó la pantalla.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Un comprobante de un cambio, como se lee de la base. */
export type DocumentoEmitido = {
  id: string;
  tipo: string;
  serie: string;
  numero: number;
  total: number;
  estado: string;
};

export type TonoDocumento = "verde" | "ambar" | "rojo" | "apagado" | "pizarra";

const ESTADO_DEL_DOCUMENTO: Record<string, { texto: string; tono: TonoDocumento }> = {
  aceptado: { texto: "Aceptada", tono: "verde" },
  enviado: { texto: "Enviada", tono: "ambar" },
  pendiente: { texto: "Por enviar", tono: "ambar" },
  pendiente_reintento: { texto: "En cola", tono: "ambar" },
  rechazado: { texto: "Rechazada", tono: "rojo" },
  anulado: { texto: "Anulada", tono: "apagado" },
  no_emitido: { texto: "No emitida", tono: "apagado" },
  interna: { texto: "Interna", tono: "pizarra" },
};

/** El estado de un documento ante SUNAT, para su `<Chip>` (todos son femeninos: boleta, factura, nota). */
export function estadoDelDocumento(estado: string): { texto: string; tono: TonoDocumento } {
  return ESTADO_DEL_DOCUMENTO[estado] ?? { texto: estado, tono: "pizarra" };
}

/** Una fila del ticket: lo que salió de verdad (o la nota que todavía espera a SUNAT). */
export type FilaTicketDocumento = { clave: string; titulo: string; numero: string | null; monto: number; chip: { texto: string; tono: TonoDocumento } };

const NOMBRE_EMITIDO: Record<string, string> = { boleta: "Boleta", factura: "Factura", nota_venta: "Nota de venta", nota_credito: "Nota de crédito" };

/**
 * Las filas del ticket: la nota primero y el nuevo después, con su número y su estado reales. Si salió el nuevo, se esperaba una nota y
 * todavía no existe (su original no está aceptado), se dice «Por emitir», con lo que va a valer. Si no salió nada (la base no emitió:
 * una venta de prueba), no se promete ninguna.
 */
export function filasDelTicket(emitidos: readonly DocumentoEmitido[], esperado: DocumentosDelCambio | null): FilaTicketDocumento[] {
  const filas: FilaTicketDocumento[] = emitidos
    .slice()
    .sort((a, b) => Number(b.tipo === "nota_credito") - Number(a.tipo === "nota_credito"))
    .map((d) => ({ clave: d.id, titulo: NOMBRE_EMITIDO[d.tipo] ?? d.tipo, numero: numeroDeDocumento(d), monto: aCentimos(d.total), chip: estadoDelDocumento(d.estado) }));
  const hayNota = emitidos.some((d) => d.tipo === "nota_credito");
  if (!hayNota && comprobanteNuevo(emitidos) && esperado?.emite && esperado.nota.cuando !== "no") {
    filas.unshift({ clave: "nota-por-emitir", titulo: "Nota de crédito", numero: null, monto: esperado.nota.total, chip: { texto: "Por emitir", tono: "ambar" } });
  }
  return filas;
}

/** El comprobante nuevo del cambio entre lo emitido (boleta, factura o nota de venta), o null. */
export function comprobanteNuevo<T extends Pick<DocumentoEmitido, "tipo">>(emitidos: readonly T[]): T | null {
  return emitidos.find((d) => ES_TIPO_CAMBIO.has(d.tipo)) ?? null;
}

/** Cómo se nombran los documentos en el mensaje de WhatsApp: «Boleta B005-000301», «Nota de crédito BC05-000012». */
export function documentosParaMensaje(emitidos: readonly DocumentoEmitido[]): string[] {
  return emitidos
    .slice()
    .sort((a, b) => Number(a.tipo === "nota_credito") - Number(b.tipo === "nota_credito"))
    .map((d) => `${NOMBRE_EMITIDO[d.tipo] ?? d.tipo} ${numeroDeDocumento(d)}`);
}

/** Qué respalda, en el papel del comprobante nuevo, el valor de lo devuelto: la nota de crédito si ya salió; si espera, la compra. */
export function textoCreditoDelRecibo(emitidos: readonly DocumentoEmitido[], esperado: DocumentosDelCambio | null): string {
  const nota = emitidos.find((d) => d.tipo === "nota_credito");
  if (nota) return `Nota de crédito ${numeroDeDocumento(nota)}`;
  const original = esperado?.emite ? esperado.nota.original : null;
  if (esperado?.emite && esperado.nota.cuando !== "no") return `Nota de crédito de ${original ?? "la compra"}`;
  return original ? `Prenda devuelta (${original})` : "Prenda devuelta";
}

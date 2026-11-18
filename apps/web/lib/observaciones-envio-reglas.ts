// Observaciones al contar un envío (ADR-0507): lo que la persona vio al abrir la caja —una prenda rota, una que faltó…— con su mensaje.
// Lógica pura: la hoja solo la llama. La lista de tipos es la misma que el CHECK de `despacho_observaciones` (una prueba las cruza).

export const RPC_REGISTRAR_OBSERVACION = "registrar_observacion_envio";
export const RPC_OBSERVACIONES_ENVIO = "fn_envio_observaciones";
export const MAX_MENSAJE_OBSERVACION = 300;

export type TipoObservacion = "prenda_rota" | "prenda_faltante" | "prenda_manchada" | "prenda_distinta" | "prenda_de_mas" | "empaque_danado" | "otro";

/** Los tipos, de lo más común a lo menos. `mensajeSugerido` es el ejemplo gris del campo: sigue al tipo elegido (ADR-0290). */
export const TIPOS_OBSERVACION: readonly { valor: TipoObservacion; nombre: string; ayuda: string; ejemplo: string }[] = [
  { valor: "prenda_rota", nombre: "Prenda rota o dañada", ayuda: "Llegó rota, descosida o con un daño", ejemplo: "Ej. 2 con la costura abierta en la manga" },
  { valor: "prenda_faltante", nombre: "Prenda faltante", ayuda: "Faltan prendas de las que dijeron", ejemplo: "Ej. Dijeron 15 y solo hay 13 en la caja" },
  { valor: "prenda_manchada", nombre: "Prenda manchada", ayuda: "Llegó sucia o con manchas", ejemplo: "Ej. 1 con mancha de grasa en el frente" },
  { valor: "prenda_distinta", nombre: "Distinta a lo pedido", ayuda: "Otro modelo, talla o color", ejemplo: "Ej. Llegaron en negro y se pidieron en beige" },
  { valor: "prenda_de_mas", nombre: "Llegó de más", ayuda: "Hay más prendas de las que dijeron", ejemplo: "Ej. 3 prendas más que no estaban en la guía" },
  { valor: "empaque_danado", nombre: "Bulto o empaque dañado", ayuda: "La caja o la bolsa llegó abierta o mojada", ejemplo: "Ej. La caja llegó mojada en una esquina" },
  { valor: "otro", nombre: "Otra cosa", ayuda: "Algo que no está en la lista", ejemplo: "Cuéntalo con tus palabras" },
];

const NOMBRES = new Map(TIPOS_OBSERVACION.map((t) => [t.valor, t.nombre] as const));
export const nombreDeTipo = (tipo: string): string => NOMBRES.get(tipo as TipoObservacion) ?? "Observación";
export const ejemploDeTipo = (tipo: TipoObservacion | null): string => TIPOS_OBSERVACION.find((t) => t.valor === tipo)?.ejemplo ?? "Elige qué pasó y cuéntalo en una línea";

/** Lo que falta para poder guardar, en palabras de tienda; `null` si ya se puede. */
export function problemaDeObservacion(tipo: TipoObservacion | null, mensaje: string): string | null {
  if (!tipo) return "Elige qué pasó.";
  if (mensaje.trim() === "") return "Escribe qué viste.";
  if (mensaje.trim().length > MAX_MENSAJE_OBSERVACION) return `El mensaje es muy largo: hasta ${MAX_MENSAJE_OBSERVACION} letras.`;
  return null;
}

export type ObservacionDeEnvio = {
  id: string;
  /** La línea del envío; `null` si es del envío entero. */
  despachoItemId: string | null;
  tipo: TipoObservacion;
  mensaje: string;
  creadoPor: string | null;
  creadoEn: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const esTipo = (v: unknown): v is TipoObservacion => typeof v === "string" && NOMBRES.has(v as TipoObservacion);

/** Una observación como la devuelve la base; `null` si le falta lo esencial (se descarta, no tumba la pantalla). */
export function leerObservacion(data: unknown): ObservacionDeEnvio | null {
  const r = objeto(data);
  const id = r ? texto(r.id) : null;
  const mensaje = r ? texto(r.mensaje) : null;
  if (!r || !id || !mensaje || !esTipo(r.tipo)) return null;
  const por = objeto(r.creado_por);
  return { id, despachoItemId: texto(r.despacho_item_id), tipo: r.tipo, mensaje, creadoPor: por ? texto(por.nombre) : null, creadoEn: texto(r.creado_en) };
}

/** Lee `fn_envio_observaciones`. Sin la base al día (o envío que no existe) devuelve una lista vacía: la pantalla funciona igual. */
export function leerObservaciones(data: unknown): ObservacionDeEnvio[] {
  const r = objeto(Array.isArray(data) ? data[0] : data);
  const lista = r && Array.isArray(r.observaciones) ? r.observaciones : [];
  return lista.map(leerObservacion).filter((o): o is ObservacionDeEnvio => o !== null);
}

/** Las de unas líneas (con `null`, las del envío entero), de la más vieja a la más nueva: una categoría junta las de todas sus líneas. */
export const deLasLineas = (todas: readonly ObservacionDeEnvio[], despachoItemIds: readonly (string | null)[]): ObservacionDeEnvio[] =>
  todas.filter((o) => despachoItemIds.includes(o.despachoItemId));

/**
 * Tickets compartidos (ADR-0701, ADR-0511 paso 2): la asesora arma el ticket en su celular, en el piso, y lo manda a la caja de su sede;
 * la caja lo abre y lo cobra. Este archivo es la parte pura: cómo se lee una fila de la base y qué se le dice a la persona cuando algo
 * falla. Las llamadas viven en `lib/tickets-compartidos.ts`.
 *
 * Por qué una foto y no un ticket «vivo» entre equipos: el ticket que se manda deja de existir en el celular y pasa a la caja entero.
 * Nadie edita el mismo ticket desde dos equipos a la vez, así que no hay dos versiones que reconciliar (ADR-0701, «DESCARTÉ»).
 */

/** Un ticket que espera en la caja, tal como lo lista la base (sin su contenido: la caja pregunta seguido y la lista es liviana). */
export type TicketCompartido = {
  id: string;
  nombre: string;
  prendas: number;
  total: number;
  /** Nombre de quien lo mandó desde el piso. */
  enviadoPor: string;
  /** ISO. */
  enviadoEn: string;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Una fila de la base, o `null` si viene rota (no se dibuja una fila con cifras inventadas). */
export function leerTicketCompartido(v: unknown): TicketCompartido | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = texto(o.id);
  const nombre = texto(o.nombre);
  const prendas = numero(o.prendas);
  const total = numero(o.total);
  const enviadoEn = texto(o.enviado_en);
  if (!id || !nombre || prendas === null || total === null || !enviadoEn) return null;
  return { id, nombre, prendas, total, enviadoPor: texto(o.enviado_por) ?? "Alguien del equipo", enviadoEn };
}

type ErrorDeLaBase = { message?: string | null; hint?: string | null; code?: string | null } | null | undefined;

/** Las marcas de error de las cuatro funciones de la base (`20261124172000_tickets_compartidos.sql`): su texto ya está escrito para la
 *  persona y se muestra tal cual. Las demás (la red, un 500) no: se dice qué pasó con el ticket, que es lo que importa en la caja. */
const CON_SU_TEXTO = new Set([
  "ticket_sin_modulo",
  "ticket_otra_sede",
  "ticket_sin_tienda",
  "ticket_vacio",
  "ticket_muy_grande",
  "ticket_linea_invalida",
  "ticket_tope",
  "ticket_ya_tomado",
  "ticket_descartado",
  "ticket_no_existe",
]);

/**
 * Qué se le dice a la persona cuando una acción con un ticket compartido falla. `queSePierde` es lo que pasa con el ticket en ESE
 * equipo: al mandar, «el ticket sigue aquí» (nunca se pierde por la red); al abrir, «sigue en la caja».
 */
export function mensajeDeTicketCompartido(error: ErrorDeLaBase, accion: "mandar" | "abrir" | "descartar"): { titulo: string; detalle?: string } {
  const hint = error?.hint ?? null;
  if (hint === "ticket_sin_responsable") {
    return { titulo: "Elige quién está atendiendo", detalle: accion === "mandar" ? "Y vuelve a mandarlo a la caja: el ticket sigue aquí." : undefined };
  }
  if (hint && CON_SU_TEXTO.has(hint) && error?.message) return { titulo: error.message };
  if (accion === "mandar") return { titulo: "No se pudo mandar a la caja", detalle: "El ticket sigue aquí. Revisa la conexión y vuelve a intentarlo." };
  if (accion === "abrir") return { titulo: "No se pudo abrir el ticket", detalle: "Sigue esperando en la caja. Vuelve a intentarlo." };
  return { titulo: "No se pudo descartar el ticket", detalle: "Sigue esperando en la caja." };
}

/** Lo que devuelve la base al abrir un ticket: la fila y el ticket entero, tal como lo guardó el celular. */
export type TicketCompartidoAbierto = TicketCompartido & { contenido: unknown };

/** Lo que la base devolvió al abrir un ticket, o `null` si no trae su contenido. */
export function leerTicketAbierto(v: unknown): TicketCompartidoAbierto | null {
  const fila = leerTicketCompartido(v);
  const contenido = v && typeof v === "object" ? (v as Record<string, unknown>).contenido : undefined;
  return fila && contenido && typeof contenido === "object" ? { ...fila, contenido } : null;
}

/** La lista de la base, sin las filas rotas. */
export function leerTicketsCompartidos(v: unknown): TicketCompartido[] {
  return Array.isArray(v) ? v.map(leerTicketCompartido).filter((t): t is TicketCompartido => t !== null) : [];
}

/** Hasta dónde llega el nombre de una pestaña (`NOMBRE_ESPERA_MAX` de `vender-hoy-reglas.ts`). */
const NOMBRE_MAX = 30;

/** Cómo se llama en la caja el ticket que llegó del piso: «Ana · Cliente 1». En la caja hay varios «Cliente 1» (uno por celular); el
 *  nombre de la asesora es lo que la cajera reconoce, porque la asesora llega con su cliente. */
export function nombreDelTicketDelPiso(t: Pick<TicketCompartido, "enviadoPor" | "nombre">): string {
  const primero = t.enviadoPor.trim().split(/\s+/)[0] ?? "";
  return (primero ? `${primero} · ${t.nombre}` : t.nombre).slice(0, NOMBRE_MAX);
}

/**
 * El ticket abierto, como uno más de los tickets de este equipo (la misma forma que «Dejar en espera» guarda en el navegador). Desde ahí lo
 * retoma `retomar()` de Vender, que pone los precios al día y lee al cliente y lo del cobro con tolerancia. `null` si el contenido no trae
 * prendas: no se abre un ticket vacío.
 */
export function ticketDelPisoParaLaEspera(t: TicketCompartidoAbierto): {
  id: string;
  creadoEn: string;
  carrito: unknown[];
  nota: string;
  nombre: string;
  clienta: unknown;
  cobro: unknown;
} | null {
  const c = t.contenido as Record<string, unknown>;
  if (!Array.isArray(c.carrito) || c.carrito.length === 0) return null;
  return {
    id: t.id,
    creadoEn: t.enviadoEn,
    carrito: c.carrito,
    nota: typeof c.nota === "string" ? c.nota : "",
    nombre: nombreDelTicketDelPiso(t),
    clienta: c.clienta ?? null,
    cobro: c.cobro,
  };
}

// Las tallas del «Agregar» rápido de la tarjeta (`RapidoDeTarjeta`), como llegan de `GET /api/tallas`. Lógica pura, con su prueba al lado,
// y sin zod (la usa la tarjeta, en el navegador).

/** Una talla del «Agregar» rápido: su nombre y su prenda, o null si no hay en la tienda elegida. El mismo de `lib/ficha.ts`. */
export type TallaRapida = { talla: string; varianteId: string | null };
export type Rapido = { sedeId: string | null; tallas: TallaRapida[] };

export type RespuestaRapido = { estado: "ok"; rapido: Rapido } | { estado: "sin_sesion" | "no_esta" | "sin_respuesta" };

const esTalla = (t: unknown): t is TallaRapida =>
  typeof t === "object" && t !== null && typeof (t as TallaRapida).talla === "string" && ((t as TallaRapida).varianteId === null || typeof (t as TallaRapida).varianteId === "string");

/** Lo que respondió `/api/tallas`, leído con cuidado: si no tiene la forma de unas tallas, es «sin respuesta» (la tarjeta sigue llevando
 *  a la ficha y el próximo paso del mouse vuelve a preguntar). */
export function leerRespuestaRapido(dato: unknown): RespuestaRapido {
  if (typeof dato !== "object" || dato === null) return { estado: "sin_respuesta" };
  const r = dato as { estado?: unknown; rapido?: { sedeId?: unknown; tallas?: unknown } };
  if (r.estado === "ok" && r.rapido && (r.rapido.sedeId === null || typeof r.rapido.sedeId === "string") && Array.isArray(r.rapido.tallas) && r.rapido.tallas.every(esTalla)) {
    return { estado: "ok", rapido: { sedeId: r.rapido.sedeId, tallas: r.rapido.tallas } };
  }
  if (r.estado === "sin_sesion" || r.estado === "no_esta") return { estado: r.estado };
  return { estado: "sin_respuesta" };
}

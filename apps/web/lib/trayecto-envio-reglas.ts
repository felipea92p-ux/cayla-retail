// El Trayecto de un envío (rediseño «B» de Recibir, Felipe 2026-10-29): en qué parada del camino está —salió, en camino, contando, por
// terminar, recibido— en vez de un chip de estado. Aquí solo se decide la parada y lo que dice; el estado lo sigue mandando la base.

export const ETAPAS_ENVIO = ["Salió", "En camino", "Contando", "Por terminar", "Recibido"] as const;

export type EtapaDelEnvio = {
  /** De 0 (salió) a 4 (recibido). */
  indice: number;
  nombre: (typeof ETAPAS_ENVIO)[number];
  /** «1 de 2», «3 pendientes»; `null` si no hay nada que agregar. */
  detalle: string | null;
  /** El color del camino: pizarra mientras viaja, ámbar mientras la sede trabaja, verde al terminar. */
  tono: "viaja" | "trabaja" | "listo";
  /** Cuánto lleva la parada actual, de 0 a 100 (el anillo de la bola): lo contado mientras se cuenta. */
  avance: number;
};

/**
 * La parada de un envío por su estado. Abierto con lo que dijeron y lo contado dice «1 de 2» y llena su anillo; cerrado con pendientes queda
 * «Por terminar» hasta que se resuelvan. Un envío anulado no tiene camino: `null` (la pantalla sigue con su chip).
 */
export function etapaDelEnvio(estado: string, datos: { pendientes?: number; contadas?: number; dijeron?: number | null } = {}): EtapaDelEnvio | null {
  const etapa = (indice: number, tono: EtapaDelEnvio["tono"], detalle: string | null, avance = 100): EtapaDelEnvio => ({ indice, nombre: ETAPAS_ENVIO[indice], detalle, tono, avance });
  if (estado === "en_camino") return etapa(1, "viaja", null);
  if (estado === "abierto") {
    const { contadas, dijeron } = datos;
    if (contadas == null) return etapa(2, "trabaja", null);
    if (dijeron == null || dijeron <= 0) return etapa(2, "trabaja", `${contadas} ${contadas === 1 ? "contada" : "contadas"}`);
    return etapa(2, "trabaja", `${contadas} de ${dijeron}`, Math.min(100, Math.round((contadas / dijeron) * 100)));
  }
  if (estado === "cerrado") {
    const p = datos.pendientes ?? 0;
    return p > 0 ? etapa(3, "trabaja", `${p} ${p === 1 ? "pendiente" : "pendientes"}`) : etapa(4, "listo", null);
  }
  return null;
}

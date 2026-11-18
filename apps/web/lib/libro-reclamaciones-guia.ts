// La guía de foco de la hoja del Libro de Reclamaciones (Tienda web ▸ Libro de Reclamaciones; ADR-0284, ADR-0679). No agrega reglas: cada
// «falta» es lo que `responder_hoja_reclamacion` rechazaría (o lo que apaga el botón): sale de `problemaDeLaRespuesta`, y la prueba lo
// compara con ella.

import type { CampoDeGuia } from "./guia-campos";
import { letras, problemaDeLaRespuesta, type HojaLibro } from "./libro-reclamaciones-reglas";

/** La respuesta (solo si la hoja todavía no la tiene) y quién la firma. Escrita de más también falta: la luz se queda hasta que quepa. */
export function camposRespuesta(h: {
  hoja: Pick<HojaLibro, "respuesta">;
  respuesta: string;
  responsableListo: boolean;
  responsableMotivo: string | null;
}): CampoDeGuia[] {
  if (h.hoja.respuesta) return [];
  const falta = problemaDeLaRespuesta(h.respuesta);
  return [
    { id: "respuesta", nombre: "La respuesta", requerido: true, hecho: letras(h.respuesta) > 0 && falta === null, pendiente: falta ?? "" },
    { id: "responsable", nombre: "Quién responde", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién responde." },
  ];
}

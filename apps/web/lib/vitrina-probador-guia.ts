// La guía de foco de las hojas de Vitrina web ▸ Probador (ADR-0284, ADR-0434 actividad 1). No agrega reglas: «falta» es exactamente lo
// que `registrar_recorte` y `revisar_recorte` rechazarían, y lo único que se elige es quién lo hace. Lo demás lo hace el recortador.

import type { CampoDeGuia } from "./guia-campos";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

/** «Preparar recortes» y «Revisar recortes»: solo quién lo hace. */
export function camposDeRecortes(h: Responsable): CampoDeGuia[] {
  return [
    {
      id: "responsable",
      nombre: "Quién lo hace",
      requerido: true,
      hecho: h.responsableListo,
      pendiente: h.responsableMotivo ?? "Elige quién prepara los recortes.",
    },
  ];
}

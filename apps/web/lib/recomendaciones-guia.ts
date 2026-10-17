// La guía de foco de la hoja de una recomendación (Tienda web ▸ Recomendaciones; ADR-0284, ADR-0408). No agrega reglas: cada «falta»
// es lo que `responder_recomendacion`, `marcar_recomendacion_leida` y `archivar_recomendacion` rechazarían (o lo que apaga el botón):
// sale de `problemaParaConfirmar`, y la prueba lo compara con ella en todas las combinaciones.

import type { CampoDeGuia } from "./guia-campos";
import { letras, problemaParaConfirmar, sePuedeResponder, type Recomendacion } from "./recomendaciones-reglas";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

/**
 * La respuesta (solo si todavía se puede responder) y quién lo hace. Sin leer, la respuesta es OPCIONAL: sin ella, el botón la marca
 * como leída. Ya leída, responder es lo único que queda por hacer en la bandeja (o archivarla): la respuesta pasa a faltar. Escrita de
 * más (pasa las 400 letras) también falta, así la luz se queda en ella hasta que quepa. Una respondida, archivada o sin nombre solo
 * pide quién lo hace (archivarla o sacarla del archivo).
 */
export function camposRecomendacion(
  h: { recomendacion: Pick<Recomendacion, "leidaEn" | "respuesta" | "archivadaEn" | "cliente">; respuesta: string } & Responsable,
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (sePuedeResponder(h.recomendacion)) {
    const falta = problemaParaConfirmar(h.recomendacion, h.respuesta);
    campos.push({
      id: "respuesta",
      nombre: "Tu respuesta",
      requerido: falta !== null,
      hecho: letras(h.respuesta) > 0 && falta === null,
      pendiente: falta ?? "",
    });
  }
  campos.push({
    id: "responsable",
    nombre: "Quién lo hace",
    requerido: true,
    hecho: h.responsableListo,
    pendiente: h.responsableMotivo ?? "Elige quién lo hace.",
  });
  return campos;
}

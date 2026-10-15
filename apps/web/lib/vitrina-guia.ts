// La guía de foco de las hojas de Catálogo ▸ Vitrina web (ADR-0284, ADR-0408). No agrega reglas: lo único que la base exige de quien
// guarda (`vitrina_guardar_modelo`, `vitrina_mostrar`) es quién lo hace; si se ve, «Lo nuevo» y lo que se muestra ya vienen elegidos,
// y la descripción para la web es opcional (sin ella sale la del catálogo). No hay precio que llenar: es el de cada tienda.

import type { CampoDeGuia } from "./guia-campos";

type Responsable = { responsableListo: boolean; responsableMotivo: string | null };

const responsable = (h: Responsable): CampoDeGuia => ({
  id: "responsable",
  nombre: "Quién lo cambia",
  requerido: true,
  hecho: h.responsableListo,
  pendiente: h.responsableMotivo ?? "Elige quién hace el cambio.",
});

/** La hoja de un modelo: la descripción para la web (opcional) y quién lo cambia. */
export function camposDeModelo(h: { descripcion: string } & Responsable): CampoDeGuia[] {
  return [
    { id: "descripcion", nombre: "Descripción para la web", requerido: false, hecho: h.descripcion.trim() !== "", pendiente: "" },
    responsable(h),
  ];
}

/** Mostrar u ocultar uno o varios: solo quién lo cambia (lo demás ya está elegido en la lista). */
export function camposDeLoteMostrar(h: Responsable): CampoDeGuia[] {
  return [responsable(h)];
}

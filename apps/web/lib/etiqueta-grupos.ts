// Los cuatro grupos en que se ordenan las etiquetas, y en qué orden: los mismos en Catálogo ▸ Atributos ▸ Etiquetas y en el
// campo «Etiquetas» de Nuevo producto. Una sola fuente: si un día se agrega un grupo, cambia acá y las dos pantallas lo siguen.
// El color del punto sale de la paleta (nunca rojo: es el acento de la marca, máx. 2 por pantalla).

export type EstiloEtiqueta = "neutral" | "urgencia" | "positivo" | "campana";

export const GRUPOS_ETIQUETA: Record<EstiloEtiqueta, { grupo: string; dot: string }> = {
  urgencia: { grupo: "Rotación", dot: "bg-ambar" },
  positivo: { grupo: "Artesanal", dot: "bg-verde" },
  campana: { grupo: "Campaña y festividad", dot: "bg-taupe-profundo" },
  neutral: { grupo: "General", dot: "bg-tinta/25" },
};

export const ORDEN_GRUPOS_ETIQUETA: readonly EstiloEtiqueta[] = ["urgencia", "positivo", "campana", "neutral"];

/** Un estilo que la base no conoce (o que llegó vacío) se trata como «General»: nunca deja una etiqueta sin grupo. */
export function estiloConocido(estilo: string): EstiloEtiqueta {
  return (ORDEN_GRUPOS_ETIQUETA as readonly string[]).includes(estilo) ? (estilo as EstiloEtiqueta) : "neutral";
}

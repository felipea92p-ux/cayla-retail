// La historia del permiso de una clienta (CL-26, ADR-0288 «Actualización 2026-09-30 (f)»), como la muestra el spike del club
// (`modalFicha`, «Historia de los permisos»): cada paso con qué fue, cuándo, cómo, en qué tienda, quién lo registró y la
// versión del texto que ella oyó o aceptó. La fila sale de `fn_clienta_permisos` (de solo agregar: no se edita). Aquí, sin
// React ni red, solo las palabras.
//
// CONTRATO
//   PROMETE: toda combinación de finalidad, acción y medio tiene un título (un medio que la web no conoce se dice tal cual,
//            nunca se esconde el evento); el punto del evento: club en taupe, publicidad que llega en verde, que se va en ámbar.
//   ASUME:   los medios de `club_permisos_medio_valido` (tanda 1b, más `qr_web` del camino B y `pagina_cartel` de la 1g).
//   NO HACE: no ordena (la base ya la trae de la más vieja a la más nueva).

export type FilaPermiso = {
  id: string;
  finalidad: string;
  accion: string;
  medio: string;
  texto_tipo: string | null;
  texto_version: number | null;
  sede: string | null;
  registrado_por: string | null;
  nota: string | null;
  created_at: string;
  de_otra_ficha: boolean;
};

/** Cómo se dio o se quitó, en palabras (spike: `MEDIO_TXT`). */
export const MEDIO_LEGIBLE: Readonly<Record<string, string>> = {
  caja_palabra: "de palabra, en caja",
  ficha: "desde la ficha",
  qr_web: "desde la página de su QR",
  // Tanda 1g (G-1, G-10): ella se unió sola, escaneando el cartel de la tienda (sin quién registró: lo hizo ella).
  pagina_cartel: "se registró por su cuenta desde el cartel",
  whatsapp_propio: "escribió por su cuenta a la tienda",
  baja_whatsapp: "escribió BAJA",
  cambio_celular: "cambió su celular",
  anonimizar: "se borraron sus datos",
  legado: "marcado en caja antes del club",
};

export type PuntoEvento = "taupe" | "verde" | "ambar";

export type EventoLegible = { id: string; titulo: string; detalle: string; punto: PuntoEvento; deOtraFicha: boolean };

function titulo(f: Pick<FilaPermiso, "finalidad" | "accion" | "medio">): string {
  if (f.finalidad === "club") return f.accion === "otorga" ? "Se unió al club" : "Salió del club";
  if (f.accion === "otorga") return "Pidió la publicidad por WhatsApp";
  if (f.medio === "baja_whatsapp") return "Pidió BAJA de la publicidad";
  if (f.medio === "cambio_celular") return "Dejó la publicidad al cambiar de celular";
  return "Dejó la publicidad";
}

/** Una línea del evento: «Se unió al club» y debajo «12 oct. 2026 · de palabra, en caja · Tienda Lima · Micaela R. · texto v2». */
export function eventoLegible(f: FilaPermiso, fecha: (iso: string) => string): EventoLegible {
  const texto = f.texto_version !== null ? `texto v${f.texto_version}` : null;
  const detalle = [fecha(f.created_at), MEDIO_LEGIBLE[f.medio] ?? f.medio, f.sede, f.registrado_por, texto, f.de_otra_ficha ? "de una ficha que se unió a esta" : null]
    .filter(Boolean)
    .join(" · ");
  return {
    id: f.id,
    titulo: titulo(f),
    detalle,
    punto: f.finalidad === "club" ? "taupe" : f.accion === "otorga" ? "verde" : "ambar",
    deOtraFicha: f.de_otra_ficha,
  };
}

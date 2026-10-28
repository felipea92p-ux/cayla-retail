import type { MotivoAjuste } from "./ajuste-reglas";

// La caja de nota de «Ajustar inventario» sigue el motivo elegido (skill `/sugerir`, CLAUDE.md «Sugerencias coherentes»,
// ADR-0290). Antes decía siempre «Detalle libre del ajuste»; desde ADR-0328 (actividad 4) «Encontré prendas» EXIGE la nota
// (dónde estaban o por qué aparecieron), y una caja obligatoria sin un ejemplo de lo que se espera hace dudar a quien la llena.
// El ejemplo enseña la FORMA de la respuesta para ESE motivo; no es un dato real que copiar.
//
// Fuente, en este orden: el motivo elegido; sin motivo, una instrucción neutra. Función pura y determinista (sin azar ni red).

export type NotaAjuste = { etiqueta: string; placeholder: string; obligatoria: boolean };

const NEUTRA: NotaAjuste = { etiqueta: "Observación (opcional)", placeholder: "Detalle libre del ajuste", obligatoria: false };

/** Por motivo. Cabe en la caja a 375 px (≤ 40 caracteres el placeholder). */
const POR_MOTIVO: Readonly<Record<MotivoAjuste, NotaAjuste>> = {
  reposicion: { etiqueta: "¿Dónde las encontraste?", placeholder: "Ej.: en una caja del almacén", obligatoria: true },
  merma: { etiqueta: "¿Qué pasó? (opcional)", placeholder: "Ej.: se manchó en el probador", obligatoria: false },
  conteo_fisico: { etiqueta: "Observación (opcional)", placeholder: "Ej.: conté el almacén al cerrar", obligatoria: false },
  otro: { etiqueta: "¿Qué pasó? (opcional)", placeholder: "Cuenta en una línea qué pasó", obligatoria: false },
};

export function sugerirNotaAjuste(motivo: MotivoAjuste | ""): NotaAjuste {
  return motivo === "" ? NEUTRA : POR_MOTIVO[motivo];
}

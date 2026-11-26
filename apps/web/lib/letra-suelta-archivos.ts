// Los archivos que todavía escriben la letra a mano (`text-[11px]`, `font-size: 11px`, `fontSize: 11`) en vez de pedirla a la escala, y
// cuántas veces (ADR-0691; Felipe 2026-11-19: «hay cosas con fuente demasiado pequeña y son imposibles de leer»). Lo lee
// `lib/letra-suelta.test.ts`, que falla si aparece letra suelta en un archivo que no está aquí o si un archivo de la lista tiene MÁS.
//
// La escala vive en el `@theme` de `app/globals.css`: 13 `text-xs` · 14 `text-detalle` · 16 `text-sm` · 18 `text-lg` · 21 `text-xl`
// (en una hoja de estilos, `var(--text-xs)`…). Dos clases de entrada:
//
//   · PERMANENTE (`LETRA_FIJA`, con su motivo): el archivo entero no es letra de la interfaz (papel que se imprime, un dibujo). Una sola
//     línea legítima no viene aquí: lleva `letra-fija: <por qué>` en un comentario de la misma línea.
//   · DEUDA (`LETRA_A_MANO`, con su cuenta): se pasa a la escala al migrar su módulo. Solo baja. La reescribe
//     `pnpm --filter web tema:letra:registro`; un archivo nuevo no puede nacer aquí.
//
// Mientras se migra, `app/estilos/letra.css` (el puente) lleva cada `text-[Npx]` a su escalón en pantalla, así que la letra chica ya no
// se ve chica aunque el archivo siga en esta lista.

/** Archivos enteros que no son letra de la interfaz, con su motivo. */
export const LETRA_FIJA: Record<string, string> = {
  // ---------- Permanentes ----------
  "components/campanas-web/PreviewCampana.tsx": "La vista previa de la tienda web en miniatura: su letra es la de la tienda (ADR-0616), a escala de la miniatura",
};

/** Cuántas veces escribe la letra a mano cada archivo. Solo baja. */
export const LETRA_A_MANO: Record<string, number> = {
  // ---------- Deuda: se pasa a la escala módulo por módulo ----------
  "app/estilos/graficos-tiempo.css": 11,
  "app/estilos/recordatorio-cierre.css": 14,
};

/** La deuda que queda: la suma de `LETRA_A_MANO`. Solo baja. Si SUBE, alguien declaró deuda nueva: no se puede. */
export const DEUDA_LETRA_HOY = 25;

// La foto de un modelo nuevo mientras se cuenta (Recibir ▸ Contar, ADR-0699; Felipe 2026-11-24: «que cuando detecte que se subió una foto salga
// cargándose… que haya la opción de quitar el fondo… y de quitar la foto o mantenerla»).
//
// CONTRATO
//   PROMETE: qué se ve en la miniatura (la foto tal cual o la sin fondo), qué franja dice que algo está en camino, cuándo toca pedir la versión
//            sin fondo y qué pasa a «Crear la prenda». Sin red, sin azar: lo mismo entra, lo mismo sale.
//   ASUME:   que «sin fondo» es la foto de catálogo con IA de siempre (`/api/fotos/catalogo`, ADR-0659): se paga por pedido, así que se pide
//            una vez por foto y se guarda, y apagar el interruptor solo vuelve a mostrar la original.
//   NO HACE: no decide si la cuenta puede usar la IA (lo dice `leerPermisoDeFotos`) ni sube nada: la foto vive en el navegador hasta crear.

/** La foto tomada de UN modelo. `sinFondo` es lo que eligió la persona para ESTA foto; `ia`, la versión sin fondo si ya llegó. */
export type FotoDelModelo<B = Blob, F = File> = {
  archivo: F;
  vista: string;
  sinFondo: boolean;
  ia?: { png: B; vista: string };
  /** La IA está preparando la versión sin fondo (≈25 s). */
  quitandoFondo?: boolean;
};

/** Lo que entra a «Fotos y colores» al crear la prenda: la foto y, si ya se preparó, su versión sin fondo (no se vuelve a pagar). */
export type FotoInicial<B = Blob, F = File> = { archivo: F; ia?: { png: B; usar: boolean } };

/** La foto que se ve: la sin fondo si se eligió y ya llegó; si no, la original. */
export function vistaDeLaFoto(f: Pick<FotoDelModelo<unknown, unknown>, "vista" | "sinFondo" | "ia"> | null | undefined): string | null {
  if (!f) return null;
  return f.sinFondo && f.ia ? f.ia.vista : f.vista;
}

/** La franja sobre la miniatura: algo está en camino. Lo que llega del celular manda: sin foto todavía no hay fondo que quitar. */
export type EstadoDeLaFoto = "cargando" | "quitando-fondo" | null;
export function estadoDeLaFoto(cargando: boolean, f: Pick<FotoDelModelo<unknown, unknown>, "sinFondo" | "quitandoFondo"> | null | undefined): EstadoDeLaFoto {
  if (cargando) return "cargando";
  if (f?.sinFondo && f.quitandoFondo) return "quitando-fondo";
  return null;
}

export const TEXTO_DEL_ESTADO: Record<Exclude<EstadoDeLaFoto, null>, string> = {
  cargando: "Cargando foto…",
  "quitando-fondo": "Quitando el fondo…",
};

/** ¿Hay que pedir la versión sin fondo? Solo si se eligió, la cuenta puede, no llegó todavía y no se está pidiendo ya. */
export function pideSinFondo(f: Pick<FotoDelModelo<unknown, unknown>, "sinFondo" | "ia" | "quitandoFondo"> | null | undefined, puedeIA: boolean): boolean {
  return Boolean(f && puedeIA && f.sinFondo && !f.ia && !f.quitandoFondo);
}

/** Lo que pasa a «Crear la prenda». La versión sin fondo va aunque se haya apagado: allá queda «Usar la de IA» a mano, sin pagar otra vez. */
export function fotoParaCrear<B, F>(f: FotoDelModelo<B, F> | null | undefined): FotoInicial<B, F>[] {
  if (!f) return [];
  return [f.ia ? { archivo: f.archivo, ia: { png: f.ia.png, usar: f.sinFondo } } : { archivo: f.archivo }];
}

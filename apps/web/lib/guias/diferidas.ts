import { bajoDemanda } from "@/lib/bajo-demanda";
import type { Guia } from "./tipos";

// El texto de las guías interactivas (`registro.ts` y sus guías en `pantallas/`: 665 KB ya armados, 177 comprimidos) se descarga recién
// cuando una demo va a correr (ADR-0623; ADR-0674 act. h).
//
// Hasta el 2026-11-17 el motor lo pedía en el primer momento libre de CADA sesión, en toda pantalla y para todos, solo para saber si la
// pantalla tenía guía y ofrecerla. Eso ya lo responde el índice que manda el servidor (`indiceDeGuias`). Ahora se pide al aceptar la oferta,
// al abrir «Demo» (para que arranque al instante) o cuando el asistente pide un tramo.
//
// Si la descarga falla (sin internet), NO se recuerda el fallo: la próxima vez se intenta de nuevo (`bajoDemanda`). Antes, una sola falla
// dejaba las guías apagadas hasta recargar, sin que nadie lo notara.

const registro = bajoDemanda(() => import("./registro").then((m) => m.GUIAS));

/** Las guías, si ya llegaron; si no, `null`. */
export function guiasCargadas(): readonly Guia[] | null {
  return registro.lista();
}

/** Empieza a bajarlas sin esperar (al ofrecer una demo o abrir «Demo»). Un fallo aquí no se dice: se dirá si la demo llega a pedirse. */
export function precargarGuias(): void {
  void registro.pedir().catch(() => {});
}

/** La guía entera (con sus pasos) de una del índice. `null` si ya no existe en el registro. Falla si no hay red. */
export async function guiaCompleta(id: string): Promise<Guia | null> {
  return (await registro.pedir()).find((g) => g.id === id) ?? null;
}

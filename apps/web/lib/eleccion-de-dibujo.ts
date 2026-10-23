// Lo que se elige en el selector de «Dibujo» de una insignia (ADR-0490): un dibujo de la lista, una imagen propia recién preparada (todavía sin
// subir) o la imagen que la insignia ya tiene guardada. Lógica pura, sin React ni red: la usan la hoja de nueva insignia y la de cambiar el dibujo.
//
// PROMETE: (1) lo que se muestra SELECCIONADO cuando la persona todavía no eligió nada (`eleccionEfectiva`): el dibujo que sugiere el nombre, que se
//   mueve mientras escribe; (2) si lo elegido cambia algo respecto de lo que la insignia ya tenía (`cambioDeDibujo`).
// ASUME: que quien guarda manda `dibujo` como `icono`, `imagen` como la ruta que acaba de subir y `guardada` como nada (ya está).

import { dibujoDeInsignia, type DibujoDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { esRutaDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";

export type EleccionDeDibujo =
  | { tipo: "dibujo"; clave: DibujoDeInsignia }
  /** Una imagen propia ya reducida a WebP, con su vista previa local (`blob:`). Se sube al guardar. */
  | { tipo: "imagen"; archivo: File; vista: string }
  /** La imagen que la insignia ya tiene guardada (su ruta en el almacén). */
  | { tipo: "guardada"; ruta: string };

/** Lo que una insignia ya tiene: su imagen propia, el dibujo que se eligió o, si nunca eligió, el de su nombre. */
export function eleccionDeLoGuardado(i: { nombre: string; icono?: string | null; imagen?: string | null }): EleccionDeDibujo {
  return esRutaDeImagenDeInsignia(i.imagen) ? { tipo: "guardada", ruta: i.imagen } : { tipo: "dibujo", clave: dibujoDeInsignia(i) };
}

/** Lo que se ve seleccionado: lo que la persona eligió o, si todavía no tocó nada, el dibujo que sugiere el nombre (se mueve mientras escribe). */
export function eleccionEfectiva(elegida: EleccionDeDibujo | null, nombre: string): EleccionDeDibujo {
  return elegida ?? { tipo: "dibujo", clave: dibujoDeInsignia({ nombre }) };
}

/** ¿Lo elegido es distinto de lo que la insignia ya tiene? Una imagen nueva siempre lo es. */
export function cambioDeDibujo(actual: EleccionDeDibujo, nueva: EleccionDeDibujo): boolean {
  if (nueva.tipo === "imagen") return true;
  if (actual.tipo !== nueva.tipo) return true;
  return actual.tipo === "dibujo" ? actual.clave !== (nueva as { clave: DibujoDeInsignia }).clave : actual.tipo === "guardada" ? actual.ruta !== (nueva as { ruta: string }).ruta : false;
}

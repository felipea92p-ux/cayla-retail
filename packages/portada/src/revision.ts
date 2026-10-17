import { CONTRASTE_MINIMO, contraste, mezclar } from "./contraste";
import { coloresDelDiseno, type DisenoDeCampana } from "./diseno";
import type { Colores, Tema } from "./paletas";

// LA REVISIÓN DE UN DISEÑO antes de publicarlo (ADR-0436): lo que el ERP muestra bajo la vista previa y en la hoja «Publicar». Solo dice
// lo que de verdad mide; si la letra no se lee en algún tema, «Publicar» se apaga y dice por qué. La tienda pregunta lo mismo
// (`seLee`) antes de pintar un diseño publicado: si no se lee, sale el de siempre.

export type Tono = "ok" | "ojo" | "mal";
export type Aviso = { tono: Tono; texto: string };

/** Lo que la revisión necesita saber de la campaña, además del diseño. */
export type ContextoRevision = {
  /** Cuántos modelos de la campaña podrían salir en la portada, y cuántos de ellos tienen foto. */
  prendas: number;
  prendasConFoto: number;
};

/** El color detrás del texto: el fondo liso, o el degradado donde está la letra (casi el fondo, apenas hacia el segundo tono). */
export function fondoDelTexto(d: DisenoDeCampana, c: Colores): string {
  return d.fondo === "liso" ? c.fondo : mezclar(c.fondo, c.fondo2, 0.22);
}

/** ¿La letra y el acento (la ceja, el nombre en cursiva) se leen sobre el fondo en ese tema? */
export function seLee(d: DisenoDeCampana, tema: Tema): boolean {
  const c = coloresDelDiseno(d, tema);
  const detras = fondoDelTexto(d, c);
  return contraste(c.letra, detras) >= CONTRASTE_MINIMO && contraste(c.acento, detras) >= CONTRASTE_MINIMO;
}

export function revisarDiseno(d: DisenoDeCampana, ctx: ContextoRevision): { avisos: Aviso[]; bloquea: boolean } {
  const avisos: Aviso[] = [];
  const claro = seLee(d, "claro");
  const oscuro = seLee(d, "oscuro");
  avisos.push(claro ? { tono: "ok", texto: "La letra se lee bien" } : { tono: "mal", texto: "La letra no se lee bien sobre este fondo: elige otro color." });
  avisos.push(oscuro ? { tono: "ok", texto: "También se lee en modo oscuro" } : { tono: "mal", texto: "En modo oscuro la letra no se lee: elige otro color." });
  if (d.fondo === "dibujo" && d.intensidad === "fuerte") avisos.push({ tono: "ojo", texto: "El dibujo está fuerte y compite con el nombre. Prueba «Medio»." });
  if (d.frase.length > 42) avisos.push({ tono: "ojo", texto: "Tu frase es larga: en el celular ocupa tres líneas." });
  if (d.acomodo !== "letras") {
    if (ctx.prendas === 0) avisos.push({ tono: "ojo", texto: "Sin prendas, la portada pondrá la tarjeta del Club en vez de fotos." });
    else if (ctx.prendasConFoto === 0) avisos.push({ tono: "ojo", texto: "Las prendas de esta campaña no tienen foto: saldrá su dibujo." });
    else avisos.push({ tono: "ok", texto: "Las prendas que salen tienen foto" });
  }
  return { avisos, bloquea: !claro || !oscuro };
}

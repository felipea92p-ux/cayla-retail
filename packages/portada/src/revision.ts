import { CONTRASTE_MINIMO, contraste, mezclar } from "./contraste";
import { coloresDelDiseno, leerDiseno, type DisenoDeCampana } from "./diseno";
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

/**
 * Cuánto tapa el velo de la foto (el color de la campaña encima de ella): donde va la letra, el oscurecido más 0,3; del otro lado, el
 * oscurecido. `heroe.css` lo dibuja con estos mismos números (`--t-velo-cerca`, `--t-velo-lejos`).
 */
export function veloDeLaFoto(oscuro: number): { cerca: number; lejos: number } {
  return { cerca: Math.min(1, oscuro + 0.3), lejos: oscuro };
}

/**
 * El color detrás del texto: el fondo liso; el degradado donde está la letra (casi el fondo, apenas hacia el segundo tono); o, con foto,
 * lo más claro de la foto tapado por el velo del color de la campaña.
 */
export function fondoDelTexto(d: DisenoDeCampana, c: Colores): string {
  if (d.fondo === "foto" && d.fotoTono) return mezclar(d.fotoTono, c.fondo, veloDeLaFoto(d.oscuro).cerca);
  return d.fondo === "liso" ? c.fondo : mezclar(c.fondo, c.fondo2, 0.22);
}

/** ¿La letra y el acento (la ceja, el nombre en cursiva) se leen sobre el fondo en ese tema? */
export function seLee(d: DisenoDeCampana, tema: Tema): boolean {
  const c = coloresDelDiseno(d, tema);
  const detras = fondoDelTexto(d, c);
  return contraste(c.letra, detras) >= CONTRASTE_MINIMO && contraste(c.acento, detras) >= CONTRASTE_MINIMO;
}

/**
 * El diseño publicado que la tienda pinta (ADR-0436, actividad 5): uno que esta versión sabe leer y cuya letra se lee en claro y en oscuro.
 * Si no (uno que el ERP de una versión más nueva guardó, o uno que hoy ya no pasaría la revisión), `null`: sale la portada de siempre, nunca
 * una portada rota ni una que no se lee. Es la misma pregunta que apaga «Publicar» en el ERP (`revisarDiseno` → `bloquea`).
 */
export function disenoParaPintar(x: unknown): DisenoDeCampana | null {
  const d = leerDiseno(x);
  return d && seLee(d, "claro") && seLee(d, "oscuro") ? d : null;
}

export function revisarDiseno(d: DisenoDeCampana, ctx: ContextoRevision): { avisos: Aviso[]; bloquea: boolean } {
  const avisos: Aviso[] = [];
  const claro = seLee(d, "claro");
  const oscuro = seLee(d, "oscuro");
  const conFoto = d.fondo === "foto";
  // Con foto, el arreglo está a mano: oscurecerla. Con color, otro color.
  const arreglo = conFoto ? "oscurece la foto un poco más." : "elige otro color.";
  avisos.push(claro ? { tono: "ok", texto: "La letra se lee bien" } : { tono: "mal", texto: `La letra no se lee bien sobre ${conFoto ? "la foto" : "este fondo"}: ${arreglo}` });
  avisos.push(oscuro ? { tono: "ok", texto: "También se lee en modo oscuro" } : { tono: "mal", texto: `En modo oscuro la letra no se lee: ${arreglo}` });
  if (conFoto && d.oscuro > 0.75) avisos.push({ tono: "ojo", texto: "Con tanto oscuro la foto casi no se ve. Prueba aclararla un poco." });
  if (d.fondo === "dibujo" && d.intensidad === "fuerte") avisos.push({ tono: "ojo", texto: "El dibujo está fuerte y compite con el nombre. Prueba «Medio»." });
  if (d.frase.length > 42) avisos.push({ tono: "ojo", texto: "Tu frase es larga: en el celular ocupa tres líneas." });
  if (d.acomodo !== "letras") {
    if (ctx.prendas === 0) avisos.push({ tono: "ojo", texto: "Sin prendas, la portada pondrá la tarjeta del Club en vez de fotos." });
    else if (ctx.prendasConFoto === 0) avisos.push({ tono: "ojo", texto: "Las prendas de esta campaña no tienen foto: saldrá su dibujo." });
    else avisos.push({ tono: "ok", texto: "Las prendas que salen tienen foto" });
  }
  return { avisos, bloquea: !claro || !oscuro };
}

// «Pregúntale a CAYLA» (ADR-0529, actividad 3): el RECORRIDO. Sin React ni DOM: se prueba en `recorrido.test.ts`.
//
// La IA responde con 1 a 3 TRAMOS, cada uno una pantalla y el paso de su guía que responde. El motor de guías (`MotorGuias`) corre un
// tramo como una guía corta que arranca en ESE paso (no desde la bienvenida) y, al terminarlo, lleva a la pantalla del siguiente. Es la
// diferencia con «Demo»: la demo enseña la pantalla entera; el recorrido lleva a la persona al botón que preguntó.

import type { AccionGuia, Guia } from "../guias/tipos";

/** Un tramo del recorrido: qué guía, desde qué paso (`null`: la guía entera) y a qué dirección del menú se llega a ella. */
export type Tramo = { guiaId: string; pasoId: string | null; href: string };

/** Más de tres pantallas ya no es «llévame al botón», es un curso: para eso está la demo de cada pantalla. */
export const MAXIMO_DE_TRAMOS = 3;

/** Un recorrido guardado más viejo que esto ya no es de la pregunta de ahora (la persona se fue, volvió otro día). */
const VIGENCIA_MS = 15 * 60_000;

/**
 * Lo que el paso necesita abierto para verse. Los pasos de una guía se escriben uno detrás de otro: el que abre un modal lo dice en su
 * `preparar` y los siguientes, que viven adentro, ya no. Para arrancar en un paso del medio se toma su propio `preparar` o, si no
 * tiene, el del último paso de antes que tenía uno (el que abrió el lugar donde vive). Si ninguno antes tenía, el paso está en la
 * pantalla tal como carga.
 */
function prepararParaSaltar(guia: Guia, indice: number): readonly AccionGuia[] {
  for (let j = indice; j >= 0; j--) {
    const preparar = guia.pasos[j]?.preparar;
    if (preparar && preparar.length > 0) return preparar;
  }
  return [];
}

/**
 * La guía de un tramo: el paso pedido solo, con lo que necesita abierto, y el `alSalir` de la guía para dejar la pantalla como estaba.
 * Se le quitan las condiciones que lo harían saltar sin decir nada (`opcional`, `requiere`, `excluye`): la persona preguntó por ESE
 * paso, y si su pieza no está a la vista, la tarjeta lo dice al centro. Sin paso (o con uno que la guía ya no tiene), la guía entera.
 */
export function guiaDelTramo(guia: Guia, pasoId: string | null): Guia {
  const indice = pasoId === null ? -1 : guia.pasos.findIndex((p) => p.id === pasoId && p.ancla !== null);
  if (indice === -1) return guia;
  const paso = { ...guia.pasos[indice]!, preparar: prepararParaSaltar(guia, indice) };
  delete paso.opcional;
  delete paso.requiere;
  delete paso.excluye;
  delete paso.prepararSoloAlAvanzar;
  return { ...guia, pasos: [paso] };
}

/**
 * La pieza que tiene que estar a la vista antes de arrancar un tramo: la primera que el piloto va a tocar o, si no toca nada, la del
 * paso. Una guía entera empieza con la bienvenida y le da tiempo a la pantalla de dibujarse; un tramo salta directo a su paso, y en una
 * pantalla recién abierta el botón que abre la hoja todavía no está (el piloto lo busca 2 s y se rinde).
 */
export function anclaDeArranque(tramo: Guia): string | null {
  const [paso] = tramo.pasos;
  if (!paso) return null;
  for (const a of paso.preparar ?? []) if (a.tipo !== "escape" && !(a.tipo === "clic" && a.siEsta)) return a.ancla;
  return paso.ancla;
}

/**
 * La dirección que arranca un tramo: la de la entrada del menú con `demo=1` (lo que ya lee el motor), el paso y una marca de esta vez
 * (`vez`), para que preguntar dos veces lo mismo seguido vuelva a arrancarlo (el motor ignora un `?demo=1` repetido en el minuto).
 */
export function direccionDelTramo(tramo: Tramo, vez: string): string {
  const [camino, consulta = ""] = tramo.href.split("?");
  const p = new URLSearchParams(consulta);
  p.set("demo", "1");
  if (tramo.pasoId) p.set("paso", tramo.pasoId);
  p.set("vez", vez);
  return `${camino}?${p}`;
}

/** ¿El tramo es de la pantalla donde ya está la persona? Entonces no se navega: la guía arranca aquí mismo. */
export function esDeEstaPantalla(tramo: Tramo, pathname: string): boolean {
  const sinBarra = (r: string) => (r.length > 1 ? r.replace(/\/+$/, "") : r);
  return sinBarra(tramo.href.split(/[?#]/)[0] ?? "") === sinBarra(pathname);
}

/** Lo que se guarda en el navegador mientras dura un recorrido de más de una pantalla: los tramos que faltan. */
export type RecorridoGuardado = { tramos: Tramo[]; creado: number };

/** Lee lo guardado con desconfianza (puede venir de otra versión, a medias o vencido): si algo no cuadra, no hay recorrido. */
export function leerRecorrido(texto: string | null, ahora: number): RecorridoGuardado | null {
  if (!texto) return null;
  let dato: unknown;
  try {
    dato = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!dato || typeof dato !== "object") return null;
  const { tramos, creado } = dato as { tramos?: unknown; creado?: unknown };
  if (typeof creado !== "number" || ahora - creado > VIGENCIA_MS || ahora < creado) return null;
  if (!Array.isArray(tramos)) return null;
  const validos = tramos.filter(
    (t): t is Tramo =>
      !!t && typeof t === "object" && typeof t.guiaId === "string" && typeof t.href === "string" && t.href.startsWith("/") && !t.href.startsWith("//") && (t.pasoId === null || typeof t.pasoId === "string"),
  );
  if (validos.length !== tramos.length || validos.length === 0) return null;
  return { tramos: validos.slice(0, MAXIMO_DE_TRAMOS), creado };
}

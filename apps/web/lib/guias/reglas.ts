// Guías interactivas (ADR-0362): las reglas puras que usa el motor. Sin React ni DOM: se prueban en `reglas.test.ts`.

import type { Guia, PasoGuia, PiezaATocar } from "./tipos";

/** Sin tildes ni mayúsculas, espacios colapsados: «CONFIRMAR  cobro» y «Confirmar cobro» son lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verbos de una pieza que ESCRIBE en la base, mueve dinero o stock, o saca algo de la pantalla. La demo corre en la tienda de
 * verdad (producción): si el piloto tocara uno, la venta, el apartado o el cierre serían reales. Lista a propósito ancha:
 * «Agregar» al ticket no llega a la base, pero sí a los tickets en espera del aparato, y «Quitar» en otra pantalla borra de
 * verdad. Mejor una demo que explica un botón sin tocarlo que una que se equivoca una vez.
 */
const VERBOS_QUE_ESCRIBEN = [
  "guardar", "cobrar", "confirmar", "registrar", "eliminar", "borrar", "quitar", "anular", "emitir", "enviar", "pagar",
  "aprobar", "rechazar", "aceptar", "transferir", "imprimir", "abrir caja", "cerrar caja", "apartar", "liberar", "descartar",
  "subir", "recibir", "despachar", "crear", "agregar", "anadir", "dejar en espera", "soltar", "aplicar", "cerrar el conteo",
  "marcar", "suspender", "reactivar", "devolver", "cambiar", "canjear", "entregar", "retirar", "reponer", "bajar", "ajustar",
  "descargar", "compartir", "whatsapp", "llamar", "salir", "cerrar sesion",
] as const;

/**
 * ¿Por qué el piloto NO debe tocar esta pieza? `null` si se puede tocar. Es la regla «nunca guardar» (Felipe, 2026-10-07):
 * la guía abre, escribe un ejemplo y elige; el último paso que guarda lo EXPLICA, no lo ejecuta.
 */
export function motivoParaNoTocar(p: PiezaATocar): string | null {
  const tipo = p.tipo?.toLowerCase() ?? null;
  if (tipo === "submit") return "envía un formulario";
  if (p.etiqueta === "button" && p.enFormulario && (tipo === null || tipo === "")) return "envía un formulario (botón sin type dentro de un form)";
  if (p.etiqueta === "input" && (tipo === "submit" || tipo === "file" || tipo === "image")) return "envía o sube algo";
  if (p.href) {
    const destino = p.href.split(/[?#]/)[0] ?? "";
    if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(p.href)) return "sale del ERP";
    if (destino && destino !== p.rutaActual) return "lleva a otra pantalla";
  }
  const texto = normalizar(p.texto);
  for (const verbo of VERBOS_QUE_ESCRIBEN) {
    if (new RegExp(`(^|[^a-z])${verbo}([^a-z]|$)`).test(texto)) return `es un botón que hace algo («${verbo}»)`;
  }
  return null;
}

/** ¿Esta ruta del registro («/compras/proveedores/[id]») describe esta URL («/compras/proveedores/9f…»)? */
export function rutaCoincide(patron: string, pathname: string): boolean {
  const limpio = (r: string) => (r.length > 1 ? r.replace(/\/+$/, "") : r);
  // Los grupos de Next («(billetera)») no aparecen en la URL.
  const a = limpio(patron).split("/").filter((s) => !/^\(.*\)$/.test(s));
  const b = limpio(pathname).split("/");
  if (a.length !== b.length) return false;
  return a.every((seg, i) => (/^\[.+\]$/.test(seg) ? (b[i] ?? "") !== "" : seg === b[i]));
}

/** La guía de la pantalla abierta, o null. Una ruta exacta gana a una con `[id]`. */
export function guiaDeRuta(pathname: string, guias: readonly Guia[]): Guia | null {
  const exacta = guias.find((g) => !g.ruta.includes("[") && rutaCoincide(g.ruta, pathname));
  return exacta ?? guias.find((g) => rutaCoincide(g.ruta, pathname)) ?? null;
}

export const ANCHO_ESCRITORIO = 1024;

/** ¿El paso tiene sentido ahora? (rol, estado de la pantalla y ancho). `presentes` = anclas que hay en el DOM. */
export function pasoAplica(paso: PasoGuia, presentes: ReadonlySet<string>, anchoVentana: number): boolean {
  if (paso.solo === "escritorio" && anchoVentana < ANCHO_ESCRITORIO) return false;
  if (paso.solo === "celular" && anchoVentana >= ANCHO_ESCRITORIO) return false;
  if (paso.requiere?.some((a) => !presentes.has(a))) return false;
  if (paso.excluye?.some((a) => presentes.has(a))) return false;
  return true;
}

/**
 * ¿Se le ofrece la guía al entrar? Una vez por persona y por pantalla (Felipe, 2026-10-07): si ya se le ofreció (la vio, la
 * saltó o dijo «ahora no»), nunca más sola; para repetirla está «Demo» en su perfil.
 */
export function debeOfrecer({ guiaId, vistas, leidas }: { guiaId: string; vistas: ReadonlySet<string>; leidas: boolean }): boolean {
  // Sin saber todavía qué vio (la lectura no llegó), no se ofrece: mejor tarde que dos veces.
  if (!leidas) return false;
  return !vistas.has(guiaId);
}

export type Caja = { top: number; left: number; width: number; height: number };
export type Ventana = { ancho: number; alto: number };

/** El recorte del velo: la pieza con aire alrededor, sin salirse de la ventana. */
export function recorteDe(pieza: Caja, ventana: Ventana, margen = 8): Caja {
  const top = Math.max(4, pieza.top - margen);
  const left = Math.max(4, pieza.left - margen);
  const bottom = Math.min(ventana.alto - 4, pieza.top + pieza.height + margen);
  const right = Math.min(ventana.ancho - 4, pieza.left + pieza.width + margen);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export type LadoTarjeta = "abajo" | "arriba" | "derecha" | "izquierda" | "centro";

/**
 * Dónde va la tarjeta: abajo de la pieza si cabe; si no, arriba, a la derecha o a la izquierda; si la pieza ocupa casi toda
 * la pantalla, encima y al centro-abajo. En celular (< 640 px) siempre pegada abajo o arriba, a lo ancho.
 */
export function posicionTarjeta(recorte: Caja | null, ventana: Ventana, tarjeta: { ancho: number; alto: number }, aire = 14): { top: number; left: number; lado: LadoTarjeta } {
  const borde = 16;
  const ancho = Math.min(tarjeta.ancho, ventana.ancho - borde * 2);
  const centradoX = (x: number) => Math.min(Math.max(borde, x - ancho / 2), ventana.ancho - ancho - borde);
  if (!recorte) return { top: Math.max(borde, (ventana.alto - tarjeta.alto) / 2), left: (ventana.ancho - ancho) / 2, lado: "centro" };

  const abajo = recorte.top + recorte.height + aire;
  const arriba = recorte.top - aire - tarjeta.alto;
  const medioX = recorte.left + recorte.width / 2;
  if (abajo + tarjeta.alto <= ventana.alto - borde) return { top: abajo, left: centradoX(medioX), lado: "abajo" };
  if (arriba >= borde) return { top: arriba, left: centradoX(medioX), lado: "arriba" };

  if (ventana.ancho >= 640) {
    const altoY = Math.min(Math.max(borde, recorte.top), ventana.alto - tarjeta.alto - borde);
    const derecha = recorte.left + recorte.width + aire;
    if (derecha + ancho <= ventana.ancho - borde) return { top: altoY, left: derecha, lado: "derecha" };
    const izquierda = recorte.left - aire - ancho;
    if (izquierda >= borde) return { top: altoY, left: izquierda, lado: "izquierda" };
  }
  // La pieza llena la pantalla (un modal grande, el catálogo): la tarjeta va abajo, encima de la pieza.
  return { top: Math.max(borde, ventana.alto - tarjeta.alto - borde), left: centradoX(ventana.ancho / 2), lado: "centro" };
}

/** «Paso 3 de 9», contando solo los pasos que aplican ahora. */
export function textoAvance(indice: number, total: number): string {
  return `Paso ${indice + 1} de ${total}`;
}

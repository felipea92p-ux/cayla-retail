// El piloto automático de las guías (ADR-0362): lo único que toca el DOM. Encuentra las piezas por `data-guia`, y abre,
// escribe un ejemplo o cierra como lo haría una persona. Antes de TOCAR algo le pregunta a `motivoParaNoTocar` (lib/guias):
// la demo corre en la tienda de verdad y nunca guarda.

import { motivoParaNoTocar } from "@/lib/guias/reglas";
import type { AccionGuia, PiezaATocar } from "@/lib/guias/tipos";

/** El selector de una pieza de la guía. Las anclas son claves de texto simples («vender.buscador»). */
export const selectorAncla = (ancla: string) => `[data-guia="${CSS.escape(ancla)}"]`;

/** ¿Se ve? Ni oculta, ni de tamaño cero, ni dentro de algo con `display: none`. */
function seVe(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.02;
}

/** La primera pieza VISIBLE con esa ancla (una lista repite el ancla en cada fila: vale la primera). */
export function buscarAncla(ancla: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selectorAncla(ancla))) if (seVe(el)) return el;
  return null;
}

/** Todas las anclas visibles ahora (para `requiere` / `excluye`). */
export function anclasPresentes(): Set<string> {
  const s = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-guia]")) {
    const a = el.dataset.guia;
    if (a && !s.has(a) && seVe(el)) s.add(a);
  }
  return s;
}

/** Espera a que la pieza aparezca (un modal tarda lo que dura su entrada). `null` si no llega a tiempo. */
export async function esperarAncla(ancla: string, ms = 2200, senal?: AbortSignal): Promise<HTMLElement | null> {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    if (senal?.aborted) return null;
    const el = buscarAncla(ancla);
    if (el) return el;
    await pausa(80);
  }
  return null;
}

export const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lo que la regla necesita saber de la pieza. Si el ancla está en un contenedor, se mira el control de adentro. */
export function describirPieza(el: HTMLElement): PiezaATocar {
  const control = el.matches("button, a, input, select, textarea, [role=button], [role=tab]")
    ? el
    : (el.querySelector<HTMLElement>("button, a, input, [role=button], [role=tab]") ?? el);
  const texto = (control.innerText || control.getAttribute("aria-label") || control.getAttribute("title") || "").trim();
  return {
    etiqueta: control.tagName.toLowerCase(),
    texto,
    tipo: control.getAttribute("type"),
    enFormulario: !!control.closest("form"),
    href: control instanceof HTMLAnchorElement ? control.getAttribute("href") : null,
    // Una pestaña escrita como botón (las de abajo de Apartados en el celular) no lleva role="tab" (ADR-0358 lo reserva a
    // <Pestanas>), pero sí `aria-current`/`aria-selected`: marca la vista elegida. Un botón que guarda nunca lleva eso.
    rol: control.getAttribute("role") ?? (control.tagName === "BUTTON" && (control.hasAttribute("aria-current") || control.hasAttribute("aria-selected")) ? "tab" : null),
    rutaActual: window.location.pathname,
  };
}

/**
 * Bandera para que el motor deje pasar SU Escape: el motor intercepta el Escape de la persona (sale de la guía) antes que
 * los modales, pero el que despacha el piloto tiene que llegar al modal para cerrarlo.
 */
let despachandoEscape = false;
export const esEscapeDelPiloto = () => despachandoEscape;

/** Pone un valor en un campo controlado por React (el `value` del prototipo, y un `input` que sube). */
function ponerValor(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function campoDe(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  return el.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]), textarea");
}

/** La primera palabra (de 3 letras o más) del nombre de la primera pieza visible con esa ancla: «Blusa» de «Blusa Aurora». */
function palabraDe(ancla: string): string | null {
  // La primera que se ve; si ninguna terminó de entrar todavía (su animación arranca en opacidad 0), la primera que exista:
  // para leer un nombre no hace falta que ya se vea.
  const el = buscarAncla(ancla) ?? document.querySelector<HTMLElement>(selectorAncla(ancla));
  const nombre = (el?.getAttribute("aria-label") || el?.innerText || "").trim();
  return nombre.split(/\s+/).find((p) => p.length >= 3) ?? null;
}

/** ¿Hay un modal de la pantalla abierto? (los de la guía no cuentan). */
export function hayModalAbierto(): boolean {
  return [...document.querySelectorAll("[role=dialog]")].some((d) => !d.closest("[data-guia-motor]"));
}

export type ResultadoAccion = { ok: true } | { ok: false; motivo: string };

/** Hace una acción del piloto. Nunca lanza: si no puede, dice por qué y la guía sigue explicando. */
export async function ejecutar(accion: AccionGuia, senal?: AbortSignal, conMovimiento = true): Promise<ResultadoAccion> {
  if (senal?.aborted) return { ok: false, motivo: "la guía terminó" };
  if (accion.tipo === "escape") {
    // Solo si hay algo que cerrar: un Escape suelto en la pantalla podría significar otra cosa (borrar la búsqueda).
    if (!hayModalAbierto()) return { ok: true };
    const destino = (document.activeElement as HTMLElement | null) ?? document.body;
    despachandoEscape = true;
    try {
      destino.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } finally {
      despachandoEscape = false;
    }
    await pausa(conMovimiento ? 320 : 30);
    return { ok: true };
  }

  const el = await esperarAncla(accion.ancla, 2200, senal);
  if (!el) return { ok: false, motivo: `no está a la vista (${accion.ancla})` };

  if (accion.tipo === "clic") {
    const motivo = motivoParaNoTocar(describirPieza(el));
    if (motivo) return { ok: false, motivo };
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: conMovimiento ? "smooth" : "auto" });
    await pausa(conMovimiento ? 220 : 0);
    const control = el.matches("button, a, input, [role=button], [role=tab]") ? el : (el.querySelector<HTMLElement>("button, a, input, [role=button], [role=tab]") ?? el);
    control.click();
    return { ok: true };
  }

  const campo = campoDe(el);
  if (!campo) return { ok: false, motivo: `no es un campo (${accion.ancla})` };
  if (accion.tipo === "vaciar") {
    ponerValor(campo, "");
    return { ok: true };
  }
  const texto = typeof accion.texto === "string" ? accion.texto : palabraDe(accion.texto.palabraDe);
  if (!texto) return { ok: false, motivo: "no hay un ejemplo a la vista" };
  // Escribir: letra a letra, para que se vea a alguien escribiendo (y el buscador reaccione como con una persona).
  campo.focus({ preventScroll: true });
  if (!conMovimiento) {
    ponerValor(campo, texto);
    return { ok: true };
  }
  for (let i = 1; i <= texto.length; i++) {
    if (senal?.aborted) return { ok: false, motivo: "la guía terminó" };
    ponerValor(campo, texto.slice(0, i));
    await pausa(70);
  }
  return { ok: true };
}

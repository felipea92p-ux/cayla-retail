"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

// Llevar a la persona al campo (ADR-0284): lo pide el «Falta: …» del pie y el «Siguiente: …» de la ficha, y lo hace el propio
// formulario cuando un campo que sigue queda fuera de la vista. Nada aquí decide QUÉ sigue (eso es `lib/alta-producto-guia.ts`):
// solo mueve la vista y el foco.
//
// Reglas de tacto:
//   * solo desplaza si el campo no se ve entero (con margen para la cabecera arriba y el pie pegado abajo);
//   * el foco solo se lleva a un campo de TEXTO vacío (nombre, precio…). Una lista (marca, tejido) no se abre sola: la
//     persona tiene que elegir, no que se le abra algo encima;
//   * con movimiento reducido, sin animación.

const ARRIBA = 96; // cabecera fija de la app
const ABAJO = 110; // pie del paso pegado abajo (escritorio)

/** Lo que tapa el borde de arriba: la cabecera de la app y, en Nuevo producto, los puntos de avance pegados bajo ella. Se mide en
 *  vivo (2026-10-09): con el número fijo de 96 px, en el celular la guía dejaba el campo bajo los puntos (la cabecera y ellos llegaban
 *  a 160 px) y «Unidades de hoy» quedaba tapado justo cuando la guía decía «sigue aquí». */
function arribaTapado(): number {
  const puntos = document.querySelector<HTMLElement>("[data-puntos-avance]");
  if (!puntos) return ARRIBA;
  const pegadaEn = parseFloat(getComputedStyle(puntos).top) || 0;
  return Math.max(ARRIBA, pegadaEn + puntos.offsetHeight + 12);
}

/** Lo que tapa el borde de abajo: en escritorio, el pie del paso; en celular, la barra de la ficha (`data-barra-ficha`). */
function abajoTapado(): number {
  const barra = document.querySelector<HTMLElement>("[data-barra-ficha]")?.offsetHeight ?? 0;
  return Math.max(ABAJO, barra + 24);
}

/** Un campo se encuentra por su `data-campo`: los del alta (`CampoAlta`) y los de la ficha de Editar producto (`IdPendiente`). */
type IdCampo = string;

/** Campos cuyo primer control es una caja de texto: al llevar a la persona ahí, el cursor queda listo. */
const CON_CURSOR: ReadonlySet<IdCampo> = new Set(["nombre", "descripcion", "precio"]);

function reducido(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fila(id: IdCampo): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-campo="${id}"]`);
}

/** ¿La persona está escribiendo ahora (foco en una caja de texto)? Entonces la guía mueve su luz pero NUNCA la página: al teclear el
 *  precio no puede saltar. Se prueba con el foco, no con la tecla: sirve igual con teclado, lector o pantalla táctil. */
export function estaEscribiendo(): boolean {
  const el = document.activeElement;
  // Un combo con el foco NO es alguien escribiendo: tras elegir el proveedor el cursor se queda en su caja, y la guía no llevaba al
  // nombre (Felipe, 2026-10-09). Lo mismo decide la luz de cada campo (`useRetenerLuz`).
  return esCajaDeTexto(el) && el.getAttribute("role") !== "combobox";
}

/** ¿Es una caja donde se teclea (texto, número, buscador…)? No lo son las casillas, los botones ni los combos que no escriben. */
export function esCajaDeTexto(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(el.type));
}

/** Deja el campo a la vista con el menor movimiento posible. Dentro de un modal el que se desplaza es el modal, no la ventana:
 *  ahí basta con «lo justo» (`nearest`), que no hace nada si ya se ve. */
export function asegurarVisible(id: IdCampo, opciones: { enModal?: boolean } = {}): void {
  const el = fila(id);
  if (!el) return;
  if (opciones.enModal) {
    el.scrollIntoView({ block: "nearest", behavior: reducido() ? "auto" : "smooth" });
    return;
  }
  const r = el.getBoundingClientRect();
  const alto = window.innerHeight;
  const arriba = arribaTapado();
  const abajo = abajoTapado();
  if (r.top >= arriba && r.bottom <= alto - abajo) return;
  // Un campo más alto que lo libre que ya lo llena entero (la carta de colores mientras se recorre) está a la vista: llevarlo a su
  // comienzo sería sacar a la persona de donde está.
  if (r.top <= arriba && r.bottom >= alto - abajo) return;
  // Se centra en el hueco que de verdad se ve (entre lo pegado arriba y lo pegado abajo), no en la ventana: `scrollIntoView` no sabe
  // de los puntos ni de la barra, y centraba el campo debajo de uno de ellos. Si no cabe entero, su comienzo queda justo bajo lo de arriba.
  const libre = alto - arriba - abajo;
  const delta = r.height <= libre ? (r.top + r.bottom) / 2 - (arriba + alto - abajo) / 2 : r.top - arriba;
  window.scrollBy({ top: delta, behavior: reducido() ? "auto" : "smooth" });
}

/** Lleva a la persona al campo: lo deja a la vista, lo destella una vez y, si es de texto, le pone el cursor. */
export function irAlIdCampo(id: IdCampo, opciones: { destello?: boolean; cursor?: boolean; enModal?: boolean } = {}): void {
  const { destello = true, cursor = CON_CURSOR.has(id), enModal = false } = opciones;
  const el = fila(id);
  if (!el) return;
  asegurarVisible(id, { enModal });
  // El cursor solo a una caja de texto: un combo o un interruptor no se abren solos, la persona elige.
  if (cursor) el.querySelector<HTMLElement>('input:not([disabled]):not([role="combobox"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea:not([disabled])')?.focus({ preventScroll: true });
  if (!destello) return;
  el.removeAttribute("data-llamado");
  // Reinicia la animación aunque se pida dos veces seguidas.
  void el.offsetWidth;
  el.setAttribute("data-llamado", "");
  window.setTimeout(() => el.removeAttribute("data-llamado"), 1200);
}

/**
 * El tacto del alta: `ir(id)` lleva a un campo del paso abierto; `irCuandoAbra(id)` lo deja pedido para cuando el paso
 * (que aún se está abriendo) lo pinte. El formulario llama a `alAbrirPaso()` cuando terminó de abrir un paso.
 */
export function useGuiaAlta() {
  const pedido = useRef<{ id: IdCampo; destello: boolean } | null>(null);
  const temporizador = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    []
  );

  const ir = useCallback((id: IdCampo) => irAlIdCampo(id), []);

  /** `sinPisar`: si ya hay un pedido (la persona tocó «Falta: Tejido»), este —el cursor de cortesía del paso— no lo reemplaza. */
  const irCuandoAbra = useCallback((id: IdCampo, opciones: { destello?: boolean; sinPisar?: boolean } = {}) => {
    if (opciones.sinPisar && pedido.current) return;
    pedido.current = { id, destello: opciones.destello ?? true };
  }, []);

  /** Cumple lo pedido con `irCuandoAbra`, ya con el paso pintado y el desplazamiento del paso empezado. */
  const alAbrirPaso = useCallback(() => {
    const p = pedido.current;
    if (!p) return;
    pedido.current = null;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    // Espera a que termine el desplazamiento hacia el paso; si no, los dos movimientos se pisan.
    temporizador.current = window.setTimeout(() => irAlIdCampo(p.id, { destello: p.destello }), reducido() ? 0 : 260);
  }, []);

  return useMemo(() => ({ ir, irCuandoAbra, alAbrirPaso }), [ir, irCuandoAbra, alAbrirPaso]);
}

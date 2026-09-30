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
  return esCajaDeTexto(document.activeElement);
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
  const abajo = abajoTapado();
  if (r.top >= ARRIBA && r.bottom <= alto - abajo) return;
  const cabe = r.height <= alto - ARRIBA - abajo;
  el.scrollIntoView({ block: cabe ? "center" : "start", behavior: reducido() ? "auto" : "smooth" });
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

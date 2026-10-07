"use client";

import { useEffect } from "react";

/* ====================================================================
   OndaBotones · la onda que nace donde tocas un botón (ADR-0358, ronda 4 de /unificar)

   Felipe eligió las dos voces de los botones (2026-10-07) pidiendo «más animaciones para que sea más interactivo cuando
   haces clic». Al presionar un botón del ERP (`.mov-boton` o cualquier `btn-cayla` que no sea un enlace de texto), una onda
   de su propio color nace en el punto tocado y se apaga en 450 ms: la mano ve que el botón la escuchó, también con el dedo.

   Montado UNA vez en `app/layout.tsx`, como `PaginaEstable`: ninguna pantalla tiene que hacer nada. Solo mueve el dibujo
   (`::before`, en globals.css); nunca toca el clic ni el foco. Sin rebote ni bucle (ADR-0136), y con «reducir movimiento» la
   onda no corre (la regla vive en el CSS).
   ==================================================================== */

const BOTON = ".mov-boton, .btn-cayla:not(.btn-enlace)";

export function OndaBotones() {
  useEffect(() => {
    const alPresionar = (e: PointerEvent) => {
      const boton = (e.target as Element | null)?.closest?.(BOTON) as HTMLElement | null;
      if (!boton || boton.matches(":disabled, [aria-disabled='true']")) return;
      const r = boton.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // El diámetro alcanza la esquina más lejana: la onda llena el botón venga de donde venga el toque.
      const d = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
      boton.style.setProperty("--onda-x", `${x}px`);
      boton.style.setProperty("--onda-y", `${y}px`);
      boton.style.setProperty("--onda-d", `${d}px`);
      // Quitar y volver a poner el atributo reinicia la animación aunque el botón se toque dos veces seguidas.
      boton.removeAttribute("data-onda");
      void boton.offsetWidth;
      boton.setAttribute("data-onda", "");
      window.setTimeout(() => boton.removeAttribute("data-onda"), 500);
    };
    document.addEventListener("pointerdown", alPresionar, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", alPresionar, { capture: true });
  }, []);
  return null;
}

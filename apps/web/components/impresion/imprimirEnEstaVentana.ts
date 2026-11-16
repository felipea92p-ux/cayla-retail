"use client";

import { avisar } from "@/components/ui/Avisos";
import { sistemaDelEquipo } from "@/lib/guia-impresion-reglas";
import { frenoDeImpresion, ventanaDelEquipo, type QueSeImprime } from "@/lib/ventana-de-impresion";

/**
 * Antes de abrir la impresión: ¿esto va a la impresora de esta ventana? Si no, avisa en qué ventana abrirlo y devuelve
 * `false` sin imprimir (`lib/ventana-de-impresion.ts`). Todo `window.print()` del ERP pasa por aquí o por `imprimirAqui`.
 */
export function sePuedeImprimirAqui(que: QueSeImprime, porAyudante = false): boolean {
  const freno = frenoDeImpresion(ventanaDelEquipo.leer(), que, sistemaDelEquipo(navigator.userAgent, navigator.platform), porAyudante);
  if (freno) {
    avisar.aviso(freno);
    return false;
  }
  return true;
}

/** `window.print()` con el freno de la ventana. Devuelve si se mandó a imprimir. */
export function imprimirAqui(que: QueSeImprime): boolean {
  if (!sePuedeImprimirAqui(que)) return false;
  window.print();
  return true;
}

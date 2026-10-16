"use client";

import { useLinkStatus } from "next/link";

/**
 * Va dentro de un enlace que cambia la lista (un filtro, el orden, la tienda): mientras llega la lista nueva, lo marca
 * (`data-pendiente`). Con eso, la píldora tocada ya se ve elegida y la lista de abajo se apaga un poco (catalogo.css): antes, durante
 * ese medio segundo, nada decía que el toque había llegado y se volvía a tocar. Si la lista ya estaba lista (precargada), no marca nada.
 * No ocupa lugar (se esconde): solo es una marca para el estilo.
 */
export function PendienteDelEnlace() {
  const { pending } = useLinkStatus();
  return <span className="t-pendiente" data-pendiente={pending ? "" : undefined} aria-hidden="true" />;
}

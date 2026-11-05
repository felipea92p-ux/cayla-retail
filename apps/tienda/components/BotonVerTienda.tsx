"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EVENTO_CAMBIAR_TIENDA } from "@/lib/sede-velo";

/**
 * «Ver lo que hay» de una tienda (Felipe 2026-10-21): pide el MISMO cambio que el selector de la cabecera —la cookie, el velo «Ahora ves lo
 * que hay en LIMA» y, si la bolsa lleva prendas, la confirmación—, no una navegación suelta. El selector atiende el aviso de ventana; si no
 * lo atiende (la misma tienda, un clic con modificador, sin selector), el enlace sigue su camino normal.
 */
export function BotonVerTienda({ href, enPagina, children }: { href: string; enPagina: boolean; children: ReactNode }) {
  return (
    <Link
      className="ay-tienda-ver"
      href={href}
      scroll={enPagina ? undefined : false}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const atendido = !window.dispatchEvent(new CustomEvent(EVENTO_CAMBIAR_TIENDA, { detail: href, cancelable: true }));
        if (atendido) e.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}

"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { conPagina, numerosDePaginas } from "@/lib/paginas";
import { Icono } from "./Icono";
import { PendienteDelEnlace } from "./PendienteDelEnlace";

/**
 * Las páginas de una lista del catálogo (`lib/paginas.ts`): «‹ 1 … 4 5 6 … 12 ›» con lo que se está viendo («31–60 de 128 prendas»). Va al
 * pie de la grilla. Cada número es un enlace con la dirección de la lista y su `?pagina=` (se abre en otra pestaña, se comparte, «atrás»
 * vuelve a la misma página). Al tocar uno, la vista vuelve al comienzo de la lista antes de que llegue la página nueva, como con un
 * filtro (`FiltrosDeLista`): si no, la página 2 aparecía desde su pie. Mientras llega, la grilla se apaga un poco (`PendienteDelEnlace`).
 * Con una sola página no se dibuja: no hay nada que pasar.
 */
export function Paginacion({
  href,
  pagina,
  paginas,
  desde,
  hasta,
  total,
  que = "prendas",
}: {
  /** La dirección de la lista sin `pagina`. */
  href: string;
  pagina: number;
  paginas: number;
  /** Lo que se ve ahora: de la prenda `desde` (la primera es 0) a la `hasta` (sin incluir), de `total`. */
  desde: number;
  hasta: number;
  total: number;
  que?: string;
}) {
  if (paginas <= 1) return null;

  function alTocar(e: MouseEvent<HTMLElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!(e.target instanceof Element) || !e.target.closest("a[href]")) return;
    const marca = document.querySelector<HTMLElement>(".t-filtros-marca");
    if (!marca) return;
    const comienzo = marca.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > comienzo + 1) window.scrollTo({ top: comienzo, behavior: "instant" });
  }

  const flecha = (a: number, texto: string, cual: "anterior" | "siguiente") =>
    a < 1 || a > paginas ? (
      <span className={`t-pag t-pag-flecha t-pag-${cual}`} aria-disabled="true" aria-label={texto}>
        <Icono nombre="flecha" />
      </span>
    ) : (
      <Link className={`t-pag t-pag-flecha t-pag-${cual}`} href={conPagina(href, a)} rel={cual === "anterior" ? "prev" : "next"} scroll={false} aria-label={texto}>
        <Icono nombre="flecha" />
        <PendienteDelEnlace />
      </Link>
    );

  return (
    <nav className="t-paginas" aria-label="Páginas" onClickCapture={alTocar}>
      <div className="t-paginas-fila">
        {flecha(pagina - 1, "Página anterior", "anterior")}
        {numerosDePaginas(pagina, paginas).map((n, i) =>
          n === "…" ? (
            <span key={`salto-${i}`} className="t-pag t-pag-salto" aria-hidden="true">
              …
            </span>
          ) : (
            <Link
              key={n}
              className="t-pag"
              href={conPagina(href, n)}
              aria-current={n === pagina ? "page" : undefined}
              aria-label={n === pagina ? `Página ${n}, estás aquí` : `Página ${n}`}
              scroll={false}
            >
              <span className="num">{n}</span>
              <PendienteDelEnlace />
            </Link>
          ),
        )}
        {flecha(pagina + 1, "Página siguiente", "siguiente")}
      </div>
      <p className="t-paginas-dato" aria-live="polite">
        <span className="num">
          {desde + 1}–{hasta}
        </span>{" "}
        de <span className="num">{total}</span> {que}
      </p>
    </nav>
  );
}

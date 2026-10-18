"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type RefObject, type TransitionStartFunction } from "react";

/**
 * Lo que va al final de una lista del catálogo cuando quedan prendas por dibujar (`lib/tandas.ts`). La tanda siguiente se pide SOLA
 * cuando el final de la lista está a una pantalla y media de verse, así el cliente casi nunca llega a esperarla; mientras llega, brillan
 * cuatro tarjetas vacías con la forma de las que vienen (el mismo esqueleto de la página). El botón queda para quien llega antes, para el
 * teclado y para un navegador sin `IntersectionObserver`. La dirección cambia sin subir la página (`scroll: false`) y sin sumar un paso a
 * «atrás» (`replace`): atrás sale de la lista, no de cada tanda.
 *
 * No usa `PendienteDelEnlace`: esa marca apaga TODA la grilla mientras llega una lista nueva (un filtro), y aquí la grilla de arriba se
 * queda igual; solo se suma lo de abajo.
 */
export function MasPrendas({ href, cuantasMas, quedan }: { href: string; cuantasMas: number; quedan: number }) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const marca = useRef<HTMLDivElement>(null);
  // Una vez por tanda: el observador avisa de nuevo mientras la marca sigue a la vista y la tanda todavía no llega.
  const pedida = useRef<string | null>(null);

  useEffect(() => {
    const el = marca.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) pedirTanda(pedida, href, iniciar, (h) => router.replace(h, { scroll: false }));
      },
      { rootMargin: "0px 0px 150% 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [href, router]);

  return (
    <div ref={marca} className="t-mas" data-cargando={cargando ? "" : undefined}>
      {cargando && (
        <div className="t-esqueleto t-mas-esqueleto" aria-hidden="true">
          <div className="t-grilla">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="t-card">
                <div className="t-card-foto" />
                <div className="t-esqueleto-linea" />
                <div className="t-esqueleto-linea" />
              </div>
            ))}
          </div>
        </div>
      )}
      <span className="t-solo-lector" role="status">
        {cargando ? "Cargando más prendas…" : ""}
      </span>
      <Link
        className="t-btn t-btn-sec t-mas-boton"
        href={href}
        replace
        scroll={false}
        onClick={(e) => {
          e.preventDefault();
          pedirTanda(pedida, href, iniciar, (h) => router.replace(h, { scroll: false }));
        }}
        aria-disabled={cargando || undefined}
      >
        {cargando ? "Cargando…" : `Ver ${cuantasMas} más`}
        <small className="num">{quedan === cuantasMas ? "las últimas" : `quedan ${quedan}`}</small>
      </Link>
    </div>
  );
}

/** Pide la tanda de `href` una sola vez, dentro de una transición (mientras llega, `cargando`). */
function pedirTanda(pedida: RefObject<string | null>, href: string, iniciar: TransitionStartFunction, ir: (href: string) => void) {
  if (pedida.current === href) return;
  pedida.current = href;
  iniciar(() => ir(href));
}

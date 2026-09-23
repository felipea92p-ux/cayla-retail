"use client";

import { numerosDePagina } from "@/lib/paginacion";

/** Paginación de una lista que la pantalla ya tiene entera en memoria (ej. Existencias: las tarjetas,
 *  los filtros y el CSV necesitan todas las filas, pero la tabla solo pinta una página). Mismo dibujo
 *  que `PaginacionPaginas` (`components/Paginacion.tsx`), pero con botones: cambiar de página no va a
 *  la base ni cambia la URL. Si hay una sola página no se dibuja nada. */
export function PaginacionLocal({
  pagina,
  totalPaginas,
  onPagina,
}: {
  pagina: number;
  totalPaginas: number;
  onPagina: (pagina: number) => void;
}) {
  if (totalPaginas <= 1) return null;

  const flecha = (destino: number, deshabilitada: boolean, texto: string, etiqueta: string) => (
    <button
      type="button"
      onClick={() => onPagina(destino)}
      disabled={deshabilitada}
      aria-label={etiqueta}
      className={`label-cayla px-1.5 py-1 text-[11px] ${deshabilitada ? "text-tinta/30" : "hover:text-rojo"}`}
    >
      {texto}
    </button>
  );

  return (
    <nav className="flex items-center gap-1" aria-label="Paginación">
      {flecha(pagina - 1, pagina === 1, "‹", "Página anterior")}
      {numerosDePagina(totalPaginas, pagina).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-tinta/40">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPagina(n)}
            aria-current={n === pagina ? "page" : undefined}
            className={`label-cayla min-w-[1.5rem] rounded-md px-1.5 py-1 text-center text-[11px] ${
              n === pagina ? "bg-tinta text-crema" : "text-tinta/75 hover:text-rojo"
            }`}
          >
            {n}
          </button>
        )
      )}
      {flecha(pagina + 1, pagina === totalPaginas, "›", "Página siguiente")}
    </nav>
  );
}

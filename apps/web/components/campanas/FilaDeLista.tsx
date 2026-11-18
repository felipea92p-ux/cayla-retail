import type { CSSProperties, ReactNode } from "react";

/**
 * Una fila de la lista de Campañas y ofertas (ADR-0677, Felipe 2026-11-17, cara A de `docs/maquetas/campanas-simple-2026-11/`): el descuento y,
 * desde la actividad 6, la campaña son la MISMA fila. A la izquierda su lente con el ícono, al centro qué es y a la derecha cuánto abarca;
 * tocarla la abre, y la abierta queda en el ahumado (`aria-current`). La ficha con cada medida: `docs/milimetro/fila-de-lista-campanas.md`.
 * Su cara vive en `app/estilos/campanas-lista.css` (vidrio claro, sin desenfoque: la lista se desplaza, ADR-0623).
 */
export function FilaDeLista({
  icono,
  sobre,
  titulo,
  bajada,
  cifra,
  cifraTexto,
  abierta,
  onAbrir,
  indice,
  etiqueta,
  guia,
}: {
  /** El ícono de lucide de la lente (20 px; lo pone la clase). */
  icono: ReactNode;
  /** La versalita de arriba («Descuento»). */
  sobre?: string;
  /** Lo que es («−10 %»), en la serif grande. */
  titulo: string;
  /** Una línea debajo («Todas las tiendas»). */
  bajada?: string | null;
  /** La cifra de la derecha (cuántas prendas) y su palabra. */
  cifra?: number | null;
  cifraTexto?: string;
  abierta: boolean;
  onAbrir: () => void;
  /** Su lugar en la lista: la cascada de entrada (con tope, en el CSS). */
  indice: number;
  /** Lo que oye el lector de pantalla, si el texto visible no alcanza a decirlo entero. */
  etiqueta?: string;
  /** El ancla de la guía interactiva (ADR-0389). */
  guia?: string;
}) {
  return (
    <button
      type="button"
      className="lc-fila"
      aria-current={abierta ? "true" : undefined}
      aria-label={etiqueta}
      onClick={onAbrir}
      data-guia={guia}
      style={{ "--i": indice } as CSSProperties}
    >
      <span className="lc-fila-lente" aria-hidden>
        {icono}
      </span>
      <span className="min-w-0">
        {sobre && <span className="lc-fila-sobre">{sobre}</span>}
        <span className="lc-fila-pct">{titulo}</span>
        {bajada && <span className="lc-fila-bajada">{bajada}</span>}
      </span>
      {cifra !== null && cifra !== undefined && (
        <span className="lc-fila-der">
          <b>{cifra}</b>
          {cifraTexto && <span>{cifraTexto}</span>}
        </span>
      )}
    </button>
  );
}

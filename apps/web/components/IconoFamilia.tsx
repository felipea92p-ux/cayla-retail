import type { ReactNode } from "react";
import type { Familia } from "@cayla-retail/shared";

/**
 * Un solo trazo por familia, mismo lenguaje que `IconoPercha` en
 * `ProductosGrilla.tsx` (stroke, sin relleno, esquinas redondas). El ícono no
 * lleva color propio: hereda `currentColor` de quien lo pinta. (El tono por
 * familia de la pantalla de Categorías lo pone el banner de su tarjeta, no este
 * dibujo — `lib/categoria-tonos.ts`.)
 *
 * Es también el ícono de reserva de una categoría sin dibujo propio
 * (`IconoCategoria`): por eso las formas viven en `formasDeFamilia`, para que el
 * banner de la tarjeta las pinte con su propio trazo sin repetirlas.
 */
export function IconoFamilia({ familia, className = "h-6 w-6" }: { familia: Familia | null; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {formasDeFamilia(familia)}
    </svg>
  );
}

/** Las formas del ícono de una familia, en la cuadrícula 24×24 y sin el `<svg>` que las envuelve. */
export function formasDeFamilia(familia: Familia | null): ReactNode {
  switch (familia) {
    case "indumentaria":
      return (
        <>
          <path d="M12 3.5a1.75 1.75 0 1 1 1.75 1.75" />
          <path d="M12 5.25V7" />
          <path d="M4 12.5 12 7l8 5.5" />
          <path d="M4 12.5 2.5 18a1 1 0 0 0 1.3 1.25L7 18v2.5h10V18l3.2 1.25A1 1 0 0 0 21.5 18L20 12.5" />
        </>
      );
    case "calzado":
      return (
        <>
          <path d="M3 15.5c0-2 1.3-3 2.6-3.8C7.5 10.5 8.5 9 9 7c.3 1.4 1.3 2.3 2.6 2.7 2 .6 3.2 1.3 4.4 2.6.9 1 2.3 1.4 3.5 1.4.9 0 1.5.7 1.5 1.5v1.3c0 .8-.7 1.5-1.5 1.5H4.5C3.7 18 3 17.3 3 16.5z" />
          <path d="M9 7c-.6 1.6-.4 3 .6 4" />
        </>
      );
    case "accesorios":
      // Un bolso con solapa y broche. El anterior (asa alta y angosta sobre un cuerpo casi rectangular) a 16 px se
      // leía como un CANDADO — en una pantalla que bloquea y desactiva, eso dice «bloqueada». Lo que lo aleja del
      // candado: cuerpo más ancho abajo que arriba, asa baja y ancha, y la solapa en V con su broche.
      return (
        <>
          <path d="M8.5 9.5C8.5 6.5 10 5 12 5s3.5 1.5 3.5 4.5" />
          <path d="M6 9.5h12l2 9.5a1 1 0 0 1-1 1.2H5a1 1 0 0 1-1-1.2z" />
          <path d="M6 9.5l6 4.5 6-4.5" />
          <circle cx="12" cy="15.3" r="0.9" />
        </>
      );
    case "bisuteria":
      return (
        <>
          <path d="M8.5 4h7L19 8l-7 12L5 8z" />
          <path d="M5 8h14M8.5 4 7 8l5 12M15.5 4 17 8l-5 12" />
        </>
      );
    case "belleza":
      return (
        <>
          <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
          <path d="M6.5 6.5l2.2 2.2M15.3 15.3l2.2 2.2M17.5 6.5l-2.2 2.2M8.7 15.3l-2.2 2.2" />
        </>
      );
    case "papeleria":
      return (
        <>
          <path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
          <path d="M15 3.5V6a.5.5 0 0 0 .5.5H18" />
          <path d="M9 12h6M9 15.5h6" />
        </>
      );
    case "empaque":
      // La caja con su cinta. La familia la creó un Líder desde Familias (2026-10); sin este caso, sus categorías sin dibujo
      // propio caían al círculo de reserva.
      return (
        <>
          <path d="M12 3 20 7v10l-8 4-8-4V7z" />
          <path d="M4 7l8 4 8-4" />
          <path d="M12 11v10" />
          <path d="M8 5l8 4" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="8.5" />;
  }
}

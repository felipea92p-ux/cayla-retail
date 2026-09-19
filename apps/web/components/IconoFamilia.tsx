import type { Familia } from "@cayla-retail/shared";

/**
 * Un solo trazo por familia, mismo lenguaje que `IconoPercha` en
 * `ProductosGrilla.tsx` (stroke, sin relleno, esquinas redondas) — nunca
 * color por familia: el brandbook reserva el color para estado (verde/ámbar/
 * rojo), no para categorizar, así que las 6 familias se distinguen por
 * forma, no por una paleta arcoíris.
 */
export function IconoFamilia({ familia, className = "h-6 w-6" }: { familia: Familia | null; className?: string }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
  };
  switch (familia) {
    case "indumentaria":
      return (
        <svg {...props}>
          <path d="M12 3.5a1.75 1.75 0 1 1 1.75 1.75" />
          <path d="M12 5.25V7" />
          <path d="M4 12.5 12 7l8 5.5" />
          <path d="M4 12.5 2.5 18a1 1 0 0 0 1.3 1.25L7 18v2.5h10V18l3.2 1.25A1 1 0 0 0 21.5 18L20 12.5" />
        </svg>
      );
    case "calzado":
      return (
        <svg {...props}>
          <path d="M3 15.5c0-2 1.3-3 2.6-3.8C7.5 10.5 8.5 9 9 7c.3 1.4 1.3 2.3 2.6 2.7 2 .6 3.2 1.3 4.4 2.6.9 1 2.3 1.4 3.5 1.4.9 0 1.5.7 1.5 1.5v1.3c0 .8-.7 1.5-1.5 1.5H4.5C3.7 18 3 17.3 3 16.5z" />
          <path d="M9 7c-.6 1.6-.4 3 .6 4" />
        </svg>
      );
    case "accesorios":
      return (
        <svg {...props}>
          <path d="M8 8V6.5a4 4 0 0 1 8 0V8" />
          <path d="M5.5 8h13l.9 11a1.5 1.5 0 0 1-1.5 1.6H6.1A1.5 1.5 0 0 1 4.6 19z" />
        </svg>
      );
    case "bisuteria":
      return (
        <svg {...props}>
          <path d="M8.5 4h7L19 8l-7 12L5 8z" />
          <path d="M5 8h14M8.5 4 7 8l5 12M15.5 4 17 8l-5 12" />
        </svg>
      );
    case "belleza":
      return (
        <svg {...props}>
          <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
          <path d="M6.5 6.5l2.2 2.2M15.3 15.3l2.2 2.2M17.5 6.5l-2.2 2.2M8.7 15.3l-2.2 2.2" />
        </svg>
      );
    case "papeleria":
      return (
        <svg {...props}>
          <path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
          <path d="M15 3.5V6a.5.5 0 0 0 .5.5H18" />
          <path d="M9 12h6M9 15.5h6" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      );
  }
}

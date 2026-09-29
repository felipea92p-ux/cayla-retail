import type { ReactElement } from "react";
import type { IconoEtiqueta } from "@/lib/etiqueta-visual";
import type { IconoDePapel } from "@/lib/etiqueta-precio-reglas";

/**
 * El ícono de una etiqueta comercial (Nuevo, Black Friday, Para liquidar…) tal como sale en el papel de la etiqueta de
 * precio (ADR-0180, «Actualización 2026-09-29»).
 *
 * POR QUÉ NO SE REUSAN LOS DE `MuestraEtiqueta`: esos son de pantalla —tintes, transparencias, crema, trazos de 1 unidad
 * que a 28 px se ven bien—. La Brother imprime SOLO negro y blanco, a 300 dpi, y el ícono mide 3,4 mm: una transparencia
 * sale como una trama de puntos, un trazo fino se corta. Por eso estos son otros dibujos de la misma idea, con las reglas de
 * la etiqueta (`globals.css`, «Etiqueta de precio»):
 *   · solo `#000` y `#fff` —los huecos blancos van en `#fff` explícito, nunca «transparente»—;
 *   · trazo mínimo de 1,8 unidades = 0,20 mm a 3,4 mm de lado (el mínimo de la Brother es 0,2 mm) y separación entre piezas de 2 = 0,23 mm;
 *   · sin detalles que un punto de la térmica no pueda sostener (nada de líneas punteadas ni de meridianos tenues).
 * Cada ícono se dibuja centrado en (0,0) dentro de ±14 unidades, la misma cuadrícula que los de pantalla; el `viewBox` deja
 * 1 unidad de aire. El vocabulario (`IconoEtiqueta`) y qué nombre lleva a qué dibujo son los de `lib/etiqueta-visual.ts`.
 */

const K = "#000";
const B = "#fff";

const CORAZON = "M0 11 C-15 1 -12 -10 -5.5 -10 C-2.5 -10 0 -8 0 -5.5 C0 -8 2.5 -10 5.5 -10 C12 -10 15 1 0 11 Z";

const DIBUJOS: Record<IconoEtiqueta | "generico", ReactElement> = {
  // Destello de cuatro puntas + uno chico.
  nuevo: (
    <>
      <path d="M0 -13 Q2.4 -2.4 13 0 Q2.4 2.4 0 13 Q-2.4 2.4 -13 0 Q-2.4 -2.4 0 -13 Z" fill={K} />
      <path d="M10 -14 Q10.8 -11.4 13.4 -10.6 Q10.8 -9.8 10 -7.2 Q9.2 -9.8 6.6 -10.6 Q9.2 -11.4 10 -14 Z" fill={K} />
    </>
  ),

  // Reloj de arena con la arena ya abajo: quedan pocas.
  ultimas: (
    <>
      <path d="M-8 -12.5 H8 M-8 12.5 H8" stroke={K} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <path d="M-6 -12 C-6 -3 0 -2 0 0 C0 2 -6 3 -6 12 M6 -12 C6 -3 0 -2 0 0 C0 2 6 3 6 12" stroke={K} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M-4.5 11 L0 4.5 L4.5 11 Z" fill={K} />
    </>
  ),

  // Podio con estrella arriba: lo más vendido.
  top: (
    <>
      <rect x={-3.6} y={0} width={7.2} height={12} fill={K} />
      <rect x={-13.5} y={5} width={7.9} height={7} fill={K} />
      <rect x={5.6} y={7.5} width={7.9} height={4.5} fill={K} />
      <path d="M0 -14 Q1 -9.4 5.6 -8.4 Q1 -7.4 0 -2.6 Q-1 -7.4 -5.6 -8.4 Q-1 -9.4 0 -14 Z" fill={K} />
    </>
  ),

  // Etiqueta de precio con el símbolo de porcentaje.
  liquidar: (
    <>
      <path d="M-10.5 -12.5 H4.5 L12.5 -4.5 V12.5 H-10.5 Z" fill="none" stroke={K} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={-5.5} cy={-7.5} r={1.7} fill={K} />
      <circle cx={-4} cy={2.5} r={2.2} fill={K} />
      <circle cx={5} cy={8} r={2.2} fill={K} />
      <path d="M6 0.5 L-5 10" stroke={K} strokeWidth={2} strokeLinecap="round" />
    </>
  ),

  // Aguja con hilo.
  manual: (
    <>
      <path d="M-9 12 L9 -9" stroke={K} strokeWidth={2.4} strokeLinecap="round" />
      <ellipse cx={8.6} cy={-8.6} rx={1.4} ry={2.4} transform="rotate(45 8.6 -8.6)" fill={B} stroke={K} strokeWidth={1.8} />
      <path d="M8.6 -8.6 C15 -3 8 5 3 3 C-2 1 -5 6 -10 12" stroke={K} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </>
  ),

  // Gema: una sola pieza.
  unica: (
    <>
      <path d="M-12 -4 L-6 -11 H6 L12 -4 L0 12 Z" fill="none" stroke={K} strokeWidth={2} strokeLinejoin="round" />
      <path d="M-12 -4 H12 M-6 -11 L-3 -4 L0 12 M6 -11 L3 -4 L0 12" stroke={K} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
    </>
  ),

  // Dos flechas circulares: vuelve.
  reedicion: (
    <>
      <path d="M-10 0 A10 10 0 0 1 7 -7.2" stroke={K} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <path d="M10 0 A10 10 0 0 1 -7 7.2" stroke={K} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <path d="M4 -12 L10.5 -8 L3 -3.5 Z" fill={K} />
      <path d="M-4 12 L-10.5 8 L-3 3.5 Z" fill={K} />
    </>
  ),

  valentin: <path d={CORAZON} fill={K} />,

  // Dos corazones: el de atrás, en contorno; el de adelante, lleno y con un halo blanco que lo separa.
  galentine: (
    <>
      <g transform="translate(6 -3) scale(0.75)">
        <path d={CORAZON} fill="none" stroke={K} strokeWidth={2.6} strokeLinejoin="round" />
      </g>
      <g transform="translate(-4 3) scale(0.85)">
        <path d={CORAZON} fill={K} stroke={B} strokeWidth={2.4} strokeLinejoin="round" paintOrder="stroke" />
      </g>
    </>
  ),

  // Tulipán.
  madre: (
    <>
      <path d="M0 5 V13" stroke={K} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M0 12 C-7 12 -9 6.5 -9 3.5 C-4 3.5 0 6.5 0 12 Z" fill={K} />
      <path d="M-7 -3 C-7.5 -12 -3 -13 0 -11 C3 -13 7.5 -12 7 -3 C7 3 3 5.5 0 5.5 C-3 5.5 -7 3 -7 -3 Z" fill={K} />
      <path d="M-2.4 -10.4 L0 -3.5 L2.4 -10.4" stroke={B} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
    </>
  ),

  // Símbolo de Venus.
  mujer: (
    <>
      <circle cx={0} cy={-4.5} r={7} stroke={K} strokeWidth={2.4} fill="none" />
      <path d="M0 2.5 V13 M-4.5 8 H4.5" stroke={K} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),

  // Calabaza con cara.
  halloween: (
    <>
      <path d="M0 -8 C0 -10 1 -12 3 -13" stroke={K} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <ellipse cx={0} cy={2} rx={12.5} ry={9.5} fill={K} />
      <path d="M-7 0 H-3 L-5 -3.6 Z M3 0 H7 L5 -3.6 Z" fill={B} />
      <path d="M-5.5 5.5 L-3 3.5 L-1 5.5 L1 3.5 L3 5.5 L5.5 3.5" stroke={B} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),

  // Arbolito de tres pisos con estrella.
  navidad: (
    <>
      <path d="M0 -10 L-7 -1 H7 Z M0 -5 L-9 5 H9 Z M0 0 L-11 10 H11 Z" fill={K} />
      <rect x={-2} y={10} width={4} height={3.5} fill={K} />
      <path d="M0 -14.5 Q0.7 -12.6 2.6 -12 Q0.7 -11.4 0 -9.6 Q-0.7 -11.4 -2.6 -12 Q-0.7 -12.6 0 -14.5 Z" fill={K} />
    </>
  ),

  // Bandera en tres franjas: llenas a los lados, vacía al centro.
  patrias: (
    <>
      <path d="M-13 -12 V13" stroke={K} strokeWidth={1.8} strokeLinecap="round" />
      <rect x={-11} y={-11} width={7.5} height={15} fill={K} />
      <rect x={-3.5} y={-11} width={7.5} height={15} fill={B} stroke={K} strokeWidth={1.8} />
      <rect x={4} y={-11} width={7.5} height={15} fill={K} />
    </>
  ),

  // Etiqueta negra llena con cordón: Black Friday.
  blackfriday: (
    <>
      <path d="M-10 -9 H4 L12 -1 V13 H-10 Z" fill={K} />
      <circle cx={-5} cy={-4} r={1.7} fill={B} />
      <path d="M-5 -4 C-5 -12 3 -14 8 -12" stroke={K} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <path d="M-3 7 H6 M-3 10.5 H3" stroke={B} strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),

  // Rayo dentro de un aro: la oferta relámpago online.
  cyberwow: (
    <>
      <circle cx={0} cy={0} r={13} stroke={K} strokeWidth={1.8} fill="none" />
      <path d="M2.4 -9 L-5.6 1.6 H-0.8 L-2.8 8.8 L6.4 -2.4 H1.6 Z" fill={K} />
    </>
  ),

  // Pastel de dos pisos con vela.
  aniversario: (
    <>
      <rect x={-11} y={3} width={22} height={9} rx={2} fill={K} />
      <rect x={-7.5} y={-3.5} width={15} height={5.5} rx={2} fill={K} />
      <rect x={-1} y={-10.5} width={2} height={6} fill={K} />
      <path d="M0 -15 Q2.6 -12.6 0 -10.4 Q-2.6 -12.6 0 -15 Z" fill={K} />
      <path d="M-11 7.5 Q-7.3 5 -3.7 7.5 T3.7 7.5 T11 7.5" stroke={B} strokeWidth={1.8} fill="none" />
    </>
  ),

  // Cabeza de gato.
  gato: (
    <>
      <path d="M-10.5 -1 L-10.5 -12 L-3.5 -7 Q0 -8 3.5 -7 L10.5 -12 L10.5 -1 Q10.5 10.5 0 10.5 Q-10.5 10.5 -10.5 -1 Z" fill={K} />
      <circle cx={-4} cy={0} r={1.8} fill={B} />
      <circle cx={4} cy={0} r={1.8} fill={B} />
      <path d="M-1.8 3.4 H1.8 L0 5.2 Z" fill={B} />
      <path d="M-14.5 1.5 L-10 2.4 M-14.5 6 L-10 4.8 M14.5 1.5 L10 2.4 M14.5 6 L10 4.8" stroke={K} strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),

  // Huella de perro.
  perro: (
    <>
      <path d="M0 4.5 C-6.5 4.5 -10 9.5 -6.8 12.6 C-4 14.4 -1.8 12.8 0 12.8 C1.8 12.8 4 14.4 6.8 12.6 C10 9.5 6.5 4.5 0 4.5 Z" fill={K} />
      <ellipse cx={-9.6} cy={-1.4} rx={2.6} ry={3.6} transform="rotate(-18 -9.6 -1.4)" fill={K} />
      <ellipse cx={-3.6} cy={-7.6} rx={2.6} ry={3.9} transform="rotate(-6 -3.6 -7.6)" fill={K} />
      <ellipse cx={3.6} cy={-7.6} rx={2.6} ry={3.9} transform="rotate(6 3.6 -7.6)" fill={K} />
      <ellipse cx={9.6} cy={-1.4} rx={2.6} ry={3.6} transform="rotate(18 9.6 -1.4)" fill={K} />
    </>
  ),

  // Globo terráqueo en alambre: aro, meridiano y ecuador.
  tierra: (
    <>
      <circle cx={0} cy={0} r={12} stroke={K} strokeWidth={2} fill="none" />
      <ellipse cx={0} cy={0} rx={5.4} ry={12} stroke={K} strokeWidth={1.8} fill="none" />
      <path d="M-12 0 H12" stroke={K} strokeWidth={1.8} />
    </>
  ),

  // Etiqueta genérica, para un nombre que no reconocemos: sigue siendo «una etiqueta».
  generico: (
    <>
      <path d="M-10 -12 H4 L12 -4 V12 H-10 Z" fill="none" stroke={K} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={-5} cy={-7} r={1.7} fill={K} />
      <path d="M-5 3 H5 M-5 7.5 H1" stroke={K} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
};

/** Un ícono de etiqueta en el papel. El tamaño lo pone `.etq-icono` en `globals.css` (milímetros: es papel, no pantalla).
 *  `decorativo`: va al lado de su propia palabra, así que el lector de pantalla no lo repite. */
export function IconoEtiquetaPapel({ icono, nombre, decorativo = false }: Pick<IconoDePapel, "icono" | "nombre"> & { decorativo?: boolean }) {
  return (
    <svg className="etq-icono" viewBox="-15 -15 30 30" {...(decorativo ? { "aria-hidden": true } : { role: "img", "aria-label": nombre })}>
      {!decorativo && <title>{nombre}</title>}
      {DIBUJOS[icono]}
    </svg>
  );
}

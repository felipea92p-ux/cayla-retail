import type { ReactElement } from "react";
import { iconoDeEtiqueta, type IconoEtiqueta } from "@/lib/etiqueta-visual";

/**
 * La imagen de una etiqueta comercial en la grilla de Atributos → Etiquetas.
 * Un ícono simple por concepto (corazón para San Valentín, gato para el Día
 * del Gato, reloj de arena para Últimas unidades…) para que se reconozca de
 * un vistazo en vez de leer 21 nombres. El equivalente de `MuestraPatron` para
 * patrones.
 *
 * REGLA DE COLOR: nada de rojo. El rojo es el acento sagrado de la marca (máx.
 * 2 usos por pantalla) y esta grilla tiene 21 tarjetas; ver el encabezado de
 * `EtiquetasLista.tsx`. Cada dibujo usa el tono semántico de su grupo — ámbar
 * (rotación), verde (artesanal), taupe (campaña) — sobre un tinte suave del
 * mismo tono, y las flores/corazones/banderas se resuelven con ese tono, no
 * con su color "natural". Sin gradientes ni sombras (brandbook v3.0).
 */

export type Estilo = "neutral" | "urgencia" | "positivo" | "campana";

const TINTA = "#1A1A18";
const CREMA = "#F5F0E8";

// `fondo` = el tono del grupo diluido ~14% sobre crema. `acento` = el tono
// pleno (ámbar / verde / taupe-profundo de globals.css).
export const TONOS: Record<Estilo, { fondo: string; acento: string }> = {
  urgencia: { fondo: "#E6DCCC", acento: "#8C631F" },
  positivo: { fondo: "#DFDED2", acento: "#556E49" },
  campana: { fondo: "#E5DBD2", acento: "#805C4C" },
  neutral: { fondo: "#EFE8DA", acento: TINTA },
};

const ANCHO = 180; // 3:1, como las muestras de Patrones y Tejidos
const ALTO = 60;

// Cada ícono se dibuja centrado en (0,0) dentro de ±14 unidades. `a` es el
// color de acento del grupo.
const ICONOS: Record<IconoEtiqueta | "generico", (a: string) => ReactElement> = {
  // Destello de cuatro puntas + uno chico.
  nuevo: (a) => (
    <>
      <path d="M0 -13 Q1.6 -1.6 13 0 Q1.6 1.6 0 13 Q-1.6 1.6 -13 0 Q-1.6 -1.6 0 -13 Z" fill={a} />
      <path d="M10 -12 Q10.6 -10.6 12 -10 Q10.6 -9.4 10 -8 Q9.4 -9.4 8 -10 Q9.4 -10.6 10 -12 Z" fill={a} />
    </>
  ),

  // Reloj de arena con la arena ya abajo: quedan pocas.
  ultimas: (a) => (
    <>
      <path d="M-8 -12 H8 M-8 12 H8" stroke={a} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M-5.5 -12 C-5.5 -3 0 -1.5 0 0 C0 1.5 -5.5 3 -5.5 12 M5.5 -12 C5.5 -3 0 -1.5 0 0 C0 1.5 5.5 3 5.5 12" stroke={a} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <path d="M-4.2 11 L0 5 L4.2 11 Z" fill={a} />
    </>
  ),

  // Podio con estrella arriba: lo más vendido.
  top: (a) => (
    <>
      <rect x={-4.5} y={-3} width={9} height={15} rx={1} fill={a} />
      <rect x={-13.5} y={3} width={9} height={9} rx={1} fill={a} opacity={0.55} />
      <rect x={4.5} y={6} width={9} height={6} rx={1} fill={a} opacity={0.55} />
      <path d="M0 -13 Q0.8 -9.2 4.6 -8.4 Q0.8 -7.6 0 -3.8 Q-0.8 -7.6 -4.6 -8.4 Q-0.8 -9.2 0 -13 Z" fill={a} />
    </>
  ),

  // Etiqueta de precio con símbolo de porcentaje.
  liquidar: (a) => (
    <>
      <path d="M-10 -12 H4 L12 -4 V12 H-10 Z" fill={a} opacity={0.14} stroke={a} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={-5} cy={-7} r={1.5} fill={a} />
      <circle cx={-4.5} cy={3} r={2} stroke={a} strokeWidth={1.6} fill="none" />
      <circle cx={4.5} cy={8} r={2} stroke={a} strokeWidth={1.6} fill="none" />
      <path d="M5.5 1 L-5.5 10" stroke={a} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),

  // Aguja con hilo.
  manual: (a) => (
    <>
      <path d="M-8 11 L9 -8" stroke={a} strokeWidth={2} strokeLinecap="round" />
      <ellipse cx={8.6} cy={-8.6} rx={1.3} ry={2.2} transform="rotate(45 8.6 -8.6)" fill={CREMA} stroke={a} strokeWidth={1.2} />
      <path d="M8.6 -8.6 C15 -3 8 5 3 3 C-2 1 -5 6 -10 12" stroke={a} strokeWidth={1.4} strokeLinecap="round" fill="none" strokeDasharray="0.1 3" />
    </>
  ),

  // Gema: una sola pieza.
  unica: (a) => (
    <>
      <path d="M-12 -4 L-6 -11 H6 L12 -4 L0 12 Z" fill={a} opacity={0.18} stroke={a} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M-12 -4 H12 M-6 -11 L-3 -4 L0 12 M6 -11 L3 -4 L0 12" stroke={a} strokeWidth={1.4} strokeLinejoin="round" fill="none" />
    </>
  ),

  // Dos flechas circulares: vuelve.
  reedicion: (a) => (
    <>
      <path d="M-10 0 A10 10 0 0 1 7 -7.2" stroke={a} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M10 0 A10 10 0 0 1 -7 7.2" stroke={a} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M4 -12 L10.5 -8 L3 -3.5 Z" fill={a} />
      <path d="M-4 12 L-10.5 8 L-3 3.5 Z" fill={a} />
    </>
  ),

  valentin: (a) => <path d="M0 11 C-15 1 -12 -10 -5.5 -10 C-2.5 -10 0 -8 0 -5.5 C0 -8 2.5 -10 5.5 -10 C12 -10 15 1 0 11 Z" fill={a} />,

  // Dos corazones, uno detrás del otro: las amigas.
  galentine: (a) => (
    <>
      <g transform="translate(6 -3) scale(0.7)">
        <path d="M0 11 C-15 1 -12 -10 -5.5 -10 C-2.5 -10 0 -8 0 -5.5 C0 -8 2.5 -10 5.5 -10 C12 -10 15 1 0 11 Z" fill={a} opacity={0.5} />
      </g>
      <g transform="translate(-4 3) scale(0.85)">
        <path d="M0 11 C-15 1 -12 -10 -5.5 -10 C-2.5 -10 0 -8 0 -5.5 C0 -8 2.5 -10 5.5 -10 C12 -10 15 1 0 11 Z" fill={a} />
      </g>
    </>
  ),

  // Tulipán.
  madre: (a) => (
    <>
      <path d="M0 5 V13" stroke={a} strokeWidth={2} strokeLinecap="round" />
      <path d="M0 11 C-7 11 -9 6 -9 3 C-4 3 0 6 0 11 Z" fill={a} opacity={0.5} />
      <path d="M-7 -3 C-7.5 -12 -3 -13 0 -11 C3 -13 7.5 -12 7 -3 C7 3 3 5.5 0 5.5 C-3 5.5 -7 3 -7 -3 Z" fill={a} />
      <path d="M-2.4 -10.4 L0 -3.5 L2.4 -10.4" stroke={CREMA} strokeWidth={1.2} strokeLinejoin="round" fill="none" opacity={0.85} />
    </>
  ),

  // Símbolo de Venus.
  mujer: (a) => (
    <>
      <circle cx={0} cy={-4.5} r={7} stroke={a} strokeWidth={2.2} fill="none" />
      <path d="M0 2.5 V13 M-4.5 8 H4.5" stroke={a} strokeWidth={2.2} strokeLinecap="round" />
    </>
  ),

  // Calabaza con cara.
  halloween: (a) => (
    <>
      <path d="M0 -8 C0 -10 1 -12 3 -13" stroke={a} strokeWidth={2} strokeLinecap="round" fill="none" />
      <ellipse cx={0} cy={2} rx={12.5} ry={9.5} fill={a} />
      <path d="M-4.5 -6.5 C-8.5 -1 -8.5 5 -4.5 10 M4.5 -6.5 C8.5 -1 8.5 5 4.5 10" stroke={CREMA} strokeWidth={1} opacity={0.4} fill="none" />
      <path d="M-7 0 H-3 L-5 -3.4 Z M3 0 H7 L5 -3.4 Z" fill={CREMA} />
      <path d="M-5.5 5.5 L-3 3.5 L-1 5.5 L1 3.5 L3 5.5 L5.5 3.5" stroke={CREMA} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),

  // Arbolito de tres pisos con estrella.
  navidad: (a) => (
    <>
      <path d="M0 -10 L-7 -1 H7 Z M0 -5 L-9 5 H9 Z M0 0 L-11 10 H11 Z" fill={a} />
      <rect x={-2} y={10} width={4} height={3.5} fill={a} opacity={0.6} />
      <path d="M0 -14 Q0.6 -12.4 2.2 -12 Q0.6 -11.6 0 -10 Q-0.6 -11.6 -2.2 -12 Q-0.6 -12.4 0 -14 Z" fill={a} />
    </>
  ),

  // Bandera en tres franjas verticales. Sin rojo: franjas del acento del
  // grupo y crema al centro (ver REGLA DE COLOR arriba).
  patrias: (a) => (
    <>
      <path d="M-13 -12 V13" stroke={a} strokeWidth={1.8} strokeLinecap="round" />
      <rect x={-11} y={-11} width={7.5} height={15} fill={a} />
      <rect x={-3.5} y={-11} width={7.5} height={15} fill={CREMA} stroke={a} strokeWidth={1} />
      <rect x={4} y={-11} width={7.5} height={15} fill={a} />
    </>
  ),

  // Etiqueta negra llena con cordón: Black Friday.
  blackfriday: () => (
    <>
      <path d="M-10 -9 H4 L12 -1 V13 H-10 Z" fill={TINTA} />
      <circle cx={-5} cy={-4} r={1.6} fill={CREMA} />
      <path d="M-5 -4 C-5 -12 3 -14 8 -12" stroke={TINTA} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <path d="M-3 7 H6 M-3 10 H3" stroke={CREMA} strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
    </>
  ),

  // Rayo dentro de un aro: la oferta relámpago online.
  cyberwow: (a) => (
    <>
      <circle cx={0} cy={0} r={12.5} stroke={a} strokeWidth={1.4} opacity={0.4} fill="none" />
      <path d="M3 -11 L-7 2 H-1 L-3.5 11 L8 -3 H2 Z" fill={a} />
    </>
  ),

  // Pastel de dos pisos con vela.
  aniversario: (a) => (
    <>
      <rect x={-11} y={2} width={22} height={9} rx={2} fill={a} />
      <rect x={-7.5} y={-4} width={15} height={6.5} rx={2} fill={a} opacity={0.6} />
      <rect x={-1} y={-11} width={2} height={7} fill={a} />
      <path d="M0 -15 Q2.4 -12.6 0 -10.6 Q-2.4 -12.6 0 -15 Z" fill={a} />
      <path d="M-11 6.5 Q-7.3 4 -3.7 6.5 T3.7 6.5 T11 6.5" stroke={CREMA} strokeWidth={1.2} fill="none" opacity={0.7} />
    </>
  ),

  // Cabeza de gato.
  gato: (a) => (
    <>
      <path d="M-10.5 -1 L-10.5 -12 L-3.5 -7 Q0 -8 3.5 -7 L10.5 -12 L10.5 -1 Q10.5 10.5 0 10.5 Q-10.5 10.5 -10.5 -1 Z" fill={a} />
      <circle cx={-4} cy={0} r={1.5} fill={CREMA} />
      <circle cx={4} cy={0} r={1.5} fill={CREMA} />
      <path d="M-1.6 3 H1.6 L0 4.8 Z" fill={CREMA} />
      <path d="M-15 1.5 L-9.5 2.6 M-15 5.5 L-9.5 4.6 M15 1.5 L9.5 2.6 M15 5.5 L9.5 4.6" stroke={a} strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),

  // Huella de perro.
  perro: (a) => (
    <>
      <path d="M0 2.5 C-6.5 2.5 -10 8 -6.8 11.5 C-4 13.6 -1.8 11.6 0 11.6 C1.8 11.6 4 13.6 6.8 11.5 C10 8 6.5 2.5 0 2.5 Z" fill={a} />
      <ellipse cx={-9.4} cy={-1.6} rx={2.6} ry={3.7} transform="rotate(-18 -9.4 -1.6)" fill={a} />
      <ellipse cx={-3.6} cy={-7.6} rx={2.6} ry={3.9} transform="rotate(-6 -3.6 -7.6)" fill={a} />
      <ellipse cx={3.6} cy={-7.6} rx={2.6} ry={3.9} transform="rotate(6 3.6 -7.6)" fill={a} />
      <ellipse cx={9.4} cy={-1.6} rx={2.6} ry={3.7} transform="rotate(18 9.4 -1.6)" fill={a} />
    </>
  ),

  // Globo terráqueo: aro, meridiano y ecuador (para que no parezca una galleta)
  // y tres continentes.
  tierra: (a) => (
    <>
      <circle cx={0} cy={0} r={12} fill={a} opacity={0.14} />
      <circle cx={0} cy={0} r={12} stroke={a} strokeWidth={1.8} fill="none" />
      <ellipse cx={0} cy={0} rx={5.2} ry={12} stroke={a} strokeWidth={0.9} fill="none" opacity={0.45} />
      <path d="M-12 0 H12" stroke={a} strokeWidth={0.9} opacity={0.45} />
      <path d="M-7.5 -6.5 C-4.5 -10 1 -9 -0.5 -5 C-2.5 -2.8 -7.8 -3 -7.5 -6.5 Z" fill={a} />
      <path d="M2.5 2 C7 0.5 10 4 7.5 8 C4.5 9.8 1 7.5 2.5 2 Z" fill={a} />
      <path d="M-9 2.5 C-6.5 1.5 -4.5 4 -6.5 7.5 C-8.8 6.8 -9.8 5 -9 2.5 Z" fill={a} />
    </>
  ),

  // Etiqueta genérica en contorno, para nombres que no reconocemos: una
  // etiqueta es siempre "una etiqueta", así que esto no es un dibujo falso.
  generico: (a) => (
    <>
      <path d="M-10 -12 H4 L12 -4 V12 H-10 Z" fill={a} opacity={0.12} stroke={a} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={-5} cy={-7} r={1.6} fill={a} />
      <path d="M-5 3 H5 M-5 7 H1" stroke={a} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
    </>
  ),
};

/**
 * `group/etq` lo pone la tarjeta que la contiene: al pasarle el mouse por
 * encima el dibujo principal se asienta un poco y los ecos se abren hacia los
 * lados. Es el mismo gesto de "acuse de recibo" del sistema (`alza-cayla`) y
 * responde a una acción de la persona, nunca corre solo. Los grupos exteriores
 * llevan el `transform` fijo de cada dibujo; el movimiento va en el interior
 * para que un CSS no pise al atributo SVG.
 */
export const MOV = "transition-transform duration-500 ease-cayla [transform-box:fill-box] origin-center";

export function MuestraEtiqueta({
  nombre,
  estilo,
  className = "aspect-[3/1] w-full",
}: {
  nombre: string;
  estilo: Estilo;
  className?: string;
}) {
  const icono = iconoDeEtiqueta(nombre) ?? "generico";
  const { fondo, acento } = TONOS[estilo];
  const dibujo = ICONOS[icono];

  return (
    <div className={`${className} overflow-hidden rounded-lg`} style={{ backgroundColor: fondo }} role="img" aria-label={`Ilustración de la etiqueta ${nombre}`}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        {/* Ecos tenues a los lados: llenan el ancho sin competir con el ícono. */}
        <g transform="translate(34 38) rotate(-14) scale(0.85)" opacity={0.18}>
          <g className={`${MOV} group-hover/etq:-translate-x-1.5`}>{dibujo(acento)}</g>
        </g>
        <g transform="translate(146 22) rotate(12) scale(0.85)" opacity={0.18}>
          <g className={`${MOV} group-hover/etq:translate-x-1.5`}>{dibujo(acento)}</g>
        </g>
        <g transform="translate(90 30) scale(1.6)">
          <g className={`${MOV} group-hover/etq:-translate-y-0.5 group-hover/etq:scale-[1.06]`}>{dibujo(acento)}</g>
        </g>
      </svg>
    </div>
  );
}

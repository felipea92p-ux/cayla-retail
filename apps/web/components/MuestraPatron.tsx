import type { ReactElement } from "react";
import { familiaDePatron, type FamiliaPatron } from "@/lib/patron-visual";

/**
 * La "muestra" de un patrón — el equivalente a la muestra de color de
 * ColoresLista. Es un dibujo de respaldo por familia (rayas, cuadros,
 * lunares…) para que quien elige o revisa un patrón lo VEA en vez de leer
 * solo una palabra. Cuando exista foto real por patrón, esta pieza pasa a
 * ser el respaldo de "no hay foto", igual que el hex en Colores.
 *
 * Paleta del brandbook v3.0: Tinta #1A1A18, Rojo #B8412D, Crema. Sin
 * gradientes ni sombras (el brandbook los prohíbe).
 */

const TINTA = "#1A1A18";
const ROJO = "#B8412D";
const CREMA = "#EFE8DA";
const ARENA = "#D9CFBC";
const CAMELLO = "#D8BE96";

const ANCHO = 120;
const ALTO = 40;

function rango(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

type Dibujo = { fondo: string; formas: ReactElement };

const DIBUJOS: Record<FamiliaPatron, () => Dibujo> = {
  // Un solo color, sin nada encima: el "no hay dibujo" es justamente el dibujo.
  liso: () => ({ fondo: ARENA, formas: <></> }),

  rayas: () => ({
    fondo: CREMA,
    formas: (
      <>
        {rango(11).map((i) => (
          <rect key={i} x={i * 12 + 3} y={0} width={5} height={ALTO} fill={TINTA} opacity={0.85} />
        ))}
      </>
    ),
  }),

  // Cuadro vichy: bandas verticales y horizontales translúcidas; donde se
  // cruzan se oscurecen solas, que es como se ve la tela de verdad.
  cuadros: () => ({
    fondo: CREMA,
    formas: (
      <>
        {rango(6).map((i) => (
          <rect key={`v${i}`} x={i * 24} y={0} width={12} height={ALTO} fill={TINTA} opacity={0.28} />
        ))}
        {rango(3).map((i) => (
          <rect key={`h${i}`} x={0} y={i * 24 - 6} width={ANCHO} height={12} fill={TINTA} opacity={0.28} />
        ))}
      </>
    ),
  }),

  lunares: () => ({
    fondo: CREMA,
    formas: (
      <>
        {rango(3).flatMap((fila) =>
          rango(8).map((col) => (
            <circle key={`${fila}-${col}`} cx={col * 16 + (fila % 2 ? 16 : 8)} cy={fila * 14 + 6} r={3.4} fill={TINTA} opacity={0.9} />
          ))
        )}
      </>
    ),
  }),

  floral: () => ({
    fondo: CREMA,
    formas: (
      <>
        {[
          [16, 12],
          [56, 27],
          [96, 12],
          [116, 30],
        ].map(([cx, cy], i) => (
          <g key={i} transform={`translate(${cx} ${cy})`}>
            {rango(5).map((p) => (
              <ellipse key={p} cx={0} cy={-5.5} rx={3.2} ry={4.6} fill={ROJO} opacity={0.9} transform={`rotate(${p * 72})`} />
            ))}
            <circle r={2.2} fill={TINTA} />
          </g>
        ))}
        {[
          [36, 16, 30],
          [78, 22, -30],
          [20, 32, -20],
          [104, 22, 25],
        ].map(([cx, cy, giro], i) => (
          <ellipse key={`h${i}`} cx={cx} cy={cy} rx={2.4} ry={5.5} fill={TINTA} opacity={0.35} transform={`rotate(${giro} ${cx} ${cy})`} />
        ))}
      </>
    ),
  }),

  // Manchas de leopardo: una medialuna oscura (elipse tinta con otra del
  // color del fondo encima, corrida) más motas sueltas, en ángulos distintos
  // para que no parezca una grilla.
  animal: () => ({
    fondo: CAMELLO,
    formas: (
      <>
        {[
          [14, 10, -20],
          [46, 26, 35],
          [76, 10, 10],
          [106, 28, -40],
          [28, 35, 60],
          [96, 36, 25],
          [62, 38, -15],
          [118, 8, 50],
        ].map(([cx, cy, giro], i) => (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${giro})`}>
            <ellipse rx={7.5} ry={5} fill={TINTA} />
            <ellipse cx={1.6} cy={0.4} rx={4.6} ry={3} fill={CAMELLO} />
            <circle cx={-10} cy={5} r={1.3} fill={TINTA} />
            <circle cx={9} cy={-6} r={1.1} fill={TINTA} />
          </g>
        ))}
      </>
    ),
  }),

  // "Estampado" es genérico (formas mezcladas, sin repetir): círculo rojo,
  // trazo ondulado y triángulo, todos con la paleta de marca.
  estampado: () => ({
    fondo: CREMA,
    formas: (
      <>
        <circle cx={20} cy={14} r={8} fill={ROJO} opacity={0.85} />
        <path d="M40 28 q8 -12 16 0 t16 0 t16 0" fill="none" stroke={TINTA} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M86 5 l13 21 l-26 0 z" fill={TINTA} opacity={0.8} />
        <circle cx={108} cy={32} r={4.6} fill="none" stroke={ROJO} strokeWidth={2.2} />
        <rect x={6} y={29} width={12} height={7} fill={TINTA} opacity={0.35} transform="rotate(-12 12 32)" />
      </>
    ),
  }),
};

export function MuestraPatron({ nombre, className = "aspect-[3/1] w-full" }: { nombre: string; className?: string }) {
  const familia = familiaDePatron(nombre);

  // Un nombre nuevo que no reconocemos: se dice claro en vez de dibujar algo
  // que no es. Cuando exista foto por patrón, el Líder lo resuelve subiéndola.
  if (!familia) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-lg border border-dashed border-tinta/20 text-[10px] uppercase tracking-wider text-tinta/40`}
        aria-hidden
      >
        Sin muestra
      </div>
    );
  }

  const { fondo, formas } = DIBUJOS[familia]();
  return (
    <div className={`${className} overflow-hidden rounded-lg border border-tinta/10`} style={{ backgroundColor: fondo }} role="img" aria-label={`Muestra del patrón ${nombre}`}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        {formas}
      </svg>
    </div>
  );
}

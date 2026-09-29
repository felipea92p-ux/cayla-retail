import type { Estacion, Temporada } from "@/lib/temporada-reglas";
import { estacionesDe, tonoDeTemporada, type TonoTemporada } from "@/lib/temporadas-pantalla";
import { CREMA, MuestraIcono, TONO_PIZARRA, TONOS, type DibujoIcono } from "@/components/MuestraEtiqueta";

/**
 * La imagen de una temporada en Atributos ▸ Temporadas (ADR-0261): el mismo molde que las etiquetas (ícono grande al
 * centro, dos ecos a los lados), para que las seis pestañas se vean hechas por la misma mano. Un ícono por estación
 * —flor, sol, hoja, copo—; las de dos estaciones juntan los dos, y los clásicos van dentro de un aro (el de todo el año,
 * con un infinito: no termina nunca).
 *
 * El dibujo sale de los datos de la temporada (`estacionesDe`), no de su nombre ni de su clave: si la base agrega una
 * décima, se dibuja sola. Tono por la mitad del año en que se vende (cálido o frío); los clásicos, neutros. Sin rojo, sin
 * gradientes ni sombras, como el resto de las muestras.
 */

// El tono frío es la pizarra de `MuestraEtiqueta` (`TONO_PIZARRA`), la misma que usa Categorías.
const TONOS_TEMPORADA: Record<TonoTemporada, { fondo: string; acento: string }> = {
  calido: TONOS.urgencia,
  frio: TONO_PIZARRA,
  neutro: TONOS.neutral,
};

const f = (n: number) => Number(n.toFixed(2));
const polar = (r: number, grados: number) => [f(r * Math.cos((grados * Math.PI) / 180)), f(r * Math.sin((grados * Math.PI) / 180))];

// Los rayos del sol, calculados una vez (servidor y navegador dibujan lo mismo).
const RAYOS = Array.from({ length: 8 }, (_, i) => {
  const [x1, y1] = polar(8.6, i * 45);
  const [x2, y2] = polar(12.6, i * 45);
  return `M${x1} ${y1} L${x2} ${y2}`;
}).join(" ");

// Cada ícono se dibuja centrado en (0,0) dentro de ±14 unidades, como los de las etiquetas.
const ESTACION: Record<Estacion, DibujoIcono> = {
  // Flor de cinco pétalos con el centro claro.
  primavera: (a) => (
    <>
      {[0, 72, 144, 216, 288].map((g) => (
        <ellipse key={g} cx={0} cy={-6.4} rx={3.9} ry={5.9} transform={`rotate(${g})`} fill={a} />
      ))}
      <circle cx={0} cy={0} r={3.3} fill={CREMA} />
      <circle cx={0} cy={0} r={1.6} fill={a} />
    </>
  ),

  // Sol: disco y ocho rayos.
  verano: (a) => (
    <>
      <circle cx={0} cy={0} r={5.8} fill={a} />
      <path d={RAYOS} stroke={a} strokeWidth={2} strokeLinecap="round" />
    </>
  ),

  // Hoja caída con su nervadura y el tallo.
  otono: (a) => (
    <>
      <path d="M-9.5 9.5 C-12 -3 -3 -12.5 11 -11 C12.5 3 3 12 -9.5 9.5 Z" fill={a} />
      <path d="M-9 9 L7 -7 M-3 3 L-6.5 -2 M-3 3 L2 6.5 M2 -2 L-0.5 -7 M2 -2 L7 0.5" stroke={CREMA} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M-9.5 9.5 L-13 13" stroke={a} strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),

  // Copo de nieve: seis brazos con su rama en V.
  invierno: (a) => (
    <g stroke={a} strokeWidth={1.8} strokeLinecap="round" fill="none">
      {[0, 60, 120, 180, 240, 300].map((g) => (
        <path key={g} d="M0 0 V-12.5 M0 -7.5 L-3.4 -10.8 M0 -7.5 L3.4 -10.8" transform={`rotate(${g})`} />
      ))}
    </g>
  ),
};

// El clásico de todo el año: un infinito.
const INFINITO: DibujoIcono = (a) => (
  <path d="M0 0 C-2.6 -4.4 -9 -4.4 -9 0 C-9 4.4 -2.6 4.4 0 0 C2.6 -4.4 9 -4.4 9 0 C9 4.4 2.6 4.4 0 0 Z" stroke={a} strokeWidth={2} fill="none" strokeLinejoin="round" />
);

/** El ícono de una temporada: el de su estación, los dos juntos (el segundo por delante) o, si es clásico, dentro de un aro. */
function dibujoDe(t: Pick<Temporada, "es_clasico" | "estacion_desde" | "estacion_hasta">): DibujoIcono {
  const estaciones = estacionesDe(t);
  const [primera, segunda] = estaciones;
  const base: DibujoIcono = segunda
    ? function dosEstaciones(a) {
        return (
          <>
            <g transform="translate(-7.8 -2) scale(0.66)">{ESTACION[primera](a)}</g>
            <g transform="translate(7.8 2) scale(0.66)">{ESTACION[segunda](a)}</g>
          </>
        );
      }
    : primera
      ? ESTACION[primera]
      : INFINITO;
  if (!t.es_clasico) return base;
  return function enAro(a) {
    return (
      <>
        <circle cx={0} cy={0} r={12.8} stroke={a} strokeWidth={1.5} fill="none" opacity={0.55} />
        <g transform={primera ? "scale(0.62)" : undefined}>{base(a)}</g>
      </>
    );
  };
}

export function MuestraTemporada({
  temporada,
  className,
}: {
  temporada: Pick<Temporada, "nombre" | "es_clasico" | "estacion_desde" | "estacion_hasta">;
  className?: string;
}) {
  const { fondo, acento } = TONOS_TEMPORADA[tonoDeTemporada(temporada)];
  return <MuestraIcono dibujo={dibujoDe(temporada)} fondo={fondo} acento={acento} etiqueta={`Ilustración de la temporada ${temporada.nombre}`} className={className} />;
}

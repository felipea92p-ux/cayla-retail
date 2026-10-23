import { createElement, type ReactElement } from "react";
import { DIBUJOS_DE_INSIGNIA, type ColorDeInsignia, type PiezaDeInsignia } from "@cayla-retail/shared/insignias-visual";
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
export const CREMA = "#F5F0E8";

// `fondo` = el tono del grupo diluido ~14% sobre crema. `acento` = el tono
// pleno (ámbar / verde / taupe-profundo de globals.css).
export const TONOS: Record<Estilo, { fondo: string; acento: string }> = {
  urgencia: { fondo: "#E6DCCC", acento: "#8C631F" },
  positivo: { fondo: "#DFDED2", acento: "#556E49" },
  campana: { fondo: "#E5DBD2", acento: "#805C4C" },
  neutral: { fondo: "#EFE8DA", acento: TINTA },
};

// Pizarra (#4C5D6E) diluida al 14 % sobre crema, la misma cuenta con que salen los fondos de `TONOS`. Vive aquí, junto a
// ellos, porque la comparten Temporadas (otoño e invierno) y Categorías (Calzado y Papelería).
export const TONO_PIZARRA = { fondo: "#DDDBD7", acento: "#4C5D6E" };

const ANCHO = 180; // 3:1, como las muestras de Patrones y Tejidos
const ALTO = 60;

/** Un ícono dibujado centrado en (0,0) dentro de ±14 unidades; `a` es el color de acento. */
export type DibujoIcono = (a: string) => ReactElement;

// Los dibujos viven en `packages/shared/src/insignias-visual.ts` (ADR-0489), compartidos con la tienda online: aquí solo se pintan. Cada
// uno se dibuja centrado en (0,0) dentro de ±14 unidades; `a` es el color de acento del grupo, CREMA lo «recortado» (la cara de la
// calabaza) y TINTA el negro fijo del Black Friday.
function pintar(piezas: readonly PiezaDeInsignia[], colores: Record<ColorDeInsignia, string>): ReactElement[] {
  return piezas.map((pieza, i) => {
    // Un valor que empieza con «$» es un color con nombre; todo lo demás (números, «none», «round») pasa tal cual y en su orden.
    const props = Object.fromEntries(
      Object.entries(pieza.props).map(([k, v]) => [k, typeof v === "string" && v.startsWith("$") ? colores[v as ColorDeInsignia] : v]),
    );
    return createElement(pieza.tag, { key: i, ...props }, ...(pieza.hijos ? pintar(pieza.hijos, colores) : []));
  });
}

const ICONOS = Object.fromEntries(
  Object.entries(DIBUJOS_DE_INSIGNIA).map(([icono, piezas]) => [
    icono,
    ((a) => <>{pintar(piezas, { $acento: a, $hueco: CREMA, $tinta: TINTA })}</>) satisfies DibujoIcono,
  ]),
) as Record<IconoEtiqueta | "generico", DibujoIcono>;

/** El dibujo de una etiqueta por su nombre (el mismo de su tarjeta), para quien lo pone en otro marco: el centro del sello de tinta de
 *  Catálogo ▸ Insignias (`components/sellos/SelloTinta.tsx`). Centrado en (0,0) dentro de ±14; `a` es el color de su trazo. */
export function dibujoDeEtiqueta(nombre: string): DibujoIcono {
  return ICONOS[iconoDeEtiqueta(nombre) ?? "generico"];
}

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
  const { fondo, acento } = TONOS[estilo];
  return (
    <MuestraIcono
      dibujo={ICONOS[iconoDeEtiqueta(nombre) ?? "generico"]}
      fondo={fondo}
      acento={acento}
      etiqueta={`Ilustración de la etiqueta ${nombre}`}
      className={className}
    />
  );
}

/**
 * El molde de las muestras con ícono de Atributos (Etiquetas y Temporadas, ADR-0261): el ícono grande al centro y dos ecos
 * tenues a los lados sobre el tinte de su tono. Un solo molde para que las dos pestañas se vean hechas por la misma mano.
 */
export function MuestraIcono({
  dibujo,
  fondo,
  acento,
  etiqueta,
  className = "aspect-[3/1] w-full",
}: {
  dibujo: DibujoIcono;
  fondo: string;
  acento: string;
  /** Lo que lee un lector de pantalla: «Ilustración de la etiqueta Nuevo». */
  etiqueta: string;
  className?: string;
}) {
  return (
    <div className={`${className} overflow-hidden rounded-lg`} style={{ backgroundColor: fondo }} role="img" aria-label={etiqueta}>
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

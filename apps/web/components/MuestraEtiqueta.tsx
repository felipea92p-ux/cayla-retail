import { createElement, useId, type ReactElement } from "react";
import { DIBUJOS_DE_INSIGNIA, dibujoDeInsignia, type ColorDeInsignia, type DibujoDeInsignia, type PiezaDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { urlDeImagenDeInsignia } from "@cayla-retail/shared/insignia-imagen";

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
export function pintarDibujo(piezas: readonly PiezaDeInsignia[], colores: Record<ColorDeInsignia, string>): ReactElement[] {
  return piezas.map((pieza, i) => {
    // Un valor que empieza con «$» es un color con nombre; todo lo demás (números, «none», «round») pasa tal cual y en su orden.
    const props = Object.fromEntries(
      Object.entries(pieza.props).map(([k, v]) => [k, typeof v === "string" && v.startsWith("$") ? colores[v as ColorDeInsignia] : v]),
    );
    return createElement(pieza.tag, { key: i, ...props }, ...(pieza.hijos ? pintarDibujo(pieza.hijos, colores) : []));
  });
}

const ICONOS = Object.fromEntries(
  Object.entries(DIBUJOS_DE_INSIGNIA).map(([icono, piezas]) => [
    icono,
    ((a) => <>{pintarDibujo(piezas, { $acento: a, $hueco: CREMA, $tinta: TINTA })}</>) satisfies DibujoIcono,
  ]),
) as Record<DibujoDeInsignia, DibujoIcono>;

/** El dibujo de una etiqueta (el mismo de su tarjeta), para quien lo pone en otro marco: el centro del sello de tinta de Catálogo ▸
 *  Insignias (`components/sellos/SelloTinta.tsx`). Manda su imagen propia (`imagen`, la ruta en el almacén), luego el dibujo que se eligió
 *  (`icono`, ADR-0490) y, si no hay ninguno, el de su nombre. Centrado en (0,0) dentro de ±14; `a` es el color de su trazo (una imagen propia
 *  lleva sus propios colores: no lo usa). */
export function dibujoDeEtiqueta(nombre: string, icono?: DibujoDeInsignia | null, imagen?: string | null, silueta?: boolean): DibujoIcono {
  const url = urlDeImagenDeInsignia(process.env.NEXT_PUBLIC_SUPABASE_URL, imagen);
  // Un poco más chica que el cuadrado de ±14 de los dibujos: la imagen es un cuadrado lleno y sus esquinas no deben pasar del anillo del sello.
  // Como silueta (ADR-0490 act. b) la imagen es un molde: toma el color `a` del lugar, que en el sello es `currentColor` (tinta en claro, crema en oscuro).
  if (url && silueta) return function SiluetaDeLaImagen(a: string) { return <SiluetaPropia url={url} color={a} />; };
  if (url) return function ImagenPropia() { return <image href={url} x={-13} y={-13} width={26} height={26} preserveAspectRatio="xMidYMid meet" />; };
  return ICONOS[dibujoDeInsignia({ nombre, icono })];
}

/** La imagen propia de una insignia como SILUETA dentro de un SVG: un rectángulo del color del lugar recortado con la forma de la imagen (una máscara
 *  de transparencia). Es un componente, no una función de dibujo, para que cada copia tenga su propio id de máscara (`useId`: el mismo en el servidor y
 *  en el navegador): el sello y la tarjeta (con sus dos ecos) la dibujan varias veces en la misma página. */
function SiluetaPropia({ url, color }: { url: string; color: string }) {
  const id = `sil${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x={-13} y={-13} width={26} height={26} style={{ maskType: "alpha" }}>
        <image href={url} x={-13} y={-13} width={26} height={26} preserveAspectRatio="xMidYMid meet" />
      </mask>
      <rect x={-13} y={-13} width={26} height={26} fill={color} mask={`url(#${id})`} />
    </>
  );
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
  icono,
  imagen,
  imagenSilueta,
  estilo,
  className = "aspect-[3/1] w-full",
}: {
  nombre: string;
  /** El dibujo elegido al crearla (ADR-0490); sin él, el de su nombre. */
  icono?: DibujoDeInsignia | null;
  /** Su imagen propia (la ruta en el almacén de insignias); manda sobre `icono`. */
  imagen?: string | null;
  /** La imagen es un molde que se pinta del color de la tarjeta (ADR-0490 act. b). */
  imagenSilueta?: boolean;
  estilo: Estilo;
  className?: string;
}) {
  const { fondo, acento } = TONOS[estilo];
  return (
    <MuestraIcono
      dibujo={dibujoDeEtiqueta(nombre, icono, imagen, imagenSilueta)}
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

import Link from "next/link";
import type { ReactNode } from "react";

/* ====================================================================
   SegmentoEnlaces · el segmento de MODO DE VISTA y de ORDEN que vive en la URL
   (2026-09-18, ADR-0111; piel nueva el 2026-10-06, ADR-0358 «Pestañas y segmentos»)

   Qué es: lo que se toca para ver LO MISMO de otra forma u orden —Grilla / Tabla, Emisión / Vencimiento, Por urgencia /
   Por proveedor—, con 2 o 3 opciones. No es una pestaña de vista (`Pestanas`, cambia de sección) ni un filtro
   (`pildora-cayla`, deja menos filas). Con más de 3 opciones va el combo (`Desplegable`, ADR-0209). Son enlaces, no botones
   con estado: la opción elegida es un parámetro de la URL, así el Server Component sabe qué dibujar, se puede compartir y
   «atrás» funciona. Quien lo usa arma cada `href` conservando el resto de los parámetros.

   Cómo se ve (decidido por Felipe con /unificar): 36 px con la piel de `caja-cayla` —hueso, borde sand, radio de control—,
   igual que el buscador y el combo con los que vive en la barra; la elegida en papel con CONTORNO de 1 px en tinta, sin
   relleno (no compite con el botón principal ni con la píldora elegida); 13,5 px en 500 en todas; el icono va delante y
   siempre con su palabra. CSS: `.segmento-cayla` en app/estilos/pestanas-y-segmentos.css. Su gemelo con estado es
   `SegmentoDeslizante forma="modo"`.

   Reemplaza: el pulgar oscuro que se deslizaba con MAYÚSCULAS de 11 px y el rojo al pasar el mouse (la prop `deslizante`
   se fue con él), las pistas sand de Grilla / Tabla y del tamaño de la grilla, y las pistas hueso escritas a mano.
   ==================================================================== */

export type OpcionSegmento = { valor: string; etiqueta: string; href: string; icono?: ReactNode };

export function SegmentoEnlaces({
  opciones,
  activo,
  etiquetaAccesible,
  reemplazar = true,
  scroll,
  soloIconoEnCelular = false,
  className = "",
}: {
  opciones: OpcionSegmento[];
  activo: string;
  etiquetaAccesible: string;
  /** `replace` del enlace: por defecto cambiar de modo no suma una entrada al «atrás» del navegador. */
  reemplazar?: boolean;
  /** `scroll` del enlace (Next lleva la vista arriba por defecto). */
  scroll?: boolean;
  /** Bajo `sm`, solo el icono (la palabra queda para el lector de pantalla y en el `title`): Grilla / Tabla en la cabecera de
   *  Productos del celular, para que las acciones quepan en una fila (2026-10-09). Solo si TODAS las opciones traen icono. */
  soloIconoEnCelular?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label={etiquetaAccesible} className={`segmento-cayla ${className}`}>
      {opciones.map((o) => (
        <Link key={o.valor} href={o.href} replace={reemplazar} scroll={scroll} aria-current={o.valor === activo ? "true" : undefined} className="segmento-cayla__opcion" title={soloIconoEnCelular ? o.etiqueta : undefined}>
          {o.icono}
          {soloIconoEnCelular && o.icono ? <span className="max-sm:sr-only">{o.etiqueta}</span> : o.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

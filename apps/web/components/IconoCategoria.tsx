import type { ReactNode } from "react";
import type { Familia } from "@cayla-retail/shared";
import { IconoFamilia } from "@/components/IconoFamilia";
import { formasDePrefijo, type FormaIcono } from "@/lib/icono-categoria-reglas";

/**
 * El ícono de una categoría: el de su prefijo, o —si es una categoría nueva sin dibujo propio— el de su familia
 * (`IconoFamilia`), exactamente como era antes de que cada categoría tuviera el suyo. Trazo de `currentColor`, igual que
 * la percha: quien lo pinta pone el color y el tamaño. El mapa y su porqué: `lib/icono-categoria-reglas.ts`.
 */
export function IconoCategoria({
  prefijo,
  familia,
  className = "h-6 w-6",
}: {
  prefijo: string | null | undefined;
  familia: Familia | null;
  className?: string;
}) {
  const formas = formasDePrefijo(prefijo);
  if (!formas) return <IconoFamilia familia={familia} className={className} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {pintarFormas(formas)}
    </svg>
  );
}

/**
 * Las formas como elementos SVG. Con `siluetaRellena`, la primera (la silueta, por contrato de `icono-categoria-reglas`) se
 * rellena con `currentColor` al 14 %: es el tinte que llevan los dibujos de Etiquetas y Temporadas (`liquidar`, `unica`).
 */
export function pintarFormas(formas: readonly FormaIcono[], siluetaRellena = false): ReactNode {
  return formas.map((f, i) => {
    const relleno = siluetaRellena && i === 0 ? { fill: "currentColor", fillOpacity: 0.14 } : {};
    if (f.t === "path") return <path key={i} d={f.d} {...relleno} />;
    if (f.t === "circle") return <circle key={i} cx={f.cx} cy={f.cy} r={f.r} {...relleno} />;
    return <rect key={i} x={f.x} y={f.y} width={f.width} height={f.height} rx={f.rx} {...relleno} />;
  });
}

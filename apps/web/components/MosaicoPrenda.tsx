import type { CSSProperties } from "react";
import { IconoCategoria } from "@/components/IconoCategoria";
import { tonoDeCategoria } from "@/components/MuestraCategoria";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";

/**
 * La prenda sin foto, en TODO el ERP (Felipe 2026-10-03 en Vender; 2026-10-04 en el resto): el ícono de su categoría (el mismo de
 * Catálogo ▸ Categorías) sobre el COLOR de la prenda, con el nombre de la categoría debajo si cabe. Antes cada pantalla decía «sin
 * foto» a su manera —el isotipo de CAYLA al 30 % en Existencias, la silueta punteada en Inicio de Almacén, esto en Vender— y una
 * lista de 25 prendas sin foto era 25 isotipos iguales: no distinguía una prenda de otra. Ahora la miniatura cuenta qué es (ícono) y
 * de qué color (fondo), aunque no haya foto.
 *
 * Tres formas: `grilla` (cuadrado, la tarjeta de Vender), `fila` (4:5, como `FotoPrenda`, el buscador de Vender) y `relleno`
 * (llena la caja que le da quien lo pone, de 36 px a 176 px: es la de `SinFoto`/`MiniaturaPrenda`/`FotoDePrenda`). En `relleno` el
 * nombre es opcional (`conNombre`): una miniatura de tabla es solo ícono; una de tarjeta o de cajón lo lleva.
 *
 * Sin color (variante sin `colores.hex`) cae al tono de su familia. Sin categoría conocida (ni prefijo ni familia: una pantalla
 * que todavía no trae el dato) dibuja la percha de Existencias, nunca el círculo de reserva de `IconoFamilia`, que no dice nada.
 * El filo de los colores claros va por dentro (`inset`), sin sumar alto. Quien lo pone decide el ancho (`className`).
 */
export function MosaicoPrenda({
  colorHex,
  prefijo,
  familia,
  categoria,
  forma,
  conNombre = forma !== "relleno",
  className = "",
}: {
  colorHex?: string | null;
  prefijo?: string | null;
  familia?: Parameters<typeof tonoDeCategoria>[0] | undefined;
  categoria?: string | null;
  forma: "grilla" | "fila" | "relleno";
  /** Si dibuja el nombre de la categoría bajo el ícono. Por defecto sí en `grilla` y `fila`, no en `relleno`. */
  conNombre?: boolean;
  className?: string;
}) {
  const color = estiloMosaicoColor(colorHex);
  const tono = tonoDeCategoria(familia ?? null);
  const fondo = color?.fondo ?? tono.fondo;
  const trazo = color?.trazo ?? tono.acento;
  // En `relleno` el filo va siempre: reemplaza al borde que tenía la miniatura del isotipo y que llevan las fotos a su lado.
  const filo = color?.filo || forma === "relleno";
  const estilo: CSSProperties = { backgroundColor: fondo, color: trazo, ...(filo ? { boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-tinta-fija) 10%, transparent)" } : {}) };
  const enGrilla = forma === "grilla";
  const sinCategoria = !prefijo && !familia;
  const conRotulo = Boolean(categoria) && conNombre;
  // `relleno`: el ícono crece con la caja —casi la mitad de su ancho—, ni menos de 20 px (miniatura de tabla) ni más de 56 px (foto
  // grande); con el nombre debajo (cajas de 64 px o más) cede un poco para que ambos quepan.
  const claseIcono = enGrilla
    ? "aspect-square h-auto w-[38%] shrink-0 transition-transform duration-500 ease-[var(--ease-cayla)] group-hover:scale-[1.06]"
    : forma === "fila"
      ? "h-7 w-7 shrink-0"
      : `aspect-square h-auto ${conRotulo ? "w-[44%]" : "w-1/2"} min-w-5 max-w-14 shrink-0`;
  return (
    <div
      aria-hidden
      data-color-dato
      style={estilo}
      className={`pointer-events-none relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg ${
        enGrilla ? "aspect-square gap-[7%] p-2" : forma === "fila" ? "aspect-[4/5] gap-1.5 p-1" : "gap-1 p-1"
      } ${className}`}
    >
      {sinCategoria ? <IconoPercha className={claseIcono} strokeWidth={1.5} /> : <IconoCategoria prefijo={prefijo} familia={familia ?? null} className={claseIcono} />}
      {conRotulo && (
        <span className={`label-cayla line-clamp-2 max-w-full text-center leading-snug ${enGrilla ? "text-[9.5px]" : "text-[8px] !tracking-[0.04em]"}`} style={{ opacity: color ? 0.85 : 0.6, color: color ? undefined : "var(--color-tinta-fija)" }}>
          {categoria}
        </span>
      )}
    </div>
  );
}

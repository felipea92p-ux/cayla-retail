import type { CSSProperties } from "react";
import { IconoCategoria } from "@/components/IconoCategoria";
import { tonoDeCategoria } from "@/components/MuestraCategoria";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";

/**
 * La prenda sin foto en Vender: el ícono de su categoría (el mismo de Catálogo ▸ Categorías) sobre el COLOR de la prenda,
 * con el nombre de la categoría debajo. Lo usan la grilla de tarjetas (`grilla`, cuadrado) y la lista del buscador (`fila`,
 * 4:5 como `FotoPrenda`), para que una misma prenda se lea igual en las dos (Felipe 2026-10-03).
 *
 * Sin color (variante sin `colores.hex`) cae al tono de su familia, como era antes. El filo de los colores claros va por
 * dentro (`inset`), sin sumar alto. Quien lo pone decide el ancho (`className`) y si es atenuado.
 */
export function MosaicoPrenda({
  colorHex,
  prefijo,
  familia,
  categoria,
  forma,
  className = "",
}: {
  colorHex: string | null | undefined;
  prefijo: string | null | undefined;
  familia: Parameters<typeof tonoDeCategoria>[0];
  categoria: string | null | undefined;
  forma: "grilla" | "fila";
  className?: string;
}) {
  const color = estiloMosaicoColor(colorHex);
  const tono = tonoDeCategoria(familia);
  const fondo = color?.fondo ?? tono.fondo;
  const trazo = color?.trazo ?? tono.acento;
  const estilo: CSSProperties = { backgroundColor: fondo, color: trazo, ...(color?.filo ? { boxShadow: "inset 0 0 0 1px rgb(26 26 24 / 0.1)" } : {}) };
  const enGrilla = forma === "grilla";
  return (
    <div
      aria-hidden
      style={estilo}
      className={`pointer-events-none relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg ${
        enGrilla ? "aspect-square gap-[7%] p-2" : "aspect-[4/5] gap-1.5 p-1"
      } ${className}`}
    >
      <IconoCategoria prefijo={prefijo} familia={familia} className={enGrilla ? "aspect-square h-auto w-[38%] shrink-0 transition-transform duration-500 ease-[var(--ease-cayla)] group-hover:scale-[1.06]" : "h-7 w-7 shrink-0"} />
      {categoria && (
        <span className={`label-cayla line-clamp-2 max-w-full text-center leading-snug ${enGrilla ? "text-[9.5px]" : "text-[8px] !tracking-[0.04em]"}`} style={{ opacity: color ? 0.85 : 0.6, color: color ? undefined : "var(--color-tinta)" }}>
          {categoria}
        </span>
      )}
    </div>
  );
}

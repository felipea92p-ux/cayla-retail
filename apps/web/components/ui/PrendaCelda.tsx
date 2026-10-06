import Image from "next/image";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";

/* ====================================================================
   PrendaCelda · la miniatura de una prenda (2026-09-17, ADR-0101)

   La foto de la prenda o, si no tiene, el marcador `SinFoto` (la categoría
   sobre el color, 2026-10-04; antes el isotipo), para que toda lista dibuje
   igual a la misma prenda. El archivo conserva el nombre de su primera pieza:
   `PrendaCelda` (miniatura + referencia + «SKU · color · talla») y
   `ProductoVarianteCelda` (la primera columna de Existencias) se borraron el
   2026-10-06 porque ya ninguna pantalla las usaba; la última fue el Análisis
   de antes de la v4.
   ==================================================================== */

// La categoría de una prenda (`categoriaDe`) vive en `lib/` (lógica pura, con su prueba); se re-exporta para que quien dibuja
// la miniatura importe todo de aquí.
export { categoriaDe, type CategoriaDePrenda } from "@/lib/categoria-de-prenda";

/** Sin foto: el ícono de la categoría de la prenda sobre su color (`MosaicoPrenda`, el mismo de Vender), no el isotipo de CAYLA.
 *  El isotipo al 30 % (rediseño de Existencias, 2026-09-22) decía «sin foto» pero era el mismo en las 25 prendas de una lista;
 *  el 2026-10-04 Felipe pidió UN solo lenguaje de «sin foto» en todo el ERP. El isotipo queda para la marca (login, lateral,
 *  tickets), no para marcar un hueco. `conNombre`: el nombre de la categoría bajo el ícono, para una caja de tarjeta o cajón
 *  (≥ 64 px de ancho); una miniatura de tabla es solo ícono. */
export function SinFoto({
  tamano = "h-9 w-9",
  colorHex,
  prefijo,
  familia,
  categoria,
  conNombre = false,
}: { tamano?: string; colorHex?: string | null; conNombre?: boolean } & CategoriaDePrenda) {
  return <MosaicoPrenda forma="relleno" colorHex={colorHex} prefijo={prefijo} familia={familia} categoria={categoria} conNombre={conNombre} className={tamano} />;
}

/** La miniatura sola: la foto de la prenda, o —sin foto— su categoría sobre su color (`SinFoto`; el color ya no va en un punto
 *  aparte: la miniatura ES de ese color, con filo para que un beige o un blanco no desaparezcan sobre el papel). Cambios la
 *  usa en grande (2026-09-18): la colaboradora compara la foto con la prenda que la clienta tiene en la mano. */
export function MiniaturaPrenda({
  fotoUrl,
  colorHex = null,
  tamano = "sm",
  prefijo,
  familia,
  categoria,
}: { fotoUrl: string | null; colorHex?: string | null; tamano?: "sm" | "md" | "lg" | "xl" } & CategoriaDePrenda) {
  // `md` (44 px): la miniatura de las listas de Existencias del diseño aprobado (2026-09-28).
  // `xl` (60 px): la miniatura de la tarjeta de producto de Conteo ▸ Contar (2026-09-29).
  const [clase, px] = tamano === "xl" ? ["h-[60px] w-[60px]", 60] : tamano === "lg" ? ["h-12 w-12", 48] : tamano === "md" ? ["h-11 w-11", 44] : ["h-9 w-9", 36];
  if (fotoUrl) {
    return <Image src={fotoUrl} alt="" width={px} height={px} unoptimized className={`${clase} shrink-0 rounded-md border border-tinta/10 object-cover`} />;
  }
  return <SinFoto tamano={clase} colorHex={colorHex} prefijo={prefijo} familia={familia} categoria={categoria} />;
}

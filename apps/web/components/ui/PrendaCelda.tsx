import Image from "next/image";
import type { ReactNode } from "react";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { MuestraColor } from "@/components/ui/MuestraColor";

/* ====================================================================
   PrendaCelda · miniatura + referencia + "SKU · color · talla"
   (2026-09-17, ADR-0101)

   La celda de la prenda que Existencias armaba a mano y el marcador que
   dibuja cuando la prenda no tiene foto (`SinFoto`: la categoría sobre el
   color, 2026-10-04; antes el isotipo). Extraída para que Resumen la
   comparta en vez de copiarla. La segunda línea es texto (no la cápsula de
   color de Existencias): en una lista de decisiones se lee "Blanco · L", no
   se compara un swatch con otro.

   ProductoVarianteCelda (2026-09-21) es la otra mitad: la primera columna de
   Existencias TAL CUAL —miniatura, nombre, y «SKU · talla · cápsula de
   color»—, ya como componente. Existencias y Conteo la usan para dibujar
   igual a la misma prenda. No es un «modo» de `PrendaCelda`: cambia el orden
   de la segunda línea y el color pasa de palabra a cápsula, y meterlo ahí
   habría movido Resumen y las demás listas que sí quieren el texto.
   ==================================================================== */

/** La categoría de una prenda, como la dibuja `MosaicoPrenda`: el ícono sale del `prefijo` (o de la `familia` si es una categoría
 *  nueva sin dibujo propio) y `categoria` es el nombre visible. Todo opcional: una pantalla que aún no trae el dato dibuja la percha. */
export type CategoriaDePrenda = { prefijo?: string | null; familia?: string | null; categoria?: string | null };

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

/** La celda «Producto / variante» de Inventario: la primera columna de Existencias, para que la
 *  misma prenda se vea igual en Existencias y en Conteo.
 *
 *  `colorHex` tiene tres estados: un `#rrggbb` (cápsula de ese color), `null` (un color que no es
 *  un color —Estampado, Multicolor, Animal print—: cápsula con degradado) y `undefined` (no se
 *  pudo leer: el nombre va en texto, jamás el degradado, que sería decir «varios colores» sin
 *  saberlo). Existencias siempre lo tiene; solo Conteo puede quedarse sin él. */
export function ProductoVarianteCelda({
  referencia,
  sku,
  talla,
  color,
  colorHex,
  fotoUrl,
  senal,
  marca,
}: {
  referencia: string;
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex?: string | null;
  fotoUrl: string | null;
  /** Una señal pegada al nombre (la «≈» de Análisis: cifras estimadas). */
  senal?: ReactNode;
  /** La marca comercial, en pequeño tras el nombre. Quien busca «cayla» y ve Top Aurora tiene que ver por qué salió: «Cayla 2».
   *  La pantalla la pasa solo cuando hay más de una marca (con una sola sería ruido en cada fila). */
  marca?: string | null;
}) {
  return (
    // `items-start`, no `items-center`: con dos líneas de texto la miniatura se ve mejor
    // alineada arriba, como una etiqueta colgada de la prenda, no flotando a media altura.
    <span className="flex min-w-0 items-start gap-2.5">
      <MiniaturaPrenda fotoUrl={fotoUrl} />
      <span className="min-w-0">
        {marca ? (
          // Con marca, el NOMBRE es lo que se corta primero y la marca se lee entera (o con «…» y su título): quien busca «miramhe» y ve
          // «Polo Básico M/corta · M…» no puede confirmar por qué salió la fila, que es el motivo de mostrarla.
          <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-tinta" title={`${referencia} · ${marca}`}>
            <span className="min-w-0 truncate">{referencia}</span>
            <span className="max-w-[45%] shrink-0 truncate text-xs text-taupe">· {marca}</span>
            {senal}
          </span>
        ) : (
          <span className="block truncate text-sm text-tinta" title={referencia}>
            {referencia}
            {senal}
          </span>
        )}
        {/* `overflow-visible`: la pastilla con el nombre del color flota fuera de la celda al
            pasar el mouse. `whitespace-nowrap`: sin él, con la columna en su piso (13.5rem) la
            línea queda unos px corta, el flex encoge cada texto a su mínimo y se parten por los
            guiones («BLU-EMMA-BEI-» / «L»). Así, en cambio, se pasa esos px hacia el espacio entre
            columnas (16px, visible) y se lee entera. En celular (< sm) `MuestraColor` pone el
            NOMBRE del color al lado de la cápsula («Azul marino»), la línea puede no caber y ahí
            sí salta, pero entre elementos: el punto queda al final del renglón y «▬ Azul marino»
            pasa abajo — nunca un texto cortado o partido por dentro. */}
        <span className="flex items-center gap-1.5 overflow-visible whitespace-nowrap text-xs text-tinta/65 max-sm:flex-wrap max-sm:gap-y-0.5">
          <span className="font-mono">{sku}</span>
          {talla && <span>· {talla}</span>}
          <span>·</span>
          {colorHex === undefined ? <span>{color ?? "—"}</span> : <MuestraColor nombre={color} hex={colorHex} />}
        </span>
      </span>
    </span>
  );
}

export function PrendaCelda({
  referencia,
  sku,
  talla,
  color,
  fotoUrl,
  compacta = false,
}: {
  referencia: string;
  sku: string;
  talla: string | null;
  color: string | null;
  fotoUrl: string | null;
  /** Una sola línea ("Blusa Camila · Blanco L"): para listas cortas. */
  compacta?: boolean;
}) {
  const miniatura = <MiniaturaPrenda fotoUrl={fotoUrl} />;

  if (compacta) {
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        {miniatura}
        <span className="truncate text-sm text-tinta">
          {referencia}
          {(color || talla) && <span className="text-tinta/65"> · {[color, talla].filter(Boolean).join(" ")}</span>}
        </span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-start gap-2.5">
      {miniatura}
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta" title={referencia}>
          {referencia}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-tinta/65">
          <span className="font-mono">{sku}</span>
          {color && <span>· {color}</span>}
          {talla && <span>· {talla}</span>}
        </span>
      </span>
    </span>
  );
}

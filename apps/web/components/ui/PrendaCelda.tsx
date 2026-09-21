import Image from "next/image";
import { MuestraColor } from "@/components/ui/MuestraColor";

/* ====================================================================
   PrendaCelda · miniatura + referencia + "SKU · color · talla"
   (2026-09-17, ADR-0101)

   La celda de la prenda que Existencias armaba a mano y el marcador de
   perchero que dibuja cuando la prenda no tiene foto (`SinFoto`, mismo
   trazo que IC.inventario en AppShell). Extraída para que Resumen la
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

export function SinFoto({ tamano = "h-9 w-9" }: { tamano?: string }) {
  return (
    <span aria-hidden className={`flex ${tamano} shrink-0 items-center justify-center rounded-md border border-tinta/10 bg-sand/50 text-tinta/25`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4L4 7m8 4l8-4m-8 4v10" />
      </svg>
    </span>
  );
}

/** La miniatura sola: la foto de la prenda, o el marcador de perchero con un punto
 *  del color vendido (con borde, para que un beige o un blanco no desaparezcan sobre
 *  el papel). Cambios la usa en grande (2026-09-18): la colaboradora compara la foto
 *  con la prenda que la clienta tiene en la mano. */
export function MiniaturaPrenda({ fotoUrl, colorHex = null, tamano = "sm" }: { fotoUrl: string | null; colorHex?: string | null; tamano?: "sm" | "lg" }) {
  const [clase, px] = tamano === "lg" ? ["h-12 w-12", 48] : ["h-9 w-9", 36];
  if (fotoUrl) {
    return <Image src={fotoUrl} alt="" width={px} height={px} unoptimized className={`${clase} shrink-0 rounded-md border border-tinta/10 object-cover`} />;
  }
  if (!colorHex) return <SinFoto tamano={clase} />;
  return (
    <span className="relative shrink-0">
      <SinFoto tamano={clase} />
      <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-papel ring-1 ring-tinta/25" style={{ background: colorHex }} />
    </span>
  );
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
}: {
  referencia: string;
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex?: string | null;
  fotoUrl: string | null;
}) {
  return (
    // `items-start`, no `items-center`: con dos líneas de texto la miniatura se ve mejor
    // alineada arriba, como una etiqueta colgada de la prenda, no flotando a media altura.
    <span className="flex min-w-0 items-start gap-2.5">
      <MiniaturaPrenda fotoUrl={fotoUrl} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta" title={referencia}>
          {referencia}
        </span>
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

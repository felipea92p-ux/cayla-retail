import Image from "next/image";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import type { CategoriaDePrenda } from "@/components/ui/PrendaCelda";

/** La foto de la prenda en grande, para el costado de una hoja (`<Modal lateral={…}>`): quien repone, sube o ajusta ve DE QUÉ prenda
 *  habla la ventana sin leer. Es la misma foto que la tarjeta de la prenda. Sin foto, lo mismo que `SinFoto` en las listas: el ícono
 *  de su categoría sobre su color, con el nombre debajo (antes el isotipo más un punto de color; ver `SinFoto`).
 *  La caja es de 3:4 y se recorta (`object-cover`): una foto horizontal no deforma la ventana. */
export function FotoDePrenda({ fotoUrl, colorHex = null, prefijo, familia, categoria }: { fotoUrl: string | null; colorHex?: string | null } & CategoriaDePrenda) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-tinta/10 bg-sand/50" style={{ aspectRatio: "3 / 4" }}>
      {fotoUrl ? (
        <Image src={fotoUrl} alt="" fill sizes="176px" unoptimized className="object-cover" />
      ) : (
        // La capa absoluta es de este contenedor: el mosaico trae su propio `relative`, que le ganaría a un `absolute inset-0` puesto en él.
        <div className="absolute inset-0">
          <MosaicoPrenda forma="relleno" conNombre colorHex={colorHex} prefijo={prefijo} familia={familia} categoria={categoria} className="h-full w-full !rounded-none" />
        </div>
      )}
    </div>
  );
}

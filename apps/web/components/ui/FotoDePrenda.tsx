import Image from "next/image";

/** La foto de la prenda en grande, para el costado de una hoja (`<Modal lateral={…}>`): quien repone, sube o ajusta ve DE QUÉ prenda
 *  habla la ventana sin leer. Es la misma foto que la tarjeta de la prenda. Sin foto, el isotipo de CAYLA sobre el fondo sand
 *  —el mismo marcador que `SinFoto` usa en las listas— más un punto con el color, para que el beige o el blanco no desaparezcan.
 *  La caja es de 3:4 y se recorta (`object-cover`): una foto horizontal no deforma la ventana. */
export function FotoDePrenda({ fotoUrl, colorHex = null }: { fotoUrl: string | null; colorHex?: string | null }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-tinta/10 bg-sand/50" style={{ aspectRatio: "3 / 4" }}>
      {fotoUrl ? (
        <Image src={fotoUrl} alt="" fill sizes="176px" unoptimized className="object-cover" />
      ) : (
        <>
          <Image src="/cayla-isotipo.png" alt="" width={96} height={96} unoptimized aria-hidden className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 object-contain opacity-30" />
          {colorHex && <span aria-hidden className="absolute bottom-3 right-3 h-4 w-4 rounded-full border-2 border-papel ring-1 ring-tinta/25" style={{ background: colorHex }} />}
        </>
      )}
    </div>
  );
}

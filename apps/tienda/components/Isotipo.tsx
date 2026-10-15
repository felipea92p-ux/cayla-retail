import Image from "next/image";

/** El colibrí de CAYLA (223 × 150). Cada lugar le da su ancho y su color con CSS; el alto sigue solo. */
export function Isotipo({ className }: { className?: string }) {
  return <Image src="/cayla-isotipo.png" alt="" width={223} height={150} priority unoptimized className={className} />;
}

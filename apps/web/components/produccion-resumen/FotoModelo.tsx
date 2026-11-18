import { FotoPrenda } from "@/components/ui/FotoPrenda";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";

/** La foto de un modelo (o, sin foto, el ícono de su categoría sobre su color). Decorativa: el nombre ya está escrito al lado, así que no se lee dos veces. */
export function FotoModelo({ productoId, presentaciones, ancho, className }: { productoId: string; presentaciones: Record<string, PresentacionDeModelo>; ancho: number; className: string }) {
  const p = presentaciones[productoId];
  return (
    <span aria-hidden className="block shrink-0">
      <FotoPrenda fotoUrl={p?.fotoUrl} referencia="" ancho={ancho} colorHex={p?.colorHex} categoria={p?.categoria} categoriaPrefijo={p?.categoriaPrefijo} categoriaFamilia={p?.categoriaFamilia} className={className} />
    </span>
  );
}

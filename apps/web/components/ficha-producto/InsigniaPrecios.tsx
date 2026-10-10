import { Chip } from "@/components/ui/Chip";
import { insigniaPrecios, type PrecioDeTienda } from "@/lib/precio-sede-reglas";

/**
 * «2 precios» junto al precio de una prenda que alguna tienda vende a otro precio (Felipe 2026-10-09). Al pasar el mouse, y para el
 * lector de pantalla, dice cuál: «Otro precio en Arequipa S/ 129.90». Sin precios de tienda no dibuja nada.
 */
export function InsigniaPrecios({ lista, className = "" }: { lista: readonly PrecioDeTienda[] | undefined; className?: string }) {
  if (!lista || lista.length === 0) return null;
  const { texto, detalle } = insigniaPrecios(lista);
  return (
    <span title={detalle} aria-label={`${texto}. ${detalle}`} className={`inline-flex ${className}`}>
      <Chip tono="ambar">{texto}</Chip>
    </span>
  );
}

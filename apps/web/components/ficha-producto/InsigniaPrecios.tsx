import { Chip } from "@/components/ui/Chip";
import { insigniaPrecios, type PrecioDeTienda } from "@/lib/precio-sede-reglas";

/**
 * «2 precios» junto al precio de una prenda que no se vende igual en todas las tiendas (Felipe 2026-10-09). Cuenta precios
 * DISTINTOS, no tiendas (2026-10-10: con AQP igual al de la prenda decía «3 precios» donde había 2). Al pasar el mouse, y para el
 * lector de pantalla, dice cuál en cada una: «AQP y LIM S/ 79.90 · TRU S/ 69.90». Si todas venden igual no dibuja nada.
 */
export function InsigniaPrecios({ lista, className = "" }: { lista: readonly PrecioDeTienda[] | undefined; className?: string }) {
  const insignia = insigniaPrecios(lista);
  if (!insignia) return null;
  const { texto, detalle } = insignia;
  return (
    <span title={detalle} aria-label={`${texto}. ${detalle}`} className={`inline-flex ${className}`}>
      <Chip tono="ambar">{texto}</Chip>
    </span>
  );
}

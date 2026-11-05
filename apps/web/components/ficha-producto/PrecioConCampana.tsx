import { Chip } from "@/components/ui/Chip";
import { fechaCorta } from "@/lib/etiqueta-vigencia";
import { rangoSoles } from "@/lib/productos-vista";
import { detalleCampana, insigniaCampana, type PrecioDeHoy } from "@/lib/precio-de-hoy";

/**
 * El precio de una prenda que una campaña rebaja hoy (ADR-0472): el de lista tachado, el que cobra la caja y la insignia «−10 %».
 * Lo usan la Grilla, la Tabla y la vista rápida de Productos, que hasta el 2026-10-21 mostraban solo el de lista y hacían creer que la
 * etiqueta con descuento «no guardó el precio». Al pasar el mouse (y para el lector de pantalla) dice la campaña, hasta cuándo y los
 * dos precios; con `nombre`, la campaña y su fecha también se leen a la vista, sin mouse.
 */
export function PrecioConCampana({
  precio,
  nombre = false,
  enUnaLinea = false,
  className = "",
}: {
  precio: PrecioDeHoy;
  nombre?: boolean;
  /** En una celda de la Tabla: la insignia no baja a otra línea (la fila no crece por ella). */
  enUnaLinea?: boolean;
  className?: string;
}) {
  const detalle = detalleCampana(precio);
  return (
    <span title={detalle} className={`inline-flex items-baseline gap-x-1.5 gap-y-0.5 ${enUnaLinea ? "flex-nowrap" : "flex-wrap"} ${className}`}>
      <span className="sr-only">{detalle}</span>
      <s aria-hidden className="text-[0.8em] font-normal text-tinta/55">
        {rangoSoles([precio.lista.desde, precio.lista.hasta])}
      </s>
      <span aria-hidden>{rangoSoles([precio.cobra.desde, precio.cobra.hasta])}</span>
      <span aria-hidden className="self-center">
        <Chip tono="pizarra" versalitas={false}>
          {insigniaCampana(precio)}
        </Chip>
      </span>
      {nombre && (
        <span aria-hidden className="font-normal text-tinta/65">
          {precio.campana.nombre}
          {precio.campana.hasta ? ` · hasta el ${fechaCorta(precio.campana.hasta)}` : ""}
          {precio.otras > 0 ? ` y ${precio.otras === 1 ? "otra campaña" : `${precio.otras} campañas más`}` : ""}
          {precio.rebajadas < precio.total ? ` · en ${precio.rebajadas} de ${precio.total} variantes` : ""}
        </span>
      )}
    </span>
  );
}

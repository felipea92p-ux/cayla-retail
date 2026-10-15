import { soles } from "@/lib/compras-reglas";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";

/**
 * Doce barras, una por mes (ADR-0128): lo facturado a un proveedor mes a mes. Desde la ronda 14 de /unificar (2026-10-15) es la pieza
 * de las barras por tiempo (`<BarrasTiempo>`): todas en arena, el mes en curso en tinta con su cifra, el monto de cada una en un globito
 * al pasar el mouse y un resumen para el lector. Crecen en cascada al abrir la vista rápida, así que el movimiento responde a un clic.
 */
export function BarrasMensuales({ serie, iniciales }: { serie: number[]; iniciales: string[] }) {
  const total = serie.reduce((a, b) => a + b, 0);
  const ultimo = serie.length - 1;
  return (
    <BarrasTiempo
      barras={serie.map((v, i) => ({ clave: String(i), valor: v, etiqueta: iniciales[i], tip: soles(v), cifra: soles(v) }))}
      destacada={String(ultimo)}
      alto={96}
      etiqueta={`Facturado en los últimos 12 meses: ${soles(total)}. El mes en curso: ${soles(serie[ultimo] ?? 0)}.`}
    />
  );
}

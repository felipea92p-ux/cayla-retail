import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/compras-reglas";
import type { TotalesHistorial } from "@/lib/ventas-historial";

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

// Las tres cifras de Ventas ▸ Historial (ADR-0144). Son del RANGO completo, no de la página: con
// paginado, la página nunca es «todo el período». Las anuladas se cuentan aparte y no suman a lo
// vendido ni al ticket promedio.
export function HistorialVentasTotales({ totales, periodo }: { totales: TotalesHistorial; periodo: string }) {
  const { resumen, parcial } = totales;
  // Pasado el tope (`TOPE_TOTALES`) los números serían parciales: se dice, no se muestran a medias.
  if (parcial) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra vacia etiqueta={`Vendido · ${periodo}`} valor="—">
          Hay más de 1,000 ventas en este rango: acótalo (una tienda, menos días) para ver los totales.
        </TarjetaCifra>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TarjetaCifra etiqueta={`Vendido · ${periodo}`} valor={soles(resumen.total)}>
        {plural(resumen.ventas, "venta", "ventas")} · {plural(resumen.unidades, "prenda", "prendas")}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Ticket promedio" valor={resumen.ventas > 0 ? soles(resumen.ticket) : "—"}>
        Lo que deja cada venta, sin contar las anuladas
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Anuladas" valor={String(resumen.anuladas)} tono={resumen.anuladas > 0 ? "text-rojo-profundo" : undefined}>
        {resumen.anuladas === 0 ? "Ninguna en el período" : "No suman a lo vendido"}
      </TarjetaCifra>
    </div>
  );
}

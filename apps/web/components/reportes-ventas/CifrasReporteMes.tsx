import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/flujo-caja-reglas";
import {
  cambio,
  comparacionDe,
  prendasPorVenta,
  sentidoDe,
  textoCambio,
  ticketPromedio,
  tramoEnPalabras,
  type Comparacion,
  type ReporteMes,
} from "@/lib/reportes-ventas-reglas";

// Las cuatro cifras de «Ventas del mes» (maqueta docs/maquetas/reportes-ventas-2026-11/): vendido, ventas, ticket promedio y prendas, cada una contra
// el mismo tramo del mes anterior. «Devuelto» ya no es una cifra (Felipe, 2026-11-04). Es la `TarjetaCifra` de siempre (ADR-0358): nada propio.

const ENTERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const UNA_DECIMAL = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });

/** «↑ +11,6 % vs septiembre»: el sentido va en el trazo y en la palabra, no solo en el color. */
function Cambio({ c, comparacion }: { c: number | null; comparacion: Comparacion }) {
  if (!comparacion.hay) return null; // el motivo se dice UNA vez, bajo las cifras (no en cada una)
  const sentido = sentidoDe(c);
  if (sentido === null) return <>{comparacion.frase}: no hay con qué compararlo</>;
  const Icono = sentido === "sube" ? ArrowUp : sentido === "baja" ? ArrowDown : Minus;
  const bueno = sentido === "igual" ? null : sentido === "sube";
  const tono = bueno === null ? "text-taupe" : bueno ? "text-verde-profundo" : "text-ambar-profundo";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className={`inline-flex items-center gap-1 font-semibold ${tono}`}>
        <Icono aria-hidden className="h-3 w-3" />
        {textoCambio(c)}
      </span>
      <span>{comparacion.frase}</span>
    </span>
  );
}

export function CifrasReporteMes({ r }: { r: ReporteMes }) {
  const comparacion = comparacionDe(r);
  const { actual, anterior } = r;
  const ticket = ticketPromedio(actual);
  const porVenta = prendasPorVenta(actual);
  return (
    <div className="space-y-3">
    <div data-guia="reportes.cifras" className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Las cifras del mes">
      <TarjetaCifra etiqueta="Vendido" valor={soles(actual.vendido)} pie={tramoEnPalabras(r)}>
        <Cambio c={cambio(actual.vendido, anterior.vendido)} comparacion={comparacion} />
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Ventas" valor={ENTERO.format(actual.tickets)} unidad={actual.tickets === 1 ? "venta" : "ventas"} pie="sin anuladas ni de prueba">
        <Cambio c={cambio(actual.tickets, anterior.tickets)} comparacion={comparacion} />
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Ticket promedio" valor={ticket === null ? null : soles(ticket)} pie="lo que deja cada venta">
        {ticket === null ? "Sin ventas este mes" : <Cambio c={cambio(ticket, ticketPromedio(anterior))} comparacion={comparacion} />}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Prendas" valor={ENTERO.format(actual.unidades)} unidad={actual.unidades === 1 ? "prenda" : "prendas"} pie={porVenta === null ? undefined : `${UNA_DECIMAL.format(porVenta)} por venta`}>
        <Cambio c={cambio(actual.unidades, anterior.unidades)} comparacion={comparacion} />
      </TarjetaCifra>
    </div>
    {!comparacion.hay && <p className="texto-detalle text-taupe">{comparacion.motivo}</p>}
    </div>
  );
}

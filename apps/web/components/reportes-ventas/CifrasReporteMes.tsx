import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { soles } from "@/lib/flujo-caja-reglas";
import {
  cambio,
  comparacionDe,
  parteDevuelta,
  prendasPorVenta,
  sentidoDe,
  textoCambio,
  ticketPromedio,
  tramoEnPalabras,
  type Comparacion,
  type ReporteMes,
} from "@/lib/reportes-ventas-reglas";

// Las cinco cifras de «Ventas del mes» (maqueta docs/maquetas/reportes-ventas-2026-11/): vendido, ventas, ticket promedio, prendas y devuelto,
// cada una contra el mismo tramo del mes anterior. Es la `TarjetaCifra` de siempre (ADR-0358): nada propio.

const ENTERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const UNA_DECIMAL = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });
const CENTAVOS = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «↑ +11,6 % vs septiembre»: el sentido va en el trazo y en la palabra, no solo en el color. `inverso`: subir es malo (lo devuelto). */
function Cambio({ c, comparacion, inverso = false }: { c: number | null; comparacion: Comparacion; inverso?: boolean }) {
  if (!comparacion.hay) return null; // el motivo se dice UNA vez, bajo las cifras (no en cada una)
  const sentido = sentidoDe(c);
  if (sentido === null) return <>{comparacion.frase}: no hay con qué compararlo</>;
  const Icono = sentido === "sube" ? ArrowUp : sentido === "baja" ? ArrowDown : Minus;
  const bueno = sentido === "igual" ? null : inverso ? sentido === "baja" : sentido === "sube";
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
  const parte = parteDevuelta(actual);
  return (
    <div className="space-y-3">
    <div data-guia="reportes.cifras" className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5" role="group" aria-label="Las cifras del mes">
      <TarjetaCifra etiqueta="Vendido" valor={soles(actual.vendido)} className="col-span-2 lg:col-span-1" pie={tramoEnPalabras(r)}>
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
      <TarjetaCifra etiqueta="Devuelto" valor={CENTAVOS.format(actual.devuelto)} pie="devoluciones aprobadas en el mes" punto={parte !== null && parte > 0.05 ? "ambar" : undefined}>
        {parte === null ? "Sin ventas este mes" : <>{UNA_DECIMAL.format(parte * 100)} % de lo vendido</>}
      </TarjetaCifra>
    </div>
    {!comparacion.hay && <p className="texto-detalle text-taupe">{comparacion.motivo}</p>}
    </div>
  );
}

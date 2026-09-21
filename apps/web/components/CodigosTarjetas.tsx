import { CalendarClock, CalendarX, PowerOff, TicketCheck } from "lucide-react";
import { DIAS_CODIGO_POR_VENCER, type ResumenDeCodigos } from "@/lib/facturacion-codigos-reglas";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaKpiVidrio } from "@/components/ui/TarjetaKpiVidrio";

// Las cuatro tarjetas de arriba de Códigos de descuento (ADR-0124): el mismo vidrio que las de las
// otras vistas. Las cuentas salen de `resumenDeCodigos` contra «hoy» en Lima, la misma fecha con la
// que `registrar_venta` valida un código al cobrar: lo que la tarjeta dice que funciona es lo que
// el punto de venta acepta. Vigentes y Apagados solo informan; Por vencer y Vencidos piden orden.

export function CodigosTarjetas({ resumen }: { resumen: ResumenDeCodigos }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <TarjetaKpiVidrio
        etiqueta="Vigentes"
        tono="taupe"
        icono={<TicketCheck size={15} strokeWidth={1.75} />}
        indice={0}
        valor={<CifraAnimada valor={resumen.vigentes} />}
        contexto={
          <>
            {resumen.vigentes === 0 ? "Ninguno funciona hoy." : "Funcionan hoy en el punto de venta."}
            {resumen.programados > 0 && ` ${resumen.programados} ${resumen.programados === 1 ? "empieza" : "empiezan"} más adelante.`}
          </>
        }
      />

      <TarjetaKpiVidrio
        etiqueta={`Por vencer (${DIAS_CODIGO_POR_VENCER} d)`}
        tono={resumen.porVencer > 0 ? "ambar" : "verde"}
        icono={<CalendarClock size={15} strokeWidth={1.75} />}
        indice={1}
        colorearCifra
        valor={<CifraAnimada valor={resumen.porVencer} />}
        contexto={resumen.porVencer > 0 ? `Vencen en los próximos ${DIAS_CODIGO_POR_VENCER} días.` : "Ninguno vence esta semana."}
      />

      <TarjetaKpiVidrio
        etiqueta="Vencidos"
        tono={resumen.vencidos > 0 ? "ambar" : "verde"}
        icono={<CalendarX size={15} strokeWidth={1.75} />}
        indice={2}
        colorearCifra
        valor={<CifraAnimada valor={resumen.vencidos} />}
        contexto={resumen.vencidos > 0 ? "Su fecha ya pasó y siguen prendidos: apágalos para ordenar." : "Ninguno."}
      />

      <TarjetaKpiVidrio
        etiqueta="Apagados"
        tono="taupe"
        icono={<PowerOff size={15} strokeWidth={1.75} />}
        indice={3}
        valor={<CifraAnimada valor={resumen.apagados} />}
        contexto={resumen.apagados > 0 ? "Apagados a mano; un código usado nunca se borra." : "Ninguno apagado."}
      />
    </div>
  );
}

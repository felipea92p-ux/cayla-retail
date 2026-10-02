import { Banknote, CalendarX, FileText, Hourglass } from "lucide-react";
import { HORAS_PROFORMA_POR_VENCER } from "@cayla-retail/shared";
import type { ResumenProformas } from "@/lib/facturacion-reglas";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaKpiVidrio } from "@/components/ui/TarjetaKpiVidrio";
import { BarraApilada, Puntos } from "@/components/ComprobantesGraficos";
import { soles } from "@/lib/compras-reglas";

// Las cuatro tarjetas de arriba de Proformas (ADR-0124): el mismo vidrio que las del Resumen y de
// Comprobantes. Salen de `resumenProformas`, la misma cuenta que el contador de la pestaña, así que
// una proforma «vigente» en la base cuyo plazo ya pasó cuenta como vencida y NO como plata por
// cobrar. Todas miden la cola de trabajo (las vigentes de cualquier mes), no el mes que se mira.
// Desde 2026-09-26 cada una dibuja su cifra con colores CAYLA (`ComprobantesGraficos`): verde = vigente,
// ámbar = por vencer, neutro = vencida. Nunca el rojo.

export function ProformasTarjetas({ resumen, montoPorVencer }: { resumen: ResumenProformas; /** Lo cotizado en las que vencen pronto. */ montoPorVencer: number }) {
  const enPie = resumen.vigentes + resumen.vencidas;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <TarjetaKpiVidrio
        etiqueta="Vigentes"
        tono="taupe"
        icono={<FileText size={15} strokeWidth={1.75} />}
        indice={2}
        valor={<CifraAnimada valor={resumen.vigentes} />}
        contexto={resumen.vigentes === 0 ? "Ninguna en pie." : "Siguen valiendo, de cualquier mes."}
      >
        {enPie > 0 && <Puntos encendidos={resumen.vigentes} total={enPie} clase="g-alza" />}
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta="Monto cotizado"
        tono="taupe"
        icono={<Banknote size={15} strokeWidth={1.75} />}
        indice={3}
        valor={<CifraAnimada valor={resumen.monto} formato="soles" />}
        contexto={resumen.vigentes === 0 ? "Nada cotizado en pie." : "Lo que suman las vigentes, sin contar las vencidas."}
      >
        {resumen.monto > 0 && (
          <BarraApilada
            partes={[
              { valor: resumen.monto - montoPorVencer, clase: "g-alza", texto: "Vigente", mostrar: soles(resumen.monto - montoPorVencer) },
              { valor: montoPorVencer, clase: "g-baja", texto: "Por vencer", mostrar: soles(montoPorVencer) },
            ]}
          />
        )}
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta={`Por vencer (${HORAS_PROFORMA_POR_VENCER} h)`}
        tono={resumen.porVencer > 0 ? "ambar" : "verde"}
        icono={<Hourglass size={15} strokeWidth={1.75} />}
        indice={4}
        colorearCifra
        valor={<CifraAnimada valor={resumen.porVencer} />}
        contexto={resumen.porVencer > 0 ? "Son los clientes con más chance de volver hoy a comprar." : "Ninguna vence pronto."}
      >
        {resumen.vigentes > 0 && <Puntos encendidos={resumen.porVencer} total={resumen.vigentes} clase="g-baja" />}
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta="Vencidas"
        tono={resumen.vencidas > 0 ? "ambar" : "verde"}
        icono={<CalendarX size={15} strokeWidth={1.75} />}
        indice={5}
        colorearCifra
        valor={<CifraAnimada valor={resumen.vencidas} />}
        contexto={resumen.vencidas > 0 ? "Ya pasó su plazo: el cliente ya no tiene el precio que se le cotizó." : "Ninguna vencida."}
      >
        {enPie > 0 && <Puntos encendidos={resumen.vencidas} total={enPie} clase="g-neutro" />}
      </TarjetaKpiVidrio>
    </div>
  );
}

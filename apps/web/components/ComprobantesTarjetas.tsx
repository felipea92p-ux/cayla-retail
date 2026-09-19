import { Banknote, FileText, OctagonAlert, Send } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import type { Comprobante } from "@/lib/comprobantes-reglas";
import { montosDelMes } from "@/lib/facturacion-comprobantes-reglas";
import type { ResumenPorEnviar } from "@/lib/facturacion-reglas";
import { antiguedad, progresoDeEnvio } from "@/lib/facturacion-resumen-reglas";
import { Ayuda } from "@/components/Ayuda";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaKpiVidrio } from "@/components/ui/TarjetaKpiVidrio";
import { BarraDeEnvio } from "@/components/ResumenVisualizaciones";

// Las cuatro tarjetas de arriba de Comprobantes (ADR-0124): el mismo vidrio que las del Resumen,
// con las cuentas del mes. Emitidos y Monto facturado son DEL MES que se mira; Pendientes y
// Rechazados son la cola de SUNAT completa, de cualquier mes (un pendiente de hace tres semanas
// sigue esperando), y lo dicen. Es de servidor: decide tono y texto; el dibujo vive en
// `TarjetaKpiVidrio`. Si la cola no se pudo leer, sus dos tarjetas lo dicen y las otras siguen.

export function ComprobantesTarjetas({
  comprobantes,
  porEnviar,
  periodo,
  ahora,
}: {
  /** Los comprobantes del mes que se mira. */
  comprobantes: Comprobante[];
  /** La cola de SUNAT sin filtro de mes; `null` si la lectura falló. */
  porEnviar: ResumenPorEnviar | null;
  /** «este mes» o «en agosto»: cómo se dice el mes que se mira (`periodoDelMes`). */
  periodo: string;
  ahora: Date;
}) {
  const m = montosDelMes(comprobantes);
  const delMes = periodo.charAt(0).toUpperCase() + periodo.slice(1);
  const { enviados, total } = progresoDeEnvio(comprobantes);

  // `porEnviar.porEnviar` ya trae adentro a los rechazados: acá se separan en dos tarjetas.
  const rechazados = porEnviar?.rechazados ?? 0;
  const pendientes = porEnviar ? porEnviar.porEnviar - rechazados : 0;

  // Lo que se dice bajo «Monto facturado»: solo lo que hay. Una nota de crédito ya está restada.
  const aparte = [m.deprueba > 0 ? `${soles(m.deprueba)} de prueba` : null, m.sinEnviar > 0 ? `${soles(m.sinEnviar)} sin enviar` : null].filter(Boolean);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <TarjetaKpiVidrio
        etiqueta="Emitidos"
        tono="taupe"
        icono={<FileText size={15} strokeWidth={1.75} />}
        indice={0}
        valor={<CifraAnimada valor={m.emitidos} />}
        contexto={
          <>
            {delMes} · boletas, facturas y notas.
            {m.cuantosDePrueba > 0 && (
              <>
                {" "}
                <span className="font-semibold text-tinta">{m.cuantosDePrueba} de prueba</span>
                <Ayuda titulo="Comprobante de prueba">
                  Se transmitió a la plataforma de pruebas de Lucode, no a SUNAT. Tiene número y PDF, pero no vale como comprobante de pago: no
                  sustenta la venta ni el crédito fiscal de la clienta. Sale de ahí cuando el sistema apunta al ambiente de producción.
                </Ayuda>
              </>
            )}
          </>
        }
      />

      <TarjetaKpiVidrio
        etiqueta="Monto facturado"
        tono="taupe"
        icono={<Banknote size={15} strokeWidth={1.75} />}
        indice={1}
        valor={<CifraAnimada valor={m.facturado} formato="soles" />}
        contexto={
          <>
            Aceptado por SUNAT, sin pruebas{m.notasDeCredito > 0 ? ` y menos ${soles(m.notasDeCredito)} de notas de crédito` : ""}.
            {aparte.length > 0 && <> Aparte: {aparte.join(" · ")}.</>}
          </>
        }
      />

      <TarjetaKpiVidrio
        etiqueta="Pendientes de enviar"
        tono={!porEnviar ? "taupe" : pendientes > 0 ? "ambar" : "verde"}
        icono={<Send size={15} strokeWidth={1.75} />}
        indice={2}
        colorearCifra
        // Sin `CifraAnimada`, igual que «Por enviar» del Resumen: es una cola que sube y baja.
        valor={
          porEnviar ? (
            <span key={pendientes} className="anim-asentar inline-block">
              {pendientes}
            </span>
          ) : (
            "—"
          )
        }
        contexto={
          !porEnviar ? (
            "No se pudo leer la cola de SUNAT."
          ) : pendientes === 0 ? (
            "Todo al día."
          ) : (
            <>
              Con su número reservado, sin transmitir
              {rechazados === 0 && porEnviar.masAntiguoAt && <> · la más antigua: {antiguedad(porEnviar.masAntiguoAt, ahora)}</>}.
              <Ayuda titulo="Pendiente de enviar">
                El comprobante ya tiene su número oficial reservado (nadie más puede usarlo), pero todavía no se transmitió a SUNAT. Si SUNAT está
                caída, el número no se pierde: se reintenta después. Esta cuenta suma todos los meses, no solo el que estás mirando.
              </Ayuda>
            </>
          )
        }
      >
        <BarraDeEnvio enviados={enviados} total={total} cuando={periodo} />
      </TarjetaKpiVidrio>

      <TarjetaKpiVidrio
        etiqueta="Rechazados"
        tono={!porEnviar ? "taupe" : rechazados > 0 ? "rojo" : "verde"}
        icono={<OctagonAlert size={15} strokeWidth={1.75} />}
        indice={3}
        colorearCifra
        valor={
          porEnviar ? (
            <span key={rechazados} className="anim-asentar inline-block">
              {rechazados}
            </span>
          ) : (
            "—"
          )
        }
        contexto={
          !porEnviar
            ? "No se pudo leer la cola de SUNAT."
            : rechazados === 0
              ? "Ninguno."
              : "SUNAT no los aceptó: el motivo está en su fila. Suma todos los meses."
        }
      />
    </div>
  );
}

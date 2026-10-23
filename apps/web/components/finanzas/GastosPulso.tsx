import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { montoBandeja, type Bandeja, type CosaPorRevisar } from "@/lib/gastos-pulso-reglas";

// Gastos en camino A (Felipe 2026-10-15): la bandeja, lo que falta revisar, de a UNA cosa, con el botón que la resuelve
// (clasificar la salida de caja o registrar el fijo). «¿En qué se fue la plata?» lo responde ahora el retazo del telar (ADR-0493).
// Los modales que resuelven ya existen en el panel: aquí solo se eligen. Sin estado propio.

const entra = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });

export function GastosPulso({
  bandeja,
  onResolver,
  onVerTodas,
  sinComprobante,
  onVerSinComprobante,
}: {
  bandeja: Bandeja;
  onResolver: (cosa: CosaPorRevisar) => void;
  onVerTodas: () => void;
  /** Gastos del mes sin boleta ni factura (`fn_gastos_panel`): no se resuelven de a uno, se filtran en la lista. */
  sinComprobante: number;
  onVerSinComprobante: () => void;
}) {
  const primera = bandeja.cosas[0];
  return (
    <>
      <div {...entra("", 5)}>
        <Superficie pad guia="fin-gastos.bandeja">
          <CabeceraBloque titulo={bandeja.frase} bajada={bandeja.n > 0 ? `${montoBandeja(bandeja)}. Una por una: el sistema propone y tú solo dices de qué fue.` : "Cada salida de caja ya dice qué fue y los fijos del mes están registrados."}>
            <Chip tono={bandeja.n === 0 ? "verde" : "ambar"} vivo={bandeja.n > 0}>
              {bandeja.n === 0 ? "Al día" : `${bandeja.n} por revisar`}
            </Chip>
          </CabeceraBloque>
          {primera && (
            <div className="fin-gastos-cosa" data-tipo={primera.tipo}>
              <div className="min-w-0">
                <span className="versalita">{primera.tipo === "egreso" ? "Salida de caja sin clasificar" : "Gasto fijo del mes sin registrar"}</span>
                <b>{primera.titulo}</b>
                <p>{primera.detalle}</p>
              </div>
              <div className="fin-gastos-cosa-der">
                <span className="fin-gastos-cosa-monto num">{soles(primera.monto)}</span>
                <button type="button" className="btn-cayla btn-primario" onClick={() => onResolver(primera)} aria-haspopup="dialog" data-guia="fin-gastos.resolver">
                  {primera.accion}
                </button>
              </div>
            </div>
          )}
          {sinComprobante > 0 && (
            <p className="fin-gastos-cosa-mas" data-guia="fin-gastos.sin-comprobante">
              {sinComprobante} {sinComprobante === 1 ? "gasto no tiene" : "gastos no tienen"} boleta ni factura: sin comprobante no recuperas su IGV.{" "}
              <button type="button" className="btn-cayla btn-enlace" onClick={onVerSinComprobante}>
                Ver {sinComprobante === 1 ? "cuál" : "cuáles"}
              </button>
            </p>
          )}
          {bandeja.n > 1 && (
            <p className="fin-gastos-cosa-mas">
              Y {bandeja.n - 1} {bandeja.n - 1 === 1 ? "cosa más" : "cosas más"}.{" "}
              <button type="button" className="btn-cayla btn-enlace" onClick={onVerTodas}>
                Ver todas
              </button>
            </p>
          )}
        </Superficie>
      </div>
    </>
  );
}

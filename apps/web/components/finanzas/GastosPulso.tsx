import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import { montoBandeja, type Bandeja, type CosaPorRevisar } from "@/lib/gastos-pulso-reglas";
import { DESDE_EL_UMBRAL } from "@/lib/gastos-extracto-reglas";

// Gastos en camino A (Felipe 2026-10-15): la bandeja, lo que falta revisar, de a UNA cosa, con el botón que la resuelve
// (clasificar la salida de caja o registrar el fijo). «¿En qué se fue la plata?» lo responden ahora los hilos del telar (ADR-0493, act. 2026-10-30).
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
  /**
   * Lo grande sin boleta ni factura del mes y el IGV que se recuperaría (`sinComprobanteGrande`, lo mismo que marca la lista): no se resuelve
   * de a uno, se filtra en la lista. Lo chico sin papel (el mototaxi, el baño) no se avisa (Felipe 2026-10-30).
   */
  sinComprobante: { n: number; igv: number };
  onVerSinComprobante: () => void;
}) {
  const primera = bandeja.cosas[0];
  return (
    <>
      <div {...entra("", 5)}>
        <Superficie pad guia="fin-gastos.bandeja">
          <CabeceraBloque titulo={bandeja.frase} bajada={bandeja.n > 0 ? `${montoBandeja(bandeja)}. Una por una: el sistema propone y tú solo dices de qué fue.` : bandeja.bajadaVacia}>
            <Chip tono={bandeja.n === 0 ? "verde" : "ambar"} vivo={bandeja.n > 0}>
              {bandeja.chip}
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
          {sinComprobante.n > 0 && (
            <p className="fin-gastos-cosa-mas" data-guia="fin-gastos.sin-comprobante">
              {sinComprobante.n} {sinComprobante.n === 1 ? "gasto" : "gastos"} {DESDE_EL_UMBRAL} {sinComprobante.n === 1 ? "no tiene" : "no tienen"} boleta ni factura: con
              factura recuperarías {soles(sinComprobante.igv)} de IGV.{" "}
              <button type="button" className="btn-cayla btn-enlace" onClick={onVerSinComprobante}>
                Ver {sinComprobante.n === 1 ? "cuál" : "cuáles"}
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

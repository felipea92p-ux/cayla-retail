"use client";

import { avanceDe, textoDePendientes } from "@/lib/por-regularizar-mesa";
import { DIAS_PARA_VENCER } from "@/lib/por-regularizar-reglas";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { PorQue } from "./PorQue";

/**
 * La franja de arriba de Ventas sin registrar (ADR-0360; reemplaza a las cuatro tarjetas y al anillo): lo que falta, lo urgente y el
 * avance, en una línea. «N vencidas» es un botón: deja la lista solo con lo urgente, y tocarlo otra vez la devuelve a como estaba. El
 * descuento y el sobreprecio del mes quedaron en chico: ayudan a entender, no a decidir qué identificar primero.
 *
 * `inicial` son las pendientes con que se abrió la pantalla: la barra cuenta lo hecho EN ESTA VISITA (`avanceDe`).
 */
export function FranjaAvance({
  pendientes,
  vencidas,
  descuentoMes,
  sobreprecioMes,
  inicial,
  soloVencidas,
  onVencidas,
}: {
  pendientes: number;
  vencidas: number;
  descuentoMes: number;
  sobreprecioMes: number;
  inicial: number;
  soloVencidas: boolean;
  onVencidas: () => void;
}) {
  const { proporcion } = avanceDe(inicial, pendientes);
  return (
    <section aria-label="Avance" className="card-cayla vsr-franja anim-sube">
      <div className="vsr-f-prog">
        <p className="vsr-f-top">
          <b className="vsr-f-n">
            <CifraQueCuenta valor={pendientes} alMontar />
          </b>
          <span>{textoDePendientes(pendientes)}</span>
        </p>
        <div className="vsr-f-bar" role="progressbar" aria-label="Avance de esta visita" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(proporcion * 100)}>
          <i style={{ transform: `scaleX(${proporcion})` }} />
        </div>
      </div>
      {vencidas > 0 && (
        <button type="button" className="vsr-venc" aria-pressed={soloVencidas} onClick={onVencidas}>
          <i aria-hidden />
          <b className="tabular-nums">{vencidas}</b> {vencidas === 1 ? "vencida" : "vencidas"}
          {soloVencidas && <span className="font-normal"> · ver todas</span>}
        </button>
      )}
      {vencidas > 0 && (
        <PorQue etiqueta="¿Qué es «vencida»?">
          <p>
            Una venta <b>vencida</b> es la que lleva más de {DIAS_PARA_VENCER} días sin identificar. Ya se le avisó al líder. Conviene empezar por ellas: mientras tanto el stock de esa prenda
            está de más.
          </p>
        </PorQue>
      )}
      <p className="vsr-f-mes">
        Este mes: <b>S/ {descuentoMes.toFixed(2)}</b> de descuento · <b>S/ {sobreprecioMes.toFixed(2)}</b> de sobreprecio
      </p>
    </section>
  );
}

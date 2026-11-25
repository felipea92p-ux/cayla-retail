"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Check, Clock, Printer, TriangleAlert } from "lucide-react";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { usePedidaALaCaja } from "@/components/impresion/usePedidaALaCaja";
import type { VentaOk } from "@/components/PuntoDeVenta";
import { money } from "@/lib/money";
import { ETIQUETA_TIPO } from "@/lib/comprobantes-reglas";
import { textoNumeroRecibo, type ReciboVenta } from "@/lib/recibo-reglas";
import { textoCuponCobrado } from "@/lib/club-puntos-reglas";
import { caraDelAviso, ESPERA_LARGA_MS, type CaraDelAviso, type FaseDelAviso } from "@/lib/imprimir-al-cobrar";

const ICONO: Record<CaraDelAviso["tono"], { Icono: typeof Check; clase: string }> = {
  espera: { Icono: Printer, clase: "text-tinta" },
  ok: { Icono: Check, clase: "text-verde-profundo" },
  cola: { Icono: Clock, clase: "text-ambar-profundo" },
  mal: { Icono: TriangleAlert, clase: "text-rojo-profundo" },
};

/**
 * El aviso que reemplaza a la hoja «Venta registrada» al cobrar (maqueta `docs/maquetas/impresion-vender-2026-11/`, aprobada por Felipe el
 * 2026-11-25): dice si la boleta salió, su número, el vuelto que hay que entregar y deja dos botones, «Nueva venta» (con Enter) y
 * «Reimprimir». En el celular la boleta va a la cola de la caja: dice «Enviando a la caja», «Boleta impresa en la caja» o, si la caja tarda
 * más de 15 s, «Sigue en la cola de la caja»; nunca frena la venta siguiente y no ofrece imprimir aquí (el celular no tiene impresora).
 *
 * No imprime: quien imprime aquí es `ImpresionAlCobrar` (Vender lo deja montado hasta que la boleta se mandó, aunque este aviso ya se haya
 * cerrado) y quien pide a la caja es `colaDeLaCaja.ts` (sigue preguntando después de cerrar, para la tuerca). Lo que dice sale de la regla
 * pura `caraDelAviso`.
 */
export function AvisoAlCobrar({
  venta,
  donde,
  faseAqui,
  onReimprimir,
  onClose,
  alCerrarEnfocar,
}: {
  venta: VentaOk & { recibo: ReciboVenta };
  donde: "aqui" | "caja";
  /** Cómo va la impresión en este equipo (solo con `donde="aqui"`). */
  faseAqui: "imprimiendo" | "impresa" | "fallo";
  /** Manda la boleta otra vez a la impresora de este equipo (Reimprimir, o Reintentar si no salió). */
  onReimprimir: () => void;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLElement | null>;
}) {
  const r = venta.recibo;
  const pedida = usePedidaALaCaja(venta.ventaId ?? null, donde === "caja");
  // «Sigue en la cola de la caja» recién después de 15 s: antes, la caja suele tomarla en 2 a 5 s (Trujillo, 2026-11-24).
  const [esperaLarga, setEsperaLarga] = useState(false);
  useEffect(() => {
    if (donde !== "caja") return;
    const reloj = window.setTimeout(() => setEsperaLarga(true), ESPERA_LARGA_MS);
    return () => window.clearTimeout(reloj);
  }, [donde]);

  const fase: FaseDelAviso = donde === "aqui" ? { donde, fase: faseAqui } : { donde, fase: pedida.estado.fase, esperaLarga };
  const cara = caraDelAviso(fase);
  const { Icono, clase } = ICONO[cara.tono];

  /** El botón principal se lleva el foco (Enter) sin mover la hoja, como en «Venta registrada». */
  const principal = useRef<HTMLButtonElement | null>(null);
  const enfocar = useCallback((el: HTMLButtonElement | null) => {
    principal.current = el;
    el?.focus({ preventScroll: true });
  }, []);
  // Al cambiar de estado, un botón puede desaparecer con el foco adentro («Reimprimir» se va mientras imprime): el foco quedaba suelto en la
  // hoja y Enter ya no abría la venta nueva (medido en el banco, 2026-11-25). Si el foco no está en un botón, vuelve al principal.
  useEffect(() => {
    if (!(document.activeElement instanceof HTMLButtonElement)) principal.current?.focus({ preventScroll: true });
  }, [cara.titulo]);
  const reintentar = donde === "caja" ? pedida.reintentar : onReimprimir;

  return (
    <Modal
      titulo={cara.titulo}
      subtitulo={`${ETIQUETA_TIPO[r.tipo]} ${textoNumeroRecibo(r)} · ${money(venta.total)}`}
      arriba={
        <span aria-hidden className={`vd-lente mb-1 grid h-12 w-12 place-items-center rounded-full ${clase}`}>
          <Icono className="h-6 w-6" />
        </span>
      }
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
    >
      {(cerrar) => (
        <div className="space-y-4" role="status" aria-live="polite">
          {cara.nota && <p className="text-sm text-secundario">{cara.nota}</p>}

          {/* El vuelto, grande: es lo que la cajera hace con las manos en este momento (la hoja de antes lo ponía primero también). */}
          {r.vueltoTotal > 0 && (
            <div className="vd-placa flex items-baseline justify-between rounded-xl px-4 py-3">
              <span className="label-cayla text-xs text-secundario">Entregar vuelto</span>
              <span className="font-display text-3xl tabular-nums text-tinta">{money(r.vueltoTotal)}</span>
            </div>
          )}

          {venta.cupon && venta.cupon.monto > 0 && <p className="text-sm text-secundario">{textoCuponCobrado(venta.cupon.monto)}</p>}

          <div className="space-y-2">
            {cara.principal === "reintentar" ? (
              <>
                <button type="button" ref={enfocar} onClick={reintentar} className={`${botonPrimario} w-full`}>
                  Reintentar
                </button>
                <button type="button" onClick={cerrar} className={`${botonCancelar} w-full`}>
                  Nueva venta
                </button>
              </>
            ) : (
              <>
                <button type="button" ref={enfocar} onClick={cerrar} className={`${botonPrimario} w-full`}>
                  Nueva venta
                </button>
                {cara.reimprimir && (
                  <BotonImprimir onClick={onReimprimir} className="w-full whitespace-nowrap">
                    Reimprimir
                  </BotonImprimir>
                )}
              </>
            )}
          </div>
          {/* Con «Reintentar» como principal, Enter reintenta: la línea no promete una venta nueva. En el celular (la caja) no hay Enter. */}
          {cara.tono === "cola" ? (
            <p className="text-center text-sm text-tenue">La tuerca de Vender avisa cuando salga</p>
          ) : (
            cara.principal === "nueva-venta" && donde === "aqui" && <p className="text-center text-sm text-tenue">Enter abre una venta nueva</p>
          )}
        </div>
      )}
    </Modal>
  );
}

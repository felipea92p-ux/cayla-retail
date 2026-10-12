"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { NOMBRE_METODO, TEXTO_REDONDEO } from "@/lib/recibo-reglas";
import {
  alternarMedio,
  calcular,
  cambioEnEfectivo,
  camposDeCorregir,
  fraseDelCuadre,
  HINTS_CORREGIR_PAGO,
  MEDIOS_CORREGIBLES,
  repartoInicial,
  type Reparto,
  type VentaACorregir,
} from "@/lib/corregir-pago-reglas";

const s = (n: number) => `S/ ${n.toFixed(2)}`;
const idMonto = (m: string) => `corregir-pago-monto-${m}`;

/**
 * Corregir cómo se pagó una venta (ADR-0365, Felipe 2026-10-09): se marcó «Efectivo» y fue Yape, y la caja no cuadra. Se abre desde
 * el detalle de la venta en Ventas ▸ Historial, solo con su caja todavía abierta. La persona marca con qué pagó de verdad; el último
 * medio marcado se lleva lo que falta, así que la suma nunca queda distinta de lo cobrado. La base (`corregir_pagos_venta`) vuelve a
 * verificarlo todo, calcula el redondeo del efectivo y deja la foto de lo de antes.
 */
export function CorregirPagoModal({
  ventaId,
  comprobante,
  venta,
  onClose,
  onCorregido,
}: {
  ventaId: string;
  /** «B001-000123», para el título; null si la venta no tiene comprobante. */
  comprobante: string | null;
  venta: VentaACorregir;
  onClose: () => void;
  onCorregido: () => void;
}) {
  const [reparto, setReparto] = useState<Reparto>(() => repartoInicial(venta));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ¿La caja redondea el efectivo? (ADR-0311). Mientras no se sabe, se muestra exacto: la base redondea igual al guardar.
  const [redondea, setRedondea] = useState(false);
  const responsable = useResponsable();

  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_acepta_redondeo_efectivo")
      .then(({ data }) => vigente && setRedondea(data === true));
    return () => {
      vigente = false;
    };
  }, []);

  const calculo = useMemo(
    () => calcular(venta, reparto, redondea),
    [venta, reparto, redondea],
  );
  const campos = camposDeCorregir(calculo, {
    listo: responsable.listo,
    motivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);
  const cuadre = fraseDelCuadre(cambioEnEfectivo(venta, calculo));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!guia.puedeConfirmar || guardando) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await firmar(
      createClient().rpc("corregir_pagos_venta", {
        p_venta_id: ventaId,
        p_pagos: calculo.pagos,
        p_motivo: motivo.trim() || null,
      }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(err);
    // Un doble clic (o una respuesta que se perdió y se repite) llega como «ya estaban así»: lo pedido ya quedó guardado.
    if (err && err.hint !== "pagos_sin_cambios") {
      setError(
        err.hint && HINTS_CORREGIR_PAGO.has(err.hint) && err.message
          ? err.message
          : traducirError(err, "corregir el pago", {
              confirmarAntesDeRepetir: true,
            }),
      );
      return;
    }
    avisar.exito("Pago corregido", {
      detalle: cuadre ?? "El efectivo de la caja no cambia.",
    });
    onCorregido();
  }

  return (
    <Modal
      titulo="Corregir el pago"
      subtitulo={`${comprobante ? `Venta ${comprobante} · ` : ""}${s(venta.cobrado)}. Marca con qué pagó de verdad: la caja se vuelve a cuadrar sola.`}
      onClose={onClose}
      variante="hoja"
    >
      {(cerrar) => (
        <form onSubmit={guardar} className="space-y-6">
          <CampoGuiado
            id="medios"
            guia={guia}
            titulo="¿Con qué pagó?"
            ayuda="Puedes marcar más de uno"
            retiene="fila"
          >
            <div className="flex flex-wrap gap-2">
              {MEDIOS_CORREGIBLES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="pildora-cayla"
                  aria-pressed={reparto.medios.includes(m)}
                  onClick={() => setReparto((r) => alternarMedio(r, m))}
                >
                  {NOMBRE_METODO[m]}
                </button>
              ))}
            </div>

            {reparto.medios.length > 0 && (
              <div className="mt-4 space-y-3">
                {reparto.medios.slice(0, -1).map((m) => (
                  <label
                    key={m}
                    htmlFor={idMonto(m)}
                    className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 text-sm text-tinta"
                  >
                    <span>Cuánto con {NOMBRE_METODO[m]}</span>
                    <CampoTexto
                      id={idMonto(m)}
                      caja
                      etiqueta={`Cuánto con ${NOMBRE_METODO[m]}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={reparto.montos[m] ?? ""}
                      onChange={(ev) =>
                        setReparto((r) => ({
                          ...r,
                          montos: { ...r.montos, [m]: ev.target.value },
                        }))
                      }
                      className="text-right tabular-nums"
                    />
                  </label>
                ))}
                {calculo.resto && (
                  <p className="flex items-baseline justify-between gap-3 rounded-xl bg-hueso px-4 py-3 text-sm text-tinta">
                    <span>
                      {NOMBRE_METODO[calculo.resto]}
                      {reparto.medios.length > 1 && (
                        <span className="text-tinta/60"> · lo que falta</span>
                      )}
                    </span>
                    <span className="font-display text-lg tabular-nums">
                      {s(Math.max(0, calculo.montoResto))}
                    </span>
                  </p>
                )}
                {calculo.efectivo && calculo.efectivo.redondeo > 0 && (
                  <p className="text-xs text-tinta/65">
                    En efectivo se entregan {s(calculo.efectivo.aCobrar)} ·{" "}
                    {TEXTO_REDONDEO} {s(calculo.efectivo.redondeo)}
                  </p>
                )}
              </div>
            )}
          </CampoGuiado>

          <CampoGuiado
            id="motivo"
            guia={guia}
            titulo="¿Qué pasó?"
            ayuda="Opcional"
          >
            <CampoTexto
              etiqueta="Qué pasó"
              caja
              maxLength={200}
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
            />
          </CampoGuiado>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          {cuadre && !calculo.problema && !calculo.sinCambios && (
            <p className="nota-cayla text-sm">{cuadre}</p>
          )}
          {error && (
            <Aviso tono="error" titulo="No se corrigió el pago">
              {error}
            </Aviso>
          )}

          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Todo listo para guardar." />
            <div className="ml-auto flex gap-3">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
              >
                Guardar el pago
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

"use client";

import { useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { COLOR_ESTADO } from "@/components/analisis/piezas";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import type { ErrorEscritura } from "@/lib/error-escritura";
import {
  avisoLiquidarGuardado,
  cifraPrendas,
  efectoDeLiquidar,
  errorAlGuardarLiquidar,
  RPC_GUARDAR_LIQUIDAR,
  type EfectoLiquidar,
  type ErrorEnTresLineas,
} from "@/lib/analisis-liquidar-reglas";

// Análisis v4 (ADR-0356): la hoja que guarda «Liquidar desde» para TODAS las tiendas y todas las personas (Felipe, 2026-10-06).
// El control se mueve en «No se vende» y las prendas cambian de grupo en vivo; esta hoja confirma el número, muestra en dos tarjetas
// qué cambia en MI tienda (antes → ahora) y lo guarda firmado con el responsable (ADR-0161/0162), como toda operación que guarda.
//
// Un solo control (el combo «Responsable»): no lleva guía de foco (registro de modales, «no-aplica»). El botón se apaga hasta que
// haya alguien de turno y dice por qué. Si no hay nada que cambiar (ya rige ese número), solo lo dice y se cierra.

/** Sin tope, una conexión colgada dejaría la hoja bloqueada: a los 20 s se corta y se trata como respuesta incierta. */
const TOPE_ESPERA_MS = 20_000;

export function HojaLiquidarDesde({ dias, onCerrar, onGuardado }: { dias: number; onCerrar: () => void; onGuardado: () => void }) {
  const { datos } = useAnalisis();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ErrorEnTresLineas | null>(null);
  // Lo que se guardó, congelado: mientras la hoja sale, la pantalla ya puede traer el número nuevo (router.refresh) y la hoja no
  // debe cambiar de texto ni de botones en su salida.
  const [congelado, setCongelado] = useState<EfectoLiquidar | null>(null);
  const enVuelo = useRef(false);
  // Sobre todas las prendas de mi tienda (no solo las del buscador): el número vale para la red entera.
  const efecto = congelado ?? efectoDeLiquidar(datos.prendas, dias, datos.liquidarDesde);
  const ambar = { ["--c" as string]: COLOR_ESTADO.ate };

  async function guardar(cerrar: () => void) {
    if (enVuelo.current || !efecto.cambia || !responsable.listo) return;
    enVuelo.current = true;
    setGuardando(true);
    setError(null);
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let fallo: ErrorEscritura = null;
    try {
      const { error: e } = await firmar(
        createClient()
          .rpc(RPC_GUARDAR_LIQUIDAR as never, { p_dias: efecto.dias } as never)
          .abortSignal(control.signal),
        responsable.firma(),
      );
      fallo = e;
    } catch (x) {
      fallo = { message: x instanceof Error ? x.message : String(x), code: null };
    } finally {
      window.clearTimeout(tope);
    }
    if (fallo) {
      console.error(`${RPC_GUARDAR_LIQUIDAR}: ${fallo.message}`);
      // Si la base rechazó por el responsable (ya no está de turno), el combo vuelve a como vino y relee la lista.
      responsable.despues(fallo);
      enVuelo.current = false;
      setGuardando(false);
      setError(errorAlGuardarLiquidar(fallo, efecto));
      return;
    }
    // Guardado: la hoja sale tal como estaba, con «Guardando…» a la vista y sin volver a encender el botón mientras se va.
    setCongelado(efecto);
    const aviso = avisoLiquidarGuardado(efecto.dias);
    avisar.exito(aviso.texto, { detalle: aviso.detalle });
    onGuardado();
    cerrar();
  }

  return (
    <Modal
      titulo={`Liquidar desde ${efecto.dias} días`}
      subtitulo={efecto.cambia ? "Para todas las tiendas y todo el equipo." : "Así está para todas las tiendas."}
      onClose={onCerrar}
      variante="hoja"
      ancho="max-w-md"
      bloqueado={guardando}
      focoEnLaHoja
    >
      {(cerrar) => (
        <form
          className="analisis analisis-hoja"
          noValidate
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            void guardar(cerrar);
          }}
        >
          <div className="hechos">
            <div className="hecho" style={ambar}>
              <Icono nombre="reloj" />
              <b>{efecto.dias} días</b>
              <small>{efecto.cambia ? `sin venderse · antes ${efecto.guardado}` : "sin venderse"}</small>
            </div>
            <div className="hecho" style={ambar}>
              <Icono nombre="etiqueta" />
              <b>{cifraPrendas(efecto.enLiquidar)}</b>
              <small>
                a liquidar en {datos.sede.ciudad}
                {efecto.cambia ? ` · antes ${efecto.enLiquidarHoy}` : ""}
              </small>
            </div>
          </div>

          {efecto.cambia && (
            <div className="mt-5">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-lg bg-hueso px-3.5 py-3 text-[13px] leading-snug">
              <p className="font-semibold text-tinta">{error.que}</p>
              <p className="mt-0.5 text-tinta/80">{error.queda}</p>
              <p className="mt-0.5 text-tinta/80">{error.sigue}</p>
            </div>
          )}

          <div className="h-acciones">
            {efecto.cambia ? (
              <>
                <button
                  type="submit"
                  className="btn-cayla btn-primario"
                  disabled={!responsable.listo || guardando}
                  title={responsable.motivo ?? undefined}
                >
                  {guardando ? "Guardando…" : "Guardar para todos"}
                </button>
                <button type="button" className="btn-cayla btn-secundario" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="btn-cayla btn-secundario" onClick={cerrar}>
                Cerrar
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

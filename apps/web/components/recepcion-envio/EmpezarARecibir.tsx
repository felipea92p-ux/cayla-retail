"use client";

import { useEffect, useRef, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";
import { abrirDespacho } from "@/lib/recepcion-envio-acciones";
import { AVISO_DE_CORTE_APERTURA, mensajeDeLaRecepcion, sugiereRecargarRecepcion, type DetalleEnvio, type ResultadoApertura } from "@/lib/recepcion-envio-reglas";
import { LoQueTrae } from "./PiezasEnvio";

// El envío llegó a la tienda pero todavía va «en camino» en el sistema (ADR-0362, fase 4): un solo botón, «Empezar a recibir»
// (`abrir_despacho`). Abrirlo es el primer paso: desde ahí la compradora ya no lo puede anular y se cuenta lo que llegó. Antes se lee lo que
// trae. Firma quien recibe (el combo «Responsable»); si ya estaba abierto, la base devuelve lo mismo sin tocar nada.

export function EmpezarARecibir({
  detalle,
  sede,
  responsable,
  porCategoria = false,
  onAbierto,
}: {
  detalle: DetalleEnvio;
  sede: string;
  responsable: ControlResponsable;
  /** ADR-0393: se cuenta por categoría y lo demás puede quedar para después (la fase 4 contaba talla por talla). */
  porCategoria?: boolean;
  onAbierto: (r: ResultadoApertura | null) => void;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién recibe." }], { enModal: false });

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function abrir() {
    if (abriendo || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      guia.ir("responsable");
      return;
    }
    enVuelo.current = true;
    try {
      setAbriendo(true);
      setError(null);
      const { resultado, error: falla } = await abrirDespacho({ p_despacho_id: detalle.id, p_version: detalle.version }, responsable.firma());
      // Abrir es el primer paso de la recepción: el éxito no vacía el combo (se sigue recibiendo con la misma persona).
      if (falla) responsable.despues(falla);
      if (falla) {
        setAbriendo(false);
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_APERTURA, recargar: false });
        // Los avisos de esta fase vienen en palabras de tienda (también la decisión 17: quien firma hizo una de las órdenes).
        else setError({ texto: mensajeDeLaRecepcion(falla) ?? traducirError(falla, "empezar a recibir el envío"), recargar: esVersionCambiada(falla) || sugiereRecargarRecepcion(falla.message) });
        return;
      }
      onAbierto(resultado);
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <div className="space-y-6">
      <section data-guia="recepcion.trae" className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que trae">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-tinta">Lo que trae</h2>
          <p className="text-[13px] text-taupe">
            {detalle.numeroGuia ? `Guía ${detalle.numeroGuia} · ` : ""}
            {detalle.despachadoPor ? `lo envió ${detalle.despachadoPor}` : "en camino"}
          </p>
        </div>
        <LoQueTrae detalle={detalle} />
        {detalle.nota && <p className="nota-cayla">Nota de quien lo envió: {detalle.nota}</p>}
      </section>

      <section data-guia="recepcion.empezar" className="space-y-3" aria-label="Empezar a recibir">
        <p className="max-w-2xl text-sm text-tinta/75">
          Ábrelo cuando la caja esté en {sede}. Desde ese momento la compra ya no se puede anular y cuentas lo que llegó,{" "}
          {porCategoria ? "categoría por categoría: qué prendas son puede quedar para después." : "talla por talla y color por color."}
        </p>
        <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe" className="max-w-sm">
          <ComboResponsable control={responsable} deshabilitado={abriendo} />
        </CampoGuiado>
        <PieGuia guia={guia} listo="Todo listo para empezar." />
        {error && (
          <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo abrir el envío" accion={error.recargar ? <Boton type="button" onClick={() => window.location.reload()}>Recargar</Boton> : undefined}>
            {error.texto}
          </Aviso>
        )}
        <div className="flex justify-end">
          <Boton type="button" peso="primario" cargando={abriendo} onClick={() => void abrir()} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
            {abriendo ? "Abriendo…" : "Empezar a recibir"}
          </Boton>
        </div>
      </section>
    </div>
  );
}

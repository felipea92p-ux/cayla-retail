"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import type { OperacionEncolada } from "@/lib/cola-offline";

/**
 * El aviso de la cola sin conexión de un módulo (ADR-0210) — el de Vender (`PuntoDeVentaColaOffline`) hecho
 * genérico: separa lo que sigue esperando la red (sube solo, nada que hacer) de lo que la base rechazó (no se
 * reintenta solo y espera un «Descartar» en dos pasos: un solo clic nunca borra un trabajo ya hecho).
 */
export function ColaOfflineAviso({
  cola,
  onDescartar,
  uno,
  varias,
  className = "",
}: {
  cola: OperacionEncolada[];
  onDescartar: (token: string) => void;
  /** «recepción» / «recepciones»: cómo se llama lo que se guardó. */
  uno: string;
  varias: string;
  className?: string;
}) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  if (cola.length === 0) return null;

  const pendientes = cola.filter((x) => x.rechazo === null);
  const rechazadas = cola.filter((x) => x.rechazo !== null);

  return (
    <div className={`space-y-2 ${className}`}>
      {pendientes.length > 0 && (
        <Aviso
          tono="atencion"
          titulo={pendientes.length === 1 ? `1 ${uno} guardada sin conexión en este equipo` : `${pendientes.length} ${varias} guardadas sin conexión en este equipo`}
        >
          {pendientes.length === 1 ? "Subirá sola" : "Subirán solas"} cuando vuelva el internet. No cierres esta pestaña ni borres los datos del navegador.
          <ul className="mt-1 space-y-0.5 text-xs text-tinta/70">
            {pendientes.map((x) => (
              <li key={x.token}>· {x.resumen}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {rechazadas.map((x) => (
        <Aviso key={x.token} tono="error" titulo={`Una ${uno} guardada sin conexión no pudo subir`}>
          {x.resumen}: {x.rechazo}
          <span className="mt-2 flex flex-wrap items-center gap-2">
            {confirmando === x.token ? (
              <>
                <span className="text-tinta/70">¿Descartarla? No quedó nada registrado en el sistema.</span>
                {/* «Cancelar» antes de la acción, como en el pie de una hoja (ADR-0358, ronda 11). */}
                <button type="button" onClick={() => setConfirmando(null)} className="btn-cayla btn-secundario h-7 px-2 text-[11px]">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDescartar(x.token);
                    setConfirmando(null);
                  }}
                  className="btn-cayla btn-peligro h-7 px-2 text-[11px]"
                >
                  Sí, descartar
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmando(x.token)} className="btn-cayla btn-secundario h-7 shrink-0 px-2 text-[11px]">
                Descartar
              </button>
            )}
          </span>
        </Aviso>
      ))}
    </div>
  );
}

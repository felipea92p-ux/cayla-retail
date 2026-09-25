"use client";

import { useState } from "react";
import { CloudOff, TriangleAlert } from "lucide-react";
import type { OperacionEncolada } from "@/lib/cola-offline";

/**
 * El aviso de la cola sin conexión de un módulo (ADR-0209) — el de Vender (`PuntoDeVentaColaOffline`) hecho
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
    <div role="status" className={`anim-revelar space-y-2 rounded-xl border border-ambar/40 bg-ambar/10 px-4 py-3 ${className}`}>
      {pendientes.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-ambar-profundo">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p>
              {pendientes.length === 1 ? `1 ${uno} guardada sin conexión en este equipo` : `${pendientes.length} ${varias} guardadas sin conexión en este equipo`} —{" "}
              {pendientes.length === 1 ? "subirá sola" : "subirán solas"} cuando vuelva el internet. No cierres esta pestaña ni borres los datos del navegador.
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-tinta/70">
              {pendientes.map((x) => (
                <li key={x.token}>· {x.resumen}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {rechazadas.map((x) => (
        <div key={x.token} className="flex flex-wrap items-center gap-2 rounded-lg border border-rojo/30 bg-crema px-3 py-2 text-xs text-rojo-profundo">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Una {uno} guardada sin conexión ({x.resumen}) no pudo subir: {x.rechazo}
          </span>
          {confirmando === x.token ? (
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-tinta/70">¿Descartarla? No quedó nada registrado en el sistema.</span>
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
              <button type="button" onClick={() => setConfirmando(null)} className="btn-cayla btn-sutil h-7 px-2 text-[11px]">
                Cancelar
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmando(x.token)} className="btn-cayla btn-secundario h-7 shrink-0 px-2 text-[11px]">
              Descartar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

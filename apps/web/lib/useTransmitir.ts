"use client";

import { createElement, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { ConfirmarTransmision } from "@/components/ConfirmarTransmision";

/**
 * Transmitir un comprobante a SUNAT por Lucode (ADR-0005, ADR-0009): una sola implementación
 * para la fila de «Actividad de hoy» y la tabla de Comprobantes. `POST /api/lucode/emitir`, el
 * aviso de proceso y de resultado, y `router.refresh()` para que el estado, el hilo y los
 * contadores se actualicen solos.
 *
 * `transmitiendoId` va por fila y no como un estado global: transmitir la fila 3 no debe
 * deshabilitar el botón de la fila 1. Emitir y transmitir siguen separados a propósito (emitir no
 * puede depender de que un proveedor externo esté arriba, principio 9).
 */
export function useTransmitir(): { transmitiendoId: string | null; transmitir: (comprobanteId: string) => void; confirmacion: ReactNode } {
  const router = useRouter();
  const [transmitiendoId, setTransmitiendoId] = useState<string | null>(null);
  // Transmitir (y reintentar) guarda en la base: pide Responsable (ADR-0161, B4). El botón de la fila abre una
  // confirmación corta con el combo; quien llama al hook pinta `confirmacion` una vez, en cualquier lugar.
  const [pendienteId, setPendienteId] = useState<string | null>(null);

  function transmitir(comprobanteId: string) {
    setPendienteId(comprobanteId);
  }

  async function enviar(comprobanteId: string, encabezados: Record<string, string>) {
    setTransmitiendoId(comprobanteId);
    const cerrarProceso = avisar.proceso("Transmitiendo a SUNAT…");
    try {
      const respuesta = await fetch("/api/lucode/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...encabezados },
        body: JSON.stringify({ comprobante_id: comprobanteId }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        avisar.error("No se pudo transmitir el comprobante", { detalle: datos.error ?? undefined });
        return;
      }
      avisar.exito("Comprobante transmitido", { detalle: "SUNAT lo tiene; el estado se actualiza en la lista." });
      router.refresh();
    } catch {
      avisar.error("No se pudo transmitir el comprobante", { detalle: "No se pudo conectar con el servidor." });
    } finally {
      cerrarProceso();
      setTransmitiendoId(null);
    }
  }

  const confirmacion = pendienteId
    ? createElement(ConfirmarTransmision, {
        onClose: () => setPendienteId(null),
        onTransmitir: (encabezados: Record<string, string>) => {
          const id = pendienteId;
          setPendienteId(null);
          void enviar(id, encabezados);
        },
      })
    : null;

  return { transmitiendoId, transmitir, confirmacion };
}

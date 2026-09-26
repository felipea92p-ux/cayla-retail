"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { crearLector } from "@/components/EscanerCamara";
import { normalizarLectura } from "@/lib/escaner-reglas";

/* ====================================================================
   EscanerBusqueda · leer UNA etiqueta o boleta con la cámara y buscarla (Cambios, spike 2026-09-26)

   El escáner de Vender (`EscanerCamara`) lee prendas en ráfaga y las lleva a un ticket. Aquí la colaboradora solo
   quiere encontrar la compra: la cámara lee el primer código que ve (el QR de la etiqueta o el de SUNAT impreso en la
   boleta), se cierra y la pantalla lo busca. Mismo lector (`crearLector`: detector del navegador o jsQR), misma hoja
   `variante="camara"` (ADR-0136) y el mismo plan B sin permiso o sin cámara: buscar escribiendo.
   ==================================================================== */

type Estado = "abriendo" | "leyendo" | "sin-permiso" | "sin-camara";

export function EscanerBusqueda({ onCodigo, onEscribir, onClose }: {
  /** El código tal como se leyó; quien lo recibe decide qué buscar (`busquedaDesdeLectura`). */
  onCodigo: (codigo: string) => void;
  /** Sin cámara: cerrar y dejar el campo de búsqueda listo. */
  onEscribir: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const [estado, setEstado] = useState<Estado>("abriendo");
  const onCodigoRef = useRef(onCodigo);
  useEffect(() => {
    onCodigoRef.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let reloj = 0;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setEstado("sin-camara");
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (!vivo) return;
        const sinPermiso = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        return setEstado(sinPermiso ? "sin-permiso" : "sin-camara");
      }
      const video = videoRef.current;
      if (!vivo || !video) return flujo.getTracks().forEach((t) => t.stop());
      video.srcObject = flujo;
      await video.play().catch(() => undefined);
      const leer = await crearLector();
      if (!vivo) return;
      setEstado("leyendo");
      const ciclo = async () => {
        if (!vivo) return;
        try {
          const crudo = lienzoRef.current ? await leer(video, lienzoRef.current) : null;
          const codigo = crudo ? normalizarLectura(crudo) : "";
          if (codigo && vivo) {
            // Una lectura basta: se apaga la cámara antes de buscar, así no lee dos veces la misma boleta.
            vivo = false;
            navigator.vibrate?.(35);
            flujo?.getTracks().forEach((t) => t.stop());
            onCodigoRef.current(codigo);
            return;
          }
        } catch {
          // Un cuadro que no se pudo leer no corta la cámara: se intenta con el siguiente.
        }
        reloj = window.setTimeout(ciclo, 120);
      };
      void ciclo();
    })();

    return () => {
      vivo = false;
      window.clearTimeout(reloj);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const sinCamara = estado === "sin-permiso" || estado === "sin-camara";
  const botonRedondo =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-crema/15 text-crema backdrop-blur-md transition-[background-color,transform] duration-200 ease-cayla hover:bg-crema/25 active:scale-95";

  return (
    <Modal variante="camara" titulo="Escanear para cambiar" subtitulo="Apunta la cámara a la etiqueta de la prenda o al QR de la boleta." onClose={onClose}>
      {(cerrar) => (
        <>
          <div data-sin-cascada className="absolute inset-0">
            <video ref={videoRef} muted playsInline autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover" />
            <canvas ref={lienzoRef} className="hidden" aria-hidden />
          </div>

          <div className="relative z-10 flex items-center justify-between bg-gradient-to-b from-tinta/70 to-transparent px-4 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button type="button" onClick={cerrar} aria-label="Cerrar la cámara" className={botonRedondo}>
              <X aria-hidden className="h-5 w-5" />
            </button>
            <p className="label-cayla text-[11px] text-crema/90">Escanear para cambiar</p>
            <span aria-hidden className="w-11" />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6">
            {sinCamara ? (
              <div className="relative z-10 flex max-w-xs flex-col items-center gap-5 text-center text-crema">
                <p className="text-[15px] leading-relaxed">
                  {estado === "sin-permiso"
                    ? "El navegador no tiene permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio, o busca escribiendo."
                    : "No encontramos una cámara disponible en este aparato. Busca escribiendo."}
                </p>
                <button type="button" onClick={onEscribir} className="btn-cayla btn-secundario bg-crema">
                  Buscar escribiendo
                </button>
              </div>
            ) : (
              <>
                <div className="relative aspect-square w-[min(72vw,19rem,40dvh)] rounded-[28px] shadow-[0_0_0_200vmax_color-mix(in_srgb,var(--color-tinta)_62%,transparent)]">
                  {(
                    [
                      "-left-[3px] -top-[3px] border-l-[3px] border-t-[3px] rounded-tl-[30px]",
                      "-right-[3px] -top-[3px] border-r-[3px] border-t-[3px] rounded-tr-[30px]",
                      "-bottom-[3px] -left-[3px] border-b-[3px] border-l-[3px] rounded-bl-[30px]",
                      "-bottom-[3px] -right-[3px] border-b-[3px] border-r-[3px] rounded-br-[30px]",
                    ] as const
                  ).map((pos) => (
                    <span key={pos} aria-hidden className={`absolute h-11 w-11 border-crema ${pos}`} />
                  ))}
                  {estado === "abriendo" && <p className="absolute inset-0 grid place-items-center text-sm text-crema/80">Abriendo la cámara…</p>}
                </div>
                <p className="relative rounded-full bg-tinta/50 px-4 py-2 text-center text-[13px] text-crema/90 backdrop-blur-md">
                  Centra la etiqueta o el QR de la boleta en el cuadro
                </p>
              </>
            )}
          </div>

          <div className="relative z-10 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
            <button type="button" onClick={onEscribir} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-crema/30 text-sm font-medium text-crema">
              <Search aria-hidden className="h-4 w-4" />
              Mejor buscar escribiendo
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

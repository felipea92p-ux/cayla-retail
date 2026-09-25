"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { esLecturaRepetida, mensajeEscaneo, normalizarLectura, type ResultadoEscaneo } from "@/lib/escaner-reglas";

/* ====================================================================
   EscanerCamara · leer el QR de la etiqueta con la cámara del teléfono (2026-09-25)

   Es el lector del mostrador para quien vende desde el teléfono: cada lectura se le pasa a `onCodigo`, que es el MISMO
   camino del Enter del lector (`PuntoDeVenta`: `resolverCodigoV2` + `agregar`). La cámara queda abierta y se pueden
   pasar varias prendas seguidas; «Listo» la cierra.

   Cómo lee: con el `BarcodeDetector` del navegador cuando existe (Chrome en Android: rápido, y lee también el Code 128
   de la etiqueta) y, si no, con `jsQR` (iPhone/Safari no traen el detector), que se descarga recién al abrir la cámara.
   Todo corre en el teléfono: no depende de ningún servicio que se pueda caer.

   Si no hay permiso o no hay cámara, lo dice en palabras del mostrador y ofrece buscar la prenda por nombre: nunca deja
   a la encargada sin una forma de vender.
   ==================================================================== */

type Estado = "abriendo" | "leyendo" | "sin-permiso" | "sin-camara";

/** Lee un cuadro del video; `null` si no hay código a la vista. */
type Lector = (video: HTMLVideoElement, lienzo: HTMLCanvasElement) => Promise<string | null>;

/** Lo mínimo del `BarcodeDetector` nativo que se usa (no está en los tipos de TypeScript). */
type DetectorNativo = { detect: (fuente: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ClaseDetector = { new (opciones: { formats: string[] }): DetectorNativo; getSupportedFormats: () => Promise<string[]> };

async function crearLector(): Promise<Lector> {
  const Nativo = (window as unknown as { BarcodeDetector?: ClaseDetector }).BarcodeDetector;
  if (Nativo) {
    try {
      const soportados = await Nativo.getSupportedFormats();
      if (soportados.includes("qr_code")) {
        const detector = new Nativo({ formats: ["qr_code", "code_128"].filter((f) => soportados.includes(f)) });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Un detector que existe pero falla al arrancar: se sigue con jsQR.
    }
  }
  const { default: jsQR } = await import("jsqr");
  return async (video, lienzo) => {
    const ancho = video.videoWidth;
    const alto = video.videoHeight;
    if (!ancho || !alto) return null;
    // Solo el cuadrado del centro (donde está el visor) y a 640 px como máximo: es lo que se mira, y leer el cuadro
    // entero a 1280 × 720 tarda el triple en un teléfono modesto.
    const lado = Math.min(ancho, alto);
    const destino = Math.min(lado, 640);
    lienzo.width = destino;
    lienzo.height = destino;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, (ancho - lado) / 2, (alto - lado) / 2, lado, lado, 0, 0, destino, destino);
    const imagen = ctx.getImageData(0, 0, destino, destino);
    return jsQR(imagen.data, destino, destino, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

export function EscanerCamara({
  onCodigo,
  onBuscarPorNombre,
  onClose,
}: {
  /** El camino del lector: decide qué prenda es y si entra al ticket. */
  onCodigo: (codigo: string) => ResultadoEscaneo;
  /** Sin cámara: cerrar y dejar el campo de búsqueda listo. */
  onBuscarPorNombre: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const [estado, setEstado] = useState<Estado>("abriendo");
  const [ultimo, setUltimo] = useState<(ResultadoEscaneo & { n: number }) | null>(null);
  const [agregadas, setAgregadas] = useState(0);
  // El marco del visor se pinta del color de la última lectura y vuelve a su tono un momento después: la respuesta a
  // la acción (ADR-0136), no un adorno — nunca en bucle.
  const [destello, setDestello] = useState<"verde" | "ambar" | null>(null);

  // El ciclo de lectura vive fuera de React (un temporizador); lee siempre el `onCodigo` más reciente por este ref.
  const onCodigoRef = useRef(onCodigo);
  useEffect(() => {
    onCodigoRef.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let reloj = 0;
    let relojDestello = 0;
    let ultima: { codigo: string; en: number } | null = null;
    let n = 0;

    const alLeer = (crudo: string) => {
      const codigo = normalizarLectura(crudo);
      const ahora = Date.now();
      if (!codigo || esLecturaRepetida(codigo, ultima, ahora)) return;
      ultima = { codigo, en: ahora };
      const r = onCodigoRef.current(codigo);
      n += 1;
      setUltimo({ ...r, n });
      if (r.estado === "agregada") {
        setAgregadas((x) => x + 1);
        navigator.vibrate?.(35);
      }
      setDestello(mensajeEscaneo(r).tono);
      window.clearTimeout(relojDestello);
      relojDestello = window.setTimeout(() => setDestello(null), 700);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("sin-camara");
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (!vivo) return;
        const sinPermiso = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setEstado(sinPermiso ? "sin-permiso" : "sin-camara");
        return;
      }
      const video = videoRef.current;
      if (!vivo || !video) {
        flujo.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = flujo;
      await video.play().catch(() => undefined);
      const leer = await crearLector();
      if (!vivo) return;
      setEstado("leyendo");
      // ~8 lecturas por segundo: de sobra para una etiqueta quieta, y deja respirar al teléfono.
      const ciclo = async () => {
        if (!vivo) return;
        try {
          const crudo = lienzoRef.current ? await leer(video, lienzoRef.current) : null;
          if (crudo && vivo) alLeer(crudo);
        } catch {
          // Un cuadro que no se pudo leer no corta la cámara: se intenta con el siguiente.
        }
        reloj = window.setTimeout(ciclo, 120);
      };
      void ciclo();
    })();

    // Al cerrar se apaga la cámara (la luz del teléfono se apaga con ella) y se corta el ciclo.
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
      window.clearTimeout(relojDestello);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const mensaje = ultimo ? mensajeEscaneo(ultimo) : null;
  const colorMarco = destello === "verde" ? "border-verde" : destello === "ambar" ? "border-ambar" : "border-crema/90";
  const sinCamara = estado === "sin-permiso" || estado === "sin-camara";

  return (
    <Modal titulo="Escanear prenda" subtitulo="Apunta la cámara al QR de la etiqueta. Puedes pasar varias prendas seguidas." onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <>
          {/* El anillo exterior repite el destello: sobre la imagen de la cámara el verde de las esquinas se pierde. */}
          <div
            className={`relative aspect-square w-full overflow-hidden rounded-xl bg-tinta ring-offset-2 ring-offset-crema transition-shadow duration-200 ease-cayla ${
              destello === "verde" ? "ring-4 ring-verde" : destello === "ambar" ? "ring-4 ring-ambar" : "ring-0"
            }`}
          >
            <video ref={videoRef} muted playsInline autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover" />
            <canvas ref={lienzoRef} className="hidden" aria-hidden />
            {!sinCamara && (
              // El visor: cuatro esquinas, el cuadro que se lee (el centro del video).
              <div aria-hidden className="pointer-events-none absolute inset-[16%]">
                {["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl", "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl", "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl"].map((pos) => (
                  <span key={pos} className={`absolute h-9 w-9 transition-colors duration-200 ease-cayla ${pos} ${colorMarco}`} />
                ))}
              </div>
            )}
            {estado === "abriendo" && (
              <p className="absolute inset-0 grid place-items-center text-sm text-crema/80">Abriendo la cámara…</p>
            )}
            {sinCamara && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-crema">
                <p className="text-sm leading-relaxed">
                  {estado === "sin-permiso"
                    ? "El navegador no tiene permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio, o busca la prenda por nombre."
                    : "No encontramos una cámara disponible en este aparato. Busca la prenda por nombre."}
                </p>
                <button type="button" onClick={onBuscarPorNombre} className="btn-cayla btn-secundario bg-crema">
                  Buscar por nombre
                </button>
              </div>
            )}
          </div>

          {/* Qué pasó con la última lectura. Reservado aunque esté vacío, para que la hoja no cambie de alto (ADR-0185). */}
          <p aria-live="polite" className="mt-3 flex min-h-11 items-center gap-2.5 text-sm text-tinta">
            {mensaje ? (
              <span key={ultimo?.n} className="anim-asentar flex items-center gap-2.5">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${mensaje.tono === "verde" ? "bg-verde" : "bg-ambar"}`} />
                {mensaje.texto}
              </span>
            ) : (
              <span className="text-tinta/60">{estado === "leyendo" ? "Esperando una etiqueta…" : ""}</span>
            )}
          </p>

          <button type="button" onClick={cerrar} className="btn-cayla btn-primario mt-2 w-full">
            {agregadas > 0 ? `Listo · ${agregadas} ${agregadas === 1 ? "prenda agregada" : "prendas agregadas"}` : "Listo"}
          </button>
        </>
      )}
    </Modal>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { crearLector } from "@/components/EscanerCamara";
import { normalizarLectura } from "@/lib/escaner-reglas";
import { debeContarLectura } from "@/lib/conteo-conectado";

/* ====================================================================
   EscanerConteo · contar con la cámara del teléfono, en ráfaga (Conteo conectado, parte 1 — spike 2026-09-26)

   Vender lee prendas para un ticket (`EscanerCamara`) y Cambios lee UNA etiqueta y busca (`EscanerBusqueda`). Aquí la
   colaboradora pasa las etiquetas una tras otra y cada una suma 1: la cámara queda abierta hasta «Listo». Mismo lector
   (`crearLector`: detector del navegador o jsQR), misma hoja `variante="camara"` (ADR-0136) y el mismo plan B sin
   permiso o sin cámara: escribir el código.

   Lo que cambia respecto de Vender es CUÁNDO suma una lectura (`debeContarLectura`): en una pila de 12 blusas iguales
   las 12 etiquetas tienen el mismo código, así que el mismo código vuelve a sumar solo si la etiqueta salió del cuadro
   entre una lectura y otra. La misma etiqueta quieta nunca suma sola. Qué prenda es, cuánto lleva, el sonido y el
   guardado los decide la pantalla de conteo (`onCodigo`): esta hoja solo lee y muestra.
   ==================================================================== */

type Estado = "abriendo" | "leyendo" | "sin-permiso" | "sin-camara";

/** Lo que la hoja dice con palabras. Por defecto, lo de Conteo; Bajar al piso pasa los suyos (la misma ráfaga, otra tarea). */
export type TextosEscaner = {
  titulo: string;
  subtitulo: string;
  /** El rótulo de arriba, junto a cerrar. */
  etiqueta: string;
  /** La píldora bajo el visor. */
  ayuda: string;
  /** El rótulo sobre la prenda de la bandeja. */
  enCurso: string;
  /** La bandeja antes de la primera lectura. */
  vacio: string;
  /** El contador de arriba a la derecha; sin él, `contadas/total`. */
  contador?: string;
};

const TEXTOS_CONTEO: TextosEscaner = {
  titulo: "Contar con la cámara",
  subtitulo: "Pasa las etiquetas una tras otra: cada una suma 1.",
  etiqueta: "Contar · cada lectura suma 1",
  ayuda: "Pasa las etiquetas una tras otra · suena y vibra en cada una",
  enCurso: "Estás contando",
  vacio: "Lo que escanees aparece aquí, con − / + para corregir.",
};

export type LecturaConteo =
  // `atencion`: la prenda se reconoció pero NO se sumó (necesita una respuesta de la persona: «Agregar igual», elegir quién
  // cuenta…). El destello sale ámbar y no verde, y lo que hay que responder va en `aviso`.
  | { encontrada: true; referencia: string; detalle: string; sku: string; cantidad: number; atencion?: boolean }
  | { encontrada: false; codigo: string };

export function EscanerConteo({
  onCodigo,
  actual,
  avance,
  onPaso,
  onDarDeAlta,
  onEscribir,
  aviso,
  textos: propios,
  onClose,
}: {
  /** El mismo camino del Enter de la pistola: resuelve la prenda, suma, guarda y suena. */
  onCodigo: (codigo: string) => LecturaConteo;
  /** La prenda que se está contando, con su cifra en vivo (cambia también con − / +). */
  actual: Extract<LecturaConteo, { encontrada: true }> | null;
  avance: { contadas: number; total: number };
  /** − / + sobre la prenda que se está contando. */
  onPaso: (paso: number) => void;
  /** Un código que no es de ninguna prenda: cerrar y ofrecer darla de alta con ese código. Sin él, no se ofrece (la pantalla
   *  que la usa dice qué hacer en `aviso`). */
  onDarDeAlta?: (codigo: string) => void;
  /** Sin cámara: cerrar y dejar listo el campo para escribir. */
  onEscribir: () => void;
  /** Algo que la persona tiene que responder sin cerrar la cámara («Esta prenda no pertenece al conteo actual» con sus
   *  botones, un guardado que falló). Tiene prioridad sobre la prenda que se está contando: es lo urgente. Lo arma la
   *  pantalla de Contar, que es la misma que lo muestra en su barra de abajo. */
  aviso?: ReactNode;
  /** Las palabras de la hoja, si no es Conteo. */
  textos?: Partial<TextosEscaner>;
  onClose: () => void;
}) {
  const t = { ...TEXTOS_CONTEO, ...propios };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const [estado, setEstado] = useState<Estado>("abriendo");
  const [desconocido, setDesconocido] = useState<string | null>(null);
  const [destello, setDestello] = useState<{ id: number; tono: "verde" | "ambar" } | null>(null);

  const onCodigoRef = useRef(onCodigo);
  useEffect(() => {
    onCodigoRef.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let reloj = 0;
    let ultima: { codigo: string; en: number } | null = null;
    // ¿Hubo un cuadro sin código desde la última lectura que sumó? Es la señal de que la etiqueta salió del visor.
    let huboHueco = true;
    let n = 0;

    const alLeer = (codigo: string) => {
      const ahora = Date.now();
      if (!debeContarLectura(codigo, ultima, { huboHueco, ahora })) return;
      ultima = { codigo, en: ahora };
      huboHueco = false;
      const r = onCodigoRef.current(codigo);
      n += 1;
      setDestello({ id: n, tono: r.encontrada && !r.atencion ? "verde" : "ambar" });
      setDesconocido(r.encontrada ? null : r.codigo);
    };

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
      // ~8 lecturas por segundo, como Vender.
      const ciclo = async () => {
        if (!vivo) return;
        try {
          const crudo = lienzoRef.current ? await leer(video, lienzoRef.current) : null;
          const codigo = crudo ? normalizarLectura(crudo) : "";
          if (!codigo) huboHueco = true;
          else if (vivo) alLeer(codigo);
        } catch {
          // Un cuadro que no se pudo leer no corta la cámara (y no cuenta como hueco: no se sabe qué había).
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
  const botonPaso = "grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-sand bg-papel text-tinta transition-colors active:bg-sand/60";

  return (
    <Modal variante="camara" titulo={t.titulo} subtitulo={t.subtitulo} onClose={onClose}>
      {(cerrar) => (
        <>
          <div data-sin-cascada className="absolute inset-0">
            <video ref={videoRef} muted playsInline autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover" />
            <canvas ref={lienzoRef} className="hidden" aria-hidden />
          </div>

          <div className="papel-fijo relative z-10 flex items-center justify-between bg-gradient-to-b from-tinta/70 to-transparent px-4 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button type="button" onClick={cerrar} aria-label="Cerrar la cámara" className={botonRedondo}>
              <X aria-hidden className="h-5 w-5" />
            </button>
            <p className="label-cayla text-[11px] text-crema/90">{t.etiqueta}</p>
            <span className="grid h-11 min-w-11 place-items-center rounded-full bg-crema/15 px-3 text-xs tabular-nums text-crema backdrop-blur-md">
              {t.contador ?? `${avance.contadas}/${avance.total}`}
            </span>
          </div>

          <div className="papel-fijo relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6">
            {sinCamara ? (
              <div className="relative z-10 flex max-w-xs flex-col items-center gap-5 text-center text-crema">
                <p className="text-[15px] leading-relaxed">
                  {estado === "sin-permiso"
                    ? "El navegador no tiene permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio, o escribe el código."
                    : "No encontramos una cámara disponible en este aparato. Escribe el código."}
                </p>
                <button type="button" onClick={onEscribir} className="btn-cayla btn-secundario bg-crema">
                  Escribir el código
                </button>
              </div>
            ) : (
              <>
                <div className="relative aspect-square w-[min(72vw,19rem,36dvh)] rounded-[28px] shadow-[0_0_0_200vmax_color-mix(in_srgb,var(--color-sombra)_62%,transparent)]">
                  <div key={destello?.id ?? 0} className={`absolute inset-0 ${destello ? "anim-captura" : ""}`}>
                    {destello && <span aria-hidden className={`anim-destello absolute inset-0 rounded-[28px] ${destello.tono === "verde" ? "bg-verde" : "bg-ambar"}`} />}
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
                  </div>
                  {estado === "abriendo" && <p className="absolute inset-0 grid place-items-center text-sm text-crema/80">Abriendo la cámara…</p>}
                </div>
                <p className="relative rounded-full bg-tinta/50 px-4 py-2 text-center text-[13px] text-crema/90 backdrop-blur-md">
                  {t.ayuda}
                </p>
              </>
            )}
          </div>

          {/* La bandeja: la prenda que se está contando, con − / + grandes para corregir sin cerrar la cámara. Alto fijo
              (ADR-0185): no salta al llegar la primera lectura. */}
          <div className="relative z-10 rounded-t-[28px] bg-crema dark:border-t dark:border-sand px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <div aria-live="polite" className="min-h-[4.75rem]">
              {aviso ? (
                <div className="flex min-h-[4.75rem] items-center">{aviso}</div>
              ) : desconocido ? (
                <div className="flex items-center gap-3">
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ambar text-crema">!</span>
                  <span className="min-w-0 flex-1 text-sm text-tinta">
                    «<span className="font-mono text-[13px]">{desconocido}</span>» no es de ninguna prenda del catálogo.
                  </span>
                  {onDarDeAlta && (
                    <button type="button" onClick={() => onDarDeAlta(desconocido)} className="btn-cayla btn-secundario btn-chico shrink-0">
                      Dar de alta
                    </button>
                  )}
                </div>
              ) : actual ? (
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="label-cayla block text-[10px] text-taupe">{t.enCurso}</span>
                    <span className="block truncate text-[15px] text-tinta">{actual.referencia}</span>
                    <span className="block truncate text-xs text-taupe">
                      {actual.detalle}
                      {actual.sku && <span className="font-mono text-[11px]"> · {actual.sku}</span>}
                    </span>
                  </span>
                  <button type="button" onClick={() => onPaso(-1)} aria-label="Una menos" className={botonPaso}>
                    <Minus aria-hidden className="h-5 w-5" />
                  </button>
                  <span className="font-display min-w-[2.5ch] text-center text-4xl tabular-nums text-tinta">{actual.cantidad}</span>
                  <button type="button" onClick={() => onPaso(1)} aria-label="Una más" className={botonPaso}>
                    <Plus aria-hidden className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <p className="grid h-[4.75rem] place-items-center text-center text-[13px] text-tinta/55">{t.vacio}</p>
              )}
            </div>
            <button type="button" onClick={cerrar} className="btn-cayla btn-primario mt-3 h-12 w-full">
              Listo
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

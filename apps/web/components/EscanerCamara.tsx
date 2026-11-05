"use client";

import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { Globito } from "@/components/ui/Globito";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Flashlight, FlashlightOff, ShoppingBag, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ExistenciasEnCamara } from "@/components/ExistenciasEnCamara";
import type { ResultadoConsulta } from "@/lib/escaner-existencias";
import {
  MS_AVISO,
  MS_VUELO,
  esLecturaRepetida,
  estadoCorto,
  keyframesAviso,
  keyframesVuelo,
  mensajeEscaneo,
  normalizarLectura,
  sonidoDeLecturaCamara,
  type ResultadoEscaneo,
} from "@/lib/escaner-reglas";
import { avisarLectura } from "@/lib/sonido-conteo";

/* ====================================================================
   EscanerCamara · leer el QR de la etiqueta con la cámara del teléfono (2026-09-25)

   Es el lector del mostrador para quien vende desde el teléfono: cada lectura se le pasa a `onCodigo`, que es el MISMO
   camino del Enter del lector (`PuntoDeVenta`: `resolverCodigoV2` + `agregar`).

   La pantalla (pedido de Felipe: «el mejor diseño posible» y que se sienta que la prenda entra al ticket):
     · la cámara a pantalla completa, oscurecida salvo el VISOR, con esquinas crema; arriba cerrar, título y linterna
       (si el teléfono la tiene: tiendas con poca luz);
     · abajo, una BANDEJA crema: las últimas prendas leídas y el ticket (bolsa con su número, total que cuenta, «Ver
       ticket»);
     · al leer: el visor se contrae con un destello, aparece la tarjeta de la prenda (foto o iniciales, color · talla,
       precio) y VUELA en arco hasta la bolsa. Recién cuando entra, la bolsa late, el número sube y el total cuenta —
       el ticket cambia cuando la prenda «llega», no antes. Lo que no entra (agotada, en el almacén, apartada para una
       clienta, no es de la tienda) aparece en ámbar y se apaga en su lugar: no viaja al ticket porque no entró. Lo
       del almacén dice «No entró · en almacén» y lo apartado «No entró · apartada» (`estadoCorto`): aquí no sale el
       aviso largo de arriba, que lo dice UNA vez al cerrar la cámara (`cerrarCamara` en `PuntoDeVenta`);
     · y cada lectura SUENA (2026-10-23): el bip agudo de Conteo si entró, el grave si no (`sonidoDeLecturaCamara`).
   Es una hoja de `<Modal variante="camara">`: hereda el velo, la entrada, la cascada y el foco atrapado (ADR-0136).

   Dos modos (2026-10-28, pedido de Felipe), con un interruptor arriba cuando la pantalla pasa `consulta`:
     · «Al ticket», el de siempre: todo lo de arriba.
     · «Existencias»: lee la misma etiqueta pero NO agrega nada. La bandeja cambia por las existencias de esa prenda —cada color
       y talla, en el piso y en el almacén— y no hay vuelo ni ticket (`ExistenciasEnCamara`, `lib/escaner-existencias.ts`).
   Siempre abre en «Al ticket»: el modo de consulta no se queda puesto de una vez a otra, o la próxima venta escanearía sin agregar.

   Cómo lee: con el `BarcodeDetector` del navegador cuando existe (Chrome en Android: rápido, y lee también el Code 128
   de la etiqueta) y, si no, con `jsQR` (iPhone/Safari no traen el detector), que se descarga recién al abrir la cámara.
   Todo corre en el teléfono. Sin permiso o sin cámara, lo dice y ofrece buscar por nombre.
   ==================================================================== */

type Estado = "abriendo" | "leyendo" | "sin-permiso" | "sin-camara";

/** Lee un cuadro del video; `null` si no hay código a la vista. */
export type Lector = (video: HTMLVideoElement, lienzo: HTMLCanvasElement) => Promise<string | null>;

/** Lo mínimo del `BarcodeDetector` nativo que se usa (no está en los tipos de TypeScript). */
type DetectorNativo = { detect: (fuente: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ClaseDetector = { new (opciones: { formats: string[] }): DetectorNativo; getSupportedFormats: () => Promise<string[]> };

/**
 * Baja jsQR por adelantado, mientras hay red (ADR-0210, «huecos»). Es lo único de Vender que se carga recién al usarlo:
 * sin esto, un iPhone que abre Vender sin internet (copia del service worker) tendría la cámara pero no el lector.
 * Bajarlo una vez con red lo deja en la copia (`/_next/static`, primero-la-copia). Donde el teléfono trae su propio
 * lector (`BarcodeDetector`, Android) no hace falta.
 */
export function precargarLectorQR(): void {
  if (typeof window === "undefined" || !navigator.onLine) return;
  if ((window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector) return;
  void import("jsqr").catch(() => {
    // Sin red a mitad: se intentará la próxima vez que se abra Vender.
  });
}

/** El lector de un cuadro de video: el detector del navegador o jsQR. Lo usa también el escáner de Cambios
 *  (`EscanerBusqueda`), que lee UNA vez y busca. */
export async function crearLector(): Promise<Lector> {
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
    // Solo el cuadrado del centro y a 640 px como máximo: leer el cuadro entero a 1280 × 720 tarda el triple en un
    // teléfono modesto.
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

const moverse = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const soles = (n: number) => `S/${n.toFixed(2)}`;
const iniciales = (referencia: string) =>
  referencia
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

/** La foto de la prenda o, sin foto, sus iniciales sobre sand (el mismo plan B de las tarjetas de Vender). */
function Miniatura({ prenda, lado }: { prenda: ResultadoEscaneo["prenda"]; lado: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-sand font-display text-tinta/55" style={{ width: lado, height: lado, fontSize: lado * 0.34 }}>
      {prenda?.fotoUrl ? <ImagenDePrenda src={prenda.fotoUrl} alt="" fill sizes={`${lado}px`} className="object-cover" fallback={iniciales(prenda.referencia)} /> : prenda ? iniciales(prenda.referencia) : "?"}
    </span>
  );
}

type Lectura = ResultadoEscaneo & { id: number };

/** La segunda línea de una prenda leída: color · talla, o el código si no es de ninguna prenda. */
const detalleDe = (l: ResultadoEscaneo) => l.prenda?.detalle || `Código ${l.codigo}`;

type ModoCamara = "ticket" | "existencias";

/** Lo que la pantalla le da a la cámara para el modo «Existencias». Ausente = la cámara solo agrega al ticket (Apartados). */
export type ConsultaDeExistencias = {
  /** Reconoce la etiqueta y dice las existencias de su prenda. Solo lectura: no toca el ticket. Se vuelve a llamar en cada
   *  pintada, así que lo que se ve sigue al stock de ahora. */
  leer: (codigo: string) => ResultadoConsulta;
  /** La sede, para el rótulo de la bandeja («Existencias en Tienda TRU»). */
  sede: string;
};

export function EscanerCamara({
  onCodigo,
  consulta,
  ticket,
  onBuscarPorNombre,
  onVerTicket,
  onClose,
}: {
  /** El camino del lector: decide qué prenda es y si entra al ticket. */
  onCodigo: (codigo: string) => ResultadoEscaneo;
  /** Con esto la cámara ofrece el interruptor «Al ticket / Existencias». */
  consulta?: ConsultaDeExistencias;
  /** El ticket de Vender tal cual está: la bandeja lo muestra (cuando termina el vuelo). */
  ticket: { prendas: number; total: number };
  /** Sin cámara: cerrar y dejar el campo de búsqueda listo. */
  onBuscarPorNombre: () => void;
  /** «Ver ticket»: además de cerrar, abre el ticket (en el celular vive en una hoja aparte). Corre después de `onClose`. */
  onVerTicket?: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const marcoRef = useRef<HTMLDivElement | null>(null);
  const bolsaRef = useRef<HTMLSpanElement | null>(null);
  const tarjetaRef = useRef<HTMLDivElement | null>(null);
  const pistaRef = useRef<MediaStreamTrack | null>(null);
  // «Ver ticket» cierra con la misma salida animada que la ✕, y al terminar abre el ticket (antes solo cerraba: en el
  // celular volvía a Vender y había que tocar «Ver ticket» otra vez).
  const irAlTicket = useRef(false);

  const [estado, setEstado] = useState<Estado>("abriendo");
  const [historial, setHistorial] = useState<Lectura[]>([]);
  // La lectura en pantalla: la tarjeta que vuela (o se apaga) y el destello del visor. `id` re-monta las animaciones.
  const [vuelo, setVuelo] = useState<Lectura | null>(null);
  const [destello, setDestello] = useState<{ id: number; tono: "verde" | "ambar" } | null>(null);
  const [latidoBolsa, setLatidoBolsa] = useState(0);
  const [linterna, setLinterna] = useState<{ disponible: boolean; encendida: boolean }>({ disponible: false, encendida: false });

  // El ticket que muestra la bandeja va un paso atrás del de verdad mientras una prenda está en el aire: cambia cuando la
  // tarjeta entra en la bolsa. Ajuste durante el render (el patrón del repo, sin efecto).
  const [enVuelo, setEnVuelo] = useState(false);
  const [ticketMostrado, setTicketMostrado] = useState(ticket);
  if (!enVuelo && (ticketMostrado.prendas !== ticket.prendas || ticketMostrado.total !== ticket.total)) setTicketMostrado(ticket);

  // El ciclo de lectura vive fuera de React (un temporizador); lee siempre el `onCodigo` más reciente por este ref.
  const onCodigoRef = useRef(onCodigo);
  useEffect(() => {
    onCodigoRef.current = onCodigo;
  }, [onCodigo]);

  // El modo: siempre abre en «Al ticket». El ciclo lo lee por ref (no se reinicia al cambiar de modo), y `ultimaRef` es lo último
  // leído: al cambiar de modo se olvida, porque la misma etiqueta se puede volver a leer en el otro modo sin esperar la pausa.
  const [modo, setModo] = useState<ModoCamara>("ticket");
  const modoRef = useRef<ModoCamara>("ticket");
  const consultaRef = useRef(consulta);
  useEffect(() => {
    consultaRef.current = consulta;
  }, [consulta]);
  const ultimaRef = useRef<{ codigo: string; en: number } | null>(null);
  // Lo último que se leyó en «Existencias»: solo el CÓDIGO. Lo que se ve se consulta en cada pintada, así sigue al stock de ahora.
  const [consultado, setConsultado] = useState<{ id: number; codigo: string } | null>(null);
  // El color que la persona tocó en la bandeja para ESA lectura; una lectura nueva vuelve al color de la etiqueta.
  const [colorTocado, setColorTocado] = useState<{ id: number; clave: string } | null>(null);

  function cambiarModo(clave: string) {
    const nuevo: ModoCamara = clave === "existencias" ? "existencias" : "ticket";
    modoRef.current = nuevo;
    ultimaRef.current = null;
    setModo(nuevo);
  }

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let reloj = 0;
    let n = 0;

    const alLeer = (crudo: string) => {
      const codigo = normalizarLectura(crudo);
      const ahora = Date.now();
      if (!codigo || esLecturaRepetida(codigo, ultimaRef.current, ahora)) return;
      ultimaRef.current = { codigo, en: ahora };
      // «Existencias»: la misma lectura, pero solo se consulta. No pasa por `onCodigo`, así que no entra nada al ticket.
      if (modoRef.current === "existencias" && consultaRef.current) {
        n += 1;
        const tono = consultaRef.current.leer(codigo).tipo === "prenda" ? "verde" : "ambar";
        setConsultado({ id: n, codigo });
        setDestello({ id: n, tono });
        avisarLectura(sonidoDeLecturaCamara(tono));
        return;
      }
      const r = onCodigoRef.current(codigo);
      n += 1;
      const lectura = { ...r, id: n };
      const tono = mensajeEscaneo(r).tono;
      setHistorial((h) => [lectura, ...h].slice(0, 3));
      setDestello({ id: n, tono });
      // Suena y vibra en cada lectura (el bip de Conteo): quien vende mira la prenda y al cliente, no la pantalla.
      avisarLectura(sonidoDeLecturaCamara(tono));
      if (moverse()) {
        setVuelo(lectura);
        if (r.estado === "agregada") setEnVuelo(true);
      } else if (r.estado === "agregada") {
        setLatidoBolsa((x) => x + 1);
      }
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
      const pista = flujo.getVideoTracks()[0] ?? null;
      pistaRef.current = pista;
      // La linterna solo existe en algunos teléfonos (Android con Chrome); donde no, el botón no aparece.
      const capacidades = (pista?.getCapabilities?.() ?? {}) as { torch?: boolean };
      if (capacidades.torch) setLinterna({ disponible: true, encendida: false });
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

    // Al cerrar se apaga la cámara (y la linterna con ella) y se corta el ciclo.
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // El vuelo: se mide DÓNDE está el visor y DÓNDE la bolsa recién con la tarjeta montada, y se anima con Web Animations
  // (los keyframes, puros y probados, en `lib/escaner-reglas.ts`). Una lectura nueva a mitad de vuelo reemplaza a la
  // anterior: la bandeja igual tiene las dos.
  useLayoutEffect(() => {
    const tarjeta = tarjetaRef.current;
    const marco = marcoRef.current?.getBoundingClientRect();
    if (!vuelo || !tarjeta || !marco) return;
    const cx = marco.left + marco.width / 2;
    const cy = marco.top + marco.height / 2;
    tarjeta.style.left = `${cx}px`;
    tarjeta.style.top = `${cy}px`;
    const entra = vuelo.estado === "agregada";
    const bolsa = bolsaRef.current?.getBoundingClientRect();
    const duracion = entra && bolsa ? MS_VUELO : MS_AVISO;
    const animacion = entra && bolsa
      ? tarjeta.animate(keyframesVuelo(bolsa.left + bolsa.width / 2 - cx, bolsa.top + bolsa.height / 2 - cy), { duration: duracion, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", fill: "forwards" })
      : tarjeta.animate(keyframesAviso(), { duration: duracion, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", fill: "forwards" });
    let terminado = false;
    const terminar = () => {
      if (terminado) return;
      terminado = true;
      setVuelo((v) => (v?.id === vuelo.id ? null : v));
      // Siempre, no solo si esta entró: una lectura nueva a mitad de vuelo cancela la tarjeta anterior sin que termine,
      // y el ticket de la bandeja no puede quedarse esperando a la que se canceló.
      setEnVuelo(false);
      if (entra) setLatidoBolsa((x) => x + 1);
    };
    animacion.onfinish = terminar;
    // Respaldo: `onfinish` necesita que el navegador pinte. Si la pantalla se apaga o la pestaña pasa a segundo plano a
    // mitad de vuelo, la animación se congela — y el ticket de la bandeja no puede quedarse esperando a una prenda que
    // ya entró.
    const respaldo = window.setTimeout(terminar, duracion + 150);
    return () => {
      animacion.onfinish = null;
      window.clearTimeout(respaldo);
      animacion.cancel();
    };
  }, [vuelo]);

  async function alternarLinterna() {
    const pista = pistaRef.current;
    if (!pista) return;
    const encendida = !linterna.encendida;
    try {
      await pista.applyConstraints({ advanced: [{ torch: encendida } as MediaTrackConstraintSet] });
      setLinterna({ disponible: true, encendida });
    } catch {
      setLinterna({ disponible: false, encendida: false });
    }
  }

  const sinCamara = estado === "sin-permiso" || estado === "sin-camara";
  const botonRedondo =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-crema/15 text-crema backdrop-blur-md transition-[background-color,transform] duration-200 ease-cayla hover:bg-crema/25 active:scale-95";

  // En «Existencias» la hoja entera cambia de propósito: se lee, no se vende. `consultando` decide todo lo que cambia.
  const consultando = modo === "existencias" && consulta !== undefined;
  // Se consulta en cada pintada con la lista de prendas de ahora (el stock de Vender se relee solo): si la bajaron o se vendió
  // mientras la hoja está abierta, la matriz lo cuenta sin volver a escanear.
  const resultado = consultando && consulta && consultado ? consulta.leer(consultado.codigo) : null;
  const claveColor = colorTocado && colorTocado.id === consultado?.id ? colorTocado.clave : null;

  return (
    <Modal
      variante="camara"
      titulo={consultando ? "Ver existencias" : "Escanear prenda"}
      subtitulo={
        consultando
          ? "Apunta la cámara al QR de la etiqueta para ver cuántas hay de cada talla y color, en el piso y en el almacén. No se agrega nada al ticket."
          : "Apunta la cámara al QR de la etiqueta. Puedes pasar varias prendas seguidas."
      }
      onClose={() => {
        onClose();
        if (irAlTicket.current) onVerTicket?.();
      }}
    >
      {(cerrar) => (
        <>
          {/* La cámara, a sangre. Fuera de la cascada: es el fondo sobre el que entra todo lo demás. */}
          <div data-sin-cascada className="absolute inset-0">
            <video ref={videoRef} muted playsInline autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover" />
            <canvas ref={lienzoRef} className="hidden" aria-hidden />
          </div>

          {/* Barra de arriba: sobre un degradé para que la ✕ se lea sobre cualquier imagen. */}
          <div className="papel-fijo relative z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-tinta/70 to-transparent px-4 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button type="button" onClick={cerrar} aria-label="Cerrar la cámara" className={botonRedondo}>
              <X aria-hidden className="h-5 w-5" />
            </button>
            {consulta && !sinCamara ? (
              // El interruptor de qué hace la cámara con lo que lee: «Al ticket» agrega, «Existencias» solo mira. Es el segmento de modo
              // del sistema (ADR-0358, «pestanas»): muestra lo mismo —la prenda que se lee— de otra forma.
              <div className="flex min-w-0 flex-1 justify-center">
                <SegmentoDeslizante
                  forma="modo"
                  etiqueta="Qué hace la cámara con lo que lee"
                  valor={modo}
                  onCambio={cambiarModo}
                  opciones={[
                    { clave: "ticket", etiqueta: "Al ticket" },
                    { clave: "existencias", etiqueta: "Existencias" },
                  ]}
                />
              </div>
            ) : (
              <p className="label-cayla text-[11px] text-crema/90">Escanear prenda</p>
            )}
            {linterna.disponible ? (
              <button
                type="button"
                onClick={alternarLinterna}
                aria-pressed={linterna.encendida}
                aria-label={linterna.encendida ? "Apagar la linterna" : "Encender la linterna"}
                className={`${botonRedondo} ${linterna.encendida ? "!bg-crema !text-tinta" : ""}`}
              >
                {linterna.encendida ? <FlashlightOff aria-hidden className="h-5 w-5" /> : <Flashlight aria-hidden className="h-5 w-5" />}
              </button>
            ) : (
              <span aria-hidden className="w-11" />
            )}
          </div>

          {/* El visor: todo se oscurece salvo el cuadro (la sombra de 200vmax ES el velo con recorte). */}
          <div className="papel-fijo relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6">
            {sinCamara ? (
              <div className="relative z-10 flex max-w-xs flex-col items-center gap-5 text-center text-crema">
                <p className="text-[15px] leading-relaxed">
                  {estado === "sin-permiso"
                    ? "El navegador no tiene permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio, o busca la prenda por nombre."
                    : "No encontramos una cámara disponible en este aparato. Busca la prenda por nombre."}
                </p>
                <button type="button" onClick={onBuscarPorNombre} className="btn-cayla btn-secundario bg-crema">
                  Buscar por nombre
                </button>
              </div>
            ) : (
              <>
                <div
                  ref={marcoRef}
                  className="relative aspect-square w-[min(72vw,19rem,40dvh)] rounded-[28px] shadow-[0_0_0_200vmax_color-mix(in_srgb,var(--color-sombra)_62%,transparent)]"
                >
                  {/* Lo que se mueve con cada lectura va en esta capa (re-montada por `destello.id`): el marco que lleva
                      la sombra se queda quieto, así el velo no «respira» con el visor. */}
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
                <p className="relative rounded-full bg-tinta/50 px-4 py-2 text-[13px] text-crema/90 backdrop-blur-md">
                  {consultando ? "Centra el QR · solo mira, no agrega al ticket" : "Centra el QR de la etiqueta en el cuadro"}
                </p>
              </>
            )}
          </div>

          {/* La bandeja: lo que ya se leyó y el ticket. Alto fijo para las filas (ADR-0185): la hoja no salta al llegar la
              primera prenda. En pantallas bajas caben dos filas; desde 700 px de alto, tres. */}
          <div className="relative z-10 rounded-t-[28px] bg-crema dark:border-t dark:border-sand px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            {consultando && consulta ? (
              <>
                {/* «Existencias»: en vez de las escaneadas y el ticket, lo que hay de la última prenda leída. Alto fijo, como el de
                    las filas de arriba (ADR-0185): leer otra prenda, o tocar otro color, no hace saltar la hoja. */}
                <p className="label-cayla text-[10px] text-taupe">Existencias en {consulta.sede}</p>
                <div aria-live="polite" className="mt-1 h-[12.25rem] overflow-y-auto [@media(max-height:500px)]:h-[9rem] [@media(min-height:700px)]:h-[15rem]">
                  <ExistenciasEnCamara
                    key={consultado?.id ?? 0}
                    resultado={resultado}
                    claveColor={claveColor}
                    onColor={(clave) => {
                      if (consultado) setColorTocado({ id: consultado.id, clave });
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="label-cayla text-[10px] text-taupe">Escaneadas</p>
                <ul aria-live="polite" className="mt-1 h-[6.5rem] overflow-hidden [@media(min-height:700px)]:h-[9.75rem]">
                  {historial.length === 0 ? (
                    <li className="grid h-full place-items-center text-center text-[13px] text-tinta/55">Las prendas que escanees aparecen aquí.</li>
                  ) : (
                    historial.map((l) => {
                      const { tono } = mensajeEscaneo(l);
                      return (
                        <li key={l.id} className="anim-asentar flex h-[3.25rem] items-center gap-3">
                          <Miniatura prenda={l.prenda} lado={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-tinta">{l.prenda?.referencia ?? l.codigo}</span>
                            <span className="block truncate text-xs text-taupe">{detalleDe(l)}</span>
                          </span>
                          {tono === "verde" ? (
                            <span className="shrink-0 text-sm tabular-nums text-tinta">{soles(l.prenda?.precio ?? 0)}</span>
                          ) : (
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-ambar-profundo">
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ambar" />
                              {estadoCorto(l)}
                            </span>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="mt-3 flex items-center gap-3 border-t border-sand pt-3">
                  {/* La bolsa: adonde vuela cada prenda. Late cuando una entra (y recién ahí cambia su número). */}
                  <span ref={bolsaRef} key={latidoBolsa} className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tinta text-crema ${latidoBolsa > 0 ? "anim-pop" : ""}`}>
                    <ShoppingBag aria-hidden className="h-5 w-5" />
                    <Globito n={ticketMostrado.prendas} esquina sobreOscuro etiqueta="prendas en el ticket" className="absolute -right-1.5 -top-1.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="label-cayla block text-[10px] text-taupe">
                      Ticket · {ticketMostrado.prendas} {ticketMostrado.prendas === 1 ? "prenda" : "prendas"}
                    </span>
                    <span className="block font-display text-xl tabular-nums text-tinta">
                      <CifraQueCuenta valor={ticketMostrado.total} formato="soles" />
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      irAlTicket.current = true;
                      cerrar();
                    }}
                    className="btn-cayla btn-primario shrink-0"
                  >
                    Ver ticket
                  </button>
                </div>
              </>
            )}
          </div>

          {/* La tarjeta que vuela. Fija en el centro del visor (se posiciona al montarse); el vuelo lo hace la capa de
              afuera y el centrado la de adentro, así una animación no pisa a la otra. */}
          {vuelo && (
            <div ref={tarjetaRef} key={vuelo.id} data-sin-cascada aria-hidden className="pointer-events-none fixed left-1/2 top-1/2 z-30 opacity-0">
              <div className="flex w-[min(80vw,19rem)] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-2xl bg-crema p-2.5 pr-4 shadow-2xl">
                <Miniatura prenda={vuelo.prenda} lado={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-tinta">{vuelo.prenda?.referencia ?? vuelo.codigo}</span>
                  <span className="block truncate text-xs text-taupe">
                    {detalleDe(vuelo)} · {vuelo.estado === "agregada" ? soles(vuelo.prenda?.precio ?? 0) : <span className="text-ambar-profundo">{estadoCorto(vuelo)}</span>}
                  </span>
                </span>
                {vuelo.estado === "agregada" ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-verde text-crema">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="check-trazo h-4 w-4" style={{ "--d": "140ms" } as React.CSSProperties}>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ambar text-sm font-medium text-crema">!</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

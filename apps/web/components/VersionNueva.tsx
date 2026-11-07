"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  CADA_MS_PREGUNTAR_VERSION,
  MS_MAS_TARDE,
  MS_SALIDA,
  VERSION_SIN_DATO,
  hayVersionNueva,
  leerVersion,
  tocaPreguntar,
} from "@/lib/version-nueva-reglas";
import { prefiereQuieto } from "@/lib/movimiento-cliente";

/** Con qué versión se armó ESTA pestaña (`next.config.ts`). Vacío o «desarrollo»: no hay nada que comparar. */
const VERSION_PROPIA = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

/** La versión que está en producción ahora, o `null` si no se pudo saber (sin red, sesión vencida, error): nunca lanza. */
async function preguntarVersion(): Promise<string | null> {
  const control = new AbortController();
  const corte = window.setTimeout(() => control.abort(), 8_000);
  try {
    // Sin `?dpl=` ni cabeceras de Next: con la protección de versiones de Vercel, solo un pedido sin esa marca llega a la
    // versión de AHORA (ver `app/api/version/route.ts`). `no-store`: nunca una respuesta repetida.
    const respuesta = await fetch("/api/version", { cache: "no-store", signal: control.signal });
    if (!respuesta.ok) return null;
    return leerVersion(await respuesta.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(corte);
  }
}

/** El aire que la píldora deja a cada lado cuando va entre las islas de la cabecera, y bajo ella cuando cuelga. */
const AIRE_PX = 12;
const BAJO_PX = 8;

/**
 * Dónde va la píldora con la cabecera «Dos islas» (docs/maquetas/avisos-espera-vidrio-2026-10/README.md): en el HUECO entre las dos
 * islas si cabe con 12 px de aire por lado y, si no, justo bajo la cabecera, centrada sobre el contenido (el `left` de `avisos.css`).
 * Se MIDE, no se adivina por anchos: lo que hay en cada isla cambia con la cuenta y la sede. El recordatorio de cierre de caja
 * (`RecordatorioCierreCaja`) vive en el mismo hueco: si está en la barra, la píldora toma el lado que sobra; si cuelga bajo la
 * cabecera, la píldora cuelga bajo él. Sin cabecera (no debería pasar), se queda lo del CSS.
 */
function colocar(el: HTMLElement) {
  el.style.setProperty("--m", `${el.offsetWidth / 2}px`);
  const cab = document.querySelector<HTMLElement>("[data-cabecera-app]");
  const izq = cab?.querySelector<HTMLElement>(".marco-isla-izq");
  const der = cab?.querySelector<HTMLElement>(".marco-isla-der");
  if (!cab || !izq || !der) {
    delete el.dataset.colocada;
    return;
  }
  const r = cab.getBoundingClientRect();
  const alto = el.offsetHeight;
  const ancho = el.offsetWidth;
  const caps = document.querySelector<HTMLElement>(".rcc-caps")?.getBoundingClientRect();
  const hayCaps = !!caps && caps.width > 0 && caps.height > 0;
  const capsEnLaBarra = hayCaps && caps.top < r.bottom;

  // Los tramos libres de la barra: de la isla izquierda a la derecha, partidos por la cápsula de caja si está ahí.
  const a = izq.getBoundingClientRect().right;
  const b = der.getBoundingClientRect().left;
  const tramos: [number, number][] = capsEnLaBarra ? [[a, caps.left], [caps.right, b]] : [[a, b]];
  const [desde, hasta] = tramos.reduce((m, t) => (t[1] - t[0] > m[1] - m[0] ? t : m));
  if (hasta - desde >= ancho + 2 * AIRE_PX) {
    el.style.setProperty("--vn-x", `${(desde + hasta) / 2}px`);
    el.style.setProperty("--vn-y", `${r.top + (r.height - alto) / 2}px`);
    el.dataset.colocada = "hueco";
    return;
  }
  const bajo = hayCaps && !capsEnLaBarra ? caps.bottom : r.bottom;
  el.style.setProperty("--vn-y", `${bajo + BAJO_PX}px`);
  el.dataset.colocada = "bajo";
}

/**
 * «Hay una versión nueva de CAYLA»: la píldora flotante que avisa a quien tiene el ERP abierto desde antes de la última publicación
 * (ADR-0422). Montada UNA vez en `app/(app)/layout.tsx`, junto al aviso de «Sin conexión»: una pantalla nueva no tiene que
 * hacer nada. La pregunta y la comparación viven en `lib/version-nueva-reglas.ts`; aquí solo se escucha.
 *
 * Nunca recarga sola (en Vender el ticket en curso vive solo en la pantalla). «Actualizar» recarga porque la persona lo pidió;
 * la ✕ («Más tarde») la calla 30 minutos. Sin respuesta de la web, no hay aviso: callar es la degradación correcta.
 */
export function VersionNueva() {
  const [hayNueva, setHayNueva] = useState(false);
  const [callada, setCallada] = useState(false);
  // La ✕ no calla de golpe: primero se va como gota (`avisos.css`, ~1,45 s) y, al terminar, se quita de pantalla.
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    if (!VERSION_PROPIA || VERSION_PROPIA === VERSION_SIN_DATO) return;
    let vivo = true;
    let preguntando = false;
    let ultimaMs: number | null = null;

    async function mirar() {
      if (preguntando || document.visibilityState !== "visible") return;
      preguntando = true;
      ultimaMs = Date.now();
      const enProduccion = await preguntarVersion();
      preguntando = false;
      // Sin respuesta (`null`) se deja lo que ya se sabía: un tropiezo de red no apaga ni enciende la franja.
      if (vivo && enProduccion) setHayNueva(hayVersionNueva(VERSION_PROPIA, enProduccion));
    }
    const alVolver = () => {
      if (document.visibilityState === "visible" && tocaPreguntar(Date.now(), ultimaMs)) void mirar();
    };

    void mirar();
    const reloj = window.setInterval(mirar, CADA_MS_PREGUNTAR_VERSION);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, []);

  // «Más tarde» calla un rato; pasado ese tiempo, si la pestaña sigue vieja, la franja vuelve.
  useEffect(() => {
    if (!callada) return;
    const id = window.setTimeout(() => setCallada(false), MS_MAS_TARDE);
    return () => window.clearTimeout(id);
  }, [callada]);

  // La mitad del ancho de la píldora (`--m`, para que el líquido llegue a las paredes sea cual sea el largo del texto) y su lugar en la
  // cabecera (`colocar`). Al montarla, y otra vez cuando cambia la ventana, una isla o el recordatorio de caja.
  const pildora = useRef<HTMLDivElement | null>(null);
  const medirPildora = useCallback((el: HTMLDivElement | null) => {
    pildora.current = el;
    if (el) colocar(el);
  }, []);
  const visible = hayNueva && !callada;
  useEffect(() => {
    if (!visible) return;
    const remedir = () => pildora.current && colocar(pildora.current);
    const observador = new ResizeObserver(remedir);
    const cab = document.querySelector<HTMLElement>("[data-cabecera-app]");
    if (cab) {
      observador.observe(cab);
      cab.querySelectorAll<HTMLElement>(".marco-isla").forEach((isla) => observador.observe(isla));
    }
    // El recordatorio de caja y la cabecera de una pantalla nueva terminan de montarse un poco después: se vuelve a medir.
    const ids = [window.setTimeout(remedir, 400), window.setTimeout(remedir, 1500)];
    window.addEventListener("resize", remedir);
    return () => {
      observador.disconnect();
      ids.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", remedir);
    };
  }, [visible]);

  useEffect(() => {
    if (!saliendo) return;
    // Respaldo: si el navegador no avisa que terminó la animación (o no hay), igual se va.
    const id = window.setTimeout(() => {
      setCallada(true);
      setSaliendo(false);
    }, MS_SALIDA + 300);
    return () => window.clearTimeout(id);
  }, [saliendo]);

  const alPulsarMasTarde = useCallback(() => {
    // Con «reducir movimiento» no hay gota: se va ya.
    if (prefiereQuieto()) setCallada(true);
    else setSaliendo(true);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* El filtro de «goteo» que funde las gotas en un solo líquido (blur + contraste del alfa). Una vez, sin tamaño. */}
      <svg width="0" height="0" aria-hidden className="absolute">
        <filter id="liquido" x="-10%" y="-250%" width="120%" height="600%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
        </filter>
      </svg>
      {/* Flota fuera del contenido (ADR-0422, act. 2026-10-28): no empuja la pantalla ni la tapa la barra fija de Finanzas. Entra como una
          gota que cae, rebota una vez y se riega como líquido hasta ser la píldora (excepción de ADR-0136; el detalle, en `avisos.css`). */}
      <div
        ref={medirPildora}
        role="status"
        className={`version-nueva ${saliendo ? "version-nueva-sale" : ""}`}
        onAnimationEnd={(e) => {
          if (saliendo && e.target === e.currentTarget && e.animationName === "cayla-version-cae-sale") {
            setCallada(true);
            setSaliendo(false);
          }
        }}
      >
        {/* La luz de la gota ahumada: lo de atrás, desenfocado, a través del líquido (vidrio/avisos-espera.css). */}
        <span aria-hidden className="version-nueva-luz" />
        <div aria-hidden className="version-nueva-agua">
          <div className="version-nueva-goo">
            <i className="vn-gota" />
            <i className="vn-piso" />
            <i className="vn-cab-l" />
            <i className="vn-cab-r" />
            <i className="vn-col vn-col-0" />
            <i className="vn-col vn-col-1" />
            <i className="vn-col vn-col-2" />
            <i className="vn-col vn-col-3" />
            <i className="vn-col vn-col-4" />
          </div>
        </div>
        <span aria-hidden className="version-nueva-punto" />
        <p className="version-nueva-texto" title="Termina lo que estás haciendo y actualiza.">
          Hay una versión nueva <span>· actualiza cuando termines</span>
        </p>
        <button type="button" className="btn-cayla btn-secundario" onClick={() => window.location.reload()}>
          Actualizar
        </button>
        <button type="button" className="version-nueva-x" aria-label="Más tarde" title="Más tarde" onClick={alPulsarMasTarde}>
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  DETALLE_TARDA,
  DETALLE_TARDA_GUARDANDO,
  MENSAJE_GUARDANDO,
  clasificarPeticion,
  mensajeDeCarga,
  seccionDeRuta,
  type MensajeEspera,
} from "@/lib/espera-reglas";

/* ====================================================================
   El loader general (ADR-0149) — UNO solo, a pantalla completa.

   Cuándo aparece: mientras una pantalla carga, mientras un botón guarda algo y mientras se cambia de
   sede. Cuándo se va: en el instante en que llegan los datos. No es un reloj: dura lo que tarda la
   respuesta, ni un segundo más (salvo los 400 ms mínimos de abajo, que evitan el destello).

   Cómo se activa: nadie lo llama a mano. `EsperaGlobal` (una vez, en el layout raíz) envuelve
   `window.fetch` y mira cada petición con `clasificarPeticion` (lib/espera-reglas.ts). Así un botón
   nuevo, una pantalla nueva o una RPC nueva quedan cubiertos sin acordarse de nada. Para lo que NO
   pasa por fetch existen `useEsperando` y `esperar`; para la carga en frío, `<EsperaPantalla />`
   dentro de cada `loading.tsx`.

   Cómo se ve: el aviso de cambio de sede, generalizado. Va en un portal a `body`, POR ENCIMA de
   todo (lateral z-40, cabecera z-30, modales z-50), y mientras está a la vista el resto de la app
   queda `inert`: el velo frena el ratón pero solo `inert` frena el teclado, y una tecla podía actuar
   sobre datos que se están dejando. No es un diálogo (no se cierra con Escape): es un estado, `role="status"`.
   Entra y sale con el movimiento de los modales (ADR-0136). Lo único en bucle es la señal de «estoy
   trabajando» (el arco y el hilo); con movimiento reducido se queda quieta.

   Tiempos: 200 ms antes de aparecer (una respuesta rápida no lo muestra), 400 ms mínimo una vez
   visible, 150 ms de gracia para fusionar peticiones encadenadas (guardar → refrescar), a los 4 s
   admite que tarda, y una ficha se suelta sola a los 30 s: la app nunca queda bloqueada.
   ==================================================================== */

const MS_ANTES = 200;
const MS_MINIMO = 400;
const MS_GRACIA = 150;
/** Debe coincidir con `.anim-modal-sale` en globals.css. */
const MS_SALIDA = 220;
const MS_TARDA = 4000;
const MS_TOPE = 30_000;

/** Quién gana el texto cuando hay varias esperas a la vez: lo pedido a mano > guardar > cargar. */
const PRIORIDAD = { carga: 1, guardado: 2, explicito: 3 } as const;

type Ficha = { id: number; prioridad: number; mensaje: MensajeEspera };

// ---- El almacén: una lista de «fichas» (esperas en curso), fuera de React para que `fetch` la use ----
let siguiente = 0;
const fichas = new Map<number, Ficha>();
const oyentes = new Set<() => void>();
const SIN_FICHAS: readonly Ficha[] = [];
let instantanea: readonly Ficha[] = SIN_FICHAS;

function emitir() {
  instantanea = fichas.size ? [...fichas.values()] : SIN_FICHAS;
  oyentes.forEach((o) => o());
}
function suscribir(o: () => void) {
  oyentes.add(o);
  return () => void oyentes.delete(o);
}

function tomarFicha(prioridad: number, mensaje: MensajeEspera): () => void {
  const id = ++siguiente;
  fichas.set(id, { id, prioridad, mensaje });
  emitir();
  let suelta = false;
  const soltar = () => {
    if (suelta) return;
    suelta = true;
    window.clearTimeout(tope);
    fichas.delete(id);
    emitir();
  };
  const tope = window.setTimeout(soltar, MS_TOPE);
  return soltar;
}

/**
 * Para esperas que no son una petición de red (un cálculo largo, un `await` de varios pasos).
 * `const fin = esperar({ ... }); try { … } finally { fin(); }`. Sin mensaje dice «Guardando».
 */
export function esperar(mensaje?: MensajeEspera): () => void {
  return tomarFicha(mensaje ? PRIORIDAD.explicito : PRIORIDAD.guardado, mensaje ?? MENSAJE_GUARDANDO);
}

/**
 * Mientras `activo` sea true, el loader está a la vista. Es lo que usa el cambio de sede
 * (`activo` = el `pending` de su `useTransition`). Con `mensaje` manda su texto; sin él, «Guardando».
 */
export function useEsperando(activo: boolean, mensaje?: MensajeEspera) {
  const { etiqueta, titulo, resalte, detalle } = mensaje ?? {};
  useEffect(() => {
    if (!activo) return;
    return esperar(etiqueta && titulo ? { etiqueta, titulo, resalte, detalle } : undefined);
  }, [activo, etiqueta, titulo, resalte, detalle]);
}

/**
 * Va dentro de cada `loading.tsx`: mientras ese fallback está montado, la pantalla destino todavía no
 * está lista. Cubre lo que el interceptor de `fetch` no ve (la primera carga en frío, antes de hidratar).
 */
export function EsperaPantalla() {
  const seccion = seccionDeRuta(usePathname() ?? "/");
  const { etiqueta, titulo, detalle } = mensajeDeCarga(seccion);
  useEffect(() => tomarFicha(PRIORIDAD.carga, { etiqueta, titulo, detalle }), [etiqueta, titulo, detalle]);
  return null;
}

// ---- El interceptor de `fetch`: se instala una sola vez, al cargar el módulo en el navegador ----
declare global {
  interface Window {
    __esperaInstalada?: boolean;
  }
}

async function hastaElFinal(res: Response) {
  // Las respuestas de Next llegan en streaming: los encabezados vienen primero y la pantalla, después.
  // Se lee una copia hasta el último byte para soltar la ficha cuando ya hay algo que mostrar.
  const lector = res.clone().body?.getReader();
  if (!lector) return;
  while (!(await lector.read()).done) {
    /* solo se drena */
  }
}

function instalarInterceptor() {
  if (typeof window === "undefined" || window.__esperaInstalada) return;
  window.__esperaInstalada = true;
  const original = window.fetch.bind(window);
  const hostSupabase = (() => {
    try {
      return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
    } catch {
      return null;
    }
  })();

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let clasificacion: ReturnType<typeof clasificarPeticion> = null;
    try {
      const esRequest = typeof Request !== "undefined" && input instanceof Request;
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url, window.location.href);
      const cabeceras = new Headers(init?.headers ?? (esRequest ? (input as Request).headers : undefined));
      clasificacion = clasificarPeticion({
        url,
        metodo: init?.method ?? (esRequest ? (input as Request).method : "GET"),
        cabecera: (n) => cabeceras.get(n),
        origen: window.location.origin,
        hostSupabase,
      });
    } catch {
      /* si algo raro llega, la petición sigue su camino sin loader */
    }
    if (!clasificacion) return original(input, init);

    const soltar =
      clasificacion.tipo === "guardado"
        ? tomarFicha(PRIORIDAD.guardado, MENSAJE_GUARDANDO)
        : tomarFicha(PRIORIDAD.carga, mensajeDeCarga(clasificacion.seccion));
    return original(input, init).then(
      (res) => {
        hastaElFinal(res).then(soltar, soltar);
        return res;
      },
      (err) => {
        soltar();
        throw err;
      },
    );
  };
}
instalarInterceptor();

// ---- El loader en sí ----
export function EsperaGlobal() {
  const activas = useSyncExternalStore(suscribir, () => instantanea, () => SIN_FICHAS);
  const hay = activas.length > 0;

  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [tarda, setTarda] = useState(false);
  const [mensaje, setMensaje] = useState<{ prioridad: number; mensaje: MensajeEspera }>({ prioridad: 0, mensaje: MENSAJE_GUARDANDO });

  // Si llega otra espera mientras el loader se iba, la salida se cancela (ajuste durante el render, no en un efecto).
  const [habiaEspera, setHabiaEspera] = useState(hay);
  if (hay !== habiaEspera) {
    setHabiaEspera(hay);
    if (hay && saliendo) setSaliendo(false);
  }

  const relojes = useRef<{ mostrar?: number; salir?: number; cerrar?: number }>({});
  const visibleRef = useRef(false);
  const desde = useRef(0);
  const foco = useRef<HTMLElement | null>(null);

  // El texto que manda: el de mayor prioridad de la sesión (no baja mientras el loader sigue a la vista,
  // así «Guardando» no se convierte en «Cargando» cuando el guardado encadena un refresco).
  useEffect(() => {
    if (!activas.length) return;
    const mejor = activas.reduce((a, b) => (b.prioridad >= a.prioridad ? b : a));
    setMensaje((previo) => (visibleRef.current && mejor.prioridad < previo.prioridad ? previo : { prioridad: mejor.prioridad, mensaje: mejor.mensaje }));
  }, [activas]);

  // La línea de tiempo: 200 ms antes de aparecer, 400 ms mínimo, 150 ms de gracia, salida de 220 ms.
  useEffect(() => {
    const r = relojes.current;
    if (hay) {
      window.clearTimeout(r.salir);
      window.clearTimeout(r.cerrar);
      if (!visibleRef.current && r.mostrar === undefined) {
        r.mostrar = window.setTimeout(() => {
          r.mostrar = undefined;
          desde.current = Date.now();
          visibleRef.current = true;
          setVisible(true);
        }, MS_ANTES);
      }
      return;
    }
    window.clearTimeout(r.mostrar);
    r.mostrar = undefined;
    if (!visibleRef.current) return;
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const espera = Math.max(MS_GRACIA, MS_MINIMO - (Date.now() - desde.current));
    r.salir = window.setTimeout(() => {
      setSaliendo(true);
      r.cerrar = window.setTimeout(
        () => {
          visibleRef.current = false;
          setVisible(false);
          setSaliendo(false);
        },
        sinMovimiento ? 0 : MS_SALIDA,
      );
    }, espera);
  }, [hay]);

  useEffect(() => {
    const r = relojes.current;
    return () => {
      window.clearTimeout(r.mostrar);
      window.clearTimeout(r.salir);
      window.clearTimeout(r.cerrar);
    };
  }, []);

  // Admite que tarda; el aviso vuelve a «normal» cuando se va.
  useEffect(() => {
    if (!visible || saliendo) return;
    const t = window.setTimeout(() => setTarda(true), MS_TARDA);
    return () => {
      window.clearTimeout(t);
      setTarda(false);
    };
  }, [visible, saliendo]);

  // Mientras está a la vista, todo lo demás deja de recibir clics, foco y teclado; al irse, el foco vuelve
  // adonde estaba (un elemento vuelto `inert` lo suelta y sin esto la persona quedaría «en ninguna parte»).
  useEffect(() => {
    if (!visible) return;
    foco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bloqueados = [...document.body.children].filter((el) => !el.hasAttribute("data-espera") && !el.hasAttribute("inert"));
    bloqueados.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      bloqueados.forEach((el) => el.removeAttribute("inert"));
      const previo = foco.current;
      if (previo?.isConnected && (document.activeElement === document.body || document.activeElement === null)) previo.focus({ preventScroll: true });
    };
  }, [visible]);

  if (!visible) return null;

  const { etiqueta, titulo, resalte, detalle } = mensaje.mensaje;
  const guardando = etiqueta === MENSAJE_GUARDANDO.etiqueta;
  const linea = tarda ? (guardando ? DETALLE_TARDA_GUARDANDO : DETALLE_TARDA) : detalle;

  return createPortal(
    <div
      role="status"
      data-espera
      aria-live="polite"
      className={`fixed inset-0 z-[60] flex cursor-progress items-center justify-center bg-crema/60 px-4 backdrop-blur-[3px] ${
        saliendo ? "anim-velo-salida" : "anim-velo"
      }`}
    >
      <div
        className={`relative w-full max-w-[380px] overflow-hidden rounded-[20px] bg-papel px-6 pb-6 pt-6 text-center shadow-[0_22px_44px_-22px_rgba(80,50,20,0.5)] ring-1 ring-tinta/[0.07] ${
          saliendo ? "anim-modal-sale" : "anim-modal-entra"
        }`}
      >
        <div className="relative mx-auto mb-3.5 grid h-16 w-16 place-items-center">
          <Image src="/cayla-isotipo.png" alt="" width={34} height={34} priority className="h-[34px] w-auto" />
          <svg aria-hidden viewBox="0 0 64 64" fill="none" strokeWidth={2} className="absolute inset-0 h-full w-full">
            <circle cx="32" cy="32" r="29" className="stroke-sand" />
            <circle
              cx="32"
              cy="32"
              r="29"
              strokeDasharray="46 137"
              strokeLinecap="round"
              className="origin-center stroke-rojo animate-spin [animation-duration:1.1s] motion-reduce:animate-none"
            />
          </svg>
        </div>
        <p className="label-cayla text-[11px] text-taupe-profundo">{etiqueta}</p>
        <p className="font-display mt-1.5 text-[26px] leading-[1.15] text-tinta">
          {titulo}
          {resalte ? <> <span className="text-rojo-profundo">{resalte}</span></> : null}
        </p>
        {linea ? <p className="mt-2 text-[13px] text-tinta/65">{linea}</p> : null}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <span className="block h-full w-1/3 bg-rojo [animation:cayla-hilo-barrido_1.1s_linear_infinite] motion-reduce:animate-none" />
        </span>
      </div>
    </div>,
    document.body,
  );
}

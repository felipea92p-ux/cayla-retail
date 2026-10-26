"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import { alejarFondo, devolverFondo, moverFondo } from "@/components/ui/fondoDeLaHoja";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";
import { useHojaArrastre } from "@/components/ui/useHojaArrastre";
import { useAtrasCierraLaHoja } from "@/components/ui/useAtrasCierraLaHoja";
import { CELULAR, useEnCelular } from "@/components/ui/useEnCelular";
import { decidirLado, goma, pasoDeLado, velocidad, type Muestra } from "@/lib/hoja-gesto";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;
/** En el celular el cajón es una hoja alta que llega desde abajo (ADR-0479): lo mismo que `cayla-hoja-movil-entra/-sale`. */
const MS_SALIDA_CELULAR = 300;
const MS_ENTRADA_CELULAR = 460;

/* ====================================================================
   Cajon · la hoja que entra por la derecha con el detalle de algo (ADR-0358, ronda 17: Felipe la eligió mirando el 2026-10-17)

   LA BANDA DE COMPRAS, en todos: arriba una banda con su marca a la izquierda (el avatar de 40, el sello de un movimiento, el ícono
   del aparato), el nombre en versalitas (`sobre`), el título serif de 24, la frase en taupe y, si hace falta, una fila de insignias
   (`debajo`); a la derecha, la × de las hojas. El cuerpo corre por su cuenta y el pie lleva las acciones y, si la lista lo permite,
   «3 de 12» con ↑ ↓ (también con el teclado, `useFlechasDelCajon`). Antes eran siete cajones con tres caras (anchos de 432 a 544 px,
   tres ×, la cabecera dentro o fuera del cuerpo).

   Dos anchos con nombre: «normal» (456 px) y «ancho» (544 px, la orden de Producción). Con `velo` (de fábrica) oscurece lo de atrás
   y se cierra al tocar afuera; sin él la lista sigue viva detrás y tocar otra fila le cambia el contenido (Movimientos, Equipo).

   Movimiento (ADR-0136): entra 28 px desde la derecha (380 ms) y sale en 240 ms; al pasar de un registro a otro (`clave`) el
   contenido se reacomoda sin cerrar el cajón. El cierre va en dos tiempos, como `Modal`: primero se anima la salida y recién ahí se
   le avisa a quien lo abrió. Escape cierra solo si ningún control de adentro lo usó (`useEscapeLibre`). Lo que necesita cerrarlo
   desde adentro (un «Listo» del cuerpo) recibe `cerrar` si `children` o `pie` son una función.

   En el celular (ADR-0479, actividad 5) el cajón es la misma hoja que `Modal`: alta (92 %), llega desde abajo con su asa, se baja
   con el dedo, aleja lo de atrás y SIEMPRE lleva velo (la lista de atrás queda tapada, no sirve tocarla). Con `navegacion`, se
   desliza a los lados para pasar de registro: el dedo a la izquierda es el siguiente, y el registro nuevo entra desde ese lado.
   Y «atrás» (el botón o el gesto desde el borde) lo cierra sin salir de la pantalla, como a toda hoja (ADR-0528).
   ==================================================================== */

/** ¿Celular? En el servidor «no»; el cajón se abre después de un toque, así que ya en el navegador responde de verdad. */
/** Lo que no desliza de lado aunque el dedo vaya de lado: escribir, una lista abierta, un deslizador. */
const NO_DESLIZA = 'input, textarea, select, [contenteditable="true"], [role="slider"], [data-capa-flotante] > *';

type Navegacion = NonNullable<Props["navegacion"]>;
const hayEnLaLista = (n: Navegacion) => ({ anterior: !!n.circular || n.indice > 0, siguiente: !!n.circular || n.indice < n.total - 1 });

/**
 * Pasar de registro deslizando de lado (solo en el celular). El registro sigue al dedo; en las puntas de la lista resiste. Al
 * soltar decide `pasoDeLado` (lib/hoja-gesto.ts): pasa, o vuelve a su lugar. Un ref de callback estable, como `useHojaArrastre`.
 */
function useDeslizarDeLado(op: { navegacion?: Navegacion; registro: RefObject<HTMLElement | null>; alPasar: (paso: 1 | -1) => void }) {
  const actual = useRef(op);
  useEffect(() => {
    actual.current = op;
  });
  const quitar = useRef<(() => void) | null>(null);
  return useCallback((hoja: HTMLElement | null) => {
    quitar.current?.();
    quitar.current = null;
    if (!hoja) return;
    let g: { x0: number; y0: number; deLado: boolean; muestras: Muestra[] } | null = null;
    const registro = () => actual.current.registro.current;

    const alTocar = (e: TouchEvent) => {
      g = null;
      const n = actual.current.navegacion;
      if (!n || n.total < 2 || e.touches.length !== 1 || !window.matchMedia?.(CELULAR).matches) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo || objetivo.closest(NO_DESLIZA)) return;
      // Bajo el dedo hay algo que corre de lado (una tabla ancha): el gesto es suyo.
      for (let el: Element | null = objetivo; el && hoja.contains(el); el = el.parentElement) {
        if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return;
      }
      const t = e.touches[0];
      g = { x0: t.clientX, y0: t.clientY, deLado: false, muestras: [{ t: performance.now(), y: t.clientX }] };
    };
    const alMover = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      if (!g.deLado) {
        const d = decidirLado(dx, t.clientY - g.y0);
        if (d === null) return;
        if (d === "otro") {
          g = null;
          return;
        }
        g.deLado = true;
      }
      if (e.cancelable) e.preventDefault();
      g.muestras.push({ t: performance.now(), y: t.clientX });
      if (g.muestras.length > 12) g.muestras.shift();
      const n = actual.current.navegacion;
      const hay = n ? hayEnLaLista(n) : { anterior: false, siguiente: false };
      const contraLaPunta = (dx < 0 && !hay.siguiente) || (dx > 0 && !hay.anterior);
      const x = contraLaPunta ? Math.sign(dx) * goma(Math.abs(dx)) : dx;
      const reg = registro();
      if (reg) {
        reg.style.transition = "none";
        reg.style.transform = `translate3d(${x}px, 0, 0)`;
        reg.style.opacity = String(1 - Math.min(0.5, Math.abs(x) / 400));
      }
    };
    const alSoltar = (e: TouchEvent) => {
      const gesto = g;
      g = null;
      if (!gesto?.deLado) return;
      const reg = registro();
      const n = actual.current.navegacion;
      const dx = gesto.muestras[gesto.muestras.length - 1].y - gesto.x0;
      const vx = e.type === "touchcancel" ? 0 : velocidad(gesto.muestras);
      const paso = n ? pasoDeLado(dx, vx, hoja.clientWidth, hayEnLaLista(n)) : 0;
      if (!reg) return;
      if (paso === 0) {
        reg.style.transition = "transform 300ms var(--ease-cayla), opacity 300ms var(--ease-cayla)";
        reg.style.transform = "";
        reg.style.opacity = "";
        return;
      }
      // Sale hacia su lado; el registro nuevo (otra `clave`, otro elemento) entra desde el lado contrario (globals.css).
      reg.style.transition = "transform 160ms var(--ease-salida), opacity 160ms var(--ease-salida)";
      reg.style.transform = `translate3d(${-paso * 48}px, 0, 0)`;
      reg.style.opacity = "0";
      setTimeout(() => actual.current.alPasar(paso), 150);
    };

    hoja.addEventListener("touchstart", alTocar, { passive: true });
    hoja.addEventListener("touchmove", alMover, { passive: false });
    hoja.addEventListener("touchend", alSoltar);
    hoja.addEventListener("touchcancel", alSoltar);
    quitar.current = () => {
      hoja.removeEventListener("touchstart", alTocar);
      hoja.removeEventListener("touchmove", alMover);
      hoja.removeEventListener("touchend", alSoltar);
      hoja.removeEventListener("touchcancel", alSoltar);
    };
  }, []);
}

type Contenido = ReactNode | ((cerrar: () => void) => ReactNode);

type Props = {
  onCerrar: () => void;
  titulo: ReactNode;
  /** Versalitas sobre el título: a quién o a qué pertenece («Textiles Andina SAC»). */
  sobre?: ReactNode;
  /** La frase bajo el título, en taupe. Es la descripción de la hoja para el lector (si no hay, lo es `sobre`). */
  frase?: ReactNode;
  /** Bajo la frase: una fila de insignias. */
  debajo?: ReactNode;
  /** A la izquierda de la banda: el avatar, el sello o el ícono. */
  marca?: ReactNode;
  ancho?: "normal" | "ancho";
  velo?: boolean;
  /** Sin velo no se lleva el foco (la lista de atrás sigue siendo la que se usa); con velo, `true` lo deja donde estaba. */
  sinFocoInicial?: boolean;
  /** Cambia con el registro: el contenido se reacomoda sin cerrar el cajón. */
  clave?: string;
  navegacion?: {
    indice: number;
    total: number;
    onNavegar: (delta: 1 | -1) => void;
    /** «Comprobante», «Nota»: dice «Comprobante anterior» / «Comprobante siguiente» al lector. */
    que: string;
    /** La lista da la vuelta (de la última a la primera): las flechas no se apagan en las puntas. */
    circular?: boolean;
  };
  pie?: Contenido;
  /** Fijo entre el cuerpo y el pie, a la vista aunque el cuerpo corra (el «Siguiente paso» de una orden cerrada). */
  encimaDelPie?: ReactNode;
  children: Contenido;
  /** Clases del cuerpo (el espacio entre sus bloques). */
  claseCuerpo?: string;
  etiquetaCerrar?: string;
  guia?: string;
  guiaCabecera?: string;
  guiaCuerpo?: string;
  guiaPie?: string;
};

export function Cajon({
  onCerrar,
  titulo,
  sobre,
  frase,
  debajo,
  marca,
  ancho = "normal",
  velo = true,
  sinFocoInicial = !velo,
  clave,
  navegacion,
  pie,
  encimaDelPie,
  children,
  claseCuerpo = "",
  etiquetaCerrar = "Cerrar",
  guia,
  guiaCabecera,
  guiaCuerpo,
  guiaPie,
}: Props) {
  const enCelular = useEnCelular();
  // En el celular la hoja tapa la lista de atrás: siempre con velo (y modal).
  const conVelo = velo || enCelular;
  const [cerrando, setCerrando] = useState(false);
  // Se fue con el dedo: ya está abajo; no lleva la salida de la clase y se desmonta en lo que tardó (como `Modal`).
  const [salidaPropia, setSalidaPropia] = useState(false);
  const msSalidaPropia = useRef<number | null>(null);
  const veloRef = useRef<HTMLDivElement>(null);
  const fondo = useRef<symbol | null>(null);
  const registro = useRef<HTMLDivElement>(null);
  // De qué lado entra el registro nuevo (celular): +1 el siguiente (desde la derecha), −1 el anterior.
  const [lado, setLado] = useState<0 | 1 | -1>(0);
  const cerrar = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = msSalidaPropia.current ?? (window.matchMedia?.(CELULAR).matches ? MS_SALIDA_CELULAR : MS_SALIDA);
    devolverFondo(fondo.current, reducido ? 0 : ms);
    const t = setTimeout(onCerrar, reducido ? 0 : ms);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  const alEscape = useEscapeLibre(cerrar);
  // En el teléfono «atrás» cierra el cajón, no la pantalla (ADR-0528); sale de la pila apenas empieza a cerrarse.
  const [conAtras] = useState(() => typeof window !== "undefined" && window.matchMedia?.(CELULAR).matches === true);
  useAtrasCierraLaHoja(conAtras && !cerrando, cerrar);
  const sinNavegar = useCallback(() => {}, []);
  const alFlecha = useFlechasDelCajon(navegacion?.onNavegar ?? sinNavegar);

  // Lo de atrás se aleja mientras el cajón está abierto en el celular (como con `Modal`).
  useEffect(() => {
    if (!window.matchMedia?.(CELULAR).matches || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const llave = alejarFondo(MS_ENTRADA_CELULAR);
    fondo.current = llave;
    return () => {
      devolverFondo(llave, 0);
      fondo.current = null;
    };
  }, []);
  const arrastre = useHojaArrastre({
    activo: true,
    bloqueado: false,
    velo: veloRef,
    alSoltarParaCerrar: (salir) => salir(),
    alSalir: (ms) => {
      msSalidaPropia.current = ms;
      setSalidaPropia(true);
      setCerrando(true);
    },
    alMoverse: (progreso, ms) => moverFondo(fondo.current, progreso, ms),
  });
  const navegar = useCallback(
    (paso: 1 | -1) => {
      setLado(paso);
      navegacion?.onNavegar(paso);
    },
    [navegacion]
  );
  const deslizar = useDeslizarDeLado({ navegacion, registro, alPasar: navegar });
  const ponerHoja = useCallback(
    (el: HTMLDivElement | null) => {
      arrastre.enlazar(el);
      deslizar(el);
    },
    [arrastre, deslizar]
  );

  const describe = frase ? "frase" : sobre ? "sobre" : null;
  const cuerpo = typeof children === "function" ? children(cerrar) : children;
  const acciones = typeof pie === "function" ? pie(cerrar) : pie;
  const n = navegacion;

  return (
    <Dialog.Root open modal={conVelo} onOpenChange={(abierto) => !abierto && cerrar()}>
      <Dialog.Portal>
        {conVelo && (
          <Dialog.Overlay
            ref={veloRef}
            className={`fixed inset-0 z-50 bg-sombra/25 dark:bg-sombra/55 backdrop-blur-[2px] ${cerrando ? (salidaPropia ? "" : "anim-velo-salida") : "anim-velo"}`}
          />
        )}
        <Dialog.Content
          ref={ponerHoja}
          data-guia={guia}
          // Sin frase ni versalitas no hay descripción: se dice explícito (si no, Radix avisa que falta una).
          {...(describe ? {} : { "aria-describedby": undefined })}
          onEscapeKeyDown={alEscape}
          onKeyDown={n ? alFlecha : undefined}
          onInteractOutside={conVelo ? undefined : (e) => e.preventDefault()}
          onOpenAutoFocus={sinFocoInicial ? (e) => e.preventDefault() : undefined}
          // En el celular: una hoja alta que llega desde abajo (`cajon-hoja`, globals.css «HOJA DEL CELULAR»).
          className={`cajon-hoja fixed inset-y-0 right-0 z-50 flex w-full ${ancho === "ancho" ? "max-w-[34rem]" : "max-w-[28.5rem]"} flex-col border-l border-sand bg-papel outline-none max-sm:inset-x-0 max-sm:top-auto max-sm:h-[min(92dvh,92%)] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:max-w-none max-sm:rounded-t-2xl max-sm:border-l-0 max-sm:border-t ${
            cerrando ? (salidaPropia ? "" : "anim-cajon-salida") : "anim-cajon"
          }`}
        >
          <div key={clave} ref={registro} data-registro data-lado={lado || undefined} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <div data-guia={guiaCabecera} className="flex items-start gap-3.5 border-b border-tinta/10 px-6 pb-4 pt-5">
              {marca ? <span className="shrink-0">{marca}</span> : null}
              <div className="min-w-0 flex-1">
                {sobre ? (
                  describe === "sobre" ? (
                    <Dialog.Description className="label-cayla truncate text-[10.5px] text-tinta/65">{sobre}</Dialog.Description>
                  ) : (
                    <p className="label-cayla truncate text-[10.5px] text-tinta/65">{sobre}</p>
                  )
                ) : null}
                <Dialog.Title asChild>
                  <h2 className="font-display break-words text-2xl leading-tight text-tinta">{/* unificar-fijo: es el título de la hoja (Dialog.Title), no de un bloque */}{titulo}</h2>
                </Dialog.Title>
                {frase ? (
                  <Dialog.Description asChild>
                    <div className="mt-1 text-[13px] leading-snug text-taupe">{frase}</div>
                  </Dialog.Description>
                ) : null}
                {debajo ? <div className="mt-2.5">{debajo}</div> : null}
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label={etiquetaCerrar}
                className="-mr-1 shrink-0 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div data-guia={guiaCuerpo} className={`scroll-cayla min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 max-sm:overscroll-contain ${claseCuerpo}`}>
              {cuerpo}
            </div>

            {encimaDelPie}

            {acciones || n ? (
              <div data-guia={guiaPie} className="flex flex-wrap items-center gap-2.5 border-t border-tinta/10 px-6 py-4">
                {acciones}
                {n ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-tinta/55">
                    {n.indice + 1} de {n.total}
                    {/* En el celular las flechas van a los lados: es hacia donde se desliza el registro. */}
                    <button
                      type="button"
                      onClick={() => navegar(-1)}
                      disabled={!n.circular && n.indice <= 0}
                      aria-label={`${n.que} anterior`}
                      className="grid h-8 w-8 place-items-center rounded-md border border-tinta/15 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ChevronUp aria-hidden className="h-4 w-4 max-sm:hidden" />
                      <ChevronLeft aria-hidden className="h-4 w-4 sm:hidden" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navegar(1)}
                      disabled={!n.circular && n.indice >= n.total - 1}
                      aria-label={`${n.que} siguiente`}
                      className="grid h-8 w-8 place-items-center rounded-md border border-tinta/15 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ChevronDown aria-hidden className="h-4 w-4 max-sm:hidden" />
                      <ChevronRight aria-hidden className="h-4 w-4 sm:hidden" />
                    </button>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {/* El asa del celular (ADR-0479): fuera del registro, así no se desliza con él. */}
          <div aria-hidden data-asa-hoja className="asa-hoja" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

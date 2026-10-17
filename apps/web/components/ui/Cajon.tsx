"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { useFlechasDelCajon } from "@/components/ui/useFlechasDelCajon";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

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
   ==================================================================== */

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
  const [cerrando, setCerrando] = useState(false);
  const cerrar = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  const alEscape = useEscapeLibre(cerrar);
  const sinNavegar = useCallback(() => {}, []);
  const alFlecha = useFlechasDelCajon(navegacion?.onNavegar ?? sinNavegar);

  const describe = frase ? "frase" : sobre ? "sobre" : null;
  const cuerpo = typeof children === "function" ? children(cerrar) : children;
  const acciones = typeof pie === "function" ? pie(cerrar) : pie;
  const n = navegacion;

  return (
    <Dialog.Root open modal={velo} onOpenChange={(abierto) => !abierto && cerrar()}>
      <Dialog.Portal>
        {velo && <Dialog.Overlay className={`fixed inset-0 z-50 bg-sombra/25 dark:bg-sombra/55 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />}
        <Dialog.Content
          data-guia={guia}
          // Sin frase ni versalitas no hay descripción: se dice explícito (si no, Radix avisa que falta una).
          {...(describe ? {} : { "aria-describedby": undefined })}
          onEscapeKeyDown={alEscape}
          onKeyDown={n ? alFlecha : undefined}
          onInteractOutside={velo ? undefined : (e) => e.preventDefault()}
          onOpenAutoFocus={sinFocoInicial ? (e) => e.preventDefault() : undefined}
          className={`fixed inset-y-0 right-0 z-50 flex w-full ${ancho === "ancho" ? "max-w-[34rem]" : "max-w-[28.5rem]"} flex-col border-l border-sand bg-papel outline-none ${
            cerrando ? "anim-cajon-salida" : "anim-cajon"
          }`}
        >
          <div key={clave} className="anim-asentar flex min-h-0 flex-1 flex-col">
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

            <div data-guia={guiaCuerpo} className={`scroll-cayla min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 ${claseCuerpo}`}>
              {cuerpo}
            </div>

            {encimaDelPie}

            {acciones || n ? (
              <div data-guia={guiaPie} className="flex flex-wrap items-center gap-2.5 border-t border-tinta/10 px-6 py-4">
                {acciones}
                {n ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-tinta/55">
                    {n.indice + 1} de {n.total}
                    <button
                      type="button"
                      onClick={() => n.onNavegar(-1)}
                      disabled={!n.circular && n.indice <= 0}
                      aria-label={`${n.que} anterior`}
                      className="grid h-8 w-8 place-items-center rounded-md border border-tinta/15 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ChevronUp aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => n.onNavegar(1)}
                      disabled={!n.circular && n.indice >= n.total - 1}
                      aria-label={`${n.que} siguiente`}
                      className="grid h-8 w-8 place-items-center rounded-md border border-tinta/15 transition-colors hover:border-rojo hover:text-rojo disabled:pointer-events-none disabled:opacity-35"
                    >
                      <ChevronDown aria-hidden className="h-4 w-4" />
                    </button>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

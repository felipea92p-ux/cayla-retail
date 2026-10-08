"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { useHojaSobreElTeclado } from "@/components/ui/useHojaSobreElTeclado";

/** Debe coincidir con `.anim-salida` en globals.css. */
const MS_SALIDA = 220;

type Props = {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onClose: () => void;
  /** Como nodo, o como función que recibe el cierre animado — así un botón
      "Cancelar" propio del formulario sale con la misma animación que Escape,
      en vez de desaparecer de golpe. */
  children: ReactNode | ((cerrar: () => void) => ReactNode);
  /** Ancho del panel en escritorio (Tailwind max-w-*). Por defecto el tamaño estándar de formulario corto. */
  ancho?: string;
  /** A qué elemento devolver el foco al cerrar. Sin esto, Radix intenta volver al
      trigger del diálogo — que estos modales controlados no tienen — y el foco cae al
      `body`. Vender lo usa para que el escáner vuelva a estar listo tras cada modal. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  /** Escape, el velo y la ✕ no cierran mientras guarda algo sin token: cerrar y reabrir dejaría enviarlo dos veces. */
  bloqueado?: boolean;
  /** Al abrir, el foco va a la hoja y no a su primer campo. Para una hoja cuya primera línea hay que LEER antes de elegir:
      un combo (`ComboBuscable`) abre su lista al recibir el foco y, en el celular, la abre hacia arriba tapando esa línea
      («Corregir color», ADR-0263). El foco sigue atrapado en la hoja y Tab entra al primer campo. */
  focoEnLaHoja?: boolean;
  /** Algo a la IZQUIERDA de toda la hoja (título, bajada y contenido quedan a su derecha, exactamente como sin él): hoy la foto de la
      prenda en Reponer, Subir a almacén y Ajustar (2026-10-01). La hoja se ensancha justo lo que ocupa (`.hoja-con-lateral`,
      globals.css) y el resto no se mueve. Solo escritorio: en celular, donde la hoja sube desde abajo, no se muestra. Funciona con
      `ancho` = max-w-sm | max-w-md | max-w-lg. No entra a la cascada: llega con la hoja. */
  lateral?: ReactNode;
  /** Botones de la cabecera, arriba a la DERECHA de la hoja, siempre a la vista (hoy, «+ Nuevo tejido / patrón / etiqueta» en las hojas de
      «Nuevo producto», 2026-10-02). Solo variante «hoja» (la «papel» ya usa esa esquina para la ✕). Sale de la cascada y se coloca
      con `position: absolute`; el título deja libre el ancho que ocupa (`pr-40`). */
  acciones?: ReactNode;
  /** La ✕ de cerrar arriba a la derecha, en cualquier variante (la «papel» ya la trae). Hoy: la vista rápida de producto, que se abre
      también en el celular, donde el velo no siempre se alcanza a tocar. Sale de la cascada (`data-sin-cascada`) para no correr el turno. */
  conCerrar?: boolean;
  /** Título de 26 px (el de las hojas «de ficha»: una prenda, un cliente) en vez de los 18 px de un formulario corto. */
  tituloGrande?: boolean;
  /** «papel» (Por pagar, 2026-09-19, spike): el panel en `papel` con borde fino y SIN sombra —la profundidad viene del tiempo, no del
      espacio (regla v3.1)— y una ✕ para cerrar arriba a la derecha. Sin esto, el panel de siempre (`crema` con sombra). */
  variante?: "papel" | "hoja" | "camara" | "ticket";
  /* «hoja» (Finanzas, 2026-09-24, spike docs/maquetas/finanzas-2026-09/): el panel en `papel` sin sombra ni ✕, con el
     título en serif grande y la bajada en taupe —la hoja del spike—. Los campos de adentro van en caja (`fin-control`,
     app/estilos/finanzas.css). */
  /* «camara» (Vender en el teléfono, 2026-09-25): pantalla completa, sin padding ni borde, fondo tinta; el título queda
     para lectores de pantalla y el contenido dibuja su propia barra (EscanerCamara). Hereda igual el velo, la entrada,
     la cascada de sus piezas y el foco atrapado. */
  /* «ticket» (Punto de venta apilado, 2026-09-26, spike docs/maquetas/punto-venta-spike-2026-09/, variante A): la hoja
     que sube desde abajo con el ticket (92 % del alto, también en tablet), sin padding: el ticket dibuja su cabecera y
     su pie fijo con «Cobrar». El título queda para lectores de pantalla, como en «camara». */
};

// REGLA DE MOVIMIENTO (ADR-0136): todo modal nuevo se hace con este componente y hereda, sin definir nada, el
// efecto del sistema — velo con desenfoque, hoja que sube y crece, contenido que entra en cascada, salida
// corta (detalle y números en globals.css, «REGLA DE MODALES»). NO reimplementes el overlay ni pongas otra
// animación de entrada en un modal: si una pieza necesita salirse de la cascada, `data-sin-cascada`.
//
// Cascarón único para todos los modales del sistema. Antes cada uno reimplementaba
// a mano el overlay (`fixed inset-0 ...`) y ninguno atrapaba el foco ni cerraba con
// Escape — Radix Dialog resuelve eso una sola vez; el look sigue siendo 100% CAYLA
// (Radix no trae estilo propio, solo comportamiento de accesibilidad).
export function Modal({ titulo, subtitulo, onClose, children, ancho = "max-w-sm", alCerrarEnfocar, bloqueado = false, focoEnLaHoja = false, lateral, acciones, conCerrar = false, tituloGrande = false, variante }: Props) {
  const [cerrando, setCerrando] = useState(false);
  const hoja = useRef<HTMLDivElement>(null);
  // En el celular la hoja va pegada abajo: con el teclado abierto se apoya sobre él (la cámara no tiene campos).
  const contenedor = useHojaSobreElTeclado<HTMLDivElement>(variante !== "camara");

  // Cierre en dos tiempos: se anima la salida y recién ahí se le avisa al padre
  // que desmonte. Sin esto, un modal que entra suave se iba de un corte seco —
  // que se siente más brusco que no haberlo animado nunca.
  //
  // El temporizador vive en un efecto y NO dentro del updater de `setCerrando`
  // (como estuvo al principio): React ejecuta los updaters dos veces en
  // desarrollo (StrictMode) para delatar efectos escondidos, y un `setTimeout`
  // ahí adentro disparaba `onClose` dos veces. Con `setModal(null)` daba
  // igual; con un cierre que navega (`router.back()` en ModalRuta) retrocedía
  // dos páginas. El efecto corre una vez por cierre y limpia su temporizador.
  //
  // `onClose` se lee de una ref y NO es dependencia del efecto (2026-09-28): casi todos los que usan <Modal> lo pasan
  // como flecha nueva en cada render (`onClose={() => setX(null)}`), y cada render reiniciaba el temporizador. Con una
  // pantalla que se redibuja más seguido que cada 220 ms (la hoja de Registrar gasto: ~100 cambios por segundo),
  // `onClose` no llegaba nunca y el modal quedaba abierto e invisible, con la salida ya animada.
  const pedirCierre = useCallback(() => setCerrando(true), []);
  const onCloseActual = useRef(onClose);
  useEffect(() => {
    onCloseActual.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!cerrando) return;
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const temporizador = setTimeout(() => onCloseActual.current(), sinMovimiento ? 0 : MS_SALIDA);
    return () => clearTimeout(temporizador);
  }, [cerrando]);

  // Escape cierra la hoja solo si ningún control de adentro lo usó: con la lista de un combo abierta, el primer Escape
  // cierra la lista y lo escrito sigue ahí; el segundo cierra la hoja (useEscapeLibre.ts explica por qué Radix solo no
  // alcanza). El clic en el velo sigue por `onOpenChange`.
  const alEscape = useEscapeLibre(() => {
    if (!bloqueado) pedirCierre();
  });

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && !bloqueado && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`fixed inset-0 z-50 bg-sombra/35 dark:bg-sombra/60 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`}
        />
        {/* La posición vive en este contenedor y NO en el panel: una animación
            de entrada usa `transform`, y si la posición también fuera un
            transform (-translate-1/2), la animación lo pisaría y el modal
            saldría corrido. `pointer-events-none` acá + `auto` en el panel deja
            que el clic afuera siga llegando al velo para cerrar.
            En escritorio la hoja va ANCLADA ARRIBA (8vh), no centrada (2026-09-23, ADR-0185): centrada, cada
            cambio de alto del contenido (elegir un medio, un motivo, un responsable) movía también su borde de
            arriba y la hoja «bailaba». Anclada, el título no se mueve nunca; solo crece o se acorta el borde de
            abajo. En celular sigue siendo una hoja pegada abajo. */}
        <div
          ref={contenedor}
          className={`pointer-events-none fixed inset-0 z-50 flex ${
            variante === "camara" ? "" : variante === "ticket" ? "items-end justify-center" : "items-end justify-center sm:items-start sm:p-6 sm:pt-[8vh]"
          }`}
        >
          <Dialog.Content
            ref={hoja}
            className={`pointer-events-auto relative w-full outline-none ${
              variante === "camara"
                ? "flex h-dvh flex-col overflow-hidden bg-tinta-fija" // la cámara es negra en los dos temas: lo que va encima (`papel-fijo`) conserva sus tokens claros
                : variante === "ticket"
                  ? // El panel de adentro (el `<aside>` del ticket) llena la hoja: cabecera y pie fijos, el medio scrollea.
                    `flex h-[min(92dvh,92%)] flex-col overflow-hidden rounded-t-2xl border border-sand bg-papel [&>aside]:min-h-0 [&>aside]:flex-1 ${ancho}`
                  : `scroll-cayla max-h-[min(90vh,90%)] overflow-y-auto rounded-t-2xl border border-sand p-6 sm:max-h-[calc(100dvh-8vh-1.5rem)] sm:rounded-2xl ${
                    // `--fondo-hoja` lo lee `.pie-hoja-fijo` (globals.css) para que el pie pegado pinte el mismo fondo que la hoja.
                    variante === "papel" || variante === "hoja" ? "bg-papel [--fondo-hoja:var(--color-papel)]" : "bg-crema shadow-xl [--fondo-hoja:var(--color-crema)]"
                  } ${ancho}`
            } ${
              cerrando ? "anim-modal-sale" : "anim-modal-entra"
            } cascada-modal${lateral ? " hoja-con-lateral" : ""}`}
            onEscapeKeyDown={alEscape}
            // Radix enfoca el primer control al abrir; con `focoEnLaHoja`, la hoja misma (Radix le da tabIndex -1).
            onOpenAutoFocus={
              focoEnLaHoja
                ? (e) => {
                    e.preventDefault();
                    hoja.current?.focus({ preventScroll: true });
                  }
                : undefined
            }
            // Radix dispara esto al desmontar el diálogo; `preventDefault` evita que
            // su default (enfocar el trigger) pise el foco que se pone acá.
            onCloseAutoFocus={
              alCerrarEnfocar
                ? (e) => {
                    e.preventDefault();
                    alCerrarEnfocar.current?.focus();
                  }
                : undefined
            }
          >
          {(variante === "papel" || conCerrar) && (
            <button
              type="button"
              onClick={pedirCierre}
              disabled={bloqueado}
              aria-label="Cerrar"
              {...(variante === "papel" ? {} : { "data-sin-cascada": true })}
              className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
          <Dialog.Title asChild>
            <h2 className={`font-display text-tinta ${variante === "camara" || variante === "ticket" ? "sr-only" : ""} ${variante === "hoja" ? "text-2xl leading-tight" : tituloGrande ? "text-[26px] leading-[1.1]" : "text-lg"} ${variante === "papel" || conCerrar ? "pr-8" : ""} ${variante === "hoja" && acciones ? "pr-44 sm:pr-48" : ""}`}>{titulo}</h2>
          </Dialog.Title>
          {subtitulo ? (
            <Dialog.Description asChild>
              <p className={variante === "camara" || variante === "ticket" ? "sr-only" : variante === "hoja" ? "mb-[18px] mt-1 text-[13.5px] leading-normal text-taupe" : "mb-4 mt-1 text-xs text-tinta/70"}>{subtitulo}</p>
            </Dialog.Description>
          ) : (
            // Radix exige una Description por accesibilidad aunque el modal no muestre una visualmente.
            <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
          )}
          {typeof children === "function" ? children(pedirCierre) : children}
          {/* Va DESPUÉS del contenido para no correr el orden de la cascada (`nth-child`), y fuera de ella (`data-sin-cascada`): se coloca
              a la izquierda con `position: absolute` (globals.css, `.hoja-con-lateral`), así que su lugar en el DOM no importa. */}
          {acciones && variante === "hoja" && (
            <div data-sin-cascada className="absolute right-6 top-6 z-10 flex items-center gap-2">
              {acciones}
            </div>
          )}
          {lateral && (
            <div data-lateral data-sin-cascada>
              {lateral}
            </div>
          )}
          {/* La capa de las listas flotantes (2026-09-26): aquí cuelga `useDestinoFlotante` la lista de todo combo de esta
              hoja. Colgada como hija DIRECTA de la hoja, la cascada de arriba (`.cascada-modal > *`, globals.css) la tomaba
              por una pieza más del contenido: invisible hasta medio segundo y entrando en otro medio. Abrir un combo en
              «Registrar gasto» tardaba 1 s en verse entero; el selector de sede de la cabecera, 0,33 s. `data-sin-cascada`
              saca a la capa y lo que cuelga de ella ya no es hijo directo: la lista entra con su propio movimiento, el de
              la sede. Va al final para no correr el turno (`--k`) de ninguna pieza; vacía no ocupa lugar. */}
          <div data-capa-flotante data-sin-cascada />
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Estilos de campo compartidos — el mismo patrón que ya usaba EfectivoPanel
// (el primer modal migrado al sistema v3), para que un formulario nuevo no
// tenga que reinventar la etiqueta/input/botón de cada modal.
export const campoEtiqueta = "label-cayla text-[11px] text-tinta/70";
export const campoTexto =
  "w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo";
export const botonCancelar =
  "btn-cayla btn-secundario flex-1";
export const botonPrimario =
  "btn-cayla btn-primario flex-1";

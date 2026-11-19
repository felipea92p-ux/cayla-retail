"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ArrowLeftRight, Check, ClipboardList, Eye, PencilLine, Truck, Warehouse } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import type { BotonTarjeta, ClaveAccion, OpcionMas } from "@/lib/existencias-acciones";
import { aireParaMenu } from "@/lib/posicion-lista-reglas";

/* ====================================================================
   El pie de una tarjeta de Existencias (2026-10-07, maqueta `docs/maquetas/existencias-tarjeta-cajon-2026-10/`). Qué dice y qué
   ofrece lo decide `lib/existencias-acciones.ts`; aquí solo se dibuja.

   A la izquierda, lo que toca con su nombre a la vista: «Colgar en el piso» (ámbar), «Ver talla X», el aviso «Se acabó: L» (rojo,
   no es botón) o «✓ Todo en el piso». A la derecha, «Más ⌄»: se abre con un CLIC (antes se abría al pasar el mouse y con el dedo no
   había cómo), hacia arriba para que la página no crezca bajo el mouse (ADR-0185). Se cierra con un toque fuera o con Escape, que
   no sigue subiendo (CLAUDE.md, «Escape dentro de una hoja»). Reemplaza a `AccionesTarjeta` (la percha sola).

   Si arriba no cabe, abre hacia abajo (Felipe 2026-11-17): con la tarjeta pegada a la cabecera fija, el menú subía igual y la cabecera
   le tapaba las primeras opciones. Al abrir se mide el aire que de verdad se ve —desde donde termina la cabecera hasta la barra
   «Escanear prenda» del celular, o el borde de la ventana— y decide `aireParaMenu` (`lib/posicion-lista-reglas.ts`): arriba si cabe
   entero; si no, abajo; y si no cabe en ninguno, al lado con más aire, desplazándose por dentro.
   ==================================================================== */

/** Dónde termina la cabecera fija del ERP: la página lo declara en el `scroll-padding-top` de `<html>` (decisión 1A, `globals.css`). */
function techoDelContenido(): number {
  return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

/** Dónde empieza la barra de abajo (`barra-abajo`, la Isla) si flota sobre la pantalla; si no, el borde de la ventana. */
function pisoDelContenido(): number {
  let piso = window.innerHeight;
  for (const barra of document.querySelectorAll<HTMLElement>(".barra-abajo")) {
    const r = barra.getBoundingClientRect();
    if (r.height > 0 && getComputedStyle(barra).position === "fixed") piso = Math.min(piso, r.top);
  }
  return piso;
}

type LugarDelMenu = ReturnType<typeof aireParaMenu>;
/** Lo de siempre: hacia arriba y entero. */
const ARRIBA: LugarDelMenu = { haciaAbajo: false, maxHeight: null };
/** El aire entre el pie y su menú (el `mb-1.5` / `mt-1.5` de abajo). */
const SEPARACION = 6;

type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const ICONO: Record<ClaveAccion, Icono> = {
  subir: Warehouse,
  enviar: Truck,
  pedir: ArrowLeftRight,
  ajustar: PencilLine,
  ficha: ClipboardList,
};

export function PieTarjeta({
  etiqueta,
  boton,
  opciones,
  onBoton,
  onOpcion,
}: {
  /** La prenda, para el lector de pantalla («Blusa Emma Beige»). */
  etiqueta: string;
  boton: BotonTarjeta;
  opciones: readonly OpcionMas[];
  onBoton: () => void;
  onOpcion: (clave: ClaveAccion) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState<LugarDelMenu>(ARRIBA);

  // Antes de pintar: el menú ya está en el DOM (hacia arriba), se mide su alto de verdad y se decide su lugar.
  useLayoutEffect(() => {
    if (!abierto || !caja.current || !menu.current) return;
    const pie = caja.current.getBoundingClientRect();
    const m = menu.current;
    // `scrollHeight` es el alto del contenido aunque un tope anterior lo recorte; se le suma el borde.
    const alto = m.scrollHeight + (m.offsetHeight - m.clientHeight);
    const nuevo = aireParaMenu({ controlTop: pie.top, controlBottom: pie.bottom, techo: techoDelContenido(), piso: pisoDelContenido(), alto, separacion: SEPARACION });
    setLugar((l) => (l.haciaAbajo === nuevo.haciaAbajo && l.maxHeight === nuevo.maxHeight ? l : nuevo));
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    // Al abrir, el foco va a la primera opción que se puede elegir: el teclado sigue con Tab. Sin desplazar la página (`preventScroll`):
    // React corre este efecto ANTES de volver a dibujar el menú en el lado que eligió la medición de arriba, así que la primera vez el
    // menú todavía está hacia arriba, tapado por la cabecera, y el navegador centraba la opción enfocada: la página saltaba ~540 px y
    // el menú terminaba abierto hacia abajo junto al borde de la pantalla (visto en local a 375 px). El lugar ya garantiza que se ve.
    menu.current?.querySelector<HTMLButtonElement>("button:not([aria-disabled])")?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", afuera);
  }, [abierto]);

  const estiloBoton = "area-dedo inline-flex h-8 min-w-0 items-center gap-1.5 rounded-[9px] border px-3 text-[12.5px] transition-colors";
  return (
    <div ref={caja} className="relative mt-auto flex items-center gap-1.5">
      {boton.tipo === "colgar" || boton.tipo === "ver" ? (
        <button
          type="button"
          onClick={onBoton}
          data-guia="existencias.colgar"
          aria-label={`${boton.etiqueta}: ${etiqueta}`}
          className={`${estiloBoton} flex-1 justify-center font-semibold ${
            boton.tipo === "colgar" && boton.sugerido ? "border-ambar/40 bg-ambar/[0.12] text-ambar-profundo hover:border-ambar/60" : "border-tinta/15 bg-papel text-tinta hover:border-tinta/30"
          }`}
        >
          {boton.tipo === "colgar" ? <IconoPercha aria-hidden className="h-4 w-4 shrink-0" /> : <Eye aria-hidden className="h-4 w-4 shrink-0" />}
          <span className="truncate">{boton.etiqueta}</span>
        </button>
      ) : (
        <span className={`flex min-w-0 flex-1 items-center gap-1.5 pl-0.5 text-sm font-semibold ${boton.tipo === "agotada" ? "text-rojo-profundo" : boton.tipo === "sinColgar" ? "text-ambar-profundo" : "text-verde"}`}>
          {boton.tipo === "ok" && <Check aria-hidden className="h-4 w-4 shrink-0" />}
          <span className="truncate">{boton.etiqueta}</span>
        </span>
      )}

      <button
        type="button"
        aria-haspopup="menu"
        data-guia="existencias.mas"
        aria-expanded={abierto}
        aria-label={`Más acciones de ${etiqueta}`}
        onClick={() => setAbierto((a) => !a)}
        // El menú «Más» del sistema (ronda 13): la cara del secundario de `MenuAcciones` con su flecha que gira, a 32 px como su vecino.
        className="btn-cayla btn-secundario inline-flex h-8 min-h-8 shrink-0 items-center gap-2 px-3 py-0 text-[12.5px]"
      >
        Más
        <svg aria-hidden viewBox="0 0 10 6" className={`h-1.5 w-2.5 shrink-0 transition-transform duration-300 ease-cayla motion-reduce:transition-none ${abierto ? "-rotate-180" : ""}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
        </svg>
      </button>

      {abierto && (
        <div
          ref={menu}
          role="menu"
          data-guia="existencias.mas-menu"
          aria-label={`Acciones de ${etiqueta}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setAbierto(false);
              caja.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();
            }
          }}
          data-lado={lugar.haciaAbajo ? "abajo" : "arriba"}
          style={lugar.maxHeight === null ? undefined : { maxHeight: lugar.maxHeight }}
          className={`anim-revelar absolute right-0 z-30 w-60 rounded-xl border border-tinta/15 bg-papel p-1.5 shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--color-sombra)_40%,transparent)] ${
            lugar.haciaAbajo ? "top-full mt-1.5" : "bottom-full mb-1.5"
          } ${lugar.maxHeight === null ? "" : "overflow-y-auto overscroll-contain"}`}
        >
          {opciones.map((o) => {
            const Ico = ICONO[o.clave];
            const apagada = !!o.motivo;
            return (
              <button
                key={o.clave}
                type="button"
                role="menuitem"
                data-guia={o.clave === "ficha" ? "existencias.ver-ficha" : undefined}
                // Se ve pero no se elige, y dice por qué; sigue alcanzable con el teclado (el lector de pantalla oye el motivo).
                aria-disabled={apagada || undefined}
                onClick={() => {
                  if (apagada) return;
                  setAbierto(false);
                  onOpcion(o.clave);
                }}
                // Con el dedo, cada opción mide 44 px (medían 39 y van una pegada a la otra: auditoría /milimetro, 2026-11-17).
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors pointer-coarse:py-3 ${apagada ? "cursor-not-allowed text-tinta/45" : "text-tinta vd-pasa"}`}
              >
                <Ico aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
                <span className="min-w-0">
                  {o.etiqueta}
                  {o.motivo && <span className="mt-0.5 block text-sm leading-snug text-tinta/55">{o.motivo}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

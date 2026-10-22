"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { soles } from "@/lib/compras-reglas";
import { textoRango } from "@/lib/etiqueta-vigencia";
import { nombreDeTalla, type PiezaEtiqueta } from "@/lib/etiquetar-prendas";
import { volar, type Vuelo } from "./vuelo";

/* ====================================================================
   La etiqueta colgada (Prendas de una etiqueta, dirección B): la etiqueta como se cuelga en el piso, con lo que la lleva.
   Su nombre, el descuento en rojo, las fechas, cuántas prendas la llevan (contando lo que todavía no se aplica), lo que cambia y
   el MOSAICO: cada talla y color es una pieza con su color o su foto. Lo que se pone lleva un anillo verde, lo que se quita queda
   tenue y tachado, y lo que entra por su categoría lleva un filo pizarra. Abajo, cuánto cobra la caja hoy y con la etiqueta.

   El mosaico dibuja SOLO las piezas que caben en el alto que queda (`useCuantasCaben`): el resto es «+N». Así la etiqueta nunca
   necesita su propio scroll. Cuando una prenda se marca, vuela de su fila a su pieza (`vuelo.ts`) y la etiqueta se asienta.
   ==================================================================== */

const COLUMNAS = 6;
const SEPARACION = 6;

export function EtiquetaColgada({
  nombre,
  descuentoPct,
  vigenteDesde,
  vigenteHasta,
  conCategorias,
  colgada,
  caja,
  vueloRef,
  onCaben,
}: {
  nombre: string;
  descuentoPct: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  /** La etiqueta entra además por categoría (regla de la campaña). */
  conCategorias: boolean;
  colgada: { total: number; agregar: number; quitar: number; piezas: PiezaEtiqueta[]; mas: number };
  caja: { antes: number; despues: number } | null;
  /** La prenda que acaba de marcarse y desde dónde vuela; se consume al llegar. */
  vueloRef: RefObject<Vuelo | null>;
  /** Cuántas piezas caben en el mosaico: la hoja recorta la lista con este número. */
  onCaben: (n: number) => void;
}) {
  const tarjeta = useRef<HTMLDivElement>(null);
  const mosaico = useRef<HTMLDivElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  const posiciones = useRef(new Map<string, DOMRect>());
  const [espera, setEspera] = useState<ReadonlySet<string>>(new Set());

  useCuantasCaben(mosaico, onCaben);

  // Después de cada cambio: el mosaico se reacomoda (FLIP) y, si una prenda se acaba de marcar, vuela a su lugar.
  useLayoutEffect(() => {
    const raiz = mosaico.current;
    if (!raiz) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const antes = posiciones.current;
    const ahora = new Map<string, DOMRect>();
    raiz.querySelectorAll<HTMLElement>("[data-pieza]").forEach((el) => {
      const id = el.dataset.pieza!;
      const r = el.getBoundingClientRect();
      ahora.set(id, r);
      const previa = antes.get(id);
      if (!quieto && previa && (previa.left !== r.left || previa.top !== r.top) && r.width > 0) {
        el.animate([{ transform: `translate(${previa.left - r.left}px, ${previa.top - r.top}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" });
      }
    });
    posiciones.current = ahora;

    const d = vueloRef.current;
    if (!d) return;
    vueloRef.current = null;
    const id = d.ids.find((x) => raiz.querySelector(`[data-pieza="${CSS.escape(x)}"]`));
    const pieza = id ? raiz.querySelector<HTMLElement>(`[data-pieza="${CSS.escape(id)}"]`) : null;
    // En el celular el mosaico no se ve: la prenda vuela al número.
    const destino = pieza && pieza.offsetParent !== null ? pieza : total.current;
    const origen = d.desde();
    if (!destino || !origen) return;
    if (pieza && destino === pieza && id) setEspera(new Set([id]));
    void volar(origen, destino).then(() => {
      setEspera(new Set());
      const t = tarjeta.current;
      if (!t || quieto) return;
      t.classList.remove("eqp-se-asienta");
      void t.offsetWidth; // vuelve a correr la animación aunque ya estuviera puesta
      t.classList.add("eqp-se-asienta");
    });
  }, [colgada.piezas, vueloRef]);

  const rango = textoRango(vigenteDesde, vigenteHasta);
  const pct = descuentoPct?.toLocaleString("es-PE", { maximumFractionDigits: 2 });

  return (
    <>
      <div className="eqp-clavo" aria-hidden>
        <svg viewBox="0 0 80 44">
          <circle className="eqp-punta" cx="40" cy="5" r="4" />
          <path className="eqp-hilo" d="M40 5 C 32 22, 48 30, 40 44" />
        </svg>
      </div>
      <div ref={tarjeta} className="eqp-tarjeta">
        <span aria-hidden className="eqp-ojal" />
        <span className="eqp-solo-ancho eqp-alto label-cayla block text-center text-[10.5px] text-taupe">Etiqueta de campaña</span>
        <h3 className="eqp-nombre mt-1">{nombre}</h3>
        {descuentoPct !== null ? <p className="eqp-pct">−{pct} %</p> : <p className="eqp-pct-info">Informativa · no cambia el precio</p>}
        <p className="eqp-solo-ancho mt-1 text-center text-xs text-taupe">
          {rango ?? "Sin fechas"}
          {conCategorias ? " · y sus categorías" : ""}
        </p>
        <hr className="eqp-perfora" />
        <p className="eqp-total flex items-baseline justify-center gap-2" aria-live="polite">
          <span ref={total} className="eqp-cifra">
            <CifraQueCuenta valor={colgada.total} />
          </span>
          <span className="text-[13px] text-taupe">{colgada.total === 1 ? "prenda la lleva" : "prendas la llevan"}</span>
          {/* En el celular la franja no tiene lugar para las insignias: lo que cambia va en la misma línea. */}
          {colgada.agregar + colgada.quitar > 0 && (
            <span className="text-[12.5px] font-medium md:hidden">
              {colgada.agregar > 0 && <span className="text-verde">+{colgada.agregar}</span>}
              {colgada.agregar > 0 && colgada.quitar > 0 && " "}
              {colgada.quitar > 0 && <span className="text-taupe">−{colgada.quitar}</span>}
            </span>
          )}
        </p>
        <div className="eqp-solo-ancho mt-1.5 flex min-h-6 flex-wrap justify-center gap-1.5">
          {colgada.agregar > 0 && <Chip tono="verde">+{colgada.agregar} por poner</Chip>}
          {colgada.quitar > 0 && <Chip tono="neutro">−{colgada.quitar} por quitar</Chip>}
          {colgada.agregar + colgada.quitar === 0 && <span className="text-xs text-taupe">Escanea o marca prendas para sumarlas</span>}
        </div>

        <div ref={mosaico} className="eqp-mosaico" role="list" aria-label="Prendas que llevan la etiqueta">
          {colgada.piezas.map((x) => (
            <span
              key={x.id}
              role="listitem"
              data-pieza={x.id}
              data-estado={x.estado}
              data-espera={espera.has(x.id) ? "" : undefined}
              className="eqp-pieza"
              title={`${x.producto.referencia} · ${nombreDeTalla(x.variante)}${x.estado === "sale" ? " (se la quitas)" : x.estado === "categoria" ? " (por su categoría)" : x.estado === "nueva" ? " (por poner)" : ""}`}
            >
              <Pieza pieza={x} />
            </span>
          ))}
          {colgada.mas > 0 && <span className="eqp-mas" role="listitem">+{colgada.mas}</span>}
          {colgada.piezas.length === 0 && Array.from({ length: COLUMNAS }, (_, i) => <span key={i} aria-hidden className="eqp-hueco" />)}
        </div>

        {descuentoPct !== null && (
          <div className="eqp-solo-ancho">
            <hr className="eqp-perfora" />
            {caja ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-center">
                  <span>
                    <span className="label-cayla block text-[10px] text-taupe">Hoy en caja</span>
                    <span className="eqp-monto font-serif font-semibold tabular-nums text-taupe line-through decoration-1">{soles(caja.antes)}</span>
                  </span>
                  <ArrowRight aria-hidden className="h-4 w-4 text-taupe" />
                  <span>
                    <span className="label-cayla block text-[10px] text-taupe">Con la etiqueta</span>
                    <span className="eqp-monto font-serif font-semibold tabular-nums">
                      <CifraQueCuenta valor={caja.despues} formato="soles" />
                    </span>
                  </span>
                </div>
                <p className="eqp-alto mt-1 text-center text-[11.5px] text-taupe">Lo que pones ahora, una de cada talla y color</p>
              </>
            ) : (
              <p className="text-center text-[12.5px] text-taupe">
                {colgada.quitar > 0
                  ? `Las que le quitas vuelven a cobrarse sin este ${pct} %.`
                  : "Al marcar una prenda, aquí ves cuánto cobra la caja antes y después."}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Una pieza: la foto de la prenda o, sin foto, su categoría sobre el color de ESA talla (ADR-0333). */
function Pieza({ pieza }: { pieza: PiezaEtiqueta }) {
  const sinFoto = <SinFoto tamano="h-full w-full" colorHex={pieza.variante.colorHex ?? pieza.producto.colorHex ?? null} {...categoriaDe(pieza.producto)} />;
  if (!pieza.producto.fotoUrl) return sinFoto;
  return <ImagenDePrenda src={pieza.producto.fotoUrl} alt="" width={48} height={58} className="h-full w-full object-cover" fallback={sinFoto} />;
}

/** Cuántas piezas caben en el mosaico sin que haga falta un scroll: filas enteras de `COLUMNAS`, según el alto que le queda. */
function useCuantasCaben(caja: RefObject<HTMLDivElement | null>, onCaben: (n: number) => void) {
  const avisar = useRef(onCaben);
  useLayoutEffect(() => {
    avisar.current = onCaben;
  });
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0) return;
      const lado = (width - SEPARACION * (COLUMNAS - 1)) / COLUMNAS;
      const fila = (lado * 6) / 5 + SEPARACION;
      const filas = Math.max(1, Math.floor((height + SEPARACION) / fila));
      avisar.current(filas * COLUMNAS);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [caja]);
}

"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { IconoEtiquetaPapel } from "@/components/IconoEtiquetaPapel";
import type { ColorAlta } from "@/lib/alta-producto";
import { iconoDeEtiqueta } from "@/lib/etiqueta-visual";
import { precioEtiqueta } from "@/lib/etiqueta-precio-reglas";
import type { LineaParaImprimir } from "@/lib/matriz-ficha-reglas";

// «Etiquetas de lo que entró» (Felipe 2026-10-03: «cuando agregues stock, o agregues un color con stock, debe salirte grande lo de
// imprimir etiquetas solo de eso agregado»). Sale al terminar «Revisar y guardar» si entraron unidades, en vez del botón chico del
// aviso: una etiqueta por cada prenda que ENTRÓ (las que ya estaban en la tienda ya tienen la suya), y se ve como se va a imprimir.
//
// El movimiento es respuesta al guardado y nada más (ADR-0136): el «visto» se dibuja, la cifra cuenta hasta el total y las
// etiquetas salen de la ranura de la impresora una tras otra. 200–500 ms cada cosa, sin rebote ni bucle; con
// `prefers-reduced-motion`, todo quieto (`app/estilos/ficha-taller.css`, «Etiquetas de lo que entró»).

/** Lo que tarda la hoja en llegar (ADR-0136) antes de que la primera etiqueta salga de la ranura. */
const ESPERA_HOJA_MS = 260;
const ENTRE_ETIQUETAS_MS = 70;
/** Más allá de esta, las etiquetas salen juntas: con 30 tallas, la última no espera dos segundos. */
const MAX_ESCALONES = 10;

/** La cifra que cuenta de 0 al total (una sola vez). Sin movimiento, llega directo. */
function useCifraQueCuenta(total: number, ms: number, retraso: number): number {
  // La hoja solo existe en el navegador (se abre al terminar un guardado): se puede preguntar por el movimiento al nacer.
  const [quieto] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [valor, setValor] = useState(() => (quieto ? total : 0));
  useEffect(() => {
    if (quieto) return;
    let cuadro = 0;
    let inicio = 0;
    const reloj = window.setTimeout(() => {
      const paso = (t: number) => {
        if (!inicio) inicio = t;
        const avance = Math.min(1, (t - inicio) / ms);
        // La misma curva que `--ease-cayla`, aproximada: arranca rápido y se posa.
        setValor(Math.round(total * (1 - Math.pow(1 - avance, 3))));
        if (avance < 1) cuadro = requestAnimationFrame(paso);
      };
      cuadro = requestAnimationFrame(paso);
    }, retraso);
    return () => {
      window.clearTimeout(reloj);
      cancelAnimationFrame(cuadro);
    };
  }, [total, ms, retraso, quieto]);
  return quieto ? total : valor;
}

export function ImprimirLoQueEntro({
  prenda,
  lineas,
  colores,
  nombreEtiqueta,
  onImprimir,
  onDespues,
}: {
  prenda: string;
  lineas: readonly LineaParaImprimir[];
  colores: readonly ColorAlta[];
  /** id → nombre de una etiqueta comercial (Nuevo, Hecho a mano…), para su ícono en el papel. */
  nombreEtiqueta: (id: string) => string | null;
  onImprimir: () => void;
  onDespues: () => void;
}) {
  const total = lineas.reduce((s, l) => s + l.unidades, 0);
  const cifra = useCifraQueCuenta(total, 480, ESPERA_HOJA_MS);
  const nColores = new Set(lineas.map((l) => l.colorCodigo ?? l.color)).size;
  const resumen = `${lineas.length} ${lineas.length === 1 ? "talla" : "tallas"} · ${nColores} ${nColores === 1 ? "color" : "colores"}`;

  return (
    <Modal
      variante="hoja"
      ancho="max-w-2xl"
      titulo="Etiquetas de lo que entró"
      subtitulo={`${prenda} quedó guardado. Imprime una etiqueta por cada prenda que entró: las que ya estaban en la tienda ya tienen la suya.`}
      onClose={onDespues}
    >
      {(cerrar) => (
        <div className="space-y-5">
          {/* La cifra: lo que hay que imprimir, contado. */}
          <div className="flex items-center gap-4 rounded-xl border border-sand bg-crema px-4 py-3.5">
            <svg viewBox="0 0 44 44" aria-hidden className="h-11 w-11 shrink-0">
              <circle cx="22" cy="22" r="20" className="lqe-aro" fill="none" stroke="var(--color-verde)" strokeWidth="2" />
              <path d="M13.5 22.5 L19.5 28.5 L31 16" className="lqe-visto" fill="none" stroke="var(--color-verde)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0">
              <p className="flex items-baseline gap-2">
                <span className="font-serif text-[40px] leading-none tabular-nums text-tinta" aria-hidden>
                  {cifra}
                </span>
                <span className="text-[14px] font-medium text-tinta">{total === 1 ? "etiqueta por imprimir" : "etiquetas por imprimir"}</span>
              </p>
              <p className="sr-only">
                {total} {total === 1 ? "etiqueta" : "etiquetas"} por imprimir
              </p>
              <p className="mt-1 text-[12.5px] text-taupe">{resumen}</p>
            </div>
          </div>

          {/* La tira: las etiquetas salen de la ranura de la impresora, una tras otra. */}
          <div data-sin-cascada className="relative">
            <div aria-hidden className="lqe-ranura mx-auto h-[7px] w-[86%] rounded-full bg-tinta/85" />
            <ul
              aria-label="Las etiquetas que se van a imprimir"
              className="scroll-cayla -mt-[3px] grid max-h-[46vh] grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain px-1 pb-1 pt-3 sm:grid-cols-3"
            >
              {lineas.map((l, i) => {
                const color = colores.find((c) => c.codigo === l.colorCodigo);
                const iconos = l.etiquetaIds
                  .map((id) => nombreEtiqueta(id))
                  .filter((x): x is string => !!x)
                  .slice(0, 3);
                return (
                  <li
                    key={l.varianteId}
                    className="lqe-etiqueta relative flex flex-col rounded-lg border border-sand bg-papel px-3 pb-2.5 pt-3.5"
                    style={{ animationDelay: `${ESPERA_HOJA_MS + Math.min(i, MAX_ESCALONES) * ENTRE_ETIQUETAS_MS}ms` }}
                  >
                    {/* El ojal de la etiqueta colgante. */}
                    <span aria-hidden className="absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full border border-sand bg-crema" />
                    <span className="absolute right-2 top-2 rounded-full bg-tinta px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums text-crema">
                      × {l.unidades}
                    </span>
                    <span className="text-[8.5px] font-semibold uppercase tracking-[0.28em] text-tinta/55">Cayla</span>
                    <span className="mt-1 truncate text-[12px] text-tinta/75" title={prenda}>
                      {prenda}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-tinta">
                      {color ? <Punto hex={color.hex} familia={color.familiaColor} tipo={color.tipo} /> : <Punto hex={null} />}
                      <span className="truncate">{l.color}</span>
                    </span>
                    <span className="mt-2 flex items-end justify-between gap-2">
                      <span className="font-serif text-[26px] leading-none text-tinta">{l.talla}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-tinta">{l.precio !== null ? `S/ ${precioEtiqueta(l.precio)}` : "—"}</span>
                    </span>
                    {iconos.length > 0 && (
                      <span className="mt-2 flex items-center gap-1.5 border-t border-dashed border-sand pt-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
                        {iconos.map((nombre) => (
                          <span key={nombre} className="inline-flex items-center gap-1 text-[10px] text-tinta/70">
                            <IconoEtiquetaPapel icono={iconoDeEtiqueta(nombre) ?? "generico"} nombre={nombre} decorativo />
                            {nombre}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="pie-hoja-fijo">
            <div className="flex flex-col-reverse gap-2 border-t border-sand pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={cerrar} className="btn-cayla btn-sutil">
                Más tarde
              </button>
              <button type="button" onClick={onImprimir} autoFocus className="btn-cayla btn-primario inline-flex items-center justify-center gap-2">
                <Printer aria-hidden className="h-4 w-4" />
                Imprimir {total} {total === 1 ? "etiqueta" : "etiquetas"}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-taupe sm:text-right">Si lo dejas para después, Productos te lo recuerda arriba hasta que salgas del módulo.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { SelloTinta } from "@/components/sellos/SelloTinta";
import { volar } from "@/components/etiqueta-prendas/vuelo";
import { soles } from "@/lib/compras-reglas";
import { nombreSinSku, type EjemploDeCaja } from "@/lib/campana-hoja";
import type { ChipTarjeta } from "@/lib/etiqueta-campana";
import type { EstiloEtiqueta } from "@/lib/etiqueta-grupos";

/* ====================================================================
   La etiqueta de la hoja «Configuración» de una campaña (ADR-0488, la II de docs/maquetas/campana-configuracion-2026-10/).
   Es la MISMA etiqueta colgada de «Prendas» (`EtiquetaColgada`): sus clases `eqp-*` (app/estilos/etiqueta-prendas.css) le dan la
   misma cara, el mismo alto y la misma franja en el celular, así que las dos hojas de una campaña se ven igual. Aquí no se llena de
   prendas: dice lo que la hoja va a guardar mientras se llena —su descuento, sus fechas, a cuántas prendas llega, sus categorías en el
   mosaico (la que se marca vuela de su casilla a su pieza, con el vuelo de «Prendas») y cuánto cobra la caja por prendas reales—. Al
   guardar se estampa en ella el sello de la campaña (`SelloTinta`, el de su pase en Insignias).
   ==================================================================== */

/** 20 → "20", 12.5 → "12.5": sin ceros de más (el decimal peruano es el punto). */
const textoPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

export type PiezaDeCampana = { id: string; nombre: string; prefijo?: string | null; familiaCodigo?: string | null; prendas: number };

export function EtiquetaDeCampana({
  nombre,
  descuento,
  rango,
  chip,
  total,
  piezas,
  mas,
  ejemplos,
  categoriaDe,
  vueloRef,
  sello,
}: {
  nombre: string;
  /** El descuento como quedaría: un %, `null` (la campaña solo marca prendas) o `"mal"` (lo escrito no es un descuento). */
  descuento: number | null | "mal";
  /** «1 oct – 25 oct», «Sin fechas: rige siempre» o «Revisa las fechas». */
  rango: string;
  /** Lo que dice su temporada, como en su pase (`chipDeTarjeta`); `null` sin fechas o con fechas mal escritas. */
  chip: ChipTarjeta | null;
  /** A cuántas prendas a la venta llega con lo elegido (`alcanceCampana`). */
  total: number;
  /** Las categorías elegidas, de la que más trae a la que menos (`piezasDelMosaico`), y cuántas no caben («+N»). */
  piezas: readonly PiezaDeCampana[];
  mas: number;
  /** Prendas reales que alcanzaría, con lo que cobra la caja (`ejemplosDeCaja`). */
  ejemplos: readonly EjemploDeCaja[];
  /** La categoría de una prenda de ejemplo, para su miniatura. */
  categoriaDe: (categoriaId: string | null) => PiezaDeCampana | undefined;
  /** La categoría recién marcada: su casilla vuela a su pieza. Se consume al volar. */
  vueloRef: RefObject<string | null>;
  /** Al guardar: el sello de la campaña se estampa en la etiqueta. */
  sello: { estilo: EstiloEtiqueta; anio: string | null } | null;
}) {
  const tarjeta = useRef<HTMLDivElement>(null);
  const mosaico = useRef<HTMLDivElement>(null);
  const [verEjemplo, setVerEjemplo] = useState(0);
  const ejemplo = ejemplos.length ? ejemplos[verEjemplo % ejemplos.length] : null;
  const catEjemplo = ejemplo ? categoriaDe(ejemplo.categoriaId) : undefined;

  // La categoría recién marcada vuela de su casilla (en el formulario) a su pieza; la pieza aparece al llegar y la etiqueta se asienta.
  useLayoutEffect(() => {
    const id = vueloRef.current;
    vueloRef.current = null;
    if (!id) return;
    const pieza = mosaico.current?.querySelector<HTMLElement>(`[data-pieza="${CSS.escape(id)}"]`);
    const desde = document.querySelector(`[data-cat-id="${CSS.escape(id)}"] .casilla`);
    if (!pieza || !desde || pieza.offsetParent === null) return;
    pieza.style.opacity = "0";
    void volar(desde, pieza).then(() => {
      pieza.style.opacity = "";
      const t = tarjeta.current;
      if (!t) return;
      t.classList.remove("eqp-se-asienta");
      void t.offsetWidth; // vuelve a correr la animación aunque ya estuviera puesta
      t.classList.add("eqp-se-asienta");
    });
  }, [piezas, vueloRef]);

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
        {typeof descuento === "number" ? (
          <p className="eqp-pct">−{textoPct(descuento)} %</p>
        ) : (
          <p className="eqp-pct-info">{descuento === "mal" ? "Revisa el descuento" : "Informativa · no cambia el precio"}</p>
        )}
        <p className="eqp-solo-ancho mt-1 text-center text-xs text-taupe">{rango}</p>
        {chip && (
          <div className="eqp-solo-ancho mt-1.5 flex flex-wrap justify-center gap-1.5">
            <Chip tono={chip.tono} title={chip.title}>
              {chip.texto}
            </Chip>
            {chip.alerta && (
              <Chip tono="ambar" title={chip.title}>
                {chip.alerta}
              </Chip>
            )}
          </div>
        )}
        <hr className="eqp-perfora" />
        <p className="eqp-total flex items-baseline justify-center gap-2" aria-live="polite">
          <span className="eqp-cifra">
            <CifraQueCuenta valor={total} />
          </span>
          <span className="text-[13px] text-taupe">{total === 1 ? "prenda la llevaría" : "prendas la llevarían"}</span>
        </p>

        {/* Sus categorías, de la que más trae a la que menos, con cuántas prendas trae cada una. */}
        <div ref={mosaico} className="eqp-mosaico cph-mosaico" role="group" aria-label="Categorías de la campaña">
          {piezas.map((p) => (
            <span key={p.id} data-pieza={p.id} className="eqp-pieza cph-pieza" title={`${p.nombre} · ${p.prendas} ${p.prendas === 1 ? "prenda" : "prendas"}`}>
              <span className="eqp-foto">
                <SinFoto tamano="h-full w-full" prefijo={p.prefijo} familia={p.familiaCodigo} categoria={p.nombre} />
              </span>
              <span aria-hidden className="eqp-veces">
                {p.prendas.toLocaleString("es-PE")}
              </span>
            </span>
          ))}
          {mas > 0 && (
            <span className="eqp-mas" title={`${mas} ${mas === 1 ? "categoría" : "categorías"} más`}>
              +{mas}
            </span>
          )}
          {piezas.length === 0 && Array.from({ length: 6 }, (_, i) => <span key={i} aria-hidden className="eqp-hueco" />)}
        </div>

        {/* Lo que cobra la caja por una prenda real que alcanzaría (el precio más bajo de las tiendas, con el redondeo de la caja). */}
        <div className="eqp-solo-ancho">
          <hr className="eqp-perfora" />
          {ejemplo ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="label-cayla text-[10.5px] text-taupe">{ejemplos.length > 1 ? `En caja · ${(verEjemplo % ejemplos.length) + 1} de ${ejemplos.length}` : "En caja"}</span>
                {ejemplos.length > 1 && (
                  <span className="flex gap-0.5">
                    <button type="button" className="cph-ej-b" aria-label="Prenda anterior" onClick={() => setVerEjemplo((i) => (i + ejemplos.length - 1) % ejemplos.length)}>
                      <ChevronLeft aria-hidden />
                    </button>
                    <button type="button" className="cph-ej-b" aria-label="Prenda siguiente" onClick={() => setVerEjemplo((i) => (i + 1) % ejemplos.length)}>
                      <ChevronRight aria-hidden />
                    </button>
                  </span>
                )}
              </div>
              <div className="cph-caja" aria-live="polite">
                <SinFoto tamano="h-11 w-10" prefijo={catEjemplo?.prefijo} familia={catEjemplo?.familiaCodigo} categoria={catEjemplo?.nombre} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold" title={ejemplo.nombre}>{nombreSinSku(ejemplo.nombre)}</span>
                  <span className="block truncate text-[11px] text-taupe">{ejemplo.enSede ? `Precio de ${ejemplo.enSede}` : (catEjemplo?.nombre ?? "")}</span>
                </span>
                <span className="text-right leading-tight">
                  {ejemplo.despues !== ejemplo.antes && <span className="block text-[11.5px] text-taupe line-through">{soles(ejemplo.antes)}</span>}
                  <span className="cph-caja-precio">{soles(ejemplo.despues)}</span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-center text-xs text-taupe">Cuando llegue a una prenda, aquí verás cuánto cobra la caja.</p>
          )}
        </div>

        {/* Al guardar, el sello de la campaña (el de su pase en Insignias) se estampa una vez sobre la etiqueta. */}
        {sello && (
          <span className="cph-sello" aria-hidden>
            <SelloTinta nombre={nombre} estilo={sello.estilo} anio={sello.anio} tamano={88} giro={-12} />
          </span>
        )}
      </div>
    </>
  );
}

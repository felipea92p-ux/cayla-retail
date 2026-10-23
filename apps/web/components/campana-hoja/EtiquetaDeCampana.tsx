"use client";

import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import type { ChipTarjeta } from "@/lib/etiqueta-campana";

/* ====================================================================
   La etiqueta de la hoja «Configuración» de una campaña (ADR-0488, la II de docs/maquetas/campana-configuracion-2026-10/).
   Es la MISMA etiqueta colgada de «Prendas» (`EtiquetaColgada`): sus clases `eqp-*` (app/estilos/etiqueta-prendas.css) le dan la
   misma cara, el mismo alto y la misma franja en el celular, así que las dos hojas de una campaña se ven igual. Aquí no se llena de
   prendas: dice lo que la hoja va a guardar mientras se llena (su descuento, sus fechas y a cuántas prendas a la venta llega).
   ==================================================================== */

/** 20 → "20", 12.5 → "12.5": sin ceros de más (el decimal peruano es el punto). */
const textoPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

export function EtiquetaDeCampana({
  nombre,
  descuento,
  rango,
  chip,
  total,
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
}) {
  return (
    <>
      <div className="eqp-clavo" aria-hidden>
        <svg viewBox="0 0 80 44">
          <circle className="eqp-punta" cx="40" cy="5" r="4" />
          <path className="eqp-hilo" d="M40 5 C 32 22, 48 30, 40 44" />
        </svg>
      </div>
      <div className="eqp-tarjeta">
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
      </div>
    </>
  );
}

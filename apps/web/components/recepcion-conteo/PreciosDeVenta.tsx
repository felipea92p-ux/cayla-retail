"use client";

import { TituloGrupo } from "@/components/ui/TituloSeccion";
import type { PrendaSeparada } from "@/lib/recepcion-conteo-reglas";
import { PrecioDePrenda } from "./PrecioDePrenda";
import type { usePreciosDeVenta } from "./usePreciosDeVenta";

// El precio de venta de las prendas que se acaban de identificar en «Para después» (Felipe 2026-10-26). Al contar «5 blusas» sin decir cuáles,
// el cierre no puede ofrecer el precio de nadie; aquí, con la prenda ya identificada, sí. Opcional: no frena nada. NO guarda aquí: el cambio se
// aplica al guardar la hoja, después de confirmarlo, y rige hacia adelante (lo ya vendido guarda su precio).

export function PreciosDeVenta({
  prendas,
  sede,
  soloSede = false,
  sedeId,
  precios,
}: {
  prendas: readonly Pick<PrendaSeparada, "productoId" | "nombre" | "codigo">[];
  /** El nombre de la sede que recibe: «Solo Tienda Lima». */
  sede: string;
  /** Una terminal (ADR-0531): el precio vale solo en su sede. */
  soloSede?: boolean;
  sedeId: string | null;
  precios: ReturnType<typeof usePreciosDeVenta>;
}) {
  if (prendas.length === 0) return null;
  return (
    <section className="space-y-2.5" aria-label="Precio de venta" data-precios-de-venta>
      <TituloGrupo nota="opcional">Precio de venta</TituloGrupo>
      <p className="text-xs text-taupe">Si ya sabes a cuánto se vende, cámbialo aquí: {soloSede ? `vale solo para ${sede}` : `por defecto vale solo para ${sede}`}. Rige desde ahora; lo ya vendido no cambia.</p>
      <div className="space-y-3">
        {prendas.map((pr) => (
          <PrecioDePrenda
            key={pr.productoId}
            prenda={pr}
            sede={sede}
            soloSede={soloSede}
            sedeId={sedeId}
            editado={precios.ventas[pr.productoId]}
            onActual={(general, enSede) => precios.ponerActual(pr.productoId, general, enSede)}
            onValor={(valor) => precios.cambiarVenta(pr.productoId, { valor })}
            onAlcance={(alcance) => precios.cambiarVenta(pr.productoId, { alcance })}
          />
        ))}
      </div>
    </section>
  );
}

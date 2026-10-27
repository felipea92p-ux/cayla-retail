"use client";

import { TituloGrupo } from "@/components/ui/TituloSeccion";
import type { PrendaSeparada } from "@/lib/recepcion-conteo-reglas";
import { PrecioDePrenda, type CostoDePrenda } from "./PrecioDePrenda";
import type { usePreciosDeVenta } from "./usePreciosDeVenta";

// El costo y el precio de venta de las prendas que se acaban de identificar en «Para después» (Felipe 2026-10-26/27). Al contar «5 blusas» sin
// decir cuáles, el cierre no puede ofrecer el costo ni el precio de nadie; aquí, con la prenda ya identificada, sí. Opcional: no frena nada. NO
// guarda aquí: el cambio se aplica al guardar la hoja, después de confirmarlo, y rige hacia adelante (lo ya vendido guarda su precio; el costo
// es el de lo que entra ahora). Sin `costoDe` (quien no ve el costo de esa línea) solo hay precio.

export function PreciosDeVenta({
  prendas,
  sede,
  soloSede = false,
  sedeId,
  precios,
  costoDe,
  onCosto,
  sinNombre = false,
}: {
  prendas: readonly Pick<PrendaSeparada, "productoId" | "nombre" | "codigo">[];
  /** El nombre de la sede que recibe: «Solo Tienda Lima». */
  sede: string;
  /** Una terminal (ADR-0531): el precio vale solo en su sede. */
  soloSede?: boolean;
  sedeId: string | null;
  precios: ReturnType<typeof usePreciosDeVenta>;
  /** El costo de compra de cada prenda (por defecto el que ya tiene en el conteo o el de su línea); sin él, no hay campo de costo. */
  costoDe?: (productoId: string) => CostoDePrenda;
  onCosto?: (productoId: string, valor: string) => void;
  /** Una sola prenda y la hoja ya dice cuál es (Tallas y colores): no se repite su nombre. */
  sinNombre?: boolean;
}) {
  if (prendas.length === 0) return null;
  const conCosto = costoDe !== undefined && onCosto !== undefined;
  const donde = soloSede ? `vale solo para ${sede}` : `por defecto vale solo para ${sede}`;
  return (
    <section className="space-y-2.5" aria-label={conCosto ? "Costo y precio de venta" : "Precio de venta"} data-precios-de-venta>
      <TituloGrupo nota="opcional">{conCosto ? "Costo y precio de venta" : "Precio de venta"}</TituloGrupo>
      <p className="text-xs text-taupe">
        {conCosto
          ? `Si el costo o el precio son otros, cámbialos aquí. El costo es el de lo que entra ahora; el precio ${donde} y rige desde ahora (lo ya vendido no cambia).`
          : `Si ya sabes a cuánto se vende, cámbialo aquí: ${donde}. Rige desde ahora; lo ya vendido no cambia.`}
      </p>
      <div className="space-y-3">
        {prendas.map((pr) => (
          <PrecioDePrenda
            key={pr.productoId}
            prenda={pr}
            sede={sede}
            soloSede={soloSede}
            sedeId={sedeId}
            editado={precios.ventas[pr.productoId]}
            costo={costoDe?.(pr.productoId)}
            onCosto={onCosto ? (valor) => onCosto(pr.productoId, valor) : undefined}
            sinNombre={sinNombre}
            onActual={(general, enSede) => precios.ponerActual(pr.productoId, general, enSede)}
            onValor={(valor) => precios.cambiarVenta(pr.productoId, { valor })}
            onAlcance={(alcance) => precios.cambiarVenta(pr.productoId, { alcance })}
          />
        ))}
      </div>
    </section>
  );
}

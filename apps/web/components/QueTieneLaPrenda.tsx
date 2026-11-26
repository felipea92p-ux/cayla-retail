"use client";

import { Check } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { useReglasDePrecio } from "@/components/ReglasDePrecio";
import { Casilla } from "@/components/ui/Casilla";
import type { Rasgo } from "@/lib/margen-por-rasgos";

// «¿Qué tiene esta prenda?» (ADR-0700): una sola pieza para «Compré ropa», Nuevo producto y Editar producto. Las casillas salen de la lista
// que edita el Admin en Configuración ▸ Precios (20261124201000): las que se marcan a mano (y la de la tela, que llega sola por el tejido y
// se puede quitar), cada una con lo que le suma al margen y su «?» con la ayuda; y la de la marca cuando sale sola de la lista de marcas (no
// se marca: se lee). Recibe lo que la prenda tiene EN EFECTO (con la tela por su tejido y la marca por su lista): la pantalla decide qué
// guarda. Opcional: nunca frena nada. Con la columna ancha van de a dos (seis casillas en una sola columna eran 300 px de alto).

export function QueTieneLaPrenda({
  rasgos,
  alCambiar,
  guia,
  disabled = false,
}: {
  rasgos: readonly Rasgo[];
  alCambiar: (rasgo: Rasgo, valor: boolean) => void;
  /** El ancla de la guía interactiva de la pantalla (`data-guia`). */
  guia?: string;
  disabled?: boolean;
}) {
  const { casillas } = useReglasDePrecio();
  const aMano = casillas.filter((c) => c.origen !== "por_marca");
  const marca = casillas.find((c) => c.origen === "por_marca" && rasgos.includes(c.codigo)) ?? null;
  return (
    <div role="group" aria-label="¿Qué tiene esta prenda?" className="@container" data-guia={guia}>
      {aMano.length === 0 && !marca ? (
        <p className="text-sm text-secundario">No hay casillas prendidas: el precio sale de la base.</p>
      ) : (
        <div className="grid gap-1.5 @[34rem]:grid-cols-2">
          {aMano.map((c) => (
            <div key={c.codigo} className={`vd-placa flex min-h-11 items-center gap-2 rounded-campo px-3 py-1.5 ${disabled ? "opacity-60" : ""}`}>
              <label className={`flex min-w-0 flex-1 items-center gap-3 self-stretch ${disabled ? "" : "cursor-pointer"}`}>
                <Casilla marcada={rasgos.includes(c.codigo)} onCambio={() => alCambiar(c.codigo, !rasgos.includes(c.codigo))} etiqueta={c.nombre} disabled={disabled} />
                <span className="min-w-0 flex-1 text-sm text-tinta">{c.nombre}</span>
              </label>
              {c.ayuda && <Ayuda titulo={c.nombre}>{c.ayuda}</Ayuda>}
              <span className="text-detalle tabular-nums text-secundario">+{c.puntos} %</span>
            </div>
          ))}
          {marca && (
            <p className="flex min-h-11 items-center gap-3 px-3 text-sm text-secundario">
              <Check className="h-4 w-4 shrink-0 text-verde" aria-hidden />
              <span className="min-w-0 flex-1">{marca.nombre}</span>
              <span className="text-detalle tabular-nums">+{marca.puntos} %</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

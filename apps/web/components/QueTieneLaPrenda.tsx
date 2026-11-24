"use client";

import { Check } from "lucide-react";
import { Casilla } from "@/components/ui/Casilla";
import { NOMBRE_RASGO, type Rasgo } from "@/lib/margen-por-rasgos";

// «¿Qué tiene esta prenda?» (ADR-0700): una sola pieza para «Compré ropa», Nuevo producto y Editar producto. Las tres casillas que se marcan a
// mano, cada una con lo que le suma al margen, y la de la marca cuando sale sola de la lista del Admin (no se marca: se lee). Recibe lo que la
// prenda tiene EN EFECTO (con la tela por su tejido y la marca por su lista): la pantalla decide qué guarda. Opcional: nunca frena nada.

const A_MANO: readonly Rasgo[] = ["nadie_la_tiene", "en_tendencia", "tela_que_se_nota"];

export function QueTieneLaPrenda({
  rasgos,
  puntos,
  alCambiar,
  guia,
  disabled = false,
}: {
  rasgos: readonly Rasgo[];
  puntos: Readonly<Record<Rasgo, number>>;
  alCambiar: (rasgo: Rasgo, valor: boolean) => void;
  /** El ancla de la guía interactiva de la pantalla (`data-guia`). */
  guia?: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="¿Qué tiene esta prenda?" className="grid gap-1.5" data-guia={guia}>
      {A_MANO.map((r) => (
        <label key={r} className={`vd-placa flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-1.5 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
          <Casilla marcada={rasgos.includes(r)} onCambio={() => alCambiar(r, !rasgos.includes(r))} etiqueta={NOMBRE_RASGO[r]} disabled={disabled} />
          <span className="min-w-0 flex-1 text-sm text-tinta">{NOMBRE_RASGO[r]}</span>
          <span className="text-detalle tabular-nums text-secundario">+{puntos[r]} %</span>
        </label>
      ))}
      {rasgos.includes("marca_conocida") && (
        <p className="flex min-h-11 items-center gap-3 px-3 text-sm text-secundario">
          <Check className="h-4 w-4 shrink-0 text-verde" aria-hidden />
          <span className="min-w-0 flex-1">{NOMBRE_RASGO.marca_conocida}</span>
          <span className="text-detalle tabular-nums">+{puntos.marca_conocida} %</span>
        </p>
      )}
    </div>
  );
}

"use client";

import type { FiltroMarcas, ResumenMarcas } from "@/lib/marcas";

const PILDORAS: { filtro: FiltroMarcas; texto: string }[] = [
  { filtro: "activas", texto: "Todas" },
  { filtro: "con", texto: "Ya las usamos" },
  { filtro: "sin", texto: "Sin productos" },
  { filtro: "sin-proveedor", texto: "Sin proveedor" },
];

/**
 * Los mismos cuatro números del resumen, como píldoras de filtro (`pildora-cayla`, la pieza que filtra) con su conteo, dentro de
 * la tarjeta de la lista. Mientras el resumen está abierto se esconden: no se repite la misma cifra dos veces. «Sin proveedor»
 * lleva su punto ámbar cuando hay alguna: es la única que pide una acción.
 */
export function FiltrosMarcas({ resumen, filtro, onFiltro }: { resumen: ResumenMarcas; filtro: FiltroMarcas | null; onFiltro: (f: FiltroMarcas) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar las marcas por estado">
      {PILDORAS.map(({ filtro: f, texto }) => {
        const puesta = filtro === f;
        const avisa = f === "sin-proveedor" && resumen[f] > 0;
        return (
          <button key={f} type="button" className="pildora-cayla" aria-pressed={puesta} onClick={() => onFiltro(f)}>
            {avisa && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ambar" />}
            {texto}
            <span className={`ml-1 font-medium tracking-normal tabular-nums ${avisa && !puesta ? "text-ambar-profundo" : ""}`}>{resumen[f]}</span>
          </button>
        );
      })}
    </div>
  );
}

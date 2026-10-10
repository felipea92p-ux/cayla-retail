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
    // Angosta (celular, o ventana chica con el menú abierto): una sola fila que se desliza de lado, sin barra, en vez de tres renglones
    // que empujan las marcas hacia abajo. Ancha: se acomodan en filas, como siempre.
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] @2xl:flex-wrap @2xl:overflow-visible [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar las marcas por estado">
      {PILDORAS.map(({ filtro: f, texto }) => {
        const puesta = filtro === f;
        const avisa = f === "sin-proveedor" && resumen[f] > 0;
        return (
          <button key={f} type="button" className="pildora-cayla shrink-0" aria-pressed={puesta} onClick={() => onFiltro(f)}>
            {avisa && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ambar" />}
            {texto}
            <span className={`ml-1 font-medium tracking-normal tabular-nums ${avisa && !puesta ? "text-ambar-profundo" : ""}`}>{resumen[f]}</span>
          </button>
        );
      })}
    </div>
  );
}

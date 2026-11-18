"use client";

import type { FiltroMarcas, ResumenMarcas } from "@/lib/marcas";

/** El nombre de cada filtro: el de su píldora y el que dice la cuenta de la lista («67 de 121 · Ya las usamos»). */
export const NOMBRE_FILTRO_MARCAS: Record<FiltroMarcas, string> = {
  activas: "Todas",
  con: "Ya las usamos",
  sin: "Sin productos",
  "sin-proveedor": "Sin proveedor",
};

const PILDORAS = (Object.keys(NOMBRE_FILTRO_MARCAS) as FiltroMarcas[]).map((filtro) => ({ filtro, texto: NOMBRE_FILTRO_MARCAS[filtro] }));

/**
 * El filtro de Marcas, en UN grupo (Felipe 2026-11-17: «hagamos todo en un filtro»): los cuatro números del resumen como píldoras
 * (`pildora-cayla`, la pieza que filtra) con su conteo y, al final, «Desactivadas», que antes iba suelta junto a «Resumen». Se elige
 * una a la vez: «Desactivadas» muestra las que ya no se usan y otra píldora vuelve a las activas. «Sin proveedor» lleva su punto
 * ámbar cuando hay alguna: es la única que pide una acción. En el celular el grupo se guarda tras el ícono de filtros (`MarcasLista`).
 */
export function FiltrosMarcas({
  resumen,
  filtro,
  onFiltro,
  desactivadas,
  verDesactivadas,
  onDesactivadas,
}: {
  resumen: ResumenMarcas;
  /** `null` mientras se ven las desactivadas: ninguna de las cuatro está puesta. */
  filtro: FiltroMarcas | null;
  onFiltro: (f: FiltroMarcas) => void;
  /** Cuántas desactivadas hay: con 0 la píldora no se dibuja. */
  desactivadas: number;
  verDesactivadas: boolean;
  onDesactivadas: () => void;
}) {
  return (
    <div data-guia="marcas.filtros" className="flex flex-wrap gap-2" role="group" aria-label="Filtrar las marcas">
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
      {desactivadas > 0 && (
        <button type="button" data-guia="marcas.desactivadas" className="pildora-cayla shrink-0" aria-pressed={verDesactivadas} onClick={onDesactivadas}>
          Desactivadas
          <span className="ml-1 font-medium tracking-normal tabular-nums">{desactivadas}</span>
        </button>
      )}
    </div>
  );
}

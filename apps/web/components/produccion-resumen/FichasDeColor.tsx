"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fichaDelColor, type ColorConFicha, type FichaDelColor } from "@/lib/ficha-del-color";

// El vocabulario de colores con su ficha (qué transmite cada color y con qué se combina, ADR-0316), entregado UNA vez al panel del Resumen de Producción y no dentro de la hoja de
// cada modelo: la ficha de un color mide ~1 KB y un modelo tiene 3 o 4 colores, así que repetirla en cada hoja era la parte más pesada de lo que viaja con la página (medido: ~2 KB por
// modelo de ~5,7 KB). La hoja busca la ficha del color que mira por su NOMBRE, como la vista rápida de Catálogo (el nombre es único en el vocabulario, `colores_clave_unica`).

const SIN_FICHAS: readonly ColorConFicha[] = [];
const Contexto = createContext<readonly ColorConFicha[]>(SIN_FICHAS);

export function ProveedorFichasDeColor({ fichas, children }: { fichas: readonly ColorConFicha[]; children: ReactNode }) {
  return <Contexto.Provider value={fichas}>{children}</Contexto.Provider>;
}

/** Devuelve la ficha de un color por su nombre; `null` si el color no está en el vocabulario o no tiene ficha (la hoja no dibuja nada: nunca un «sin datos»). */
export function useFichaDeColor(): (nombre: string) => FichaDelColor | null {
  const fichas = useContext(Contexto);
  const vocabulario = useMemo(() => ({ porCodigo: new Map(fichas.map((c) => [c.codigo, c])), codigoPorNombre: new Map(fichas.map((c) => [c.nombre, c.codigo])) }), [fichas]);
  return (nombre) => fichaDelColor(vocabulario.codigoPorNombre.get(nombre), vocabulario.porCodigo);
}

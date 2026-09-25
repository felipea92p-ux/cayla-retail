"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { enCubetaCaja, tramoVencimientoDe, type ClaveTramoVencimiento, type CubetaCaja } from "@/lib/por-pagar-reglas";

// Por pagar responde (spike 2026-09-19): la deuda por vencimiento, las salidas de caja, la barra de
// concentración y la lista son piezas de servidor y de cliente distintas, pero hablan entre sí. Apuntar a un
// tramo (`eco`) enciende las filas que suman esa cifra; hacer clic (`filtroLocal`) deja solo esas filas.
// El problema que resuelve: «Vencido S/ 6,670» no dice CUÁLES son; antes había que buscarlos a ojo.
//
// El filtro por tramo o por semana es local (sobre las filas que la página ya trajo) y NO viaja en la URL
// porque `listar_compras` filtra por emisión, no por vencimiento. Cuando hay más páginas, la lista lo dice
// («en esta página»): no se aparenta que el filtro cubre toda la deuda. Los filtros que sí son de la base
// (proveedor, vencidas, condición, búsqueda) siguen en la URL, como siempre.

/** A qué se está apuntando ahora (mouse encima o foco). */
export type Eco =
  | { tipo: "proveedor"; id: string }
  | { tipo: "tramo"; clave: ClaveTramoVencimiento }
  | { tipo: "caja"; cubeta: CubetaCaja }
  | null;

/** Lo mínimo de un comprobante que hace falta para saber si un eco o un filtro lo alcanza. */
export type FilaFiltrable = { proveedorId: string; fechaVencimiento: string | null };

/** Un filtro por clic sobre la lista ya cargada. `clave` identifica el mismo gesto para poder apagarlo. */
export type FiltroLocal = { clave: string; etiqueta: string; coincide: (c: FilaFiltrable) => boolean };

export function coincideConEco(eco: Eco, c: FilaFiltrable, ahora: Date): boolean {
  if (!eco) return false;
  if (eco.tipo === "proveedor") return c.proveedorId === eco.id;
  if (eco.tipo === "tramo") return tramoVencimientoDe(c, ahora) === eco.clave;
  return enCubetaCaja(c, eco.cubeta, ahora);
}

export type Agrupar = "urgencia" | "proveedor";

type Valor = {
  /** Cómo se agrupa la lista. Vive aquí (y no solo en la URL) para que el cambio deslice las filas al instante. */
  agrupar: Agrupar;
  cambiarAgrupar: (a: Agrupar) => void;
  eco: Eco;
  apuntar: (e: Eco) => void;
  filtroLocal: FiltroLocal | null;
  /** Aplica el filtro; si ya estaba aplicado el mismo (misma `clave`), lo apaga. */
  alternarFiltro: (f: FiltroLocal) => void;
  quitarFiltro: () => void;
};

const Contexto = createContext<Valor | null>(null);

export function PorPagarProvider({ children, agruparInicial }: { children: ReactNode; agruparInicial: Agrupar }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [agrupar, setAgrupar] = useState<Agrupar>(agruparInicial);
  // La vista se elige al instante (las filas se deslizan sin esperar a nadie) y la URL se pone al día en
  // segundo plano: el enlace se sigue pudiendo compartir y «atrás» no se rompe. La vista por defecto no ensucia la URL.
  const cambiarAgrupar = useCallback(
    (a: Agrupar) => {
      setAgrupar(a);
      const p = new URLSearchParams(params.toString());
      p.delete("cursor");
      if (a === "proveedor") p.set("agrupar", "proveedor");
      else p.delete("agrupar");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  const [eco, setEco] = useState<Eco>(null);
  const [filtroLocal, setFiltroLocal] = useState<FiltroLocal | null>(null);
  const alternarFiltro = useCallback((f: FiltroLocal) => setFiltroLocal((a) => (a?.clave === f.clave ? null : f)), []);
  const quitarFiltro = useCallback(() => setFiltroLocal(null), []);
  const valor = useMemo(() => ({ agrupar, cambiarAgrupar, eco, apuntar: setEco, filtroLocal, alternarFiltro, quitarFiltro }), [agrupar, cambiarAgrupar, eco, filtroLocal, alternarFiltro, quitarFiltro]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Fuera del proveedor las piezas siguen siendo válidas (no responden entre sí), no rompen. */
const INERTE: Valor = { agrupar: "urgencia", cambiarAgrupar: () => {}, eco: null, apuntar: () => {}, filtroLocal: null, alternarFiltro: () => {}, quitarFiltro: () => {} };

export function usePorPagar(): Valor {
  return useContext(Contexto) ?? INERTE;
}

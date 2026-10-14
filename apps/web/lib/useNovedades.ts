"use client";

import { useEffect, useRef, useState } from "react";
import { nuevosPorId } from "@/lib/caja-en-vivo";

const VACIO: ReadonlySet<string> = new Set();

/**
 * Lo que apareció DESPUÉS del primer render (lo que ya estaba al abrir la pantalla no es "nuevo"):
 * `nuevos` es el último lote y `ids` los de lo que sigue siendo noticia durante `vigenciaMs`. Los
 * componentes usan `ids` para resaltar una fila o un punto mientras dura la novedad, y `nuevos` (que
 * cambia de identidad solo con un lote nuevo) para disparar un aviso una vez.
 *
 * `idDe` debe ser estable (una función de módulo, no una flecha creada en cada render).
 */
export function useIdsNuevos<T>(items: readonly T[], idDe: (x: T) => string, vigenciaMs = 8000): { nuevos: T[]; ids: ReadonlySet<string> } {
  const vistos = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  const [estado, setEstado] = useState<{ nuevos: T[]; ids: ReadonlySet<string> }>({ nuevos: [], ids: VACIO });

  useEffect(() => {
    const previos = vistos.current;
    if (previos === null) {
      vistos.current = new Set(items.map(idDe)); // línea base: lo que ya estaba
      return;
    }
    const frescos = nuevosPorId(previos, items, idDe);
    if (frescos.length === 0) return;
    const idsFrescos = frescos.map(idDe);
    idsFrescos.forEach((id) => previos.add(id));
    timers.current.push(
      window.setTimeout(() => setEstado((e) => ({ nuevos: frescos, ids: new Set([...e.ids, ...idsFrescos]) })), 0),
      window.setTimeout(
        () => setEstado((e) => ({ nuevos: e.nuevos, ids: new Set([...e.ids].filter((id) => !idsFrescos.includes(id))) })),
        vigenciaMs
      )
    );
  }, [items, idDe, vigenciaMs]);

  useEffect(() => {
    const pendientes = timers.current;
    return () => pendientes.forEach((t) => window.clearTimeout(t));
  }, []);

  return estado;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { nuevosPorId } from "@/lib/caja-en-vivo";

/**
 * Sube cada vez que `valor` AUMENTA —nunca en el primer render ni cuando baja— y dice cuánto subió.
 * Para que una cifra que crece (una tarjeta de ventas) avise que creció: `pulso` sirve de `key` para
 * reiniciar una animación y `delta` para mostrar "+S/337.00".
 */
export function useAumento(valor: number): { pulso: number; delta: number } {
  const previo = useRef(valor);
  const [estado, setEstado] = useState({ pulso: 0, delta: 0 });
  useEffect(() => {
    const delta = valor - previo.current;
    previo.current = valor;
    if (delta < 0.005) return; // solo aumentos reales, no ruido de redondeo
    // Diferido: el efecto no escribe estado de forma síncrona (regla de React para no encadenar renders).
    const id = window.setTimeout(() => setEstado((e) => ({ pulso: e.pulso + 1, delta })), 0);
    return () => window.clearTimeout(id);
  }, [valor]);
  return estado;
}

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

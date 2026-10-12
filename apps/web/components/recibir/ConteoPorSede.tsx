"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";
import { avisoConteoGuardado, avisoConteoRetomado, type ConteoGuardado } from "@/lib/recibir-cambio-de-sede";

// El guardián del cambio de sede en Recibir (Felipe, 2026-10-11; la regla y el porqué, en `lib/recibir-cambio-de-sede.ts`).
//
// La página monta la recepción con la sede en su key: al cambiar de sede se monta de nuevo y arranca vacía. Lo que estaba
// contado en la sede anterior se perdería con ese montaje, así que lo guarda este envoltorio, que NO cambia de key con la sede y
// por eso sobrevive al `router.refresh()` del selector: la pantalla le reporta su conteo cada vez que cambia y, cuando la sede
// cambia, el de la anterior queda guardado para ESA sede. Al volver, la pantalla lo lee al montarse y sigue tal como estaba.
//
// Vive lo que vive la vista: salir de Recibir lo desmonta con todo (y «¿Salir sin guardar?» lo avisa, con `otras`).

type Reporte = { etiqueta: string; unidades: number; conteo: unknown };

type Contexto = {
  leer: (sede: string) => Reporte | undefined;
  reportar: (sede: string, reporte: Reporte | null) => void;
  /** Lo guardado en otras sedes (no la de ahora): también se pierde si la persona sale de Recibir. */
  otras: ConteoGuardado[];
};

const ContextoConteo = createContext<Contexto | null>(null);

const SIN_OTRAS: ConteoGuardado[] = [];

/**
 * Para la pantalla que cuenta. `inicial`: lo que quedó guardado para esta sede (se lee UNA vez, al montar; `undefined` si no hay
 * nada). `reportar`: lo que hay contado ahora (`null` si nada). Fuera de `ConteoPorSede` no guarda nada y no falla.
 */
export function useConteoPorSede<T>(sede: string): {
  inicial: T | undefined;
  reportar: (reporte: { etiqueta: string; unidades: number; conteo: T } | null) => void;
  otras: ConteoGuardado[];
} {
  const contexto = useContext(ContextoConteo);
  const [inicial] = useState(() => contexto?.leer(sede)?.conteo as T | undefined);
  const reportarAlGuardian = contexto?.reportar;
  const reportar = useCallback(
    (reporte: { etiqueta: string; unidades: number; conteo: T } | null) => reportarAlGuardian?.(sede, reporte),
    [reportarAlGuardian, sede],
  );
  return { inicial, reportar, otras: contexto?.otras ?? SIN_OTRAS };
}

export function ConteoPorSede({ ubicacionId, children }: { ubicacionId: string; children: ReactNode }) {
  // Lo que cada sede tiene contado AHORA. Por sede y no uno solo: al cambiar de sede la pantalla nueva reporta su conteo ANTES
  // de que corra el efecto de abajo (los efectos de los hijos van primero), y con un solo lugar pisaría el de la sede que se deja.
  const vivos = useRef(new Map<string, Reporte>());
  // Lo que quedó al irse de una sede, esperando que se vuelva a ella.
  const guardados = useRef(new Map<string, Reporte>());
  // Las sedes cuya pantalla ya leyó lo guardado al montarse (marcar dos veces da lo mismo: se puede hacer al dibujar).
  const leidas = useRef(new Set<string>());
  const sedeAnterior = useRef(ubicacionId);
  const [otras, setOtras] = useState<ConteoGuardado[]>(SIN_OTRAS);

  const leer = useCallback((sede: string) => {
    const guardado = guardados.current.get(sede);
    if (guardado) leidas.current.add(sede);
    return guardado;
  }, []);

  const reportar = useCallback((sede: string, reporte: Reporte | null) => {
    if (reporte) vivos.current.set(sede, reporte);
    else vivos.current.delete(sede);
  }, []);

  useEffect(() => {
    const anterior = sedeAnterior.current;
    sedeAnterior.current = ubicacionId;
    if (anterior === ubicacionId) return;

    const dejado = vivos.current.get(anterior);
    vivos.current.delete(anterior);
    if (dejado) guardados.current.set(anterior, dejado);
    // La pantalla de la sede nueva ya se montó y leyó lo suyo: deja de estar guardado (ahora es su conteo vivo). Si no se montó
    // (en esa sede no queda ninguna factura por recibir), lo guardado espera: no se descarta en silencio.
    const retomado = leidas.current.has(ubicacionId) ? guardados.current.get(ubicacionId) : undefined;
    if (retomado) guardados.current.delete(ubicacionId);
    leidas.current.delete(ubicacionId);

    setOtras(
      [...guardados.current]
        .filter(([sede]) => sede !== ubicacionId)
        .map(([sede, r]) => ({ sede, etiqueta: r.etiqueta, unidades: r.unidades })),
    );
    if (dejado) {
      const aviso = avisoConteoGuardado(dejado);
      avisar.aviso(aviso.texto, { detalle: aviso.detalle, duracion: 7000 });
    }
    if (retomado) avisar.exito(avisoConteoRetomado(retomado));
  }, [ubicacionId]);

  const valor = useMemo(() => ({ leer, reportar, otras }), [leer, reportar, otras]);
  return <ContextoConteo.Provider value={valor}>{children}</ContextoConteo.Provider>;
}

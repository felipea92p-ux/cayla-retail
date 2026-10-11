"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";

// El trabajo a medio armar es de SU sede (Felipe, 2026-10-11: Recibir, ADR-0330 act.; Apartados, ADR-0166 act.).
//
// El selector de sede de la cabecera cambia de sede con `router.refresh()`: la ruta no cambia y React conserva el estado de todo
// componente cliente cuya `key` siga igual. Una pantalla que arma algo para UNA sede (un conteo, un apartado) se monta con la sede
// en su key, así que la sede nueva arranca vacía; lo que estaba armado en la anterior se perdería con ese montaje, y lo guarda este
// envoltorio, que NO cambia de key con la sede y por eso sobrevive al cambio. La pantalla le reporta lo armado cada vez que cambia
// (con los avisos que la nombran) y lo lee al montarse: al volver a la sede, sigue tal como estaba.
//
// Vive lo que vive la pantalla: salir de ella lo desmonta con todo. Si la pantalla tiene «¿Salir sin guardar?», `otras` le dice qué
// quedó guardado en otras sedes para nombrarlo (Recibir). La página lo monta con una key propia por pantalla o vista, para que lo
// guardado en una no aparezca en otra.

/** Lo que una pantalla tiene armado en una sede, con lo que hay que decir de ello. */
export type TrabajoReportado<T> = {
  /** El nombre de la sede («Tienda Lima»). */
  etiqueta: string;
  /** Las unidades que lleva, para nombrarlo en «¿Salir sin guardar?». */
  unidades: number;
  trabajo: T;
  /** Al irse de la sede con esto armado. */
  avisoAlGuardar: { texto: string; detalle: string };
  /** Al volver y encontrarlo. */
  avisoAlVolver: string;
};

/** Lo guardado en otra sede, tal como se nombra. */
export type TrabajoGuardado = { sede: string; etiqueta: string; unidades: number };

type Contexto = {
  leer: (sede: string) => TrabajoReportado<unknown> | undefined;
  reportar: (sede: string, reporte: TrabajoReportado<unknown> | null) => void;
  otras: TrabajoGuardado[];
};

const ContextoTrabajo = createContext<Contexto | null>(null);

const SIN_OTRAS: TrabajoGuardado[] = [];

/**
 * Para la pantalla que arma. `inicial`: lo que quedó guardado para esta sede (se lee UNA vez, al montar; `undefined` si no hay
 * nada). `reportar`: lo armado ahora (`null` si nada). `otras`: lo guardado en otras sedes. Fuera de `TrabajoPorSede` no guarda nada
 * y no falla.
 */
export function useTrabajoPorSede<T>(sede: string): {
  inicial: T | undefined;
  reportar: (reporte: TrabajoReportado<T> | null) => void;
  otras: TrabajoGuardado[];
} {
  const contexto = useContext(ContextoTrabajo);
  const [inicial] = useState(() => contexto?.leer(sede)?.trabajo as T | undefined);
  const reportarAlGuardian = contexto?.reportar;
  const reportar = useCallback((reporte: TrabajoReportado<T> | null) => reportarAlGuardian?.(sede, reporte), [reportarAlGuardian, sede]);
  return { inicial, reportar, otras: contexto?.otras ?? SIN_OTRAS };
}

export function TrabajoPorSede({ ubicacionId, children }: { ubicacionId: string; children: ReactNode }) {
  // Lo que cada sede tiene armado AHORA. Por sede y no uno solo: al cambiar de sede la pantalla nueva reporta lo suyo (vacío) ANTES
  // de que corra el efecto de abajo (los efectos de los hijos van primero), y con un solo lugar pisaría lo de la sede que se deja.
  const vivos = useRef(new Map<string, TrabajoReportado<unknown>>());
  // Lo que quedó al irse de una sede, esperando que se vuelva a ella.
  const guardados = useRef(new Map<string, TrabajoReportado<unknown>>());
  // Las sedes cuya pantalla ya leyó lo guardado al montarse (marcar dos veces da lo mismo: se puede hacer al dibujar).
  const leidas = useRef(new Set<string>());
  const sedeAnterior = useRef(ubicacionId);
  const [otras, setOtras] = useState<TrabajoGuardado[]>(SIN_OTRAS);

  const leer = useCallback((sede: string) => {
    const guardado = guardados.current.get(sede);
    if (guardado) leidas.current.add(sede);
    return guardado;
  }, []);

  const reportar = useCallback((sede: string, reporte: TrabajoReportado<unknown> | null) => {
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
    // La pantalla de la sede nueva ya se montó y leyó lo suyo: deja de estar guardado (ahora es su trabajo vivo). Si no se montó (en
    // esa sede no hay nada que la dibuje, como Recibir sin facturas pendientes), lo guardado espera: no se descarta en silencio.
    const retomado = leidas.current.has(ubicacionId) ? guardados.current.get(ubicacionId) : undefined;
    if (retomado) guardados.current.delete(ubicacionId);
    leidas.current.delete(ubicacionId);

    setOtras(
      [...guardados.current]
        .filter(([sede]) => sede !== ubicacionId)
        .map(([sede, r]) => ({ sede, etiqueta: r.etiqueta, unidades: r.unidades })),
    );
    if (dejado) avisar.aviso(dejado.avisoAlGuardar.texto, { detalle: dejado.avisoAlGuardar.detalle, duracion: 7000 });
    if (retomado) avisar.exito(retomado.avisoAlVolver);
  }, [ubicacionId]);

  const valor = useMemo(() => ({ leer, reportar, otras }), [leer, reportar, otras]);
  return <ContextoTrabajo.Provider value={valor}>{children}</ContextoTrabajo.Provider>;
}

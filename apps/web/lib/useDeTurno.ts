"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardar, leer as leerLocal } from "@/lib/almacen-local";
import { claveTurnoGuardado, turnoGuardadoVigente, type FilaDeTurno, type TurnoGuardado } from "@/lib/responsable-reglas";

export type DeTurno = {
  /** La última lectura buena de `fn_asesoras_de_turno` (vacía hasta la primera). */
  filas: FilaDeTurno[];
  /** Ya llegó al menos una lectura buena. */
  cargo: boolean;
  /** La última lectura falló (se conserva la lista anterior, si la había). */
  fallo: boolean;
  /** La lista viene de la memoria de este navegador (pantalla abierta sin red, ADR-0210): la hora de esa lectura. */
  deMemoria: string | null;
  /** Relee ahora (botón «Actualizar lista», o tras un rechazo de la base). */
  recargar: () => Promise<void>;
  recargando: boolean;
};

/**
 * Quién está en la tienda ahora, según la asistencia de Dynamic (`fn_asesoras_de_turno`). Nació para la fila
 * «Atendió» del Punto de venta (ADR-0163) y hoy alimenta el combo «Responsable» de toda operación de tienda
 * (ADR-0161). Las REGLAS de quién se ofrece viven en `listaResponsable` (lib/responsable-reglas.ts); esto solo lee.
 *
 * Una pantalla de tienda queda abierta todo el día y la asistencia cambia (almuerzos, turnos), así que se vuelve a
 * preguntar cada `cadaMs` (20 s desde el 2026-10-10: quien marca su vuelta del refrigerio aparece casi al instante),
 * al volver a la pestaña o a la ventana y al abrir el combo — sin sondear con la pestaña oculta. Si una lectura falla se conserva la última lista buena: una venta sin conexión sigue pudiendo
 * elegir a quien estaba presente. `fn_` está en la lista de lectura de `espera-reglas.ts`, así que el sondeo no
 * enciende el loader general.
 *
 * Memoria (ADR-0210): cada lectura buena se guarda en este navegador, por sede. Una pantalla que se ABRE sin red
 * (servida por el service worker) arranca con esa lista si tiene menos de 12 h (`turnoGuardadoVigente`), y el combo
 * lo dice. No es un permiso nuevo: al subir, la base vuelve a validar que esa persona estaba de turno a esa hora.
 */
export function useDeTurno(ubicacionId: string | null, cadaMs = 20_000): DeTurno {
  const [filas, setFilas] = useState<FilaDeTurno[]>([]);
  const [cargo, setCargo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [deMemoria, setDeMemoria] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);
  const vivo = useRef(true);
  const numero = useRef(0);
  const ultimaAplicada = useRef(0);
  const sedeActual = useRef(ubicacionId);

  const leer = useCallback(
    async (forzar: boolean) => {
      if (!ubicacionId) return;
      // Sin mirar `navigator.onLine`: el 2026-10-10 la caja de TRU lo tuvo en «sin red» toda la mañana con internet, este
      // hook dejó de preguntar y quien volvía del refrigerio seguía «en pausa» en el combo. Se pregunta siempre: sin red
      // de verdad la lectura falla al instante y cae en `setFallo` de abajo (el combo dice «no se pudo leer» en vez de
      // quedarse en «Leyendo quién está de turno…»).
      if (!forzar && document.visibilityState !== "visible") return;
      const pedida = ++numero.current;
      let respuesta: Awaited<ReturnType<ReturnType<typeof createClient>["rpc"]>> | null = null;
      try {
        respuesta = await createClient().rpc("fn_asesoras_de_turno", { p_ubicacion_id: ubicacionId });
      } catch {
        respuesta = null;
      }
      // Desmontado, o la sede activa cambió mientras se leía: esta respuesta ya no es de la pantalla.
      if (!vivo.current || sedeActual.current !== ubicacionId) return;
      if (pedida < ultimaAplicada.current) return;
      if (!respuesta || respuesta.error) {
        setFallo(true);
        return;
      }
      const nuevas = (respuesta.data ?? []) as FilaDeTurno[];
      // Una lectura vieja que llega después de otra más nueva no la pisa (al abrir el combo se relee aunque haya otra en curso).
      ultimaAplicada.current = pedida;
      setFilas(nuevas);
      setCargo(true);
      setFallo(false);
      setDeMemoria(null);
      guardar(claveTurnoGuardado(ubicacionId), { filas: nuevas, leidoEn: new Date().toISOString() } satisfies TurnoGuardado);
    },
    [ubicacionId],
  );

  useEffect(() => {
    vivo.current = true;
    sedeActual.current = ubicacionId;
    // Cambió la sede activa: la lista anterior es de otra tienda y no sirve. Si este navegador recuerda la de ESTA sede
    // (y no está vieja), se arranca con ella mientras llega la lectura — o en vez de ella, si no hay red.
    const guardado = ubicacionId ? leerLocal<TurnoGuardado | null>(claveTurnoGuardado(ubicacionId), null) : null;
    const vigente = guardado && turnoGuardadoVigente(guardado, new Date()) ? guardado : null;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFilas(vigente?.filas ?? []);
    setCargo(vigente !== null);
    setFallo(false);
    setDeMemoria(vigente?.leidoEn ?? null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void leer(false);
    const id = window.setInterval(() => void leer(false), cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void leer(false);
    };
    // Volvió la red: se relee al toque, sin esperar el próximo latido (la lista de memoria se reemplaza por la real).
    const alVolverRed = () => void leer(false);
    document.addEventListener("visibilitychange", alVolver);
    // Volver a la ventana (la caja suele quedar visible detrás del kiosco de asistencia): se relee al toque.
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolverRed);
    return () => {
      vivo.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolverRed);
    };
  }, [leer, cadaMs, ubicacionId]);

  const recargar = useCallback(async () => {
    setRecargando(true);
    try {
      await leer(true);
    } finally {
      if (vivo.current) setRecargando(false);
    }
  }, [leer]);

  return { filas, cargo, fallo, deMemoria, recargar, recargando };
}

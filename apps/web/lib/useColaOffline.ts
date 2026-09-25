"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { guardar, leer } from "@/lib/almacen-local";
import { esErrorPasajero, esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { claveCola, colaValida, conOperacion, porSubir, reconciliar, sinOperacion, trasFallo, type OperacionEncolada } from "@/lib/cola-offline";

/**
 * El trío de sincronización de la cola sin conexión (ADR-0207), el mismo de la venta (ADR-0063) pero reutilizable:
 * sube al montar, al volver la red (evento `online`), apenas se encola algo, y con un latido de 30 s por si el
 * navegador nunca avisa. Lee y escribe `localStorage` directo en cada pasada y reconcilia contra una lectura fresca
 * al final (`reconciliar`), así lo que se encola a mitad de una subida no se pierde.
 *
 * Quién sube: SOLO `components/ColasSinConexion.tsx`, montado una vez en el layout de la app (`subir: true`) —
 * lo guardado sube aunque la persona ya esté en Vender. Las pantallas llaman al hook sin `subir`: pintan y encolan.
 * El candado por módulo a nivel de archivo cubre React Strict Mode (dos montajes). Entre pestañas no hay candado;
 * ahí protege el token en la base (`token_cliente unique`).
 */
const pasadasEnCurso = new Map<string, Promise<void>>();

/** Aviso dentro de la MISMA pestaña de que la cola cambió (el evento `storage` solo llega a las otras pestañas): el
 *  sincronizador global del layout sube, y el aviso de la pantalla abierta se entera sin esperar el latido. */
export const EVENTO_COLA = "cayla:cola-cambio";

function guardarYAvisar(clave: string, cola: OperacionEncolada[]): boolean {
  const ok = guardar(clave, cola);
  if (ok) window.dispatchEvent(new CustomEvent(EVENTO_COLA, { detail: clave }));
  return ok;
}

export type ControlColaOffline = {
  cola: OperacionEncolada[];
  /** Guarda la operación en este navegador. `false` si no se pudo (modo privado, cuota llena): anotarla a mano. */
  encolar: (op: OperacionEncolada) => boolean;
  descartar: (token: string) => void;
};

export function useColaOffline(
  modulo: string,
  rpcsPermitidas: readonly string[],
  opciones: {
    /** Solo el sincronizador del layout: corre el trío de subida. Una pantalla solo pinta y encola. */
    subir?: boolean;
    /** Tras cada operación que la base aceptó al subir (para releer la pantalla y avisar). Se espera antes de
     *  `trasPasada`: el alta de producto anota ahí el id que dio la base, y la pasada de fotos lo necesita. */
    alSubir?: (op: OperacionEncolada, data: unknown) => void | Promise<void>;
    /** Al final de cada pasada, haya o no cola: trabajo que cuelga de lo ya subido (las fotos de un alta, ADR-0207). */
    trasPasada?: (supabase: ReturnType<typeof createClient>) => Promise<void>;
    /** Al descartar a mano una operación rechazada: soltar lo que tenía guardado aparte (sus fotos). */
    alDescartar?: (token: string) => void;
  } = {},
): ControlColaOffline {
  const clave = claveCola(modulo);
  const [cola, setCola] = useState<OperacionEncolada[]>([]);
  // Las dos dependencias que cambian de identidad en cada render se leen por ref: el efecto de subida no se rearma.
  const permitidasRef = useRef(rpcsPermitidas);
  const alSubirRef = useRef(opciones.alSubir);
  const trasPasadaRef = useRef(opciones.trasPasada);
  const alDescartarRef = useRef(opciones.alDescartar);
  useEffect(() => {
    permitidasRef.current = rpcsPermitidas;
    alSubirRef.current = opciones.alSubir;
    trasPasadaRef.current = opciones.trasPasada;
    alDescartarRef.current = opciones.alDescartar;
  });

  const leerCola = useCallback(() => colaValida(leer<unknown>(clave, []), permitidasRef.current), [clave]);

  // Pintar la cola: al montar y cada vez que cambia (en esta pestaña o en otra).
  useEffect(() => {
    // `localStorage` no existe en el servidor: se hidrata al montar, nunca durante el render (misma excepción que
    // la cola y la espera de `PuntoDeVenta.tsx`; leerlo en el render desincroniza la hidratación).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCola(leerCola());
    const releer = () => setCola(leerCola());
    const alCambiarAqui = (e: Event) => (e as CustomEvent<string>).detail === clave && releer();
    const alCambiarOtraPestana = (e: StorageEvent) => e.key === clave && releer();
    window.addEventListener(EVENTO_COLA, alCambiarAqui);
    window.addEventListener("storage", alCambiarOtraPestana);
    return () => {
      window.removeEventListener(EVENTO_COLA, alCambiarAqui);
      window.removeEventListener("storage", alCambiarOtraPestana);
    };
  }, [clave, leerCola]);

  // Subir: solo el sincronizador del layout (`ColasSinConexion`), así hay UNA subida y UN aviso por operación, y
  // lo guardado sube aunque la persona ya esté en otra pantalla.
  useEffect(() => {
    if (!opciones.subir) return;
    const supabase = createClient();

    async function pasada() {
      await subirCola();
      await trasPasadaRef.current?.(supabase);
    }

    async function subirCola() {
      const aSubir = porSubir(leerCola());
      if (aSubir.length === 0) return;
      const resueltos = new Map<string, OperacionEncolada | null>();
      const subidas: { op: OperacionEncolada; data: unknown }[] = [];
      for (const op of aSubir) {
        // `x-espera: no` (ADR-0149): subir en segundo plano no tapa la pantalla con el loader mientras alguien trabaja.
        const { data, error, status } = await firmar(supabase.rpc(op.rpc as never, op.params as never), op.firma).setHeader("x-espera", "no");
        if (!error) {
          resueltos.set(op.token, null);
          subidas.push({ op, data });
          continue;
        }
        // Sin red: no se toca ni se cuenta. Servidor momentáneamente mal (5xx, bloqueo…): suma un intento, hasta el tope.
        // Rechazo de verdad: queda esperando «Descartar».
        const tipo = esFalloDeRed(error) ? "red" : esErrorPasajero(error, status) ? "pasajero" : "definitivo";
        const siguiente = trasFallo(op, tipo, traducirError(error, "subir lo guardado sin conexión"));
        if (siguiente) resueltos.set(op.token, siguiente);
      }
      if (resueltos.size === 0) return;
      // Aunque la pantalla se haya desmontado, lo resuelto se escribe igual: la base ya lo registró.
      guardarYAvisar(clave, reconciliar(leerCola(), resueltos));
      for (const s of subidas) await alSubirRef.current?.(s.op, s.data);
    }

    function intentarSubir(): Promise<void> {
      let enCurso = pasadasEnCurso.get(clave);
      if (!enCurso) {
        enCurso = pasada().finally(() => pasadasEnCurso.delete(clave));
        pasadasEnCurso.set(clave, enCurso);
      }
      return enCurso;
    }

    // Algo se encoló en esta pestaña: se intenta al toque (quizá la red volvió sin que el navegador avise).
    const alEncolar = (e: Event) => (e as CustomEvent<string>).detail === clave && void intentarSubir();

    void intentarSubir();
    window.addEventListener("online", intentarSubir);
    window.addEventListener(EVENTO_COLA, alEncolar);
    const latido = setInterval(intentarSubir, 30_000);
    return () => {
      window.removeEventListener("online", intentarSubir);
      window.removeEventListener(EVENTO_COLA, alEncolar);
      clearInterval(latido);
    };
  }, [clave, leerCola, opciones.subir]);

  const encolar = useCallback(
    (op: OperacionEncolada) => {
      const nueva = conOperacion(leerCola(), op);
      if (!guardarYAvisar(clave, nueva)) return false;
      setCola(nueva);
      return true;
    },
    [clave, leerCola],
  );

  const descartar = useCallback(
    (token: string) => {
      const restante = sinOperacion(leerCola(), token);
      guardarYAvisar(clave, restante);
      setCola(restante);
      alDescartarRef.current?.(token);
    },
    [clave, leerCola],
  );

  return { cola, encolar, descartar };
}

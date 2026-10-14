"use client";

/**
 * `useIntento`: la marca de un envío atada a lo que se manda (las reglas en `intento-reglas.ts`).
 *
 *   const intento = useIntento("registrar_movimiento_caja");
 *   const r = await intento.enviar(huellaDe([...lo que se manda]), (token, senal) => supabase.rpc("…", { …, p_token: token }).abortSignal(senal));
 *
 * `enviar` devuelve:
 *   · `ok`        la base guardó (o devolvió lo que ya había guardado con esta marca);
 *   · `hecho`     el envío anterior SÍ se guardó y se supo preguntando (`fn_resolver_intento`): `datos` es lo guardado;
 *   · `error`     la base dijo que no, con su veredicto: el formulario queda libre para corregir;
 *   · `incierto`  no se sabe si se guardó: el formulario se congela (`incierto` en true) hasta reenviar lo mismo o `revisar()`;
 *   · `ocupado`   ya hay un envío en curso (una ráfaga de clics o de Enter): no se manda nada;
 *   · `congelado` hay un envío en duda y se intentó mandar OTRA cosa: no se manda nada.
 * `revisar()` le pregunta a la base qué pasó con el envío en duda; `soltar()` olvida la marca (otro camino se quedó con ella,
 * como la cola sin conexión de Vender, que reenvía con el mismo token).
 *
 * Un formulario que se guarda al cambiar de sede (`TrabajoPorSede`) guarda también `instantanea()` y la devuelve como `inicial`:
 * si el envío había quedado en duda, al volver sigue en duda, con la misma marca.
 */

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "./error-escritura";
import {
  faseTrasError,
  hayQueRevisar,
  leerResolucion,
  marcaPara,
  TOPE_ESPERA_MS,
  type Fase,
  type InstantaneaIntento,
  type Marca,
  type OperacionConMarca,
  type Resolucion,
} from "./intento-reglas";

export type RespuestaRpc<T> = { data: T | null; error: ErrorEscritura };

export type ResultadoIntento<T> =
  | { tipo: "ok"; data: T | null; token: string }
  | { tipo: "hecho"; datos: Record<string, unknown>; token: string }
  | { tipo: "error"; error: NonNullable<ErrorEscritura>; token: string }
  | { tipo: "incierto"; error: NonNullable<ErrorEscritura>; token: string }
  | { tipo: "ocupado" }
  | { tipo: "congelado" };

export type ResultadoRevision = Resolucion | { tipo: "sin_respuesta"; error: ErrorEscritura };

export type { InstantaneaIntento };

export function useIntento(operacion: OperacionConMarca, inicial?: InstantaneaIntento | null) {
  const faseInicial: Fase = inicial?.incierto ? "incierto" : "libre";
  const [fase, setFaseEstado] = useState<Fase>(faseInicial);
  const faseRef = useRef<Fase>(faseInicial);
  const marca = useRef<Marca | null>(inicial?.marca ?? null);
  // El freno síncrono: una ráfaga de clics llega antes de que React pinte «Guardando…» y apague el botón.
  const enVuelo = useRef(false);

  const setFase = useCallback((f: Fase) => {
    faseRef.current = f;
    setFaseEstado(f);
  }, []);

  /** Le pregunta a la base qué pasó con un token. */
  const preguntar = useCallback(
    async (token: string): Promise<ResultadoRevision> => {
      try {
        const { data, error } = await createClient().rpc("fn_resolver_intento" as never, { p_operacion: operacion, p_token: token } as never);
        if (error) return { tipo: "sin_respuesta", error };
        return leerResolucion(data) ?? { tipo: "sin_respuesta", error: { message: "respuesta sin forma" } };
      } catch (ex) {
        return { tipo: "sin_respuesta", error: { message: ex instanceof Error ? ex.message : String(ex) } };
      }
    },
    [operacion],
  );

  const enviar = useCallback(
    async <T,>(huella: string, llamar: (token: string, senal: AbortSignal) => PromiseLike<RespuestaRpc<T>>): Promise<ResultadoIntento<T>> => {
      if (enVuelo.current) return { tipo: "ocupado" };
      const previa = faseRef.current;
      if (previa === "incierto" && marca.current && marca.current.huella !== huella) return { tipo: "congelado" };
      enVuelo.current = true;
      setFase("enviando");
      marca.current = marcaPara(marca.current, huella, () => crypto.randomUUID());
      const token = marca.current.token;
      // Sin respuesta en el tope, se corta: el error («aborted») deja el envío en duda, igual que un corte de red.
      const control = new AbortController();
      const tope = setTimeout(() => control.abort(), TOPE_ESPERA_MS);
      let respuesta: RespuestaRpc<T>;
      try {
        respuesta = await llamar(token, control.signal);
      } catch (ex) {
        respuesta = { data: null, error: { message: ex instanceof Error ? ex.message : String(ex) } };
      }
      clearTimeout(tope);
      enVuelo.current = false;
      const { data, error } = respuesta;
      if (!error) {
        marca.current = null;
        setFase("libre");
        return { tipo: "ok", data, token };
      }
      if (faseTrasError(error) === "incierto") {
        setFase("incierto");
        return { tipo: "incierto", error, token };
      }
      if (hayQueRevisar(previa, error)) {
        const res = await preguntar(token);
        if (res.tipo === "hecho") {
          marca.current = null;
          setFase("libre");
          return { tipo: "hecho", datos: res.datos, token };
        }
        if (res.tipo === "sin_respuesta") {
          setFase("incierto");
          return { tipo: "incierto", error, token };
        }
        // «No llegó»: la marca quedó descartada en la base; el próximo envío lleva una nueva.
        marca.current = null;
      }
      setFase("libre");
      return { tipo: "error", error, token };
    },
    [preguntar, setFase],
  );

  /** ¿Se guardó el envío que quedó en duda? `hecho` y `no_llego` sueltan el formulario; sin respuesta, sigue en duda. */
  const revisar = useCallback(async (): Promise<ResultadoRevision> => {
    const actual = marca.current;
    if (!actual) {
      setFase("libre");
      return { tipo: "no_llego" };
    }
    if (enVuelo.current) return { tipo: "sin_respuesta", error: { message: "hay un envío en curso" } };
    enVuelo.current = true;
    const res = await preguntar(actual.token);
    enVuelo.current = false;
    if (res.tipo !== "sin_respuesta") {
      marca.current = null;
      setFase("libre");
    }
    return res;
  }, [preguntar, setFase]);

  /** Olvida la marca y suelta el formulario (otro camino, como la cola sin conexión, se quedó con el envío). */
  const soltar = useCallback(() => {
    marca.current = null;
    setFase("libre");
  }, [setFase]);

  /** La marca vigente y si quedó en duda, para guardarla con el formulario. */
  const instantanea = useCallback(
    (): InstantaneaIntento | null => (marca.current ? { marca: marca.current, incierto: faseRef.current === "incierto" } : null),
    [],
  );

  return { fase, enviando: fase === "enviando", incierto: fase === "incierto", enviar, revisar, soltar, instantanea };
}

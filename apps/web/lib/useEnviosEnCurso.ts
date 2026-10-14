"use client";

/**
 * `useEnviosEnCurso`: al volver a una pantalla (o al volver la conexión), pregunta a la base por los envíos que quedaron en el aire en
 * una visita anterior y dice si se guardaron (NAV-03, ADR-0398 y ADR-0401). Lo usan Vender (el cobro en curso) y Nuevo traslado.
 *
 *   useEnviosEnCurso({ clave, operacion: "iniciar_traslado", guardados: trasladosGuardados, tokenPropio, avisoDe: avisoDeTraslado, alHecho })
 *
 * Solo pregunta por los envíos que salieron hace más del tope de espera (uno más nuevo puede seguir en camino desde otra pestaña, y
 * preguntarlo lo daría por no llegado). Si la pregunta falla (sin red, o la sesión todavía no está lista al montar la página, que
 * responde 401), vuelve a intentarlo a los pocos segundos: antes se quedaba esperando al evento `online`, que no llega si la red nunca
 * se cortó (/chaos de Inventario 2026-10-14).
 */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { guardar, leer } from "./almacen-local";
import { enviosPorResolver, leerResolucion, proximaRevision, sinEnvio, type EnvioEnCurso, type OperacionConMarca, type Resolucion } from "./intento-reglas";

export function useEnviosEnCurso<T extends EnvioEnCurso>({
  clave,
  operacion,
  guardados,
  tokenPropio,
  avisoDe,
  alHecho,
}: {
  clave: string;
  operacion: OperacionConMarca;
  guardados: (crudo: unknown) => T[];
  /** El envío en duda de ESTA pestaña: lo resuelve su propia pantalla, no este hook. */
  tokenPropio: () => string | undefined;
  avisoDe: (res: Resolucion, envio: T) => { tono: "exito" | "info"; titulo: string; detalle: string };
  alHecho?: () => void;
}) {
  useEffect(() => {
    let vivo = true;
    let espera: number | undefined;
    async function resolverPendientes() {
      window.clearTimeout(espera);
      const propio = tokenPropio();
      const ahora = Date.now();
      const pendientes = guardados(leer(clave, [])).filter((e) => e.token !== propio);
      const listos = enviosPorResolver(pendientes, ahora);
      let huboFallo = false;
      for (const e of listos) {
        let res = null;
        try {
          const { data, error } = await createClient()
            .rpc("fn_resolver_intento" as never, { p_operacion: operacion, p_token: e.token } as never)
            .setHeader("x-espera", "no");
          res = error ? null : leerResolucion(data);
        } catch {
          res = null;
        }
        if (!vivo) return;
        if (!res) {
          huboFallo = true;
          continue;
        }
        guardar(clave, sinEnvio(guardados(leer(clave, [])), e.token));
        const aviso = avisoDe(res, e);
        if (aviso.tono === "exito") {
          avisar.exito(aviso.titulo, { detalle: aviso.detalle, duracion: 9000 });
          alHecho?.();
        } else avisar.aviso(aviso.titulo, { detalle: aviso.detalle, duracion: 9000 });
      }
      const jovenes = pendientes.filter((e) => !listos.includes(e)).map((e) => e.enviadoEn);
      const proximo = vivo ? proximaRevision(jovenes, huboFallo, ahora) : null;
      if (proximo !== null) espera = window.setTimeout(() => void resolverPendientes(), proximo);
    }
    void resolverPendientes();
    const alVolver = () => void resolverPendientes();
    window.addEventListener("online", alVolver);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
      window.removeEventListener("online", alVolver);
    };
    // Una vez por clave (la sede): lo demás se lee al momento de preguntar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
}

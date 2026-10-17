"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { anotarEntrada } from "@/app/acciones/entrada";

/**
 * Anota la entrada de hoy de esta sesión (entrar a la web cuenta como actividad del Club). No dibuja nada: el marco de la página
 * (`EntradaDelDia`) lo pone solo cuando hoy todavía no se anotó, así que corre como mucho una vez al día por sesión. Si la cuenta se
 * cerró, el servidor ya cerró la sesión: se va a «Entrar», que lo explica.
 */
export function AnotarEntrada() {
  const router = useRouter();
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    anotarEntrada()
      .then((r) => {
        if (r === "cerrada") router.replace("/entrar?aviso=cuenta-cerrada");
      })
      // Sin respuesta no pasa nada: mañana (o en la próxima entrada) se vuelve a intentar.
      .catch(() => undefined);
  }, [router]);
  return null;
}

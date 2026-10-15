"use client";

import { useEffect } from "react";
import { sentryDelNavegador } from "@/lib/errores-navegador";

// Quién y dónde, para los avisos de error del navegador (ADR-0424): con esto, en Sentry se ve «le pasó a 3 cuentas, todas en Tienda
// Lima». Solo el id de la cuenta (un uuid, sin nombre ni correo), la sede y el rol; una terminal va como «terminal». Va una vez en el
// layout de la app. Espera a que Sentry se descargue; sin Sentry encendido no hace nada.
export function ContextoDeErrores({ cuenta, sede, rol }: { cuenta: string | null; sede: string; rol: string }) {
  useEffect(() => {
    void sentryDelNavegador().then((Sentry) => {
      Sentry?.setUser({ id: cuenta ?? "terminal" });
      Sentry?.setTag("sede", sede);
      Sentry?.setTag("rol", rol);
    });
  }, [cuenta, sede, rol]);
  return null;
}

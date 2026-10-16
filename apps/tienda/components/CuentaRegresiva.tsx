"use client";

import { useEffect, useState } from "react";
import { finDeCampana, partesCuenta } from "@/lib/portada";

const dos = (n: number) => String(n).padStart(2, "0");

/** Cuánto falta para que termine la campaña, segundo a segundo. La hora del servidor y la del celular difieren por un
 *  instante al cargar: por eso las cifras no avisan esa diferencia (`suppressHydrationWarning`). */
export function CuentaRegresiva({ hasta }: { hasta: string }) {
  const fin = finDeCampana(hasta);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  const r = partesCuenta(fin - ahora);
  const partes: [number, string][] = [[r.d, "días"], [r.h, "horas"], [r.m, "min"], [r.s, "seg"]];
  // Lo que oye el lector de pantalla: «en 6 días», «en 1 día» (no «1 días») y, el último día, «en menos de un día» (no «0 días»).
  const cuanto = r.d > 1 ? `en ${r.d} días` : r.d === 1 ? "en 1 día" : "en menos de un día";
  return (
    <div className="t-cuenta" role="timer" aria-label={`La campaña termina ${cuanto}`} suppressHydrationWarning>
      {partes.map(([valor, rotulo]) => (
        <span key={rotulo}>
          <b suppressHydrationWarning>{dos(valor)}</b>
          <small>{rotulo}</small>
        </span>
      ))}
    </div>
  );
}

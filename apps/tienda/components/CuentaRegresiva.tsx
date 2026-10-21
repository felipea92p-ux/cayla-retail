"use client";

import { finDeCampana, partesCuenta } from "@/lib/cuenta-regresiva";
import { useAhora } from "@/lib/useAhora";

const dos = (n: number) => String(n).padStart(2, "0");

/** Cuánto falta para que termine la campaña, segundo a segundo. La página se arma por adelantado y no sabe qué hora será al abrirla: las
 *  cifras salen como «––» y toman la hora del aparato en el primer instante (`useAhora`). */
export function CuentaRegresiva({ hasta, soloElUltimoDia = false }: { hasta: string; soloElUltimoDia?: boolean }) {
  const fin = finDeCampana(hasta);
  const ahora = useAhora();
  // «Solo el último día» (diseño de la campaña): hasta que no se sabe la hora del aparato no se muestra, y con más de un día por delante, tampoco.
  if (soloElUltimoDia && (ahora === null || fin - ahora >= 86_400_000)) return null;
  const r = partesCuenta(fin - (ahora ?? fin));
  const partes: [number, string][] = [[r.d, "días"], [r.h, "horas"], [r.m, "min"], [r.s, "seg"]];
  // Lo que oye el lector de pantalla: «en 6 días», «en 1 día» (no «1 días») y, el último día, «en menos de un día» (no «0 días»).
  const cuanto = ahora === null ? "pronto" : r.d > 1 ? `en ${r.d} días` : r.d === 1 ? "en 1 día" : "en menos de un día";
  return (
    <div className="t-cuenta" role="timer" aria-label={`La campaña termina ${cuanto}`}>
      {partes.map(([valor, rotulo]) => (
        <span key={rotulo}>
          <b>{ahora === null ? "––" : dos(valor)}</b>
          <small>{rotulo}</small>
        </span>
      ))}
    </div>
  );
}

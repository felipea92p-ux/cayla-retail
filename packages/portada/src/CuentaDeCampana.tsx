const dos = (n: number) => String(n).padStart(2, "0");

/**
 * Cuánto falta para que termine la campaña, en cuatro cajitas (días, horas, min, seg). Solo dibuja: la tienda le pasa la hora que corre
 * segundo a segundo (`CuentaRegresiva`) y la vista previa del ERP, la de ese momento. `partes` en `null`: todavía no se sabe la hora
 * (la página se armó por adelantado) y las cifras salen como «––».
 */
export function CuentaDeCampana({ partes }: { partes: { d: number; h: number; m: number; s: number } | null }) {
  const filas: [number, string][] = partes ? [[partes.d, "días"], [partes.h, "horas"], [partes.m, "min"], [partes.s, "seg"]] : [];
  // Lo que oye el lector de pantalla: «en 6 días», «en 1 día» (no «1 días») y, el último día, «en menos de un día» (no «0 días»).
  const cuanto = partes === null ? "pronto" : partes.d > 1 ? `en ${partes.d} días` : partes.d === 1 ? "en 1 día" : "en menos de un día";
  return (
    <div className="t-cuenta" role="timer" aria-label={`La campaña termina ${cuanto}`}>
      {(partes ? filas : ["días", "horas", "min", "seg"].map((r) => [0, r] as [number, string])).map(([valor, rotulo]) => (
        <span key={rotulo}>
          <b>{partes === null ? "––" : dos(valor)}</b>
          <small>{rotulo}</small>
        </span>
      ))}
    </div>
  );
}

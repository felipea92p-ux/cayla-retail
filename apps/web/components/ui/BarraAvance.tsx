/**
 * Barra fina de avance contra una meta (ADR-0286): lo vendido sobre lo que tocaba, con una marca opcional para «a hoy tocaba».
 * Sin JavaScript (sirve en Server Components): el ancho lo pone el estilo y `role="progressbar"` la lee un lector de pantalla.
 * Pasada de 100 % la barra se queda llena; el número de al lado es el que dice cuánto.
 */
export function BarraAvance({ pct, marca, className = "mt-2" }: { pct: number; marca?: number | null; className?: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} className={`relative h-1.5 rounded-full bg-sand ${className}`}>
      <div className="h-full rounded-full bg-tinta" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {marca !== null && marca !== undefined && (
        <span aria-hidden className="absolute -top-[3px] h-3 w-0.5 rounded bg-taupe" style={{ left: `${Math.min(100, Math.max(0, marca))}%` }} />
      )}
    </div>
  );
}

import { Check } from "lucide-react";

/** El título de un paso: número (✓ al completarlo), nombre, la palabra «Sigue» o «Elige uno» y su estado a la derecha. También lo usan
 *  la hoja del descuento (`PanelDescuento`) y la del apartado (`ApartarVista`): los pasos a paso de Vender se ven igual. */
export function CabezaPaso({
  numero,
  titulo,
  hecho,
  pista,
  pistaFuerte = true,
  estado,
}: {
  numero: number;
  titulo: string;
  hecho: boolean;
  pista: string | null;
  pistaFuerte?: boolean;
  estado: { ok: boolean; texto: string } | null;
}) {
  return (
    <div className="hoja-cobro-cabeza-paso flex items-center gap-2.5">
      <span
        className={`hoja-cobro-numero grid shrink-0 place-items-center rounded-full border-[1.5px] font-bold transition-colors ${
          hecho ? "border-verde bg-verde text-crema" : "border-tinta text-tinta"
        }`}
      >
        {hecho ? <Check /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : numero}
      </span>
      <h3 className="label-cayla whitespace-nowrap text-sm font-bold text-tinta">{/* unificar-fijo: la cabeza numerada de un paso del cobro, con su pista y su estado */}{titulo}</h3>
      {pista && (
        <span className={`hilo-etiqueta ${pistaFuerte ? "" : "!text-taupe"}`}>
          {pista}
        </span>
      )}
      {estado && (
        <span className={`ml-auto min-w-0 truncate text-sm font-semibold ${estado.ok ? "text-verde-profundo" : "text-ambar-profundo"}`}>
          {estado.texto}
          {estado.ok ? " ✓" : ""}
        </span>
      )}
    </div>
  );
}

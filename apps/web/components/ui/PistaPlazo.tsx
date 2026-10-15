import { BarraAvance } from "@/components/ui/BarraAvance";

/**
 * El plazo de pago real contra el pactado (ADR-0128): la barra de avance del sistema (ronda 13 de /unificar) con la rayita del plazo
 * pactado y el relleno hasta lo que de verdad se tarda en pagar — en tinta si se paga dentro del plazo, ámbar si se pasa.
 * Es decorativa (`aria-hidden`): el texto de la tarjeta ya dice «Pactado: N días» y la cifra es la real.
 */
export function PistaPlazo({ real, pactado }: { real: number; pactado: number }) {
  const tope = Math.max(pactado, real) * 1.4;
  const pasa = real > pactado;
  return (
    <span aria-hidden className="relative mb-4 mt-3 block">
      <BarraAvance pct={(real / tope) * 100} tono={pasa ? "ambar" : "tinta"} marca={(pactado / tope) * 100} decorativa indice={9} />
      <span className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-wide text-tinta/65" style={{ left: `${(pactado / tope) * 100}%` }}>
        pactado {pactado} d
      </span>
    </span>
  );
}

/**
 * El plazo de pago real contra el pactado (ADR-0128): una pista con la marca del plazo pactado y el
 * relleno hasta lo que de verdad se tarda en pagar — verde si se paga dentro del plazo, ámbar si se pasa.
 * Es decorativa (`aria-hidden`): el texto de la tarjeta ya dice «Pactado: N días» y la cifra es la real.
 */
export function PistaPlazo({ real, pactado }: { real: number; pactado: number }) {
  const tope = Math.max(pactado, real) * 1.4;
  const pasa = real > pactado;
  return (
    <span aria-hidden className="relative mb-4 mt-3 block h-1.5 rounded-full bg-sand">
      <span className={`anim-crece-x absolute inset-y-0 left-0 rounded-full ${pasa ? "bg-ambar" : "bg-verde"}`} style={{ width: `${Math.min(100, (real / tope) * 100)}%`, ["--i" as string]: 9 }} />
      <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-tinta" style={{ left: `${(pactado / tope) * 100}%` }} />
      <span className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-wide text-tinta/65" style={{ left: `${(pactado / tope) * 100}%` }}>
        pactado {pactado} d
      </span>
    </span>
  );
}

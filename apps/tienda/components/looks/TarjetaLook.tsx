import Link from "next/link";
import { hrefLook, precioDelLook, type Look } from "@/lib/looks";
import { Lamina } from "./Lamina";

/**
 * La tarjeta de un look en «Arma tu look» y en el Inicio (A · Muro, minimalista): la lámina y, debajo, su nombre a la izquierda y lo que
 * cuesta completo a la derecha (con el total sin campaña tachado, como una prenda): como la cédula de una obra. Sin «Look 1 · 4 prendas»,
 * sin frase ni «el look completo»: el nombre y el precio se entienden solos (la frase se lee dentro del look). Toda la tarjeta lleva al look.
 */
export function TarjetaLook({
  look,
  sede,
  origenFotos,
  pronto = false,
}: {
  look: Look;
  sede: string | null;
  origenFotos: string | undefined;
  /** Se ve sin bajar: sus fotos se piden apenas llega la página. */
  pronto?: boolean;
}) {
  const precio = precioDelLook(look);
  return (
    <Link className="t-look-card" href={hrefLook(look.id, sede)}>
      <Lamina look={look} sede={sede} origenFotos={origenFotos} enlaces={false} pronto={pronto} />
      <h3>{look.nombre}</h3>
      <span className={`t-precio t-look-card-precio${precio.oferta ? " oferta" : ""}`}>
        <b className="num">{precio.principal}</b>
        {precio.anterior && (
          <s className="num">
            <span className="t-sr">Antes </span>
            {precio.anterior}
          </s>
        )}
      </span>
    </Link>
  );
}

import Link from "next/link";
import { cejaDeLook, hrefLook, precioDelLook, type Look } from "@/lib/looks";
import { Lamina } from "./Lamina";

/**
 * La tarjeta de un look en «Arma tu look» y en el Inicio (maqueta v4, `vLooks`): la lámina, «Look 1 · 4 prendas», su nombre, su frase y,
 * en su propia línea, lo que cuesta completo (con el total sin campaña tachado, como una prenda). Antes el precio iba pegado a la frase,
 * en gris, y en el celular se partía («S/» al final de una línea y «243.10» en la siguiente). Toda la tarjeta lleva al look.
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
      <span className="t-ceja">{cejaDeLook(look)}</span>
      <h3>{look.nombre}</h3>
      {look.frase && <small>{look.frase}</small>}
      <span className={`t-precio t-look-card-precio${precio.oferta ? " oferta" : ""}`}>
        <b className="num">{precio.principal}</b>
        {precio.anterior && (
          <s className="num">
            <span className="t-sr">Antes </span>
            {precio.anterior}
          </s>
        )}
        <span className="t-look-card-todo">el look completo</span>
      </span>
    </Link>
  );
}

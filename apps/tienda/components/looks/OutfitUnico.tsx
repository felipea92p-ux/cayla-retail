import Link from "next/link";
import { hrefLook, precioDePieza, totalDelLook, type Look } from "@/lib/looks";
import { Lamina } from "./Lamina";

/**
 * «Arma tu outfit» del Inicio cuando hay un solo outfit publicado (auditoría 2026-11-06): una tarjeta sola, pensada para ir de a tres, dejaba
 * media pantalla vacía. Aquí la lámina va junto a lo que trae: sus prendas, lo que cuesta completo y el botón para verlo.
 */
export function OutfitUnico({ look, sede, origenFotos }: { look: Look; sede: string | null; origenFotos: string | undefined }) {
  const href = hrefLook(look.id, sede);
  const cuantas = look.piezas.length;
  return (
    <div className="t-outfit-unico" data-revela>
      <Link href={href} aria-label={`Ver el outfit ${look.nombre}`}>
        <Lamina look={look} sede={sede} origenFotos={origenFotos} enlaces={false} />
      </Link>
      <div className="t-outfit-unico-datos">
        <span className="t-ceja">{cuantas === 1 ? "Incluye 1 prenda" : `Incluye ${cuantas} prendas`}</span>
        <h3>{look.nombre}</h3>
        {look.frase && <p>{look.frase}</p>}
        <ul>
          {look.piezas.map((p) => {
            const precio = precioDePieza(p);
            return (
              <li key={p.posicion}>
                <span>
                  {p.prenda.nombre}
                  <small>{p.color.nombre}</small>
                </span>
                <span className={`t-precio${precio.oferta ? " oferta" : ""}`}>
                  <b className="num">{precio.principal}</b>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="t-look-total">
          <span>El outfit completo</span>
          <b className="num">{totalDelLook(look)}</b>
        </div>
        <Link className="t-btn" href={href}>
          Ver este outfit
        </Link>
      </div>
    </div>
  );
}

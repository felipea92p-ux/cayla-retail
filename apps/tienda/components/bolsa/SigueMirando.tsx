import Link from "next/link";
import type { Prenda } from "@/lib/catalogo";
import type { NotaStock } from "@/lib/stock";
import { CarrilConFlechas } from "../CarrilConFlechas";
import { Icono } from "../Icono";
import { TarjetaPrenda } from "../TarjetaPrenda";

/**
 * Un carril de prendas para seguir mirando donde la página se quedaría sin nada que ofrecer (2026-10-16): la bolsa vacía (sus favoritos
 * o Lo nuevo) y una lista del catálogo vacía (Lo nuevo). Las tarjetas de siempre, con su corazón, y «Ver todo» hacia la lista de donde
 * salen. `guardados`: fuera del marco del catálogo (la bolsa), el corazón no sabe solo si está guardado y se le dice.
 */
export function SigueMirando({
  id,
  ceja,
  titulo,
  frase,
  href,
  prendas,
  sede,
  origenFotos,
  nota,
  guardados,
}: {
  id: string;
  ceja: string;
  /** El título serif: lo segundo va en cursiva roja («Lo *nuevo*»). */
  titulo: [string, string];
  frase?: string;
  /** «Ver todo»: la lista de donde salen. */
  href: string;
  prendas: readonly Prenda[];
  sede: string | null;
  origenFotos: string | undefined;
  nota?: (p: Prenda) => NotaStock | null;
  guardados?: ReadonlySet<string>;
}) {
  if (prendas.length === 0) return null;
  return (
    <section className="t-sec cp-sigue" aria-labelledby={id}>
      <div className="t-sec-cab cp-sec-cab">
        <div>
          <span className="t-ceja">{ceja}</span>
          <h2 id={id}>
            {titulo[0]} <em>{titulo[1]}</em>
          </h2>
          {frase && <p>{frase}</p>}
        </div>
        {/* Con dos carriles en la misma página, el lector distingue cada «Ver todo» por su título. */}
        <Link className="t-ver" href={href} aria-label={`Ver todo: ${titulo.join(" ")}`}>
          Ver todo <Icono nombre="flecha" />
        </Link>
      </div>
      <CarrilConFlechas className="cp-carril">
        <div className="t-carril">
          {prendas.map((p) => (
            <TarjetaPrenda
              key={p.id}
              prenda={p}
              sede={sede}
              origenFotos={origenFotos}
              nota={nota ? nota(p) : null}
              guardado={guardados ? guardados.has(p.id) : undefined}
            />
          ))}
        </div>
      </CarrilConFlechas>
    </section>
  );
}

import { Fragment, type CSSProperties } from "react";
import { letrasDelTitulo } from "@/lib/desfile";

/**
 * El título grande de una página («Ropa», «Tu bolsa»…), que sube letra a letra al llegar (la maqueta de la Pasarela, `p-letras`). Promete que el lector
 * oye el título entero (`aria-label`; las letras sueltas van ocultas) y que ninguna palabra se parte a media letra. Asume que va dentro de un `h1` que
 * pone `.t-lista-cab`; sin movimiento, o en el esqueleto (que dibuja su propio `TituloQuieto`), se ve ya escrito. Es de servidor: son `span` con un número.
 */
export function TituloConLetras({ primera, cursiva }: { primera?: string; cursiva: string }) {
  const entero = primera ? `${primera} ${cursiva}` : cursiva;
  const palabras = letrasDelTitulo(entero);
  // Las primeras palabras son la parte normal; el resto, la cursiva (`em`), con el mismo estilo que tenía el título.
  const enNormal = primera ? primera.split(" ").filter(Boolean).length : 0;
  const dibujar = (desde: number, hasta: number) =>
    palabras.slice(desde, hasta).map((p, k) => (
      // El espacio va FUERA de la palabra: dentro de un `inline-block` el espacio final se come y las palabras quedaban pegadas («TODALATIENDA»).
      <Fragment key={desde + k}>
        <span className="t-palabra" aria-hidden="true">
          {p.letras.map((l) => (
            <span key={l.n} className="t-letra" style={{ "--l": l.n } as CSSProperties}>
              {l.c}
            </span>
          ))}
        </span>
        {desde + k < palabras.length - 1 ? " " : ""}
      </Fragment>
    ));
  return (
    <h1 className="t-titulo-letras" aria-label={entero}>
      {dibujar(0, enNormal)}
      <em>{dibujar(enNormal, palabras.length)}</em>
    </h1>
  );
}

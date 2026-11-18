import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { formaDe, fotoOptimizable } from "@/lib/catalogo";
import { hrefDePieza, type Look, type PiezaLook } from "@/lib/looks";
import { urlDeRecorte } from "@/lib/recorte";
import { FotoTarjeta } from "../FotoTarjeta";
import { RecorteDeLaLamina } from "./RecorteDeLaLamina";

/**
 * La lámina de un look (maqueta v4, `lamina`): sus prendas sobre el estudio, cada una en su lugar y con su giro (los de la base, que salen
 * de la maqueta según cuántas son), con su número. Cada prenda se ve con la foto de su color o, si no tiene, con la principal; sin foto,
 * con su silueta en su color. `enlaces`: en el look abierto, cada prenda lleva a su ficha (fuera del Tab: la lista de al lado repite el
 * enlace); en la tarjeta de la lista, que ya es un enlace, no. `pronto`: la lámina se ve sin bajar (el primer look de la lista, el look
 * abierto): sus fotos se piden apenas llega la página.
 */
export function Lamina({
  look,
  sede,
  origenFotos,
  enlaces,
  pronto = false,
}: {
  look: Look;
  sede: string | null;
  origenFotos: string | undefined;
  enlaces: boolean;
  pronto?: boolean;
}) {
  return (
    <div className="t-lamina">
      {look.piezas.map((p, i) => (
        <Fragment key={p.posicion}>
          {enlaces ? (
            <Link className="t-pieza" href={hrefDePieza(p, sede)} style={estiloDe(p, i)} tabIndex={-1} aria-hidden="true">
              <FotoDeLaLamina pieza={p} origenFotos={origenFotos} pronto={pronto} />
            </Link>
          ) : (
            <span className="t-pieza" style={estiloDe(p, i)} aria-hidden="true">
              <FotoDeLaLamina pieza={p} origenFotos={origenFotos} pronto={pronto} />
            </span>
          )}
          <span className="t-punto" style={{ left: `${Math.min(94, p.x + p.ancho * 0.86)}%`, top: `${p.y + 7}%` }} aria-hidden="true">
            {p.posicion}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

const estiloDe = (p: PiezaLook, i: number) =>
  ({ "--x": `${p.x}%`, "--y": `${p.y}%`, "--w": `${p.ancho}%`, "--r": `${p.giro}deg`, "--i": i }) as CSSProperties;

/** En la lámina, la prenda recortada (sin su fondo de estudio, que sobre el rosa se ve como un recuadro); si no hay recorte, su foto. */
function FotoDeLaLamina({ pieza: p, origenFotos, pronto }: { pieza: PiezaLook; origenFotos: string | undefined; pronto: boolean }) {
  const foto = <Foto pieza={p} origenFotos={origenFotos} pronto={pronto} />;
  const recorte = p.foto ? urlDeRecorte(p.foto, 640) : null;
  if (!recorte) return foto;
  return (
    <RecorteDeLaLamina src={recorte} nombre={`${p.prenda.nombre}, ${p.color.nombre}`} pronto={pronto}>
      {foto}
    </RecorteDeLaLamina>
  );
}

/** La foto de una prenda del look (la de su color, o la principal) o su silueta en su color. */
export function Foto({ pieza: p, origenFotos, pronto = false }: { pieza: PiezaLook; origenFotos: string | undefined; pronto?: boolean }) {
  return (
    <FotoTarjeta
      foto={p.foto}
      segunda={null}
      optimizar={[p.foto ? fotoOptimizable(p.foto, origenFotos) : false, false]}
      nombre={`${p.prenda.nombre}, ${p.color.nombre}`}
      forma={formaDe(p.prenda.categoria?.prefijo)}
      color={p.color.hex}
      pronto={pronto}
    />
  );
}

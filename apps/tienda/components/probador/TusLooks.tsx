import Link from "next/link";
import { soles } from "@/lib/catalogo";
import { hrefDelGuardado, lookDelGuardado, type LookGuardado } from "@/lib/looks-guardados";
import { hrefDelProbador, indizar, presentes, totales, type PrendaDelProbador } from "@/lib/probador";
import { FiguraQuieta } from "./FiguraQuieta";

/**
 * «Tus looks» en Favoritos (ADR-0434, actividad 8): los looks que el cliente guardó desde «Arma el tuyo», lo último primero, cada uno con
 * su figura quieta, su nombre y lo que cuesta hoy; al tocarlo se abre como los looks de CAYLA. En el celular, un carril que se desliza;
 * en la computadora, de a cuatro. Sin looks guardados no se dibuja.
 */
export function TusLooks({ looks, prendas, sede }: { looks: readonly LookGuardado[]; prendas: readonly PrendaDelProbador[]; sede: string | null }) {
  if (looks.length === 0) return null;
  const indice = indizar(prendas);
  return (
    <section className="lg-lista" aria-labelledby="tus-looks">
      <div className="lg-lista-cab">
        <h2 id="tus-looks">Tus looks</h2>
        <Link className="t-enlace" href={hrefDelProbador(sede)}>
          Arma otro
        </Link>
      </div>
      <div className="lg-carril">
        {looks.map((g) => {
          const { look } = lookDelGuardado(g, prendas);
          const cuantas = presentes(look).length;
          const total = totales(look, indice);
          return (
            <Link key={g.id} className="lg-tarjeta" href={hrefDelGuardado(g.id, sede)}>
              <div className="lg-tarjeta-figura">
                <FiguraQuieta look={look} indice={indice} ancho={240} />
              </div>
              <b>{g.nombre}</b>
              <span>
                {cuantas === 0
                  ? "Sus prendas ya no están"
                  : `${cuantas} ${cuantas === 1 ? "prenda" : "prendas"} · ${total.desde ? "desde " : ""}${soles(total.final)}`}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

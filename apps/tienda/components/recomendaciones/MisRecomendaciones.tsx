import Link from "next/link";
import { fechaCorta, nombreTienda } from "@/lib/pedidos";
import { INSIGNIA, type MiRecomendacion } from "@/lib/recomendaciones";
import type { LecturaMisRecomendaciones } from "@/lib/recomendaciones-servidor";
import { Icono } from "../Icono";
import "@/app/estilos/bolsa.css";

/** Una de las suyas: sobre qué y cuándo, en qué está para CAYLA, lo que escribió y, si CAYLA le respondió, la respuesta. */
function Recomendacion({ r }: { r: MiRecomendacion }) {
  const insignia = INSIGNIA[r.estado];
  return (
    <li className="r-item">
      <div className="r-item-cab">
        <span>
          <b>{r.sobre ? nombreTienda(r.sobre) : "CAYLA en general"}</b> · {fechaCorta(r.creadaEn)}
        </span>
        <span className={`w-estado-chip t-${insignia.tono}`}>{insignia.texto}</span>
      </div>
      <p className="r-texto">{r.texto}</p>
      {r.respuesta && (
        <div className="r-respuesta">
          <span className="r-respuesta-t">
            <Icono nombre="chat" />
            CAYLA te respondió{r.respondidaEn ? ` · ${fechaCorta(r.respondidaEn)}` : ""}
          </span>
          <p>{r.respuesta}</p>
        </div>
      )}
    </li>
  );
}

/**
 * «Lo que nos escribiste»: sus recomendaciones, la más nueva primero, con la respuesta de CAYLA cuando la hay. Solo las de esta cuenta
 * (lo decide la base, `retail.tienda_mis_recomendaciones`). Sin ninguna, lo dice; si la base no contestó, lo dice y se puede volver a
 * intentar.
 */
export function MisRecomendaciones({ lectura }: { lectura: LecturaMisRecomendaciones }) {
  return (
    <section className="c-bloque r-mias" aria-labelledby="recomendaciones-mias">
      <h2 className="c-bloque-t" id="recomendaciones-mias">
        Lo que nos escribiste
      </h2>
      {lectura.estado !== "ok" ? (
        <div role="status">
          <p className="w-texto-sec">No pudimos cargar tus recomendaciones ahora. Vuelve a intentarlo en unos minutos.</p>
          <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/recomendaciones">
            Volver a intentar
          </Link>
        </div>
      ) : lectura.mias.recomendaciones.length === 0 ? (
        <p className="w-texto-sec">Todavía no nos escribiste. Lo que nos cuentes aparece aquí, con nuestra respuesta.</p>
      ) : (
        <ul className="r-lista">
          {lectura.mias.recomendaciones.map((r) => (
            <Recomendacion key={r.id} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

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
 * (lo decide la base, `retail.tienda_mis_recomendaciones`). Sin ninguna, lo dice y cuenta qué pasa con lo que escriba (con su nombre, lo
 * lee el equipo y, si hace falta, le responde aquí: lo mismo que dice el «¡Gracias!»); si la base no contestó, lo dice y se puede volver
 * a intentar. Revisión «a nivel mundial» (2026-10-16): un panel en hueso al lado del formulario, con cuántas lleva junto al título.
 */
export function MisRecomendaciones({ lectura }: { lectura: LecturaMisRecomendaciones }) {
  const cuantas = lectura.estado === "ok" ? lectura.mias.recomendaciones.length : 0;
  return (
    <section className="c-bloque r-mias ay-reco-panel" aria-labelledby="recomendaciones-mias">
      <div className="ay-reco-cab">
        <h2 className="c-bloque-t" id="recomendaciones-mias">
          Lo que nos escribiste
        </h2>
        {cuantas > 0 && (
          <span className="ay-reco-cuantas">
            {cuantas}
            <span className="t-sr">{cuantas === 1 ? " recomendación" : " recomendaciones"}</span>
          </span>
        )}
      </div>
      {lectura.estado !== "ok" ? (
        <div role="status">
          <p className="w-texto-sec">No pudimos cargar tus recomendaciones ahora. Vuelve a intentarlo en unos minutos.</p>
          <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/recomendaciones">
            Volver a intentar
          </Link>
        </div>
      ) : cuantas === 0 ? (
        <div className="ay-reco-vacio">
          <span className="ay-reco-vacio-ic" aria-hidden="true">
            <Icono nombre="chat" />
          </span>
          <p className="ay-reco-vacio-t">Todavía no nos escribiste</p>
          <p className="w-texto-sec">Lo que nos cuentes aparece aquí, con nuestra respuesta.</p>
          <ol className="ay-reco-pasos" aria-label="Qué pasa con lo que nos escribes">
            <li>
              <b>Nos escribes</b>
              <span>Con tu nombre, sobre una tienda o sobre CAYLA en general.</span>
            </li>
            <li>
              <b>Lo lee el equipo de CAYLA</b>
              <span>Aquí ves si ya la recibimos y si ya la leímos.</span>
            </li>
            <li>
              <b>Si hace falta, te respondemos aquí</b>
              <span>La respuesta queda debajo de lo que escribiste.</span>
            </li>
          </ol>
        </div>
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

import type { CSSProperties } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import {
  miles,
  personas,
  quienesEntran,
  tallaFalta,
  tallasQueFaltan,
  type QuienesTrafico,
  type TallasTrafico as Tallas,
} from "@/lib/trafico-reglas";

/**
 * «Tallas que piden y no hay» y «Quién entra» (actividad 7; maqueta `docs/maquetas/trafico-decisiones-2026-10/`). Por categoría, cada
 * talla que ofrecen sus prendas publicadas: cuántas personas la eligieron (el número grande y la barra) y cuántas unidades libres quedan
 * en las tiendas. En ámbar, la que piden mucho y casi no queda: gente que quería esa talla y se fue sin ella. Abajo, cuántos entran por
 * primera vez contra los que ya habían venido, y cuántos de cada grupo separan.
 */
export function TallasTrafico({ tallas, quienes, ampliado }: { tallas: Tallas; quienes: QuienesTrafico | null; ampliado: boolean }) {
  const max = Math.max(0, ...tallas.filas.flatMap((f) => f.tallas.map((t) => t.piden)));
  const faltan = tallasQueFaltan(tallas.filas);
  const top = faltan[0];
  const q = quienes ? quienesEntran(quienes) : null;

  return (
    <section className="anim-sube min-w-0" style={{ "--i": 10 } as CSSProperties} aria-labelledby="trafico-tallas" data-guia="trafico.tallas">
      <TituloSeccion id="trafico-tallas" dato={`Por categoría · ${ampliado ? "4 semanas" : "estos días"}`}>
        Tallas que piden y no hay
      </TituloSeccion>
      <div className="trafico-tallas-tarjeta card-cayla mt-2 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {faltan.length > 0 ? <Chip tono="ambar">Falta stock</Chip> : max > 0 ? <Chip tono="verde">Hay stock</Chip> : null}
          <p className="min-w-0 flex-1 basis-[16rem] text-[14px] text-tinta/70">
            {top ? (
              <>
                En <b className="font-semibold text-tinta">{faltan.length === 1 ? "1 talla" : `${faltan.length} tallas`}</b> piden mucho y casi no queda:{" "}
                <b className="font-semibold text-tinta">{faltan.slice(0, 3).map((t) => `${t.talla} de ${t.categoria}`).join(", ")}</b>.
                {top.sin > 0 && ` En ${top.categoria}, la ${top.talla} ya no la tienen ${top.sin} de ${top.modelos} modelos.`}
              </>
            ) : max > 0 ? (
              "Las tallas que más piden tienen stock."
            ) : (
              "Todavía nadie eligió una talla en estos días."
            )}
          </p>
        </div>
        <ul className="mt-3 grid gap-2.5">
          {tallas.filas.map((f) => (
            <li key={f.categoria} className="trafico-tallas-fila">
              <span className="min-w-0">
                <b className="block truncate text-[13px] font-semibold">{f.categoria}</b>
                <small className="text-[11.5px] text-tinta/70">{f.modelos === 1 ? "1 modelo" : `${f.modelos} modelos`}</small>
              </span>
              <span className="trafico-tallas-celdas">
                {f.tallas.map((t) => {
                  const falta = tallaFalta(t, max);
                  return (
                    <span
                      key={t.talla}
                      className="trafico-talla-celda"
                      data-falta={falta || undefined}
                      title={`${f.categoria}, talla ${t.talla}: ${personas(t.piden)} la eligieron · quedan ${miles(t.quedan)} unidades${t.sin ? ` · ${t.sin} de ${f.modelos} modelos ya no la tienen` : ""}`}
                    >
                      <i aria-hidden style={{ height: `${max > 0 ? Math.max(6, Math.round((t.piden / max) * 100)) : 0}%` }} />
                      <span className="trafico-talla-nombre">{t.talla}</span>
                      <b>{miles(t.piden)}</b>
                      <small>{miles(t.quedan)} u.</small>
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-tinta/70">
          <span>Número grande: personas que eligieron esa talla · u.: unidades que quedan</span>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="trafico-talla-muestra" />
            Mucha demanda y menos de 1 unidad por cada 10 personas
          </span>
        </p>
        {q && quienes && (
          <div className="mt-4 border-t border-sand pt-3.5" data-guia="trafico.quienes">
            <TituloGrupo>Quién entra</TituloGrupo>
            <BarraApilada
              className="mt-2.5"
              alto={12}
              unidad="personas"
              segmentos={[
                { clave: "nuevos", nombre: "Entran por primera vez", valor: quienes.nuevos, clase: "bg-tinta" },
                { clave: "vuelven", nombre: "Ya habían venido", valor: quienes.vuelven, clase: "bg-verde" },
              ]}
            />
            <ul className="mt-2.5 grid gap-1.5 text-[13px]">
              <li className="flex items-start gap-2">
                <MuestraTramo clase="bg-tinta" className="mt-1 shrink-0" />
                <span>
                  <b className="font-semibold">{q.nuevos} de cada 100</b> entran por primera vez{" "}
                  <small className="text-[12px] text-tinta/70">({q.nuevosSeparan} de cada 100 separan)</small>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <MuestraTramo clase="bg-verde" className="mt-1 shrink-0" />
                <span>
                  <b className="font-semibold">{q.vuelven} de cada 100</b> ya habían venido{" "}
                  <small className="text-[12px] text-tinta/70">({q.vuelvenSeparan} de cada 100 separan)</small>
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { atoraContraCostumbre, dondeSeAtora, explicaAtora, fraseAtora, miles, PASOS, puntosDelPaso, type ResumenTrafico } from "@/lib/trafico-reglas";
import { PorQue } from "./PorQue";

const CIEN = Array.from({ length: 100 }, (_, j) => j);

/**
 * «Hasta dónde llega la gente» (actividad 3; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): los seis pasos —entraron, vieron una
 * prenda, eligieron talla, a la bolsa, separaron, recogieron— como 100 puntos cada uno, de los que se encienden los que llegaron hasta ahí
 * de cada 100 que entraron. Ver antes que leer: lo que se apaga de un paso a otro es la gente que se fue. El paso donde más gente se pierde
 * se marca en ámbar solo si va peor que de costumbre; si no, la frase lo dice sin alarma. Lo difícil, bajo «¿Por qué?».
 */
export function RecorridoTrafico({ r }: { r: ResumenTrafico }) {
  const atora = dondeSeAtora(r.pasos, r.base);
  const vs = atora ? atoraContraCostumbre(atora, r.base) : null;
  const fuga = atora && vs?.peor ? atora.i : null;
  const chip = !atora || !vs ? null : vs.peor ? (
    <Chip tono="ambar">Aquí se atora</Chip>
  ) : atora.pocas ? (
    <Chip tono="neutro">Pocas personas</Chip>
  ) : vs.costumbre !== null ? (
    <Chip tono="verde">Como de costumbre</Chip>
  ) : null;

  return (
    <section className="trafico-recorrido anim-sube card-cayla px-5 py-4" style={{ "--i": 2 } as CSSProperties} aria-labelledby="trafico-recorrido" data-guia="trafico.recorrido">
      <TituloSeccion id="trafico-recorrido" dato="Cada punto es una persona">
        Hasta dónde llega la gente
      </TituloSeccion>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-guia="trafico.veredicto">
        {chip}
        <p className="min-w-0 flex-1 basis-[18rem] text-[14.5px] text-tinta/70">
          {!atora || !vs ? (
            "Todavía no entró nadie en estos días."
          ) : !atora.llegaron ? (
            <>
              <b className="font-semibold text-tinta">{fraseAtora(atora).titular}:</b> {fraseAtora(atora).frase}
            </>
          ) : (
            <>
              {vs.peor ? "Se pierde más gente " : "Donde más gente se pierde es "}
              <b className="font-semibold text-tinta">{PASOS[atora.i].donde}</b>: de cada 100 que {PASOS[atora.i - 1].frase},{" "}
              {vs.peor ? "solo " : "siguen "}
              <b className="font-semibold text-tinta">{vs.siguen}</b>
              {vs.peor ? " siguen" : ""}.{vs.costumbre !== null && ` De costumbre, ${vs.costumbre}.`}
            </>
          )}
          {atora && <PorQue guia="trafico.porque">{explicaAtora(atora)}</PorQue>}
        </p>
      </div>
      <ol className="trafico-pasos">
        {PASOS.map((paso, i) => {
          const encendidos = puntosDelPaso(r.pasos, i);
          const esFuga = fuga === i;
          return (
            <li key={paso.nombre} className="trafico-paso" data-fuga={esFuga || undefined} style={{ "--k": i } as CSSProperties}>
              {esFuga && (
                <span className="trafico-paso-globo">
                  <Chip tono="ambar" versalitas={false}>
                    Aquí se pierde más gente
                  </Chip>
                </span>
              )}
              <span className="trafico-puntos" role="img" aria-label={`${encendidos} de cada 100 que entraron`}>
                {CIEN.map((j) => (
                  <i key={j} className={j < encendidos ? "trafico-punto-on" : undefined} style={j < encendidos ? ({ "--d": j } as CSSProperties) : undefined} />
                ))}
              </span>
              <b className="mt-1.5 font-display text-[32px] leading-none tabular-nums">{miles(r.pasos[i])}</b>
              <span className="text-[14px] font-semibold">{paso.nombre}</span>
              <span className="text-[12.5px] text-tinta/70">{encendidos} de cada 100</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

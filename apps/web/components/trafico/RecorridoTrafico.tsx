import { BarraAvance } from "@/components/ui/BarraAvance";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { de100, dondeSeAtora, explicaAtora, fraseAtora, miles, PASOS, type ResumenTrafico } from "@/lib/trafico-reglas";
import { PorQue } from "./PorQue";

/**
 * La tira del recorrido de Tráfico (ADR-0495; maqueta C «La vitrina»): los seis pasos —entraron, vieron una prenda, eligieron talla, a la
 * bolsa, separaron, recogieron— con cuántas personas llegaron a cada uno y «de cada 100» que entraron, y el veredicto de dónde se atora
 * (el único rojo de la pantalla, además del lateral). Lo difícil, bajo «¿Por qué?».
 */
export function RecorridoTrafico({ r }: { r: ResumenTrafico }) {
  const total = r.pasos[0];
  const atora = dondeSeAtora(r.pasos, r.base);
  const dicho = atora ? fraseAtora(atora) : null;
  return (
    <section className="card-cayla px-5 py-4" aria-labelledby="trafico-recorrido" data-guia="trafico.recorrido">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <TituloSeccion id="trafico-recorrido">El recorrido</TituloSeccion>
        {dicho && atora && (
          <p className="text-[13.5px] text-tinta/70" data-guia="trafico.veredicto">
            <b className="font-semibold text-tinta">{dicho.titular}:</b> {dicho.frase}
            <PorQue guia="trafico.porque">{explicaAtora(atora)}</PorQue>
          </p>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-6 xl:gap-x-0">
        {PASOS.map((paso, i) => {
          const n = r.pasos[i];
          const pct = i === 0 ? 100 : de100(n, total);
          return (
            <li key={paso.nombre} className="flex min-w-0 flex-col gap-1 xl:border-l xl:border-sand xl:px-3.5 xl:first:border-l-0 xl:first:pl-0">
              <span className="label-cayla text-[11px] leading-tight text-taupe-profundo">{paso.nombre}</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <b className="font-display text-2xl leading-tight">{miles(n)}</b>
                <span className="text-[12.5px] text-tinta/70">{i === 0 ? (n === 1 ? "persona" : "personas") : `${pct} de cada 100`}</span>
              </span>
              <BarraAvance pct={pct} alto="fina" tono="tinta" decorativa indice={i} className="mt-1" />
              {atora?.i === i && <span className="label-cayla text-[11px] font-bold text-rojo">Aquí se atora</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

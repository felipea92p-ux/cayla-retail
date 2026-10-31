import type { CSSProperties } from "react";
import { DoorOpen, Eye, Ruler, ShoppingBag, Store, Tag } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { atoraContraCostumbre, costumbreEnPersonas, dondeSeAtora, explicaAtora, fraseAtora, miles, PASOS, type ResumenTrafico } from "@/lib/trafico-reglas";
import { PorQue } from "./PorQue";

/** El ícono de cada estación, en el orden de `PASOS`: la puerta, mirar, la talla, la bolsa, separar y la tienda donde se recoge. */
const ICONOS = [DoorOpen, Eye, Ruler, ShoppingBag, Tag, Store] as const;

/**
 * «Hasta dónde llega la gente» (actividad 3), como la línea de la tienda: Felipe eligió «F» en la maqueta
 * `docs/maquetas/trafico-recorrido-2026-10/` (2026-10-30), en vez de los 100 puntos por paso. Cada paso —entraron, vieron una prenda,
 * eligieron talla, a la bolsa, separaron, recogieron— es una estación con su ícono y cuántas personas llegaron; entre una y otra, cuántas
 * se fueron y sin hacer qué. Se cuentan personas de verdad, nunca «de cada 100» (con 127 visitas, «1 de cada 100» era 1 persona). La
 * estación donde se atora va en ámbar (siempre, también con pocas personas: entonces la frase dice que es una pista) y la última en verde
 * si alguien llegó. Lo difícil, bajo «¿Por qué?». **Que se note dónde se pierde la gente (Felipe, 2026-10-31, «B · Zona marcada» de
 * `docs/maquetas/trafico-perdida-2026-10/`):** la línea no cambia de forma, pero el tramo donde se atora se marca con un recuadro ámbar
 * suave con su rótulo, el riel de ese tramo se engruesa, el círculo se llena y el «42 se fueron…» sube de tamaño.
 */
export function RecorridoTrafico({ r }: { r: ResumenTrafico }) {
  const atora = dondeSeAtora(r.pasos, r.base);
  const vs = atora ? atoraContraCostumbre(atora, r.base) : null;
  const deCostumbre = atora ? costumbreEnPersonas(atora, r.base) : null;
  const chip = !atora || !vs ? null : vs.peor ? (
    <Chip tono="ambar">Aquí se atora</Chip>
  ) : !atora.pocas && vs.costumbre !== null ? (
    <Chip tono="verde">Como de costumbre</Chip>
  ) : null;

  return (
    <section className="trafico-recorrido anim-sube card-cayla px-5 py-4" style={{ "--i": 2 } as CSSProperties} aria-labelledby="trafico-recorrido" data-guia="trafico.recorrido">
      <TituloSeccion id="trafico-recorrido" dato="De la puerta a recoger en la tienda">
        Hasta dónde llega la gente
      </TituloSeccion>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-guia="trafico.veredicto">
        {chip}
        <p className="min-w-0 flex-1 basis-[18rem] text-[14.5px] text-tinta/70">
          {!atora ? (
            "Todavía no entró nadie en estos días."
          ) : !atora.llegaron ? (
            <>
              <b className="font-semibold text-tinta">{fraseAtora(atora).titular}:</b> {fraseAtora(atora).frase}
            </>
          ) : (
            <>
              Donde más se atora es <b className="font-semibold text-tinta">{PASOS[atora.i].donde}</b>: de{" "}
              <b className="font-semibold text-tinta">{miles(atora.llegaron)}</b> que {atora.llegaron === 1 ? PASOS[atora.i - 1].fraseUna : PASOS[atora.i - 1].frase},{" "}
              {atora.siguieron * 2 < atora.llegaron ? "solo " : ""}
              <b className="font-semibold text-tinta">{miles(atora.siguieron)}</b> {atora.siguieron === 1 ? PASOS[atora.i].fraseUna : PASOS[atora.i].frase}.
              {deCostumbre !== null && ` De costumbre, ${deCostumbre === 1 ? "sería 1" : `serían unos ${miles(deCostumbre)}`}.`}
            </>
          )}
          {atora?.pocas && " Son pocas personas: tómalo como una pista."}
          {atora && <PorQue guia="trafico.porque">{explicaAtora(atora)}</PorQue>}
        </p>
      </div>
      <ol className="trafico-linea" data-zona={atora ? "" : undefined}>
        {PASOS.map((paso, i) => {
          const Icono = ICONOS[i]!;
          const seFueron = i < PASOS.length - 1 ? r.pasos[i] - r.pasos[i + 1] : null;
          const haciaAtora = atora?.i === i + 1;
          return (
            <li
              key={paso.nombre}
              className="trafico-estacion"
              data-atora={atora?.i === i || undefined}
              data-hacia-atora={haciaAtora || undefined}
              data-fin={(i === PASOS.length - 1 && r.pasos[i] > 0) || undefined}
              style={{ "--k": i } as CSSProperties}
            >
              {haciaAtora && (
                <span className="trafico-zona-rotulo" aria-hidden>
                  {vs?.peor ? "Aquí se atora" : atora?.pocas ? "Una pista" : "Como de costumbre"}
                </span>
              )}
              <span className="trafico-estacion-nombre">{paso.nombre}</span>
              <b className="trafico-estacion-cifra">{miles(r.pasos[i])}</b>
              <span className="trafico-estacion-nodo" aria-hidden>
                <Icono className="h-5 w-5" />
              </span>
              {seFueron !== null && (
                <span className="trafico-salida" data-atora={atora?.i === i + 1 || undefined}>
                  {seFueron > 0 ? (
                    <span>
                      <b>{miles(seFueron)}</b> {seFueron === 1 ? "se fue" : "se fueron"} {PASOS[i + 1].seFueron}
                    </span>
                  ) : r.pasos[i] > 0 ? (
                    <span>Nadie se fue aquí</span>
                  ) : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

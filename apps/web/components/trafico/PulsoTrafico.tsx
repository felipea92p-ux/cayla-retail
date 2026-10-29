"use client";

import { useState, type CSSProperties } from "react";
import { Check, Equal, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Linea } from "@/components/ui/Linea";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Sparkline } from "@/components/ui/Sparkline";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import {
  CAMINOS,
  METRICAS,
  PASOS,
  cambio,
  cambioDe,
  cifraTexto,
  de100,
  dondeSeAtora,
  filasDelGlobito,
  graficoDe,
  horaRedonda,
  lider,
  marcasDelTiempo,
  miles,
  picoDeHoras,
  totalDe,
  tramoTexto,
  valoresDe,
  veredictoDe,
  type ClavePeriodo,
  type MetricaTrafico,
  type ResumenTrafico,
} from "@/lib/trafico-reglas";

/**
 * El pulso de Tráfico («Observatorio», actividad 2; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): cinco cifras que eligen el
 * gráfico principal (patrón de Plausible: la cifra puesta es la que se dibuja), la línea de estos días contra los de antes (Hoy, por hora
 * contra ayer; varios días, día por día) y, al costado, la respuesta en una frase con cuatro datos. Acumulado, la línea de Hoy sigue
 * punteada hasta el cierre esperado. La cifra y la forma elegidas viven en la pantalla, no en la dirección: no cambian lo que se lee.
 * Todo en UNA tarjeta, como la maqueta: la franja de cifras arriba (una pestaña por cifra, la elegida con su raya), el gráfico con su leyenda
 * junto al título y la lectura al costado. Las cifras no son `TarjetaCifra` sueltas porque Felipe pidió verlo igual a la maqueta
 * (2026-10-29, ADR-0568).
 */
export function PulsoTrafico({
  r,
  periodo,
  hastaX,
}: {
  r: ResumenTrafico;
  periodo: { clave: ClavePeriodo; nombre: string; antes: string; desde: string };
  /** Hasta dónde llega lo de hoy: en Hoy, la hora de Lima de ahora; en varios días que terminan hoy, el número del día de hoy. */
  hastaX: number | null;
}) {
  const [metrica, setMetrica] = useState<MetricaTrafico>("entraron");
  const [acumulado, setAcumulado] = useState(false);
  const porHora = r.serie.por === "hora";
  const largo = porHora ? 24 : Math.max(1, ...r.serie.actual.map((f) => f[0] + 1), diasDelRango(r.desde, r.hasta));
  const largoAntes = porHora ? 24 : diasDelRango(r.anteriorDesde, r.anteriorHasta);
  const acum = acumulado && metrica !== "de100";
  const g = graficoDe(r.serie, metrica, { largo, largoAntes, hastaX, acumulado: acum });
  const m = METRICAS.find((x) => x.clave === metrica)!;
  const hoy = periodo.clave === "hoy";
  const nombreAntes = hoy ? "Ayer" : periodo.antes.charAt(0).toUpperCase() + periodo.antes.slice(1);
  const ultimo = g.serie.at(-1)?.y ?? 0;

  const leyenda = (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-tinta/70">
      <span>
        <span aria-hidden className="mr-1.5 inline-block h-0.5 w-5 bg-tinta align-middle" />
        {hoy ? "Hoy" : periodo.nombre}
      </span>
      <span>
        <span aria-hidden className="mr-1.5 inline-block w-5 border-t-2 border-dotted border-taupe align-middle" />
        {nombreAntes}
      </span>
      {g.proyeccion && (
        <span>
          <span aria-hidden className="mr-1.5 inline-block w-5 border-t-2 border-dashed border-tinta/50 align-middle" />
          Lo que se espera
        </span>
      )}
    </p>
  );

  return (
    <section className="trafico-pulso card-cayla anim-sube min-w-0 overflow-hidden" style={{ "--i": 1 } as CSSProperties} aria-label="El pulso de la tienda web">
      {/* La franja de cifras (maqueta: una pestaña por cifra, la elegida con su raya): tocar una la dibuja en el gráfico de abajo. */}
      <div className="trafico-franja" role="group" aria-label="Qué medir" data-guia="trafico.cifra">
        {METRICAS.map((x, i) => {
          const t = totalDe(r, x.clave, hastaX);
          const c = cambioDe(x.clave, t.valor, t.antes);
          const elegida = metrica === x.clave;
          return (
            <button key={x.clave} type="button" className="trafico-franja-cifra group" aria-pressed={elegida} onClick={() => setMetrica(x.clave)}>
              <span className="label-cayla text-[11px] text-taupe-profundo">{x.nombre}</span>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <b className="trafico-franja-numero font-display font-medium tabular-nums">{cifraTexto(x.clave, t.valor)}</b>
                {c ? (
                  <Chip tono={c.tono} versalitas={false}>
                    {c.texto}
                  </Chip>
                ) : (
                  <span className="text-[12px] text-tinta/70">Sin comparar</span>
                )}
              </span>
              <Sparkline lleno serie={valoresDe(r.serie.actual, x.clave, hastaX !== null ? Math.max(1, hastaX) : largo, false)} indice={i} className="mt-1" />
            </button>
          );
        })}
      </div>

      <div className="trafico-pulso-cuerpo" data-guia="trafico.pulso">
        <div className="min-w-0 px-4 pb-3.5 pt-4 sm:px-[22px]">
          <TituloSeccion
            nivel={3}
            accion={
              metrica !== "de100" ? (
                <SegmentoDeslizante
                  forma="modo"
                  etiqueta="Cómo contar"
                  valor={acumulado ? "acumulado" : "cada"}
                  onCambio={(v) => setAcumulado(v === "acumulado")}
                  opciones={[
                    { clave: "cada", etiqueta: porHora ? "Por hora" : "Por día" },
                    { clave: "acumulado", etiqueta: "Acumulado" },
                  ]}
                />
              ) : undefined
            }
          >
            {m.nombre}
            {acum ? ", acumulado" : ""}
          </TituloSeccion>
          <div className="mb-1">{leyenda}</div>
          <Linea
            serie={g.serie}
            referencia={g.referencia}
            proyeccion={g.proyeccion}
            desde={0}
            hasta={largo - 1}
            alto={300}
            marcasX={marcasDelTiempo(r.serie.por, largo, periodo.desde)}
            formatoY={(v) => cifraTexto(metrica, v)}
            ahora={hoy && hastaX !== null ? { x: hastaX, texto: `ahora · ${horaRedonda(hastaX)}` } : null}
            cifra={cifraTexto(metrica, ultimo)}
            cifraReferencia={g.cierre !== null ? { valor: miles(g.cierre), texto: "cierre esperado" } : null}
            // El globito dice qué momento es y con cuál se compara, cada uno con su cifra (Felipe, 2026-10-29: «Últimos 7 días: 69 · Los 7 días
            // anteriores: 0» confundía).
            leer={(x) => {
              const i = Math.round(x);
              const dibujado = g.serie.find((p) => p.x === i)?.y;
              // La hora o el día en curso no se dibujan (la línea «caería» sin haber caído), pero el globito dice lo que va, «hasta ahora».
              const enCurso = dibujado === undefined && hastaX !== null && i === hastaX;
              const a = enCurso ? valoresDe(r.serie.actual, metrica, largo, acum)[i] : dibujado;
              const b = g.referencia.find((p) => p.x === i)?.y;
              const f = filasDelGlobito({ por: r.serie.por, clave: periodo.clave, desde: periodo.desde, antDesde: r.anteriorDesde }, i);
              return (
                <span className="grid grid-cols-[auto_auto] gap-x-5 gap-y-0.5">
                  <span>
                    {f.actual}
                    {enCurso && " · hasta ahora"}
                  </span>
                  <b className="text-right font-semibold">{a === undefined ? "—" : cifraTexto(metrica, a)}</b>
                  {b !== undefined && (
                    <>
                      <span className="text-crema/75">{f.antes}</span>
                      <span className="text-right text-crema/75">{cifraTexto(metrica, b)}</span>
                    </>
                  )}
                </span>
              );
            }}
            etiqueta={`${m.nombre}, ${porHora ? "hora por hora" : "día por día"}, comparado con ${periodo.antes}`}
            vacio="Todavía no entró nadie en estos días"
          />
        </div>
        <Lectura r={r} periodo={periodo} cierre={hoy ? graficoDe(r.serie, "entraron", { largo, largoAntes, hastaX, acumulado: true }).cierre : null} />
      </div>
    </section>
  );
}

/** El panel de lectura: la respuesta en una frase y cuatro datos que la explican. */
function Lectura({ r, periodo, cierre }: { r: ResumenTrafico; periodo: { clave: ClavePeriodo; nombre: string; antes: string }; cierre: number | null }) {
  const c = cambio(r.pasos[0], r.anterior);
  const v = veredictoDe(periodo, c);
  const Icono = v.tono === "verde" ? Check : v.tono === "ambar" ? TriangleAlert : Equal;
  const pico = picoDeHoras(r.horas);
  const camino = lider(r.caminos);
  const atora = dondeSeAtora(r.pasos, r.base);
  const estrella = r.prendas
    .filter((p) => p.recorrido[0] >= 10)
    .sort((a, b) => b.recorrido[3] / b.recorrido[0] - a.recorrido[3] / a.recorrido[0])[0];
  const tonoMedalla = v.tono === "verde" ? "bg-verde/15 text-verde" : v.tono === "ambar" ? "bg-ambar/15 text-ambar" : "bg-hueso text-tinta/70";
  const datos: [string, string][] = [
    ["Hora más fuerte", pico ? tramoTexto(pico.desde, pico.hasta) : "Muy poca gente"],
    ["Camino que más trae", camino ? `${CAMINOS[camino]} · ${de100(r.caminos[camino], r.pasos[0])} de 100` : "—"],
    ["Dónde se pierde más gente", atora ? PASOS[atora.i].donde : "—"],
    ["Prenda que mejor funciona", estrella?.nombre ?? "Aún pocas personas"],
  ];
  return (
    <aside className="trafico-lectura flex flex-col gap-3.5 p-[18px] sm:p-[22px]" aria-label="Lo que dice el período">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`grid h-[46px] w-[46px] place-items-center rounded-[14px] ${tonoMedalla}`}>
          <Icono className="h-5 w-5" />
        </span>
        {periodo.clave === "hoy" && r.ahora > 0 && (
          <Chip tono="verde" versalitas={false}>
            <span aria-hidden className="trafico-punto-vivo" />
            {r.ahora === 1 ? "1 persona mirando" : `${miles(r.ahora)} mirando ahora`}
          </Chip>
        )}
      </div>
      <h3 className="font-display text-[24px] font-medium leading-[1.12] text-balance sm:text-[28px]" /* unificar-fijo: es la respuesta del período en una frase (la de la maqueta), no el título de una sección */>{v.titulo}</h3>
      <p className="text-[14.5px] text-tinta/70">
        Entraron <b className="font-semibold text-tinta">{miles(r.pasos[0])} {r.pasos[0] === 1 ? "persona" : "personas"}</b>.
        {cierre !== null && (
          <>
            {" "}
            Al ritmo de hoy cerrarías cerca de <b className="font-semibold text-tinta">{miles(cierre)}</b>.
          </>
        )}
      </p>
      <dl className="mt-auto grid gap-2.5 border-t border-sand pt-3.5 text-[13.5px]">
        {datos.map(([k, val]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-tinta/70">{k}</dt>
            <dd className="text-right font-semibold">{val}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function diasDelRango(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 864e5) + 1;
}

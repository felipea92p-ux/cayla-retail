"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AvatarPersona, PilaPersonas } from "@/components/ui/AvatarPersona";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { LecturaRitmo } from "@/lib/rendimiento-meta-reglas";
import { cierreSimulado, simuladorDeCierre, type MedidaGrupo, type MedidaPersona } from "@/lib/rendimiento-vista-reglas";
import type { DiaSerie } from "@/lib/rendimiento-meta-reglas";

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const NUMERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export const TONO_LECTURA: Record<LecturaRitmo, string> = { Adelante: "var(--color-verde)", "En ritmo": "var(--color-pizarra)", "Por debajo": "var(--color-ambar)" };

/** La cifra de dos caras: el «?» la voltea y explica la cuenta con los números de ahora (ley 6 de Formidable: lo difícil a un toque). */
function Volteable({ frente, tras, indice, guia, className = "" }: { frente: ReactNode; tras: ReactNode; indice: number; guia?: string; className?: string }) {
  const [vuelta, setVuelta] = useState(false);
  return (
    <div className={`volteable mesa-entra ${className}`} style={{ "--i": indice } as CSSProperties} data-vuelta={vuelta ? "" : undefined} data-guia={guia}>
      <button
        type="button"
        className="volteable-boton"
        aria-pressed={vuelta}
        aria-label={vuelta ? "Volver a la cifra" : "¿Cómo se cuenta?"}
        title={vuelta ? "Volver a la cifra" : "¿Cómo se cuenta?"}
        onClick={() => setVuelta((v) => !v)}
      >
        {vuelta ? "×" : "?"}
      </button>
      <div className="volteable-giro">
        <div className="volteable-cara liquido" style={{ borderRadius: 20 }} aria-hidden={vuelta} inert={vuelta}>
          <span aria-hidden className="mesa-barrido" style={{ "--i": indice } as CSSProperties} />
          {frente}
        </div>
        <div className="volteable-cara volteable-tras liquido" style={{ borderRadius: 20 }} aria-hidden={!vuelta} inert={!vuelta}>
          <div className="card-cayla tarjeta-cifra flex flex-col p-4 sm:px-5" data-conducta="informa">
            {tras}
          </div>
        </div>
      </div>
    </div>
  );
}

const Nombre = ({ children }: { children: ReactNode }) => <p className="label-cayla text-[11px] font-bold text-taupe">{children}</p>; // unificar-fijo: el nombre de la cara de atrás, el mismo de <TarjetaCifra>

/** La línea que sube: lo vendido, sumado, dentro del tramo. Se dibuja una vez por tramo. */
function Trazo({ serie }: { serie: number[] }) {
  const d = useMemo(() => {
    const W = 240;
    const H = 42;
    const tope = Math.max(1, serie.at(-1) ?? 1);
    const n = serie.length;
    const puntos = serie.map((v, i) => `${(n > 1 ? i / (n - 1) : 1) * W} ${H - 2 - (v / tope) * (H - 6)}`);
    return { linea: `M${puntos.join("L")}`, area: `M${puntos.join("L")}L${W} ${H}L0 ${H}Z` };
  }, [serie]);
  if (serie.length === 0) return <span className="mesa-trazo" aria-hidden />;
  return (
    <svg className="mesa-trazo" viewBox="0 0 240 42" preserveAspectRatio="none" aria-hidden>
      {/* unificar-fijo: el trazo de adorno de una cifra, sin ejes ni lectura; el dato ya está escrito en la cifra */}
      <path className="area" d={d.area} />
      <path d={d.linea} />
    </svg>
  );
}

export type CifrasProps = {
  grupo: MedidaGrupo;
  /** A quién se está mirando: «Trujillo», «Ana», «2 personas». */
  quien: string;
  /** El tramo en palabras: «este mes», «hoy»… */
  tramoTexto: string;
  /** Lo vendido sumado día a día dentro del tramo (la línea de la primera cifra). */
  trazo: number[];
  /** La serie del mes del grupo, para el cierre. */
  serieMes: readonly DiaSerie[];
  hoy: string;
  medidas: readonly MedidaPersona[];
  colores: ReadonlyMap<string, string>;
  /** Las personas elegidas en la tabla; vacío: todas. */
  elegidas: readonly string[];
  /** Los grupos elegidos en la tabla. */
  gruposElegidos: readonly string[];
  /** El dinero por día que se está probando; `null`: el ritmo de hoy. */
  porDia: number | null;
  /** ¿La tienda reparte la meta por horas programadas? Sin horarios, va en partes iguales. */
  porHoras: boolean;
  /** Si se pudo leer lo de cada persona. Sin eso, tocar a alguien mostraría ceros falsos. */
  conPersonas: boolean;
  onPorDia: (v: number | null) => void;
  onPersona: (personaId: string) => void;
  onGrupo: (lectura: LecturaRitmo) => void;
};

export function CifrasRendimiento({ grupo, quien, tramoTexto, trazo, serieMes, hoy, medidas, colores, elegidas, gruposElegidos, porDia, porHoras, conPersonas, onPorDia, onPersona, onGrupo }: CifrasProps) {
  const cierre = useMemo(() => simuladorDeCierre(serieMes, hoy), [serieMes, hoy]);
  const dia = cierre ? (porDia ?? cierre.ritmoPorDia) : 0;
  const cierreAhora = cierre ? cierreSimulado(cierre, dia) : 0;
  const difCierre = cierre?.metaMes != null ? cierreAhora - cierre.metaMes : null;
  const dif = grupo.diferencia;
  const empuje = dif !== null && grupo.tocaba ? Math.max(-1, Math.min(1, dif / (grupo.tocaba * 0.3))) * 50 : 0;
  const hayLecturas = medidas.some((m) => m.lectura !== null);

  return (
    <div className="mesa-cifras" data-guia="rendimiento.cifras">
      <Volteable
        indice={2}
        frente={
          <TarjetaCifra etiqueta="Vendido" valor={<CifraAnimada valor={grupo.vendido} formato="soles-redondo" />} pie={<Trazo serie={trazo} />}>
            {quien}, {tramoTexto} · {NUMERO.format(grupo.ventas)} {plural(grupo.ventas, "venta", "ventas")}
          </TarjetaCifra>
        }
        tras={
          <>
            <Nombre>Cómo se cuenta</Nombre>
            <p>
              Lo que vendió {quien} {tramoTexto}, con IGV y sin anuladas: <b>{NUMERO.format(grupo.ventas)} {plural(grupo.ventas, "venta", "ventas")}</b>
              {grupo.ticket !== null && <> con un ticket de <b>{SOLES.format(grupo.ticket)}</b></>}
              {grupo.ventas > 0 && grupo.prendas > 0 && <> y <b>{(grupo.prendas / grupo.ventas).toLocaleString("es-PE", { maximumFractionDigits: 1 })}</b> prendas por venta</>}. Las devoluciones no restan.
            </p>
          </>
        }
      />

      <Volteable
        indice={3}
        frente={
          dif === null ? (
            <TarjetaCifra etiqueta="Contra lo que tocaba" valor={null}>
              {grupo.meta === null ? "Sin meta no se inventa cuánto tocaba. Se carga en Configuración ▸ Tiendas y caja." : "Todavía no toca nada: no hay un turno corriendo ahora."}
            </TarjetaCifra>
          ) : (
            <TarjetaCifra
              etiqueta="Contra lo que tocaba"
              valor={
                <>
                  {dif >= 0 ? "+ " : "− "}
                  <CifraAnimada valor={Math.abs(dif)} formato="soles-redondo" />
                </>
              }
              pie={
                <span className="mesa-balanza block" style={{ "--c": dif >= 0 ? "var(--color-verde)" : "var(--color-ambar)" } as CSSProperties} aria-hidden>
                  <i style={{ left: `${empuje >= 0 ? 50 : 50 + empuje}%`, width: `${Math.abs(empuje)}%` }} />
                </span>
              }
            >
              {dif >= 0 ? "Arriba" : "Abajo"} de los {SOLES.format(grupo.tocaba ?? 0)} que tocaban
            </TarjetaCifra>
          )
        }
        tras={
          <>
            <Nombre>Cómo se cuenta</Nombre>
            <p>
              {grupo.meta !== null && grupo.diferencia !== null ? (
                <>
                  De <b>{SOLES.format(grupo.meta)}</b> de meta, tocaba llevar <b>{SOLES.format(grupo.tocaba ?? 0)}</b>:{" "}
                  {porHoras
                    ? "los días que ya pasaron y, de hoy, lo que ya corrió del turno de cada persona. La meta sale de las horas programadas."
                    : "los días que ya pasaron. Sin horarios cargados, la meta se reparte en partes iguales entre quienes marcaron asistencia."}
                </>
              ) : (
                "Cuando haya una meta y lo que toque ya haya empezado a correr, aquí verás la diferencia."
              )}
            </p>
          </>
        }
      />

      <Volteable
        indice={4}
        guia="rendimiento.cifra-cierre"
        frente={
          cierre === null ? (
            <TarjetaCifra etiqueta="Si vendemos por día" valor={null}>
              Hacen falta 3 días con ventas para calcular a dónde se llega.
            </TarjetaCifra>
          ) : (
            <TarjetaCifra
              etiqueta="Si vendemos por día"
              valor={<CifraAnimada valor={dia} formato="soles-redondo" />}
              pie={
                <input
                  className="mesa-rango"
                  type="range"
                  min={0}
                  max={cierre.tope}
                  step={10}
                  value={Math.round(Math.min(dia, cierre.tope) / 10) * 10}
                  style={{ "--v": `${(Math.min(dia, cierre.tope) / cierre.tope) * 100}%` } as CSSProperties}
                  aria-label="Lo que se vende por día"
                  aria-valuetext={`${SOLES.format(dia)} por día`}
                  onChange={(e) => onPorDia(Number(e.target.value))}
                  onDoubleClick={() => onPorDia(null)}
                  title="Doble clic: vuelve al ritmo de hoy"
                />
              }
            >
              Cerramos en {SOLES.format(cierreAhora)}
              {difCierre !== null && <>: {difCierre >= 0 ? `${SOLES.format(difCierre)} sobre la meta` : `faltan ${SOLES.format(-difCierre)}`}</>}.
            </TarjetaCifra>
          )
        }
        tras={
          <>
            <Nombre>Cómo se cuenta</Nombre>
            <p>
              {cierre ? (
                <>
                  Llevamos <b>{SOLES.format(cierre.vendido)}</b> y quedan <b>{cierre.diasQueQuedan} {plural(cierre.diasQueQuedan, "día", "días")}</b> de trabajo. A este ritmo se venden {SOLES.format(cierre.ritmoPorDia)} por día
                  {cierre.faltaPorDia !== null && <>; para llegar a la meta hacen falta <b>{SOLES.format(cierre.faltaPorDia)}</b></>}. Es una estimación.
                </>
              ) : (
                "Cuando haya 3 días con ventas, aquí verás a dónde se llega."
              )}
            </p>
          </>
        }
      />

      <Volteable
        indice={5}
        guia="rendimiento.cifra-equipo"
        frente={
          <TarjetaCifra
            etiqueta="El equipo"
            valor={
              <PilaPersonas>
                {medidas.map((m) => (
                  <button
                    key={m.personaId}
                    type="button"
                    className="mesa-persona-boton"
                    style={{ "--c": colores.get(m.personaId) } as CSSProperties}
                    title={m.nombre}
                    aria-label={`Ver a ${m.nombre}`}
                    aria-pressed={elegidas.includes(m.personaId)}
                    data-apagada={elegidas.length > 0 && !elegidas.includes(m.personaId) ? "" : undefined}
                    data-persona={m.personaId}
                    disabled={!conPersonas}
                    onClick={() => onPersona(m.personaId)}
                  >
                    <AvatarPersona personaId={m.personaId} nombre={m.nombre} tamano={32} />
                  </button>
                ))}
              </PilaPersonas>
            }
            pie={
              hayLecturas ? (
                <span className="mesa-grupos">
                  {(["Adelante", "En ritmo", "Por debajo"] as const).map((l) => {
                    const n = medidas.filter((m) => m.lectura === l).length;
                    return (
                      <button
                        key={l}
                        type="button"
                        className="mesa-grupo"
                        style={{ "--c": TONO_LECTURA[l] } as CSSProperties}
                        aria-pressed={gruposElegidos.includes(l)}
                        data-apagada={gruposElegidos.length > 0 && !gruposElegidos.includes(l) ? "" : undefined}
                        onClick={() => onGrupo(l)}
                      >
                        <b>{n}</b>
                        <span>{l}</span>
                        <i />
                      </button>
                    );
                  })}
                </span>
              ) : undefined
            }
          >
            {hayLecturas || !conPersonas ? null : "Toca a alguien para verle solo."}
          </TarjetaCifra>
        }
        tras={
          <>
            <Nombre>Cómo se lee</Nombre>
            <p>
              «Adelante» o «Por debajo» son <b>10 %</b> arriba o abajo de lo que tocaba. Es para reconocer y acompañar, sin comisión ni bono. Toca a alguien o a un grupo y toda la pantalla se acomoda.
            </p>
          </>
        }
      />
    </div>
  );
}

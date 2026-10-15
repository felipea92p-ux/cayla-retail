"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { Confianza } from "@/components/finanzas/Confianza";
import { GraficoSemanas } from "@/components/finanzas/GraficoSemanas";
import { VerPorPagar } from "@/components/finanzas/PorPagarAcciones";
import { ResumenDecidir } from "@/components/finanzas/ResumenDecidir";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";
import type { Lectura } from "@/lib/resumen-finanzas";
import { soles } from "@/lib/flujo-caja-reglas";
import { avisoAntesDelCorte, mesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { mesNombre } from "@/lib/resultados-reglas";
import { cascadaPulso, lugaresPulso, respuestaPulso, ritmoPulso } from "@/lib/pulso-reglas";
import {
  avisosParaDecidir,
  bajadaResumen,
  barrasSemanas,
  caminoEquilibrio,
  cifrasResumen,
  claveVer,
  coberturaTiendas,
  miniPresupuesto,
  motivoAusencia,
  notaUnidad,
  noRevisado,
  tituloResumen,
  type Acceso,
  type ResumenFinanzas,
} from "@/lib/resumen-finanzas-reglas";
import { Vacio } from "@/components/ui/Vacio";
import { CalendarX, ChartColumn, Target, Wallet } from "lucide-react";

// Finanzas ▸ Resumen, «El Pulso» (camino A de las maquetas finanzas-v2-2026-10, elegido por Felipe el 2026-10-15): una
// pregunta —¿estoy ganando plata?— y una respuesta grande, lo que queda a la fecha. Debajo, en capas: ¿por qué ese número?
// (la cascada, a un toque), el ritmo (lo vendido por día contra lo que hace falta, y con qué cerrarías), qué tan seguro es el
// número (ADR-0417, el medidor de confianza), qué deja cada lugar (sin repartir lo de la empresa) y, recién entonces, las
// cifras del mes, «para decidir hoy» y los gráficos de siempre. No calcula plata: todo viene de `fn_resumen_finanzas` y de
// `lib/pulso-reglas.ts` + `lib/resumen-finanzas-reglas.ts`, que deciden qué se dice. Es cliente por el «¿Por qué?» y por
// los gráficos, que reciben cómo escribir cada valor (una función).

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
// Lo mismo, para una pieza que ya tiene su clase.
const entraEn = (clase: string, i: number) => ({ className: `${clase} anim-entra`, style: { ["--i" as string]: i } as CSSProperties });
const mayuscula = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export function ResumenFinanzasPanel({ resumen, falla, confianza, acceso }: { resumen: ResumenFinanzas | null; falla: string | null; confianza: Lectura<ConfianzaDatos | null>; acceso: Acceso }) {
  if (!resumen) {
    return (
      <div className="space-y-6">
        <CabeceraPantalla sobretitulo="Finanzas · Resumen" titulo="Resumen" bajada="Cómo está el negocio y qué conviene decidir hoy." accionesAbajo />
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla ?? "No se pudo leer el resumen."}</p>
      </div>
    );
  }
  const r = resumen;
  const cifras = cifrasResumen(r);
  const avisos = avisosParaDecidir(r, acceso);
  const faltan = noRevisado(r);
  const ver = { clave: claveVer(r.ver), ubicacionId: r.ver.ubicacionId, soloEmpresa: r.ver.soloEmpresa };
  const unidades = r.lider ? r.unidades.map((u) => ({ id: u.id, nombre: u.nombre })) : [{ id: r.ver.ubicacionId ?? "", nombre: r.ver.nombre }];
  const lugares = lugaresPulso(r);

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Finanzas · Resumen"
        titulo={tituloResumen(r)}
        bajada={bajadaResumen(r)}
        accionesAbajo
        acciones={<VerPorPagar ver={ver} unidades={unidades} esLider={r.lider} />}
      />

      <Respuesta r={r} />

      <section className="fin-dos-col">
        <Ritmo r={r} />
        {/* ADR-0417: qué tan cierto es el número del mes y qué falta para que lo sea. Si no se pudo medir, no se dibuja (nunca un 0 % falso). */}
        {confianza.datos ? (
          <div {...entra(5)}>
            <Confianza confianza={confianza.datos} guia="fin-resumen.confianza" />
          </div>
        ) : (
          <div {...entra(5)}>
            <Superficie pad>
              <CabeceraBloque titulo="Qué tan seguro es este número" bajada={confianza.falla ?? "No se pudo medir."} />
            </Superficie>
          </div>
        )}
      </section>

      {lugares && <Lugares lugares={lugares} />}

      <section className="fin-cifras fin-cinco" aria-label="Los números del mes" data-guia="fin-resumen.cifras">
        {cifras.map((c, i) => (
          // `cifrasResumen` dice «—» cuando no hay dato: la pieza lo dibuja como «sin dato», con su detalle de motivo (ADR-0358).
          <TarjetaCifra key={c.clave} etiqueta={c.etiqueta} valor={c.valor === "—" ? null : c.valor} tono={c.rojo ? "text-rojo" : undefined} {...entra(i + 7)}>
            <span title={`Sale de ${c.origen}`}>{c.detalle}</span>
          </TarjetaCifra>
        ))}
      </section>

      <section className="fin-dos-col fin-dos-col-izq">
        <div {...entra(12)} data-guia="fin-resumen.decidir">
          <Superficie pad>
            <CabeceraBloque titulo="Para decidir hoy" bajada="Primero lo que más cuesta si se deja pasar. Cada aviso dice cuánto está en juego." />
            <ResumenDecidir avisos={avisos} parcial={faltan.length > 0} />
            {faltan.length > 0 && (
              <ul className="fin-no-revisado">
                {faltan.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </Superficie>
        </div>

        <div className="fin-columna">
          {r.ver.todas ? (
            <>
              <Cobertura r={r} />
              <Semanas r={r} />
            </>
          ) : r.ver.tipo === "tienda" ? (
            <>
              <Camino r={r} />
              <MiniPresupuesto r={r} acceso={acceso} />
            </>
          ) : (
            notaUnidad(r) && (
              <div className="nota-cayla anim-entra" style={{ ["--i" as string]: 13 } as CSSProperties}>
                {notaUnidad(r)}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

/** La pregunta y la respuesta grande, con «¿Por qué?» que abre la cascada (vendiste → costó → sueldos → gastos → queda). */
function Respuesta({ r }: { r: ResumenFinanzas }) {
  const [porque, setPorque] = useState(false);
  const resp = respuestaPulso(r);
  const cascada = cascadaPulso(r);
  const vende = r.ver.todas || r.ver.tipo === "tienda";
  const pregunta = vende ? "¿Estoy ganando plata?" : r.ver.tipo === "taller" ? "¿Cuánto cuesta el Taller?" : "¿Cuánto cuesta lo de la empresa?";
  const mayor = Math.max(1, ...cascada.map((t) => t.monto));
  return (
    <section className="fin-pulso-hero" aria-labelledby="fin-pulso-pregunta" data-guia="fin-resumen.respuesta">
      <p id="fin-pulso-pregunta" {...entraEn("fin-pulso-pregunta", 1)}>
        {pregunta}
      </p>
      {resp.estado === "sin_datos" ? (
        <div {...entra(2)}>
          <Vacio tamano="chico" icono={<ChartColumn />}>
            {resp.motivo}
          </Vacio>
        </div>
      ) : (
        <>
          {vende && (
            <p {...entraEn("fin-pulso-si", 2)}>
              <Chip tono={resp.estado === "gana" ? "verde" : resp.estado === "pierde" ? "rojo" : "ambar"}>{resp.corto}</Chip>
              <span>En lo que va de {mesNombre(r.mes)},</span>
            </p>
          )}
          <p {...entraEn("fin-pulso-respuesta", 3)}>
            <span className="fin-pulso-verbo">{resp.verbo}</span>
            <span className="fin-pulso-monto" data-estado={resp.estado}>
              <CifraAnimada valor={Math.round(resp.monto)} formato="soles" />
            </span>
          </p>
          <p {...entraEn("fin-pulso-explica", 4)}>
            {resp.explica}
          </p>
          {cascada.length > 0 && (
            <div {...entraEn("fin-pulso-porque", 5)}>
              <button type="button" className="btn-cayla btn-enlace" aria-expanded={porque} aria-controls="fin-pulso-cascada" onClick={() => setPorque((v) => !v)}>
                {porque ? "Cerrar" : `¿Por qué ${soles(resp.monto)}?`}
              </button>
              {porque && (
                <ol id="fin-pulso-cascada" className="fin-pulso-cascada" aria-label="De dónde sale el número">
                  {cascada.map((t, i) => (
                    <li key={t.clave} className="fin-pulso-tramo anim-entra" data-tipo={t.tipo} style={{ ["--i" as string]: i } as CSSProperties}>
                      <span className="fin-pulso-tramo-nombre">
                        {t.nombre}
                        {t.detalle && <small>{t.detalle}</small>}
                      </span>
                      <span className="fin-pulso-tramo-monto num">
                        {t.tipo === "sale" ? "−" : ""}
                        {soles(t.monto)}
                      </span>
                      <span className="fin-pulso-tramo-barra" aria-hidden="true">
                        <i style={{ ["--w" as string]: `${Math.round((t.monto / mayor) * 100)}%` } as CSSProperties} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** El ritmo: lo vendido por día contra lo que hace falta por día para cubrir lo fijo del mes, y con qué cerrarías si sigues así. */
function Ritmo({ r }: { r: ResumenFinanzas }) {
  const ritmo = ritmoPulso(r);
  const nota = notaUnidad(r);
  return (
    <div {...entra(4)}>
      <Superficie pad guia="fin-resumen.ritmo">
        <CabeceraBloque titulo="Tu ritmo" bajada={ritmo ? ritmo.frase : (nota ?? "Mirando el Taller o la empresa no hay ritmo de venta.")} />
        {ritmo && ritmo.necesarioPorDia !== null && ritmo.necesarioPorDia > 0 && (
          <>
            <RitmoBarra porDia={ritmo.porDia} necesario={ritmo.necesarioPorDia} tono={ritmo.tono} />
            <p className="fin-pulso-cierre">{ritmo.cierreFrase}</p>
            <p className="nota-cayla mt-3">
              Lo fijo de {mesNombre(r.mes)} ronda {soles(ritmo.fijoMes)}: sueldos, alquileres, servicios y desgaste, con lo registrado hasta hoy. Lo que falta registrar lo dice «Qué tan seguro es este número».
            </p>
          </>
        )}
        {ritmo && (ritmo.necesarioPorDia === null || ritmo.necesarioPorDia <= 0) && ritmo.cierreFrase && <p className="nota-cayla mt-3">{ritmo.cierreFrase}</p>}
      </Superficie>
    </div>
  );
}

function RitmoBarra({ porDia, necesario, tono }: { porDia: number; necesario: number; tono: "verde" | "ambar" | "rojo" | "pizarra" }) {
  const tope = Math.max(porDia, necesario, 1) * 1.25;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / tope) * 100))}%`;
  return (
    <div className="fin-pulso-ritmo" data-tono={tono} role="img" aria-label={`Vas en ${soles(porDia)} al día; necesitas ${soles(necesario)} al día`}>
      <div className="fin-pulso-ritmo-pista">
        <i className="fin-pulso-ritmo-relleno" style={{ ["--w" as string]: pct(porDia) } as CSSProperties} />
        <span className="fin-pulso-ritmo-marca" style={{ left: pct(necesario) }}>
          <span>Necesitas {soles(necesario)}</span>
        </span>
      </div>
      <div className="fin-pulso-ritmo-escala">
        <span>S/&nbsp;0</span>
        <span>
          Tú: {soles(porDia)} al día
        </span>
      </div>
    </div>
  );
}

/** Qué deja cada lugar después de lo que él mismo causa; lo de la empresa va aparte y no se reparte (ADR-0417). */
function Lugares({ lugares }: { lugares: NonNullable<ReturnType<typeof lugaresPulso>> }) {
  const { lugares: ls, total, mayor } = lugares;
  const positivos = ls.filter((l) => l.deja > 0).map((l) => l.nombre);
  return (
    <div {...entra(6)}>
      <Superficie pad guia="fin-resumen.lugares">
        <CabeceraBloque
          titulo="Qué deja cada lugar"
          bajada={positivos.length ? `${positivos.join(" y ")} ${positivos.length === 1 ? "carga" : "cargan"} el mes. Cada lugar, después de pagar lo que él mismo causa.` : "Cada lugar, después de pagar lo que él mismo causa."}
        />
        <ul className="fin-pulso-lugares" aria-label="Qué deja cada lugar">
          {ls.map((l, i) => (
            <li key={l.id} className="fin-pulso-lugar anim-entra" style={{ ["--i" as string]: i } as CSSProperties}>
              <span className="fin-pulso-lugar-nombre">
                <b>{l.nombre}</b>
                <small>{l.nota ?? (l.vendio > 0 ? `Vendió ${soles(l.vendio)}` : "")}</small>
              </span>
              <span className="fin-pulso-lugar-eje" aria-hidden="true">
                <i data-signo={l.deja >= 0 ? "mas" : "menos"} style={{ ["--w" as string]: `${Math.round((Math.abs(l.deja) / mayor) * 50)}%` } as CSSProperties} />
              </span>
              <span className="fin-pulso-lugar-monto num" data-signo={l.deja >= 0 ? "mas" : "menos"}>
                {l.deja >= 0 ? "+" : "−"}
                {soles(Math.abs(l.deja))}
              </span>
            </li>
          ))}
          <li className="fin-pulso-lugar fin-pulso-lugar-total">
            <span className="fin-pulso-lugar-nombre">
              <b>{total >= 0 ? "Te quedan" : "Te faltan"}</b>
            </span>
            <span />
            <span className="fin-pulso-lugar-monto num" data-signo={total >= 0 ? "mas" : "menos"}>
              {soles(Math.abs(total))}
            </span>
          </li>
        </ul>
      </Superficie>
    </div>
  );
}

function Cobertura({ r }: { r: ResumenFinanzas }) {
  const { barras, sinDatos } = coberturaTiendas(r);
  // Si el último mes completo quedó antes del corte de Finanzas (ADR-0332), el primero que se mide es el del corte.
  const mes = mesNombre(r.antesDelCorte ? mesDelCorte(r.antesDelCorte) : r.mesAnterior);
  return (
    <div {...entra(13)}>
      <Superficie pad guia="fin-resumen.cobertura">
        <CabeceraBloque titulo="¿Cada tienda cubre sus costos?" bajada={`${mayuscula(mes)}: lo que vendió contra lo que necesitaba vender (100 %).`} />
        {r.antesDelCorte ? (
          <Vacio tamano="chico" icono={<CalendarX />}>
            {avisoAntesDelCorte(r.antesDelCorte)}
          </Vacio>
        ) : r.resultadosAnterior.estado !== "ok" ? (
          <Vacio tamano="chico" icono={<ChartColumn />}>
            {motivoAusencia(r.resultadosAnterior) ?? "El estado de resultados no se pudo leer."}
          </Vacio>
        ) : barras.length ? (
          <GraficoSemanas
            etiqueta={`Lo que vendió cada tienda en ${mes} contra su punto de equilibrio`}
            barras={barras}
            alto={190}
            ancho={560}
            umbral={100}
            umbralTexto="100 % = cubre sus costos justos"
            etiquetaValor={(v) => `${v} %`}
          />
        ) : (
          <Vacio tamano="chico" icono={<ChartColumn />}>
            Todavía no hay un mes completo con ventas para calcularlo.
          </Vacio>
        )}
        {barras.length > 0 && sinDatos.length > 0 && (
          <p className="nota-cayla mt-3">
            Sin ventas en {mes}: {sinDatos.join(", ")}.
          </p>
        )}
      </Superficie>
    </div>
  );
}

function Semanas({ r }: { r: ResumenFinanzas }) {
  return (
    <div {...entra(14)}>
      <Superficie pad guia="fin-resumen.semanas">
        <CabeceraBloque titulo="Saldo de las próximas 6 semanas" bajada="Lo que hay hoy + lo que entra − lo que vence." />
        {r.flujo.estado === "ok" ? (
          <GraficoSemanas
            etiqueta={`Lo que queda cada semana, contra tu mínimo de caja de ${soles(r.flujo.datos.minimoCaja)}`}
            barras={barrasSemanas(r.flujo.datos)}
            alto={200}
            ancho={560}
            umbral={r.flujo.datos.minimoCaja}
            umbralTexto={`tu mínimo de caja: ${soles(r.flujo.datos.minimoCaja)} (se cambia en Configuración)`}
            etiquetaValor={soles}
          />
        ) : (
          <Vacio tamano="chico" icono={<ChartColumn />}>
            {motivoAusencia(r.flujo, "el líder") ?? "El flujo de caja no se pudo leer."}
          </Vacio>
        )}
      </Superficie>
    </div>
  );
}

function Camino({ r }: { r: ResumenFinanzas }) {
  const c = caminoEquilibrio(r);
  return (
    <div {...entra(13)}>
      <Superficie pad guia="fin-resumen.camino">
        <CabeceraBloque
          titulo="Camino al punto de equilibrio"
          bajada={`${mayuscula(mesNombre(r.mes))} al día ${Number(r.hoy.slice(8, 10))} contra lo que necesita vender en el mes (según ${mesNombre(r.mesAnterior)}).`}
        />
        {c ? (
          <>
            <div className="fin-umbral-barra fin-alto" role="img" aria-label={`Vendido ${soles(c.vendido)} de ${soles(c.pe)}`}>
              <i style={{ width: `${c.ancho}%` }} />
            </div>
            <div className="fin-marcas">
              <span>Vendido {soles(c.vendido)}</span>
              <span>Necesita {soles(c.pe)}</span>
            </div>
            <p className="nota-cayla mt-3">{c.texto}</p>
          </>
        ) : (
          <Vacio tamano="chico" icono={<Target />}>
            {r.resultadosAnterior.estado !== "ok"
              ? (motivoAusencia(r.resultadosAnterior) ?? "")
              : `Sin ventas con margen en ${mesNombre(r.mesAnterior)} para calcular cuánto necesita vender.`}
          </Vacio>
        )}
      </Superficie>
    </div>
  );
}

function MiniPresupuesto({ r, acceso }: { r: ResumenFinanzas; acceso: Acceso }) {
  const filas = miniPresupuesto(r);
  const href = `/finanzas/reportes/presupuesto${r.lider && r.ver.ubicacionId ? `?ver=${r.ver.ubicacionId}` : ""}`;
  return (
    <div {...entra(14)}>
      <Superficie pad guia="fin-resumen.presupuesto">
        <CabeceraBloque titulo="Presupuesto del mes" bajada="Gastado a la fecha contra su tope; el % es la proyección al cierre.">
          {(acceso.lider || acceso.modulos.includes("reportes_financieros")) && (
            <Link href={href} className="btn-cayla btn-sutil btn-chico shrink-0">
              Ver todo
            </Link>
          )}
        </CabeceraBloque>
        {r.presupuesto.estado !== "ok" ? (
          <Vacio tamano="chico" icono={<Wallet />}>
            {motivoAusencia(r.presupuesto) ?? ""}
          </Vacio>
        ) : filas.length ? (
          <ul className="fin-lista-mov">
            {filas.map((f) => (
              <li key={f.nombre}>
                <span>{f.nombre}</span>
                <span>
                  {soles(f.real)} de {soles(f.tope)} ·{" "}
                  <b className="fin-pct" data-tono={f.tono}>
                    {f.pct}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Vacio tamano="chico" icono={<Wallet />}>
            Este mes no tiene topes. Se ponen en Configuración ▸ Presupuesto.
          </Vacio>
        )}
      </Superficie>
    </div>
  );
}

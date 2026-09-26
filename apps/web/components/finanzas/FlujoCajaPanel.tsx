"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { SelectEnLineaFin, Superficie } from "@/components/finanzas/kit";
import { GraficoSemanas } from "@/components/finanzas/GraficoSemanas";
import { descargarBlob } from "@/lib/exportar-csv";
import { sumarDias } from "@/lib/fechas-lima";
import { fechaCorta } from "@/lib/gastos-reglas";
import {
  SEMANAS_POSIBLES,
  campanasDeSemana,
  csvFlujo,
  etiquetaSemana,
  etiquetasEje,
  fraseDelFlujo,
  listasDelFlujo,
  queVence,
  rangoDelMes,
  soles,
  solesConSigno,
  textoCategoria,
  textoPeriodo,
  textoSinCuenta,
  tiendasDeLaProyeccion,
  tonoDiasDeCaja,
  type FlujoReal,
  type Parte,
  type Proyeccion,
} from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Reportes ▸ Flujo de caja (ADR-0195 F6), dibujado como el spike aprobado (`vistaFlujo`, «¿Por qué vendí bien y
// no hay plata?»): a la izquierda lo que ya pasó (lo que entró por medio, lo que salió por concepto, y semana a semana); a
// la derecha lo que viene (hoy, el gráfico con el mínimo de caja y la tabla de semanas con qué vence). Es de CAYLA entera
// («Ver» fijo). La pantalla no calcula plata: la base da las cifras (`fn_flujo_caja_real`, `fn_flujo_caja_proyeccion`).

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function pintarPartes(partes: Parte[]): ReactNode {
  return partes.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <b key={i}>{p.b}</b>));
}

export function FlujoCajaPanel({
  real,
  proyeccion,
  fallas,
  mes,
  meses,
  semanas,
  hoy,
}: {
  real: FlujoReal | null;
  proyeccion: Proyeccion | null;
  fallas: string[];
  mes: string;
  meses: string[];
  semanas: number;
  hoy: string;
}) {
  const router = useRouter();
  const ir = (m: string, s: number) => router.push(`/finanzas/reportes/flujo?mes=${m}&semanas=${s}`, { scroll: false });

  const descargar = () => {
    descargarBlob(`flujo-de-caja-${hoy}.csv`, new Blob([csvFlujo(real, proyeccion)], { type: "text/csv;charset=utf-8" }));
  };

  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana="flujo"
        titulo="¿Por qué vendí bien y no hay plata?"
        bajada="Lo que ya entró y salió, y lo que viene en las próximas semanas."
        acciones={
          <>
            <Chip versalitas={false}>CAYLA entera</Chip>
            <button type="button" className="btn-cayla btn-secundario" onClick={descargar} disabled={!real && !proyeccion}>
              Descargar Excel
            </button>
          </>
        }
      />

      {fallas.map((f) => (
        <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
          {f}
        </p>
      ))}

      <section className="fin-dos-col fin-der">
        <div {...entra(1)}>
          <Superficie pad>
            {/* Un <div> y no un <p>: el combo es una caja, y una caja dentro de un <p> rompe el HTML del servidor. */}
            <div className="fin-etq">
              Lo que ya pasó ·{" "}
              <SelectEnLineaFin
                etiqueta="Qué mes mirar"
                valor={mes}
                onValor={(m) => ir(m, semanas)}
                opciones={meses.map((m) => {
                  const r = rangoDelMes(m, hoy);
                  return { valor: m, texto: textoPeriodo(r.desde, r.hasta, hoy) };
                })}
              />
            </div>
            {real ? <LoQuePaso real={real} /> : <p className="text-sm text-taupe">Sin datos de este mes.</p>}
          </Superficie>
        </div>

        <div {...entra(2)}>
          <Superficie pad>
            <div className="fin-etq">
              Lo que viene · próximas{" "}
              <SelectEnLineaFin
                etiqueta="Cuántas semanas mirar"
                valor={String(semanas)}
                onValor={(n) => ir(mes, Number(n))}
                opciones={SEMANAS_POSIBLES.map((n) => ({ valor: String(n), texto: `${n} semanas` }))}
              />
            </div>
            {proyeccion ? <LoQueViene p={proyeccion} /> : <p className="text-sm text-taupe">Sin datos de lo que viene.</p>}
          </Superficie>
        </div>
      </section>
    </div>
  );
}

function LoQuePaso({ real }: { real: FlujoReal }) {
  const { entradas, salidas, ajustes } = listasDelFlujo(real);
  const frase = fraseDelFlujo(real);
  const sinCuenta = textoSinCuenta(real.sinCuenta);
  const planilla = real.planilla.reduce((a, p) => a + p.pagado, 0);
  return (
    <>
      <h3 className="fin-h-flujo">Entró {soles(real.entro)}</h3>
      <ul className="fin-flujo-lista">
        {entradas.map((c) => (
          <li key={c.clave}>
            <span>{textoCategoria(c.clave)}</span>
            <b>{solesConSigno(c.monto)}</b>
          </li>
        ))}
        {!entradas.length && <li className="fin-flujo-vacia">No entró plata a las cuentas.</li>}
      </ul>
      <h3 className="fin-h-flujo">Salió {soles(real.salio)}</h3>
      <ul className="fin-flujo-lista">
        {salidas.map((c) => (
          <li key={c.clave}>
            <span>{textoCategoria(c.clave)}</span>
            <b>{solesConSigno(-c.monto)}</b>
          </li>
        ))}
        {!salidas.length && <li className="fin-flujo-vacia">No salió plata de las cuentas.</li>}
      </ul>
      {ajustes.length > 0 && (
        <>
          <h3 className="fin-h-flujo fin-h-flujo-chica">Diferencias y plata en camino {solesConSigno(real.ajustes)}</h3>
          <ul className="fin-flujo-lista">
            {ajustes.map((c) => (
              <li key={c.clave}>
                <span>{textoCategoria(c.clave)}</span>
                <b>{solesConSigno(c.monto)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="nota-cayla">{pintarPartes(frase.partes)}</div>

      <div className="fin-tabla-wrap mt-4">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Semana a semana: lo que entró, lo que salió y lo que quedó</caption>
          <thead>
            <tr>
              <th>Semana</th>
              <th className="fin-num">Entró</th>
              <th className="fin-num">Salió</th>
              <th className="fin-num">Quedó</th>
            </tr>
          </thead>
          <tbody>
            <tr className="fin-suave">
              <td data-l="Semana">Al {fechaCorta(sumarDias(real.desde, -1))}</td>
              <td className="fin-num" data-l="Entró" />
              <td className="fin-num" data-l="Salió" />
              <td className="fin-num" data-l="Quedó">
                {soles(real.saldoInicial)}
              </td>
            </tr>
            {real.semanas.map((s) => (
              <tr key={s.desde}>
                <td data-l="Semana">{etiquetaSemana(s.desde, s.hasta)}</td>
                <td className="fin-num" data-l="Entró">
                  {soles(s.entro)}
                </td>
                <td className="fin-num" data-l="Salió">
                  {soles(s.salio)}
                </td>
                <td className="fin-num" data-l="Quedó">
                  <b>{soles(s.saldo)}</b>
                  {Math.round(s.ajustes) !== 0 && <span className="fin-sub">{solesConSigno(s.ajustes)} de diferencias</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Math.round(real.descuadre * 100) !== 0 && (
        <p className="fin-nota-bloque">
          <Chip tono="rojo" versalitas={false}>
            No cuadra
          </Chip>{" "}
          Hay {soles(Math.abs(real.descuadre))} que las cuentas no explican. Avísale al equipo: el flujo no inventa la diferencia.
        </p>
      )}
      {sinCuenta && (
        <p className="fin-nota-bloque">
          <b>No suma aquí</b> lo que todavía no dice de qué cuenta salió o a cuál entró (igual que en Cuentas y dinero): {sinCuenta}.
        </p>
      )}
      <p className="fin-nota-bloque">
        {real.planillaVisible
          ? planilla > 0
            ? `La planilla la paga Dynamic y todavía no baja de ningún banco aquí: en este período, ${soles(planilla)}.`
            : "La planilla la paga Dynamic y todavía no baja de ningún banco aquí."
          : "La planilla la paga Dynamic y no se ve desde tu cuenta: no baja de ningún banco aquí."}
      </p>
    </>
  );
}

function LoQueViene({ p }: { p: Proyeccion }) {
  const eje = etiquetasEje(p.semanas.map((w) => w.desde));
  const sinMeta = tiendasDeLaProyeccion(p).filter((t) => t.origen !== "meta");
  return (
    <>
      <h3 className="fin-hoy">Hoy tienes {soles(p.saldoHoy)}</h3>
      <p className="mb-2 text-[13px] leading-snug text-taupe">
        Entra lo que esperas vender (la meta de cada día, con sus campañas); sale lo que vence (facturas, planilla, alquileres, gastos fijos).
      </p>
      {p.diasDeCaja !== null && (
        <p className="fin-dias">
          <Chip tono={tonoDiasDeCaja(p.diasDeCaja)} versalitas={false}>
            {p.diasDeCaja} {p.diasDeCaja === 1 ? "día" : "días"} de caja
          </Chip>
          <span>
            Si mañana no vendieras nada, tu plata alcanza para {p.diasDeCaja} {p.diasDeCaja === 1 ? "día" : "días"}: salen {soles(p.salidasDiarias)} en un día normal (los
            últimos 30 días, con la planilla).
          </span>
        </p>
      )}
      <GraficoSemanas
        etiqueta={`Lo que queda cada semana, contra tu mínimo de caja de ${soles(p.minimoCaja)}`}
        alto={230}
        ancho={560}
        etiquetaValor={soles}
        umbral={p.minimoCaja}
        umbralTexto={`tu mínimo de caja: ${soles(p.minimoCaja)} (se cambia en Configuración)`}
        barras={p.semanas.map((w, i) => ({
          nombre: eje[i] ?? "",
          valor: w.saldo,
          mala: w.bajoMinimo,
          malaTexto: "bajo el mínimo",
          titulo: etiquetaSemana(w.desde, w.hasta),
          lineas: [`Entra ${soles(w.entra)} · Sale ${soles(w.sale)}`, `Queda ${soles(w.saldo)}`, queVence(p.salidas, w.desde, w.hasta)],
        }))}
      />
      <div className="fin-tabla-wrap mt-3">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Lo que viene, semana por semana</caption>
          <thead>
            <tr>
              <th>Semana</th>
              <th className="fin-num">Entra</th>
              <th className="fin-num">Sale</th>
              <th className="fin-num">Queda</th>
              <th>Qué vence</th>
            </tr>
          </thead>
          <tbody>
            {p.semanas.map((w) => {
              const campanas = campanasDeSemana(p.cobros, w.desde, w.hasta);
              return (
                <tr key={w.desde}>
                  <td data-l="Semana">
                    {etiquetaSemana(w.desde, w.hasta)}
                    {campanas.map((c) => (
                      <span key={c} className="fin-chip-campana">
                        {c}
                      </span>
                    ))}
                  </td>
                  <td className="fin-num" data-l="Entra">
                    {soles(w.entra)}
                  </td>
                  <td className="fin-num" data-l="Sale">
                    {soles(w.sale)}
                  </td>
                  <td className="fin-num" data-l="Queda">
                    <b className={w.bajoMinimo ? "fin-queda-malo" : undefined}>{soles(w.saldo)}</b>
                    {w.bajoMinimo && <span className="fin-sub fin-queda-malo">bajo el mínimo</span>}
                  </td>
                  <td className="fin-ancha fin-que-vence" data-l="Qué vence">
                    {queVence(p.salidas, w.desde, w.hasta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sinMeta.length > 0 && (
        <p className="fin-nota-bloque">
          <b>{sinMeta.map((t) => t.nombre).join(" y ")}</b> {sinMeta.length === 1 ? "no tiene" : "no tienen"} meta{sinMeta.some((t) => t.origen === "mixto") ? " algunos días" : ""}: se
          espera lo que cobró en promedio esos mismos días de la semana en las últimas 8 semanas. Ponle meta en{" "}
          <Link href="/configuracion?tab=tiendas" className="underline underline-offset-2 hover:text-rojo">
            Configuración ▸ Tiendas y caja
          </Link>
          .
        </p>
      )}
      {!p.planillaVisible && <p className="fin-nota-bloque">La planilla no se ve desde tu cuenta en Dynamic: no está en lo que sale.</p>}
      <p className="fin-nota-bloque">
        El mínimo de caja y los avisos se cambian en{" "}
        <Link href="/configuracion?tab=caja" className="underline underline-offset-2 hover:text-rojo">
          Configuración ▸ Caja y avisos
        </Link>
        .
      </p>
    </>
  );
}

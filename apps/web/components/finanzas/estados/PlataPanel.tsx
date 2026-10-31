"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarX } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { SelectEnLineaFin, Superficie } from "@/components/finanzas/kit";
import { CascadaPulso } from "@/components/finanzas/CascadaPulso";
import { GraficoSemanas } from "@/components/finanzas/GraficoSemanas";
import { FaltanProyeccion } from "@/components/finanzas/FaltanProyeccion";
import { EscenariosPanel } from "@/components/finanzas/EscenariosPanel";
import { sumarDias } from "@/lib/fechas-lima";
import { fechaCorta } from "@/lib/gastos-reglas";
import {
  SEMANAS_POSIBLES,
  campanasDeSemana,
  etiquetaSemana,
  etiquetasEje,
  queFaltaEnLaProyeccion,
  queVence,
  soles,
  solesConSigno,
  textoSinCuenta,
  tiendasDeLaProyeccion,
  tonoDiasDeCaja,
  type FlujoReal,
  type Proyeccion,
} from "@/lib/flujo-caja-reglas";
import { partesDelFlujo, puentePlata } from "@/lib/plata-reglas";
import type { FilaER } from "@/lib/resultados-reglas";

// Estados financieros ▸ ¿Dónde está la plata? (flujo de efectivo; ADR-0195 F6, ADR-0585, actividad 5). De arriba abajo: la respuesta (lo
// que hay hoy o al cerrar el mes) con la frase de por qué la plata no siguió a la ganancia; el puente del mes en el método directo (del día
// a día, compras que duran años, tú y los préstamos; cada parte se toca y muestra sus categorías); lo que viene semana a semana contra tu
// mínimo; «¿Y si…?», que es Escenarios entero (ya no tiene pantalla aparte: nada se guarda); y, plegado, el formato formal. Es de CAYLA
// entera. La pantalla no calcula plata: la base da las cifras (`fn_flujo_caja_real`, `fn_flujo_caja_proyeccion`).

const entra = (i: number, clase = "") => ({ className: `anim-entra ${clase}`.trim(), style: { ["--i" as string]: i } as CSSProperties });

export function PlataPanel({
  real,
  proyeccion,
  frase,
  fallas,
  semanas,
  enCurso,
  hoy,
  escenarios,
}: {
  real: FlujoReal | null;
  proyeccion: Proyeccion | null;
  /** Por qué la plata no siguió a la ganancia (`fraseDeLaPlata`). */
  frase: string | null;
  fallas: string[];
  semanas: number;
  enCurso: boolean;
  hoy: string;
  /** Lo que «¿Y si…?» necesita: el estado de resultados del último mes completo. */
  escenarios: { resultados: FilaER[] | null; mesBase: string };
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [verYSi, setVerYSi] = useState(false);
  const [verFormal, setVerFormal] = useState(false);
  const ponerSemanas = (n: number) => {
    const p = new URLSearchParams(params.toString());
    p.set("semanas", String(n));
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="min-w-0 space-y-8">
      {fallas.map((f) => (
        <Aviso key={f} tono="error">
          {f}
        </Aviso>
      ))}

      <section className="fin-pulso-hero" aria-labelledby="fin-plata-pregunta" data-guia="fin-plata.respuesta">
        <p id="fin-plata-pregunta" {...entra(1, "fin-pulso-pregunta")}>
          {enCurso ? "¿Cuánta plata tiene CAYLA hoy?" : "¿Con cuánta plata cerró el mes?"}
        </p>
        {real ? (
          <>
            <p {...entra(2, "fin-pulso-respuesta")}>
              <span className="fin-pulso-verbo">{enCurso ? "Tienes" : "Cerró con"}</span>
              <span className="fin-pulso-monto">
                <CifraAnimada valor={Math.round(real.saldoFinal)} formato="soles" />
              </span>
            </p>
            {frase && <p {...entra(3, "fin-pulso-explica")}>{frase}</p>}
            <div {...entra(4, "fin-pulso-porque")}>
              <CascadaPulso id="fin-plata-puente" tramos={puentePlata(real, enCurso)} etiqueta="De dónde vino y a dónde fue la plata" guia="fin-plata.puente" />
              <p className="text-center text-[12.5px] text-taupe">Toca una parte para ver de qué está hecha.</p>
            </div>
          </>
        ) : (
          <div {...entra(2)}>
            <Vacio tamano="chico" icono={<CalendarX />}>
              Sin movimientos de plata en este mes.
            </Vacio>
          </div>
        )}
      </section>

      {real && <Notas real={real} />}

      <section className="space-y-3" data-guia="fin-flujo.viene">
        <TituloSeccion>
          Lo que viene ·{" "}
          <span data-guia="fin-flujo.cuantas-semanas">
            <SelectEnLineaFin
              etiqueta="Cuántas semanas mirar"
              valor={String(semanas)}
              onValor={(n) => ponerSemanas(Number(n))}
              opciones={SEMANAS_POSIBLES.map((n) => ({ valor: String(n), texto: `${n} semanas` }))}
            />
          </span>
        </TituloSeccion>
        <Superficie pad>
          {proyeccion ? (
            <LoQueViene p={proyeccion} />
          ) : (
            <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<CalendarX />}>
              Sin datos de lo que viene.
            </Vacio>
          )}
        </Superficie>
      </section>

      <section id="y-si" className="space-y-4">
        <BotonVerMas abierto={verYSi} onCambiar={setVerYSi} texto="¿Y si…? Prueba un cambio" forma="enlace" controla="fin-plata-y-si" data-guia="fin-plata.y-si" />
        <FilasDeMas abierto={verYSi} id="fin-plata-y-si">
          <EscenariosPanel proyeccion={proyeccion} resultados={escenarios.resultados} mesBase={escenarios.mesBase} fallas={[]} hoy={hoy} />
        </FilasDeMas>
      </section>

      <section className="space-y-4">
        <BotonVerMas abierto={verFormal} onCambiar={setVerFormal} texto="Ver el formato formal: flujo de efectivo" forma="enlace" controla="fin-plata-formal" data-guia="fin-plata.formal" />
        <FilasDeMas abierto={verFormal} id="fin-plata-formal">
          {real ? <Formal real={real} /> : null}
        </FilasDeMas>
      </section>
    </div>
  );
}

/** El estado de flujos de efectivo como lo lee un contador (método directo), sin cuentas, y lo que quedó semana a semana. */
function Formal({ real }: { real: FlujoReal }) {
  const partes = partesDelFlujo(real);
  return (
    <Superficie pad>
      <p className="mb-3 text-[13px] text-taupe">Estado de flujos de efectivo, método directo.</p>
      <div className="fin-tabla-wrap" data-guia="fin-plata.formal-tabla">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Estado de flujos de efectivo</caption>
          <thead>
            <tr>
              <th>Partida</th>
              <th className="fin-num">S/</th>
            </tr>
          </thead>
          <tbody>
            {partes.flatMap((p) => [
              ...p.lineas.map((l) => (
                <tr key={`${p.clave}-${l.nombre}`}>
                  <td data-l="Partida">{l.nombre}</td>
                  <td className="fin-num" data-l="S/">
                    {solesConSigno(l.monto)}
                  </td>
                </tr>
              )),
              <tr key={`${p.clave}-total`} className="fin-suave">
                <td data-l="Partida">
                  <b>{p.formal}</b>
                </td>
                <td className="fin-num" data-l="S/">
                  <b>{solesConSigno(p.total)}</b>
                </td>
              </tr>,
            ])}
            <tr>
              <td data-l="Partida">Efectivo al inicio</td>
              <td className="fin-num" data-l="S/">
                {soles(real.saldoInicial)}
              </td>
            </tr>
            <tr className="fin-suave">
              <td data-l="Partida">
                <b>Efectivo al final</b>
              </td>
              <td className="fin-num" data-l="S/">
                <b>{soles(real.saldoFinal)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="fin-tabla-wrap mt-4" data-guia="fin-flujo.semana-a-semana">
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

    </Superficie>
  );
}

/** Lo que el puente no muestra pero hay que saber: un descuadre, lo que no dice de qué cuenta salió y la planilla de Dynamic. */
function Notas({ real }: { real: FlujoReal }) {
  const sinCuenta = textoSinCuenta(real.sinCuenta);
  const planilla = real.planilla.reduce((a, p) => a + p.pagado, 0);
  const planillaRegistrada = real.categorias.find((c) => c.clave === "planilla")?.monto ?? 0;
  return (
    <div className="space-y-3" data-guia="fin-plata.notas">
      {Math.round(real.descuadre * 100) !== 0 && (
        <Aviso tono="error" titulo="No cuadra" >
          Hay {soles(Math.abs(real.descuadre))} que las cuentas no explican. Avísale al equipo: el flujo no inventa la diferencia.
        </Aviso>
      )}
      {sinCuenta && (
        <p className="nota-cayla">
          <b>No suma aquí</b> lo que todavía no dice de qué cuenta salió o a cuál entró (igual que en Cuentas y dinero): {sinCuenta}.
        </p>
      )}
      <p className="nota-cayla">
        {real.planillaVisible
          ? planilla > 0
            ? `La planilla la paga Dynamic y lo que no registres como pago de un banco no baja de ninguno aquí: en este período, ${soles(planilla)}${planillaRegistrada > 0 ? `, de los que ya registraste ${soles(planillaRegistrada)} (sale arriba como «Pago de la planilla»)` : ""}.`
            : "La planilla la paga Dynamic y todavía no baja de ningún banco aquí."
          : "La planilla la paga Dynamic y no se ve desde tu cuenta: no baja de ningún banco aquí."}
      </p>
    </div>
  );
}

function LoQueViene({ p }: { p: Proyeccion }) {
  const eje = etiquetasEje(p.semanas.map((w) => w.desde));
  const sinMeta = tiendasDeLaProyeccion(p).filter((t) => t.origen !== "meta");
  const { provisional, faltan } = queFaltaEnLaProyeccion(p);
  return (
    <>
      <h3 className="fin-hoy">
        Hoy tienes {provisional ? "≈ " : ""}
        {soles(p.saldoHoy)}
        {provisional && (
          <>
            {" "}
            <Chip tono="pizarra" versalitas={false}>
              Provisional
            </Chip>
          </>
        )}
      </h3>
      <FaltanProyeccion provisional={provisional} faltan={faltan} className="mb-3" />
      <p className="mb-2 text-[13px] leading-snug text-taupe">
        Entra lo que esperas vender (la meta de cada día, con sus campañas); sale lo que vence (facturas, planilla, alquileres, gastos fijos).
      </p>
      {p.diasDeCaja !== null && (
        <p className="fin-dias" data-guia="fin-flujo.dias">
          <Chip tono={provisional ? "pizarra" : tonoDiasDeCaja(p.diasDeCaja)} versalitas={false}>
            {provisional ? "≈ " : ""}
            {p.diasDeCaja} {p.diasDeCaja === 1 ? "día" : "días"} de caja
            {provisional ? " · provisional" : ""}
          </Chip>
          <span>
            Si mañana no vendieras nada, tu plata alcanzaría para {provisional ? "unos " : ""}
            {p.diasDeCaja} {p.diasDeCaja === 1 ? "día" : "días"}: salen {soles(p.salidasDiarias)} en un día normal (los últimos 30 días, con la planilla).
            {provisional ? " No cuenta el IGV ni lo que falte registrar." : ""}
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
      <div className="fin-tabla-wrap mt-3" data-guia="fin-flujo.que-vence">
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
        <p className="nota-cayla mt-3" data-guia="fin-flujo.sin-meta">
          <b>{sinMeta.map((t) => t.nombre).join(" y ")}</b> {sinMeta.length === 1 ? "no tiene" : "no tienen"} meta{sinMeta.some((t) => t.origen === "mixto") ? " algunos días" : ""}: se
          espera su promedio de ese día de la semana (hasta 8 semanas atrás){sinMeta.some((t) => t.corto) ? "; con pocos días de historia se acerca al promedio de todos sus días, para que un día atípico no mande" : ""}. Ponle meta en{" "}
          <Link href="/configuracion?tab=tiendas" className="underline underline-offset-2 hover:text-rojo">
            Configuración ▸ Tiendas y caja
          </Link>
          .
        </p>
      )}
      {!p.planillaVisible && <p className="nota-cayla mt-3">La planilla no se ve desde tu cuenta en Dynamic: no está en lo que sale.</p>}
      <p className="nota-cayla mt-3" data-guia="fin-flujo.config">
        El mínimo de caja y los avisos se cambian en{" "}
        <Link href="/configuracion?tab=caja" className="underline underline-offset-2 hover:text-rojo">
          Configuración ▸ Caja y avisos
        </Link>
        .
      </p>
    </>
  );
}

"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { BarrasFin, CabeceraBloque, Herramientas, PieTabla, Superficie } from "@/components/finanzas/kit";
import { fechaCorta } from "@/lib/gastos-reglas";
import { diasEntreFechas } from "@/lib/fechas-lima";
import {
  csvCampanas,
  extraNecesario,
  fraseCampanasMalas,
  margenQueSePierde,
  nombreEje,
  separarCampanas,
  solesER,
  veredictoCampana,
  type CampanaFila,
} from "@/lib/resultados-reglas";

// Finanzas ▸ Reportes ▸ Campañas (ADR-0195 K2, PLAN-FINANZAS §7 ter), dibujado como el spike aprobado (`vistaCampanas`):
// a la izquierda el margen extra de cada campaña que pasó, a la derecha su tabla; abajo las que vienen, con cuánto más hay
// que vender para compensar su descuento contra cuánto sube su meta. Las cifras vienen de `fn_campanas_reporte`; aquí solo
// se despeja «cuánto más vender» (m ÷ (m − d) − 1) sobre el margen normal que da la base.

const entra = (i: number, clase = "") => ({
  className: `anim-entra ${clase}`.trim(),
  style: { ["--i" as string]: i } as CSSProperties,
});
const pct = (x: number | null, conSigno = false) =>
  x == null || !Number.isFinite(x)
    ? "—"
    : `${conSigno ? (x >= 0 ? "+" : "−") : x < 0 ? "−" : ""}${Math.abs(x * 100)
        .toFixed(1)
        .replace(".", ",")} %`;
const lift = (c: CampanaFila) => (c.normal ? (c.ventas ?? 0) / c.normal - 1 : null);

export function CampanasPanel({
  campanas,
  esLider,
  tiendaNombre,
  hoy,
  fallas,
}: {
  campanas: CampanaFila[];
  esLider: boolean;
  tiendaNombre: string;
  hoy: string;
  fallas: string[];
}) {
  const { pasadas, vienen, sinFechas } = separarCampanas(campanas);
  const conExtra = pasadas.filter((c) => c.margenExtra != null);
  const malas = fraseCampanasMalas(conExtra);
  // El pie usa el margen normal de las que vienen (el de las últimas 8 semanas sin campaña); sin ventas, lo dice en general.
  const margenRef = vienen.find((c) => c.margenNormalPct != null)?.margenNormalPct ?? null;

  const descargar = () => {
    const url = URL.createObjectURL(
      new Blob([csvCampanas(pasadas, vienen)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanas-${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana="campanas"
        titulo="¿Valen la pena las campañas?"
        bajada="Cada campaña contra lo que la tienda vende en días normales: cuánto más vendió, cuánto se descontó y si al final dejó más o menos margen."
        acciones={
          <>
            <Chip versalitas={false}>{esLider ? "CAYLA entera" : tiendaNombre}</Chip>
            <button type="button" className="btn-cayla btn-secundario" onClick={descargar}>
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
            <CabeceraBloque titulo="Margen extra de cada campaña" bajada="Lo que dejó contra lo que habría dejado en días normales." />
            {conExtra.length ? (
              <BarrasFin
                etiqueta="Margen extra de cada campaña"
                alto={200}
                ancho={440}
                etiquetaValor={solesER}
                barras={conExtra.map((c) => ({
                  nombre: nombreEje(c.nombre),
                  valor: c.margenExtra ?? 0,
                  mala: (c.margenExtra ?? 0) < 0,
                  malaTexto: "no se pagó",
                  detalle: `${c.nombre}: vendió ${solesER(c.ventas ?? 0)} (normal ${solesER(c.normal ?? 0)}) · descuento ${solesER(c.descuento)} · margen ${pct(c.margenPct)}`,
                }))}
              />
            ) : (
              <p className="text-sm text-taupe">Todavía no terminó ninguna campaña con ventas y días normales para comparar.</p>
            )}
            {malas && <p className="mt-2.5 text-[13px] text-taupe">{malas}</p>}
          </Superficie>
        </div>

        <div {...entra(2)}>
          <Superficie>
            <div className="fin-tabla-wrap">
              <table className="fin-tabla" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th className="fin-num">Vendió</th>
                    <th className="fin-num">vs normal</th>
                    <th className="fin-num">Descuento</th>
                    <th className="fin-num">Margen extra</th>
                  </tr>
                </thead>
                <tbody>
                  {pasadas.map((c) => (
                    <tr key={c.id}>
                      <td className="fin-ancha" data-l="Campaña">
                        <b>{c.nombre}</b>
                        <span className="fin-sub">
                          {fechaCorta(c.desde)} – {fechaCorta(c.hasta)} · {c.prendas ?? 0} prendas
                        </span>
                      </td>
                      <td className="fin-num" data-l="Vendió">
                        {solesER(c.ventas ?? 0)}
                      </td>
                      <td className="fin-num" data-l="vs normal">
                        {pct(lift(c), true)}
                      </td>
                      <td className="fin-num" data-l="Descuento">
                        {c.descuento ? solesER(c.descuento) : "—"}
                      </td>
                      <td className="fin-num" data-l="Margen extra">
                        {c.margenExtra == null ? (
                          <span className="fin-tenue">sin días normales</span>
                        ) : (
                          <b className={c.margenExtra < 0 ? "text-rojo-profundo" : "text-verde"}>
                            {c.margenExtra >= 0 ? "+" : ""}
                            {solesER(c.margenExtra)}
                          </b>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!pasadas.length && (
                    <tr>
                      <td colSpan={5} className="fin-tenue">
                        Ninguna campaña del último año tuvo ventas en {esLider ? "las tiendas" : "tu tienda"}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PieTabla>
              <span>«Normal» = lo que vendió la tienda el mismo día de la semana en las 8 semanas anteriores, sin campañas.</span>
            </PieTabla>
          </Superficie>
        </div>
      </section>

      <div {...entra(3)}>
        <Superficie>
          <Herramientas>
            <b className="text-[14px]">Las que vienen</b>
            <span className="text-[12.5px] text-taupe">
              Antes de lanzarla: con ese descuento, ¿cuánto más hay que vender para ganar lo mismo que un día normal?
            </span>
          </Herramientas>
          <div className="fin-tabla-wrap">
            <table className="fin-tabla fin-tabla-envuelve fin-tabla-apretada" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th className="fin-col-nombre">Campaña</th>
                  <th className="fin-num">Descuento</th>
                  <th className="fin-num">Para ganar lo mismo, vender</th>
                  <th className="fin-num">La meta sube</th>
                  <th className="fin-num">Meta de la campaña</th>
                  <th>Qué dice el sistema</th>
                </tr>
              </thead>
              <tbody>
                {vienen.map((c) => {
                  const extra = extraNecesario(c.margenNormalPct, c.descuentoPct);
                  const v = veredictoCampana(c);
                  const faltan = c.desde ? diasEntreFechas(hoy, c.desde) : null;
                  return (
                    <tr key={c.id}>
                      <td className="fin-ancha" data-l="Campaña">
                        <b>{c.nombre}</b>
                        <span className="fin-sub">
                          {fechaCorta(c.desde)} – {fechaCorta(c.hasta)} ·{" "}
                          {c.momento === "en_curso"
                            ? `en curso, termina el ${fechaCorta(c.hasta)}`
                            : `empieza en ${faltan} ${faltan === 1 ? "día" : "días"}`}
                        </span>
                      </td>
                      <td className="fin-num" data-l="Descuento">
                        {c.descuentoPct ? `${c.descuentoPct} %` : "—"}
                      </td>
                      <td className="fin-num" data-l="Vender">
                        {!c.descuentoPct
                          ? "lo mismo"
                          : extra == null
                            ? "—"
                            : Number.isFinite(extra)
                              ? `${pct(extra, true)} más`
                              : "no alcanza"}
                      </td>
                      <td className="fin-num" data-l="Meta sube">
                        {c.conEfecto && c.metaPct != null ? `+${c.metaPct} %` : <span className="fin-tenue">sin efecto en caja</span>}
                      </td>
                      <td className="fin-num" data-l="Meta">
                        {c.conEfecto && c.metaCampana != null ? (
                          <>
                            {solesER(c.metaCampana)}
                            <span className="fin-sub">normal {solesER(c.metaNormal ?? 0)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-l="Qué dice">
                        <Chip tono={v.tono}>{v.texto}</Chip>
                      </td>
                    </tr>
                  );
                })}
                {!vienen.length && (
                  <tr>
                    <td colSpan={6} className="fin-tenue">
                      No hay campañas con fechas por venir. Se crean en Catálogo ▸ Etiquetas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PieTabla>
            <span>
              {margenRef != null
                ? `Con el margen normal de hoy (${pct(margenRef)}), con 15 % de descuento cada prenda deja ${pct(margenQueSePierde(margenRef, 15))} menos de margen; con 30 %, ${pct(margenQueSePierde(margenRef, 30))} menos. Por eso una campaña con descuento necesita vender mucho más para valer la pena.`
                : "Una campaña con descuento necesita vender mucho más para valer la pena: cada prenda deja menos margen."}
              {sinFechas.length
                ? ` ${sinFechas.map((c) => c.nombre).join(", ")} no ${sinFechas.length === 1 ? "tiene" : "tienen"} fechas: no ${sinFechas.length === 1 ? "puede" : "pueden"} mover la meta hasta que se las pongan.`
                : ""}
            </span>
          </PieTabla>
        </Superficie>
      </div>

      <div {...entra(4, "nota-cayla")}>
        Una campaña también puede valer por otras cosas (clientas nuevas, sacar mercadería que no rota). El sistema no decide por ti: te
        dice <b>cuánto cuesta</b> en margen, para que la decisión sea a sabiendas. Las fechas, el descuento y las categorías se cambian en
        Catálogo ▸ Etiquetas; la meta y el fondo, en{" "}
        {esLider ? (
          <Link href="/configuracion?tab=tiendas" className="underline underline-offset-2">
            Configuración ▸ Tiendas y caja
          </Link>
        ) : (
          "Configuración ▸ Tiendas y caja"
        )}
        .
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { fechaCortaES } from "@/lib/plan-compra-reglas";
import {
  RPC_HISTORIAL,
  campanasDelAnio,
  crecimiento,
  diasDeLaCampana,
  leerHistorial,
  medir,
  rangoDeCampana,
  textoCrecimiento,
  textoMultiplicador,
  type CampanaDelAnio,
  type EtiquetaHistorial,
  type LecturaHistorial,
  type Medida,
} from "@/lib/plan-compra-historial";

// El detalle de una campaña del Historial (ADR-0372, C3 · Felipe 2026-10-12: «al darle clic a una fila, los detalles»). Solo lee.
// Sinatra no sabe qué prendas se vendieron: antes del ERP, el detalle es el día a día de la campaña (contra un día normal) y la MISMA
// campaña año por año. Las prendas y los colores existen desde que vende el ERP: para eso, un enlace a Resultados.

const solesSinCentimos = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const diaDeSemana = (iso: string) => DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

type Anual = { anio: number; medida: Medida };

export function DetalleCampanaHistorial({
  campana,
  anio,
  historial,
  etiquetas,
  anios,
  planDeResultados,
  onClose,
}: {
  campana: CampanaDelAnio;
  anio: number;
  historial: LecturaHistorial;
  etiquetas: readonly EtiquetaHistorial[];
  /** Los años con historia, del más nuevo al más viejo. */
  anios: readonly number[];
  /** Si esta campaña tiene su plan en el ERP (con prendas y colores), su id: lleva a Resultados. */
  planDeResultados: string | null;
  onClose: () => void;
}) {
  const conDatos = historial.tiendas.filter((t) => medir(historial, t, campana.desde, campana.hasta).estado === "medida");
  const [tiendaId, setTiendaId] = useState(conDatos[0]?.id ?? historial.tiendas[0]?.id ?? "");
  const tienda = historial.tiendas.find((t) => t.id === tiendaId) ?? historial.tiendas[0];
  const detalle = useMemo(() => (tienda ? diasDeLaCampana(historial, tienda, campana.desde, campana.hasta) : null), [historial, tienda, campana]);
  const medida = tienda ? medir(historial, tienda, campana.desde, campana.hasta) : null;

  // La misma campaña en cada año: una lectura chica por año (sus días y los 60 de antes), en paralelo. `undefined` = todavía leyendo.
  const [porAnio, setPorAnio] = useState<Map<number, LecturaHistorial | null> | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    const supabase = createClient();
    const pasados = anios.filter((a) => `${a}-01-01` < historial.hoy);
    void Promise.all(
      pasados.map(async (a) => {
        const c = campanasDelAnio(etiquetas, a).find((x) => x.clave === campana.clave);
        if (!c || c.desde >= historial.hoy) return [a, null] as const;
        const r = rangoDeCampana(c);
        const { data, error } = await supabase.rpc(RPC_HISTORIAL as never, { p_desde: r.desde, p_hasta: r.hasta } as never);
        return [a, error ? null : leerHistorial(data)] as const;
      }),
    ).then((pares) => vivo && setPorAnio(new Map(pares)));
    return () => {
      vivo = false;
    };
  }, [anios, etiquetas, campana.clave, historial.hoy]);

  const anuales: Anual[] | undefined = porAnio
    ? [...porAnio.entries()]
        .flatMap(([a, l]): Anual[] => {
          const c = campanasDelAnio(etiquetas, a).find((x) => x.clave === campana.clave);
          const t = l?.tiendas.find((x) => x.id === tiendaId);
          if (!c || !l || !t) return [];
          const m = medir(l, t, c.desde, c.hasta);
          return m.estado === "medida" ? [{ anio: a, medida: m }] : [];
        })
        .sort((a, b) => b.anio - a.anio)
    : undefined;
  const maxAnual = Math.max(1, ...(anuales ?? []).map((x) => (x.medida.estado === "medida" ? x.medida.soles : 0)));
  const maxDia = Math.max(1, ...(detalle?.dias ?? []).map((d) => d.soles), detalle?.diaNormal ?? 0);

  return (
    <Modal titulo={`${campana.nombre} ${anio}`} subtitulo={`Del ${fechaCortaES(campana.desde)} al ${fechaCortaES(campana.hasta)}: día a día y la misma campaña en cada año.`} onClose={onClose} variante="hoja" ancho="max-w-2xl" conCerrar>
      <div className="space-y-6">
        {historial.tiendas.length > 1 && (
          <div role="group" aria-label="Tienda" className="flex flex-wrap gap-2">
            {historial.tiendas.map((t) => (
              <button key={t.id} type="button" className="pildora-cayla" aria-pressed={t.id === tiendaId} onClick={() => setTiendaId(t.id)}>
                {t.nombre}
              </button>
            ))}
          </div>
        )}

        {!medida || medida.estado !== "medida" || !detalle ? (
          <p className="nota-cayla">{medida?.estado === "sin-dato" ? medida.motivo : "Todavía no empieza."} No hay día a día que mostrar en esta tienda.</p>
        ) : (
          <>
            <dl data-guia="plan-historial.resumen" className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-hueso px-4 py-3">
                <dt className="text-xs text-taupe">Vendió</dt>
                <dd className="font-serif text-xl text-tinta">{solesSinCentimos(medida.soles)}</dd>
                <dd className="text-xs text-tinta/70">{medida.multiplicador !== null ? `${textoMultiplicador(medida.multiplicador)} un día normal` : "Sin base para comparar"}</dd>
              </div>
              <div className="rounded-xl bg-hueso px-4 py-3">
                <dt className="text-xs text-taupe">El mejor día</dt>
                <dd className="font-serif text-xl text-tinta">{detalle.mejor ? solesSinCentimos(detalle.mejor.soles) : "—"}</dd>
                <dd className="text-xs text-tinta/70">{detalle.mejor ? `${diaDeSemana(detalle.mejor.fecha)} ${fechaCortaES(detalle.mejor.fecha)}` : ""}</dd>
              </div>
              <div className="rounded-xl bg-hueso px-4 py-3">
                <dt className="text-xs text-taupe">El día más flojo</dt>
                <dd className="font-serif text-xl text-tinta">{detalle.flojo ? solesSinCentimos(detalle.flojo.soles) : "—"}</dd>
                <dd className="text-xs text-tinta/70">{detalle.flojo ? `${diaDeSemana(detalle.flojo.fecha)} ${fechaCortaES(detalle.flojo.fecha)}` : ""}</dd>
              </div>
            </dl>

            <section data-guia="plan-historial.dias">
              <h3 className="text-[13px] font-semibold text-tinta">Día a día</h3>
              <p className="text-xs text-tinta/70">
                {detalle.diaNormal !== null ? `La línea es un día normal: ${solesSinCentimos(detalle.diaNormal)} (el promedio de los 60 días de antes).` : "Sin los 60 días de antes no hay día normal con qué comparar."}
              </p>
              <div className="relative mt-3 flex h-36 items-end gap-[3px]" role="img" aria-label={`Ventas por día de ${campana.nombre} ${anio} en ${tienda?.nombre ?? ""}`}>
                {detalle.diaNormal !== null && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-taupe" style={{ bottom: `${(detalle.diaNormal / maxDia) * 100}%` }} />
                )}
                {detalle.dias.map((d) => (
                  <div
                    key={d.fecha}
                    title={`${diaDeSemana(d.fecha)} ${fechaCortaES(d.fecha)}: ${d.soles > 0 ? solesSinCentimos(d.soles) : "sin venta"}`}
                    className={`min-w-0 flex-1 rounded-t-sm ${d.fecha === detalle.mejor?.fecha ? "bg-rojo" : d.soles > 0 ? "bg-tinta/70" : "bg-sand"}`}
                    style={{ height: `${Math.max(2, (d.soles / maxDia) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-taupe">
                <span>{fechaCortaES(detalle.dias[0]?.fecha ?? campana.desde)}</span>
                <span>{fechaCortaES(detalle.dias.at(-1)?.fecha ?? campana.hasta)}</span>
              </div>
            </section>
          </>
        )}

        <section data-guia="plan-historial.anual">
          <h3 className="text-[13px] font-semibold text-tinta">La misma campaña, año por año</h3>
          {anuales === undefined ? (
            <p className="mt-2 text-sm text-taupe">Buscando los otros años…</p>
          ) : anuales.length === 0 ? (
            <p className="mt-2 text-sm text-taupe">No hay otros años con datos de esta tienda.</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {anuales.map((x, i) => {
                const m = x.medida as Extract<Medida, { estado: "medida" }>;
                const previo = anuales[i + 1];
                const c = previo && previo.anio === x.anio - 1 ? crecimiento(m, previo.medida) : null;
                return (
                  <li key={x.anio} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <span className={x.anio === anio ? "font-semibold text-tinta" : "text-tinta/80"}>{x.anio}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-sand">
                      <span className={`block h-full rounded-full ${x.anio === anio ? "bg-rojo" : "bg-tinta/60"}`} style={{ width: `${(m.soles / maxAnual) * 100}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums text-tinta">
                      {solesSinCentimos(m.soles)}
                      <span className="text-xs text-taupe">
                        {m.multiplicador !== null ? ` · ${textoMultiplicador(m.multiplicador)}` : ""}
                        {c !== null ? ` · ${textoCrecimiento(c)}` : ""}
                        {m.enCurso ? " · hasta ayer" : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="nota-cayla">
          Sinatra solo guarda los soles de cada día, no qué prendas se vendieron. Qué prendas, tallas y colores se vendieron más y menos se ve desde
          que vende el ERP (setiembre de 2026), en{" "}
          {planDeResultados ? (
            <Link href={`/compras/plan/resultados?plan=${planDeResultados}`} className="underline underline-offset-2 hover:no-underline">
              los Resultados de esta campaña
            </Link>
          ) : (
            "la pestaña Resultados de cada campaña"
          )}
          .
        </p>
      </div>
    </Modal>
  );
}

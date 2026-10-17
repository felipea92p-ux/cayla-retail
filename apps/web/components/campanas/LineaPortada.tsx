import type { CSSProperties } from "react";
import {
  PORTADA_DE_SIEMPRE,
  barraEn,
  campanasEnLaLinea,
  diasEntre,
  textoPct,
  tramosDePortada,
  type Campana,
  type DiaPortada,
  type Rango,
} from "@/lib/campanas-reglas";
import { textoRango } from "@/lib/etiqueta-vigencia";

/** Los colores de la barra de una campaña: los de su portada (hoy, los de siempre). Son dato, no tema. */
const COLORES_DE_SIEMPRE = {
  "--hf": PORTADA_DE_SIEMPRE.fondo,
  "--hf2": PORTADA_DE_SIEMPRE.fondo2,
  "--ht": PORTADA_DE_SIEMPRE.letra,
} as CSSProperties;

/**
 * «La portada, día a día» (maqueta, pantalla 1): arriba, qué campaña anuncia la portada cada día —la que dice la base, tramo por tramo, y
 * «Lo nuevo» donde no hay ninguna—; abajo, una fila por campaña con sus fechas. La línea marca hoy y apaga lo que ya pasó. Se lee de
 * izquierda a derecha como un calendario; el detalle de cada barra va en su texto para el lector de pantalla.
 */
export function LineaPortada({ campanas, dias, rango, hoy }: { campanas: readonly Campana[]; dias: readonly DiaPortada[]; rango: Rango; hoy: string }) {
  const porId = new Map(campanas.map((c) => [c.id, c]));
  const tramos = tramosDePortada(dias);
  const filas = campanasEnLaLinea(campanas, rango);
  // La raya de hoy va al medio de su día; lo anterior a hoy se apaga.
  const hoyEn = ((diasEntre(rango.desde, hoy) + 0.5) / rango.total) * 100;
  const dentroHoy = hoy >= rango.desde && hoy <= rango.hasta;
  const meses = { gridTemplateColumns: rango.meses.map((m) => `${m.dias}fr`).join(" ") } as CSSProperties;

  const marcaDeHoy = (rotulo: boolean) =>
    dentroHoy ? (
      <>
        <span aria-hidden className="tw-cal-pasado" style={{ width: `${hoyEn}%` }} />
        <span aria-hidden className="tw-cal-hoy" style={{ left: `${hoyEn}%` }}>
          {rotulo && <span className="tw-cal-hoy-rotulo">Hoy</span>}
        </span>
      </>
    ) : null;

  return (
    <div className="overflow-x-auto px-4 pb-5 pt-7 sm:px-5">
      <div className="tw-cal">
        <span aria-hidden />
        <div className="tw-cal-meses" style={meses} aria-hidden>
          {rango.meses.map((m) => (
            <span key={m.nombre} className="tw-cal-mes">
              {m.nombre}
            </span>
          ))}
        </div>

        <span className="tw-cal-nombre tw-cal-portada">En la portada</span>
        <div className="tw-cal-pista" data-portada data-guia="campanas.portada">
          {tramos.map((t, i) => {
            const b = barraEn(t.desde, t.hasta, rango);
            const c = t.campana ? porId.get(t.campana) : undefined;
            if (!b) return null;
            const nombre = c?.nombre ?? "Lo nuevo";
            return (
              <span
                key={t.desde}
                className="tw-cal-barra"
                data-nuevo={c ? undefined : ""}
                data-color-dato={c ? "" : undefined}
                title={`${nombre}: ${textoRango(t.desde, t.hasta)}`}
                style={{ ...(c ? COLORES_DE_SIEMPRE : {}), left: `${b.izquierda}%`, width: `${b.ancho}%`, ["--i" as string]: i } as CSSProperties}
              >
                {nombre}
                <span className="sr-only"> en la portada, {textoRango(t.desde, t.hasta)}</span>
              </span>
            );
          })}
          {marcaDeHoy(true)}
        </div>

        {filas.map((c, i) => {
          const b = barraEn(c.desde, c.hasta, rango);
          if (!b) return null;
          return (
            <div key={c.id} className="contents">
              <span className="tw-cal-nombre" title={c.nombre}>
                {c.nombre}
              </span>
              <div className="tw-cal-pista">
                <span
                  className="tw-cal-barra"
                  data-color-dato
                  data-corte-antes={b.cortadaAntes ? "" : undefined}
                  data-corte-despues={b.cortadaDespues ? "" : undefined}
                  title={`${c.nombre}: ${textoRango(c.desde, c.hasta) ?? "sin fechas"}`}
                  style={{ ...COLORES_DE_SIEMPRE, left: `${b.izquierda}%`, width: `${b.ancho}%`, ["--i" as string]: i + tramos.length } as CSSProperties}
                >
                  {c.pct ? `−${textoPct(c.pct)} %` : "Sin descuento"}
                  <span className="sr-only">, {textoRango(c.desde, c.hasta)}</span>
                </span>
                {marcaDeHoy(false)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

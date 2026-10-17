import type { CSSProperties } from "react";
import {
  barraEn,
  campanasEnLaLinea,
  coloresDeLaPortada,
  diasEntre,
  disenoDeLaLista,
  textoPct,
  tramosDePortada,
  type CampanaDeLista,
  type DiaPortada,
  type Rango,
} from "@/lib/campanas-reglas";
import { textoRango } from "@/lib/etiqueta-vigencia";
import { nombresEnOrden } from "@/lib/campana-diseno";

/** Los colores de la barra de una campaña: los de la portada que ve el cliente (su diseño publicado, o el de siempre). Son dato, no tema. */
function coloresDeBarra(c: CampanaDeLista): CSSProperties {
  const k = coloresDeLaPortada(c);
  return { "--hf": k.fondo, "--hf2": k.fondo2, "--ht": k.letra } as CSSProperties;
}

/** Lo que dice la barra de una campaña sin descuento: cómo está su diseño. */
const SIN_DESCUENTO = { publicado: "Con diseño", borrador: "Borrador", "de-siempre": "Diseño de siempre" } as const;

/**
 * «La portada, día a día» (maqueta, pantalla 1): arriba, qué campaña anuncia la portada cada día —la que dice la base, tramo por tramo, y
 * «Lo nuevo» donde no hay ninguna—; abajo, una fila por campaña con sus fechas. Cada barra lleva los colores de su diseño publicado; la
 * de una campaña que todavía sale con el de siempre va punteada. La línea marca hoy y apaga lo que ya pasó. Se lee de izquierda a derecha
 * como un calendario; el detalle de cada barra va en su texto para el lector de pantalla.
 */
export function LineaPortada({ campanas, dias, rango, hoy }: { campanas: readonly CampanaDeLista[]; dias: readonly DiaPortada[]; rango: Rango; hoy: string }) {
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
            if (!b) return null;
            const cs = t.campanas.flatMap((id) => {
              const c = porId.get(id);
              return c ? [c] : [];
            });
            const unaSola = cs.length === 1 ? cs[0] : undefined;
            // Con más de una, el carrusel (ADR-0436, actividad 6b): una franja por campaña, en su orden, y el nombre en una pastilla oscura
            // que se lee sobre cualquier color.
            const carrusel = cs.length > 1;
            const nombre = cs.length > 0 ? nombresEnOrden(cs.map((c) => c.nombre)) : "Lo nuevo";
            return (
              <span
                key={t.desde}
                className="tw-cal-barra"
                data-nuevo={cs.length === 0 ? "" : undefined}
                data-carrusel={carrusel ? "" : undefined}
                data-color-dato={cs.length > 0 ? "" : undefined}
                data-de-siempre={unaSola && !unaSola.diseno ? "" : undefined}
                title={`${carrusel ? "En carrusel: " : ""}${nombre}: ${textoRango(t.desde, t.hasta)}`}
                style={{ ...(unaSola ? coloresDeBarra(unaSola) : {}), left: `${b.izquierda}%`, width: `${b.ancho}%`, ["--i" as string]: i } as CSSProperties}
              >
                {carrusel && (
                  <span className="tw-cal-franjas" aria-hidden>
                    {cs.map((c) => (
                      <span key={c.id} style={coloresDeBarra(c)} />
                    ))}
                  </span>
                )}
                <span className="tw-cal-barra-nombre">{nombre}</span>
                <span className="sr-only">
                  {carrusel ? " en carrusel" : ""} en la portada, {textoRango(t.desde, t.hasta)}
                </span>
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
                  data-de-siempre={c.diseno ? undefined : ""}
                  data-corte-antes={b.cortadaAntes ? "" : undefined}
                  data-corte-despues={b.cortadaDespues ? "" : undefined}
                  title={`${c.nombre}: ${textoRango(c.desde, c.hasta) ?? "sin fechas"}`}
                  style={{ ...coloresDeBarra(c), left: `${b.izquierda}%`, width: `${b.ancho}%`, ["--i" as string]: i + tramos.length } as CSSProperties}
                >
                  {c.pct ? `−${textoPct(c.pct)} %` : SIN_DESCUENTO[disenoDeLaLista(c)]}
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

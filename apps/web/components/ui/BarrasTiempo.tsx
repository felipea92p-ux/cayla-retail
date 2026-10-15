import type { CSSProperties, ReactNode } from "react";

/* ====================================================================
   Las barras por hora, día o mes — una sola pieza (ADR-0358, ronda 14, Felipe eligió P1 el 2026-10-15)

   Una barra por hora, por día, por semana o por mes: cuánto se vendió o cuánto vence en cada una.
   · Todas en ARENA (el color de gráfico del sistema) con las esquinas de arriba redondas y un ancho máximo de 28 px; la que importa
     (`destacada`: la hora de ahora, el mejor día, el mes en curso) en TINTA, con su cifra encima. Cuando se lee el monto de cada una,
     `cifras="todas"`. El rojo o el ámbar los pone la pantalla (`tono`: lo vencido); el verde o el ámbar de una diferencia, también.
   · La meta de cada barra es una rayita taupe (`meta`); una sola referencia para todas (el promedio, un día normal), `referencia`.
   · Un valor negativo crece hacia abajo desde la raya del cero (lo que se vendió menos que ayer).
   · Al pasar el mouse, la barra se oscurece y un globito dice lo que pasa la pantalla (`tip`). Con `respuesta`, cada barra es un botón
     (Por pagar filtra la lista con la semana que se toca).
   · Crecen desde abajo en cascada una vez al verse (560 ms, 34 ms entre barras); la cifra aparece al final.
   Sin JavaScript propio: sirve en un Server Component. Registro: docs/unificar/grafico.barras.md. Nunca una fila de barras a mano.
   ==================================================================== */

export type TonoBarraTiempo = "tinta" | "rojo" | "ambar" | "verde";

export type BarraTiempo = {
  clave: string;
  valor: number;
  /** Lo que dice bajo la barra («6», «Lun», «15–21 oct»); vacío, nada. */
  etiqueta?: string;
  /** La etiqueta en negrita (hoy). */
  fuerte?: boolean;
  /** El globito al pasar el mouse (y lo que oye el lector si la barra es un botón). */
  tip?: ReactNode;
  /** La cifra sobre la barra (de fábrica, el valor). */
  cifra?: ReactNode;
  tono?: TonoBarraTiempo;
  /** La meta de esta barra: una rayita taupe. */
  meta?: number | null;
  /** Lo que va sobre la cifra (el punto del cuadre de un cierre). */
  encima?: ReactNode;
  /** Lo que va al pie de la barra (la raya de lo que cubre la caja en Por pagar); lo ubica quien lo pasa. */
  debajo?: ReactNode;
  /** Rayada: la hora que aún no termina. */
  rayada?: boolean;
  /** Lo que dice el lector cuando la barra es un botón. */
  aria?: string;
};

type Respuesta = {
  /** Tocar una barra (filtrar la lista, abrir el día). */
  onElegir?: (clave: string) => void;
  /** La barra elegida (las demás se apagan); `undefined` si la pantalla no filtra. */
  elegida?: string | null;
  /** Pasar el mouse o el foco por una barra (la pantalla resalta lo suyo). */
  onApuntar?: (clave: string | null) => void;
};

export function BarrasTiempo({
  barras,
  destacada = null,
  cifras = "destacada",
  referencia = null,
  alto = 140,
  max,
  respuesta,
  etiqueta,
  decorativa = false,
  className = "",
}: {
  barras: readonly BarraTiempo[];
  /** La que importa: en tinta y con su cifra. */
  destacada?: string | null;
  /** Qué barras llevan su cifra encima. */
  cifras?: "destacada" | "todas" | "ninguna";
  /** Una sola referencia para todas: una raya taupe punteada de lado a lado. */
  referencia?: { valor: number; texto?: string } | null;
  /** El alto de la zona de las barras, en px (de fábrica 140). */
  alto?: number;
  /** El tope del eje (de fábrica, la mayor barra o meta). */
  max?: number;
  respuesta?: Respuesta;
  /** Lo que le dice al lector de pantalla del gráfico entero. */
  etiqueta: string;
  /** El texto de al lado ya dice lo mismo: el gráfico se oculta al lector. */
  decorativa?: boolean;
  className?: string;
}) {
  const n = barras.length;
  const conCifra = (b: BarraTiempo) => cifras === "todas" || (cifras === "destacada" && b.clave === destacada);
  const reservaArriba = barras.some((b) => conCifra(b) || b.encima) ? 22 : 6;
  const arriba = Math.max(0, ...barras.map((b) => Math.max(b.valor, b.meta ?? 0)), referencia?.valor ?? 0);
  const abajo = Math.max(0, ...barras.map((b) => -b.valor));
  const tope = Math.max(max ?? 0, arriba, 1e-9);
  const divergente = abajo > 0;
  const util = alto - reservaArriba - (divergente ? 18 : 0);
  // La raya del cero: abajo del todo, o donde reparta lo que sube y lo que baja.
  const cero = divergente ? Math.round((util * abajo) / (tope + abajo)) + (divergente ? 18 : 0) : 0;
  const escala = divergente ? (util * tope) / (tope + abajo) / tope : util / tope;
  const px = (v: number) => (v === 0 ? 0 : Math.max(3, Math.round(Math.abs(v) * escala)));
  // Cada barra es un botón solo si tocarla hace algo; si la pantalla solo quiere saber cuál se apunta (el Historial, con hasta 120 días),
  // basta el mouse: 120 paradas del teclado no se recorren.
  const responde = !decorativa && !!respuesta?.onElegir;
  const apunta = !decorativa && !!respuesta?.onApuntar;
  const elegida = respuesta?.elegida;
  const filtra = elegida !== undefined && elegida !== null;
  const hueco = n > 40 ? 1 : n > 20 ? 2 : 4;
  const columnas = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: hueco } as CSSProperties;
  const raiz = decorativa ? { "aria-hidden": true as const } : responde ? { role: "group" as const, "aria-label": etiqueta } : { role: "img" as const, "aria-label": etiqueta };

  return (
    <div {...raiz} className={`barras-tiempo ${className}`}>
      <div className="barras-tiempo-zona" style={{ height: alto }}>
        {divergente && <span aria-hidden className="barras-tiempo-cero" style={{ bottom: cero }} />}
        {referencia && (
          <span aria-hidden className="barras-tiempo-ref" style={{ bottom: cero + px(referencia.valor) }}>
            {referencia.texto && <span>{referencia.texto}</span>}
          </span>
        )}
        <div className="barras-tiempo-columnas" style={columnas}>
          {barras.map((b, i) => {
            const h = px(b.valor);
            const baja = b.valor < 0;
            const tono = b.tono ?? (b.clave === destacada ? "tinta" : undefined);
            const lado = i < 2 ? "izq" : i > n - 3 ? "der" : undefined;
            const cuerpo = (
              <>
                <span
                  aria-hidden
                  className="barra-t-relleno"
                  data-baja={baja || undefined}
                  data-rayada={b.rayada || undefined}
                  style={{ height: h, ...(baja ? { top: alto - cero } : { bottom: cero }), ["--i" as string]: Math.min(i, 24) }}
                />
                {b.meta != null && b.meta > 0 && <span aria-hidden className="barra-t-meta" style={{ bottom: cero + px(b.meta) - 1 }} />}
                {(conCifra(b) || b.encima) && (
                  <span aria-hidden className="barra-t-encima" style={baja ? { top: alto - cero + h + 3 } : { bottom: cero + h + 3 }}>
                    {b.encima}
                    {conCifra(b) && <span className="barra-t-cifra">{b.cifra ?? b.valor.toLocaleString("es-PE")}</span>}
                  </span>
                )}
                {b.tip && (
                  <span aria-hidden className="barra-t-globo" data-lado={lado} style={{ bottom: cero + (baja ? 0 : h) + 8 }}>
                    {b.tip}
                  </span>
                )}
                {b.debajo}
              </>
            );
            const comunes = {
              "data-tono": tono,
              "data-apagada": filtra && elegida !== b.clave ? "" : undefined,
              className: "barra-t",
            };
            if (responde) {
              return (
                <button
                  key={b.clave}
                  type="button"
                  {...comunes}
                  aria-label={b.aria}
                  aria-pressed={elegida !== undefined ? elegida === b.clave : undefined}
                  onClick={respuesta?.onElegir ? () => respuesta.onElegir?.(b.clave) : undefined}
                  onMouseEnter={() => respuesta?.onApuntar?.(b.clave)}
                  onMouseLeave={() => respuesta?.onApuntar?.(null)}
                  onFocus={() => respuesta?.onApuntar?.(b.clave)}
                  onBlur={() => respuesta?.onApuntar?.(null)}
                >
                  {cuerpo}
                </button>
              );
            }
            return (
              <span
                key={b.clave}
                {...comunes}
                onMouseEnter={apunta ? () => respuesta?.onApuntar?.(b.clave) : undefined}
                onMouseLeave={apunta ? () => respuesta?.onApuntar?.(null) : undefined}
              >
                {cuerpo}
              </span>
            );
          })}
        </div>
      </div>
      {barras.some((b) => b.etiqueta) && (
        <div aria-hidden className="barras-tiempo-eje" style={columnas}>
          {barras.map((b) => (
            <span key={b.clave} className={b.fuerte || b.clave === destacada ? "barras-tiempo-eje-fuerte" : undefined}>
              {b.etiqueta ?? ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

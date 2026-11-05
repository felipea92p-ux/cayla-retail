"use client";

import { Fragment, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Rows3 } from "lucide-react";
import { etiquetaDeHora, mismaSemana, DIAS_LARGOS, type MomentoEnLima, type SemanaDeTienda, type TramoDia } from "@cayla-retail/shared/horario-de-tienda";
import {
  conAperturaEn, conCierreEn, conTecla, corridoPor, minutoDeLaPista, porcentajeDeMinuto, rangoVisible, semanaComoElLunes, tramoParaAbrir, tramoPintado, type RangoVisible,
} from "@/lib/horario-edicion-reglas";

/** La letra de cada día, de lunes a domingo («X» es el miércoles: «M» ya es el martes). */
const LETRAS = ["L", "M", "X", "J", "V", "S", "D"] as const;

/** Cómo se rotula una hora en el eje de arriba, sin sobrar: «8 a», «12 m», «2 p». */
function etiquetaDelEje(min: number): string {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12} ${h === 12 ? "m" : h < 12 ? "a" : "p"}`;
}

type Gesto = { dia: number; modo: "pintar" | "mover" | "abre" | "cierra"; minuto0: number; original: TramoDia | null; rango: RangoVisible; ancho: number; movio: boolean; resultado: TramoDia | null };

/**
 * El horario por días, para pintar (Tienda web ▸ Conf. Tienda, maqueta de 2026-10-26). Cada día es una barra con dos asas: se arrastra un borde
 * para cambiar esa hora, la barra entera para correrla, un hueco para pintar una nueva, y un día cerrado se abre con un toque. Todo de a media
 * hora. Con teclado: ←/→ corren la barra, Mayús + ←/→ mueven el cierre, Alt + ←/→ la apertura, Suprimir cierra el día. La línea roja es la hora de
 * ahora (de Lima) sobre el día de hoy. Es un campo CONTROLADO: no guarda nada, avisa cada cambio con `onCambio`; el gesto se ve mientras se hace
 * y recién al soltar se avisa (una sola vez). La lógica de los números vive en `lib/horario-edicion-reglas.ts`.
 */
export function HorarioSemanal({
  valor,
  onCambio,
  ahora,
  cierreHoy = false,
  deshabilitado = false,
}: {
  valor: SemanaDeTienda;
  onCambio: (semana: SemanaDeTienda) => void;
  ahora: MomentoEnLima | null;
  /** Hoy la tienda cierra por una fecha (feriado, inventario): la pista de hoy lo dice. */
  cierreHoy?: boolean;
  deshabilitado?: boolean;
}) {
  const [vista, setVista] = useState<{ dia: number; tramo: TramoDia } | null>(null);
  const gesto = useRef<Gesto | null>(null);
  const rango = rangoVisible(valor);
  const mostrada = vista ? valor.map((t, i) => (i === vista.dia ? vista.tramo : t)) : valor;

  const poner = (dia: number, tramo: TramoDia | null) => onCambio(valor.map((t, i) => (i === dia ? tramo : t)));
  const fraccion = (e: PointerEvent<HTMLElement>, g: Gesto) => (e.clientX - e.currentTarget.getBoundingClientRect().left) / g.ancho;

  function empezar(e: PointerEvent<HTMLDivElement>, dia: number) {
    if (deshabilitado || (e.pointerType === "mouse" && e.button !== 0) || (cierreHoy && ahora?.dia === dia)) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const asa = (e.target as HTMLElement).closest<HTMLElement>("[data-asa]")?.dataset.asa;
    const original = valor[dia] ?? null;
    const modo: Gesto["modo"] = asa === "abre" || asa === "cierra" ? asa : (e.target as HTMLElement).closest("[data-tramo]") ? "mover" : "pintar";
    const g: Gesto = { dia, modo, minuto0: 0, original, rango, ancho: caja.width, movio: false, resultado: null };
    g.minuto0 = minutoDeLaPista(fraccion(e, g), rango);
    gesto.current = g;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function mover(e: PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    if (!g) return;
    const minuto = minutoDeLaPista(fraccion(e, g), g.rango);
    if (!g.movio && minuto === g.minuto0) return;
    g.movio = true;
    const t = g.original;
    const tramo =
      g.modo === "abre" && t ? conAperturaEn(t, minuto, g.rango)
      : g.modo === "cierra" && t ? conCierreEn(t, minuto, g.rango)
      : g.modo === "mover" && t ? corridoPor(t, minuto - g.minuto0, g.rango)
      : tramoPintado(g.minuto0, minuto, g.rango);
    // El último tramo se guarda en el propio gesto: soltar el mouse puede llegar antes de que React vuelva a pintar, y `vista` aún sería el anterior.
    g.resultado = tramo;
    setVista({ dia: g.dia, tramo });
  }

  function soltar() {
    const g = gesto.current;
    gesto.current = null;
    setVista(null);
    if (!g) return;
    if (g.movio && g.resultado) poner(g.dia, g.resultado);
    // Un toque sin arrastrar: en un día cerrado lo abre; sobre una barra no hace nada (para cerrarlo está la letra del día).
    else if (!g.movio && !g.original) poner(g.dia, tramoParaAbrir(g.rango));
  }

  function cancelar() {
    gesto.current = null;
    setVista(null);
  }

  function teclas(e: KeyboardEvent<HTMLDivElement>, dia: number, tramo: TramoDia) {
    if (deshabilitado) return;
    const r = conTecla(tramo, e.key, { mayus: e.shiftKey, alt: e.altKey }, rango);
    if (r === null) return;
    e.preventDefault();
    poner(dia, r === "cerrar" ? null : r);
  }

  const horas: number[] = [];
  for (let m = Math.ceil(rango.desde / 120) * 120; m <= rango.hasta; m += 120) horas.push(m);
  const lunesAbierto = valor[0] !== null;
  const yaIgual = mismaSemana(valor, semanaComoElLunes(valor));

  return (
    <div className="twc-horario">
      <div className="twc-horas" role="group" aria-label="Horario por días">
        <div className="twc-eje" aria-hidden>
          {horas.map((m) => (
            <span key={m} style={{ left: `${porcentajeDeMinuto(m, rango)}%` }}>
              {etiquetaDelEje(m)}
            </span>
          ))}
        </div>
        {LETRAS.map((letra, i) => {
          const t = mostrada[i] ?? null;
          const cerradoHoy = cierreHoy && ahora?.dia === i;
          return (
            <Fragment key={letra + i}>
              <button
                type="button"
                className="twc-dia"
                data-hoy={ahora?.dia === i ? "" : undefined}
                aria-pressed={valor[i] !== null}
                aria-label={`${DIAS_LARGOS[i]}: ${valor[i] ? "abierto, toca para cerrar" : "cerrado, toca para abrir"}`}
                title={valor[i] ? `Cerrar el ${DIAS_LARGOS[i].toLocaleLowerCase("es")}` : `Abrir el ${DIAS_LARGOS[i].toLocaleLowerCase("es")}`}
                disabled={deshabilitado}
                onClick={() => poner(i, valor[i] ? null : tramoParaAbrir(rango))}
              >
                {letra}
              </button>
              <div
                className="twc-pista"
                data-dia={i}
                data-cerrado={!t || cerradoHoy ? "" : undefined}
                data-cierre={cerradoHoy ? "" : undefined}
                onPointerDown={(e) => empezar(e, i)}
                onPointerMove={mover}
                onPointerUp={soltar}
                onPointerCancel={cancelar}
              >
                {t && !cerradoHoy && (
                  <div
                    className="twc-tramo"
                    data-tramo
                    data-moviendo={vista?.dia === i ? "" : undefined}
                    tabIndex={deshabilitado ? -1 : 0}
                    role="group"
                    aria-label={`${DIAS_LARGOS[i]}, de ${etiquetaDeHora(t.abre)} a ${etiquetaDeHora(t.cierra)}`}
                    aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Alt+ArrowLeft Alt+ArrowRight Delete"
                    onKeyDown={(e) => teclas(e, i, t)}
                    style={{ left: `${porcentajeDeMinuto(t.abre, rango)}%`, width: `${porcentajeDeMinuto(t.cierra, rango) - porcentajeDeMinuto(t.abre, rango)}%` }}
                  >
                    <i className="twc-asa-h" data-asa="abre" aria-hidden />
                    <span>{etiquetaDeHora(t.abre)}</span>
                    <span>{etiquetaDeHora(t.cierra)}</span>
                    <i className="twc-asa-h" data-asa="cierra" aria-hidden />
                  </div>
                )}
                {ahora?.dia === i && ahora.minutos >= rango.desde && ahora.minutos <= rango.hasta && (
                  <span className="twc-ahora" aria-hidden style={{ left: `${porcentajeDeMinuto(ahora.minutos, rango)}%` }} />
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="twc-horario-pie">
        <button
          type="button"
          className="btn-cayla btn-sutil btn-chico"
          disabled={deshabilitado || !lunesAbierto || yaIgual}
          onClick={() => onCambio(semanaComoElLunes(valor))}
        >
          <Rows3 aria-hidden className="h-3.5 w-3.5" /> Copiar lunes a todos
        </button>
      </div>
    </div>
  );
}

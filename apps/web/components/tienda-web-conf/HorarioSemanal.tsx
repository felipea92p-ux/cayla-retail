"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Rows3 } from "lucide-react";
import { Interruptor } from "@/components/ui/campos";
import { etiquetaDeHora, mismaSemana, DIAS_CORTOS, DIAS_LARGOS, type MomentoEnLima, type SemanaDeTienda, type TramoDia } from "@cayla-retail/shared/horario-de-tienda";
import {
  conAperturaEn, conCierreEn, conTecla, corridoPor, lunesALosDiasAbiertos, minutoDeLaPista, porcentajeDeMinuto, rangoVisible, tramoAlAbrirDia, type RangoVisible,
} from "@/lib/horario-edicion-reglas";

/** Cómo se rotula una hora en el eje de arriba, sin sobrar: «8 a», «12 m», «2 p». */
function etiquetaDelEje(min: number): string {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12} ${h === 12 ? "m" : h < 12 ? "a" : "p"}`;
}

/** Cuánto ancho (en pantalla) necesita una barra para que sus dos horas y sus dos asas no se pisen; menos que eso, las horas se leen a la derecha. */
const ANCHO_PARA_LAS_HORAS = 150;
/** Bajo este ancho las asas se adelgazan para dejar un pedazo de barra que agarrar. */
const ANCHO_CORTO = 64;

type Gesto = { dia: number; modo: "mover" | "abre" | "cierra"; minuto0: number; original: TramoDia; rango: RangoVisible; ancho: number; movio: boolean; resultado: TramoDia | null };

/**
 * El horario por días (Tienda web ▸ Conf. Tienda, maqueta de 2026-10-26; rehecho el 2026-11-10). Cada día tiene su INTERRUPTOR de abierto/cerrado —lo
 * que no se trabaja (el domingo) queda en «Cerrado» y ahí no pasa nada: ya no se «pinta» una barra por un arrastre sin querer— y, abierto, una barra
 * con dos asas: se arrastra un borde para cambiar esa hora y la barra entera para correrla. Todo de a 15 minutos. Un día que se abre toma el
 * horario del día abierto de antes. Con teclado: ←/→ corren la barra, Mayús + ←/→ mueven el cierre, Alt + ←/→ la apertura, Suprimir cierra el
 * día. La línea roja es la hora de ahora (de Lima) sobre el día de hoy. Es un campo CONTROLADO: no guarda nada, avisa cada cambio con `onCambio`;
 * el gesto se ve mientras se hace y recién al soltar se avisa (una sola vez). La lógica de los números vive en `lib/horario-edicion-reglas.ts`.
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
  const [anchoPista, setAnchoPista] = useState(0);
  const gesto = useRef<Gesto | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const rango = rangoVisible(valor);
  const mostrada = vista ? valor.map((t, i) => (i === vista.dia ? vista.tramo : t)) : valor;

  // El ancho real de una pista: de él depende si la barra tiene lugar para sus horas.
  useEffect(() => {
    const pista = raiz.current?.querySelector<HTMLElement>(".twc-pista");
    if (!pista || typeof ResizeObserver === "undefined") return;
    const mide = () => setAnchoPista(pista.getBoundingClientRect().width);
    mide();
    const obs = new ResizeObserver(mide);
    obs.observe(pista);
    return () => obs.disconnect();
  }, []);

  const poner = (dia: number, tramo: TramoDia | null) => onCambio(valor.map((t, i) => (i === dia ? tramo : t)));
  const fraccion = (e: PointerEvent<HTMLElement>, g: Gesto) => (e.clientX - e.currentTarget.getBoundingClientRect().left) / g.ancho;

  function empezar(e: PointerEvent<HTMLDivElement>, dia: number) {
    const original = valor[dia] ?? null;
    // Un día cerrado no se toca con el mouse: se abre con su interruptor (un arrastre sin querer ya no le inventa una barra).
    if (!original || deshabilitado || (e.pointerType === "mouse" && e.button !== 0) || (cierreHoy && ahora?.dia === dia)) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const asa = (e.target as HTMLElement).closest<HTMLElement>("[data-asa]")?.dataset.asa;
    const modo: Gesto["modo"] = asa === "abre" || asa === "cierra" ? asa : "mover";
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
    const tramo = g.modo === "abre" ? conAperturaEn(t, minuto, g.rango) : g.modo === "cierra" ? conCierreEn(t, minuto, g.rango) : corridoPor(t, minuto - g.minuto0, g.rango);
    // El último tramo se guarda en el propio gesto: soltar el mouse puede llegar antes de que React vuelva a pintar, y `vista` aún sería el anterior.
    g.resultado = tramo;
    setVista({ dia: g.dia, tramo });
  }

  function soltar() {
    const g = gesto.current;
    gesto.current = null;
    setVista(null);
    if (g?.movio && g.resultado) poner(g.dia, g.resultado);
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
  const yaIgual = mismaSemana(valor, lunesALosDiasAbiertos(valor));

  return (
    <div className="twc-horario" ref={raiz}>
      <div className="twc-horas" role="group" aria-label="Horario por días">
        <div className="twc-eje" aria-hidden>
          {horas.map((m) => (
            <span key={m} style={{ left: `${porcentajeDeMinuto(m, rango)}%` }}>
              {etiquetaDelEje(m)}
            </span>
          ))}
        </div>
        {DIAS_CORTOS.map((corto, i) => {
          const t = mostrada[i] ?? null;
          const cerradoHoy = cierreHoy && ahora?.dia === i;
          const barra = t ? ((t.cierra - t.abre) / (rango.hasta - rango.desde)) * anchoPista : 0;
          const conHoras = barra >= ANCHO_PARA_LAS_HORAS;
          const horasTexto = t ? `${etiquetaDeHora(t.abre)} – ${etiquetaDeHora(t.cierra)}` : "";
          return (
            <Fragment key={corto}>
              <div className="twc-dia" data-hoy={ahora?.dia === i ? "" : undefined}>
                <Interruptor
                  activo={valor[i] !== null}
                  onActivo={(abre) => poner(i, abre ? tramoAlAbrirDia(valor, i, rango) : null)}
                  disabled={deshabilitado}
                  etiqueta={
                    <>
                      <span aria-hidden>{corto}</span>
                      <span className="sr-only">{`${DIAS_LARGOS[i]}: ${valor[i] ? "abierto" : "cerrado"}`}</span>
                    </>
                  }
                />
              </div>
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
                    data-corto={barra < ANCHO_CORTO ? "" : undefined}
                    tabIndex={deshabilitado ? -1 : 0}
                    role="group"
                    title={horasTexto}
                    aria-label={`${DIAS_LARGOS[i]}, de ${etiquetaDeHora(t.abre)} a ${etiquetaDeHora(t.cierra)}`}
                    aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Alt+ArrowLeft Alt+ArrowRight Delete"
                    onKeyDown={(e) => teclas(e, i, t)}
                    style={{ left: `${porcentajeDeMinuto(t.abre, rango)}%`, width: `${porcentajeDeMinuto(t.cierra, rango) - porcentajeDeMinuto(t.abre, rango)}%` }}
                  >
                    <i className="twc-asa-h" data-asa="abre" aria-hidden />
                    {conHoras && (
                      <>
                        <span>{etiquetaDeHora(t.abre)}</span>
                        <span>{etiquetaDeHora(t.cierra)}</span>
                      </>
                    )}
                    <i className="twc-asa-h" data-asa="cierra" aria-hidden />
                  </div>
                )}
                {ahora?.dia === i && ahora.minutos >= rango.desde && ahora.minutos <= rango.hasta && (
                  <span className="twc-ahora" aria-hidden style={{ left: `${porcentajeDeMinuto(ahora.minutos, rango)}%` }} />
                )}
              </div>
              <span className="twc-horas-texto" aria-hidden>
                {horasTexto}
              </span>
            </Fragment>
          );
        })}
      </div>
      <div className="twc-horario-pie">
        <button
          type="button"
          className="btn-cayla btn-sutil btn-chico"
          title="Los días abiertos toman el horario del lunes; los cerrados siguen cerrados"
          disabled={deshabilitado || !lunesAbierto || yaIgual}
          onClick={() => onCambio(lunesALosDiasAbiertos(valor))}
        >
          <Rows3 aria-hidden className="h-3.5 w-3.5" /> Copiar lunes a los abiertos
        </button>
      </div>
    </div>
  );
}

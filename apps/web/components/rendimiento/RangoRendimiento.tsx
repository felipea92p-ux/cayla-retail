"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useDestinoFlotante } from "@/components/ui/useAnclaje";
import { useEnCelular } from "@/components/ui/useEnCelular";
import { diaPorTecla, diasDelMes, fechaLarga, marcaDelDia, nombreDelMes, sumarDias, sumarMeses } from "@/lib/estados-periodo";
import { motivoDelDia, pisoDelRango, RANGO_MAX_DIAS, type MotivoDiaDelRango, type Tramo } from "@/lib/rendimiento-vista-reglas";

/* ====================================================================
   El rango a medida de Rendimiento (Felipe 2026-11-17; maqueta docs/maquetas/rendimiento-rango-2026-11/): SOLO un calendario. Se toca el primer día y el
   último, y al segundo toque el rango se aplica y el calendario se cierra: sin atajos, sin campos, sin botones. Las flechas cambian de mes. Las reglas
   (hasta 30 días contando los dos extremos, del 1.º del mes pasado a hoy) son de `rendimiento-vista-reglas.ts`: aquí solo se dibujan. Los días que no
   se pueden elegir se apagan, y los que pasan de 30 días se rayan; nunca hay un mensaje de error.
   ==================================================================== */

const ANCHO_PANEL = 340;
const DIAS_DE_LA_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const motivoEnPalabras = (m: MotivoDiaDelRango, piso: string): string =>
  m === "futuro" ? "Todavía no llega" : m === "antes" ? `Se mira desde el ${fechaLarga(piso)}` : `Pasa de ${RANGO_MAX_DIAS} días`;

/** El día al que va el cursor con una tecla: las flechas, el principio y el fin de la semana (lunes a domingo) y el mes de antes o el de después. */
function diaPorTeclaDelRango(iso: string, tecla: string, hoy: string, piso: string): string | null {
  const semana = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  let destino: string | null = null;
  if (tecla === "Home") destino = sumarDias(iso, -semana);
  else if (tecla === "End") destino = sumarDias(iso, 6 - semana);
  else if (tecla === "PageUp" || tecla === "PageDown") {
    const mes = sumarMeses(iso.slice(0, 7), tecla === "PageUp" ? -1 : 1);
    const n = Math.min(Number(iso.slice(8, 10)), Number(sumarDias(`${sumarMeses(mes, 1)}-01`, -1).slice(8, 10)));
    destino = `${mes}-${String(n).padStart(2, "0")}`;
  } else return diaPorTecla(iso, tecla, hoy, piso);
  if (destino > hoy) return hoy;
  return destino < piso ? piso : destino;
}

export function RangoRendimiento({
  actual,
  hoy,
  control,
  volverA,
  onAplicar,
  onCerrar,
}: {
  /** El rango a medida que ya está puesto (`null`: se mira Hoy, 7 días o Este mes). */
  actual: Tramo | null;
  hoy: string;
  /** Lo que se toca para abrirlo: el calendario flota debajo, con su borde derecho alineado. */
  control: RefObject<HTMLElement | null>;
  volverA: RefObject<HTMLElement | null>;
  onAplicar: (t: Tramo) => void;
  onCerrar: () => void;
}) {
  const enCelular = useEnCelular();
  const panel = useRef<HTMLDivElement>(null);
  const destino = useDestinoFlotante(control, true);
  const piso = pisoDelRango(hoy);
  const mesPiso = piso.slice(0, 7);
  const mesHoy = hoy.slice(0, 7);
  const [visible, setVisible] = useState((actual?.hasta ?? hoy).slice(0, 7));
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [foco, setFoco] = useState(actual?.hasta ?? hoy);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const llevarFoco = useRef<string | null>(null);

  // Flota bajo el control, con su borde derecho alineado al de él. Es `fixed` y colgado del documento: la cabecera no lo recorta.
  useLayoutEffect(() => {
    if (enCelular) return;
    function calcular() {
      const r = control.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = Math.min(ANCHO_PANEL, window.innerWidth - 16);
      setPos({ top: r.bottom + 10, right: Math.min(Math.max(8, window.innerWidth - r.right), window.innerWidth - ancho - 8) });
    }
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [control, enCelular]);

  // Escape cierra y devuelve el foco. En el celular lo hace la hoja. Es de este control: no sube a nadie más (ADR-0136).
  useEffect(() => {
    if (enCelular) return;
    function alTeclear(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCerrar();
      volverA.current?.focus({ preventScroll: true });
    }
    // En captura: la pantalla tiene su propio Escape (limpiar lo puesto) y no debe oírlo si el Escape era de esta hoja, tenga o no el foco adentro.
    document.addEventListener("keydown", alTeclear, true);
    return () => document.removeEventListener("keydown", alTeclear, true);
  }, [enCelular, onCerrar, volverA]);

  // Al abrir, el foco va al día que importa (en el celular lo lleva la hoja: un foco ajeno al abrir la dejaría a medias).
  const colocado = pos !== null;
  useEffect(() => {
    if (enCelular || !colocado) return;
    panel.current?.querySelector<HTMLElement>("[data-dia][tabindex='0']")?.focus({ preventScroll: true });
  }, [enCelular, colocado]);

  // La flecha cambió de día (y quizás de mes): el foco va a ese día cuando ya está dibujado.
  useEffect(() => {
    if (!llevarFoco.current) return;
    panel.current?.querySelector<HTMLElement>(`[data-dia="${llevarFoco.current}"]`)?.focus({ preventScroll: true });
    llevarFoco.current = null;
  });

  const { huecos, dias } = useMemo(() => diasDelMes(visible, hoy, null), [visible, hoy]);
  const motivoDe = (iso: string) => motivoDelDia(iso, hoy, pendiente);
  const habilitados = dias.filter((d) => motivoDe(d.iso) === null);
  const conTab = habilitados.some((d) => d.iso === foco) ? foco : (habilitados.at(-1)?.iso ?? null);

  // El rango que se ve pintado: el que se está armando (hasta donde apunta el mouse, si se puede) o, si no, el que ya estaba puesto.
  const hasta = sobre !== null && pendiente !== null && sobre > pendiente && motivoDelDia(sobre, hoy, pendiente) === null ? sobre : pendiente;
  const pintado: Tramo | null = pendiente !== null && hasta !== null ? { desde: pendiente, hasta } : pendiente === null ? actual : null;

  function elegirDia(iso: string) {
    if (motivoDelDia(iso, hoy, pendiente) !== null) return;
    // El primer toque; uno anterior al primero lo reemplaza (pasa a ser el primero).
    if (pendiente === null || iso < pendiente) {
      setPendiente(iso);
      setSobre(iso);
      setFoco(iso);
      return;
    }
    // El segundo día aplica y cierra: sin botón de «Aplicar».
    onAplicar({ desde: pendiente, hasta: iso });
  }

  function alTeclearDias(e: KeyboardEvent<HTMLDivElement>) {
    const dia = (e.target as HTMLElement).closest<HTMLElement>("[data-dia]")?.dataset.dia;
    if (!dia) return;
    const nuevo = diaPorTeclaDelRango(dia, e.key, hoy, piso);
    if (!nuevo || motivoDelDia(nuevo, hoy, pendiente) !== null) return;
    e.preventDefault();
    setFoco(nuevo);
    if (pendiente !== null) setSobre(nuevo);
    if (nuevo.slice(0, 7) !== visible) setVisible(nuevo.slice(0, 7));
    llevarFoco.current = nuevo;
  }

  function alPasarPorDias(e: PointerEvent<HTMLDivElement>) {
    if (pendiente === null) return;
    const dia = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-dia]:not(:disabled)")?.dataset.dia;
    if (dia) setSobre(dia);
  }

  const cuerpo = (
    <div className="rango-marco">
      <p className="sr-only" aria-live="polite">
        {pendiente === null ? "Toca el primer día." : `Ahora el último día, hasta ${RANGO_MAX_DIAS} días.`}
      </p>
      <div className="rango-cabeza">
        <button type="button" className="rango-flecha area-dedo" disabled={visible <= mesPiso} aria-label="Mes anterior" onClick={() => setVisible((v) => sumarMeses(v, -1))}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <div className="rango-mes-nombre" aria-live="polite">
          {nombreDelMes(visible)}
        </div>
        <button type="button" className="rango-flecha area-dedo" disabled={visible >= mesHoy} aria-label="Mes siguiente" onClick={() => setVisible((v) => sumarMeses(v, 1))}>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="rango-semana" aria-hidden>
        {DIAS_DE_LA_SEMANA.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="rango-dias" role="group" aria-label={nombreDelMes(visible)} onKeyDown={alTeclearDias} onPointerOver={alPasarPorDias}>
        {Array.from({ length: huecos }, (_, i) => (
          <span key={i} />
        ))}
        {dias.map((d) => {
          const motivo = motivoDe(d.iso);
          const m = marcaDelDia(d.iso, pintado ?? { desde: "9999-12-31", hasta: "9999-12-31" }, hoy);
          return (
            <button
              key={d.iso}
              type="button"
              className="rango-dia tabular-nums"
              disabled={motivo !== null}
              title={motivo ? motivoEnPalabras(motivo, piso) : undefined}
              tabIndex={d.iso === conTab ? 0 : -1}
              data-dia={d.iso}
              data-tramo={(m.dentro && !m.solo) || undefined}
              data-punta={m.inicio ? "inicio" : m.fin ? "fin" : m.solo ? "solo" : undefined}
              data-hoy={m.hoy || undefined}
              data-largo={motivo === "largo" || undefined}
              data-izquierda={m.bordeIzquierdo || undefined}
              data-derecha={m.bordeDerecho || undefined}
              aria-label={`${fechaLarga(d.iso)}${motivo ? `. ${motivoEnPalabras(motivo, piso)}` : ""}`}
              aria-pressed={m.dentro}
              aria-current={m.hoy ? "date" : undefined}
              style={{ "--i": d.n } as CSSProperties}
              onClick={() => elegirDia(d.iso)}
            >
              {d.n}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (enCelular) {
    return (
      <Modal titulo="Rango de fechas" onClose={onCerrar} conCerrar focoEnLaHoja alCerrarEnfocar={volverA}>
        {/* Bajo el título y la ✕: el calendario no se monta sobre ellos. */}
        <div className="mt-5">{cuerpo}</div>
      </Modal>
    );
  }
  if (!pos || !destino) return null;
  return createPortal(
    <>
      {/* Tocar afuera cierra, como `SelectorMes` y `MenuAcciones`. */}
      <div className="fixed inset-0 z-[59]" onClick={onCerrar} aria-hidden />
      <div ref={panel} role="dialog" aria-label="Rango de fechas: toca el primer día y el último" style={{ top: pos.top, right: pos.right, maxHeight: `calc(100dvh - ${pos.top}px - 12px)` }} className="rango-panel anim-revelar z-[60]">
        {cuerpo}
      </div>
    </>,
    destino,
  );
}

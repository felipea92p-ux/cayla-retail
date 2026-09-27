"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ALTO_CONTROL, Campo, Hilo } from "@/components/ui/campos";

/* ====================================================================
   CampoFecha · elegir un día (2026-09-14)

   Por qué existe: los cinco campos de fecha del ERP usaban el
   `<input type="date">` del navegador. Chrome dibuja un calendario chico
   con "set. 2026" abreviado y la semana empezando en domingo; Safari
   uno distinto; en cada máquina se ve otra cosa. Felipe pidió que los
   calendarios estuvieran a la altura del resto del sistema.

   Cómo se comporta:
   · Se tipea `dd/mm/aaaa` directo, sin abrir nada — el calendario es
     ayuda, no obligación. Al completar los 8 dígitos ya cuenta como
     elegido; si lo tipeado no es una fecha real (31/02), al salir del
     campo vuelve a la última válida.
   · El calendario abre con el botón de la derecha o con ↓ desde el
     input. Flechas mueven un día / una semana, PageUp/PageDown un mes,
     Enter elige, Escape cierra. Clic afuera cierra.
   · Semana de lunes a domingo, meses en español, "Hoy" a un clic. El
     día de hoy lleva un punto; el elegido va en rojo — el acento del
     sistema, que acá sí es información y no decoración.

   Hacia afuera el valor sigue siendo ISO `aaaa-mm-dd` (o "" si está
   vacío), igual que devolvía el input nativo: ningún llamador cambia su
   lógica ni sus consultas.

   Modo `estricto` (2026-09-21, los rangos de Análisis) — opt-in. Volver en
   silencio a la última fecha válida es lo correcto para un campo suelto,
   pero en un rango deja a la persona sin saber por qué «Aplicar» usó otra
   fecha que la que escribió. Con `estricto`, lo tipeado que no es una fecha
   real (31/02, a medias) se queda para corregirlo, con un aviso en línea al
   salir del campo —o cuando el llamador lo pide con `revelarError`, al
   intentar aplicar— y `onValor("")` le dice que ahora no hay fecha válida.
   Sin `estricto` todo sigue exactamente como arriba.
   ==================================================================== */

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

// Todo el cálculo es con año/mes/día sueltos, nunca con `new Date(iso)`:
// ese parseo es UTC y en Lima (UTC-5) corre la fecha un día para atrás.
type Dia = { a: number; m: number; d: number }; // m: 0-11

function aIso({ a, m, d }: Dia): string {
  return `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function deIso(iso: string): Dia | null {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!p) return null;
  const dia = { a: Number(p[1]), m: Number(p[2]) - 1, d: Number(p[3]) };
  return esReal(dia) ? dia : null;
}
function esReal({ a, m, d }: Dia): boolean {
  return m >= 0 && m <= 11 && d >= 1 && d <= new Date(a, m + 1, 0).getDate();
}
function hoy(): Dia {
  const t = new Date();
  return { a: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}
function aTexto(dia: Dia | null): string {
  return dia ? `${String(dia.d).padStart(2, "0")}/${String(dia.m + 1).padStart(2, "0")}/${dia.a}` : "";
}
function deTexto(texto: string): Dia | null {
  const p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!p) return null;
  const dia = { a: Number(p[3]), m: Number(p[2]) - 1, d: Number(p[1]) };
  return esReal(dia) ? dia : null;
}
function sumarDias(dia: Dia, n: number): Dia {
  const t = new Date(dia.a, dia.m, dia.d + n);
  return { a: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}
function sumarMeses(dia: Dia, n: number): Dia {
  const m = dia.m + n;
  const a = dia.a + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return { a, m: mm, d: Math.min(dia.d, new Date(a, mm + 1, 0).getDate()) };
}
function mismoDia(x: Dia | null, y: Dia | null): boolean {
  return !!x && !!y && x.a === y.a && x.m === y.m && x.d === y.d;
}
// Las 42 celdas (6 semanas) del mes, empezando en lunes. Las de otro mes
// se muestran apagadas, para que la grilla no salte de alto entre meses.
function celdasDelMes(a: number, m: number): Dia[] {
  const primero = new Date(a, m, 1);
  const desde = (primero.getDay() + 6) % 7; // 0 = lunes
  const inicio = { a, m, d: 1 - desde };
  return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
}
// Al tipear: solo dígitos, y las barras se ponen solas ("14092026" → "14/09/2026").
function conBarras(crudo: string): string {
  const n = crudo.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

export function CampoFecha({
  etiqueta,
  ayuda,
  pie,
  tono,
  valor,
  onValor,
  required = false,
  disabled = false,
  id: idPropio,
  estricto = false,
  revelarError = false,
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  pie?: ReactNode;
  tono?: "neutro" | "error" | "aviso";
  /** ISO `aaaa-mm-dd` o "" (vacío). */
  valor: string;
  onValor: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Para enfocarlo desde un aviso. */
  id?: string;
  /** Rangos (2026-09-21): lo tipeado que no es una fecha real se queda y se avisa; `onValor("")` = «no hay
   *  fecha válida ahora». Ver el comentario de arriba. */
  estricto?: boolean;
  /** Solo con `estricto`: mostrar el aviso ya, sin esperar a que se salga del campo (al intentar aplicar). */
  revelarError?: boolean;
}) {
  const idGenerado = useId();
  const id = idPropio ?? idGenerado;
  const elegido = deIso(valor);
  const [texto, setTexto] = useState(aTexto(elegido));
  const [abierto, setAbierto] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  const [tocado, setTocado] = useState(false);
  // El día con foco dentro de la grilla (teclado) y el mes que se muestra.
  const [cursor, setCursor] = useState<Dia>(elegido ?? hoy());
  const raiz = useRef<HTMLDivElement>(null);
  const grilla = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Si el valor cambia desde afuera (se limpió el filtro, cambió la
  // condición de pago), el texto acompaña — ajustado en el render, como en
  // ComboBuscable, no en un efecto que pintaría el texto viejo un cuadro.
  const [valorPrevio, setValorPrevio] = useState(valor);
  if (valor !== valorPrevio) {
    setValorPrevio(valor);
    setTexto(aTexto(elegido));
    if (elegido) setCursor(elegido);
  }

  useEffect(() => {
    if (!abierto) return;
    function afuera(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [abierto]);

  function abrir() {
    if (disabled) return;
    setCursor(elegido ?? hoy());
    setAbierto(true);
    requestAnimationFrame(() => grilla.current?.focus());
  }

  function elegir(dia: Dia) {
    setTexto(aTexto(dia));
    setCursor(dia);
    setAbierto(false);
    onValor(aIso(dia));
  }

  function alTipear(crudo: string) {
    const t = conBarras(crudo);
    setTexto(t);
    if (t === "") {
      onValor("");
      return;
    }
    const dia = deTexto(t);
    if (dia) {
      setCursor(dia);
      onValor(aIso(dia));
    } else if (estricto) {
      // A medias o imposible (31/02): el texto se queda; al llamador le llega «no hay fecha válida».
      // `setValorPrevio("")` para que el ajuste de arriba no tome ese "" por un cambio de afuera y
      // borre lo que se está escribiendo.
      setValorPrevio("");
      onValor("");
    }
  }

  // Al salir del campo, lo tipeado a medias o imposible vuelve a la última
  // fecha válida: nunca queda un texto que no corresponde a ningún día.
  // (Con `estricto` se queda, para corregirlo: ver el comentario de arriba.)
  function alSalir() {
    setEnfocado(false);
    if (estricto) setTocado(true);
    else setTexto(aTexto(elegido));
  }

  function tecladoInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && !abierto) {
      e.preventDefault();
      abrir();
    }
    if (e.key === "Escape" && abierto) {
      // Este Escape cerró el calendario: que no siga y cierre también el modal (useEscapeLibre.ts).
      e.stopPropagation();
      setAbierto(false);
    }
  }

  function tecladoGrilla(e: React.KeyboardEvent<HTMLDivElement>) {
    const saltos: Record<string, () => Dia> = {
      ArrowLeft: () => sumarDias(cursor, -1),
      ArrowRight: () => sumarDias(cursor, 1),
      ArrowUp: () => sumarDias(cursor, -7),
      ArrowDown: () => sumarDias(cursor, 7),
      PageUp: () => sumarMeses(cursor, -1),
      PageDown: () => sumarMeses(cursor, 1),
      Home: () => ({ ...cursor, d: 1 }),
      End: () => ({ ...cursor, d: new Date(cursor.a, cursor.m + 1, 0).getDate() }),
    };
    if (saltos[e.key]) {
      e.preventDefault();
      setCursor(saltos[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      elegir(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
      // La grilla se desmonta: el foco vuelve a la fecha (si no, cae en la hoja y hay que buscar el campo de nuevo).
      entrada.current?.focus();
    }
  }

  const elHoy = hoy();
  const celdas = celdasDelMes(cursor.a, cursor.m);

  // Solo `estricto`: sin fecha válida (vacío en un campo obligatorio, a medias o imposible) y ya sea
  // porque se salió del campo o porque el llamador lo pide. Mientras se escribe, sin avisos.
  const sinFecha = estricto && (texto === "" ? required : deTexto(texto) === null);
  const conError = sinFecha && (revelarError || (tocado && !enfocado));

  return (
    <Campo
      etiqueta={etiqueta}
      ayuda={ayuda}
      pie={conError ? <span role="alert">{texto === "" ? "Falta la fecha." : "Fecha no válida. Usa dd/mm/aaaa."}</span> : pie}
      tono={conError ? "error" : tono}
      htmlFor={id}
    >
      <div ref={raiz} className="relative">
        <input
          ref={entrada}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          value={texto}
          required={required}
          disabled={disabled}
          aria-invalid={conError || undefined}
          onChange={(e) => alTipear(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={alSalir}
          onKeyDown={tecladoInput}
          className={`w-full bg-transparent py-2 pl-0.5 pr-7 font-mono text-sm tabular-nums tracking-wider text-tinta outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-tinta/45 disabled:opacity-50 ${ALTO_CONTROL}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Abrir calendario"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          className={`absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors ${abierto || enfocado ? "text-rojo" : "text-tinta/55 hover:text-tinta"} disabled:opacity-50`}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
            <path d="M2 7h12M5.5 2v3M10.5 2v3" strokeLinecap="round" />
          </svg>
        </button>
        <Hilo activo={enfocado || abierto} />

        {abierto && (
          <div
            role="dialog"
            aria-label="Calendario"
            className="anim-revelar absolute left-0 top-full z-50 mt-1.5 w-[17rem] rounded-lg border border-sand bg-papel p-3 shadow-md"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setCursor(sumarMeses(cursor, -1))}
                className="rounded p-1 text-tinta/55 transition-colors hover:bg-rojo/10 hover:text-tinta"
              >
                <Flecha lado="izq" />
              </button>
              <p className="font-display text-base text-tinta" aria-live="polite">
                {MESES[cursor.m]} <span className="text-tinta/55">{cursor.a}</span>
              </p>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => setCursor(sumarMeses(cursor, 1))}
                className="rounded p-1 text-tinta/55 transition-colors hover:bg-rojo/10 hover:text-tinta"
              >
                <Flecha lado="der" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center">
              {DIAS_SEMANA.map((d, i) => (
                <span key={i} className="label-cayla py-1 text-[10px] text-tinta/45">
                  {d}
                </span>
              ))}
            </div>

            <div
              ref={grilla}
              role="grid"
              tabIndex={0}
              aria-activedescendant={`${id}-dia-${aIso(cursor)}`}
              onKeyDown={tecladoGrilla}
              className="grid grid-cols-7 gap-y-0.5 outline-none"
            >
              {celdas.map((dia) => {
                const delMes = dia.m === cursor.m;
                const esElegido = mismoDia(dia, elegido);
                const esHoy = mismoDia(dia, elHoy);
                const conCursor = mismoDia(dia, cursor);
                return (
                  <button
                    key={aIso(dia)}
                    id={`${id}-dia-${aIso(dia)}`}
                    type="button"
                    role="gridcell"
                    tabIndex={-1}
                    aria-selected={esElegido}
                    aria-label={`${dia.d} de ${MESES[dia.m].toLowerCase()} de ${dia.a}`}
                    // El cursor también decide qué mes se dibuja: moverlo a un día gris del mes vecino
                    // cambiaba de mes solo al pasar el mouse. Fuera del mes, el hover queda en CSS.
                    onMouseEnter={() => delMes && setCursor(dia)}
                    onClick={() => elegir(dia)}
                    className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums transition-colors ${
                      esElegido
                        ? "bg-rojo text-crema"
                        : conCursor
                          ? "bg-rojo/10 text-tinta"
                          : delMes
                            ? "text-tinta hover:bg-rojo/10"
                            : "text-tinta/30 hover:bg-rojo/10"
                    }`}
                  >
                    {dia.d}
                    {esHoy && !esElegido && <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-rojo" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-sand pt-2">
              <button type="button" onClick={() => elegir(elHoy)} className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo">
                Hoy
              </button>
              {!required && elegido && (
                <button
                  type="button"
                  onClick={() => {
                    setTexto("");
                    setAbierto(false);
                    onValor("");
                  }}
                  className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Campo>
  );
}

function Flecha({ lado }: { lado: "izq" | "der" }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={lado === "izq" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
    </svg>
  );
}

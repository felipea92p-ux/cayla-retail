"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";

/* ====================================================================
   Avisos · una sola voz, arriba a la derecha (2026-09-14)

   Felipe pidió que toda validación, error, confirmación o proceso se
   vea en el mismo lugar: la esquina superior derecha, como las
   notificaciones de un celular. Antes cada pantalla pintaba su `<p>`
   rojo debajo del botón y el éxito no se avisaba (solo cambiaba la
   página).

   Cómo se usa, desde cualquier componente cliente:
     avisar.exito("Proveedor registrado", { detalle: "Confecciones del Sur EIRL" })
     avisar.error("Elige un proveedor", { enfocar: "proveedor" })
     avisar.aviso("2 adjuntos no subieron")
     const fin = avisar.proceso("Subiendo adjuntos…"); …; fin()
     // o, sin que el aviso parpadee, el MISMO se transforma al terminar:
     fin.progreso(0.6, "3 de 5 archivos"); …; fin.exito("Adjuntos subidos", { detalle: "5 archivos" })

   · Título = QUÉ pasó («Proveedor actualizado»); `detalle` = sobre qué
     («Confecciones del Sur EIRL»). El nombre propio no va en el título.
   · `enfocar`: el id de un elemento (o el elemento) al que se le lleva
     el cursor. Si es un contenedor, se enfoca el primer control dentro.
     Así el aviso dice QUÉ falta y el cursor muestra DÓNDE.
   · Todos se van solos (éxito 4 s, advertencia 6 s, error 8 s) y el anillo
     del icono, que se vacía, muestra cuánto falta. Pasar el mouse por
     encima lo pausa — así un error se puede leer con calma sin que se
     escape. Proceso es el único sin reloj: se cierra (o se transforma)
     cuando el código termina. El cierre lo dispara el fin de la animación
     del anillo (`onAnimationEnd`), no un temporizador aparte: una sola
     fuente de tiempo, y la pausa vale para las dos cosas a la vez.
   · La forma del icono (✓ · ! · ⚠) lleva el tono además del color: el
     verde y el rojo solos no le sirven a quien no los distingue.
   · Máximo 4 a la vez: si entra uno más se va el más viejo que no sea un
     error ni un proceso (un error sin leer no se descarta solo).
   · La coreografía (anillo que se dibuja, check que se traza, texto que
     se revela) vive en app/estilos/avisos.css — ADR-0146. Prototipo:
     docs/maquetas/avisos-spike-2026-09/avisos-spike-v2-efectos.html
   · Esperan al loader (ADR-0149): un aviso de éxito significa «se guardó en
     la base y no hubo ningún problema», y eso se dice DESPUÉS de la espera,
     no encima de ella. Mientras hay una petición en curso o el loader
     general está a la vista, ningún aviso se pinta — ni el que llega ni el
     que ya estaba —; cuando la pantalla queda libre aparecen, con su
     coreografía y su reloj desde cero. Así «Guardado» no se ve encima de
     «Cargando». Quien llama no hace nada: `avisar.*` se puede invocar en el
     instante en que responde la base, el aviso queda en la cola y sale solo.
     Un `proceso` («Guardando…») cierra el mismo ciclo: mientras el loader
     cubre la pantalla no se ve (el loader ya dice que se está trabajando), y
     lo que se ve al terminar es su éxito o su error.
   · Un módulo, no un contexto: el estado vive fuera de React
     (`useSyncExternalStore`), así sobrevive a la navegación —
     registras, `router.push` al detalle, y el aviso sigue ahí. Se monta
     una vez en el layout raíz.
   · Lo que es de un campo puntual ("Supera el saldo" bajo el monto)
     NO pasa por acá: eso es el campo hablando, no una notificación.
   ==================================================================== */

export type TonoAviso = "exito" | "error" | "aviso" | "proceso";
export type AccionAviso = { texto: string; onClick: () => void };
export type Aviso = {
  id: number;
  tono: TonoAviso;
  texto: string;
  detalle?: string;
  accion?: AccionAviso;
  duracion?: number;
  /** Solo en un proceso: avance real de 0 a 1. Sin él, el anillo gira («trabajando, sin cifra»). */
  progreso?: number;
  /** Cuántas veces se transformó el mismo aviso (proceso → éxito). Reinicia la coreografía del contenido. */
  version: number;
  /** Se transformó desde un proceso que llegó al 100 %: el anillo ya está completo y no se redibuja. */
  continua: boolean;
};

const DURACION: Record<TonoAviso, number | null> = { exito: 4000, aviso: 6000, error: 8000, proceso: null };
const MAX_AVISOS = 4;

let avisos: Aviso[] = [];
let siguienteId = 1;
const oyentes = new Set<() => void>();

function emitir() {
  oyentes.forEach((o) => o());
}
function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}
function leer() {
  return avisos;
}
// Snapshot del servidor: en SSR no hay avisos nunca. Tiene que ser SIEMPRE la
// misma referencia — React la compara con `Object.is` en cada render y, si
// recibe un array nuevo cada vez (`() => []`), asume que el store cambia sin
// parar y lanza "The result of getServerSnapshot should be cached".
const SIN_AVISOS: Aviso[] = [];
function leerEnServidor() {
  return SIN_AVISOS;
}

function cerrar(id: number) {
  if (!avisos.some((a) => a.id === id)) return;
  avisos = avisos.filter((a) => a.id !== id);
  emitir();
}

type Opciones = { detalle?: string; enfocar?: Enfocable; accion?: AccionAviso; duracion?: number };

function abrir(tono: TonoAviso, texto: string, opciones?: Opciones): number {
  const id = siguienteId++;
  // El mismo texto dos veces seguidas (doble clic en "Registrar") no se apila.
  avisos = [
    ...avisos.filter((a) => !(a.tono === tono && a.texto === texto)),
    { id, tono, texto, detalle: opciones?.detalle, accion: opciones?.accion, duracion: opciones?.duracion, version: 0, continua: false },
  ];
  // Tope: se va el más viejo que no sea un error sin leer ni un proceso en marcha.
  while (avisos.length > MAX_AVISOS) {
    const descartable = avisos.find((a) => a.tono !== "error" && a.tono !== "proceso" && a.id !== id);
    if (!descartable) break;
    avisos = avisos.filter((a) => a.id !== descartable.id);
  }
  emitir();
  if (opciones?.enfocar) pedirEnfoque(opciones.enfocar);
  return id;
}

/** El mismo aviso pasa a otro estado (típico: proceso → éxito) sin que la tarjeta se cierre y se vuelva a abrir. */
function transformar(id: number, tono: TonoAviso, texto: string, opciones?: Opciones) {
  const actual = avisos.find((a) => a.id === id);
  if (!actual) {
    // Lo cerraron a mano mientras trabajaba: el resultado igual se avisa.
    abrir(tono, texto, opciones);
    return;
  }
  avisos = avisos.map((a) =>
    a.id === id
      ? {
          id,
          tono,
          texto,
          detalle: opciones?.detalle,
          accion: opciones?.accion,
          duracion: opciones?.duracion,
          version: a.version + 1,
          continua: a.tono === "proceso" && (a.progreso ?? 0) >= 0.99,
        }
      : a,
  );
  emitir();
  if (opciones?.enfocar) pedirEnfoque(opciones.enfocar);
}

function conProgreso(id: number, fraccion: number, detalle?: string) {
  avisos = avisos.map((a) => (a.id === id && a.tono === "proceso" ? { ...a, progreso: Math.min(1, Math.max(0, fraccion)), detalle: detalle ?? a.detalle } : a));
  emitir();
}

export type Enfocable = string | HTMLElement | null | undefined;

/** Lleva el cursor al campo (por id o elemento) y lo trae a la vista. */
export function enfocar(objetivo: Enfocable) {
  if (typeof document === "undefined" || !objetivo) return;
  const el = typeof objetivo === "string" ? document.getElementById(objetivo) : objetivo;
  if (!el) return;
  const control =
    el.matches("input, select, textarea, button, [tabindex]") ? el : el.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button, [tabindex]");
  // Después del render que pinta el aviso: si el campo recién aparece
  // (una línea nueva), todavía no está en el DOM en este mismo tick.
  requestAnimationFrame(() => {
    (control ?? el).focus({ preventScroll: true });
    (control ?? el).scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

// Con el loader a la vista el resto de la app está `inert`: `focus()` no hace nada. Se guarda el último
// pedido y se cumple cuando la pantalla queda libre (lo hace `Avisos`), justo cuando el aviso aparece.
let enfoquePendiente: Enfocable = null;
function pedirEnfoque(objetivo: Enfocable) {
  if (esperaOcupada()) enfoquePendiente = objetivo;
  else enfocar(objetivo);
}

/** Lo que devuelve `avisar.proceso`: se puede llamar para cerrarlo (como siempre) o usar para transformarlo. */
export type FinProceso = (() => void) & {
  /** Avance real, de 0 a 1: el anillo del icono se llena. Sin llamarlo, el anillo gira. */
  progreso: (fraccion: number, detalle?: string) => void;
  /** El mismo aviso pasa a éxito (sin parpadeo). */
  exito: (texto: string, opciones?: { detalle?: string; accion?: AccionAviso; duracion?: number }) => void;
  /** El mismo aviso pasa a error. */
  error: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable }) => void;
};

export const avisar = {
  /**
   * `accion`: un botón dentro del aviso (típico: «Deshacer»). Al pulsarlo el aviso se cierra y corre `onClick`.
   * `duracion`: milisegundos, para un aviso que la persona necesita más tiempo para decidir (un «Deshacer»
   * de 4 s es una trampa; con 7 s se alcanza a leer y a decidir).
   */
  exito: (texto: string, opciones?: { detalle?: string; accion?: AccionAviso; duracion?: number }) => abrir("exito", texto, opciones),
  error: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable }) => abrir("error", texto, opciones),
  aviso: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable }) => abrir("aviso", texto, opciones),
  /** Devuelve una función que lo cierra; además `.progreso()`, `.exito()` y `.error()` lo transforman. */
  proceso: (texto: string, opciones?: { detalle?: string }): FinProceso => {
    const id = abrir("proceso", texto, opciones);
    return Object.assign(() => cerrar(id), {
      progreso: (fraccion: number, detalle?: string) => conProgreso(id, fraccion, detalle),
      exito: (t: string, o?: { detalle?: string; accion?: AccionAviso; duracion?: number }) => transformar(id, "exito", t, o),
      error: (t: string, o?: { detalle?: string; enfocar?: Enfocable }) => transformar(id, "error", t, o),
    });
  },
  cerrar,
};

const SALIDA_MS = 260;

export function Avisos() {
  const guardados = useSyncExternalStore(suscribir, leer, leerEnServidor);
  const ocupada = useSyncExternalStore(suscribirEspera, esperaOcupada, () => false);
  // Ocupada (una carga o un guardado en curso, o el loader aún a la vista): no se pinta ninguna tarjeta (se desmontan,
  // no se ocultan) y los avisos siguen en el estado. Al quedar libre se montan de nuevo: la entrada y el reloj arrancan
  // ahí, no bajo el loader. El contenedor `aria-live` sigue montado para que el lector anuncie la tarjeta al aparecer.
  const lista = ocupada ? SIN_AVISOS : guardados;
  useEffect(() => {
    if (ocupada || !enfoquePendiente) return;
    const objetivo = enfoquePendiente;
    enfoquePendiente = null;
    enfocar(objetivo);
  }, [ocupada]);
  // Con 3 o más se ofrece limpiar; un proceso en marcha no se cancela desde acá.
  const cerrables = lista.filter((a) => a.tono !== "proceso");
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {lista.length >= 3 && (
        <button type="button" onClick={() => cerrables.forEach((a) => cerrar(a.id))} className="aviso-cerrar-todos label-cayla text-[11px]">
          Cerrar todos
        </button>
      )}
      {lista.map((a) => (
        <Tarjeta key={a.id} aviso={a} />
      ))}
    </div>
  );
}

/** Los trazos del glifo llevan pathLength="1": la misma animación dibuja cualquier forma. */
function Glifo({ tono }: { tono: TonoAviso }) {
  if (tono === "proceso") return null;
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="aviso-glifo">
      {tono === "exito" && <path className="aviso-trazo" pathLength={1} d="M3.5 8.5l3 3 6-7" />}
      {tono === "error" && (
        <>
          <path className="aviso-trazo" pathLength={1} d="M8 3.4v5.4" />
          <circle className="aviso-punto" cx="8" cy="11.7" r="1.05" />
        </>
      )}
      {tono === "aviso" && (
        <>
          <path className="aviso-trazo" pathLength={1} d="M8 2.6l5.8 10.2H2.2z" />
          <path className="aviso-trazo aviso-trazo-2" pathLength={1} d="M8 6.6v2.6" />
          <circle className="aviso-punto" cx="8" cy="11.1" r=".95" />
        </>
      )}
    </svg>
  );
}

function Tarjeta({ aviso }: { aviso: Aviso }) {
  const [saliendo, setSaliendo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Salida con animación: primero se desvanece y colapsa su altura, después se quita del estado.
  function quitar() {
    if (saliendo) return;
    ref.current?.style.setProperty("--h", `${ref.current.offsetHeight}px`);
    setSaliendo(true);
    setTimeout(() => cerrar(aviso.id), SALIDA_MS);
  }
  useEffect(() => {
    if (aviso.tono !== "error") return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") quitar();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso.id, aviso.tono]);

  const ms = aviso.duracion ?? DURACION[aviso.tono];
  const estilo = { "--ms": `${ms ?? 0}ms`, ...(aviso.progreso !== undefined ? { "--p": aviso.progreso } : {}) } as React.CSSProperties;
  return (
    <div
      ref={ref}
      role={aviso.tono === "error" ? "alert" : "status"}
      data-tono={aviso.tono}
      data-prog={aviso.progreso !== undefined ? "" : undefined}
      data-continua={aviso.continua ? "" : undefined}
      data-saliendo={saliendo ? "" : undefined}
      className="aviso-tarjeta"
      style={estilo}
    >
      {/* `display: contents` + key = versión: al transformarse el aviso (proceso → éxito) el contenido se
          vuelve a montar y su coreografía arranca de nuevo, sin que la tarjeta se mueva de su lugar. */}
      <div key={aviso.version} className="contents">
        <span aria-hidden className="aviso-ico">
          <svg viewBox="0 0 36 36" className="aviso-anillo">
            <circle className="aviso-disco" cx="18" cy="18" r="16" />
            <circle className="aviso-pista" cx="18" cy="18" r="17" />
            <circle className="aviso-onda" cx="18" cy="18" r="17" />
            {/* El reloj: se vacía y, al llegar a cero, cierra el aviso. Un proceso no tiene reloj:
                el mismo círculo hace de medidor (--p) o gira. */}
            <circle
              className="aviso-reloj"
              cx="18"
              cy="18"
              r="17"
              onAnimationEnd={(e) => {
                if (e.animationName === "cayla-aviso-reloj" && ms) quitar();
              }}
            />
          </svg>
          <Glifo tono={aviso.tono} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="aviso-tit">{aviso.texto}</p>
          {aviso.detalle && <p className="aviso-det">{aviso.detalle}</p>}
          {aviso.accion && (
            <button
              type="button"
              onClick={() => {
                const { onClick } = aviso.accion!;
                quitar();
                onClick();
              }}
              className="aviso-acc label-cayla text-[11px]"
            >
              {aviso.accion.texto}
            </button>
          )}
        </div>
        {aviso.tono !== "proceso" && (
          <button type="button" onClick={quitar} aria-label="Cerrar aviso" className="aviso-x">
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

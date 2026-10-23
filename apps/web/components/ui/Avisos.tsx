"use client";

import { DismissableLayer } from "radix-ui/internal";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  conVisto,
  duracionDe,
  ejeDelAviso,
  opacidadDelAviso,
  posicionDelAviso,
  retirarLoVisto,
  salidaDelAviso,
  type TonoAviso,
} from "@/lib/avisos-reglas";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { velocidad, type Muestra } from "@/lib/hoja-gesto";

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
   · Lo que ya se vio no vuelve (2026-10-14, ADR-0146 act.): si la pantalla se
     ocupa de nuevo mientras un aviso está a la vista, ese aviso se retira en
     vez de volver con el reloj desde cero. La persona ya lo leyó y pasó a lo
     siguiente; y su «Deshacer» ya sería viejo (en Producción, «Traer de
     vuelta» + «Enviar a maquila» dejaban dos Deshacer, y el primero volvía a
     aplicar una etapa vieja). «Visto» = su reloj empezó a correr a la vista
     (`onAnimationStart` del anillo, a los 520 ms de la entrada: antes de eso
     es un parpadeo, no una lectura, y el aviso espera como si no se hubiera
     mostrado). Un proceso nunca se retira. La regla es pura:
     lib/avisos-reglas.ts.
   · Un aviso con botón («Deshacer») dura 7 s como mínimo (`duracionDe`), y
     el reloj cuenta desde que se ve: hay que leer y decidir.
   · Un clic en un aviso NO es «clic afuera» de la hoja o el cajón abierto:
     la pila es rama (`DismissableLayer.Branch`) de toda capa de Radix. Antes,
     con un cajón abierto (`body` con `pointer-events: none`), el pointerdown
     sobre «Deshacer» cerraba el cajón y el Deshacer no corría. Lo vigila
     lib/hojas-avisos.test.ts (también que `radix-ui/internal` y
     `@radix-ui/react-dialog` compartan la misma copia de la capa).
   · Un módulo, no un contexto: el estado vive fuera de React
     (`useSyncExternalStore`), así sobrevive a la navegación —
     registras, `router.push` al detalle, y el aviso sigue ahí. Se monta
     una vez en el layout raíz.
   · Lo que es de un campo puntual ("Supera el saldo" bajo el monto)
     NO pasa por acá: eso es el campo hablando, no una notificación.
   · En el celular (ADR-0479, actividad 8) no hay mouse que pause ni ✕ que
     aparezca al pasar por encima: el ✕ está siempre a la vista, el aviso se
     aparta con el dedo de lado o hacia arriba (como una notificación) y,
     mientras el dedo lo toca, su reloj se detiene. La pila queda bajo la
     isla del iPhone (`env(safe-area-inset-top)`). Reglas: lib/avisos-reglas.ts.
   ==================================================================== */

export type { TonoAviso };
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
  /** Su reloj empezó a correr a la vista: si la pantalla se ocupa de nuevo, ya no vuelve (lib/avisos-reglas.ts). */
  visto: boolean;
};

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
    { id, tono, texto, detalle: opciones?.detalle, accion: opciones?.accion, duracion: opciones?.duracion, version: 0, continua: false, visto: false },
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
          // El contenido se vuelve a montar (key = version) y su reloj arranca a la vista: se vuelve a «ver».
          visto: false,
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

/** La tarjeta terminó su entrada y su reloj empezó a correr a la vista (lo llama `Tarjeta`). */
function marcarVisto(id: number) {
  const nueva = conVisto(avisos, id);
  if (nueva === avisos) return;
  avisos = nueva as Aviso[];
  emitir();
}

/** La pantalla se ocupó (ADR-0149): lo que ya se vio se retira; lo que no, espera (lo llama `Avisos`). */
function alOcuparse() {
  const nueva = retirarLoVisto(avisos);
  if (nueva === avisos) return;
  avisos = nueva as Aviso[];
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
  error: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable; accion?: AccionAviso }) => void;
};

export const avisar = {
  /**
   * `accion`: un botón dentro del aviso (típico: «Deshacer»). Al pulsarlo el aviso se cierra y corre `onClick`.
   * `duracion`: milisegundos, para un aviso que la persona necesita más tiempo para decidir (un «Deshacer»
   * de 4 s es una trampa; con 7 s se alcanza a leer y a decidir).
   */
  exito: (texto: string, opciones?: { detalle?: string; accion?: AccionAviso; duracion?: number }) => abrir("exito", texto, opciones),
  /** `accion` en un error: el siguiente paso cuando el error tiene uno claro (ADR-0193: «Recargar» cuando otra persona
   *  cambió la ficha mientras se editaba). */
  error: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable; accion?: AccionAviso }) => abrir("error", texto, opciones),
  /** `accion` en una advertencia: el camino para seguir sin salir de la pantalla (ADR-0321: en Vender, «Agregar y registrar
   *  la bajada» de una prenda que no figura en el piso). Con un botón conviene `duracion` más larga: hay que leer y decidir. */
  aviso: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable; accion?: AccionAviso; duracion?: number }) => abrir("aviso", texto, opciones),
  /** Devuelve una función que lo cierra; además `.progreso()`, `.exito()` y `.error()` lo transforman. */
  proceso: (texto: string, opciones?: { detalle?: string }): FinProceso => {
    const id = abrir("proceso", texto, opciones);
    return Object.assign(() => cerrar(id), {
      progreso: (fraccion: number, detalle?: string) => conProgreso(id, fraccion, detalle),
      exito: (t: string, o?: { detalle?: string; accion?: AccionAviso; duracion?: number }) => transformar(id, "exito", t, o),
      error: (t: string, o?: { detalle?: string; enfocar?: Enfocable; accion?: AccionAviso }) => transformar(id, "error", t, o),
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
  // En el instante en que la pantalla se ocupa (antes de que React vuelva a pintar), lo que ya se vio se retira: así
  // al liberarse no resucita con el reloj desde cero ni ofrece un «Deshacer» viejo (lib/avisos-reglas.ts). Va en el
  // oyente, no en un efecto: un efecto corre después del render que ya mostraría la tarjeta vieja un instante.
  useEffect(() => suscribirEspera(() => esperaOcupada() && alOcuparse()), []);
  useEffect(() => {
    if (ocupada || !enfoquePendiente) return;
    const objetivo = enfoquePendiente;
    enfoquePendiente = null;
    enfocar(objetivo);
  }, [ocupada]);
  // Con 3 o más se ofrece limpiar; un proceso en marcha no se cancela desde acá.
  const cerrables = lista.filter((a) => a.tono !== "proceso");
  // `DismissableLayer.Branch`: para toda hoja o cajón de Radix abierto, un clic aquí está DENTRO de la hoja (no la
  // cierra). Es la misma capa que usa `@radix-ui/react-dialog` (lo vigila lib/hojas-avisos.test.ts); dibuja un <div>.
  return (
    <DismissableLayer.Branch
      data-avisos
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {lista.length >= 3 && (
        <button type="button" onClick={() => cerrables.forEach((a) => cerrar(a.id))} className="aviso-cerrar-todos label-cayla text-[11px]">
          Cerrar todos
        </button>
      )}
      {lista.map((a) => (
        <Tarjeta key={a.id} aviso={a} />
      ))}
    </DismissableLayer.Branch>
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

/**
 * Apartar el aviso con el dedo (ADR-0479, actividad 8): de lado o hacia arriba, como una notificación del celular. Solo
 * toque y lápiz; con el mouse siguen el ✕ y la pausa al pasar por encima. Mientras el dedo la toca, el reloj se detiene
 * (`data-tocando`, avisos.css). La posición va en línea con `important`: la entrada (`cayla-aviso-entra … both`) y la
 * salida son animaciones, y una animación le gana a un estilo en línea normal. Reglas puras: lib/avisos-reglas.ts.
 */
function useApartarConElDedo(ref: React.RefObject<HTMLDivElement | null>, apartar: () => void) {
  const alApartar = useRef(apartar);
  useEffect(() => {
    alApartar.current = apartar;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let gesto: { id: number; x0: number; y0: number; eje: "x" | "y" | null; muestras: Muestra[] } | null = null;
    let arrastro = false;
    let devolver = 0;
    const pintar = (x: number, y: number, opacidad: number, ms = 0) => {
      el.style.setProperty("transition", ms ? `transform ${ms}ms var(--ease-cayla), opacity ${ms}ms var(--ease-cayla)` : "none", "important");
      el.style.setProperty("transform", `translate3d(${x}px, ${y}px, 0)`, "important");
      el.style.setProperty("opacity", String(opacidad), "important");
    };
    function bajar(e: PointerEvent) {
      if (e.pointerType === "mouse" || !e.isPrimary || el!.hasAttribute("data-saliendo")) return;
      window.clearTimeout(devolver);
      gesto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, eje: null, muestras: [{ t: e.timeStamp, y: 0 }] };
      arrastro = false;
      el!.setAttribute("data-tocando", "");
    }
    function mover(e: PointerEvent) {
      if (!gesto || e.pointerId !== gesto.id) return;
      const dx = e.clientX - gesto.x0;
      const dy = e.clientY - gesto.y0;
      if (!gesto.eje) {
        gesto.eje = ejeDelAviso(dx, dy);
        if (!gesto.eje) return;
        arrastro = true;
        el!.setPointerCapture(e.pointerId);
      }
      const d = gesto.eje === "x" ? dx : dy;
      gesto.muestras.push({ t: e.timeStamp, y: d });
      const p = posicionDelAviso(gesto.eje, d);
      const tamano = gesto.eje === "x" ? el!.offsetWidth : el!.offsetHeight;
      pintar(gesto.eje === "x" ? p : 0, gesto.eje === "y" ? p : 0, opacidadDelAviso(gesto.eje, p, tamano));
    }
    function soltar(e: PointerEvent) {
      if (!gesto || e.pointerId !== gesto.id) return;
      const { eje, muestras } = gesto;
      gesto = null;
      el!.removeAttribute("data-tocando");
      if (!eje) return;
      const d = muestras[muestras.length - 1].y;
      const tamano = eje === "x" ? el!.offsetWidth : el!.offsetHeight;
      const salida = e.type === "pointercancel" ? null : salidaDelAviso(eje, d, velocidad(muestras), tamano);
      const ms = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
      if (salida) {
        // Sigue de largo hacia donde iba y la pila se cierra detrás (la salida de siempre colapsa su alto).
        if (salida === "arriba") pintar(0, -(el!.offsetHeight + 32), 0, ms);
        else pintar((salida === "derecha" ? 1 : -1) * (el!.offsetWidth + 32), 0, 0, ms);
        alApartar.current();
        return;
      }
      pintar(0, 0, 1, ms);
      devolver = window.setTimeout(() => ["transition", "transform", "opacity"].forEach((p) => el!.style.removeProperty(p)), ms);
    }
    // Un arrastre no es un toque: al soltarlo no se dispara el botón de adentro («Deshacer», ✕).
    function clic(e: MouseEvent) {
      if (!arrastro) return;
      arrastro = false;
      e.preventDefault();
      e.stopPropagation();
    }
    el.addEventListener("pointerdown", bajar);
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
    el.addEventListener("click", clic, true);
    return () => {
      window.clearTimeout(devolver);
      el.removeEventListener("pointerdown", bajar);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      el.removeEventListener("pointercancel", soltar);
      el.removeEventListener("click", clic, true);
    };
  }, [ref]);
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
  useApartarConElDedo(ref, quitar);
  useEffect(() => {
    if (aviso.tono !== "error") return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") quitar();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso.id, aviso.tono]);

  // Con botón («Deshacer») no baja de 7 s: hay que leer y decidir. Quien pide `duracion` decide (lib/avisos-reglas.ts).
  const ms = duracionDe(aviso.tono, { accion: aviso.accion, duracion: aviso.duracion });
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
                el mismo círculo hace de medidor (--p) o gira. Cuando empieza a correr (a los 520 ms de la
                entrada, pasado el efecto) el aviso cuenta como VISTO: una sola fuente de tiempo para las dos cosas. */}
            <circle
              className="aviso-reloj"
              cx="18"
              cy="18"
              r="17"
              onAnimationStart={(e) => {
                if (e.animationName === "cayla-aviso-reloj") marcarVisto(aviso.id);
              }}
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

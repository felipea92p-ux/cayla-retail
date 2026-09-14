"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Hilo } from "@/components/ui/campos";

/* ====================================================================
   Avisos · una sola voz, arriba a la derecha (2026-09-14)

   Felipe pidió que toda validación, error, confirmación o proceso se
   vea en el mismo lugar: la esquina superior derecha, como las
   notificaciones de un celular. Antes cada pantalla pintaba su `<p>`
   rojo debajo del botón y el éxito no se avisaba (solo cambiaba la
   página).

   Cómo se usa, desde cualquier componente cliente:
     avisar.exito("Factura F001-123 registrada")
     avisar.error("Elige un proveedor", { enfocar: "proveedor" })
     avisar.aviso("2 adjuntos no subieron")
     const fin = avisar.proceso("Subiendo adjuntos…"); …; fin()

   · `enfocar`: el id de un elemento (o el elemento) al que se le lleva
     el cursor. Si es un contenedor, se enfoca el primer control dentro.
     Así el aviso dice QUÉ falta y el cursor muestra DÓNDE.
   · Todos se van solos (éxito 4 s, advertencia 6 s, error 8 s) y una
     barra al pie, que se encoge hacia la izquierda, muestra cuánto falta.
     Pasar el mouse por encima la pausa — así un error se puede leer con
     calma sin que se escape. Proceso es el único sin reloj: se cierra
     cuando el código termina. El cierre lo dispara el fin de la animación
     de la barra (`onAnimationEnd`), no un temporizador aparte: una sola
     fuente de tiempo, y la pausa vale para las dos cosas a la vez.
   · Un módulo, no un contexto: el estado vive fuera de React
     (`useSyncExternalStore`), así sobrevive a la navegación —
     registras, `router.push` al detalle, y el aviso sigue ahí. Se monta
     una vez en el layout raíz.
   · Lo que es de un campo puntual ("Supera el saldo" bajo el monto)
     NO pasa por acá: eso es el campo hablando, no una notificación.
   ==================================================================== */

export type TonoAviso = "exito" | "error" | "aviso" | "proceso";
export type Aviso = { id: number; tono: TonoAviso; texto: string; detalle?: string };

const DURACION: Record<TonoAviso, number | null> = { exito: 4000, aviso: 6000, error: 8000, proceso: null };

let avisos: Aviso[] = [];
// Snapshot del servidor: SIEMPRE la misma referencia. `useSyncExternalStore` compara por
// identidad y con `() => []` cada llamada devolvía un array nuevo — React lo avisa
// («getServerSnapshot should be cached») y puede entrar en bucle al hidratar.
const SIN_AVISOS: Aviso[] = [];
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

function cerrar(id: number) {
  if (!avisos.some((a) => a.id === id)) return;
  avisos = avisos.filter((a) => a.id !== id);
  emitir();
}

function abrir(tono: TonoAviso, texto: string, opciones?: { detalle?: string; enfocar?: Enfocable }): number {
  const id = siguienteId++;
  // El mismo texto dos veces seguidas (doble clic en "Registrar") no se apila.
  avisos = [...avisos.filter((a) => !(a.tono === tono && a.texto === texto)), { id, tono, texto, detalle: opciones?.detalle }];
  emitir();
  if (opciones?.enfocar) enfocar(opciones.enfocar);
  return id;
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

export const avisar = {
  exito: (texto: string, opciones?: { detalle?: string }) => abrir("exito", texto, opciones),
  error: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable }) => abrir("error", texto, opciones),
  aviso: (texto: string, opciones?: { detalle?: string; enfocar?: Enfocable }) => abrir("aviso", texto, opciones),
  /** Devuelve la función que lo cierra. */
  proceso: (texto: string) => {
    const id = abrir("proceso", texto);
    return () => cerrar(id);
  },
  cerrar,
};

const ESTILO: Record<TonoAviso, { barra: string; titulo: string; tiempo: string }> = {
  exito: { barra: "bg-verde", titulo: "text-verde-profundo", tiempo: "bg-verde/60" },
  error: { barra: "bg-rojo", titulo: "text-rojo-profundo", tiempo: "bg-rojo/60" },
  aviso: { barra: "bg-ambar", titulo: "text-ambar", tiempo: "bg-ambar/60" },
  proceso: { barra: "bg-tinta/30", titulo: "text-tinta", tiempo: "" },
};

export function Avisos() {
  const lista = useSyncExternalStore(suscribir, leer, () => SIN_AVISOS);
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {/* El reloj de la barra vive acá, no en globals.css: es lo único que
          este componente necesita y así no depende de ninguna otra hoja. */}
      <style>{`@keyframes cayla-aviso-tiempo { from { width: 100%; } to { width: 0%; } }`}</style>
      {lista.map((a) => (
        <Tarjeta key={a.id} aviso={a} />
      ))}
    </div>
  );
}

function Tarjeta({ aviso }: { aviso: Aviso }) {
  const [saliendo, setSaliendo] = useState(false);
  // Con el mouse encima el reloj se detiene: un error se lee con calma.
  const [pausado, setPausado] = useState(false);
  // Salida con animación: primero se desvanece, después se quita del estado.
  function quitar() {
    setSaliendo(true);
    setTimeout(() => cerrar(aviso.id), 180);
  }
  useEffect(() => {
    if (aviso.tono !== "error") return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") quitar();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso.id]);

  const e = ESTILO[aviso.tono];
  const ms = DURACION[aviso.tono];
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border border-sand bg-papel py-3 pl-4 pr-3 shadow-md ${saliendo ? "anim-salida" : "anim-globo"}`}
      style={{ animationDuration: saliendo ? "180ms" : undefined }}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${e.barra}`} />
      {/* El reloj: se encoge hacia la izquierda y, al llegar a cero, cierra el
          aviso. Con el mouse encima se pausa (animation-play-state). */}
      {ms && !saliendo && (
        <span
          aria-hidden
          onAnimationEnd={quitar}
          className={e.tiempo}
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 3,
            width: "100%",
            animation: `cayla-aviso-tiempo ${ms}ms linear forwards`,
            animationPlayState: pausado ? "paused" : "running",
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${e.titulo}`}>{aviso.texto}</p>
        {aviso.detalle && <p className="mt-0.5 text-xs leading-snug text-tinta/65">{aviso.detalle}</p>}
        {aviso.tono === "proceso" && (
          <span className="relative mt-2 block h-[2px]">
            <Hilo activo={false} trabajando />
          </span>
        )}
      </div>
      {aviso.tono !== "proceso" && (
        <button type="button" onClick={quitar} aria-label="Cerrar aviso" className="-mr-1 -mt-1 rounded p-1 text-tinta/45 transition-colors hover:text-tinta">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Clock, RefreshCw, UserRound } from "lucide-react";
import { nombresCortos } from "@/lib/nombre-integrante";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { PersonaDeTurno } from "@/lib/responsable-reglas";

type Props = {
  control: ControlResponsable;
  /**
   * Dónde se despliega la lista. `en-linea` (por defecto) empuja el contenido: es lo seguro dentro de un `<Modal>`,
   * que tiene scroll propio y recortaría una lista flotante. `arriba`/`abajo` flotan sobre lo demás (Punto de venta,
   * con el combo pegado al botón Cobrar al pie del ticket).
   */
  hacia?: "en-linea" | "arriba" | "abajo";
  /** Mientras se guarda, no se cambia de responsable. */
  deshabilitado?: boolean;
  className?: string;
};

function iniciales(nombre: string): string {
  const partes = nombre.replace(/\./g, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

/**
 * El combo «Responsable» (ADR-0161; diseño aprobado en `docs/maquetas/responsable-y-roles-spike-2026-09/`, pantallas
 * 2, 3 y 4). Va encima del botón que guarda, en TODA acción que guarda de la operación de tienda. Las reglas viven en
 * `lib/responsable-reglas.ts` y el estado en `useResponsable`; esto solo pinta:
 *
 *  · Vacío, con borde punteado rojo: «¿Quién hace esta operación?». Nunca viene elegido, ni con una sola persona.
 *  · La lista «De turno ahora · Tienda X»: presentes con punto verde; en pausa, deshabilitadas con punto ámbar; las
 *    que ya salieron solo se cuentan al pie.
 *  · Nadie presente: la operación se bloquea (sin «Otra persona») y se dice qué hacer — marcar entrada en el kiosco
 *    y «Actualizar lista». Igual para un líder, incluso trabajando desde casa (A9).
 */
export function ComboResponsable({ control, hacia = "en-linea", deshabilitado = false, className = "" }: Props) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const idLista = useId();
  const { estado, lista, sede, elegidoId } = control;

  // Cerrar al tocar fuera. Solo mientras está abierta: no deja oyentes sueltos en cada pantalla.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  if (estado === "nadie" || estado === "sin_lectura") {
    const nadie = estado === "nadie";
    return (
      <div role="alert" className={`anim-revelar rounded-xl border border-ambar/35 bg-ambar/[0.07] p-3.5 ${className}`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-ambar-profundo">
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          {nadie ? `Nadie de turno en ${sede}` : "No se pudo leer quién está de turno"}
        </p>
        {nadie ? (
          <>
            <p className="mt-1.5 text-[13px] text-tinta/80">
              Para guardar, quien atiende tiene que haber marcado su <b className="font-semibold">entrada</b> hoy en esta tienda. Nadie lo
              ha hecho todavía (la regla es la misma para los líderes).
            </p>
            <ol className="ml-[18px] mt-2 list-decimal text-[13px] text-tinta/80">
              <li>Marca tu entrada en el kiosco de asistencia de la tienda.</li>
              <li>Vuelve aquí y toca «Actualizar lista».</li>
            </ol>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] text-tinta/80">Revisa la conexión y vuelve a intentar. Sin esa lista no se puede elegir quién hace la operación.</p>
        )}
        <button
          type="button"
          onClick={() => void control.recargar()}
          disabled={control.recargando}
          className="label-cayla mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-tinta/25 bg-crema px-3 text-[10.5px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${control.recargando ? "motion-safe:animate-spin" : ""}`} aria-hidden />
          {control.recargando ? "Actualizando…" : "Actualizar lista"}
        </button>
      </div>
    );
  }

  const cargando = estado === "cargando";
  const elegido = lista.elegibles.find((p) => p.personaId === elegidoId) ?? null;
  const opciones: PersonaDeTurno[] = [...lista.elegibles, ...lista.enPausa];
  const cortos = nombresCortos(opciones.map((p) => p.nombre));

  function elegir(p: PersonaDeTurno) {
    control.elegir(p.personaId);
    setAbierto(false);
  }

  function alTeclado(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && abierto) {
      e.stopPropagation();
      setAbierto(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const botones = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled])') ?? []);
    if (botones.length === 0) return;
    e.preventDefault();
    if (!abierto) {
      setAbierto(true);
      return;
    }
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    const siguiente = e.key === "ArrowDown" ? (i + 1) % botones.length : (i - 1 + botones.length) % botones.length;
    botones[siguiente]?.focus();
  }

  const posicion =
    hacia === "arriba" ? "absolute inset-x-0 bottom-[calc(100%+6px)] z-30" : hacia === "abajo" ? "absolute inset-x-0 top-[calc(100%+6px)] z-30" : "mt-1.5";

  return (
    <div ref={raiz} className={`relative ${className}`} onKeyDown={alTeclado}>
      <p className="label-cayla mb-1.5 flex items-center gap-1.5 text-[11px] text-tinta/70">
        Responsable <span className="text-rojo" aria-hidden>*</span>
      </p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-label={elegido ? `Responsable: ${elegido.nombre.replace(/\.$/, "")}. Cambiar` : "Elegir responsable"}
        disabled={deshabilitado || cargando}
        onClick={() => setAbierto((a) => !a)}
        className={`flex h-12 w-full items-center gap-2.5 rounded-lg border bg-crema px-3.5 text-left transition-[border-color,box-shadow] duration-200 disabled:cursor-default disabled:opacity-60 ${
          elegido ? "border-tinta" : "border-dashed border-rojo/55 text-rojo-profundo hover:border-rojo"
        }`}
      >
        {elegido ? (
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-sand font-display text-sm text-tinta">{iniciales(elegido.nombre)}</span>
        ) : (
          <UserRound className="h-[18px] w-[18px] flex-none" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">
          {cargando ? "Leyendo quién está de turno…" : elegido ? (cortos.get(elegido.nombre) ?? elegido.nombre) : "¿Quién hace esta operación?"}
        </span>
        <ChevronDown className={`h-4 w-4 flex-none transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {abierto && (
        <div
          id={idLista}
          role="listbox"
          aria-label={`De turno ahora en ${sede}`}
          className={`anim-revelar rounded-xl border border-sand bg-papel p-2 shadow-[0_18px_44px_-14px_rgb(26_26_24/0.22)] ${posicion}`}
        >
          <p className="label-cayla px-2 pb-2 pt-1.5 text-[11px] text-tinta/60">De turno ahora · {sede}</p>
          {opciones.map((p) => (
            <button
              key={p.personaId}
              type="button"
              role="option"
              aria-selected={p.personaId === elegidoId}
              disabled={p.enPausa}
              onClick={() => elegir(p)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors enabled:hover:bg-sand/55 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-sand font-display text-sm">{iniciales(p.nombre)}</span>
              <span className="min-w-0 flex-1">
                {cortos.get(p.nombre) ?? p.nombre}
                <small className="block text-[11.5px] text-tinta/60">
                  {p.enPausa ? "En pausa · no puede firmar" : p.deOtraSede ? "De turno · de otra sede" : "De turno"}
                </small>
              </span>
              <span className={`h-2 w-2 flex-none rounded-full ${p.enPausa ? "bg-ambar" : "bg-verde"}`} aria-hidden />
            </button>
          ))}
          {lista.salieron > 0 && (
            <p className="mt-1.5 border-t border-sand px-2 pb-0.5 pt-2 text-xs text-tinta/60">
              {lista.salieron === 1 ? "1 persona ya marcó su salida y no aparece." : `${lista.salieron} personas ya marcaron su salida y no aparecen.`}
            </p>
          )}
        </div>
      )}

      {!elegido && !cargando && <p className="mt-1.5 text-xs text-tinta/60">Obligatorio. Viene vacío en cada operación.</p>}
    </div>
  );
}

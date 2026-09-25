"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { nombresCortos } from "@/lib/nombre-integrante";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { PersonaDeTurno } from "@/lib/responsable-reglas";
import { usePosicionLista } from "@/components/ui/useAnclaje";
import { useComboLista } from "@/components/ui/useCombo";
import { clave } from "@/lib/buscar-prenda-v2";
import { comboNecesitaBuscador } from "@/lib/combo-reglas";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { diaYHoraLima } from "@/lib/fechas-lima";

type Props = {
  control: ControlResponsable;
  /** Mientras se guarda, no se cambia de responsable. */
  deshabilitado?: boolean;
  className?: string;
};

/**
 * El combo «Responsable» (ADR-0161; diseño aprobado en `docs/maquetas/responsable-y-roles-spike-2026-09/`, pantallas
 * 2, 3 y 4). Va encima del botón que guarda, en TODA acción que guarda (desde el 2026-09-23 también Compras, Producción, Colaboradores y Roles). Las reglas viven en
 * `lib/responsable-reglas.ts` y el estado en `useResponsable`; esto solo pinta:
 *
 *  · Vacío, con borde punteado rojo: `control.pregunta` — «¿Quién está atendiendo?» al atender a la clienta (Punto de
 *    venta, Cambios, Devoluciones; siempre vacío) y «¿Quién hace esta operación?» en el resto (con la sesión de una
 *    persona presente ya viene elegida ella). En una terminal, vacío siempre.
 *  · La lista «De turno ahora · Tienda X»: presentes con punto verde; en pausa, deshabilitadas con punto ámbar; las
 *    que ya salieron solo se cuentan al pie.
 *  · Nadie presente: la operación se bloquea (sin «Otra persona») y se dice qué hacer — marcar entrada en el kiosco
 *    y «Actualizar lista». Igual para un líder, incluso trabajando desde casa (A9).
 *  · El Admin (ADR-0178) no pasa por nada de esto: firma él y solo ve un aviso de que no necesita autorización.
 */
export function ComboResponsable({ control, deshabilitado = false, className = "" }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  // La lista FLOTA (`fixed`, medida contra el botón; abre hacia abajo o, si no cabe, hacia arriba), igual que
  // ComboBuscable. Antes se abría dentro del contenido y empujaba todo 150–250 px; al elegir se cerraba de golpe y,
  // como el combo suele ser lo penúltimo de un formulario o de una ventana, la vista saltaba (2026-09-23, ADR-0185).
  // `fixed` tampoco queda recortada por el scroll propio de un `<Modal>`, que era la razón de abrirla en línea.
  const posLista = usePosicionLista(boton, abierto, 320);
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

  // Regla global de combos (ADR-0209): con más de 8 personas de turno a la vez, un buscador; si no, exactamente
  // el control de siempre. El paginado casi nunca se activa acá (una tienda no tiene 50 personas en un turno),
  // pero se cablea igual — es la misma regla en todo el sistema, no una excepción para este combo. Antes de los
  // `return` de abajo (admin/nadie/sin_lectura) porque son Hooks: tienen que llamarse en el mismo orden siempre,
  // aunque `lista` no importe en esos estados (`LISTA_VACIA`/la del Admin ya traen `elegibles`/`enPausa`).
  const opciones: PersonaDeTurno[] = useMemo(() => [...lista.elegibles, ...lista.enPausa], [lista.elegibles, lista.enPausa]);
  const mostrarBuscador = comboNecesitaBuscador(opciones.length);
  const filtradas = useMemo(() => {
    if (!mostrarBuscador || !busqueda) return opciones;
    const k = clave(busqueda);
    return opciones.filter((p) => clave(p.nombre).includes(k));
  }, [opciones, busqueda, mostrarBuscador]);
  const { visibles, mostrarDesde, reiniciar, alHacerScroll } = useComboLista();
  const mostradas = mostrarBuscador ? filtradas.slice(0, visibles) : opciones;

  // `posLista` (no solo `abierto`) en las dependencias: el panel recién se monta un render después de
  // abrir (usePosicionLista mide el botón antes de poder posicionarlo) — enfocar solo con `abierto` intentaba
  // enfocar un <input> que todavía no existía en el DOM, y se perdía el foco para siempre en esa apertura.
  useEffect(() => {
    if (abierto && posLista && mostrarBuscador) buscador.current?.focus();
  }, [abierto, posLista, mostrarBuscador]);

  if (estado === "admin") {
    return (
      <p role="status" className={`flex items-center gap-2 rounded-lg border border-pizarra/25 bg-pizarra/[0.06] px-3 py-2.5 text-[13px] text-tinta/80 ${className}`}>
        <ShieldCheck className="h-4 w-4 shrink-0 text-pizarra" aria-hidden />
        <span>
          <b className="font-semibold text-tinta">Eres admin:</b> no necesitas autorización. Lo que guardes queda a tu nombre.
        </span>
      </p>
    );
  }

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
  const cortos = nombresCortos(opciones.map((p) => p.nombre));

  function abrirOCerrar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setBusqueda("");
    mostrarDesde(Math.max(0, opciones.findIndex((p) => p.personaId === elegidoId)));
    setAbierto(true);
  }

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

  return (
    <div ref={raiz} className={`relative ${className}`} onKeyDown={alTeclado}>
      <p className="label-cayla mb-1.5 flex items-center gap-1.5 text-[11px] text-tinta/70">
        Responsable <span className="text-rojo" aria-hidden>*</span>
      </p>
      <button
        ref={boton}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-label={elegido ? `Responsable: ${elegido.nombre.replace(/\.$/, "")}. Cambiar` : "Elegir responsable"}
        disabled={deshabilitado || cargando}
        onClick={abrirOCerrar}
        className={`flex h-12 w-full items-center gap-2.5 rounded-lg border bg-crema px-3.5 text-left transition-[border-color,box-shadow] duration-200 disabled:cursor-default disabled:opacity-60 ${
          elegido ? "border-tinta" : "border-dashed border-rojo/55 text-rojo-profundo hover:border-rojo"
        }`}
      >
        {elegido ? (
          <AvatarPersona personaId={elegido.personaId} nombre={elegido.nombre} className="h-7 w-7 text-sm" />
        ) : (
          <UserRound className="h-[18px] w-[18px] flex-none" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">
          {cargando ? "Leyendo quién está de turno…" : elegido ? (cortos.get(elegido.nombre) ?? elegido.nombre) : control.pregunta}
        </span>
        <ChevronDown className={`h-4 w-4 flex-none transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {/* Pantalla abierta sin red (ADR-0209): la lista es la última que se leyó aquí. La base confirma al subir. */}
      {control.deMemoria && (
        <p className="mt-1.5 text-xs text-ambar-profundo">
          Sin conexión: lista de turno de las {diaYHoraLima(control.deMemoria).hora}. Al subir, el sistema confirma que esa persona estaba de turno.
        </p>
      )}

      {abierto && posLista && (
        <div
          style={{ position: "fixed", ...posLista }}
          className="anim-revelar z-50 flex flex-col overflow-hidden rounded-xl border border-sand bg-papel shadow-[0_18px_44px_-14px_rgb(26_26_24/0.22)]"
        >
          {mostrarBuscador && (
            <input
              ref={buscador}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                reiniciar();
              }}
              placeholder="Buscar…"
              aria-label={`Buscar en de turno ahora · ${sede}`}
              aria-controls={idLista}
              autoComplete="off"
              className="w-full shrink-0 border-b border-tinta/15 bg-transparent px-3 py-2.5 text-sm text-tinta outline-none placeholder:text-tinta/45"
            />
          )}
          <div id={idLista} role="listbox" aria-label={`De turno ahora en ${sede}`} onScroll={alHacerScroll} className="min-h-0 flex-1 overflow-y-auto p-2">
            <p className="label-cayla px-2 pb-2 pt-1.5 text-[11px] text-tinta/60">De turno ahora · {sede}</p>
            {mostrarBuscador && mostradas.length === 0 ? (
              <p className="px-2 py-3 text-sm text-tinta/65">Nada coincide con «{busqueda.trim()}».</p>
            ) : (
              mostradas.map((p) => (
                <button
                  key={p.personaId}
                  type="button"
                  role="option"
                  aria-selected={p.personaId === elegidoId}
                  disabled={p.enPausa}
                  onClick={() => elegir(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors enabled:hover:bg-sand/55 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <AvatarPersona personaId={p.personaId} nombre={p.nombre} className="h-7 w-7 text-sm" />
                  <span className="min-w-0 flex-1">
                    {cortos.get(p.nombre) ?? p.nombre}
                    <small className="block text-[11.5px] text-tinta/60">
                      {p.enPausa ? "En pausa · no puede firmar" : p.deOtraSede ? "De turno · de otra sede" : "De turno"}
                    </small>
                  </span>
                  <span className={`h-2 w-2 flex-none rounded-full ${p.enPausa ? "bg-ambar" : "bg-verde"}`} aria-hidden />
                </button>
              ))
            )}
            {lista.salieron > 0 && (
              <p className="mt-1.5 border-t border-sand px-2 pb-0.5 pt-2 text-xs text-tinta/60">
                {lista.salieron === 1 ? "1 persona ya marcó su salida y no aparece." : `${lista.salieron} personas ya marcaron su salida y no aparecen.`}
              </p>
            )}
          </div>
        </div>
      )}

      {!elegido && !cargando && <p className="mt-1.5 text-xs text-tinta/60">Obligatorio para guardar.</p>}
    </div>
  );
}

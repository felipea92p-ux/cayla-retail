"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { clave } from "@/lib/buscar-prenda-v2";
import { createClient } from "@/lib/supabase/client";
import { armarEquipo, textoEstado, type MiembroEquipo } from "@/lib/inicio-avisos";
import type { ItemMenu } from "@/lib/menu";

type Props = {
  /** Toda pantalla que este perfil puede abrir, ya resuelta por rol (`menu.riel.flatMap(hojasDe)` en
   *  AppShell.tsx — el mismo filtro del lateral, así el buscador nunca ofrece algo que la persona no
   *  puede abrir). */
  pantallas: ItemMenu[];
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** Solo una tienda con persona real tiene «de turno» que buscar — misma condición que «Equipo de
   *  hoy» en Inicio (`app/(app)/page.tsx`). */
  mostrarEquipo: boolean;
};

type Fila = { tipo: "pantalla"; item: ItemMenu } | { tipo: "persona"; item: MiembroEquipo };

/**
 * Buscador global de la cabecera (spike `docs/maquetas/dynamic-visual-spike-2026-09/`, aprobado por
 * Felipe 2026-09-28): busca pantallas del menú y quién está de turno en la sede, sin salir de donde se
 * está. `Ctrl`/`Cmd`+`K` o el botón de la cabecera lo abren. Adrede NO busca prendas — `/buscar` sigue
 * siendo su propia pantalla; mezclar «3 unidades de la talla M» con «Chiara Farfán» en la misma lista
 * confunde más de lo que ahorra. Y adrede una fila de «Equipo» no lleva a ningún lado: es para
 * encontrar a alguien, no para actuar sobre esa persona (eso ya vive en Colaboradores).
 */
export function BuscadorGlobal({ pantallas, ubicacionId, ubicacionEtiqueta, mostrarEquipo }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const [marcada, setMarcada] = useState(0);
  const [equipo, setEquipo] = useState<MiembroEquipo[] | null>(null);
  const campoRef = useRef<HTMLInputElement | null>(null);

  function abrir() {
    setAbierto(true);
  }
  function cerrar() {
    setAbierto(false);
    setQuery("");
    setMarcada(0);
  }

  // Ctrl/Cmd+K abre Y cierra — a diferencia del único atajo global que ya existía (`[`, plegar el
  // lateral, AppShell.tsx), que nunca necesita cerrar un diálogo abierto, así que no comparte su guarda.
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setAbierto((actual) => {
        if (actual) return false;
        // No se abre encima de otro diálogo ya abierto (ADR-0136): el buscador espera su turno.
        if (document.querySelector('[role="dialog"]')) return actual;
        return true;
      });
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, []);

  // El equipo se pide recién al abrir (no en cada carga de página) y una sola vez por sesión de la
  // pestaña: es una lista para ENCONTRAR a alguien, no un tablero en vivo. Llamada directa a la RPC
  // (no una Server Action): así el loader general (ADR-0149, `espera-reglas.ts`) la reconoce como
  // lectura por el prefijo `fn_` en vez de mostrar «Guardando…» — una Server Action siempre cuenta
  // como escritura ahí, sin excepción para lecturas.
  useEffect(() => {
    if (!abierto || !mostrarEquipo || equipo !== null) return;
    let cancelado = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("fn_asesoras_de_turno", { p_ubicacion_id: ubicacionId });
        if (error) throw error;
        // `armarEquipo(turno, null)`: sin la actividad (ventas/monto) — el buscador solo necesita
        // nombre y estado, la misma regla que ya documenta `inicio-avisos.ts` para "quien mira no ve
        // la actividad": la fila queda solo con el nombre.
        if (!cancelado) setEquipo(armarEquipo(data ?? [], null));
      } catch (e) {
        console.error("Buscador global · no se pudo leer quién está de turno:", e);
        if (!cancelado) setEquipo([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [abierto, mostrarEquipo, equipo, ubicacionId]);

  useEffect(() => {
    if (!abierto) return;
    const id = setTimeout(() => campoRef.current?.focus(), 10);
    return () => clearTimeout(id);
  }, [abierto]);

  const k = clave(query);
  const pantallasFiltradas = k ? pantallas.filter((p) => clave(p.etiqueta).includes(k)) : pantallas;
  const equipoFiltrado = (equipo ?? []).filter((m) => !k || clave(m.nombre).includes(k));

  const filas: Fila[] = useMemo(
    () => [
      ...pantallasFiltradas.map((item): Fila => ({ tipo: "pantalla", item })),
      ...equipoFiltrado.map((item): Fila => ({ tipo: "persona", item })),
    ],
    [pantallasFiltradas, equipoFiltrado]
  );

  // Vuelve a la primera fila cuando cambia lo escrito — ajustado durante el render, con estado (no un
  // ref: un ref no puede leerse en render) ni un efecto aparte
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // así no hay un frame de más con la fila vieja marcada sobre una lista ya filtrada distinta.
  const [queryAnterior, setQueryAnterior] = useState(query);
  if (queryAnterior !== query) {
    setQueryAnterior(query);
    if (marcada !== 0) setMarcada(0);
  }

  function alTecladoLista(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filas.length) setMarcada((m) => (m + 1) % filas.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filas.length) setMarcada((m) => (m - 1 + filas.length) % filas.length);
    } else if (e.key === "Enter") {
      const fila = filas[marcada];
      if (fila?.tipo === "pantalla") {
        e.preventDefault();
        const href = fila.item.href;
        cerrar();
        router.push(href);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Buscar una pantalla o a alguien del equipo"
        title="Buscar  ( Ctrl K )"
        className="hidden items-center gap-2.5 rounded-full border border-sand bg-hueso px-3.5 py-2 text-[13px] text-tinta/60 transition-colors hover:border-taupe/40 hover:bg-sand sm:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
          <circle cx="10.5" cy="10.5" r="7.5" />
          <path d="M21 21l-4.8-4.8" />
        </svg>
        <span>Buscar…</span>
        <span className="ml-1 flex items-center gap-0.5">
          <span className="rounded border border-sand bg-papel px-1.5 py-px text-[10px] font-semibold text-tinta/50">Ctrl</span>
          <span className="rounded border border-sand bg-papel px-1.5 py-px text-[10px] font-semibold text-tinta/50">K</span>
        </span>
      </button>

      {abierto && (
        <Modal
          titulo="Buscar"
          subtitulo={mostrarEquipo ? "Pantallas del menú y quién está de turno ahora." : "Pantallas del menú."}
          onClose={cerrar}
          variante="papel"
          ancho="sm:max-w-xl"
        >
          <div className="relative mb-4">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/40"
            >
              <circle cx="10.5" cy="10.5" r="7.5" />
              <path d="M21 21l-4.8-4.8" />
            </svg>
            <input
              ref={campoRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={alTecladoLista}
              placeholder="Pantalla o persona del equipo…"
              className="caja-cayla w-full py-2.5 pl-9 pr-3 text-sm text-tinta placeholder:text-tinta/40 focus:border-taupe/40"
            />
          </div>

          <div className="-mx-1 max-h-[22rem] space-y-4 overflow-y-auto px-1">
            {pantallasFiltradas.length > 0 && (
              <div>
                <p className="label-cayla px-2 pb-1.5 text-[10.5px] text-tinta/50">Pantallas</p>
                <div className="space-y-0.5">
                  {pantallasFiltradas.map((p, idx) => (
                    <Link
                      key={p.href}
                      href={p.href}
                      onClick={cerrar}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        idx === marcada ? "bg-hueso text-tinta" : "text-tinta/80 hover:bg-sand/40"
                      }`}
                    >
                      <span className="flex-1">{p.etiqueta}</span>
                      <span className="font-mono text-[11px] text-tinta/40">{p.href}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {equipoFiltrado.length > 0 && (
              <div>
                <p className="label-cayla px-2 pb-1.5 text-[10.5px] text-tinta/50">Equipo · {ubicacionEtiqueta}</p>
                <div className="space-y-0.5">
                  {equipoFiltrado.map((m, idx) => {
                    const i = pantallasFiltradas.length + idx;
                    return (
                      <div key={m.personaId} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${i === marcada ? "bg-hueso" : ""}`}>
                        <AvatarPersona personaId={m.personaId} nombre={m.nombre} className="h-7 w-7 text-xs" />
                        <span className="flex-1">
                          <span className="block text-tinta">{m.nombre}</span>
                          <span className="block text-[11.5px] text-tinta/55">{textoEstado(m.estado)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pantallasFiltradas.length === 0 && equipoFiltrado.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-tinta/50">Sin coincidencias para «{query}»</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

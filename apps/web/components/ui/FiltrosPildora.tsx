"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { ALTO_CONTROL, Hilo } from "@/components/ui/campos";
import { type OpcionCombo } from "@/components/ui/ComboBuscable";
import { usePosicionLista } from "@/components/ui/useAnclaje";
import { useComboLista } from "@/components/ui/useCombo";
import { clave } from "@/lib/buscar-prenda-v2";
import { comboNecesitaBuscador } from "@/lib/combo-reglas";

/* ====================================================================
   Píldoras de filtro · patrón compartido (nacido en FiltrosProductos el
   2026-09-17, extraído acá el 2026-09-18 al sumarse FiltrosCompras) —
   la barra "Buscar + botón Filtros" que despliega un panel de píldoras,
   una por filtro, con chips debajo de lo aplicado.
   Cualquier listado nuevo con este patrón importa de acá en vez de
   copiar el control a mano — Compras y Productos ya divergían en los
   filtros propios (proveedor/pago no son categoría/color), pero no
   tenían por qué divergir también en cómo se ve el control.
   ==================================================================== */

/** El "sin selección" — en la URL "" ya significa "sin filtro", este sentinel hace de puente. */
export const TODOS = "__todos__";

/** El botón "Filtros · N" que abre/cierra el panel — mismo alto y mismo
 *  ritmo vertical que el campo de búsqueda al lado (ver comentario en cada
 *  consumidor sobre el `<span>` de etiqueta transparente que los empareja). */
export function BotonFiltros({ abierto, activos, onClick }: { abierto: boolean; activos: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-controls="filtros-panel"
      className={`label-cayla mt-1.5 ${ALTO_CONTROL} inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3.5 text-[11px] transition-colors ${
        abierto || activos > 0
          ? "border-tinta/30 bg-tinta/[0.04] text-tinta"
          : "border-tinta/15 text-tinta/65 hover:border-tinta/25 hover:text-tinta"
      }`}
    >
      <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
      Filtros{activos > 0 ? ` · ${activos}` : ""}
    </button>
  );
}

/** El panel que agrupa las píldoras — una sola superficie (`divide-x` entre
 *  cada una), no una caja por campo. */
export function PanelPildoras({ children }: { children: ReactNode }) {
  return (
    <div id="filtros-panel" className="anim-revelar flex flex-wrap items-center divide-x divide-tinta/10 rounded-xl bg-sand/50 p-1 shadow-sm">
      {children}
    </div>
  );
}

/** Desplegable con estilo propio para el panel de filtros — a diferencia de `<select>` nativo, acá SÍ se puede
 *  vestir la lista abierta, no solo el control cerrado. `valor`/`onValor` ya vienen resueltos contra el
 *  sentinel `TODOS`, este componente no sabe de URLs.
 *
 *  Sin caja propia (2026-09-17, pedido de Felipe: "no me gusta que estén encapsulados en esos rectángulos
 *  blancos") — nada de borde ni fondo en reposo: el mismo hilo vivo de `CampoTexto`/`SelectNativo` marca dónde
 *  está parado, la tipografía marca si hay un valor elegido (`activa`, no `elegida`: "Todos" es una opción real
 *  y SIEMPRE hay una elegida — lo que importa es si es distinta de "Todos"). El panel que los agrupa
 *  (`divide-x`) es la única superficie; cada campo adentro es texto, no una caja más.
 *
 *  Hand-rolled (2026-09-25, ADR-0194) y no Radix `Select`: la regla global de combos (buscador con más de 8
 *  opciones) necesita un `<input>` de texto dentro de la lista desplegada, y el `Select` de Radix está pensado
 *  para navegar opciones, no para alojar un campo de texto propio adentro — mismo mecanismo que ya usa
 *  `Desplegable` (`campos.tsx`), con este vestido de píldora en vez de campo de formulario. */
export function DesplegablePildora({
  icono: Icono,
  etiqueta,
  valor,
  onValor,
  opciones,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
  opciones: readonly OpcionCombo<string>[];
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const activa = valor !== TODOS;

  // Regla global de combos (ADR-0194): con más de 8 opciones, un buscador; si no, la lista de siempre.
  const mostrarBuscador = comboNecesitaBuscador(opciones.length);
  const filtradas = useMemo(() => {
    if (!mostrarBuscador || !busqueda) return opciones;
    const k = clave(busqueda);
    return opciones.filter((o) => clave(o.texto).includes(k));
  }, [opciones, busqueda, mostrarBuscador]);
  const { visibles, mostrarDesde, reiniciar, alHacerScroll } = useComboLista();
  const mostradas = mostrarBuscador ? filtradas.slice(0, visibles) : opciones;

  const posLista = usePosicionLista(contenedor, abierto, 288);
  const listaVisible = abierto && !!posLista;
  const elegida = opciones.find((o) => o.valor === valor) ?? null;

  function abrir() {
    setBusqueda("");
    const i = Math.max(0, opciones.findIndex((o) => o.valor === valor));
    setActivo(i);
    mostrarDesde(i);
    setAbierto(true);
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) disparador.current?.focus();
  }

  function elegir(o: OpcionCombo<string>) {
    onValor(o.valor);
    cerrar();
  }

  useEffect(() => {
    if (!listaVisible) return;
    if (mostrarBuscador) buscador.current?.focus();
    else lista.current?.focus();
    const afuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [listaVisible, mostrarBuscador]);

  useEffect(() => {
    if (!listaVisible) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo, listaVisible]);

  function alTeclado(e: React.KeyboardEvent) {
    if (!abierto) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        cerrar();
        break;
      case "Tab":
        setAbierto(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActivo((i) => Math.min(mostradas.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActivo((i) => Math.max(0, i - 1));
        break;
      case " ":
        if (mostrarBuscador) break; // el espacio es texto de búsqueda, no una elección.
        e.preventDefault();
        if (mostradas[activo]) elegir(mostradas[activo]);
        break;
      case "Enter":
        e.preventDefault();
        if (mostradas[activo]) elegir(mostradas[activo]);
        break;
    }
  }

  return (
    <div className="relative" ref={contenedor}>
      <button
        ref={disparador}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={etiqueta}
        aria-controls={`${id}-lista`}
        onClick={() => (abierto ? cerrar(false) : abrir())}
        onKeyDown={alTeclado}
        className={`label-cayla group relative flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] outline-none transition-colors ${
          activa ? "text-tinta" : "text-tinta/60 hover:text-tinta"
        }`}
      >
        <Icono aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-colors ${activa ? "text-tinta/70" : "text-tinta/40 group-hover:text-tinta/60"}`} />
        <span>{elegida?.texto ?? etiqueta}</span>
        <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-tinta/35" />
        <Hilo activo={abierto} />
      </button>

      {listaVisible && (
        <div
          style={{ position: "fixed", ...posLista }}
          className="anim-revelar z-50 flex flex-col overflow-hidden rounded-lg border border-sand bg-papel shadow-md"
        >
          {mostrarBuscador && (
            <input
              ref={buscador}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setActivo(0);
                reiniciar();
              }}
              onKeyDown={alTeclado}
              placeholder="Buscar…"
              aria-label={`Buscar en ${etiqueta}`}
              aria-controls={`${id}-lista`}
              autoComplete="off"
              className="w-full shrink-0 border-b border-tinta/15 bg-transparent px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45"
            />
          )}
          <ul
            id={`${id}-lista`}
            ref={lista}
            role="listbox"
            aria-label={etiqueta}
            tabIndex={mostrarBuscador ? undefined : -1}
            onKeyDown={mostrarBuscador ? undefined : alTeclado}
            onScroll={alHacerScroll}
            className="scroll-cayla min-h-0 flex-1 overflow-y-auto p-1"
          >
            {mostradas.length === 0 ? (
              <li className="px-3 py-3 text-sm text-tinta/65">Nada coincide con «{busqueda.trim()}».</li>
            ) : (
              mostradas.map((o, i) => (
                <li
                  key={o.valor}
                  data-i={i}
                  role="option"
                  aria-selected={o.valor === valor}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(o)}
                  className={`relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors ${
                    i === activo ? "bg-rojo/8 text-tinta" : "text-tinta"
                  } ${o.valor === valor ? "font-semibold" : ""}`}
                >
                  {o.icono && <span className="mr-2 inline-block align-middle">{o.icono}</span>}
                  <span className="align-middle">{o.texto}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

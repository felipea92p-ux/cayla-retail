"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { clave } from "@/lib/buscar-prenda-v2";

/* ====================================================================
   ComboBuscable · elegir una opción entre muchas, tipeando (2026-09-14)

   Por qué existe: en "Registrar factura" el producto de cada línea era un
   <select> nativo con TODAS las referencias del catálogo. Con 30 se
   aguanta; con 300 hay que desplazar una lista del sistema operativo
   buscando "Blusa Lino" entre "Blusa Algodón", "Blusa Crepé"… y la
   colaboradora que copia una factura de 20 líneas lo hace 20 veces.

   El `Desplegable` de campos.tsx no sirve para esto: es un select propio
   con tipeo-para-saltar, pero no FILTRA — muestra siempre la lista
   entera. Este control es un input: lo que se tipea recorta la lista, y
   se busca sin tildes ni mayúsculas (misma `clave` que el buscador de
   Vender, para que "lino" encuentre "Lino" y "algodon", "Algodón").

   Teclado completo (flechas, Enter, Escape, Tab), roles ARIA del patrón
   combobox. Al perder el foco sin elegir, vuelve a mostrar la opción
   elegida — nunca queda un texto que no corresponde a nada.
   ==================================================================== */

/** `icono`: algo visual opcional antes del texto (una muestra de patrón, un color…). Solo se pinta en la lista desplegable. */
export type OpcionCombo<T extends string> = { valor: T; texto: string; detalle?: string; icono?: ReactNode };

const MAX_VISIBLES = 40;

export function ComboBuscable<T extends string>({
  valor,
  onValor,
  opciones,
  marcador = "Buscar…",
  etiquetaAccesible,
  autoFocus = false,
  className = "",
  id: idPropio,
}: {
  valor: T | "";
  onValor: (v: T) => void;
  opciones: readonly OpcionCombo<T>[];
  marcador?: string;
  etiquetaAccesible: string;
  autoFocus?: boolean;
  className?: string;
  /** Id del input, para enfocarlo desde un aviso. */
  id?: string;
}) {
  const idGenerado = useId();
  const id = idPropio ?? idGenerado;
  const elegida = opciones.find((o) => o.valor === valor) ?? null;
  const [texto, setTexto] = useState(elegida?.texto ?? "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  // Si el valor cambia desde afuera (se limpió la línea, se cargó otra),
  // el texto acompaña. Se ajusta durante el render —el patrón de React para
  // estado derivado de una prop— y no en un efecto, que pintaría un cuadro
  // con el texto viejo antes de corregirlo.
  const [valorPrevio, setValorPrevio] = useState(valor);
  if (valor !== valorPrevio) {
    setValorPrevio(valor);
    if (!abierto) setTexto(elegida?.texto ?? "");
  }

  const filtradas = useMemo(() => {
    const k = clave(texto);
    // Con el texto de la opción elegida sin tocar, se muestra todo: el
    // usuario abrió para cambiar, no para buscar lo que ya tiene.
    const lista = !k || (elegida && k === clave(elegida.texto)) ? opciones : opciones.filter((o) => clave(`${o.texto} ${o.detalle ?? ""}`).includes(k));
    return lista.slice(0, MAX_VISIBLES);
  }, [texto, opciones, elegida]);

  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo, abierto]);

  function abrir() {
    setActivo(Math.max(0, filtradas.findIndex((o) => o.valor === valor)));
    setAbierto(true);
  }

  function elegir(o: OpcionCombo<T>) {
    onValor(o.valor);
    setTexto(o.texto);
    setAbierto(false);
  }

  function cerrarSinElegir() {
    setAbierto(false);
    setTexto(elegida?.texto ?? "");
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      abrir();
      return;
    }
    if (!abierto) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((a) => Math.min(filtradas.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtradas[activo]) elegir(filtradas[activo]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cerrarSinElegir();
    } else if (e.key === "Tab") {
      // Tab elige lo resaltado si hay una sola coincidencia clara: es lo
      // que uno espera al tipear "lino" y saltar al siguiente campo.
      if (filtradas.length === 1) elegir(filtradas[0]);
      else cerrarSinElegir();
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-label={etiquetaAccesible}
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-activedescendant={abierto && filtradas[activo] ? `${id}-op-${activo}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        value={texto}
        placeholder={marcador}
        onFocus={() => {
          abrir();
          // Todo seleccionado al entrar: tipear reemplaza, no agrega al final.
          requestAnimationFrame(() => input.current?.select());
        }}
        onClick={() => !abierto && abrir()}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
          if (!abierto) setAbierto(true);
        }}
        onKeyDown={alTeclado}
        onBlur={() => cerrarSinElegir()}
        className="w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-b-2 focus:border-rojo"
      />
      {abierto && (
        <ul
          ref={lista}
          id={`${id}-lista`}
          role="listbox"
          aria-label={etiquetaAccesible}
          className="card-cayla absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto shadow-lg"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-3 text-sm text-tinta/65">Nada coincide con «{texto.trim()}».</li>
          ) : (
            filtradas.map((o, i) => (
              <li
                key={o.valor}
                id={`${id}-op-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.valor === valor}
                onMouseEnter={() => setActivo(i)}
                // mousedown y no click: el blur del input cerraría la lista
                // antes de que el click llegara.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                className={`cursor-pointer px-3 py-2 text-sm ${i === activo ? "bg-sand/60 text-tinta" : "text-tinta/85"} ${o.valor === valor ? "font-semibold" : ""}`}
              >
                {o.icono && <span className="mr-2.5 inline-block align-middle">{o.icono}</span>}
                <span className="align-middle">{o.texto}</span>
                {o.detalle && <span className="ml-2 text-xs text-tinta/55">{o.detalle}</span>}
              </li>
            ))
          )}
          {opciones.length > MAX_VISIBLES && filtradas.length === MAX_VISIBLES && (
            <li className="px-3 py-2 text-xs text-tinta/55">Se muestran {MAX_VISIBLES}. Sigue tipeando para acortar.</li>
          )}
        </ul>
      )}
    </div>
  );
}

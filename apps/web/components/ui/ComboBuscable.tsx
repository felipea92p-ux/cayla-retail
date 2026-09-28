"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDestinoFlotante, usePosicionLista } from "@/components/ui/useAnclaje";
import { useComboLista } from "@/components/ui/useCombo";
import { clave } from "@/lib/buscar-prenda-v2";
import { coincidenciaCombo } from "@/lib/combo-reglas";

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

   Paginado (2026-09-25, ADR-0209): sin `limite`, el techo lo pone la regla
   global de combos — revela `TAMANO_PAGINA_COMBO` (50) y suma 50 más solos
   al llegar el scroll al fondo (`useComboLista`, compartido con
   `Desplegable`). Antes cortaba siempre en 40 con "sigue tipeando para
   acortar" — el mismo parche que `Desplegable` no tenía.

   Crear arriba (2026-09-28, spike Nuevo producto v2): con `crearArriba`, la
   opción de crear es la PRIMERA fila y queda fija arriba mientras se baja
   (`sticky`): con 84 marcas nadie tiene que llegar al final para registrar
   una. Las flechas la cuentan como el índice 0; lo resaltado al abrir o al
   tipear sigue siendo la primera opción real, para que «cayla» + Enter elija
   CAYLA y no abra «crear». Sin la prop, todo queda como estaba (al final).
   ==================================================================== */

/** `icono`: algo visual opcional antes del texto (una muestra de patrón, un color…). Solo se pinta en la lista desplegable. */
/** `claves`: otras palabras que también encuentran la opción (sinónimos: «plomo» → Gris). No se muestran, salvo cuando
 *  la opción aparece solo por una de ellas: entonces la lista dice cuál. */
export type OpcionCombo<T extends string> = { valor: T; texto: string; detalle?: string; icono?: ReactNode; claves?: readonly string[] };

export function ComboBuscable<T extends string>({
  valor,
  onValor,
  opciones,
  marcador = "Buscar…",
  etiquetaAccesible,
  autoFocus = false,
  className = "",
  id: idPropio,
  limite,
  crear,
  crearArriba = false,
  caja = false,
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
  /** Techo FIJO de opciones visibles, sin paginar (spike Nuevo producto, 2026-09-24: con 60 proveedores, 6
   *  alcanzan y el resto se encuentra tipeando). Sin esto, el techo lo pone la regla global de combos
   *  (ADR-0209): revela de a `TAMANO_PAGINA_COMBO` y el scroll pide más — pasar `limite` apaga esa paginación
   *  a propósito, para cuando "sigue tipeando" es el comportamiento que se quiere forzar. */
  limite?: number;
  /** Última opción de la lista para crear lo que no está («+ Registrar «Tex» como proveedor nuevo»). Recibe lo tipeado. */
  crear?: {
    etiqueta: (texto: string) => string;
    onCrear: (texto: string) => void;
    /** Con el campo vacío, en lugar de la opción de crear se muestra esta pista, que no se elige («¿Es nueva? Escribe
     *  su nombre arriba»): para cuando crear sin texto no tiene sentido. Sin esto, la opción sale también vacía. */
    pista?: string;
  };
  /** La opción de crear va PRIMERA y fija arriba al desplazar la lista, no al final (spike Nuevo producto v2). */
  crearArriba?: boolean;
  /** Campo en caja hundida (`caja-cayla`) en vez de línea: el de los formularios con caja. */
  caja?: boolean;
}) {
  const idGenerado = useId();
  const id = idPropio ?? idGenerado;
  const elegida = opciones.find((o) => o.valor === valor) ?? null;
  const [texto, setTexto] = useState(elegida?.texto ?? "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  // La lista va en `fixed`, medida contra el input: dentro de un <Modal> o de una tabla con scroll, una lista
  // `absolute` queda recortada por esa caja (ver `usePosicionLista`).
  const posLista = usePosicionLista(input, abierto, 256, 4);
  const destino = useDestinoFlotante(input, abierto);

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
    return !k || (elegida && k === clave(elegida.texto)) ? opciones : opciones.filter((o) => coincidenciaCombo(o, k, clave) !== null);
  }, [texto, opciones, elegida]);
  const { visibles, mostrarDesde, reiniciar, alHacerScroll } = useComboLista();
  // La clave (sinónimo) por la que una opción respondió a lo escrito, si fue solo por ella: la lista la muestra.
  const porClave = (o: OpcionCombo<T>) => coincidenciaCombo(o, clave(texto), clave) || null;
  // `limite` explícito manda y NO pagina (spike Nuevo producto): es un techo fijo, no el de la regla global.
  const mostradas = filtradas.slice(0, limite ?? visibles);
  // La opción «crear» va al final (índice = mostradas.length) o, con `crearArriba`, primera (índice 0, y las opciones
  // corren uno: la opción `i` es la fila `i + base`). Se alcanza con las flechas como cualquier otra. Con `pista` y el
  // campo vacío no hay opción de crear: hay un texto que no se elige.
  const hayCrearPara = (t: string) =>
    Boolean(crear) && !(crear?.pista && t.trim() === "") && !opciones.some((o) => clave(o.texto) === clave(t) && clave(t) !== "");
  const hayCrear = hayCrearPara(texto);
  const pistaVisible = Boolean(crear?.pista) && texto.trim() === "";
  const base = hayCrear && crearArriba ? 1 : 0;
  const indiceCrear = hayCrear ? (crearArriba ? 0 : mostradas.length) : -1;
  const opcionEn = (fila: number) => mostradas[fila - base];
  const ultimo = mostradas.length - 1 + (hayCrear ? 1 : 0);
  // Lo resaltado al abrir o al tipear: la primera opción real, aunque crear vaya arriba (Enter elige, no crea); si no
  // hay ninguna, la de crear.
  // (Lo que se acaba de tipear todavía no está en `filtradas`: se pregunta si ALGUNA opción responde a ese texto.)
  const algunaPara = (t: string) => (clave(t) ? opciones.some((o) => coincidenciaCombo(o, clave(t), clave) !== null) : opciones.length > 0);
  const primeraFila = (t: string) => (hayCrearPara(t) && crearArriba && algunaPara(t) ? 1 : 0);

  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo, abierto]);

  function abrir() {
    const i = filtradas.findIndex((o) => o.valor === valor);
    setActivo(i >= 0 ? i + base : primeraFila(texto));
    mostrarDesde(Math.max(0, i));
    setAbierto(true);
  }

  function elegir(o: OpcionCombo<T>) {
    onValor(o.valor);
    setTexto(o.texto);
    setAbierto(false);
  }

  function crearDesdeTexto() {
    setAbierto(false);
    crear?.onCrear(texto.trim());
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
      setActivo((a) => Math.min(ultimo, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hayCrear && activo === indiceCrear) crearDesdeTexto();
      else if (opcionEn(activo)) elegir(opcionEn(activo));
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Este Escape cerró la lista: que no siga y cierre también el modal (useEscapeLibre.ts). Con la lista cerrada,
      // el `return` de arriba lo deja pasar y el modal sí se cierra.
      e.stopPropagation();
      cerrarSinElegir();
    } else if (e.key === "Tab") {
      // Tab elige lo resaltado si hay una sola coincidencia clara: es lo
      // que uno espera al tipear "lino" y saltar al siguiente campo.
      if (filtradas.length === 1) elegir(filtradas[0]);
      else cerrarSinElegir();
    }
  }

  // La fila de crear (o su pista, que no se elige). Abajo, separada por una línea arriba; arriba, fija al desplazar
  // (`sticky`) con fondo opaco —papel, el de la tarjeta; hueso resaltada— para que las filas no se lean a través.
  const filaCrear = !crear ? null : hayCrear ? (
    <li
      id={`${id}-op-${indiceCrear}`}
      data-i={indiceCrear}
      role="option"
      aria-selected={false}
      onMouseEnter={() => setActivo(indiceCrear)}
      onMouseDown={(e) => {
        e.preventDefault();
        crearDesdeTexto();
      }}
      className={`cursor-pointer px-3 py-2.5 text-sm font-semibold ${
        crearArriba ? `sticky top-0 z-[1] border-b border-sand ${activo === indiceCrear ? "bg-hueso text-tinta" : "bg-papel text-tinta/85"}` : `border-t border-sand ${activo === indiceCrear ? "bg-sand/60 text-tinta" : "text-tinta/85"}`
      }`}
    >
      {crear.etiqueta(texto.trim())}
    </li>
  ) : pistaVisible ? (
    <li
      aria-hidden
      className={`px-3 py-2.5 text-sm text-taupe ${crearArriba ? "sticky top-0 z-[1] border-b border-sand bg-papel" : "border-t border-sand"}`}
    >
      {crear.pista}
    </li>
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-label={etiquetaAccesible}
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-activedescendant={abierto && (opcionEn(activo) || activo === indiceCrear) ? `${id}-op-${activo}` : undefined}
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
          setActivo(primeraFila(e.target.value));
          reiniciar();
          if (!abierto) setAbierto(true);
        }}
        onKeyDown={alTeclado}
        onBlur={() => cerrarSinElegir()}
        className={
          caja
            ? "caja-cayla h-10 w-full min-w-0 px-3 text-sm text-tinta outline-none placeholder:text-tinta/45"
            : "w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-b-2 focus:border-rojo"
        }
      />
      {/* Portal a `document.body` (como `MenuAcciones`/`ResumenControles`, ADR-0211): esta lista va en `fixed`
          medida contra el control, y sin portal cualquier ancestro con stacking context propio (una tarjeta
          `@container`, un modal) la atrapa y la pinta detrás de contenido posterior en el DOM aunque tenga `z-50`. */}
      {abierto &&
        posLista &&
        destino &&
        createPortal(
          <ul
            ref={lista}
            style={{ position: "fixed", ...posLista }}
            id={`${id}-lista`}
            role="listbox"
            aria-label={etiquetaAccesible}
            onScroll={limite == null ? alHacerScroll : undefined}
            // `anim-revelar`: la misma entrada que el resto de los combos y que el selector de sede (240 ms, sin espera).
            // Era el único que aparecía de golpe; la lista se monta una vez por apertura, así que tipear no la repite.
            className="anim-revelar card-cayla z-50 overflow-y-auto shadow-lg"
          >
          {crearArriba && filaCrear}
          {mostradas.length === 0 && (hayCrear || pistaVisible) && texto.trim() === "" ? null : mostradas.length === 0 ? (
            <li className="px-3 py-3 text-sm text-tinta/65">Nada coincide con «{texto.trim()}».</li>
          ) : (
            mostradas.map((o, j) => {
              const i = j + base;
              return (
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
                // Con la fila de crear fija arriba, `scroll-mt` deja que la opción resaltada con flechas no quede tapada por ella.
                className={`cursor-pointer px-3 py-2 text-sm ${crearArriba ? "scroll-mt-11" : ""} ${i === activo ? "bg-sand/60 text-tinta" : "text-tinta/85"} ${o.valor === valor ? "font-semibold" : ""}`}
              >
                {o.icono && <span className="mr-2.5 inline-block align-middle">{o.icono}</span>}
                <span className="align-middle">{o.texto}</span>
                {o.detalle && <span className="ml-2 text-xs text-tinta/55">{o.detalle}</span>}
                {porClave(o) && <span className="ml-2 text-xs text-tinta/55">«{porClave(o)}»</span>}
              </li>
              );
            })
          )}
          {limite != null && filtradas.length > mostradas.length && (
            <li className="px-3 py-2 text-xs text-tinta/55">+{filtradas.length - mostradas.length} más: sigue escribiendo</li>
          )}
          {!crearArriba && filaCrear}
        </ul>,
          destino
        )}
    </div>
  );
}

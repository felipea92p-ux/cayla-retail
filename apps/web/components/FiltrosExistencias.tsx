"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpDown, CircleAlert, Link2, ListChecks, Palette, Ruler, Shirt, Tag } from "lucide-react";
import { CampoTexto } from "@/components/ui/campos";
import { BotonFiltros, DesplegablePildora, FilaPildoras, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { Modal } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { useConsultaMedia } from "@/lib/useConsultaMedia";
import { COOKIE_PANEL_FILTROS_EXISTENCIAS, guardarPanelFiltros, type EstadoPanelFiltros } from "@/lib/panel-filtros";
import { TEXTO_HOY, TIPOS_HOY } from "@/lib/existencias-hoy";
import type { ConteoDeLista } from "@/lib/existencias-tarjetas";
import { opcionesConConteo } from "@/lib/productos-facetas";
import { alternarColor, estadoDeColor, listaParaUrl, opcionesDeColor, separarColor } from "@/lib/productos-filtros";
import { bordeDeMuestra, FAMILIAS_COLOR, fondoDeMuestra } from "@/lib/colores-familias";
import {
  chipsDeFiltros,
  CONDICIONES,
  contarFiltrosActivos,
  PREFIJO_FAMILIA,
  ROTULO_CONDICION,
  type ClaveUrl,
  type ConteosFiltros,
  type FiltrosElegidos,
} from "@/lib/existencias-filtros";

/* ====================================================================
   La barra de filtros de Existencias (2026-10-03): la MISMA estructura que la de Productos (ADR-0308) —buscador con «/»,
   botón «Filtros · N», panel de píldoras en dos filas con nombre, chips de lo puesto, «Copiar enlace» y «Ordenar por» en
   la fila del conteo, y en el celular una hoja con «Ver N productos»—, armada con las mismas piezas (`ui/FiltrosPildora`).
   Componente propio y no `FiltrosProductos` (Felipe, 2026-10-03: «la misma estructura, no implementarlo dentro de
   productos»): Productos filtra en la base y navega; Existencias filtra en el navegador lo que ya tiene y solo reescribe la
   URL (`useFiltrosExistencias`). Este componente no sabe de URLs: recibe lo elegido y avisa los cambios.
   ==================================================================== */

/** El buscador, para devolverle el foco desde el estado vacío y para el atajo «/». */
export const ID_BUSCADOR_EXISTENCIAS = "existencias-buscar";
/** Desde aquí el panel vive en la página; debajo, en una hoja (Tailwind `md`), como en Productos. */
const MEDIA_ESCRITORIO = "(min-width: 768px)";

/** Un color de la sede, con lo que la lista necesita para agruparlo por familia y pintar su muestra. `id` es su nombre (único
 *  en la base): es lo que va en la URL. */
export type ColorBarra = { id: string; nombre: string; hex: string | null; familia: string | null; tipo: string | null };

export type OrdenBarra = {
  valor: string;
  porDefecto: string;
  opciones: readonly { valor: string; texto: string }[];
  onValor: (v: string) => void;
};

export function FiltrosExistencias({
  busqueda,
  onTeclear,
  onSoltar,
  onEnter,
  placeholder,
  separa,
  categorias,
  tallas,
  colores,
  marcas,
  elegidos,
  conteos,
  onCambiar,
  onLimpiar,
  conteo,
  detalleTotal,
  panelInicial,
  orden,
  vista,
  nota,
  bajoBuscador,
}: {
  busqueda: string;
  onTeclear: (texto: string) => void;
  /** Al salir del buscador: lo escrito pasa a la URL de una vez. */
  onSoltar: () => void;
  /** Enter en el buscador (la pistola escribe el código y manda Enter). */
  onEnter: () => void;
  placeholder: string;
  /** La sede separa piso y almacén: solo ahí hay «Hoy» y «Condición». */
  separa: boolean;
  categorias: readonly string[];
  /** Ya en su curva (XS · S · M · L, luego la numeración). */
  tallas: readonly string[];
  /** Los colores de la sede con su familia (sin familia: sueltos al final de la lista). */
  colores: readonly ColorBarra[];
  /** `null`: la píldora Marca no se dibuja (una sola marca en la sede, o la lectura de marcas falló). */
  marcas: readonly string[] | null;
  /** Lo que de verdad filtra la lista (ya resuelto contra lo que la sede ofrece). */
  elegidos: FiltrosElegidos;
  /** Cuántos productos trae cada opción con los demás filtros puestos (`conteosDeFiltros`): se esconden las que darían una lista
   *  vacía, salvo la elegida (para verla y quitarla aunque hoy dé 0). */
  conteos: ConteosFiltros;
  /** Un cambio de filtros; `null` lo quita. */
  onCambiar: (cambios: Partial<Record<ClaveUrl, string | null>>) => void;
  onLimpiar: () => void;
  /** Cuántas tarjetas trae la lista y en qué unidad (`conteoDeLista`): productos, o prendas y sus tallas con un caso de «Hoy». */
  conteo: ConteoDeLista;
  /** Lo que sigue al conteo cuando no hay «Hoy» («Vista de piso y almacén»). */
  detalleTotal: string;
  /** Lo que este equipo dejó la última vez (cookie leída en el servidor). */
  panelInicial: EstadoPanelFiltros;
  /** «Ordenar por» (solo en las tarjetas: la tabla conserva su orden); `null` = no se ofrece. */
  orden: OrdenBarra | null;
  /** Los controles de vista de Existencias («Ver detalle», «Por prenda / Por talla»), al lado del orden. */
  vista: ReactNode;
  /** Una aclaración bajo la fila del conteo (la de «Por colgar»). */
  nota?: ReactNode;
  /** Solo en el celular, justo bajo el buscador: ahí va «Para hoy» (rediseño 2026-10-05: buscador, la línea de lo pendiente y la
   *  primera prenda entran juntos en la primera pantalla). En pantallas anchas no se dibuja: «Para hoy» sigue arriba de la tarjeta. */
  bajoBuscador?: ReactNode;
}) {
  const [panelAbierto, setPanelAbierto] = useState(panelInicial === "abierto");
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const esEscritorio = useConsultaMedia(MEDIA_ESCRITORIO);

  // «/» lleva el cursor al buscador, salvo que la persona ya esté escribiendo en otra caja (el mismo atajo de Productos).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const caja = document.getElementById(ID_BUSCADOR_EXISTENCIAS) as HTMLInputElement | null;
      if (!caja) return;
      e.preventDefault();
      caja.focus();
      caja.select();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  function alTocarFiltros() {
    if (window.matchMedia(MEDIA_ESCRITORIO).matches) {
      const nuevo = !panelAbierto;
      setPanelAbierto(nuevo);
      guardarPanelFiltros(nuevo ? "abierto" : "cerrado", COOKIE_PANEL_FILTROS_EXISTENCIAS);
    } else {
      setHojaAbierta(true);
    }
  }

  /** El enlace de esta misma lista: todo lo filtrado vive en la URL. */
  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      // Existencias muestra el stock de la sede de quien la abre (salvo un líder mirando otra con `?ubicacion=`): se dice.
      avisar.exito("Enlace copiado", { detalle: "Quien lo abra ve los mismos filtros sobre el stock de su sede." });
    } catch {
      avisar.error("No se pudo copiar el enlace", { detalle: "Cópialo desde la barra de direcciones del navegador." });
    }
  }

  const chips = chipsDeFiltros(elegidos);
  const activos = contarFiltrosActivos(elegidos);
  const quitar = (claves: readonly ClaveUrl[]) => onCambiar(Object.fromEntries(claves.map((k) => [k, null])));
  const opcion = (v: string) => ({ valor: v, texto: v });
  const contar = <O extends { valor: string }>(opciones: readonly O[], clave: keyof ConteosFiltros, elegidas: string | null | readonly string[]) =>
    opcionesConConteo(opciones, conteos[clave], elegidas === null ? [] : typeof elegidas === "string" ? [elegidas] : elegidas);
  // Color agrupado por familia, como Productos: «Toda la familia Azul» y debajo sus tonos en la escala de la carta. Marcar la
  // familia incluye todos sus tonos (las casillas lo dicen), y con algunos tonos marcados la familia queda «parcial».
  const opcionesColor = opcionesDeColor(colores, FAMILIAS_COLOR);
  const coloresMarcados = [...elegidos.familias.map((f) => PREFIJO_FAMILIA + f), ...elegidos.colores];
  const estadosColor = estadoDeColor(coloresMarcados, opcionesColor);

  // Dos filas con nombre, como Productos: arriba lo que se pregunta de la prenda (categoría, talla, color), abajo lo de quien
  // gestiona el stock (qué hacer hoy, en qué condición está, de qué marca es). El mismo panel va en la página (computadora) o
  // dentro de la hoja (celular), nunca los dos.
  const hayGestion = separa || marcas !== null;
  const panel = (
    <PanelPildoras filas>
      <FilaPildoras titulo="Prenda">
        <DesplegablePildora
          icono={Shirt}
          etiqueta="Categoría"
          valor={elegidos.categoria ?? TODOS}
          onValor={(v) => onCambiar({ cat: v === TODOS ? null : v })}
          opciones={[{ valor: TODOS, texto: "Todas" }, ...contar(categorias.map(opcion), "categoria", elegidos.categoria)]}
        />
        {/* Talla y Color aceptan varias opciones a la vez («M o L», «negro o azul»), como en Productos. */}
        <DesplegablePildora
          icono={Ruler}
          etiqueta="Talla"
          varias={{ valores: elegidos.tallas, onValores: (v) => onCambiar({ talla: listaParaUrl(v) }) }}
          rotuloCantidad="Productos · uno con varias tallas cuenta en cada una"
          opciones={contar(tallas.map(opcion), "talla", elegidos.tallas)}
        />
        <DesplegablePildora
          icono={Palette}
          etiqueta="Color"
          varias={{
            valores: coloresMarcados,
            onValores: (v) => onCambiar(separarColor(v)),
            alternar: (actual, valor) => alternarColor(actual, valor, opcionesColor),
          }}
          rotuloCantidad="Productos · uno con varios colores cuenta en cada uno"
          opciones={contar(
            opcionesColor.map((o) =>
              o.familia
                ? { valor: o.valor, texto: o.texto, grupo: true, estado: estadosColor.get(o.valor) }
                : {
                    valor: o.valor,
                    texto: o.texto,
                    hijo: o.de !== null,
                    estado: estadosColor.get(o.valor),
                    icono: (
                      <span
                        aria-hidden
                        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-tinta/15 bg-hueso align-middle"
                        style={{ background: fondoDeMuestra(o.color.hex, o.color.familia, o.color.tipo), borderColor: bordeDeMuestra(o.color.hex) }}
                      />
                    ),
                  }
            ),
            "color",
            coloresMarcados
          )}
        />
      </FilaPildoras>
      {hayGestion && (
        <FilaPildoras titulo="Gestión">
          {/* «Hoy» (qué pide la talla: las mismas cuatro palabras de la tarjeta y la tabla) y «Condición» (dañadas, apartadas) son
              dos preguntas (Felipe, 2026-10-03). Cada talla cae en un solo «Hoy»: no hay combinación que se vacíe sola. */}
          {separa && (
            <DesplegablePildora
              icono={ListChecks}
              etiqueta="Hoy"
              valor={elegidos.hoy ?? TODOS}
              onValor={(v) => onCambiar({ hoy: v === TODOS ? null : v })}
              rotuloCantidad="Productos con alguna talla así"
              opciones={[
                { valor: TODOS, texto: "Todo" },
                ...contar(
                  TIPOS_HOY.map((t) => ({ valor: t as string, texto: TEXTO_HOY[t] })),
                  "hoy",
                  elegidos.hoy
                ),
              ]}
            />
          )}
          {separa && (
            <DesplegablePildora
              icono={CircleAlert}
              etiqueta="Condición"
              valor={elegidos.condicion ?? TODOS}
              onValor={(v) => onCambiar({ condicion: v === TODOS ? null : v })}
              rotuloCantidad="Productos con alguna talla así"
              opciones={[
                { valor: TODOS, texto: "Cualquiera" },
                ...contar(
                  CONDICIONES.map((c) => ({ valor: c as string, texto: ROTULO_CONDICION[c] })),
                  "condicion",
                  elegidos.condicion
                ),
              ]}
            />
          )}
          {marcas && (
            <DesplegablePildora
              icono={Tag}
              etiqueta="Marca"
              valor={elegidos.marca ?? TODOS}
              onValor={(v) => onCambiar({ marca: v === TODOS ? null : v })}
              opciones={[{ valor: TODOS, texto: "Todas" }, ...contar(marcas.map(opcion), "marca", elegidos.marca)]}
            />
          )}
        </FilaPildoras>
      )}
    </PanelPildoras>
  );

  // Con el panel abierto en la computadora cada píldora ya dice su valor y su ✕: los chips repetirían lo mismo debajo. Se ven
  // con el panel cerrado y en el celular (donde el panel vive en la hoja).
  const bloqueChips = chips.length > 0 && (
    <div className={`flex flex-wrap items-center gap-2 ${panelAbierto ? "md:hidden" : ""}`}>
      {chips.map((c) => (
        <button
          key={c.quitar.join("|")}
          type="button"
          onClick={() => quitar(c.quitar)}
          className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          aria-label={`Quitar filtro ${c.texto}`}
        >
          {c.texto}
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      ))}
      <button type="button" onClick={onLimpiar} className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo">
        Limpiar todo
      </button>
    </div>
  );

  const etiquetaBuscar = (
    <span>
      Buscar
      <kbd aria-hidden className="ml-2 hidden rounded border border-tinta/15 px-1 font-sans text-[10px] normal-case text-tinta/45 md:inline">
        /
      </kbd>
    </span>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {/* Sin corrector del navegador: «CAYLA», «miramhe» o «pol-0004» no son palabras de diccionario. */}
          <CampoTexto
            etiqueta={etiquetaBuscar}
            id={ID_BUSCADOR_EXISTENCIAS}
            value={busqueda}
            onChange={(e) => onTeclear(e.target.value)}
            onBlur={onSoltar}
            // La pistola escribe el código y manda Enter: si es el código exacto de una talla, se abre esa prenda.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              onEnter();
            }}
            aria-keyshortcuts="/"
            placeholder={placeholder}
            enterKeyHint="search"
            spellCheck={false}
            type="search"
          />
        </div>
        {/* Mismo ritmo vertical que `Campo` (etiqueta + mt-1.5 + control): el botón queda a la altura de la caja. */}
        <div className="shrink-0">
          <span aria-hidden className="label-cayla block text-[11px] text-transparent">
            {" "}
          </span>
          <BotonFiltros abierto={hojaAbierta || (esEscritorio && panelAbierto)} activos={activos} onClick={alTocarFiltros} />
        </div>
      </div>

      {bajoBuscador && <div className="sm:hidden">{bajoBuscador}</div>}

      {/* Computadora: el panel en la página, abierto salvo que en este equipo se haya cerrado. Celular: solo en la hoja. */}
      {panelAbierto && !hojaAbierta && <div className="hidden md:block">{panel}</div>}

      {hojaAbierta && (
        <Modal titulo="Filtros" subtitulo="Cada cambio se aplica al momento." onClose={() => setHojaAbierta(false)} ancho="max-w-lg">
          {panel}
          <div className="pie-hoja-fijo mt-4 flex items-center gap-2">
            {activos > 0 && (
              <button type="button" onClick={onLimpiar} className="btn-cayla btn-sutil">
                Limpiar
              </button>
            )}
            <button type="button" onClick={() => setHojaAbierta(false)} className="btn-cayla btn-primario flex-1">
              Ver {conteo.total.toLocaleString("es-PE")} {conteo.total === 1 ? conteo.unidad.uno : conteo.unidad.varios}
            </button>
          </div>
        </Modal>
      )}

      {bloqueChips}

      {/* El conteo arriba y, a la derecha, «Copiar enlace», la vista y un solo «Ordenar por», fuera del panel: ordenar no quita
          prendas, solo las acomoda. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-baseline gap-3 text-sm text-tinta/70">
          <span aria-live="polite">
            <strong className="font-semibold text-tinta">{conteo.total.toLocaleString("es-PE")}</strong>{" "}
            {conteo.total === 1 ? conteo.unidad.uno : conteo.unidad.varios}
            {/* Con «Hoy», la cifra que trajo a la persona («15 tallas por colgar» de «Para hoy» y del Inicio), tan visible como la de
                arriba: es la que suman las pastillas de las tarjetas. */}
            {conteo.tallas ? (
              <span>
                {" · "}
                <strong className="font-semibold text-tinta">{conteo.tallas.cifra.toLocaleString("es-PE")}</strong> {conteo.tallas.texto}
                {conteo.aclaracion && <span className="text-tinta/55"> ({conteo.aclaracion})</span>}
              </span>
            ) : (
              <span className="text-tinta/55"> · {detalleTotal}</span>
            )}
          </span>
          {/* Con el panel abierto los chips no se ven: «Limpiar filtros» queda aquí, a la vista. */}
          {panelAbierto && chips.length > 0 && (
            <button type="button" onClick={onLimpiar} className="label-cayla hidden text-[10px] text-tinta/55 hover:text-rojo md:inline">
              Limpiar filtros
            </button>
          )}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
          {/* En el celular solo el ícono: con el texto, «Copiar enlace» y «Ordenar por» no caben juntos en 375 px. */}
          <button
            type="button"
            onClick={copiarEnlace}
            aria-label="Copiar enlace de esta lista"
            className="label-cayla inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-tinta/60 transition-colors hover:text-tinta"
          >
            <Link2 aria-hidden className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copiar enlace</span>
          </button>
          {vista}
          {orden && (
            <div className="min-w-0 rounded-lg bg-sand/50 p-0.5">
              <DesplegablePildora
                encoger
                icono={ArrowUpDown}
                etiqueta="Ordenar por"
                valor={orden.valor}
                valorPorDefecto={orden.porDefecto}
                onValor={orden.onValor}
                opciones={orden.opciones}
              />
            </div>
          )}
        </div>
      </div>
      {nota}
    </div>
  );
}

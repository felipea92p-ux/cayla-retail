"use client";

import { useState, type ReactNode, type Ref } from "react";
import { ArrowUpDown, CircleAlert, LayoutGrid, Link2, ListChecks, Palette, Rows3, Ruler, ScanLine, Shirt, Table2, Tag } from "lucide-react";
import { BotonFiltros, DesplegablePildora, FilaPildoras, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { Modal } from "@/components/ui/Modal";
import { BotonSonidoConfirmar } from "@/components/BotonSonidoConfirmar";
import { FiltrosRapidos } from "@/components/existencias/FiltrosRapidos";
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
import { Buscador } from "@/components/ui/Buscador";

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

/** Cómo se ve la lista: tarjetas (de entrada), la tabla por prenda o la tabla con una fila por talla. */
export type VistaLista = "tarjetas" | "tabla" | "talla";

export type VerComoBarra = { valor: VistaLista; onValor: (v: VistaLista) => void };

const VISTAS: readonly { valor: VistaLista; texto: string; icono: typeof LayoutGrid }[] = [
  { valor: "tarjetas", texto: "Tarjetas", icono: LayoutGrid },
  { valor: "tabla", texto: "Tabla", icono: Table2 },
  { valor: "talla", texto: "Por talla", icono: Rows3 },
];

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
  buscadorRef,
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
  panelInicial,
  orden,
  verComo = null,
  nota,
  onEscanear,
  alLadoDeFiltros,
  enPausa = 0,
  avisoPausa = null,
}: {
  busqueda: string;
  onTeclear: (texto: string) => void;
  /** Al salir del buscador: lo escrito pasa a la URL de una vez. */
  onSoltar: () => void;
  /** Enter tecleado a mano en el buscador. El de la pistola lo resuelve `usePistola` en el padre y no llega aquí. */
  onEnter: () => void;
  /** El campo del buscador, para que el padre escuche la pistola (`usePistola`). */
  buscadorRef?: Ref<HTMLInputElement>;
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
  /** Lo que este equipo dejó la última vez (cookie leída en el servidor). */
  panelInicial: EstadoPanelFiltros;
  /** «Ordenar por» (solo en las tarjetas: la tabla conserva su orden); `null` = no se ofrece. */
  orden: OrdenBarra | null;
  /** Tarjetas, tabla o una fila por talla (2026-10-06, tarde): vive en «Filtros ▸ Vista», junto al orden. `null` = no se ofrece. */
  verComo?: VerComoBarra | null;
  /** Una aclaración bajo la fila del conteo (la de «Por colgar»). */
  nota?: ReactNode;
  /** Abre la cámara (`EscanerBusqueda`). Un solo icono junto al buscador, desde `sm`: en el celular ya está el botón fijo de abajo. */
  onEscanear?: () => void;
  /** Lo que va al costado de «Filtros»: el anillo «Al día» de la sede (2026-10-06). */
  alLadoDeFiltros?: ReactNode;
  /** Tallas que esperan el cuadre del piso: el atajo «Por colgar» va en pausa y lleva la explicación (`FiltrosRapidos`). */
  enPausa?: number;
  avisoPausa?: string | null;
}) {
  const [panelAbierto, setPanelAbierto] = useState(panelInicial === "abierto");
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const esEscritorio = useConsultaMedia(MEDIA_ESCRITORIO);

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

  // Con los atajos a la vista (sede que separa piso y almacén), el atajo encendido ya dice qué «Hoy» o «Condición» está puesto: su chip
  // repetiría lo mismo en otra fila. Los demás filtros (categoría, talla, color, marca) sí van como chip.
  const chips = chipsDeFiltros(elegidos).filter((c) => !(separa && c.quitar.every((k) => k === "hoy" || k === "condicion")));
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

  // Filas con nombre, como Productos (reordenado el 2026-10-06 para despejar la barra): «Prenda», lo que se pregunta de ella
  // (categoría, talla, color y marca: la marca es de la prenda, no de quien gestiona); «Gestión», qué pide hoy y en qué condición
  // está (los mismos filtros que los atajos, con las combinaciones que un atajo no hace); y «Vista», cómo se ve (tarjetas, tabla o por
  // talla), cómo se ordena y si suena al confirmar, que antes ocupaban la fila del buscador. El mismo panel va en la página (computadora)
  // o en la hoja (celular).
  const ordenTexto = orden ? (orden.opciones.find((o) => o.valor === orden.valor)?.texto ?? orden.valor) : null;
  const ordenDistinto = orden !== null && orden.valor !== orden.porDefecto;
  // Como el orden: si la lista no se ve en tarjetas, un chip lo dice y vuelve a ellas de un toque (el control vive dentro de «Filtros»).
  const vistaDistinta = verComo !== null && verComo.valor !== "tarjetas" ? (VISTAS.find((v) => v.valor === verComo.valor)?.texto ?? null) : null;
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
      {separa && (
        <FilaPildoras titulo="Gestión">
          {/* «Hoy» (qué pide la talla: las mismas palabras de la tarjeta y la tabla) y «Condición» (dañadas, apartadas) son
              dos preguntas (Felipe, 2026-10-03). Cada talla cae en un solo «Hoy»: no hay combinación que se vacíe sola. */}
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
        </FilaPildoras>
      )}
      <FilaPildoras titulo="Vista">
        {/* «Ver como» (2026-10-06, tarde): tarjetas, tabla o una fila por talla, a un toque y con su nombre. Antes era un icono suelto en
            la barra y, en la tabla, otro par «Por prenda | Por talla»: ahora la barra solo busca y filtra. */}
        {verComo && (
          <div role="group" aria-label="Ver como" className="flex h-9 shrink-0 items-center gap-1.5 px-3">
            <span className="label-cayla text-[11px] text-tinta/55">Ver como:</span>
            <span className="inline-flex rounded-lg bg-tinta/[0.05] p-0.5">
              {VISTAS.map(({ valor, texto, icono: Icono }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={verComo.valor === valor}
                  onClick={() => verComo.onValor(valor)}
                  className="label-cayla inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] text-tinta/60 transition-colors hover:text-tinta aria-pressed:bg-papel aria-pressed:text-tinta aria-pressed:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-tinta)_12%,transparent)]"
                >
                  <Icono aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  {texto}
                </button>
              ))}
            </span>
          </div>
        )}
        {/* El orden solo ordena las tarjetas (la tabla conserva el suyo): no quita prendas, por eso no cuenta como filtro puesto. */}
        {orden && (
          <DesplegablePildora
            icono={ArrowUpDown}
            etiqueta="Ordenar por"
            valor={orden.valor}
            valorPorDefecto={orden.porDefecto}
            onValor={orden.onValor}
            opciones={orden.opciones}
          />
        )}
        {/* El sonido de «confirmado» (por equipo): suena al colgar en el piso, subir a almacén, ajustar o reportar una dañada. */}
        <BotonSonidoConfirmar conNombre />
      </FilaPildoras>
    </PanelPildoras>
  );

  // Con el panel abierto en la computadora cada píldora ya dice su valor y su ✕: los chips repetirían lo mismo debajo. Se ven
  // con el panel cerrado y en el celular (donde el panel vive en la hoja).
  const bloqueChips = (chips.length > 0 || ordenDistinto || vistaDistinta) && (
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
      {orden && ordenDistinto && (
        <button
          type="button"
          onClick={() => orden.onValor(orden.porDefecto)}
          className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          aria-label={`Volver al orden de siempre (ahora: ${ordenTexto})`}
        >
          Orden: {ordenTexto}
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      )}
      {verComo && vistaDistinta && (
        <button
          type="button"
          onClick={() => verComo.onValor("tarjetas")}
          className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          aria-label={`Volver a las tarjetas (ahora: ${vistaDistinta})`}
        >
          Vista: {vistaDistinta}
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      )}
      {chips.length > 0 && (
        <button type="button" onClick={onLimpiar} className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo">
          Limpiar todo
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* La barra compacta (2026-10-06): desde 1280 px, DOS filas —buscar, escanear, «Filtros» y el anillo del día; la cifra a la derecha;
          debajo, los atajos con su nombre—. Más angosto (tablet, celular): buscar, los atajos, y la cifra. El orden lo da `order-*` sobre
          un solo `flex-wrap`: cada control existe una vez, solo cambia de lugar. Desde la tarde la vista vive en «Filtros ▸ Vista», y el
          buscador toma todo el ancho que queda (la barra ya tiene menos piezas). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* `xl:min-w-[24rem]`: buscar no se angosta por debajo de un ancho útil; si no cabe todo, la vista baja a otra línea. */}
        <div className="order-1 flex min-w-0 basis-full items-center gap-2 xl:min-w-[24rem] xl:flex-1">
          {/* Buscar: del alto de un control (40 px) y tan ancho como deje la fila (2026-10-06, tarde: con la vista dentro de «Filtros» la
              barra tiene menos piezas, y un buscador de 26rem dejaba media barra vacía). */}
          {/* Sin corrector del navegador: «CAYLA», «miramhe» o «pol-0004» no son palabras de diccionario (el Buscador ya lo apaga).
              «/» lleva el cursor aquí (`atajo`); Escape y la «×» borran lo escrito. */}
          <Buscador
            id={ID_BUSCADOR_EXISTENCIAS}
            ref={buscadorRef}
            valor={busqueda}
            onCambio={(v) => onTeclear(v)}
            onBlur={onSoltar}
            // Enter a mano: si lo escrito es el código exacto de una talla, se abre esa prenda.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              onEnter();
            }}
            atajo
            placeholder={placeholder}
            etiqueta="Buscar producto"
            enterKeyHint="search"
            className="min-w-0 flex-1"
          />
          {/* Escanear: solo el icono (maqueta aprobada). El nombre va como etiqueta y al pasar el mouse. */}
          {onEscanear && (
            <button
              type="button"
              onClick={onEscanear}
              aria-label="Escanear etiqueta"
              title="Escanear etiqueta"
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sand bg-papel text-tinta/70 transition-colors hover:border-taupe hover:text-tinta sm:inline-flex"
            >
              <ScanLine aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </button>
          )}
          {/* «Filtros»: solo el icono, con cuántos hay puestos en la esquina (2026-10-06). */}
          <BotonFiltros soloIcono abierto={hojaAbierta || (esEscritorio && panelAbierto)} activos={activos} onClick={alTocarFiltros} />
          {alLadoDeFiltros}
        </div>

        {/* La cifra: cuántas tarjetas trae la lista (y, con «Hoy», cuántas tallas). Sin frase de ayuda: ocupaba una línea entera. */}
        <p className="order-3 min-w-0 flex-1 text-[13px] text-tinta/70 xl:order-2 xl:flex-none">
          <span aria-live="polite">
            <strong className="font-semibold text-tinta">{conteo.total.toLocaleString("es-PE")}</strong>{" "}
            {conteo.total === 1 ? conteo.unidad.uno : conteo.unidad.varios}
            {/* Con «Hoy», la cifra que trajo a la persona («15 tallas por colgar» del Inicio), tan visible como la de arriba: es la que
                suman las pastillas de las tarjetas. */}
            {conteo.tallas && (
              <span>
                {" · "}
                <strong className="font-semibold text-tinta">{conteo.tallas.cifra.toLocaleString("es-PE")}</strong> {conteo.tallas.texto}
                {conteo.aclaracion && <span className="text-tinta/55"> ({conteo.aclaracion})</span>}
              </span>
            )}
          </span>
          {/* Con el panel abierto los chips no se ven: «Limpiar filtros» queda aquí, a la vista. */}
          {panelAbierto && chips.length > 0 && (
            <button type="button" onClick={onLimpiar} className="label-cayla ml-3 hidden text-[10px] text-tinta/55 hover:text-rojo md:inline">
              Limpiar filtros
            </button>
          )}
        </p>

        {/* A la derecha, solo «Copiar enlace», y solo con la tabla (`orden` es de las tarjetas): la vista, el orden y el sonido viven en
            «Filtros ▸ Vista». */}
        {!orden && (
          <div className="order-4 ml-auto flex shrink-0 items-center xl:order-3">
            <button
              type="button"
              onClick={copiarEnlace}
              aria-label="Copiar enlace de esta lista"
              title="Copiar enlace de esta lista"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-tinta/60 transition-colors hover:text-tinta"
            >
              <Link2 aria-hidden className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        )}

        {/* Atajos de lo que más se pregunta en el piso (`lib/existencias-rapidos.ts`), siempre con su nombre. Su propia fila. */}
        {separa && (
          <div className="order-2 min-w-0 basis-full xl:order-4">
            <FiltrosRapidos elegidos={elegidos} conteos={conteos} onCambiar={onCambiar} enPausa={enPausa} avisoPausa={avisoPausa} />
          </div>
        )}
      </div>

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

      {nota}
    </div>
  );
}

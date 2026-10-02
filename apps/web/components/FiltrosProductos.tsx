"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Banknote, CircleCheck, Link2, PackageSearch, Palette, Shirt, Tag, Truck } from "lucide-react";
import { Slider } from "radix-ui";
import { CampoTexto } from "@/components/ui/campos";
import { BotonFiltros, DesplegablePildora, FilaPildoras, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { Modal } from "@/components/ui/Modal";
import { guardarPanelFiltros, type EstadoPanelFiltros } from "@/lib/panel-filtros";
import { avisar } from "@/components/ui/Avisos";
import { SenalBuscando, useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { montoParaCaja, pasoDePrecio, posicionEnControl, rangoDesdeControl, solesFiltro, type LimitesPrecio } from "@/lib/productos-filtro-precio";
import { ORDENES_MENU, ORDEN_POR_DEFECTO, ROTULO_ORDEN_PRODUCTOS, ordenDeUrl } from "@/lib/productos-orden";
import {
  ESTADOS_LISTADO,
  ESTADO_POR_DEFECTO,
  ROTULO_ESTADO,
  chipsDeFiltros,
  contarFiltrosActivos,
  estadoDeUrl,
  cambiosTipeados,
  consultaConCambios,
  consultaSinFiltros,
  hrefDeConsulta,
  mismaConsulta,
  sinCajas,
  tipeadoPendiente,
  valorDeCaja,
  type CajaTipeada,
  type Tipeado,
} from "@/lib/productos-filtros";
import { SIN_EN_URL } from "@/lib/marcas";

// Filtros de /productos. Mismo patrón que `FiltrosMovimientos.tsx`: viven en
// la URL, la página es un Server Component que filtra en Postgres
// (fn_productos/fn_productos_resumen), y cambiar un filtro vuelve a la
// página 1 — un filtro nuevo sobre "página 7" case casi siempre en vacío.
type Opcion = { id: string; nombre: string };
type OpcionColor = Opcion & { hex: string | null };


/** Una sola forma desde el 2026-09-28 (ADR-0254, pedido de Felipe): buscador + botón «Filtros» que despliega el panel
 *  de píldoras, en la Grilla y en la Tabla. Nació como el modo `compacto` de la Grilla (2026-09-17, tres pasadas: a
 *  Felipe le gustaba más plegado). La tarjeta de nueve campos que usaba la Tabla se borró: dos pieles del mismo filtro
 *  en la misma pantalla hacían que cambiar de vista pareciera cambiar de sistema. */
export function FiltrosProductos({
  categorias,
  colores,
  marcas,
  proveedores,
  totalProductos,
  limitesPrecio,
  panelInicial,
}: {
  categorias: Opcion[];
  colores: OpcionColor[];
  /** Marcas y proveedores activos (ADR-0109): filtrar el catálogo por de quién es y quién lo trae. */
  marcas: Opcion[];
  proveedores: Opcion[];
  /** Cuántos productos calzan con lo filtrado (todas las páginas): el conteo de arriba. */
  totalProductos: number;
  /** El precio real más bajo y más alto de lo que se está viendo, redondeados; `null` = no se pudo saber. */
  limitesPrecio: LimitesPrecio | null;
  /** Lo que este equipo dejó la última vez (cookie leída en el servidor). */
  panelInicial: EstadoPanelFiltros;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const consultaUrl = params.toString();
  // Solo lo que se está escribiendo ahora (buscador y precio); lo demás se lee de la URL (`lib/productos-filtros.ts`).
  const [tipeado, setTipeado] = useState<Tipeado>({});
  const busqueda = valorDeCaja(tipeado, "q", consultaUrl);
  const precioMin = tipeado.precioMin ?? montoParaCaja(params.get("precioMin") ?? "");
  const precioMax = tipeado.precioMax ?? montoParaCaja(params.get("precioMax") ?? "");
  // Abierto en la computadora salvo que en este equipo se haya cerrado (la cookie la lee el servidor: sin salto al pintar).
  const [panelAbierto, setPanelAbierto] = useState(panelInicial === "abierto");
  // En el celular los filtros no van en la página (empujarían los productos bajo el pliegue): van en una hoja.
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const esEscritorio = useEsEscritorio();
  // La última URL pedida que todavía no llegó. Un clic justo después de teclear (o el temporizador justo después de un
  // clic) se aplica sobre ella y no sobre la URL vieja: antes el segundo pisaba al primero y el orden recién elegido se
  // perdía. Vence a los 3 s, por si una navegación nunca llega.
  const pedida = useRef<{ consulta: string; en: number } | null>(null);
  const { buscando, buscar } = useBusquedaEnUrl();
  const etiquetaBuscar = (
    <span className="flex items-baseline justify-between gap-2">
      <span>
        Buscar
        {/* El atajo de Shopify y GitHub (Felipe, 2026-10-02): «/» desde cualquier parte de la pantalla. */}
        <kbd className="ml-2 hidden rounded border border-tinta/15 px-1 font-sans text-[10px] normal-case text-tinta/45 md:inline">/</kbd>
      </span>
      <SenalBuscando activo={buscando} />
    </span>
  );

  // «/» lleva el cursor al buscador, salvo que la persona ya esté escribiendo en otra caja.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const caja = document.getElementById(ID_BUSCADOR) as HTMLInputElement | null;
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
      guardarPanelFiltros(nuevo ? "abierto" : "cerrado");
    } else {
      setHojaAbierta(true);
    }
  }

  /** Se lee al momento de usarla, nunca de la URL que había al pintar: el temporizador del buscador se programa antes de
   *  un clic y se dispara después, y con la URL de entonces borraba lo que el clic acababa de poner. */
  function consultaVigente() {
    const p = pedida.current;
    return p && Date.now() - p.en < 3000 ? p.consulta : window.location.search.replace(/^\?/, "");
  }

  /** `teclado`: viene del buscador o del precio (se escribió o se arrastró): navega sin el loader, con «Buscando…», y
   *  reemplaza la entrada del historial en vez de sumar una por pausa (Atrás ya no recorre precios intermedios). */
  function navegar(consulta: string, { teclado = false } = {}) {
    pedida.current = { consulta, en: Date.now() };
    const href = hrefDeConsulta(pathname, consulta);
    if (teclado) buscar(href, { reemplazar: true });
    else router.push(href);
  }

  function aplicar(cambios: Record<string, string>, opciones: { teclado?: boolean } = {}) {
    navegar(consultaConCambios(consultaVigente(), cambios), opciones);
  }

  // La URL llegó: lo que ya dice deja de «escribirse» (se ajusta al pintar, como manda React para un estado que sigue a una
  // prop) y la URL pedida, si es esta, ya no está pendiente.
  const [urlVista, setUrlVista] = useState(consultaUrl);
  if (urlVista !== consultaUrl) {
    setUrlVista(consultaUrl);
    setTipeado((t) => tipeadoPendiente(consultaUrl, t));
  }
  useEffect(() => {
    if (pedida.current && mismaConsulta(pedida.current.consulta, consultaUrl)) pedida.current = null;
  }, [consultaUrl]);

  // Atrás / Adelante: manda la URL del historial, no la última que se pidió aquí.
  useEffect(() => {
    const olvidar = () => {
      pedida.current = null;
      setTipeado({});
    };
    window.addEventListener("popstate", olvidar);
    return () => window.removeEventListener("popstate", olvidar);
  }, []);

  // Búsqueda y precio se mandan solos al dejar de tipear o arrastrar (350 ms). El slider de precio solo anota lo tipeado en
  // cada paso; este mismo efecto hace de espera para los dos.
  useEffect(() => {
    const t = setTimeout(() => {
      const cambios = cambiosTipeados(consultaVigente(), tipeado);
      if (Object.keys(cambios).length > 0) aplicar(cambios, { teclado: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipeado]);

  const cat = params.get("cat");
  const marca = params.get("marca");
  const proveedor = params.get("proveedor");
  const color = params.get("color");
  const estado = estadoDeUrl(params.get("estado"));
  const stock = params.get("stock");
  const orden = ordenDeUrl(params.get("orden"));

  // Los chips leen la URL (lo que de verdad filtra la lista), siempre «Nombre: valor» como la píldora (`lib/productos-filtros.ts`).
  const chips = chipsDeFiltros(
    consultaUrl,
    {
      categoria: (id) => categorias.find((c) => c.id === id)?.nombre,
      marca: (id) => marcas.find((m) => m.id === id)?.nombre,
      proveedor: (id) => proveedores.find((p) => p.id === id)?.nombre,
      color: (id) => colores.find((c) => c.id === id)?.nombre,
    },
    SIN_EN_URL,
  );

  // Con el panel abierto en la computadora cada píldora ya dice su valor y su ✕: los chips repetirían lo mismo debajo. Se
  // ven con el panel cerrado y en el celular (donde el panel vive en la hoja).
  const bloqueChips = chips.length > 0 && (
    <div className={`flex flex-wrap items-center gap-2 ${panelAbierto ? "md:hidden" : ""}`}>
      {chips.map((c) => (
        <button
          key={c.quitar.join("|")}
          type="button"
          onClick={() => {
            setTipeado((t) => sinCajas(t, c.quitar as CajaTipeada[]));
            aplicar(Object.fromEntries(c.quitar.map((k) => [k, ""])));
          }}
          className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          aria-label={`Quitar filtro ${c.texto}`}
        >
          {c.texto}
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setTipeado({});
          navegar(consultaSinFiltros(consultaVigente()));
        }}
        className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
      >
        Limpiar todo
      </button>
    </div>
  );

  const activos = contarFiltrosActivos(consultaUrl);

  /** El enlace de esta misma lista, para mandarlo a otra sede (Felipe, 2026-10-02): todo lo filtrado vive en la URL. */
  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      avisar.exito("Enlace copiado", { detalle: "Quien lo abra ve esta misma lista, con los mismos filtros." });
    } catch {
      avisar.error("No se pudo copiar el enlace", { detalle: "Cópialo desde la barra de direcciones del navegador." });
    }
  }

  // Conteo arriba y un solo «Ordenar por», fuera del panel (Felipe, 2026-10-02): ordenar no quita prendas, solo las acomoda.
  // Vive aquí (y no en la página) para que el orden y lo tecleado se apliquen sobre la misma URL vigente (`consultaVigente`).
  const barraResultados = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="flex items-baseline gap-3 text-sm text-tinta/70">
        <span aria-live="polite">
          <strong className="font-semibold text-tinta">{totalProductos.toLocaleString("es-PE")}</strong>{" "}
          {totalProductos === 1 ? "producto" : "productos"}
        </span>
        {/* Con el panel abierto los chips no se ven: «Limpiar filtros» queda aquí, a la vista. */}
        {panelAbierto && chips.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTipeado({});
              navegar(consultaSinFiltros(consultaVigente()));
            }}
            className="label-cayla hidden text-[10px] text-tinta/55 hover:text-rojo md:inline"
          >
            Limpiar filtros
          </button>
        )}
      </p>
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        {/* En el celular solo el ícono: con el texto, «Copiar enlace» y «Ordenar por» no cabían juntos en 375 px. */}
        <button
          type="button"
          onClick={copiarEnlace}
          aria-label="Copiar enlace de esta lista"
          className="label-cayla inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-tinta/60 transition-colors hover:text-tinta"
        >
          <Link2 aria-hidden className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Copiar enlace</span>
        </button>
        <div className="rounded-lg bg-sand/50 p-0.5">
          <DesplegablePildora
            icono={ArrowUpDown}
            etiqueta="Ordenar por"
            valor={orden}
            valorPorDefecto={ORDEN_POR_DEFECTO}
            onValor={(v) => aplicar({ orden: v === ORDEN_POR_DEFECTO ? "" : v })}
            opciones={ORDENES_MENU.map((o) => ({ valor: o as string, texto: ROTULO_ORDEN_PRODUCTOS[o] }))}
          />
        </div>
      </div>
    </div>
  );

  // Dos filas con nombre (Felipe, 2026-10-02): arriba lo que pide la clienta en el mostrador, abajo lo del líder (reponer,
  // completar, de quién es). El mismo panel va abierto en la página (computadora) o dentro de la hoja (celular), nunca los dos.
  const panel = (
    <PanelPildoras filas>
      <FilaPildoras titulo="Prenda">
            <DesplegablePildora
              icono={Shirt}
              etiqueta="Categoría"
              valor={cat ?? TODOS}
              onValor={(v) => aplicar({ cat: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todas" }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))]}
            />
            <DesplegablePildora
              icono={Palette}
              etiqueta="Color"
              valor={color ?? TODOS}
              onValor={(v) => aplicar({ color: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todos" },
                ...colores.map((c) => ({
                  valor: c.id,
                  texto: c.nombre,
                  icono: <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/15" style={{ background: c.hex ?? "#d8d3c7" }} />,
                })),
              ]}
            />
            <BloquePrecio
              precioMin={precioMin}
              precioMax={precioMax}
              limites={limitesPrecio}
              onCambiar={(min, max) => setTipeado((t) => ({ ...t, precioMin: min, precioMax: max }))}
            />
      </FilaPildoras>
      <FilaPildoras titulo="Gestión">
            <DesplegablePildora
              icono={PackageSearch}
              etiqueta="Stock"
              valor={stock ?? TODOS}
              onValor={(v) => aplicar({ stock: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todos" },
                { valor: "sin_stock", texto: "Sin stock" },
                { valor: "bajo", texto: "Stock bajo" },
                { valor: "reponer", texto: "Pedir a proveedor" },
              ]}
            />
            <DesplegablePildora
              icono={Tag}
              etiqueta="Marca"
              valor={marca ?? TODOS}
              onValor={(v) => aplicar({ marca: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todas" }, { valor: SIN_EN_URL, texto: "Sin marca" }, ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
            />
            <DesplegablePildora
              icono={Truck}
              etiqueta="Proveedor"
              valor={proveedor ?? TODOS}
              onValor={(v) => aplicar({ proveedor: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todos" }, { valor: SIN_EN_URL, texto: "Sin proveedor" }, ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))]}
            />
            {/* «Activos» es lo que vale sola (Felipe, 2026-10-02): se ve «Estado: Activos» en reposo y «Todos» se elige a propósito. */}
            <DesplegablePildora
              icono={CircleCheck}
              etiqueta="Estado"
              valor={estado}
              valorPorDefecto={ESTADO_POR_DEFECTO}
              onValor={(v) => aplicar({ estado: v === ESTADO_POR_DEFECTO ? "" : v })}
              opciones={ESTADOS_LISTADO.map((e) => ({ valor: e as string, texto: ROTULO_ESTADO[e] }))}
            />
      </FilaPildoras>
    </PanelPildoras>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <CampoTexto
            etiqueta={etiquetaBuscar}
            trabajando={buscando}
            value={busqueda}
            onChange={(e) => {
              const q = e.target.value;
              setTipeado((t) => ({ ...t, q }));
            }}
            id={ID_BUSCADOR}
            // sugerir-fijo: dice qué se puede buscar en el catálogo (nombre, código, código de barras); no depende de nada elegido antes
            placeholder="Prenda, código o código de barras…"
            autoComplete="off"
            type="search"
          />
        </div>
        {/* Mismo ritmo vertical que `Campo` (etiqueta + mt-1.5 + control) para
            que el botón quede a la altura del input, no de toda la columna. */}
        <div className="shrink-0">
          <span aria-hidden className="label-cayla block text-[11px] text-transparent">
            {" "}
          </span>
          <BotonFiltros abierto={hojaAbierta || (esEscritorio && panelAbierto)} activos={activos} onClick={alTocarFiltros} />
        </div>
      </div>

      {/* Computadora: el panel en la página, abierto salvo que en este equipo se haya cerrado. Celular: solo en la hoja. */}
      {panelAbierto && !hojaAbierta && <div className="hidden md:block">{panel}</div>}

      {hojaAbierta && (
        <Modal titulo="Filtros" subtitulo="Cada cambio se aplica al momento." onClose={() => setHojaAbierta(false)} ancho="max-w-lg">
          {panel}
          <div className="pie-hoja-fijo mt-4 flex items-center gap-2">
            {activos > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTipeado({});
                  navegar(consultaSinFiltros(consultaVigente()));
                }}
                className="btn-cayla btn-sutil"
              >
                Limpiar
              </button>
            )}
            <button type="button" onClick={() => setHojaAbierta(false)} className="btn-cayla btn-primario flex-1">
              Ver {totalProductos.toLocaleString("es-PE")} {totalProductos === 1 ? "producto" : "productos"}
            </button>
          </div>
        </Modal>
      )}

      {bloqueChips}
      {barraResultados}
    </div>
  );
}

/** Precio (Felipe, 2026-10-02): cajas «Desde / Hasta» para escribir el monto que dice la clienta, y el control de arrastre
 *  entre el precio real más bajo y el más alto de lo que se está viendo (`lib/productos-filtro-precio.ts`), nunca un tope
 *  inventado. Si no se pudo saber el rango, el control no se dibuja y las cajas siguen. */
function BloquePrecio({
  precioMin,
  precioMax,
  limites,
  onCambiar,
}: {
  precioMin: string;
  precioMax: string;
  limites: LimitesPrecio | null;
  onCambiar: (min: string, max: string) => void;
}) {
  const activa = Boolean(precioMin || precioMax);
  return (
    // Se parte en dos líneas si no cabe (cajas arriba, control abajo): a 768 px con el menú lateral quedan ~420 px de panel.
    <div className={`flex min-h-9 min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 ${activa ? "text-tinta" : "text-tinta/60"}`} role="group" aria-label="Precio">
      <Banknote aria-hidden className={`h-3.5 w-3.5 shrink-0 ${activa ? "text-tinta/70" : "text-tinta/40"}`} />
      <span className="label-cayla text-[11px]">Precio</span>
      <CajaMonto
        valor={precioMin}
        // Ejemplo derivado de los precios reales de lo que se está viendo (ADR-0290), no un número fijo.
        sugerido={limites ? String(limites.min) : "Desde"}
        etiqueta="Precio desde"
        onCambiar={(v) => onCambiar(v, precioMax)}
      />
      <span aria-hidden className="text-tinta/40">–</span>
      <CajaMonto valor={precioMax} sugerido={limites ? String(limites.max) : "Hasta"} etiqueta="Precio hasta" onCambiar={(v) => onCambiar(precioMin, v)} />
      {limites && (
        <Slider.Root
          className="relative ml-1 flex h-4 w-24 shrink-0 touch-none select-none items-center sm:w-28"
          min={limites.min}
          max={limites.max}
          step={pasoDePrecio(limites)}
          value={posicionEnControl(precioMin, precioMax, limites)}
          onValueChange={([lo, hi]) => {
            const r = rangoDesdeControl(lo, hi, limites);
            onCambiar(r.precioMin, r.precioMax);
          }}
        >
          <Slider.Track className="relative h-[3px] grow rounded-full bg-tinta/15">
            <Slider.Range className="absolute h-full rounded-full bg-rojo" />
          </Slider.Track>
          {(["mínimo", "máximo"] as const).map((cual, i) => (
            <Slider.Thumb
              key={cual}
              aria-label={`Precio ${cual}`}
              aria-valuetext={solesFiltro(posicionEnControl(precioMin, precioMax, limites)[i])}
              className="block h-3.5 w-3.5 rounded-full border-2 border-rojo bg-papel outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-rojo/40"
            />
          ))}
        </Slider.Root>
      )}
    </div>
  );
}

/** Una caja de monto con «S/» delante. Texto (no `type=number`): acepta «39,90» y no cambia el valor con la rueda del
 *  mouse al pasar por encima. */
function CajaMonto({ valor, sugerido, etiqueta, onCambiar }: { valor: string; sugerido: string; etiqueta: string; onCambiar: (v: string) => void }) {
  return (
    <label className="flex h-7 w-[4.75rem] shrink-0 items-center gap-1 rounded-md border border-tinta/15 bg-papel/70 px-2 focus-within:border-tinta/40">
      <span aria-hidden className="text-[11px] text-tinta/45">
        S/
      </span>
      <input
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={sugerido}
        inputMode="decimal"
        autoComplete="off"
        aria-label={etiqueta}
        className="w-full min-w-0 bg-transparent text-[12px] tabular-nums text-tinta outline-none placeholder:text-tinta/35"
      />
    </label>
  );
}

const ID_BUSCADOR = "buscar-productos";
/** Desde aquí el panel vive en la página; debajo, en una hoja (Tailwind `md`). */
const MEDIA_ESCRITORIO = "(min-width: 768px)";

/** ¿Pantalla de computadora? En el servidor se responde «no» y el navegador corrige al hidratar: solo decide si el botón
 *  «Filtros» se ve encendido, nunca qué se pinta (eso lo hace el CSS con `md:`). */
function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(MEDIA_ESCRITORIO);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(MEDIA_ESCRITORIO).matches,
    () => false,
  );
}

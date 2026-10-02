"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Banknote, CircleCheck, Link2, PackageSearch, Palette, Shirt, Tag, Truck } from "lucide-react";
import { Slider } from "radix-ui";
import { CampoTexto } from "@/components/ui/campos";
import { BotonFiltros, DesplegablePildora, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { avisar } from "@/components/ui/Avisos";
import { SenalBuscando, useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
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

const PRECIO_MIN = 0;
const PRECIO_MAX = 999;

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
}: {
  categorias: Opcion[];
  colores: OpcionColor[];
  /** Marcas y proveedores activos (ADR-0109): filtrar el catálogo por de quién es y quién lo trae. */
  marcas: Opcion[];
  proveedores: Opcion[];
  /** Cuántos productos calzan con lo filtrado (todas las páginas): el conteo de arriba. */
  totalProductos: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const consultaUrl = params.toString();
  // Solo lo que se está escribiendo ahora (buscador y precio); lo demás se lee de la URL (`lib/productos-filtros.ts`).
  const [tipeado, setTipeado] = useState<Tipeado>({});
  const busqueda = valorDeCaja(tipeado, "q", consultaUrl);
  const precioMin = valorDeCaja(tipeado, "precioMin", consultaUrl);
  const precioMax = valorDeCaja(tipeado, "precioMax", consultaUrl);
  const [panelAbierto, setPanelAbierto] = useState(false);
  // La última URL pedida que todavía no llegó. Un clic justo después de teclear (o el temporizador justo después de un
  // clic) se aplica sobre ella y no sobre la URL vieja: antes el segundo pisaba al primero y el orden recién elegido se
  // perdía. Vence a los 3 s, por si una navegación nunca llega.
  const pedida = useRef<{ consulta: string; en: number } | null>(null);
  const { buscando, buscar } = useBusquedaEnUrl();
  const etiquetaBuscar = (
    <span className="flex items-baseline justify-between gap-2">
      Buscar
      <SenalBuscando activo={buscando} />
    </span>
  );

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

  const bloqueChips = chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
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
      <p className="text-sm text-tinta/70" aria-live="polite">
        <strong className="font-semibold text-tinta">{totalProductos.toLocaleString("es-PE")}</strong>{" "}
        {totalProductos === 1 ? "producto" : "productos"}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copiarEnlace}
          className="label-cayla inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-tinta/60 transition-colors hover:text-tinta"
        >
          <Link2 aria-hidden className="h-3.5 w-3.5" />
          Copiar enlace
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
          <BotonFiltros abierto={panelAbierto} activos={activos} onClick={() => setPanelAbierto((v) => !v)} />
        </div>
      </div>

      {panelAbierto && (
        <PanelPildoras>
          <DesplegablePildora
            icono={Shirt}
            etiqueta="Categoría"
            valor={cat ?? TODOS}
            onValor={(v) => aplicar({ cat: v === TODOS ? "" : v })}
            opciones={[{ valor: TODOS, texto: "Todas" }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))]}
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

          {/* «Activos» es lo que vale sola (Felipe, 2026-10-02): se ve «Estado: Activos» en reposo y «Todos» se elige a propósito. */}
          <DesplegablePildora
            icono={CircleCheck}
            etiqueta="Estado"
            valor={estado}
            valorPorDefecto={ESTADO_POR_DEFECTO}
            onValor={(v) => aplicar({ estado: v === ESTADO_POR_DEFECTO ? "" : v })}
            opciones={ESTADOS_LISTADO.map((e) => ({ valor: e as string, texto: ROTULO_ESTADO[e] }))}
          />

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

          <PildoraPrecio
            precioMin={precioMin}
            precioMax={precioMax}
            onCambiar={(min, max) => setTipeado((t) => ({ ...t, precioMin: min, precioMax: max }))}
          />
        </PanelPildoras>
      )}

      {bloqueChips}
      {barraResultados}
    </div>
  );
}

/** Precio como rango de arrastre en vez de dos casillas — pedido de Felipe.
 *  `value`/`onCambiar` van directo a `precioMin`/`precioMax` (texto, como ya
 *  vivían): en los extremos manda "" (sin tope), como ya hacía el par de
 *  `CampoTexto` que reemplaza. Un thumb en cada punta cuando no hay filtro. */
function PildoraPrecio({
  precioMin,
  precioMax,
  onCambiar,
}: {
  precioMin: string;
  precioMax: string;
  onCambiar: (min: string, max: string) => void;
}) {
  const lo = precioMin ? Number(precioMin) : PRECIO_MIN;
  const hi = precioMax ? Number(precioMax) : PRECIO_MAX;
  const activa = Boolean(precioMin || precioMax);

  return (
    <div className={`flex h-9 shrink-0 items-center gap-2.5 px-3 ${activa ? "text-tinta" : "text-tinta/60"}`}>
      <Banknote aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-colors ${activa ? "text-tinta/70" : "text-tinta/40"}`} />
      <Slider.Root
        className="relative flex h-4 w-24 shrink-0 touch-none select-none items-center sm:w-32"
        min={PRECIO_MIN}
        max={PRECIO_MAX}
        step={5}
        value={[lo, hi]}
        onValueChange={([nuevoLo, nuevoHi]) =>
          onCambiar(nuevoLo > PRECIO_MIN ? String(nuevoLo) : "", nuevoHi < PRECIO_MAX ? String(nuevoHi) : "")
        }
      >
        <Slider.Track className="relative h-[3px] grow rounded-full bg-tinta/15">
          <Slider.Range className="absolute h-full rounded-full bg-rojo" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Precio mínimo"
          className="block h-3.5 w-3.5 rounded-full border-2 border-rojo bg-papel outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-rojo/40"
        />
        <Slider.Thumb
          aria-label="Precio máximo"
          className="block h-3.5 w-3.5 rounded-full border-2 border-rojo bg-papel outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-rojo/40"
        />
      </Slider.Root>
      <span className="label-cayla shrink-0 text-[11px] tabular-nums text-tinta/65">
        S/{lo}–{hi}
      </span>
    </div>
  );
}

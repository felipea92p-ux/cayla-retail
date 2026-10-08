"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Banknote, CalendarRange, CircleCheck, ClipboardList, Link2, PackageSearch, Palette, Ruler, Shirt, Tag, Truck } from "lucide-react";
import { bordeDeMuestra, FAMILIAS_COLOR, fondoDeMuestra, textoDeFamilia } from "@/lib/colores-familias";
import { Slider } from "radix-ui";
import { BotonFiltros, DesplegablePildora, FilaPildoras, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { Modal } from "@/components/ui/Modal";
import { guardarPanelFiltros, type EstadoPanelFiltros } from "@/lib/panel-filtros";
import { avisar } from "@/components/ui/Avisos";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { opcionesConConteo, textoTramo, tramoActivo, type FacetaClave, type FacetasProductos, type TramoPrecio } from "@/lib/productos-facetas";
import { montoParaCaja, pasoDePrecio, posicionEnControl, rangoDesdeControl, solesFiltro, type LimitesPrecio } from "@/lib/productos-filtro-precio";
import { ORDENES_MENU, ORDEN_POR_DEFECTO, ROTULO_ORDEN_PRODUCTOS, ordenDeUrl } from "@/lib/productos-orden";
import {
  alternarColor,
  estadoDeColor,
  listaDeUrl,
  listaParaUrl,
  marcadosDeColor,
  opcionesDeColor,
  separarColor,
  FALTAS,
  ROTULO_FALTA,
  SIN_TEMPORADA,
  faltaDeUrl,
  temporadaDeUrl,
  DISPONIBILIDADES,
  DISPONIBILIDAD_DE_SEDE,
  disponibilidadDeUrl,
  rotuloDisponibilidad,
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
  sinCajas,
  tipeadoPendiente,
  valorDeCaja,
  type CajaTipeada,
  type Tipeado,
} from "@/lib/productos-filtros";
import { SIN_EN_URL } from "@/lib/marcas";
import { Buscador } from "@/components/ui/Buscador";

// Filtros de /productos. Mismo patrón que `FiltrosMovimientos.tsx`: viven en
// la URL, la página es un Server Component que filtra en Postgres
// (fn_productos_listado y fn_productos_facetas, ADR-0308), y cambiar un filtro vuelve a la
// página 1 — un filtro nuevo sobre "página 7" case casi siempre en vacío.
type Opcion = { id: string; nombre: string };
type OpcionColor = Opcion & { hex: string | null; familia: string | null; /** `solido` | `textura` | `estampado`: una textura (Gris melange) se pinta jaspeada. */ tipo?: string | null };


/** Una sola forma desde el 2026-09-28 (ADR-0254, pedido de Felipe): buscador + botón «Filtros» que despliega el panel
 *  de píldoras, en la Grilla y en la Tabla. Nació como el modo `compacto` de la Grilla (2026-09-17, tres pasadas: a
 *  Felipe le gustaba más plegado). La tarjeta de nueve campos que usaba la Tabla se borró: dos pieles del mismo filtro
 *  en la misma pantalla hacían que cambiar de vista pareciera cambiar de sistema. */
export function FiltrosProductos({
  categorias,
  colores,
  tallas,
  marcas,
  proveedores,
  totalProductos,
  limitesPrecio,
  panelInicial,
  sede,
  temporadas,
  facetas,
}: {
  categorias: Opcion[];
  colores: OpcionColor[];
  /** Tallas activas, ya en su orden de curva (S · M · L, 28 · 30 · 32). */
  tallas: Opcion[];
  /** Marcas y proveedores activos (ADR-0109): filtrar el catálogo por de quién es y quién lo trae. */
  marcas: Opcion[];
  proveedores: Opcion[];
  /** Cuántos productos calzan con lo filtrado (todas las páginas): el conteo de arriba. */
  totalProductos: number;
  /** El precio real más bajo y más alto de lo que se está viendo, redondeados; `null` = no se pudo saber. */
  limitesPrecio: LimitesPrecio | null;
  /** Lo que este equipo dejó la última vez (cookie leída en el servidor). */
  panelInicial: EstadoPanelFiltros;
  /** El nombre de la sede elegida arriba, para «Hay en Tienda Lima»; `null` en CAYLA Global (no hay una sede). */
  sede: string | null;
  /** La lista cerrada de temporadas (`fn_temporadas`); `null` si la base aún no la tiene: la píldora no se dibuja. */
  temporadas: Opcion[] | null;
  /** Cuántas prendas hay en cada opción y los tramos de precio (`fn_productos_facetas`); `null` = no se pudo saber. */
  facetas: FacetasProductos | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const consultaUrl = params.toString();
  // Solo lo que se está escribiendo ahora (buscador y precio); lo demás se lee de la URL (`lib/productos-filtros.ts`).
  const [tipeado, setTipeado] = useState<Tipeado>({});
  // La caja con el cursor adentro: lo suyo no se reemplaza por la URL hasta que salga (`tipeadoPendiente`).
  const [enfocada, setEnfocada] = useState<CajaTipeada | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  // Un enlace de AFUERA de la barra (Grilla/Tabla, paginación, el menú) que está navegando: mientras tanto el temporizador
  // del buscador espera, o su navegación descartaría la del enlace. Al llegar cualquier URL se olvida.
  const ajena = useRef<number | null>(null);
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
  // La misma URL pedida, para PINTAR: las píldoras de varias (Talla, Color) muestran lo recién marcado al instante y el clic
  // siguiente se suma a él (antes dos clics seguidos leían la URL vieja y el segundo borraba al primero). Next descarta una
  // navegación pendiente cuando empieza otra, así que la que llega es siempre la última pedida: al llegar, se olvida.
  const [consultaPedida, setConsultaPedida] = useState<string | null>(null);
  const consultaMostrada = consultaPedida ?? consultaUrl;
  const { buscando, buscar } = useBusquedaEnUrl();


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
    setConsultaPedida(consulta);
    const href = hrefDeConsulta(pathname, consulta);
    if (teclado) buscar(href, { reemplazar: true });
    else router.push(href);
  }

  function aplicar(cambios: Record<string, string>, opciones: { teclado?: boolean } = {}) {
    navegar(consultaConCambios(consultaVigente(), cambios), opciones);
  }

  // La URL llegó: lo que ya dice deja de «escribirse» (se ajusta al pintar, como manda React para un estado que sigue a una
  // prop), salvo la caja con el cursor.
  const [urlVista, setUrlVista] = useState(consultaUrl);
  if (urlVista !== consultaUrl) {
    setUrlVista(consultaUrl);
    setTipeado((t) => tipeadoPendiente(consultaUrl, t, enfocada));
    setConsultaPedida(null);
  }
  // Y cualquier URL que llega cierra lo pedido: Next descarta la navegación pendiente cuando empieza otra, así que si llegó
  // otra (un enlace de afuera, «A quién pedirle»), la pedida ya no va a llegar y aplicar sobre ella deshacía ese enlace.
  useEffect(() => {
    pedida.current = null;
    ajena.current = null;
  }, [consultaUrl]);

  // Un enlace de afuera de la barra empieza a navegar (captura: antes de que Next lo tome).
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a && !raiz.current?.contains(a)) ajena.current = Date.now();
    };
    document.addEventListener("click", alClic, true);
    return () => document.removeEventListener("click", alClic, true);
  }, []);

  function alEntrarCaja(caja: CajaTipeada) {
    setEnfocada(caja);
  }
  function alSalirCaja() {
    setEnfocada(null);
    setTipeado((t) => tipeadoPendiente(consultaUrl, t, null));
  }

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
  // cada paso; este mismo efecto hace de espera para los dos. También se vuelve a armar cuando llega una URL: si otra
  // navegación descartó la del buscador, lo que la caja todavía dice se manda sobre la URL que de verdad quedó (antes la
  // caja decía «blusa» y la lista salía sin filtrar).
  useEffect(() => {
    const t = setTimeout(() => {
      if (ajena.current && Date.now() - ajena.current < 3000) return; // espera a que llegue el enlace: lo rearma su URL
      const cambios = cambiosTipeados(consultaVigente(), tipeado);
      if (Object.keys(cambios).length > 0) aplicar(cambios, { teclado: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipeado, consultaUrl]);

  const cat = params.get("cat");
  const marca = params.get("marca");
  const proveedor = params.get("proveedor");
  const estado = estadoDeUrl(params.get("estado"));
  const disponibilidad = disponibilidadDeUrl(params.get("stock"), sede != null);
  const temporada = temporadaDeUrl(params.get("temporada"));
  const falta = faltaDeUrl(params.get("falta"));
  const orden = ordenDeUrl(params.get("orden"));

  // Los chips leen la URL (lo que de verdad filtra la lista), siempre «Nombre: valor» como la píldora (`lib/productos-filtros.ts`).
  const chips = chipsDeFiltros(
    consultaUrl,
    {
      categoria: (id) => categorias.find((c) => c.id === id)?.nombre,
      marca: (id) => marcas.find((m) => m.id === id)?.nombre,
      proveedor: (id) => proveedores.find((p) => p.id === id)?.nombre,
      color: (id) => colores.find((c) => c.id === id)?.nombre,
      talla: (id) => tallas.find((t) => t.id === id)?.nombre,
      familia: (f) => textoDeFamilia(f),
      sede,
      temporada: (clave) => temporadas?.find((t) => t.id === clave)?.nombre,
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
      // «Hay en / Sin stock en [sede]» mira la sede de quien abre el enlace, no la de quien lo manda: se dice.
      const deLaSede = disponibilidad === "en_sede" || disponibilidad === "sin_sede";
      avisar.exito("Enlace copiado", {
        detalle: deLaSede
          ? "Quien lo abra ve los mismos filtros, pero «Hay en» y «Sin stock en» se aplican a SU sede."
          : "Quien lo abra ve esta misma lista, con los mismos filtros.",
      });
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
        <div className="min-w-0 rounded-lg bg-sand/50 p-0.5">
          <DesplegablePildora
            encoger
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

  // Cuántas prendas trae cada opción (ADR-0308): se esconden las que darían una lista vacía. Sin conteos (`facetas` null:
  // la base no respondió), todas las opciones, sin número, como antes.
  const conteos = (f: FacetaClave) => facetas?.facetas[f] ?? (facetas ? {} : undefined);
  const contar = <O extends { valor: string }>(opciones: readonly O[], f: FacetaClave, elegidas: readonly (string | null)[]) =>
    opcionesConConteo(opciones, conteos(f), elegidas.filter((e): e is string => !!e));
  const conteoColor = facetas
    ? {
        ...Object.fromEntries(Object.entries(conteos("familia") ?? {}).map(([k, n]) => [`familia:${k}`, n])),
        ...(conteos("color") ?? {}),
      }
    : undefined;
  const conteoEstado = facetas
    ? { ...(conteos("estado") ?? {}), todos: Object.values(conteos("estado") ?? {}).reduce((a, n) => a + n, 0) }
    : undefined;
  const tallasMarcadas = listaDeUrl(new URLSearchParams(consultaMostrada).get("talla"));
  const coloresMarcados = marcadosDeColor(consultaMostrada);
  const opcionesColor = opcionesDeColor(colores, FAMILIAS_COLOR);
  const estadosColor = estadoDeColor(coloresMarcados, opcionesColor);

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
          opciones={[{ valor: TODOS, texto: "Todas" }, ...contar(categorias.map((c) => ({ valor: c.id, texto: c.nombre })), "categoria", [cat])]}
        />
        {/* Talla y Color aceptan varias opciones a la vez (Felipe, 2026-10-02: «M o L», «negro o azul»). */}
        <DesplegablePildora
          icono={Ruler}
          etiqueta="Talla"
          varias={{ valores: tallasMarcadas, onValores: (v) => aplicar({ talla: listaParaUrl(v) }) }}
          opciones={contar(tallas.map((t) => ({ valor: t.id, texto: t.nombre })), "talla", tallasMarcadas)}
        />
        {/* Un solo filtro de color, agrupado por familia: «Toda la familia Azul» o un tono exacto (no un filtro aparte de
            familia, que podría contradecir al de color). Los tonos van en la MISMA escala de la carta y de Atributos (de claro a
            oscuro, `lib/color-escala.ts`), y las casillas dicen lo que hace la base: marcar la familia incluye todos sus tonos
            (se ven marcados), y con algunos tonos la familia queda «parcial» (Felipe, 2026-10-02: «muy confuso»). */}
        <DesplegablePildora
          icono={Palette}
          etiqueta="Color"
          varias={{
            valores: coloresMarcados,
            onValores: (v) => aplicar(separarColor(v)),
            alternar: (actual, valor) => alternarColor(actual, valor, opcionesColor),
          }}
          rotuloCantidad="Prendas · una con varios colores cuenta en cada uno"
          opciones={opcionesConConteo(
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
                  },
            ),
            conteoColor,
            coloresMarcados,
          )}
        />
        <BloquePrecio
          precioMin={precioMin}
          precioMax={precioMax}
          limites={limitesPrecio}
          tramos={facetas?.tramos ?? []}
          onCambiar={(min, max) => setTipeado((t) => ({ ...t, precioMin: min, precioMax: max }))}
          onTramo={(t) => {
            setTipeado((x) => sinCajas(x, ["precioMin", "precioMax"]));
            // Es un botón de alternar: tocar el tramo que ya está puesto lo quita.
            if (tramoActivo(t, precioMin, precioMax)) aplicar({ precioMin: "", precioMax: "" });
            else aplicar({ precioMin: t.desde == null ? "" : String(t.desde), precioMax: t.hasta == null ? "" : String(t.hasta) });
          }}
          onEntrar={alEntrarCaja}
          onSalir={alSalirCaja}
        />
      </FilaPildoras>
      <FilaPildoras titulo="Gestión">
        {/* La sede y la red, cada una rotulada (Felipe, 2026-10-02): «¿hay en mi tienda?» es la del mostrador; «sin stock en
            ninguna», la del líder que le pide al proveedor. Sin sede elegida (CAYLA Global) solo las de la red. */}
        <DesplegablePildora
          icono={PackageSearch}
          etiqueta="Disponibilidad"
          valor={disponibilidad ?? TODOS}
          onValor={(v) => aplicar({ stock: v === TODOS ? "" : v })}
          opciones={[
            { valor: TODOS, texto: "Todas" },
            ...contar(
              DISPONIBILIDADES.filter((d) => sede != null || !DISPONIBILIDAD_DE_SEDE.includes(d)).map((d) => ({
                valor: d as string,
                texto: rotuloDisponibilidad(d, sede),
              })),
              "disponibilidad",
              [disponibilidad ?? null],
            ),
          ]}
        />
        <DesplegablePildora
          icono={Tag}
          etiqueta="Marca"
          valor={marca ?? TODOS}
          onValor={(v) => aplicar({ marca: v === TODOS ? "" : v })}
          opciones={[
            { valor: TODOS, texto: "Todas" },
            ...contar([{ valor: SIN_EN_URL, texto: "Sin marca" }, ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))], "marca", [marca]),
          ]}
        />
        <DesplegablePildora
          icono={Truck}
          etiqueta="Proveedor"
          valor={proveedor ?? TODOS}
          onValor={(v) => aplicar({ proveedor: v === TODOS ? "" : v })}
          opciones={[
            { valor: TODOS, texto: "Todos" },
            ...contar([{ valor: SIN_EN_URL, texto: "Sin proveedor" }, ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))], "proveedor", [proveedor]),
          ]}
        />
        {/* «Activos» es lo que vale sola (Felipe, 2026-10-02): se ve «Estado: Activos» en reposo y «Todos» se elige a propósito. */}
        <DesplegablePildora
          icono={CircleCheck}
          etiqueta="Estado"
          valor={estado}
          valorPorDefecto={ESTADO_POR_DEFECTO}
          onValor={(v) => aplicar({ estado: v === ESTADO_POR_DEFECTO ? "" : v })}
          opciones={opcionesConConteo(
            ESTADOS_LISTADO.map((e) => ({ valor: e as string, texto: ROTULO_ESTADO[e] })),
            conteoEstado,
            [estado, ESTADO_POR_DEFECTO],
          )}
        />
        {temporadas && (
          <DesplegablePildora
            icono={CalendarRange}
            etiqueta="Temporada"
            valor={temporada ?? TODOS}
            onValor={(v) => aplicar({ temporada: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todas" },
              ...contar([...temporadas.map((t) => ({ valor: t.id, texto: t.nombre })), { valor: SIN_TEMPORADA, texto: "Sin temporada" }], "temporada", [
                temporada ?? null,
              ]),
            ]}
          />
        )}
        {/* Lo que le falta a la ficha, en un solo lugar: el filtro de quien carga el catálogo (Felipe, 2026-10-02). */}
        <DesplegablePildora
          icono={ClipboardList}
          etiqueta="Por completar"
          valor={falta ?? TODOS}
          onValor={(v) => aplicar({ falta: v === TODOS ? "" : v })}
          opciones={[{ valor: TODOS, texto: "Cualquiera" }, ...contar(FALTAS.map((f) => ({ valor: f as string, texto: ROTULO_FALTA[f] })), "falta", [falta ?? null])]}
        />
      </FilaPildoras>
    </PanelPildoras>
  );

  return (
    <div ref={raiz} className="space-y-2">
      <div className="flex items-center gap-2">
        {/* La pieza única (ADR-0358 ronda 5): filtra mientras se escribe (la pausa de 350 ms de arriba), «/» la enfoca desde
            cualquier parte de la pantalla (el atajo de Shopify y GitHub, Felipe 2026-10-02) y «Buscando…» sale solo si la base tarda. */}
        <Buscador
          valor={busqueda}
          onCambio={(q) => setTipeado((t) => ({ ...t, q }))}
          buscando={buscando}
          atajo
          onFocus={() => alEntrarCaja("q")}
          onBlur={alSalirCaja}
          id={ID_BUSCADOR}
          etiqueta="Buscar"
          // sugerir-fijo: dice qué se puede buscar en el catálogo (nombre, código, código de barras); no depende de nada elegido antes
          placeholder="Prenda, código o código de barras…"
          className="flex-1"
        />
        <div className="shrink-0">
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
  tramos,
  onCambiar,
  onTramo,
  onEntrar,
  onSalir,
}: {
  precioMin: string;
  precioMax: string;
  limites: LimitesPrecio | null;
  /** Tramos con su conteo, cortados en los cuartiles de los precios (`fn_productos_facetas`). */
  tramos: readonly TramoPrecio[];
  onCambiar: (min: string, max: string) => void;
  onTramo: (t: TramoPrecio) => void;
  onEntrar: (caja: CajaTipeada) => void;
  onSalir: () => void;
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
        onEntrar={() => onEntrar("precioMin")}
        onSalir={onSalir}
      />
      <span aria-hidden className="text-tinta/40">–</span>
      <CajaMonto
        valor={precioMax}
        sugerido={limites ? String(limites.max) : "Hasta"}
        etiqueta="Precio hasta"
        onCambiar={(v) => onCambiar(precioMin, v)}
        onEntrar={() => onEntrar("precioMax")}
        onSalir={onSalir}
      />
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
      {/* Tramos con su número (Felipe, 2026-10-02): un toque y listo; cortados donde están los precios de verdad, no de a
          igual ancho (con 17 prendas a S/ 39,90, tramos parejos dejarían uno lleno y otro vacío). */}
      {tramos.length > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-1.5 pb-0.5" role="group" aria-label="Tramos de precio">
          {tramos.map((t) => {
            const activo = tramoActivo(t, precioMin, precioMax);
            return (
              <button
                key={`${t.desde}-${t.hasta}`}
                type="button"
                aria-pressed={activo}
                onClick={() => onTramo(t)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors ${
                  activo ? "border-tinta bg-tinta text-crema" : "border-tinta/15 text-tinta/75 hover:border-tinta/35 hover:text-tinta"
                }`}
              >
                {textoTramo(t)}
                <span className={`tabular-nums ${activo ? "text-crema/70" : "text-tinta/40"}`}>{t.n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Una caja de monto con «S/» delante. Texto (no `type=number`): acepta «39,90» y no cambia el valor con la rueda del
 *  mouse al pasar por encima. */
function CajaMonto({
  valor,
  sugerido,
  etiqueta,
  onCambiar,
  onEntrar,
  onSalir,
}: {
  valor: string;
  sugerido: string;
  etiqueta: string;
  onCambiar: (v: string) => void;
  onEntrar: () => void;
  onSalir: () => void;
}) {
  return (
    <label className="flex h-7 w-[4.75rem] shrink-0 items-center gap-1 rounded-md border border-tinta/15 bg-papel/70 px-2 focus-within:border-tinta/40">
      <span aria-hidden className="text-[11px] text-tinta/45">
        S/
      </span>
      <input
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onFocus={onEntrar}
        onBlur={onSalir}
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

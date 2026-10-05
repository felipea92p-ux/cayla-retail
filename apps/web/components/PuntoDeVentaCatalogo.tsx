"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { PrendaCatalogo } from "@/lib/catalogo-grupos";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { motivoNoCobrable, type MotivoCaja, textoStockDeFila } from "@/lib/vender-stock-local";
import { FotoPrenda } from "@/components/apartados/piezas";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TarjetaPrenda } from "@/components/punto-de-venta/TarjetaPrenda";

/**
 * Cuántas tarjetas se pintan de entrada y cuántas se suman cada vez que el centinela del fondo entra a la
 * vista (auditoría 2026-09-29: con TRU cargada, 1.500+ tarjetas de golpe tardaban 1,2 s por escaneo porque
 * cada tecla o sondeo de stock volvía a montar la grilla entera). Mismo espíritu que un combo largo
 * (`TAMANO_PAGINA_COMBO`, ADR-0209) — revelar de a tandas en vez de cortar de golpe —, con su propio número
 * porque acá cada tarjeta ocupa mucho más que una fila de combo.
 */
const TANDA_GRILLA = 60;

/** El tono del Chip de stock de cada fila del buscador. Agotada va «apagado» y no rojo: una lista con varias agotadas
 *  pasaría el máximo de rojo por pantalla (la fila ya se atenúa, y el chip dice el estado con letra). */
const TONO_STOCK: Record<MotivoCaja, TonoChip> = { cobrable: "verde", en_almacen: "ambar", apartada: "pizarra", agotada: "apagado" };

type Props = {
  ubicacionEtiqueta: string;
  bloqueado: boolean;
  // Escaneo / búsqueda
  /** El ref vive en el padre: `agregar()` lo usa para devolver el foco al escáner. */
  buscadorRef: RefObject<HTMLInputElement | null>;
  q: string;
  /** `q.trim()`, derivado en el padre. */
  term: string;
  resultados: VarianteBusqueda[];
  activo: number;
  aviso: string | null;
  /** Al tipear: el padre resetea el resultado activo y el aviso, además de guardar el texto. `cuando` es la hora de la
   *  tecla (`timeStamp` del evento): con ella el padre distingue a la pistola de una persona (`lib/lectura-pistola.ts`). */
  onEscribir: (valor: string, cuando: number) => void;
  /** El botón ×: solo borra el texto (no toca activo ni aviso — así era). */
  onLimpiarBusqueda: () => void;
  onTeclado: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Hover sobre un resultado. */
  onActivo: (i: number) => void;
  /** El único "avisa hacia arriba" de este panel: se eligió una prenda. */
  onAgregar: (v: VarianteBusqueda) => void;
  /** Abre el modal de «Prenda sin registrar» (ADR-0179), que vive en el padre. */
  onPrendaSinRegistrar: () => void;
  // Cámara (teléfono, 2026-09-25)
  /** Es un teléfono: hay cámara en vez de lector, y la lupa/cámara de al lado alterna entre las dos vías. */
  conCamara: boolean;
  /** En lugar del campo, el botón grande que abre la cámara (teléfono y sin haber pedido buscar por nombre). */
  modoCamara: boolean;
  onAbrirCamara: () => void;
  /** La lupa: cambia el botón de cámara por el campo de búsqueda. */
  onBuscarPorTexto: () => void;
  // Chips y grilla
  categorias: string[];
  categoria: string;
  /** El padre, además de guardar la categoría, devuelve el foco al escáner. */
  onCategoria: (c: string) => void;
  /** Filtro «Solo con stock» de la grilla; apagado, las sin stock se ven atenuadas. */
  soloConStock: boolean;
  onSoloConStock: (valor: boolean) => void;
  /** Cuántos COLORES esconde el filtro ahora mismo (0 si está apagado; ADR-0323). */
  ocultasSinStock: number;
  /** De esos, cuántos tienen prendas en el almacén de esta sede: no están agotados, falta bajarlos (D-40). */
  ocultasEnAlmacen: number;
  /** Tocar el cuerpo de una tarjeta: el padre abre «Todo de la prenda» en el color que se estaba viendo. */
  onAbrirPrenda: (clave: string, colorClave: string | undefined) => void;
  /** Tarjeta a la que se le acaba de pedir más de lo que hay. `pulso` sube en cada intento,
   *  así el resaltado se re-monta y vuelve a sonar aunque sea la misma tarjeta. */
  topeTarjeta: { clave: string; pulso: number } | null;
  /** Una tarjeta por PRENDA, con sus colores y tallas adentro (ADR-0323); ya viene filtrado por categoría y por
   *  `soloConStock` y ordenado por nombre (`lib/catalogo-grupos.ts`, memo del padre). */
  prendas: PrendaCatalogo<VarianteBusqueda>[];
  /** Solo para el globito "N" de cada tarjeta. */
  carrito: ItemCarrito[];
  // Ventas de hoy (vive dentro del <section>, bajo la grilla)
};

/** Mismo chip para las categorías y para el filtro de stock: uno "prendido" se ve igual
 *  sea cual sea su tipo, así la encargada de sede lee la fila entera de un vistazo.
 *  `rounded-md`: mismo radio que la "pastilla" del selector de ubicación
 *  (`campos.tsx`, `FORMA_DESPLEGABLE.pastilla`) — un chip de filtro es la misma
 *  familia de control que ese selector, no una tarjeta. */
const chip = (prendido: boolean) =>
  `label-cayla h-8 shrink-0 rounded-md border px-3 text-[11px] transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-cayla)] active:translate-y-px ${
    prendido ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel text-tinta/65 hover:bg-sand/40"
  }`;

/** Un código QR de línea (brandbook: íconos solo de trazo): tres marcas de esquina y el punteado del centro. */
function IconoQr({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h.01M17.5 20.5h3v-3" />
    </svg>
  );
}

/**
 * Panel izquierdo de Vender. La encargada de sede tiene lector: su ruta real es
 * escanear, así que el campo de escaneo es lo primero y lo más grande del panel, y
 * el catálogo (chips + grilla) es el plan B para cuando la etiqueta no lee — a un
 * toque, pero sin encabezado propio que le robe alto a la venta.
 *
 * Sin estado de NEGOCIO propio — todo eso (búsqueda, catálogo filtrado, foco,
 * `agregar()`) sigue llegando por props desde `PuntoDeVenta`. Es la costura para
 * trabajar el catálogo sin tocar el ticket (ADR-0043).
 *
 * `catalogoAbierto` (2026-09-25) es la única excepción, y a propósito: si "abrir o
 * cerrar el catálogo en el celular" viviera en el padre, cada toque de este botón
 * re-renderizaría el componente de 1300 líneas que además es dueño del carrito y del
 * ticket — exactamente lo que la costura de arriba evita. Es un dato de PRESENTACIÓN
 * puro (nadie más lo necesita, no cambia nada de negocio), así que se queda local.
 */
export function PuntoDeVentaCatalogo({
  ubicacionEtiqueta,
  bloqueado,
  buscadorRef,
  q,
  term,
  resultados,
  activo,
  aviso,
  onEscribir,
  onLimpiarBusqueda,
  onTeclado,
  onActivo,
  onAgregar,
  onPrendaSinRegistrar,
  conCamara,
  modoCamara,
  onAbrirCamara,
  onBuscarPorTexto,
  categorias,
  categoria,
  onCategoria,
  soloConStock,
  onSoloConStock,
  ocultasSinStock,
  ocultasEnAlmacen,
  onAbrirPrenda,
  topeTarjeta,
  prendas,
  carrito,
}: Props) {
  // Colapsado por defecto SOLO en celular (la vendedora escanea; explorar el catálogo a mano
  // es el plan B). Desde `sm:` (640px) el bloque de abajo ignora este estado — siempre visible,
  // como hoy — así que arrancar en `false` es seguro también en escritorio.
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  // Ventana de la grilla (auditoría 2026-09-29): solo se pintan las primeras `cuantas`, y el
  // centinela del fondo suma otra tanda cuando entra a la vista. Vuelve al tamaño inicial cada
  // vez que cambia lo que arma `grupos` (categoría o «Solo con stock»): sin esto, pasar de una
  // categoría larga (donde ya se habían revelado cientos) a una corta mostraría de entrada más
  // de lo que esa categoría necesita, y volver a la larga arrancaría "recordando" el número
  // viejo en vez de la primera tanda. Ajuste EN EL RENDER (no un efecto, mismo idioma que
  // `variantesPrevias` en `PuntoDeVenta.tsx`): React lo detecta y vuelve a renderizar antes de
  // pintar nada en pantalla, sin el repintado de más de un efecto separado.
  const [cuantas, setCuantas] = useState(TANDA_GRILLA);
  const [filtroPrevio, setFiltroPrevio] = useState({ categoria, soloConStock });
  if (filtroPrevio.categoria !== categoria || filtroPrevio.soloConStock !== soloConStock) {
    setFiltroPrevio({ categoria, soloConStock });
    setCuantas(TANDA_GRILLA);
  }
  const prendasVisibles = prendas.slice(0, cuantas);
  const faltanMas = cuantas < prendas.length;
  // Centinela propio (no `useEnVista`, pensado para animación de CSS): acá cruzar el umbral debe
  // SUMAR una tanda, y eso es un efecto secundario real sobre un sistema externo (el scroll),
  // no un valor derivado para pintar — por eso `setCuantas` vive en el callback del propio
  // `IntersectionObserver`, nunca en el cuerpo del efecto que lo arma.
  const centinelaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = centinelaRef.current;
    if (!el || !faltanMas) return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) setCuantas((n) => Math.min(n + TANDA_GRILLA, prendas.length));
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [faltanMas, prendas.length]);
  return (
    // En escritorio el alto lo fija el padre (pantalla fija, ADR-0044): `lg:min-h-0`
    // deja que esta columna encoja a la fila y la grilla scrollee por dentro, así el
    // campo de escaneo nunca sale de la vista, por larga que sea la categoría.
    <section
      aria-label="Escanear o buscar prendas"
      className="flex min-w-0 flex-col border-b border-sand lg:min-h-0 lg:flex-1 lg:border-b-0"
    >
      {/* `@container`: la fila de captura decide por el ancho del PANEL, no de la ventana. En una laptop con el lateral
          abierto el panel mide ~290 px aunque la ventana sea de escritorio. */}
      <div className="anim-sube @container px-4 pt-3 sm:px-6 sm:pt-4">
        {/* Fila de captura: el campo manda (flex-1); «Prenda sin registrar» (ADR-0179) es la
            tercera vía de captura (la prenda aún no está en el sistema), por eso vive al lado
            del campo y no entre los chips, donde le robaba ancho a las categorías.
            En el teléfono la fila tiene tres botones y el campo mide ~155 px: la lista de resultados,
            anclada al campo, cortaba el precio y el stock. Bajo `sm` la lista se ancla a la FILA
            (el envoltorio del campo pasa a `static` y la fila toma el `relative z-20`) y usa todo el
            ancho; desde `sm` sigue anclada al campo, como siempre. */}
        <div className="relative flex items-stretch gap-2 max-sm:z-20">
          {modoCamara ? (
            // Teléfono: no hay lector que «escriba» el código, así que el lugar del campo lo toma la cámara. Mismo alto
            // (h-14) y mismo lugar: la encargada busca «escanear» donde siempre estuvo.
            <button
              type="button"
              onClick={onAbrirCamara}
              disabled={bloqueado}
              className="label-cayla flex h-14 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-tinta px-3 text-[11px] text-crema transition-[background-color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-tinta/90 active:translate-y-px"
            >
              <IconoQr className="h-5 w-5 shrink-0" />
              Escanear QR
            </button>
          ) : (
          <div className="relative z-20 min-w-0 flex-1 max-sm:static">
            <label className="group flex h-14 items-center gap-3 rounded-xl border border-sand bg-papel px-4 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
              {/* Código de barras: dice "acá se escanea" sin una palabra más. */}
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-tinta/45 transition-colors group-focus-within:text-rojo"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              >
                <path d="M3 5v14M6.5 5v14M8.5 5v14M12 5v14M15 5v14M17 5v14M21 5v14" />
              </svg>
              <input
                id="venta-buscar"
                ref={buscadorRef}
                // En el teléfono el campo aparece porque se tocó la lupa: ahí sí se quiere el teclado. Con lector, siempre.
                autoFocus
                disabled={bloqueado}
                value={q}
                onChange={(e) => onEscribir(e.target.value, e.timeStamp)}
                onKeyDown={onTeclado}
                placeholder="Escanea la etiqueta o busca la prenda"
                aria-label="Escanea la etiqueta o busca la prenda"
                autoComplete="off"
                role="combobox"
                aria-expanded={resultados.length > 0}
                aria-controls="venta-resultados"
                aria-activedescendant={resultados.length > 0 ? `venta-op-${activo}` : undefined}
                aria-autocomplete="list"
                className="min-w-0 flex-1 bg-transparent text-base text-tinta outline-none placeholder:text-tinta/45"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => onLimpiarBusqueda()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base text-tinta/50 hover:bg-sand/40"
                >
                  ×
                </button>
              )}
            </label>
            {q && (
              <ul
                id="venta-resultados"
                role="listbox"
                aria-label="Prendas encontradas"
                className="card-cayla anim-globo absolute top-16 right-0 left-0 divide-y divide-sand overflow-hidden !p-0 shadow-lg"
              >
                {resultados.length ? (
                  resultados.map((v, i) => {
                    // Con el piso en 0, «sin stock aquí» o, si está guardada en el almacén de esta sede, cuántas hay ahí
                    // (D-40): la colaboradora no le dice «no hay» a la clienta con la prenda en la trastienda.
                    const motivo = motivoNoCobrable(v);
                    const otras = textoOtrasSedes(v.stockOtrasSedes ?? []);
                    const apagada = motivo === "agotada" || motivo === "apartada";
                    return (
                    // Estilo C del spike (`docs/maquetas/buscador-vender-2026-10/`, Felipe 2026-10-03): la prenda como en la
                    // grilla de abajo —foto, o el ícono de su categoría sobre el COLOR de la prenda—, talla en píldora, punto
                    // del color y el stock como Chip. Precio a la derecha; por `@container`, bajo 26rem baja bajo el nombre.
                    <li key={v.varianteId} id={`venta-op-${i}`} role="option" aria-selected={i === activo} className="anim-entra @container relative" style={{ "--i": Math.min(i, 6) } as CSSProperties}>
                      <button
                        type="button"
                        onMouseEnter={() => onActivo(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onAgregar(v)}
                        className={`flex w-full items-center gap-3.5 py-2.5 pr-3.5 pl-3 text-left text-sm transition-colors duration-200 ${i === activo ? "bg-sand/60" : ""}`}
                      >
                        {/* La barra roja de la fila activa: un solo rojo a la vez en la pantalla. */}
                        {i === activo && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-sm bg-rojo" />}
                        {v.fotoUrl ? (
                          <FotoPrenda fotoUrl={v.fotoUrl} referencia={v.referencia} colorHex={v.colorHex} categoria={v.categoria} categoriaPrefijo={v.categoriaPrefijo} categoriaFamilia={v.categoriaFamilia} ancho={64} className={`w-16 ${apagada ? "opacity-55" : ""}`} />
                        ) : (
                          <MosaicoPrenda colorHex={v.colorHex} prefijo={v.categoriaPrefijo} familia={v.categoriaFamilia ?? null} categoria={v.categoria} forma="fila" className={`w-16 ${apagada ? "opacity-55" : ""}`} />
                        )}
                        <span className={`min-w-0 flex-1 ${apagada ? "opacity-80" : ""}`}>
                          <span className="block truncate font-semibold text-tinta">{v.referencia}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-tinta/65">
                            {v.talla && <span className="shrink-0 rounded-md border border-sand bg-crema px-1.5 py-px font-semibold text-tinta">{v.talla}</span>}
                            {v.color && (
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/25" style={{ backgroundColor: estiloMosaicoColor(v.colorHex)?.fondo ?? "transparent" }} />
                                <span className="truncate">{v.color}</span>
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] tracking-wide text-tinta/50">{codigoPrenda(v)}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Chip tono={TONO_STOCK[motivo]} tachado={false}>
                              {textoStockDeFila(v)}
                            </Chip>
                            {/* Dónde más hay: la venta que se perdía cuando solo decía «sin stock». */}
                            {otras && <span className="text-[11px] text-tinta/55">{otras}</span>}
                            {/* Lista angosta (celular): el precio sube a esta línea en vez de abrir otra. */}
                            <span className="ml-auto text-sm font-semibold tabular-nums text-tinta @[26rem]:hidden">{money(v.precio)}</span>
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-right text-sm font-semibold tabular-nums text-tinta @[26rem]:block">{money(v.precio)}</span>
                      </button>
                    </li>
                    );
                  })
                ) : (
                  <p className="px-4 py-5 text-sm text-tinta/65">
                    No encontramos «{term}» en {ubicacionEtiqueta}.
                  </p>
                )}
              </ul>
            )}
          </div>
          )}
          {conCamara && (
            // La otra vía, a un toque: con la cámara a la vista, la lupa (buscar por nombre); con el campo, la cámara.
            <button
              type="button"
              onClick={modoCamara ? onBuscarPorTexto : onAbrirCamara}
              disabled={bloqueado}
              aria-label={modoCamara ? "Buscar la prenda por nombre" : "Escanear QR con la cámara"}
              className="grid w-14 shrink-0 place-items-center rounded-xl border border-sand bg-papel text-tinta/75 transition-[background-color,color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-sand/40 hover:text-tinta active:translate-y-px"
            >
              {modoCamara ? (
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-5 w-5">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l4.5 4.5" />
                </svg>
              ) : (
                <IconoQr className="h-5 w-5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onPrendaSinRegistrar()}
            disabled={bloqueado}
            // En una fila angosta (el teléfono, o el panel de una laptop con el lateral abierto) el texto se parte en dos
            // líneas en vez de robarle ancho al campo o a la cámara. Por el ancho del panel (`@md`), no de la ventana.
            // En tinta (Felipe, 2026-10-01): es la vía de captura que la colaboradora busca cuando la prenda no tiene etiqueta.
            className="label-cayla w-[6.75rem] shrink-0 rounded-xl border border-tinta bg-tinta px-3 text-[11px] leading-snug text-crema @md:w-auto @md:leading-normal transition-[background-color,color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-tinta/85 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-tinta"
          >
            Prenda sin registrar
          </button>
        </div>
        {aviso && (
          <p key={aviso} className="anim-asentar mt-2 text-sm text-ambar-profundo">
            {aviso}
          </p>
        )}

        {/* Solo en celular (`sm:hidden`): la ruta real ahí es escanear, así que explorar el
            catálogo a mano arranca oculto y es un toque aparte. Sin subtítulo — el propio
            texto ya dice qué hace, y `aria-expanded`/`aria-controls` cubren al lector de
            pantalla igual que ya hace el campo de escaneo de arriba. */}
        <button
          type="button"
          onClick={() => setCatalogoAbierto((v) => !v)}
          aria-expanded={catalogoAbierto}
          aria-controls="venta-catalogo-filtros venta-catalogo-grilla"
          className="label-cayla mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sand bg-papel text-[11px] font-semibold text-tinta transition-colors duration-200 ease-[var(--ease-cayla)] hover:bg-sand/40 active:translate-y-px sm:hidden"
        >
          {catalogoAbierto ? "Ocultar catálogo" : "Ver catálogo"}
          <span aria-hidden className={`inline-block transition-transform duration-300 ease-[var(--ease-cayla)] ${catalogoAbierto ? "rotate-180" : ""}`}>
            ⌄
          </span>
        </button>

        {/* Desde `sm:` este bloque ignora `catalogoAbierto` y se ve exactamente como siempre
            (`sm:block` gana sobre `hidden` en cuanto el viewport cruza el breakpoint) — en
            celular, aparece solo con el botón de arriba. */}
        <div id="venta-catalogo-filtros" className={catalogoAbierto ? "" : "hidden sm:block"}>
          {/* «Solo con stock» es lo primero que decide qué ve la encargada, así que va en su
              propia fila, con interruptor de verdad (se lee prendido/apagado de un vistazo, no
              como un chip más entre las categorías donde se perdía al final de la fila) y con
              cuántas tarjetas esconde: sin ese número, una prenda que no aparece parece que
              no existe. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={soloConStock}
              onClick={() => onSoloConStock(!soloConStock)}
              disabled={bloqueado}
              // `shrink-0`: con el contador largo de al lado, el interruptor se partía en dos líneas y la fila crecía.
              className="group flex shrink-0 items-center gap-2.5 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-rojo/30"
            >
              <span
                aria-hidden
                className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-300 ease-[var(--ease-cayla)] ${
                  soloConStock ? "border-tinta bg-tinta" : "border-sand bg-sand/60"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-300 ease-[var(--ease-cayla)] ${
                    soloConStock ? "translate-x-4 bg-crema" : "bg-tinta/45"
                  }`}
                />
              </span>
              <span className="label-cayla text-[11px] font-semibold text-tinta">Solo con stock</span>
            </button>
            {soloConStock && ocultasSinStock > 0 && (
              // Un color escondido porque su piso está en 0 no está «agotado» si tiene prendas en el almacén de esta sede
              // (D-40): se dice cuántos, para que se sepa que apagando el filtro aparecen. Cuenta COLORES (los puntos de
              // las tarjetas, ADR-0323), no unidades. `leading-tight`: en dos líneas cabe en el alto del interruptor, y la
              // fila no cambia de alto al prenderlo o apagarlo (ADR-0185).
              <span className="anim-asentar text-right text-[11px] leading-tight text-tinta/60">
                {ocultasEnAlmacen > 0
                  ? `${ocultasSinStock} ${ocultasSinStock === 1 ? "color oculto" : "colores ocultos"} (${ocultasEnAlmacen} con stock en el almacén)`
                  : `${ocultasSinStock} ${ocultasSinStock === 1 ? "color agotado oculto" : "colores agotados ocultos"}`}
              </span>
            )}
          </div>

          {/* Catálogo, la ruta secundaria: las categorías tienen ahora toda la fila. */}
          <div className="scroll-cayla mt-2 flex gap-2 overflow-x-auto pb-3">
            {categorias.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => onCategoria(c)}
                disabled={bloqueado}
                className={`anim-entra ${chip(categoria === c)}`}
                style={{ "--i": Math.min(i, 10) } as CSSProperties}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6">
        {/* Solo la grilla se colapsa con el botón de arriba. «Ventas de hoy» ya no vive aquí abajo: es la píldora
            «Hoy» de la cabecera (spike 2026-09-26). `@container`: las columnas dependen del ancho del catálogo, no de
            la pantalla — con el lateral abierto o cerrado, cada tarjeta mide lo mismo. */}
        <div id="venta-catalogo-grilla" className={`@container ${catalogoAbierto ? "" : "hidden sm:block"}`}>
        <TooltipProvider delayDuration={250}>
          {/* Una tarjeta por prenda (ADR-0323), foto cuadrada y de 2 a 5 columnas según el ancho del catálogo, no de la
              ventana: con el lateral abierto o cerrado, en una laptop o a 320 px, cada tarjeta mide parecido. */}
          <div className="grid grid-cols-2 gap-2.5 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
            {prendas.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-tinta/60">
                {soloConStock ? `Nada con stock en ${ubicacionEtiqueta}` : "No hay prendas"}
                {categoria === "Todo" ? "." : ` en ${categoria}.`}
              </p>
            )}
            {prendasVisibles.map((p, i) => (
              <TarjetaPrenda
                key={p.clave}
                prenda={p}
                indice={i}
                bloqueado={bloqueado}
                carrito={carrito}
                pulsoTope={topeTarjeta?.clave === p.clave ? topeTarjeta.pulso : null}
                onAgregar={onAgregar}
                onAbrir={onAbrirPrenda}
              />
            ))}
          </div>
          {/* Centinela mudo: cuando entra a la vista, revela la próxima tanda (auditoría 2026-09-29).
              Sin tamaño propio — solo dispara el efecto de arriba — y no existe si ya se ve todo. */}
          {faltanMas && <div ref={centinelaRef} aria-hidden className="h-px" />}
        </TooltipProvider>
        </div>

      </div>
    </section>
  );
}

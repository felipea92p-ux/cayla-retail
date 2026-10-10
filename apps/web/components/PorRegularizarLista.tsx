"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarArrowDown, CalendarArrowUp } from "lucide-react";
import { cifrasPorRegularizar, coincideConBusqueda, estaVencida, ordenarVentas, ORDEN_INICIAL, VENTAS_POR_PAGINA, type Orden } from "@/lib/por-regularizar-reglas";
import { paginar } from "@/lib/paginacion";
import { avisosDePlazo, diaMes as diaMesDe, sedesParaCerrar } from "@/lib/cola-arranque-reglas";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import type { PrendaParaRegularizar } from "@/lib/por-regularizar-mesa";
import { Desplegable } from "@/components/ui/campos";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { CerrarColaArranqueModal } from "@/components/CerrarColaArranqueModal";
import { ReabrirPrendaModal } from "@/components/ReabrirPrendaModal";
import { CorregirPrendaSinRegistrarModal } from "@/components/CorregirPrendaSinRegistrarModal";
import type { ListasPrendaLibre } from "@/lib/prenda-sin-registrar-reglas";
import { SugerenciasColaModal } from "@/components/SugerenciasColaModal";
import { FranjaAvance } from "@/components/por-regularizar/FranjaAvance";
import { MesaRegularizar } from "@/components/por-regularizar/MesaRegularizar";
import { Buscador } from "@/components/ui/Buscador";

/** Lo mínimo de cada prenda del catálogo para reconocerla y dibujarla (sin costo: esta pantalla la ve almacén). */
export type { PrendaParaRegularizar };

const FILTROS = [
  { clave: "pendiente", texto: "Pendientes" },
  { clave: "regularizada", texto: "Regularizadas" },
  { clave: "cerrada_sin_prenda", texto: "Cerradas" },
  { clave: "todas", texto: "Todas" },
] as const;

/**
 * Ventas sin registrar (ADR-0179, ADR-0330) con el diseño de la maqueta A2 «Puente» (ADR-0360, Felipe 2026-10-07): una franja con lo que
 * falta y lo urgente, los filtros y el buscador de siempre, y la mesa (`MesaRegularizar`): talones · puente · prendas.
 *
 * Lo que NO cambió: de dónde salen las filas, los cuatro filtros, la búsqueda, quién vendió, la fecha, el paginado de 25, «Identificar con
 * sugerencias», «Cerrar la cola de arranque», «Reabrir», y lo que guarda `regularizar_prenda`. Lo que se fue: el modal «Regularizar» (ahora
 * es el puente), las cuatro tarjetas de cifras y el anillo (ahora la franja) y el orden por cada columna: no hay columnas; queda el orden
 * por fecha y el botón «N vencidas», que deja solo lo urgente.
 */
export function PorRegularizarLista({
  filas,
  prendas,
  disponibles,
  ubicacionEtiqueta,
  variasSedes,
  esLider,
  plazos,
  sedeInicial,
  abrirItemId = null,
  listas,
}: {
  filas: FilaPorRegularizar[];
  prendas: PrendaParaRegularizar[];
  /** Unidades libres por tienda y por prenda; una tienda que falta = no se pudo leer (la pantalla sigue, sin cifras de stock). */
  disponibles: Record<string, Record<string, number>>;
  /** Para el mensaje de «no hay nada»: la sede que se mira, o «tus tiendas» si es el líder. */
  ubicacionEtiqueta: string;
  /** El líder ve todas las sedes: cada fila dice de cuál es. */
  variasSedes: boolean;
  /** Solo un líder cierra la cola de arranque (ADR-0334); la base lo vuelve a exigir. */
  esLider: boolean;
  /** Hasta cuándo cada tienda puede cerrar su cola (`ubicacion_id → AAAA-MM-DD`). Sin plazo no hay botón. */
  plazos: Record<string, string>;
  /** La tienda que se está mirando (`?ubicacion=`), para que el cierre parta de ella. */
  sedeInicial: string | null;
  /** La línea de venta (`?item=`) con que llega Historial: si su prenda sigue pendiente, esa venta entra elegida. */
  abrirItemId?: string | null;
  /** Las listas de la hoja «Prenda sin registrar» (las mismas de la caja), para «Corregir lo anotado» (ADR-0369). */
  listas: ListasPrendaLibre;
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["clave"]>("pendiente");
  const [quien, setQuien] = useState("");
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [reabriendo, setReabriendo] = useState<FilaPorRegularizar | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<FilaPorRegularizar | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ahora = useMemo(() => new Date(), []);
  // Las ventas que ya se regularizaron en esta visita pero que la lista aún no releyó: la franja baja su cuenta sin esperar al refresco.
  const [hechasLocal, setHechasLocal] = useState<ReadonlySet<string>>(new Set());
  const [filasPrevias, setFilasPrevias] = useState(filas);
  if (filasPrevias !== filas) {
    setFilasPrevias(filas);
    setHechasLocal(new Set());
  }
  const cifras = useMemo(() => cifrasPorRegularizar(filas.filter((f) => !hechasLocal.has(f.id)), ahora), [filas, hechasLocal, ahora]);
  const [pendientesAlAbrir] = useState(cifras.pendientes);
  const vendedoras = useMemo(() => [...new Set(filas.map((f) => f.vendidoPor))].sort(), [filas]);
  // Al abrir, de la venta más reciente a la más antigua (Felipe, 2026-10-06). La búsqueda es local (las filas ya están aquí): no va a la base ni a la URL.
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const visibles = useMemo(
    () =>
      ordenarVentas(
        filas.filter(
          (f) =>
            (filtro === "todas" || f.estado === filtro) &&
            (!soloVencidas || (f.estado === "pendiente" && !hechasLocal.has(f.id) && estaVencida(f.vendidoEn, ahora))) &&
            (!quien || f.vendidoPor === quien) &&
            coincideConBusqueda(f, busqueda),
        ),
        orden,
        ahora,
      ),
    [filas, filtro, soloVencidas, hechasLocal, quien, busqueda, orden, ahora],
  );
  // Cambiar un filtro vuelve a la página 1 (ajuste durante el render, como Comprobantes); `paginar` acota si la lista se achicó.
  // La venta con que llega Historial (`?item=`) entra elegida, y su página es la primera que se ve.
  const elegidaAlAbrir = useMemo(() => (abrirItemId ? (filas.find((f) => f.ventaItemId === abrirItemId && f.estado === "pendiente")?.id ?? null) : null), [filas, abrirItemId]);
  const [pagina, setPagina] = useState(() => {
    if (!elegidaAlAbrir) return 1;
    const i = ordenarVentas(filas.filter((f) => f.estado === "pendiente"), ORDEN_INICIAL, new Date()).findIndex((f) => f.id === elegidaAlAbrir);
    return i < 0 ? 1 : Math.floor(i / VENTAS_POR_PAGINA) + 1;
  });
  const firmaFiltros = `${filtro}\u0000${soloVencidas}\u0000${quien}\u0000${busqueda}\u0000${orden.campo}${orden.dir}`;
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaFiltros !== firmaPrevia) {
    setFirmaPrevia(firmaFiltros);
    setPagina(1);
  }
  const paginaActual = paginar(visibles, pagina, VENTAS_POR_PAGINA);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  function irAPagina(n: number) {
    setPagina(n);
    // El paginador está al pie: al cambiar de página, la lista empieza a leerse desde arriba.
    const tarjeta = tarjetaRef.current;
    if (tarjeta && tarjeta.getBoundingClientRect().top < 0) tarjeta.scrollIntoView({ block: "start" });
  }
  // Las tiendas que se pueden cerrar HOY: con pendientes y con plazo vigente. Sin ninguna, el botón no existe.
  const sedesDelLider = useMemo(() => (esLider ? sedesParaCerrar(filas, plazos, ahora) : []), [esLider, filas, plazos, ahora]);
  const sedesCerrables = useMemo(() => sedesDelLider.filter((s) => s.puedeCerrar), [sedesDelLider]);
  // Las sugerencias no dependen del plazo: identificar una venta nunca está vedado, solo cerrarla sin prenda.
  const sedesConPendientes = useMemo(() => sedesDelLider.map((s) => ({ ubicacionId: s.ubicacionId, sede: s.sede, pendientes: s.pendientes })), [sedesDelLider]);
  // Qué dice el plazo de cada tienda: sin esto, vencido el plazo el botón desaparecía sin explicación. Solo se muestra a la vista cuando hay algo que
  // explicar (venció, no hay plazo, o hoy es el último día); con el plazo corriendo, va en el propio «Cerrar la cola de arranque» del menú «Más».
  const avisosUrgentes = useMemo(() => avisosDePlazo(sedesDelLider.filter((s) => !s.puedeCerrar || s.diasDePlazo === 0)), [sedesDelLider]);
  const plazoUnico = sedesCerrables.length === 1 && sedesCerrables[0].plazoHasta ? `hasta el ${diaMesDe(sedesCerrables[0].plazoHasta)}` : null;
  // Lo que solo hace un líder (la base lo vuelve a exigir) va en un menú: dos botones de peso igual compitiendo con el trabajo de la mesa.
  const accionesDeLider = useMemo<ItemMenu[]>(
    () => [
      ...(sedesConPendientes.length > 0 ? [{ clave: "sugerencias", etiqueta: "Identificar con sugerencias", onSelect: () => setSugiriendo(true) }] : []),
      ...(sedesCerrables.length > 0 ? [{ clave: "cerrar", etiqueta: `Cerrar la cola de arranque${plazoUnico ? ` · ${plazoUnico}` : ""}`, onSelect: () => setCerrando(true) }] : []),
    ],
    [sedesConPendientes.length, sedesCerrables.length, plazoUnico],
  );
  return (
    <div className="vsr space-y-6">
      <FranjaAvance
        pendientes={cifras.pendientes}
        vencidas={cifras.vencidas}
        descuentoMes={cifras.descuentoMes}
        sobreprecioMes={cifras.sobreprecioMes}
        inicial={pendientesAlAbrir}
        soloVencidas={soloVencidas}
        onVencidas={() => {
          setSoloVencidas((v) => !v);
          setFiltro("pendiente");
        }}
      />

      <div ref={tarjetaRef}>
        <div className="card-cayla anim-sube" style={{ "--i": 4 } as CSSProperties}>
          {/* Una sola fila de herramientas (la mesa empieza más arriba): buscar, filtrar, ordenar y «quién vendió»; lo de líder va en «Más». */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-5 pb-3 pt-4">
            <Buscador
              valor={busqueda}
              onCambio={setBusqueda}
              maxLength={120}
              placeholder="Buscar prenda, color, talla, quién vendió o precio"
              etiqueta="Buscar una venta sin registrar"
              className="min-w-[11rem] flex-1 basis-44"
            />
            <div className="flex flex-wrap items-center gap-2">
              {FILTROS.map((f) => (
                <button
                  key={f.clave}
                  type="button"
                  aria-pressed={filtro === f.clave}
                  onClick={() => {
                    setFiltro(f.clave);
                    if (f.clave !== "pendiente") setSoloVencidas(false);
                  }}
                  className="pildora-cayla"
                >
                  {f.texto}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Un solo botón chico que alterna el orden por fecha de venta: el ícono y la palabra dicen cómo está ordenada hoy; tocarlo la invierte. */}
              <button
                type="button"
                onClick={() => setOrden({ campo: "vendio", dir: orden.dir === "desc" ? "asc" : "desc" })}
                title={orden.dir === "asc" ? "Primero las ventas más antiguas · toca para ver primero las recientes" : "Primero las ventas más recientes · toca para ver primero las antiguas"}
                aria-label={orden.dir === "desc" ? "Ordenadas de la más reciente a la más antigua. Cambiar a la más antigua primero" : "Ordenadas de la más antigua a la más reciente. Cambiar a la más reciente primero"}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sand bg-papel px-2.5 text-xs text-tinta transition-colors hover:bg-hueso"
              >
                {orden.dir === "asc" ? <CalendarArrowUp aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" /> : <CalendarArrowDown aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />}
                <span className="hidden md:inline">{orden.dir === "desc" ? "Recientes" : "Antiguas"}</span>
              </button>
              <div className="w-52 shrink-0">
                <Desplegable valor={quien} onValor={setQuien} opciones={[{ valor: "", texto: "Todas las colaboradoras" }, ...vendedoras.map((v) => ({ valor: v, texto: v }))]} forma="caja" etiquetaAccesible="Quién vendió" />
              </div>
              {accionesDeLider.length > 0 && <MenuAcciones etiqueta="Más acciones" texto="Más" items={accionesDeLider} />}
            </div>
          </div>
          {avisosUrgentes.length > 0 && (
            <ul className="space-y-0.5 px-5 pb-3 text-xs text-taupe">
              {avisosUrgentes.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}
          <div className="border-t border-sand pt-4">
            <MesaRegularizar
              filas={paginaActual.filas}
              elegidaAlAbrir={elegidaAlAbrir}
              prendas={prendas}
              disponibles={disponibles}
              variasSedes={variasSedes}
              esLider={esLider}
              ahora={ahora}
              sinPendientes={cifras.pendientes === 0}
              etiquetaSede={ubicacionEtiqueta}
              soloPendientes={filtro === "pendiente"}
              onReabrir={setReabriendo}
              onCorregir={setCorrigiendo}
              onHecha={(id) => setHechasLocal((previas) => new Set(previas).add(id))}
              vacio={
                busqueda.trim()
                  ? `Ninguna venta coincide con «${busqueda.trim()}».`
                  : soloVencidas
                    ? "No hay ventas vencidas."
                    : filtro === "pendiente"
                      ? `No hay prendas por regularizar en ${ubicacionEtiqueta}.`
                      : "Nada que mostrar con estos filtros."
              }
              pie={
                paginaActual.totalPaginas > 1 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-tinta/10 pt-3 text-xs text-taupe">
                    <span>
                      Mostrando {paginaActual.desde}–{paginaActual.hasta} de {visibles.length}
                    </span>
                    <PaginacionLocal pagina={paginaActual.pagina} totalPaginas={paginaActual.totalPaginas} onPagina={irAPagina} />
                  </div>
                )
              }
            />
          </div>
        </div>
      </div>

      <p className="nota-cayla text-sm">
        Son prendas que caja vendió antes de que estuvieran en el sistema. Al regularizarlas, la venta pasa a la prenda real y el stock queda cuadrado. Las pendientes salen todas; las ya resueltas, las de este
        mes y el anterior.
      </p>

      {sugiriendo && <SugerenciasColaModal filas={filas} prendas={prendas} sedes={sedesConPendientes} inicial={sedeInicial} onClose={() => setSugiriendo(false)} />}
      {reabriendo && <ReabrirPrendaModal fila={reabriendo} onClose={() => setReabriendo(null)} />}
      {corrigiendo && <CorregirPrendaSinRegistrarModal fila={corrigiendo} listas={listas} onClose={() => setCorrigiendo(null)} />}
      {cerrando && <CerrarColaArranqueModal sedes={sedesCerrables} inicial={sedeInicial} onClose={() => setCerrando(false)} />}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Camera, Search, SlidersHorizontal, X } from "lucide-react";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { Modal } from "@/components/ui/Modal";
import { SenalBuscando, useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { EscanerBusqueda } from "@/components/EscanerBusqueda";
import {
  CATEGORIAS_FILTRO,
  FILTROS_SUBUBICACION,
  FILTROS_TIPO,
  PERIODOS_RAPIDOS,
  PROCESOS_POR_CATEGORIA,
  categoriaDeProceso,
  etiquetaProceso,
  filtroDePalabra,
  type CategoriaFiltro,
  type PeriodoMovimientos,
  type ResumenTienda,
  type TokenSububicacion,
} from "@/lib/movimientos-reglas";
import { grupoPorId } from "@/lib/movimientos-tipos";

// Filtros de Movimientos. Viven en la URL (?q=…&cat=…&proc=…&sub=…&rango=…), igual que en
// Compras: la página es un Server Component que filtra en Postgres, el enlace se puede
// compartir («mirá lo que pasó con esta blusa»), y "atrás" vuelve al filtro anterior.
// Cambiar un filtro borra el cursor de paginado.
//
// El TIPO (venta, colgada en piso, llegada…) ya no se elige aquí: son los siete botones de la columna de la derecha
// (`TiposMovimiento`, ADR-0353), que además traen su cifra. Aquí quedan la búsqueda, el período, la zona y, debajo de un
// tipo elegido, sus procesos.
//
// El buscador entiende el nombre de un proceso (ADR-0234): «venta», «traslado», «ajuste»… no buscan prendas —ninguna se
// llama así—, así que se vuelven el filtro de ese tipo y el campo se vacía. «Traslado 24» sigue siendo una búsqueda.
//
// Orden (rediseño 2026-09-22, elegido por Felipe en la demo de
// docs/maquetas/movimientos-rediseno-2026-09/): dos filas, como la guía oficial.
//   1. Búsqueda (prendas Y procesos: «Traslado 24», «Boleta B001-000184») + período.
//   2. La zona (piso / almacén / cuarentena) en un control segmentado chico.
//   Debajo, solo si hay un tipo elegido: sus procesos («Ajustes» → Conteo · Merma · …).
// Antes el proceso era un select nativo de 19 opciones escondido en «Más filtros»: los
// procesos ya pertenecen a un tipo, y la pantalla usa esa jerarquía en vez de aplanarla.
// No hay filtro por persona: la autoría sigue guardada, pero esta pantalla es para leer
// qué cambió en el stock, no a quién culpar.
//
// En celular cada fila de píldoras se desliza de lado en vez de partirse en tres líneas.
//
// El recorte por defecto (30 días) NO está en la URL: el botón «30 días» aparece apretado
// y las fechas de «Personalizado» muestran la que rige, así nadie se pregunta por qué no
// ve la venta de hace dos meses.
type Sububicacion = { id: string; tipo: string | null; nombre: string };

// Una fila de píldoras: en celular se desliza (sin partirse), desde sm se envuelve.
const FILA_DESLIZA =
  "-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0";

function Pastilla({
  activa,
  onClick,
  cuenta,
  sutil = false,
  quitable = false,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  cuenta?: number;
  /** Activa y se puede soltar con otro toque (ADR-0241): lleva una × en vez de la línea «Filtrando: …». */
  quitable?: boolean;
  /** La píldora de proceso: más chica y, activa, en hueso — no compite con el tipo en tinta. */
  sutil?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      // Un tipo sin nada en el período se ve (dice «0») pero no se toca: antes llevaba a «Ningún movimiento coincide»
      // con las tres cifras en «—» (ADR-0241).
      disabled={!activa && cuenta === 0}
      className={
        sutil
          ? `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo ${
              activa ? "border-taupe bg-hueso text-tinta" : "border-sand text-taupe hover:bg-sand/40 hover:text-tinta"
            }`
          : "pildora-cayla shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo disabled:cursor-default disabled:opacity-40"
      }
    >
      {children}
      {cuenta !== undefined && (
        <span className={`text-[11px] font-medium tabular-nums ${activa ? "text-crema/70" : "text-taupe/80"}`}>{cuenta.toLocaleString("es-PE")}</span>
      )}
      {activa && quitable && <X aria-label="quitar" strokeWidth={1.75} className="-mr-1 h-3.5 w-3.5 opacity-70" />}
    </button>
  );
}

export function FiltrosMovimientos({
  sububicaciones,
  sub,
  periodo,
  periodoPorDefecto = "30",
  hrefExportar,
  desde,
  hasta,
  resumen,
}: {
  /** Las de la ubicación que se mira. Si no tiene ninguna de las tres que se filtran (el Taller), el control no se muestra. */
  sububicaciones: Sububicacion[];
  /** Cuál quedó apretada (ya resuelta por la página: sirve también para un enlace viejo con uuid). */
  sub: TokenSububicacion | null;
  periodo: PeriodoMovimientos;
  /** El que rige sin nada en la URL: «hoy» en el celular, «30» en lo demás (ADR-0241). No cuenta como filtro. */
  periodoPorDefecto?: "hoy" | "30";
  /** La descarga con estos filtros: en el celular va al pie de la hoja de Filtros (en la computadora, en el «⋯»). */
  hrefExportar?: string;
  /** Las fechas que rigen, para los campos de «Personalizado» (con un período rápido, el desde que aplicó la página). */
  desde: string;
  hasta: string;
  /** Las cifras con los demás filtros puestos (no el tipo ni el proceso): la de cada píldora de tipo y de proceso. Null si la
   *  base no las pudo dar: las píldoras van sin cifra. */
  resumen: ResumenTienda | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const primera = useRef(true);
  const { buscando, buscar } = useBusquedaEnUrl();
  const entrada = useRef<HTMLInputElement>(null);
  // Celular (ADR-0241): los filtros viven en una hoja y la cámara lee una etiqueta.
  const [hoja, setHoja] = useState(false);
  const [camara, setCamara] = useState(false);

  const proc = params.get("proc") || null;
  // Un enlace con solo `?proc=conteo` (el de Conteo) aprieta igual «Ajustes»: el tipo se deduce.
  const cat: CategoriaFiltro | null = CATEGORIAS_FILTRO.find((c) => c === params.get("cat")) ?? categoriaDeProceso(proc);
  // «Personalizado» se abre con un toque aunque todavía no haya fechas en la URL.
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(false);
  const enPersonalizado = periodo === "personalizado" || periodo === "todo";
  const mostrarFechas = enPersonalizado || personalizadoAbierto;

  /** `tipeado`: viene del buscador (se escribió): navega sin el loader, con «Buscando…». */
  function aplicar(cambios: Record<string, string>, { tipeado = false } = {}) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    p.delete("mov");
    const qs = p.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (tipeado) buscar(href);
    else router.push(href);
  }

  // La búsqueda se manda sola al dejar de tipear (350 ms): sin botón, pero
  // sin una consulta por tecla. Si lo escrito es el nombre de un proceso, se vuelve su filtro.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      const filtro = filtroDePalabra(busqueda);
      if (filtro) {
        setBusqueda("");
        aplicar({ q: "", cat: filtro.cat ?? "", proc: filtro.proc ?? "" }, { tipeado: true });
        return;
      }
      if ((params.get("q") ?? "") !== busqueda.trim()) aplicar({ q: busqueda.trim() }, { tipeado: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  const subDisponibles = FILTROS_SUBUBICACION.filter((f) => sububicaciones.some((s) => s.tipo === f.tipo));
  const hayFiltros = !!(params.get("q") || cat || sub || proc || periodo !== periodoPorDefecto);
  // Cuántos filtros hay puestos, para el botón «Filtros · n» del celular (la búsqueda se ve sola: no cuenta).
  const cuantosFiltros = [cat, proc, sub, periodo !== periodoPorDefecto].filter(Boolean).length;
  // Los procesos que se ofrecen bajo el tipo elegido: los que tuvieron algo en el período (en su orden), y el elegido
  // aunque esté en cero. Sin cifras (la base no respondió), todos los del tipo.
  const procesosDelTipo = cat
    ? PROCESOS_POR_CATEGORIA[cat].filter((p) => !resumen || p === proc || resumen[cat].procesos.some((x) => x.proceso === p && x.operaciones > 0))
    : [];
  // Un proceso que vive en dos tipos (cambio) llegado sin `?cat=`: no hay fila de procesos que
  // lo muestre, así que se dice en la línea de «Filtrando».
  const procesoSuelto = proc && !(cat && PROCESOS_POR_CATEGORIA[cat].includes(proc));

  // El período por defecto no va en la URL (así el enlace de un celular abierto en la computadora sigue diciendo lo que
  // se ve); cualquier otro, sí.
  function elegirPeriodo(valor: "hoy" | (typeof PERIODOS_RAPIDOS)[number]) {
    setPersonalizadoAbierto(false);
    aplicar({ rango: String(valor) === periodoPorDefecto ? "" : String(valor), desde: "", hasta: "" });
  }
  const PERIODOS: { valor: "hoy" | (typeof PERIODOS_RAPIDOS)[number]; texto: string }[] = [
    { valor: "hoy", texto: "Hoy" },
    ...PERIODOS_RAPIDOS.map((d) => ({ valor: d, texto: `${d} días` })),
  ];
  // El nombre del tipo elegido, como lo dice su botón («Colgadas en piso»); los enlaces viejos (`?cat=entrada`) conservan el suyo.
  const nombreTipo = (c: CategoriaFiltro) => grupoPorId(c)?.nombre ?? FILTROS_TIPO.find((f) => f.valor === c)?.etiqueta ?? c;
  // La fila de procesos solo si hay entre qué elegir (ADR-0241): «Todos · Venta» con solo ventas no filtraba nada.
  const hayProcesos = procesosDelTipo.length >= 2 || (!!proc && procesosDelTipo.length >= 1);

  function limpiar() {
    setBusqueda("");
    setPersonalizadoAbierto(false);
    router.push(pathname);
  }

  function alLeerCodigo(codigo: string) {
    setCamara(false);
    const texto = codigo.trim();
    setBusqueda(texto);
    aplicar({ q: texto });
  }

  const periodos = (
    <div role="group" aria-label="Período" className={FILA_DESLIZA}>
      {PERIODOS.map((p) => (
        <Pastilla key={p.valor} activa={!mostrarFechas && periodo === String(p.valor)} onClick={() => elegirPeriodo(p.valor)}>
          {p.texto}
        </Pastilla>
      ))}
      <Pastilla activa={mostrarFechas} onClick={() => setPersonalizadoAbierto(true)}>
        Personalizado
      </Pastilla>
    </div>
  );

  const fechas = mostrarFechas && (
    <div className="anim-revelar flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-hueso/70 px-4 py-2.5">
      {/* Con un período rápido vigente, «Desde» muestra la fecha que rige aunque no esté en la URL: el
          control dice la verdad. Tocarlo la vuelve explícita. */}
      <div className="w-40 sm:w-44">
        <CampoFecha etiqueta="Desde" valor={periodo === "todo" ? "" : desde} onValor={(v) => aplicar({ desde: v, rango: "" })} />
      </div>
      <div className="w-40 sm:w-44">
        <CampoFecha etiqueta="Hasta" valor={periodo === "todo" ? "" : hasta} onValor={(v) => aplicar({ hasta: v, rango: "" })} />
      </div>
      <button
        type="button"
        onClick={() => aplicar({ rango: "todo", desde: "", hasta: "" })}
        aria-pressed={periodo === "todo"}
        className={`btn-cayla btn-enlace mb-2 text-[12.5px] ${periodo === "todo" ? "font-semibold" : ""}`}
      >
        Todo el historial
      </button>
    </div>
  );

  // Un proceso que vive en dos tipos (cambio) llegado sin `?cat=`: su propia píldora, que se suelta con la ×.
  const procesoSueltoPildora = procesoSuelto && proc && (
    <Pastilla activa quitable onClick={() => aplicar({ proc: "" })}>
      {etiquetaProceso(proc)}
    </Pastilla>
  );

  const zona = subDisponibles.length > 0 && (
    // «Zona»: dónde está la prenda dentro de la tienda. Con rótulo: «Todo · Piso · Almacén · Cuarentena» solos no
    // dicen qué se está eligiendo.
    <div className="flex max-w-full shrink-0 items-center gap-2">
      <span className="label-cayla text-[10px] font-bold text-taupe" aria-hidden>
        Zona
      </span>
      <div role="group" aria-label="Zona de la tienda" className="inline-flex max-w-full shrink-0 gap-0.5 overflow-x-auto rounded-lg bg-hueso p-[3px]">
        {[{ token: null as TokenSububicacion | null, etiqueta: "Todas" }, ...subDisponibles].map((f) => {
          const activa = sub === f.token;
          return (
            <button
              key={f.token ?? "todo"}
              type="button"
              aria-pressed={activa}
              onClick={() => aplicar({ sub: f.token ?? "" })}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo ${
                activa ? "bg-papel text-tinta shadow-[inset_0_0_0_1px_var(--color-sand)]" : "text-taupe hover:text-tinta"
              }`}
            >
              {f.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );

  const procesos = cat && hayProcesos && (
    <div role="group" aria-label={`Proceso dentro de ${nombreTipo(cat)}`} className="anim-revelar flex items-center gap-2 border-l-2 border-sand pl-3">
      <span aria-hidden className="label-cayla shrink-0 text-[10px] font-bold text-taupe">
        Proceso
      </span>
      <div className={`${FILA_DESLIZA} min-w-0 flex-1`}>
        <Pastilla sutil activa={proc === null} onClick={() => aplicar({ proc: "" })}>
          Todos
        </Pastilla>
        {procesosDelTipo.map((p) => (
          <Pastilla key={p} sutil activa={proc === p} onClick={() => aplicar({ cat, proc: p })}>
            {etiquetaProceso(p)}
          </Pastilla>
        ))}
      </div>
    </div>
  );

  return (
    // Sin caja propia: vive arriba de la lista, en la misma tarjeta (la pone la página).
    <div className="border-b border-sand">
      {/* Búsqueda. En el celular queda FIJA arriba al bajar (ADR-0241), con la cámara para leer una etiqueta y el botón
          de los filtros: lo que se hace con el pulgar sin volver a subir. La cabecera del ERP es `fixed` (≈58 px). */}
      <div className="sticky top-[3.625rem] z-20 flex items-center gap-2 bg-papel/95 px-3 pb-2 pt-3 backdrop-blur-sm sm:static sm:z-auto sm:bg-transparent sm:px-4 sm:pb-0 sm:pt-4 sm:backdrop-blur-none">
        {/* El botón de limpiar va AL LADO del campo, no dentro de un <label>: al desaparecer la X el
            foco se perdía; ahora vuelve al campo (mismo criterio que Traslados). */}
        <div className="caja-cayla relative flex h-11 min-w-0 flex-1 items-center sm:h-10">
          <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
          <input
            ref={entrada}
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Prenda, código, barras o referencia…"
            aria-label="Buscar por prenda, código, código de barras o referencia (por ejemplo Traslado 24)"
            autoComplete="off"
            className="h-full w-full rounded-lg bg-transparent pl-9 pr-9 text-base text-tinta outline-none placeholder:text-taupe sm:text-sm"
          />
          <SenalBuscando activo={buscando} className="absolute right-10 bg-hueso pl-2" />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                entrada.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-taupe hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
            >
              <X aria-hidden strokeWidth={1.5} className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCamara(true)}
          aria-label="Escanear una etiqueta"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sand bg-papel text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo sm:hidden"
        >
          <Camera aria-hidden strokeWidth={1.5} className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => setHoja(true)}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-sand bg-papel px-3 text-[13px] font-medium text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo sm:hidden"
        >
          <SlidersHorizontal aria-hidden strokeWidth={1.5} className="h-4 w-4" />
          Filtros
          {cuantosFiltros > 0 && <span className="rounded-full bg-tinta px-1.5 text-[10.5px] tabular-nums text-crema">{cuantosFiltros}</span>}
        </button>
        <div className="hidden sm:block">{periodos}</div>
      </div>

      {/* Celular: lo que más se toca sin abrir la hoja — el período y, si hay, el tipo elegido con su ×. */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-3 [scrollbar-width:none] sm:hidden">
        {PERIODOS.slice(0, 3).map((p) => (
          <Pastilla key={p.valor} activa={!mostrarFechas && periodo === String(p.valor)} onClick={() => elegirPeriodo(p.valor)}>
            {p.texto}
          </Pastilla>
        ))}
        {cat && (
          <Pastilla activa quitable onClick={() => aplicar({ cat: "", proc: "" })}>
            {nombreTipo(cat)}
          </Pastilla>
        )}
      </div>

      {/* Computadora: todo a la vista, como siempre. */}
      <div className="hidden space-y-3 px-4 pb-4 pt-3 sm:block">
        {fechas}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {procesoSueltoPildora}
          {zona}
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="btn-cayla btn-enlace text-xs">
              Limpiar filtros
            </button>
          )}
        </div>
        {procesos}
      </div>

      {hoja && (
        <Modal titulo="Filtros" subtitulo="Se aplican al tocarlos." onClose={() => setHoja(false)} variante="hoja">
          {(cerrar) => (
            <div className="space-y-5">
              <section className="space-y-2">
                <p className="label-cayla text-[10.5px] text-taupe">Período</p>
                <div className="flex flex-wrap gap-1.5 [&>div]:mx-0 [&>div]:flex-wrap [&>div]:px-0">{periodos}</div>
                {fechas}
              </section>
              {(procesos || procesoSueltoPildora) && (
                <section className="space-y-2">
                  <p className="label-cayla text-[10.5px] text-taupe">Qué pasó</p>
                  <div className="[&>div]:mx-0 [&>div]:flex-wrap [&>div]:px-0">{procesoSueltoPildora}</div>
                  {procesos}
                </section>
              )}
              {zona && <section className="space-y-2">{zona}</section>}
              {hrefExportar && (
                <a href={hrefExportar} download className="btn-cayla btn-enlace text-[13px]">
                  Exportar a Excel con estos filtros
                </a>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={limpiar} className="btn-cayla btn-secundario flex-1">
                  Limpiar
                </button>
                <button type="button" onClick={cerrar} className="btn-cayla btn-primario flex-1">
                  Ver movimientos
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {camara && (
        <EscanerBusqueda
          titulo="Escanear prenda"
          pista="Centra la etiqueta de la prenda en el cuadro: verás todo lo que le pasó en esta sede"
          onCodigo={alLeerCodigo}
          onEscribir={() => {
            setCamara(false);
            entrada.current?.focus();
          }}
          onClose={() => setCamara(false)}
        />
      )}
    </div>
  );
}

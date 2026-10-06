"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowRight, ChevronRight, ScanLine, Tag, X } from "lucide-react";
import { BotonAccion, ChipGrupo, CurvaTallas, PUNTO_GRUPO, type PedidoAbierto } from "@/components/AnalisisAcciones";
import { ID_TABLA_ANALISIS } from "@/components/AnalisisQueHacer";
import { DetallePrendaAnalisis } from "@/components/DetallePrendaAnalisis";
import { EscanerBusqueda } from "@/components/EscanerBusqueda";
import { Desplegable } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Encabezado, fila, TABLA } from "@/components/ui/Tabla";
import type { CambiosUrl } from "@/components/useResumenUrl";
import {
  accionPrincipal,
  enlacesDeMarcadas,
  grupoMostrado,
  INFO_GRUPO,
  OPCIONES_ORDEN_PRENDAS,
  ORDEN_INICIAL_PRENDAS,
  type AccesoAnalisis,
  type GrupoQueHacer,
  type PrendaAnalisis,
} from "@/lib/analisis-que-hacer";
import { MAX_VARIANTES_EN_URL } from "@/lib/existencias-prendas";
import { PRENDAS_POR_PAGINA, type DesempenoParaPantalla } from "@/lib/resumen-desempeno";
import { formatoSolesCompacto, formatoVariacion, pluralizar } from "@/lib/resumen-formato";

// La tabla del Análisis por PRENDA (ADR-0245; Felipe eligió «Interruptor»: entra por prenda y «Por talla» queda a un
// toque). Una fila por modelo + color, como Existencias (ADR-0237): la curva de tallas dice qué talla vendió y qué hay hoy,
// y la última columna dice qué hacer, con el botón que lleva a la pantalla que lo hace. En el celular, tarjetas con el
// botón a la vista y «Escanear prenda» fijo abajo (el mismo lector de Existencias y Cambios). Marcar varias abre la barra
// de abajo con Bajar al piso, Trasladar y Etiquetas (una unidad por talla: la persona pone la cantidad, ADR-0231).

const PLANTILLA = "grid-cols-[1.5rem_minmax(12rem,1.1fr)_minmax(13rem,1.2fr)_5.5rem_6rem_6.5rem_6.5rem_minmax(11rem,0.9fr)]";

const TONO_TEND = { alza: "text-verde-profundo", estable: "text-tinta/70", baja: "text-ambar-profundo" } as const;
const FLECHA = { alza: "↑", estable: "→", baja: "↓" } as const;

function Tendencia({ prenda }: { prenda: PrendaAnalisis }) {
  const t = prenda.tendencia;
  if (!t) return <span className="text-tinta/35">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${TONO_TEND[t.direccion]}`} title="Ventas por día de la 2.ª mitad del período frente a la 1.ª">
      <span aria-hidden>{FLECHA[t.direccion]}</span>
      {formatoVariacion(t.variacionPct)}
    </span>
  );
}

function SinVenta({ prenda }: { prenda: PrendaAnalisis }) {
  const d = prenda.sinVentaDias;
  if (d === null) return <span className="text-tinta/35">—</span>;
  if (d < 1) return <span className="text-tinta/50">vendió hoy</span>;
  const n = Math.round(d);
  return <span className={n >= 14 ? "font-semibold text-ambar-profundo" : ""}>{pluralizar(n, "día", "días")}</span>;
}

/** La barra de filtros de la tabla: los grupos de «Qué hacer» en píldoras, el interruptor prenda/talla y (en prenda) el orden. */
export function BarraTablaAnalisis({ datos, actualizar, orden }: { datos: DesempenoParaPantalla; actualizar: (c: CambiosUrl) => void; orden?: ReactNode }) {
  const { grupos } = datos.cifrasAccion;
  const pildoras: { g: GrupoQueHacer | null; texto: string; n: number }[] = [
    { g: null, texto: "Todas", n: datos.ver === "prenda" ? datos.prendas.totalAlcance : datos.tabla.totalAlcance },
    { g: "agotada", texto: "Se agotaron", n: grupos.agotada },
    { g: "duerme", texto: "Duermen", n: grupos.duerme },
    { g: "estancada", texto: "Estancadas", n: grupos.estancada },
    { g: "top", texto: "Más venden", n: grupos.top },
    { g: "sinbase", texto: "Sin base", n: grupos.sinbase },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 sm:px-5">
      {/* Grupos = filtro de un valor (deja menos prendas): la píldora del sistema, con su conteo del color del texto (ADR-0354). */}
      <div className="pildoras-desliza gap-1.5">
        {pildoras.map((p) => (
          <button key={p.g ?? "todas"} type="button" aria-pressed={datos.grupo === p.g} onClick={() => actualizar({ grupo: p.g })} className="pildora-cayla shrink-0">
            {p.g && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${PUNTO_GRUPO[p.g]}`} />}
            {p.texto}
            <span className="pildora-cayla__n">{p.n}</span>
          </button>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* «Cómo listar» muestra las mismas prendas de otra forma: el segmento de modo (ADR-0354). */}
        <SegmentoDeslizante
          forma="modo"
          etiqueta="Cómo listar"
          valor={datos.ver}
          onCambio={(v) => datos.ver !== v && actualizar({ ver: v === "prenda" ? null : "talla", orden: null })}
          opciones={[
            { clave: "prenda", etiqueta: "Por prenda" },
            { clave: "talla", etiqueta: "Por talla" },
          ]}
        />
        {orden}
      </div>
    </div>
  );
}

function Casilla({ marcada, onAlternar, etiqueta }: { marcada: boolean; onAlternar: () => void; etiqueta: string }) {
  return (
    <input
      type="checkbox"
      checked={marcada}
      onChange={onAlternar}
      // La fila entera abre el detalle: la casilla no debe abrirlo también.
      onClick={(e) => e.stopPropagation()}
      aria-label={`Marcar ${etiqueta}`}
      className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-tinta"
    />
  );
}

export function AnalisisPrendas({
  datos,
  acceso,
  actualizar,
  onPedir,
}: {
  datos: DesempenoParaPantalla;
  acceso: AccesoAnalisis;
  actualizar: (cambios: CambiosUrl, opciones?: { conservarPagina?: boolean }) => void;
  onPedir: (a: PedidoAbierto) => void;
}) {
  const { prendas, red, grupo, periodo } = datos;
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());
  const [abierta, setAbiertaClave] = useState<string | null>(null);
  // La talla que tocó en la curva: el detalle la resalta. Clic en el resto de la fila = null (sin talla).
  const [tallaAbierta, setTallaAbierta] = useState<string | null>(null);
  const abrir = (clave: string, varianteId: string | null = null) => {
    setTallaAbierta(varianteId);
    setAbiertaClave(clave);
  };
  const [camara, setCamara] = useState(false);

  // Solo cuenta lo marcado que se ve en esta página: una prenda marcada que otro filtro u otra página escondió no se lleva
  // a ningún lado sin verse.
  const marcadasVisibles = prendas.filas.filter((p) => marcadas.has(p.clave));

  // Tras escanear, si la búsqueda deja una sola prenda, su detalle se abre solo (en el piso, «¿esta se vende?» es una
  // lectura). Se deriva de la URL ya respondida, sin efectos: mientras el servidor no contesta, `q` todavía no es el código.
  const [escaneado, setEscaneado] = useState<string | null>(null);
  const abiertaPorEscaneo = escaneado !== null && datos.alcance.q === escaneado && prendas.filas.length === 1 ? prendas.filas[0]!.clave : null;
  const abiertaAhora = abierta ?? abiertaPorEscaneo;

  const alternar = (k: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const todasMarcadas = prendas.filas.length > 0 && prendas.filas.every((p) => marcadas.has(p.clave));
  const enlaces = enlacesDeMarcadas(marcadasVisibles, acceso);
  const detalle = abiertaAhora ? (prendas.filas.find((p) => p.clave === abiertaAhora) ?? null) : null;

  const irA = (pag: number) => {
    actualizar({ pag: pag <= 1 ? null : String(pag) }, { conservarPagina: true });
    const t = document.getElementById(ID_TABLA_ANALISIS);
    if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: "start" });
  };

  const orden = (
    <label className="flex items-center gap-2">
      <span className="label-cayla hidden text-[10px] text-tinta/60 sm:inline">Ordenar</span>
      <span className="w-48">
        <Desplegable
          valor={datos.ordenPrendas}
          onValor={(v) => actualizar({ orden: v === ORDEN_INICIAL_PRENDAS ? null : v })}
          opciones={OPCIONES_ORDEN_PRENDAS}
          etiquetaAccesible="Ordenar prendas"
        />
      </span>
    </label>
  );

  return (
    <section id={ID_TABLA_ANALISIS} className="card-cayla scroll-mt-24" aria-labelledby="analisis-tabla-titulo">
      <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <h2 id="analisis-tabla-titulo" className="font-display text-[1.35rem] leading-tight text-tinta">
          {grupo ? INFO_GRUPO[grupo].titulo : "Todas las prendas"}
        </h2>
        <p className="mt-0.5 text-xs text-tinta/65">
          {grupo ? `${INFO_GRUPO[grupo].que}. Cada prenda trae su botón.` : "Cómo se vendió cada prenda en el período y qué conviene hacer con ella."}
        </p>
      </div>
      <BarraTablaAnalisis datos={datos} actualizar={actualizar} orden={orden} />

      {prendas.total === 0 ? (
        <div className={`border-t border-sand ${TABLA.vacio}`}>
          <p>{grupo ? `Ninguna prenda en «${INFO_GRUPO[grupo].titulo}» con estos filtros.` : "Ninguna prenda coincide con estos filtros."}</p>
          {(grupo || datos.alcance.q || datos.alcance.categoriaId) && (
            <button type="button" onClick={() => actualizar({ grupo: null, q: null, cat: null })} className="btn-cayla btn-secundario mt-3">
              Ver todas
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Computadora: la tabla. */}
          <div className="hidden overflow-x-auto border-t border-sand md:block">
            <div role="table" aria-label="Prendas del período" className="min-w-[66rem] divide-y divide-sand">
              <Encabezado
                siempre
                plantilla={PLANTILLA}
                columnas={[
                  { titulo: "" },
                  { titulo: "Prenda" },
                  { titulo: "Tallas", subtitulo: "vendidas · hoy piso · almacén" },
                  { titulo: "Vendido", subtitulo: `en ${periodo.dias} d`, alinear: "centro" },
                  { titulo: "Vendió de", subtitulo: "lo colgado", alinear: "centro", ayuda: "Sell-through de exposición: de lo colgado al menos 7 días, cuánto se vendió" },
                  { titulo: "Sin venta", subtitulo: "colgada", alinear: "centro", ayuda: "Días expuesta en piso desde su última venta (el tiempo en almacén no cuenta)" },
                  { titulo: "Tendencia", subtitulo: "2.ª vs 1.ª mitad", alinear: "centro" },
                  { titulo: "Qué hacer" },
                ]}
              />
              <div role="rowgroup" className="divide-y divide-sand">
                {prendas.filas.map((p) => {
                  const g = grupoMostrado(p, grupo);
                  const accion = accionPrincipal(p, g, red, acceso);
                  return (
                    <div
                      key={p.clave}
                      role="row"
                      tabIndex={0}
                      onClick={() => abrir(p.clave)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          abrir(p.clave);
                        }
                      }}
                      className={`${fila(PLANTILLA, "cursor-pointer items-center sm:items-center")} ${marcadas.has(p.clave) ? "bg-hueso" : ""}`}
                    >
                      <span role="cell">
                        <Casilla marcada={marcadas.has(p.clave)} onAlternar={() => alternar(p.clave)} etiqueta={`${p.referencia} ${p.color ?? ""}`} />
                      </span>
                      <span role="cell" className="flex min-w-0 items-center gap-2.5">
                        <MiniaturaPrenda fotoUrl={null} colorHex={p.colorHex} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-tinta">{p.referencia}</span>
                          <span className="block truncate text-xs text-taupe">{p.color ?? "Sin color"}</span>
                        </span>
                      </span>
                      <span role="cell" className="min-w-0">
                        <CurvaTallas prenda={p} onAbrirTalla={(varianteId) => abrir(p.clave, varianteId)} />
                      </span>
                      <span role="cell" className="text-center tabular-nums">
                        <span className={`block text-sm font-semibold ${p.vendidas === 0 ? "text-tinta/40" : "text-tinta"}`}>{p.vendidas}</span>
                        <span className="block text-[11px] text-taupe">{formatoSolesCompacto(p.importe)}</span>
                      </span>
                      <span role="cell" className="text-center text-sm tabular-nums">
                        {p.colgado.pct === null ? <span className="text-xs text-tinta/45">aún no</span> : `${Math.round(p.colgado.pct)}%`}
                      </span>
                      <span role="cell" className="text-center text-sm">
                        <SinVenta prenda={p} />
                      </span>
                      <span role="cell" className="text-center text-sm">
                        <Tendencia prenda={p} />
                      </span>
                      <span role="cell" className="flex min-w-0 flex-col items-start gap-1.5">
                        <ChipGrupo grupo={g} />
                        {accion ? <BotonAccion accion={accion} onPedir={onPedir} /> : g === "sinbase" ? <span className="text-xs text-taupe">Esperar</span> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Celular: tarjetas con el botón a la vista. */}
          <ul className="space-y-2 border-t border-sand p-3 md:hidden">
            {prendas.filas.map((p) => {
              const g = grupoMostrado(p, grupo);
              const accion = accionPrincipal(p, g, red, acceso);
              const lectura = p.tallas.find((t) => t.grupo === g)?.lectura ?? p.lectura;
              return (
                <li key={p.clave}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(p.clave)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        abrir(p.clave);
                      }
                    }}
                    className={`rounded-xl border bg-papel p-3 ${marcadas.has(p.clave) ? "border-tinta ring-1 ring-inset ring-tinta" : "border-sand"}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <MiniaturaPrenda fotoUrl={null} colorHex={p.colorHex} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-tinta">{p.referencia}</p>
                        <p className="truncate text-xs text-taupe">{p.color ?? "Sin color"}</p>
                      </div>
                      <ChipGrupo grupo={g} />
                    </div>
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-taupe">
                      <span>
                        Vendió <b className="font-semibold text-tinta">{p.vendidas}</b>
                      </span>
                      {p.colgado.pct !== null && (
                        <span>
                          <b className="font-semibold text-tinta">{Math.round(p.colgado.pct)}%</b> de lo colgado
                        </span>
                      )}
                      {p.sinVentaDias !== null && p.sinVentaDias >= 14 && (
                        <span className="text-ambar-profundo">
                          <b className="font-semibold">{Math.round(p.sinVentaDias)} d</b> sin venta
                        </span>
                      )}
                      <Tendencia prenda={p} />
                    </p>
                    <div className="mt-2">
                      <CurvaTallas prenda={p} onAbrirTalla={(varianteId) => abrir(p.clave, varianteId)} />
                    </div>
                    {lectura && g !== "otras" && <p className="mt-2 text-xs leading-snug text-tinta/70">{lectura.texto}</p>}
                    <div className="mt-2.5 flex items-center gap-2">
                      {accion ? <BotonAccion accion={accion} forma="tarjeta" onPedir={onPedir} /> : <span className="text-xs text-taupe">Ver detalle</span>}
                      <ChevronRight aria-hidden className="ml-auto h-4 w-4 text-taupe" />
                      <Casilla marcada={marcadas.has(p.clave)} onAlternar={() => alternar(p.clave)} etiqueta={`${p.referencia} ${p.color ?? ""}`} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-sand ${TABLA.pie}`}>
            <p className="flex items-center gap-3">
              <span>
                {prendas.paginas > 1
                  ? `Mostrando ${(prendas.pagina - 1) * PRENDAS_POR_PAGINA + 1}–${(prendas.pagina - 1) * PRENDAS_POR_PAGINA + prendas.filas.length} de ${prendas.total} prendas`
                  : pluralizar(prendas.total, "prenda", "prendas")}
              </span>
              <button
                type="button"
                onClick={() => setMarcadas(todasMarcadas ? new Set() : new Set(prendas.filas.map((p) => p.clave)))}
                className="font-semibold text-tinta underline-offset-2 hover:underline"
              >
                {todasMarcadas ? "Desmarcar" : "Marcar las de esta página"}
              </button>
            </p>
            {prendas.paginas > 1 && (
              <nav aria-label="Paginación de prendas" className="flex items-center gap-2">
                <button type="button" disabled={prendas.pagina <= 1} onClick={() => irA(prendas.pagina - 1)} className="btn-cayla btn-secundario px-3 py-1.5 text-xs">
                  Anterior
                </button>
                <span className="tabular-nums">
                  {prendas.pagina} / {prendas.paginas}
                </span>
                <button type="button" disabled={prendas.pagina >= prendas.paginas} onClick={() => irA(prendas.pagina + 1)} className="btn-cayla btn-secundario px-3 py-1.5 text-xs">
                  Siguiente
                </button>
              </nav>
            )}
          </div>
        </>
      )}

      {detalle && (
        <DetallePrendaAnalisis
          prenda={detalle}
          tallaResaltada={tallaAbierta}
          grupo={grupoMostrado(detalle, grupo)}
          red={red}
          acceso={acceso}
          dias={periodo.dias}
          onPedir={onPedir}
          onClose={() => {
            setAbiertaClave(null);
            setTallaAbierta(null);
            setEscaneado(null);
          }}
        />
      )}

      {camara && (
        <EscanerBusqueda
          titulo="¿Esta prenda se vende?"
          pista="Centra la etiqueta de la prenda en el cuadro"
          onCodigo={(codigo) => {
            setCamara(false);
            setEscaneado(codigo);
            actualizar({ q: codigo, grupo: null, ver: null });
          }}
          onEscribir={() => {
            setCamara(false);
            document.querySelector<HTMLInputElement>("[data-buscador-analisis] input")?.focus();
          }}
          onClose={() => setCamara(false)}
        />
      )}

      {/* Varias a la vez: lo marcado llega a la otra pantalla con la lista cargada (como Existencias, ADR-0237). */}
      {marcadasVisibles.length > 0 && (
        <div
          role="region"
          aria-label="Prendas marcadas"
          className="anim-revelar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 rounded-2xl bg-tinta p-2 text-crema shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-max sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2"
        >
          <div className="flex flex-wrap items-center gap-1">
            <span className="flex-1 px-3 py-1.5 text-sm sm:flex-none">
              <b className="font-semibold tabular-nums">{marcadasVisibles.length}</b> {marcadasVisibles.length === 1 ? "prenda" : "prendas"}
              <span className="text-crema/60 dark:text-crema/75"> · {pluralizar(enlaces.tallas, "talla", "tallas")}</span>
            </span>
            {enlaces.tallas > MAX_VARIANTES_EN_URL && (
              <span role="status" className="order-last w-full px-3 pb-1 text-xs text-crema/80 sm:order-none sm:w-auto">
                Se llevan hasta {MAX_VARIANTES_EN_URL} tallas de una vez. Desmarca algunas.
              </span>
            )}
            <span className="order-last grid w-full grid-cols-3 gap-1 sm:order-none sm:flex sm:w-auto">
              {enlaces.bajar && (
                <Link href={enlaces.bajar} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <ArrowDownToLine aria-hidden className="h-4 w-4" />
                  Bajar al piso
                </Link>
              )}
              {enlaces.trasladar && (
                <Link href={enlaces.trasladar} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <ArrowRight aria-hidden className="h-4 w-4" />
                  Trasladar
                </Link>
              )}
              {enlaces.etiquetas && (
                <Link href={enlaces.etiquetas} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs hover:bg-crema/10 sm:flex-row sm:text-sm">
                  <Tag aria-hidden className="h-4 w-4" />
                  Etiquetas
                </Link>
              )}
            </span>
            <button
              type="button"
              onClick={() => setMarcadas(new Set())}
              aria-label="Quitar las marcas"
              className="grid h-9 w-9 place-items-center rounded-xl text-crema/70 hover:bg-crema/10 hover:text-crema"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Celular: «¿esta prenda se vende?» a un toque, fijo al alcance del pulgar (ADR-0206: acción de esta pantalla, no
          navegación). Con prendas marcadas, su lugar lo toma la barra. */}
      {marcadasVisibles.length === 0 && !camara && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 sm:hidden">
          <button
            type="button"
            onClick={() => setCamara(true)}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema active:scale-[0.99]"
          >
            <ScanLine size={19} aria-hidden />
            Escanear prenda
          </button>
        </div>
      )}
    </section>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { ChartColumn, ChevronRight, SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Desplegable } from "@/components/ui/campos";
import { DetalleCategoriaResultados } from "@/components/plan-compra/DetalleCategoriaResultados";
import { Aviso } from "@/components/ui/Aviso";
import { Ayuda } from "@/components/Ayuda";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Tabla, celda } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { PestanasPlan } from "@/components/plan-compra/PestanasPlan";
import { SelectorCampana } from "@/components/plan-compra/SelectorCampana";
import { enteroES, fechaCortaES, solesES, type CampanasLeidas } from "@/lib/plan-compra-reglas";
import {
  cierre,
  coloresQueMasVendieron,
  comoVa,
  diasMedidos,
  filtrarYOrdenarCategorias,
  leerResultados,
  momentoDeResultados,
  multiplicadorReal,
  pesosDeLosDias,
  porCategoria,
  porFamilia,
  prendasQueMasVendieron,
  recuperoRealTotal,
  senales,
  ORDENES_RESULTADOS,
  type Enfoque,
  type FilaCategoria,
  type OrdenResultados,
} from "@/lib/plan-compra-resultados";
import { leerPropuesta } from "@/lib/plan-compra-propuesta";
import { porcentajes, tiendasParaRepartir } from "@/lib/plan-compra-reparto";
import { leerHistorial, textoMultiplicador } from "@/lib/plan-compra-historial";
import { TarjetaComoVa } from "@/components/plan-compra/ComoVaCampana";
import { CierreCampana } from "@/components/plan-compra/CierreCampana";

// Plan de campaña ▸ Resultados (ADR-0372, C6 · Felipe 2026-10-12): lo que se vendió de verdad en una campaña, por tienda, familia, categoría,
// prenda y color; el multiplicador real de cada tienda; qué se agotó; y a qué % se vendió lo que sobró. Solo lee. Las píldoras de tienda
// filtran todo lo de abajo; la comparación contra el plan solo se hace con todas las tiendas (el plan es de toda CAYLA).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]";
// Durante la campaña «Lo que sobró» siempre diría «Al terminar»: en su lugar van «Qué hacer» y «Alcanza para» (R2 del spike, Felipe 2026-10-12).
const PLANTILLA_EN_CURSO = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.55fr)_minmax(0,0.75fr)_minmax(0,1.4fr)_minmax(0,0.75fr)_minmax(0,0.7fr)]";

/** «Alcanza para» de una categoría: días al ritmo de esta campaña; «toda la campaña» si pasa de 60; «—» sin ventas. */
const textoAlcanza = (d: number | null) => (d === null ? "—" : d >= 60 ? "toda la campaña" : `${Math.round(d)} ${Math.round(d) === 1 ? "día" : "días"}`);

export function ResultadosCampana({
  datos,
  campanas,
  falla,
  anterior = null,
  propuesta = null,
  veAnalisis = false,
}: {
  datos: unknown;
  campanas: CampanasLeidas | null;
  falla: string | null;
  /** La misma campaña un año antes (`fn_historial_ventas`, crudo): la forma de los días para «¿Cómo va?». */
  anterior?: unknown;
  /** La propuesta del Plan (`fn_plan_compra_propuesta`, crudo): lo vendido por categoría en la misma campaña el año anterior. */
  propuesta?: unknown;
  /** Quien ve Análisis recibe los accesos a la prenda exacta (Se está acabando, No se vende). */
  veAnalisis?: boolean;
}) {
  const r = useMemo(() => leerResultados(datos), [datos]);
  // La forma de cada día de la campaña: los soles por día de la misma campaña el año pasado (todas las tiendas); sin historia, parejos.
  const pesos = useMemo(() => {
    if (!r) return { pesos: [] as number[], conForma: false };
    const h = leerHistorial(anterior);
    const porDia = new Map<string, number>();
    for (const dias of h?.dias.values() ?? []) for (const [f, s] of dias) porDia.set(f, (porDia.get(f) ?? 0) + s);
    const p = pesosDeLosDias(r.plan.desde, r.plan.hasta, porDia.size > 0 ? porDia : null);
    return { pesos: p, conForma: new Set(p).size > 1 };
  }, [r, anterior]);
  const [tienda, setTienda] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<FilaCategoria | null>(null);
  const [q, setQ] = useState("");
  const [soloAtencion, setSoloAtencion] = useState(false);
  const tablaRef = useRef<HTMLDivElement>(null);
  const [orden, setOrden] = useState<OrdenResultados>("mas");
  const lecturaPropuesta = useMemo(() => leerPropuesta(propuesta), [propuesta]);
  // El «!» con lo que la frase no alcanza a decir, como en Productos y en el Historial (Felipe 2026-10-12).
  const ayuda = (
    <Ayuda titulo="Resultados">
      <span className="block">
        «×2.0 un día normal» quiere decir que la tienda vendió, por día, el doble de prendas que en los 60 días anteriores a la campaña. El año que
        viene, la propuesta del Plan usa ese número en vez de × 3.
      </span>
      <span className="mt-2 block">
        «Se agotó» es una categoría que quedó en cero en esa tienda antes de terminar: lo vendido ahí quedó corto por falta de stock, y la propuesta
        del año que viene no lo promedia.
      </span>
      <span className="mt-2 block">
        «Sin base» es una tienda que no vendía en el ERP los 60 días antes de la campaña: no hay un día normal con qué compararla. Toca una tienda
        para ver solo lo suyo; «Toda CAYLA» vuelve a todas.
      </span>
      <span className="mt-2 block">
        Mientras dura la campaña, «Qué hacer» dice «Pide más» si lo que queda se acaba antes del fin y no va por debajo del plan, e «Impúlsala» si
        va 20 % o más por debajo del plan y le sobra. «Alcanza para» son los días que dura lo que queda, al ritmo de esta campaña. «Piden atención»
        deja solo esas.
      </span>
      <span className="mt-2 block">«Lo que sobró» es lo vendido de esa categoría en los 60 días después de la campaña, contra su precio de etiqueta.</span>
    </Ayuda>
  );
  const cabecera = (subtitulo: string) => (
    <EncabezadoPagina
      sede="Todas las tiendas"
      titulo={
        <>
          Plan de campaña
          {/* En el celular la frase se esconde y el «!» sube junto al título, como en Productos. */}
          <span className="ml-2.5 inline-block align-middle font-sans text-[15px] leading-normal tracking-normal sm:hidden">{ayuda}</span>
        </>
      }
      subtitulo={
        <>
          <span className="max-sm:hidden">{subtitulo} </span>
          <span className="max-sm:hidden">{ayuda}</span>
        </>
      }
      acciones={r && campanas ? <SelectorCampana campanas={campanas} actualId={r.plan.id} hoy={r.hoy} ruta="/compras/plan/resultados" puedeCrear={false} onNueva={() => {}} onEditar={() => {}} onArchivadas={() => {}} /> : undefined}
    />
  );

  if (!r) {
    return (
      <div className="space-y-6">
        {cabecera("Lo que se vendió de verdad en una campaña: por tienda, prenda y color.")}
        <PestanasPlan activa="resultados" />
        {falla ? (
          <Aviso tono="error">{falla}.</Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio icono={<ChartColumn />} titulo="Todavía no hay campañas">
              Cuando un líder cree una campaña en la pestaña Plan, aquí ves lo que se vendió en ella.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  const momento = momentoDeResultados(r);
  const rango = `del ${fechaCortaES(r.plan.desde)} al ${fechaCortaES(r.plan.hasta)}`;
  if (momento === "por-venir") {
    return (
      <div className="space-y-6">
        {cabecera(`${r.plan.nombre}, ${rango}.`)}
        <PestanasPlan activa="resultados" planId={r.plan.id} />
        <div className="card-cayla">
          <Vacio icono={<ChartColumn />} titulo="Esta campaña todavía no empieza">
            Empieza el {fechaCortaES(r.plan.desde)}. Desde el día siguiente, aquí ves lo que se va vendiendo, tienda por tienda.
          </Vacio>
        </div>
      </div>
    );
  }

  // Con una tienda elegida, «¿Cómo va?» y «Pedir más» son de ELLA (Felipe 2026-10-12): sus ventas, su stock y su parte del plan, que sale de la
  // misma regla del reparto del Plan. «Toda CAYLA» sigue siendo el total.
  const tiendaElegida = tienda ? (r.tiendas.find((t) => t.id === tienda) ?? null) : null;
  const propuestaDeEsta = lecturaPropuesta && lecturaPropuesta.planId === r.plan.id && lecturaPropuesta.tiendasActivas.length > 0 ? lecturaPropuesta : null;
  const enfoque: Enfoque | null = tiendaElegida
    ? { tienda: tiendaElegida.id, parte: propuestaDeEsta ? (c: string) => porcentajes(tiendasParaRepartir(propuestaDeEsta, c)).get(tiendaElegida.id)?.pct ?? 0 : null }
    : null;
  const todasLasCategorias = porCategoria(r, tienda, enfoque?.parte ?? null);
  const familias = porFamilia(r, tienda);
  const prendas = prendasQueMasVendieron(r, tienda);
  const colores = coloresQueMasVendieron(r, tienda);
  const recupero = recuperoRealTotal(r);
  const dias = diasMedidos(r);
  const total = r.tiendas.reduce((s, t) => ({ unidades: s.unidades + t.unidades, soles: s.soles + t.soles }), { unidades: 0, soles: 0 });
  const conMultiplicador = r.tiendas.map((t) => ({ t, m: multiplicadorReal(r, t) })).filter((x) => x.m !== null);
  const datosCierre = cierre(r);
  const enCurso =
    momento === "en-curso"
      ? {
          como: comoVa(r, pesos.pesos, enfoque),
          piden: senales(r, pesos.pesos, enfoque).filter((s) => s.senal !== "bien"),
          faltan: pesos.pesos.length - Math.min(pesos.pesos.length, dias),
        }
      : null;
  // «Pedir más o impulsar» dentro de la tabla: cada categoría con su señal, y la píldora que deja solo las que piden atención.
  const senalDe = new Map((enCurso?.piden ?? []).map((s) => [s.id, s]));
  const filtrando = soloAtencion && senalDe.size > 0;
  const categorias = filtrarYOrdenarCategorias(todasLasCategorias, q, orden, filtrando ? new Set(senalDe.keys()) : null);
  const plantilla = enCurso ? PLANTILLA_EN_CURSO : PLANTILLA;
  const verLasQuePiden = () => {
    setSoloAtencion(true);
    tablaRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className="space-y-6">
      {cabecera(
        momento === "en-curso"
          ? `${r.plan.nombre}, ${rango}: lo vendido hasta ayer (${dias} ${dias === 1 ? "día" : "días"}).`
          : `${r.plan.nombre}, ${rango}: lo que se vendió de verdad, tienda por tienda.`,
      )}
      <PestanasPlan activa="resultados" planId={r.plan.id} />

      {/* Al terminar, el cierre arriba (Felipe 2026-10-12). Durante, «¿cómo va?» es la primera tarjeta de cifras y lo que pide más o pide
          impulso va DENTRO de la tabla de categorías (columna «Qué hacer» y la píldora «Piden atención»). */}
      {momento === "terminada" && datosCierre && <CierreCampana c={datosCierre} veAnalisis={veAnalisis} />}

      {/* Una sola fila (Felipe 2026-10-12: «ocupa mucho espacio»): las tarjetas de tienda SON el filtro —la que filtra se rellena de arena,
          «Toda CAYLA» vuelve a todas—, así que las píldoras que repetían lo mismo se fueron. En un celular, de a dos. */}
      <div data-guia="plan-resultados.cifras" className="grid gap-3 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
        {enCurso && <TarjetaComoVa c={enCurso.como} conForma={pesos.conForma} piden={enCurso.piden.length} de={tiendaElegida?.nombre ?? null} onPiden={verLasQuePiden} />}
        <TarjetaCifra
          etiqueta="Toda CAYLA"
          valor={enteroES.format(total.unidades)}
          unidad="prendas"
          activa={r.tiendas.length > 1 ? tienda === null : undefined}
          onClick={r.tiendas.length > 1 ? () => setTienda(null) : undefined}
        >
          {solesES(total.soles)}
          {momento === "en-curso" ? " · hasta ayer" : ""}
        </TarjetaCifra>
        {r.tiendas.map((t) => {
          const m = multiplicadorReal(r, t);
          return (
            <TarjetaCifra key={t.id} etiqueta={t.nombre} valor={enteroES.format(t.unidades)} unidad="prendas" activa={tienda === t.id} onClick={() => setTienda(tienda === t.id ? null : t.id)}>
              {solesES(t.soles)} · {m !== null ? `${textoMultiplicador(m)} un día normal` : "sin base"}
            </TarjetaCifra>
          );
        })}
      </div>

      <div ref={tablaRef} className="scroll-mt-4">
      <Tabla guia="plan-resultados.tabla">
        {/* Buscar y ordenar (Felipe 2026-10-12): como en el Historial, en la misma tarjeta que la tabla. «Más vendidas» es el de siempre. */}
        <div data-guia="plan-resultados.buscar" className="flex flex-wrap items-center gap-3 px-5 py-3">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar una categoría o familia" etiqueta="Buscar una categoría o familia" atajo conteo={q ? `${categorias.length} de ${todasLasCategorias.length}` : undefined} className="min-w-0 flex-1 sm:max-w-sm" />
          {senalDe.size > 0 && (
            <div role="group" aria-label="Mostrar" data-guia="plan-resultados.atencion" className="flex flex-wrap gap-2">
              <button type="button" className="pildora-cayla" aria-pressed={!filtrando} onClick={() => setSoloAtencion(false)}>
                Todas <span className="tabular-nums opacity-70">{todasLasCategorias.length}</span>
              </button>
              <button type="button" className="pildora-cayla" aria-pressed={filtrando} onClick={() => setSoloAtencion(true)}>
                Piden atención <span className="tabular-nums opacity-70">{senalDe.size}</span>
              </button>
            </div>
          )}
          <Desplegable valor={orden} onValor={(v) => setOrden(v as OrdenResultados)} opciones={ORDENES_RESULTADOS} forma="cajaBaja" etiquetaAccesible="Ordenar por" className="ml-auto w-56" />
        </div>
        <div className={`encabezado-tabla-cayla hidden gap-x-6 px-5 py-2 sm:grid ${plantilla}`} role="row">
          {/* Cada título se alinea como su columna (Tabla, «celda»): las cifras y su título a la derecha, el texto a la izquierda. */}
          {(
            [
              ["Categoría", "izq"],
              ["Vendidas", "der"],
              ["Soles", "der"],
              [tienda === null ? "Contra el plan" : enfoque?.parte ? "Contra su parte del plan" : "Contra el plan (todas las tiendas)", "izq"],
              ...(enCurso ? ([["Qué hacer", "izq"], ["Alcanza para", "der"]] as const) : ([["Lo que sobró", "der"]] as const)),
            ] as const
          ).map(([t, alinear]) => (
            <span key={t} className={`text-xs font-normal text-taupe ${alinear === "der" ? "text-right" : ""}`} role="columnheader">
              {t}
            </span>
          ))}
        </div>
        {todasLasCategorias.length === 0 ? (
          <Vacio tamano="chico" icono={<ChartColumn />} titulo="Sin ventas todavía">
            En estas fechas no se vendió ninguna categoría{tienda ? " en esta tienda" : ""}.
          </Vacio>
        ) : categorias.length === 0 ? (
          <Vacio tamano="chico" icono={<SearchX />} titulo={`Ninguna categoría se llama «${q.trim()}»`} acciones={<button type="button" className="btn-cayla btn-enlace" onClick={() => setQ("")}>Borrar la búsqueda</button>}>
            Prueba con otra palabra o borra la búsqueda.
          </Vacio>
        ) : (
          categorias.map((c) => (
            // Toda la fila abre su detalle: contra lo esperado, contra la campaña pasada y qué prendas y colores se vendieron. También una
            // categoría que todavía no vende: su detalle dice cuánto se esperaba (Felipe 2026-10-12).
            <button
              key={c.id}
              type="button"
              onClick={() => setAbierta(c)}
              data-guia="plan-resultados.fila"
              aria-label={`Ver el detalle de ${c.nombre}`}
              className={`fila-cayla grid w-full cursor-pointer gap-x-6 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-hueso sm:items-baseline ${plantilla}`}
            >
              <span className={celda("izq")}>
                <span className="flex items-center gap-1.5 font-semibold text-tinta">
                  {c.nombre}
                  <ChevronRight aria-hidden className="h-4 w-4 text-taupe" />
                </span>
                <span className="block text-xs text-taupe">{c.familia}</span>
              </span>
              <span className={celda("der", "text-tinta")}>{enteroES.format(c.unidades)}</span>
              <span className={celda("der", "text-tinta/80")}>{solesES(c.soles)}</span>
              <span className="min-w-0 text-sm text-tinta/80">
                {c.lectura ?? (c.plan ? "—" : "Sin plan")}
                {c.agotadaEn.length > 0 && (
                  <span className="mt-1 block">
                    <Chip tono="ambar">Se agotó en {c.agotadaEn.join(" y ")}</Chip>
                  </span>
                )}
              </span>
              {enCurso ? (
                <>
                  <span className="min-w-0">
                    {senalDe.get(c.id)?.senal === "pedir" ? <Chip tono="rojo">Pide más</Chip> : senalDe.get(c.id)?.senal === "impulsar" ? <Chip tono="ambar">Impúlsala</Chip> : c.unidades > 0 ? <span className="text-sm text-tinta/60">Va bien</span> : <span className="text-sm text-tinta/60">—</span>}
                  </span>
                  <span className={celda("der", "text-sm text-tinta/80")}>{textoAlcanza(senalDe.get(c.id)?.alcanzaDias ?? null)}</span>
                </>
              ) : (
                <span className={celda("der", "text-sm text-tinta/80")} title={c.plan ? `Planificaste ${c.plan.recuperoPct} %` : undefined}>
                  {c.recuperoReal !== null ? `${c.recuperoReal} % del precio` : "—"}
                </span>
              )}
            </button>
          ))
        )}
        {filtrando && categorias.length > 0 && (
          <p className="px-5 py-3 text-xs text-taupe">
            Quedan {enCurso?.faltan ?? 0} {enCurso?.faltan === 1 ? "día" : "días"} de campaña. Toca una para ver sus prendas y, si ves Análisis, ir a las que se acaban.
          </p>
        )}
      </Tabla>
      </div>

      {abierta && (
        <DetalleCategoriaResultados
          r={r}
          categoria={abierta}
          tiendaInicial={tienda}
          pesos={pesos.pesos}
          propuesta={lecturaPropuesta}
          senal={senalDe.get(abierta.id) ?? null}
          deTienda={tiendaElegida?.nombre ?? null}
          veAnalisis={veAnalisis}
          onClose={() => setAbierta(null)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section data-guia="plan-resultados.prendas" className="card-cayla p-5">
          <h2 className="font-serif text-lg text-tinta">Las prendas que más vendieron</h2>
          {prendas.length === 0 ? (
            <p className="mt-2 text-sm text-taupe">Todavía ninguna.</p>
          ) : (
            <ol className="mt-3 divide-y divide-sand">
              {prendas.map((p) => (
                <li key={p.clave} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-tinta">
                    {p.prenda}
                    {p.color && <span className="text-taupe"> · {p.color}</span>}
                  </span>
                  <span className="tabular-nums text-tinta">{enteroES.format(p.unidades)}</span>
                  <span className="w-24 text-right tabular-nums text-tinta/70">{solesES(p.soles)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section data-guia="plan-resultados.colores" className="card-cayla p-5">
          <h2 className="font-serif text-lg text-tinta">Por color y por familia</h2>
          {colores.length === 0 ? (
            <p className="mt-2 text-sm text-taupe">Todavía ninguno.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {colores.map((c) => (
                <li key={c.codigo} className="flex items-center gap-2 rounded-full border border-sand px-3 py-1 text-sm text-tinta">
                  {/* El color de la prenda es dato: no cambia con el tema (ADR-0336, regla 3). */}
                  <span data-color-dato aria-hidden className="h-3 w-3 rounded-full border border-sand" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                  {c.nombre} <span className="tabular-nums text-taupe">{enteroES.format(c.unidades)}</span>
                </li>
              ))}
            </ul>
          )}
          {familias.length > 0 && (
            <p className="mt-4 text-sm text-tinta/80">{familias.map((f) => `${f.familia} ${enteroES.format(f.unidades)}`).join(" · ")}</p>
          )}
        </section>
      </div>

      {/* Lo que deja la campaña para la próxima es un dato, no una definición: queda a la vista (las definiciones van en el «!»). */}
      {conMultiplicador.length > 0 && momento === "terminada" && (
        <p className="nota-cayla" data-guia="plan-resultados.proxima">
          Para la próxima: {conMultiplicador.map((x) => `${x.t.nombre} ${textoMultiplicador(x.m!)}`).join(", ")}
          {recupero !== null ? `, y lo que sobró se vendió al ${recupero} % del precio` : ""}. La propuesta del Plan usa estos números en vez de × 3.
        </p>
      )}
    </div>
  );
}

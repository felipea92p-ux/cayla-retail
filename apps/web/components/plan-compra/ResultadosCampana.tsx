"use client";

import { useMemo, useState } from "react";
import { ChartColumn, ChevronRight } from "lucide-react";
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
  leerResultados,
  momentoDeResultados,
  multiplicadorReal,
  pesosDeLosDias,
  porCategoria,
  porFamilia,
  prendasQueMasVendieron,
  recuperoRealTotal,
  senales,
  type FilaCategoria,
} from "@/lib/plan-compra-resultados";
import { leerHistorial, textoMultiplicador } from "@/lib/plan-compra-historial";
import { TarjetaComoVa } from "@/components/plan-compra/ComoVaCampana";
import { SenalesCampana } from "@/components/plan-compra/SenalesCampana";
import { CierreCampana } from "@/components/plan-compra/CierreCampana";

// Plan de campaña ▸ Resultados (ADR-0372, C6 · Felipe 2026-10-12): lo que se vendió de verdad en una campaña, por tienda, familia, categoría,
// prenda y color; el multiplicador real de cada tienda; qué se agotó; y a qué % se vendió lo que sobró. Solo lee. Las píldoras de tienda
// filtran todo lo de abajo; la comparación contra el plan solo se hace con todas las tiendas (el plan es de toda CAYLA).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]";

export function ResultadosCampana({
  datos,
  campanas,
  falla,
  anterior = null,
  veAnalisis = false,
}: {
  datos: unknown;
  campanas: CampanasLeidas | null;
  falla: string | null;
  /** La misma campaña un año antes (`fn_historial_ventas`, crudo): la forma de los días para «¿Cómo va?». */
  anterior?: unknown;
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

  const categorias = porCategoria(r, tienda);
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
      ? { como: comoVa(r, pesos.pesos), piden: senales(r, pesos.pesos).filter((s) => s.senal !== "bien"), faltan: pesos.pesos.length - Math.min(pesos.pesos.length, dias) }
      : null;

  return (
    <div className="space-y-6">
      {cabecera(
        momento === "en-curso"
          ? `${r.plan.nombre}, ${rango}: lo vendido hasta ayer (${dias} ${dias === 1 ? "día" : "días"}).`
          : `${r.plan.nombre}, ${rango}: lo que se vendió de verdad, tienda por tienda.`,
      )}
      <PestanasPlan activa="resultados" planId={r.plan.id} />

      {/* Al terminar, el cierre arriba (Felipe 2026-10-12). Durante, «¿cómo va?» es la primera tarjeta de cifras y «Pedir más o impulsar»
          aparece debajo solo si alguna categoría pide algo. Toda CAYLA: las píldoras de tienda filtran la tabla, no esto. */}
      {momento === "terminada" && datosCierre && <CierreCampana c={datosCierre} veAnalisis={veAnalisis} />}

      {r.tiendas.length > 1 && (
        <div role="group" aria-label="Tienda" className="flex flex-wrap gap-2">
          <button type="button" className="pildora-cayla" aria-pressed={tienda === null} onClick={() => setTienda(null)}>
            Todas
          </button>
          {r.tiendas.map((t) => (
            <button key={t.id} type="button" className="pildora-cayla" aria-pressed={tienda === t.id} onClick={() => setTienda(t.id)}>
              {t.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {enCurso && <TarjetaComoVa c={enCurso.como} conForma={pesos.conForma} piden={enCurso.piden.length} />}
        <TarjetaCifra etiqueta="Toda CAYLA" valor={enteroES.format(total.unidades)} unidad="prendas">
          {solesES(total.soles)}
          {momento === "en-curso" ? " · hasta ayer" : ""}
        </TarjetaCifra>
        {r.tiendas.map((t) => {
          const m = multiplicadorReal(r, t);
          return (
            <TarjetaCifra key={t.id} etiqueta={t.nombre} valor={enteroES.format(t.unidades)} unidad="prendas" activa={tienda === t.id} onClick={() => setTienda(tienda === t.id ? null : t.id)}>
              {solesES(t.soles)} · {m !== null ? `${textoMultiplicador(m)} un día normal` : "sin 60 días de antes en el ERP para comparar"}
            </TarjetaCifra>
          );
        })}
      </div>

      {enCurso && enCurso.piden.length > 0 && <SenalesCampana senales={enCurso.piden} faltan={enCurso.faltan} veAnalisis={veAnalisis} />}

      <Tabla>
        <div className={`encabezado-tabla-cayla hidden gap-x-6 px-5 py-2 sm:grid ${PLANTILLA}`} role="row">
          {/* Cada título se alinea como su columna (Tabla, «celda»): las cifras y su título a la derecha, el texto a la izquierda. */}
          {(
            [
              ["Categoría", "izq"],
              ["Vendidas", "der"],
              ["Soles", "der"],
              [tienda === null ? "Contra el plan" : "Contra el plan (todas las tiendas)", "izq"],
              ["Lo que sobró", "der"],
            ] as const
          ).map(([t, alinear]) => (
            <span key={t} className={`text-xs font-normal text-taupe ${alinear === "der" ? "text-right" : ""}`} role="columnheader">
              {t}
            </span>
          ))}
        </div>
        {categorias.length === 0 ? (
          <Vacio tamano="chico" icono={<ChartColumn />} titulo="Sin ventas todavía">
            En estas fechas no se vendió ninguna categoría{tienda ? " en esta tienda" : ""}.
          </Vacio>
        ) : (
          categorias.map((c) => (
            // Toda la fila abre su detalle (qué prendas y de qué colores se vendieron); una categoría sin ventas no tiene qué mostrar.
            <button
              key={c.id}
              type="button"
              disabled={c.unidades === 0}
              onClick={() => setAbierta(c)}
              aria-label={`Ver qué prendas de ${c.nombre} se vendieron`}
              className={`fila-cayla grid w-full gap-x-6 gap-y-1 px-5 py-3 text-left transition-colors sm:items-baseline enabled:cursor-pointer enabled:hover:bg-hueso ${PLANTILLA}`}
            >
              <span className={celda("izq")}>
                <span className="flex items-center gap-1.5 font-semibold text-tinta">
                  {c.nombre}
                  {c.unidades > 0 && <ChevronRight aria-hidden className="h-4 w-4 text-taupe" />}
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
              <span className={celda("der", "text-sm text-tinta/80")} title={c.plan ? `Planificaste ${c.plan.recuperoPct} %` : undefined}>
                {c.recuperoReal !== null ? `${c.recuperoReal} % del precio` : momento === "en-curso" ? "Al terminar" : "—"}
              </span>
            </button>
          ))
        )}
      </Tabla>

      {abierta && <DetalleCategoriaResultados r={r} categoria={abierta} tiendaInicial={tienda} onClose={() => setAbierta(null)} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-cayla p-5">
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
        <section className="card-cayla p-5">
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
        <p className="nota-cayla">
          Para la próxima: {conMultiplicador.map((x) => `${x.t.nombre} ${textoMultiplicador(x.m!)}`).join(", ")}
          {recupero !== null ? `, y lo que sobró se vendió al ${recupero} % del precio` : ""}. La propuesta del Plan usa estos números en vez de × 3.
        </p>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ChartColumn } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Tabla, celda } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { PestanasPlan } from "@/components/plan-compra/PestanasPlan";
import { SelectorCampana } from "@/components/plan-compra/SelectorCampana";
import { enteroES, fechaCortaES, solesES, type CampanasLeidas } from "@/lib/plan-compra-reglas";
import {
  coloresQueMasVendieron,
  diasMedidos,
  leerResultados,
  momentoDeResultados,
  multiplicadorReal,
  porCategoria,
  porFamilia,
  prendasQueMasVendieron,
  recuperoRealTotal,
} from "@/lib/plan-compra-resultados";
import { textoMultiplicador } from "@/lib/plan-compra-historial";

// Plan de campaña ▸ Resultados (ADR-0372, C6 · Felipe 2026-10-12): lo que se vendió de verdad en una campaña, por tienda, familia, categoría,
// prenda y color; el multiplicador real de cada tienda; qué se agotó; y a qué % se vendió lo que sobró. Solo lee. Las píldoras de tienda
// filtran todo lo de abajo; la comparación contra el plan solo se hace con todas las tiendas (el plan es de toda CAYLA).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]";

export function ResultadosCampana({ datos, campanas, falla }: { datos: unknown; campanas: CampanasLeidas | null; falla: string | null }) {
  const r = useMemo(() => leerResultados(datos), [datos]);
  const [tienda, setTienda] = useState<string | null>(null);
  const cabecera = (subtitulo: string) => (
    <EncabezadoPagina
      sede="Todas las tiendas"
      titulo="Plan de campaña"
      subtitulo={subtitulo}
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

  return (
    <div className="space-y-6">
      {cabecera(
        momento === "en-curso"
          ? `${r.plan.nombre}, ${rango}: lo vendido hasta ayer (${dias} ${dias === 1 ? "día" : "días"}).`
          : `${r.plan.nombre}, ${rango}: lo que se vendió de verdad, tienda por tienda.`,
      )}
      <PestanasPlan activa="resultados" planId={r.plan.id} />

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <Tabla>
        <div className={`encabezado-tabla-cayla hidden gap-x-4 px-5 py-2 sm:grid ${PLANTILLA}`} role="row">
          {["Categoría", "Vendidas", "Soles", tienda === null ? "Contra el plan" : "Contra el plan (todas las tiendas)", "Lo que sobró"].map((t) => (
            <span key={t} className="text-xs font-normal text-taupe" role="columnheader">
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
            <div key={c.id} className={`fila-cayla grid gap-x-4 gap-y-1 px-5 py-3 sm:items-baseline ${PLANTILLA}`} role="row">
              <span className={celda("izq")}>
                <span className="block font-semibold text-tinta">{c.nombre}</span>
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
            </div>
          ))
        )}
      </Tabla>

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

      <p className="nota-cayla">
        Cómo leerlo: «×2.0 un día normal» quiere decir que la tienda vendió, por día, el doble de prendas que en los 60 días anteriores a la campaña;
        el año que viene, la propuesta del Plan usa ese número en vez de × 3.{" "}
        {conMultiplicador.length > 0 && momento === "terminada"
          ? `Para la próxima: ${conMultiplicador.map((x) => `${x.t.nombre} ${textoMultiplicador(x.m!)}`).join(", ")}${recupero !== null ? `, y lo que sobró se vendió al ${recupero} % del precio` : ""}. `
          : ""}
        «Se agotó» es una categoría que quedó en cero en esa tienda antes de terminar: lo vendido ahí quedó corto por falta de stock, y la propuesta
        del año que viene no lo promedia. «Lo que sobró» es lo vendido de esa categoría en los 60 días después de la campaña, contra su precio de
        etiqueta.
      </p>
    </div>
  );
}

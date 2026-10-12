"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, History, SearchX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Desplegable } from "@/components/ui/campos";
import { DetalleCampanaHistorial } from "@/components/plan-compra/DetalleCampanaHistorial";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Ayuda } from "@/components/Ayuda";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BarraCifras } from "@/components/plan-compra/BarraCifras";
import { Tabla, celda } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { PestanasPlan } from "@/components/plan-compra/PestanasPlan";
import { fechaCortaES, type CampanaPlan } from "@/lib/plan-compra-reglas";
import {
  aniosConHistoria,
  aniosQueCaben,
  decadaDe,
  faltaEnElCalendario,
  filasDelAnio,
  filtrarYOrdenar,
  leerHistorial,
  ORDENES_HISTORIAL,
  type OrdenHistorial,
  type CampanaDelAnio,
  textoCrecimiento,
  textoMultiplicador,
  totalDeCayla,
  totalDelAnio,
  ventanaDeAnios,
  type CeldaHistorial,
  type EtiquetaHistorial,
  type LecturaHistorial,
} from "@/lib/plan-compra-historial";

// Plan de campaña ▸ Historial (ADR-0372, C3): un año a la vez (píldoras de año), una fila por campaña, una columna por tienda. Cada celda
// dice cuánto se vendió, cuántas veces lo de un día normal y cuánto creció contra el año anterior. Solo lee: no hay nada que guardar.
// Las cifras de antes del ERP salen de Sinatra (C2) y son solo soles: la nota del pie lo dice.

const solesSinCentimos = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

function Celda({ c, anio }: { c: CeldaHistorial; anio: number }) {
  const m = c.medida;
  if (m.estado === "por-venir") return <span className="text-sm text-taupe">Por venir</span>;
  if (m.estado === "sin-dato")
    return (
      <span className="text-sm text-taupe" title={m.motivo}>
        Sin dato
      </span>
    );
  const partes = [m.multiplicador !== null ? `${textoMultiplicador(m.multiplicador)} un día normal` : null, c.crecimiento !== null ? `${textoCrecimiento(c.crecimiento)} que ${anio - 1}` : null].filter(Boolean);
  return (
    <span className="block">
      <span className="block font-semibold text-tinta tabular-nums">{solesSinCentimos(m.soles)}</span>
      <span className="block text-xs text-taupe">
        {m.enCurso ? `Hasta ayer${partes.length ? " · " : ""}` : ""}
        {partes.join(" · ") || (m.enCurso ? "" : "Sin base para comparar")}
      </span>
    </span>
  );
}

/**
 * La fila de años (Felipe 2026-10-12: «¿qué pasa si hay 30 años?»): siempre UNA fila. Si no caben todos, se ven los que caben, seguidos y con el
 * elegido al medio —a sus costados, los que le siguen—, y la última píldora, «Más años», abre el resto por década, con buscador (regla de combos).
 * Se mide la fila, no la ventana: la primera pintura supone una laptop y se corrige apenas se mide.
 */
const SEPARACION_ANIOS = 8;
function FilaDeAnios({ anios, anio }: { anios: number[]; anio: number }) {
  const router = useRouter();
  const fila = useRef<HTMLElement>(null);
  const [medidas, setMedidas] = useState<{ ancho: number; pildora: number; mas: number } | null>(null);

  useEffect(() => {
    const el = fila.current;
    if (!el) return;
    const medir = () => {
      const pildoras = [...el.querySelectorAll<HTMLElement>("[data-anio]")].map((p) => p.offsetWidth);
      const mas = el.querySelector<HTMLElement>("[data-mas-anios]")?.offsetWidth ?? 0;
      setMedidas((m) => {
        const pildora = pildoras.length ? Math.max(...pildoras) : (m?.pildora ?? 0);
        // «Más años · 12» crece un dígito al cambiar la cuenta: se guarda el más ancho medido, con 8 px de holgura (132 antes de medirlo).
        const nuevo = { ancho: el.clientWidth, pildora, mas: mas ? Math.max(mas + 8, m?.mas ?? 0) : (m?.mas ?? 132) };
        return m && m.ancho === nuevo.ancho && m.pildora === nuevo.pildora && m.mas === nuevo.mas ? m : nuevo;
      });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const caben = medidas ? aniosQueCaben(anios.length, { ...medidas, separacion: SEPARACION_ANIOS }) : 9;
  const { visibles, resto } = ventanaDeAnios(anios, anio, caben);

  return (
    <nav ref={fila} aria-label="Año" data-guia="plan-historial.anios" className="flex flex-nowrap items-center gap-2 overflow-x-clip">
      {visibles.map((a) => (
        <Link key={a} data-anio href={`/compras/plan/historial?anio=${a}`} className="pildora-cayla shrink-0" aria-current={a === anio ? "page" : undefined}>
          {a}
        </Link>
      ))}
      {resto.length > 0 && (
        <span data-mas-anios data-guia="plan-historial.mas-anios" className="shrink-0">
          <Desplegable
            valor=""
            onValor={(v) => v && router.push(`/compras/plan/historial?anio=${v}`)}
            opciones={resto.map((a) => ({ valor: String(a), texto: String(a), grupo: decadaDe(a) }))}
            marcador={`Más años · ${resto.length}`}
            forma="pildora"
            alineacion="derecha"
            etiquetaAccesible={`Más años: ${resto.length} años más con historia`}
          />
        </span>
      )}
    </nav>
  );
}

export function HistorialCampanas({
  anio,
  historial: crudo,
  etiquetas,
  planes,
  falla,
}: {
  anio: number;
  historial: unknown;
  etiquetas: EtiquetaHistorial[];
  planes: CampanaPlan[];
  falla: string | null;
}) {
  const historial: LecturaHistorial | null = useMemo(() => leerHistorial(crudo), [crudo]);
  // La fila abierta: su hoja muestra el día a día y la misma campaña año por año (Felipe 2026-10-12).
  const [abierta, setAbierta] = useState<CampanaDelAnio | null>(null);
  const [q, setQ] = useState("");
  // De entrada, la de ahora y las que vienen (Felipe 2026-10-12): en octubre, Aniversario CAYLA, Halloween, Black Friday, Navidad…
  const [orden, setOrden] = useState<OrdenHistorial>("ahora");
  const arranqueErp = historial?.tiendas.map((t) => t.erpDesde).filter((x): x is string => !!x).sort()[0];
  // El «!» con lo que la frase no alcanza a decir, como en Productos (Felipe 2026-10-12): antes era una nota larga al pie de la tabla.
  const ayuda = (
    <Ayuda titulo="Historial">
      <span className="block">
        «×1.8 un día normal» quiere decir que en esa campaña la tienda vendió, por día, 1.8 veces lo que vendía por día en los 60 días anteriores.
      </span>
      <span className="mt-2 block">
        Las fechas son las de cada campaña en Catálogo ▸ Etiquetas llevadas a {anio} (Día de la Madre se mueve con su segundo domingo de mayo).
      </span>
      <span className="mt-2 block">
        {arranqueErp ? `Antes del ${fechaCortaES(arranqueErp)} de ${arranqueErp.slice(0, 4)} ` : "Antes del ERP "}las cifras salen de Sinatra, los Excel de
        Finanzas: son soles por tienda, sin categorías ni unidades.
      </span>
      <span className="mt-2 block">«Sin dato» es una tienda que todavía no abría o un tramo que no está en Sinatra (como los meses de la pandemia en 2020).</span>
    </Ayuda>
  );
  const cabecera = (
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
          <span className="max-sm:hidden">Lo que vendió cada tienda en cada campaña, un año a la vez: cuánto más que un día normal y cuánto creció. </span>
          <span className="max-sm:hidden">{ayuda}</span>
        </>
      }
    />
  );
  if (!historial || historial.tiendas.length === 0) {
    return (
      <div className="space-y-6">
        {cabecera}
        <PestanasPlan activa="historial" />
        {falla ? (
          <Aviso tono="error">{falla}.</Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio icono={<History />} titulo="Todavía no hay historia de ventas">
              Cuando se cargue la historia de Sinatra (los Excel de Finanzas) o el ERP tenga ventas, aquí se ve cada campaña año por año.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  const filas = filasDelAnio(historial, etiquetas, anio);
  const visibles = filtrarYOrdenar(filas, q, orden, historial.hoy);
  const tiendas = historial.tiendas;
  const columnas = `minmax(0,1.2fr) repeat(${tiendas.length}, minmax(0,1fr))`;
  const anioEnCurso = anio === Number(historial.hoy.slice(0, 4));

  return (
    <div className="space-y-6">
      {cabecera}
      <PestanasPlan activa="historial" />

      <FilaDeAnios anios={aniosConHistoria(historial)} anio={anio} />

      {/* Las cifras del año en UNA barra, como Resultados (Felipe 2026-10-12): primero toda CAYLA, después cada tienda. */}
      <BarraCifras
        guia="plan-historial.tiendas"
        celdas={[
          (() => {
            const t = totalDeCayla(historial, anio);
            return {
              clave: "toda",
              etiqueta: "Toda CAYLA",
              valor: t.soles > 0 ? solesSinCentimos(t.soles) : null,
              bajo: t.soles === 0 ? `Sin ventas cargadas en ${anio}` : anioEnCurso ? `${anio}, hasta hoy` : t.crecimiento !== null ? `${textoCrecimiento(t.crecimiento)} que ${anio - 1}` : "sin un año parejo con qué comparar",
            };
          })(),
          ...tiendas.map((t) => {
            const total = totalDelAnio(historial, t.id, anio);
            return {
              clave: t.id,
              etiqueta: t.nombre,
              valor: total.soles > 0 ? solesSinCentimos(total.soles) : null,
              bajo:
                total.soles === 0
                  ? `Sin ventas cargadas en ${anio}`
                  : anioEnCurso
                    ? `${anio}, hasta hoy`
                    : total.crecimiento !== null
                      ? `${textoCrecimiento(total.crecimiento)} que ${anio - 1}`
                      : total.completo
                        ? `sin ${anio - 1} completo para comparar`
                        : `${anio} no está completo`,
            };
          }),
        ]}
      />

      <Tabla guia="plan-historial.tabla">
        {/* Buscar y ordenar (Felipe 2026-10-12): en la misma tarjeta que la tabla, como el Plan. De entrada, la de ahora y las que vienen. */}
        <div data-guia="plan-historial.buscar" className="flex flex-wrap items-center gap-3 px-5 py-3">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar una campaña" etiqueta="Buscar una campaña" atajo conteo={q ? `${visibles.length} de ${filas.length}` : undefined} className="min-w-0 flex-1 sm:max-w-sm" />
          <Desplegable valor={orden} onValor={(v) => setOrden(v as OrdenHistorial)} opciones={ORDENES_HISTORIAL} forma="cajaBaja" etiquetaAccesible="Ordenar por" className="ml-auto w-56" />
        </div>
        <div className="encabezado-tabla-cayla hidden gap-x-4 px-5 py-2 sm:grid" role="row" style={{ gridTemplateColumns: columnas }}>
          <span className="text-xs font-normal text-taupe" role="columnheader">
            Campaña · {anio}
          </span>
          {tiendas.map((t) => (
            <span key={t.id} className="text-xs font-normal text-taupe" role="columnheader">
              {t.nombre}
            </span>
          ))}
        </div>
        {visibles.length === 0 && (
          <Vacio tamano="chico" icono={<SearchX />} titulo={`Ninguna campaña de ${anio} se llama «${q.trim()}»`} acciones={<button type="button" className="btn-cayla btn-enlace" onClick={() => setQ("")}>Borrar la búsqueda</button>}>
            Prueba con otra palabra o borra la búsqueda.
          </Vacio>
        )}
        {visibles.map(({ campana, celdas }) => (
          // Toda la fila abre su detalle (el día a día y la misma campaña año por año); la flecha dice que se puede tocar.
          <button
            key={campana.clave}
            type="button"
            onClick={() => setAbierta(campana)}
            data-guia="plan-historial.fila"
            className="fila-cayla grid w-full cursor-pointer gap-x-4 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-hueso sm:items-baseline"
            style={{ gridTemplateColumns: columnas }}
            aria-label={`Ver el detalle de ${campana.nombre} ${anio}`}
          >
            <span className={celda("izq", "col-span-full sm:col-span-1")}>
              <span className="flex items-center gap-1.5 font-semibold text-tinta">
                {campana.nombre}
                <ChevronRight aria-hidden className="h-4 w-4 text-taupe" />
                {/* Dónde estás parado en el calendario: la campaña que cae en estos días (en otro año, «en esta fecha»). */}
                {faltaEnElCalendario(campana, historial.hoy) === 0 && <Chip tono="verde">{anioEnCurso ? "Ahora" : "En esta fecha"}</Chip>}
              </span>
              <span className="block text-xs text-taupe">
                {fechaCortaES(campana.desde)} – {fechaCortaES(campana.hasta)}
              </span>
            </span>
            {celdas.map((c) => (
              <span key={c.tienda.id} className="min-w-0">
                <span className="block text-[11px] text-taupe sm:hidden">{c.tienda.nombre}</span>
                <Celda c={c} anio={anio} />
              </span>
            ))}
          </button>
        ))}
      </Tabla>

      {abierta && (
        <DetalleCampanaHistorial
          campana={abierta}
          anio={anio}
          historial={historial}
          etiquetas={etiquetas}
          anios={aniosConHistoria(historial)}
          planDeResultados={planes.find((p) => !p.archivado && p.etiquetaId === abierta.clave && p.desde.slice(0, 4) === String(anio))?.id ?? null}
          onClose={() => setAbierta(null)}
        />
      )}
    </div>
  );
}

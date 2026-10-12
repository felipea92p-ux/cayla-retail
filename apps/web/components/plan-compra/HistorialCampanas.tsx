import Link from "next/link";
import { History } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Tabla, celda } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { PestanasPlan } from "@/components/plan-compra/PestanasPlan";
import { fechaCortaES } from "@/lib/plan-compra-reglas";
import {
  aniosConHistoria,
  filasDelAnio,
  textoCrecimiento,
  textoMultiplicador,
  totalDelAnio,
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

export function HistorialCampanas({ anio, historial, etiquetas, falla }: { anio: number; historial: LecturaHistorial | null; etiquetas: EtiquetaHistorial[]; falla: string | null }) {
  const cabecera = (
    <EncabezadoPagina
      sede="Todas las tiendas"
      titulo="Plan de campaña"
      subtitulo="Lo que vendió cada tienda en cada campaña, un año a la vez: cuánto más que un día normal y cuánto creció."
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
  const tiendas = historial.tiendas;
  const columnas = `minmax(0,1.2fr) repeat(${tiendas.length}, minmax(0,1fr))`;
  const anioEnCurso = anio === Number(historial.hoy.slice(0, 4));
  const arranqueErp = tiendas.map((t) => t.erpDesde).filter((x): x is string => !!x).sort()[0];

  return (
    <div className="space-y-6">
      {cabecera}
      <PestanasPlan activa="historial" />

      <nav aria-label="Año" className="flex flex-wrap gap-2">
        {aniosConHistoria(historial).map((a) => (
          <Link key={a} href={`/compras/plan/historial?anio=${a}`} className="pildora-cayla" aria-current={a === anio ? "page" : undefined}>
            {a}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiendas.map((t) => {
          const total = totalDelAnio(historial, t.id, anio);
          return (
            <TarjetaCifra key={t.id} etiqueta={t.nombre} valor={total.soles > 0 ? solesSinCentimos(total.soles) : null}>
              {total.soles === 0
                ? `Sin ventas cargadas en ${anio}`
                : anioEnCurso
                  ? `${anio}, hasta hoy`
                  : total.crecimiento !== null
                    ? `${textoCrecimiento(total.crecimiento)} que ${anio - 1}`
                    : total.completo
                      ? `Todo ${anio} · sin ${anio - 1} completo para comparar`
                      : `${anio} no está completo en la historia`}
            </TarjetaCifra>
          );
        })}
      </div>

      <Tabla>
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
        {filas.map(({ campana, celdas }) => (
          <div key={campana.clave} className="fila-cayla grid gap-x-4 gap-y-1 px-5 py-3 sm:items-baseline" role="row" style={{ gridTemplateColumns: columnas }}>
            <span className={celda("izq", "col-span-full sm:col-span-1")}>
              <span className="block font-semibold text-tinta">{campana.nombre}</span>
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
          </div>
        ))}
      </Tabla>

      <p className="nota-cayla">
        Cómo leerlo: «×1.8 un día normal» quiere decir que en esa campaña la tienda vendió, por día, 1.8 veces lo que vendía por día en los 60
        días anteriores. Las fechas son las de cada campaña en Catálogo ▸ Etiquetas llevadas a {anio} (Día de la Madre se mueve con su segundo
        domingo de mayo). {arranqueErp ? `Antes del ${fechaCortaES(arranqueErp)} de ${arranqueErp.slice(0, 4)} ` : "Antes del ERP "}las cifras salen
        de Sinatra, los Excel de Finanzas: son soles por tienda, sin categorías ni unidades. «Sin dato» es una tienda que todavía no abría o un
        tramo que no está en Sinatra (como los meses de la pandemia en 2020).
      </p>
    </div>
  );
}

"use client";

import { Ellipsis } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { SelectNativo } from "@/components/ui/campos";
import { PrendaCelda } from "@/components/ui/PrendaCelda";
import { BotonAccion, type AlAccionar } from "@/components/ResumenAccion";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { FILAS_POR_PAGINA, OPCIONES_ORDEN, VISTA_INICIAL, type Orden } from "@/lib/resumen-filtros";
import { DIAS_RESERVA_SEGURIDAD } from "@/lib/inventario-reglas";
import { formatoCoberturaDias, formatoVelocidad } from "@/lib/resumen-formato";
import { partesOportunidad } from "@/lib/resumen-acciones";
import type { ResumenParaPantalla } from "@/lib/resumen-armado";
import type { AnalisisVariante, Ubicacion } from "@/lib/resumen-reglas";

// «Prioridades de inventario»: el centro de la pantalla. Una fila por variante,
// ordenada por lo que más urge; el stock es el de hoy, la velocidad y la
// cobertura salen del período elegido. Solo viaja UNA página de filas al
// navegador: toda la sede se analiza en el servidor.

// Tres niveles, medidos contra el ancho REAL del contenido (la barra lateral y los
// márgenes se comen ~360 px: a 1440 el contenido mide ~1073, a 1280 ~913):
//  · ≥ 1560 px  9 columnas, como la referencia (oportunidad en su propia columna);
//  · ≥ 1280 px  8 columnas: la oportunidad baja debajo de los chips de estado;
//  · menos     una tarjeta por prenda (una tabla de 8 columnas no cabe en 657 px).
const P_1280 = "min-[1280px]:grid-cols-[minmax(10.5rem,1.6fr)_3.25rem_3.75rem_5.25rem_4.25rem_minmax(8.5rem,1.15fr)_8.75rem_1.75rem]";
const P_1560 = "min-[1560px]:grid-cols-[minmax(13rem,1.5fr)_4rem_4rem_5.75rem_5rem_minmax(9.5rem,1.1fr)_minmax(8rem,1fr)_9.25rem_2rem]";
const PLANTILLA = `${P_1280} ${P_1560}`;

const COLOR_COBERTURA: Record<string, string> = {
  agotado: "text-rojo-profundo",
  critica: "text-rojo-profundo",
  atencion: "text-ambar-profundo",
};

function Cabecera({ arriba, abajo, alinear = "izq", solo1360 = false }: { arriba: string; abajo?: string; alinear?: "izq" | "der"; solo1360?: boolean }) {
  return (
    <span role="columnheader" className={`label-cayla block text-[10px] leading-4 text-tinta/60 ${alinear === "der" ? "text-right" : ""} ${solo1360 ? "hidden min-[1560px]:block" : ""}`}>
      {arriba}
      {abajo && <span className="block normal-case tracking-normal text-tinta/45">{abajo}</span>}
    </span>
  );
}

function textoCobertura(a: AnalisisVariante): { texto: string; ayuda: string } {
  switch (a.cobertura.tipo) {
    case "agotado":
      return { texto: "0", ayuda: "Sin stock utilizable" };
    case "medida":
      return { texto: formatoCoberturaDias(a.cobertura.dias ?? 0), ayuda: `${a.fila.utilizable} uds ÷ ${formatoVelocidad(a.velocidad.unidadesDia ?? 0)} uds/día` };
    case "sin_ventas":
      return { texto: "> 60", ayuda: `Sin ventas en ${Math.round(a.velocidad.diasBase ?? 0)} días con stock` };
    default:
      return { texto: "—", ayuda: "No hay suficiente historial para estimar la cobertura" };
  }
}

function variacionUnidades(a: AnalisisVariante): number | null {
  const previas = a.tendencia?.ventasNetasPrevias ?? 0;
  if (!a.tendencia || previas <= 0) return null;
  return ((a.velocidad.ventasNetas - previas) / previas) * 100;
}

function Vendido({ a }: { a: AnalisisVariante }) {
  const v = variacionUnidades(a);
  return (
    <span className="block text-right tabular-nums text-sm text-tinta">
      {a.velocidad.ventasNetas}
      {v !== null && Math.abs(v) >= 1 && (
        <span className={`block text-[10px] leading-3 ${v > 0 ? "text-verde-profundo" : "text-tinta/55"}`} title="Contra el período de comparación">
          {v > 0 ? "↑" : "↓"} {Math.abs(Math.round(v))}%
        </span>
      )}
    </span>
  );
}

function Velocidad({ a }: { a: AnalisisVariante }) {
  const v = a.velocidad;
  if (v.unidadesDia === null) {
    return (
      <span className="block text-right text-sm text-tinta/50" title={v.estado === "sin_ventas" ? "Sin ventas en el período" : "No hay suficientes días en venta para medir el ritmo"}>
        {v.estado === "sin_ventas" ? "0" : "—"}
      </span>
    );
  }
  return (
    <span className="block text-right tabular-nums text-sm text-tinta" title={`${v.ventasNetas} netas ÷ ${Math.round(v.diasBase! * 10) / 10} días en venta${v.estimada ? " (aproximado: el historial de movimientos no cuadra)" : ""}`}>
      {v.estimada && <span aria-hidden className="text-tinta/45">≈ </span>}
      {formatoVelocidad(v.unidadesDia)}
    </span>
  );
}

function Stock({ a }: { a: AnalisisVariante }) {
  const f = a.fila;
  const desglose = `Piso ${f.piso} · Almacén ${f.almacen}${f.sinUbicar > 0 ? ` · Sin ubicar ${f.sinUbicar}` : ""}${f.cuarentena > 0 ? ` · Dañado ${f.cuarentena}` : ""}`;
  return (
    <span className="block text-right tabular-nums text-sm text-tinta" title={desglose}>
      {f.separaPisoAlmacen ? (
        <>
          <span className="text-tinta/70">
            {f.piso} + {f.almacen} =
          </span>{" "}
          <span className="font-medium">{f.utilizable}</span>
        </>
      ) : (
        <span className="font-medium">{f.utilizable}</span>
      )}
    </span>
  );
}

function Cobertura({ a }: { a: AnalisisVariante }) {
  const { texto, ayuda } = textoCobertura(a);
  return (
    <span className="block text-right" title={ayuda}>
      <span className={`tabular-nums text-sm ${COLOR_COBERTURA[a.banda] ?? "text-tinta"}`}>{texto}</span>
      {a.bajoReserva && (
        <span className="block text-[10px] leading-3 text-ambar-profundo" title={`Reserva de seguridad: ${a.reserva} uds (${DIAS_RESERVA_SEGURIDAD} días de venta)`}>
          ↓ bajo reserva
        </span>
      )}
    </span>
  );
}

function Chips({ a }: { a: AnalisisVariante }) {
  if (a.chips.length === 0) return <span className="text-sm text-tinta/45">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {a.chips.map((c) => (
        <span key={c.clave} title={c.ayuda}>
          <Chip tono={c.tono}>{c.texto}</Chip>
        </span>
      ))}
    </span>
  );
}

function Oportunidad({ a, destino }: { a: AnalisisVariante; destino: Ubicacion }) {
  const partes = partesOportunidad(a, destino);
  return (
    <span className="block text-xs leading-4 text-tinta/75">
      {partes.map((p, i) => (
        <span key={i} className="block truncate" title={p}>
          {p}
        </span>
      ))}
    </span>
  );
}

function Menu({ a, alAccionar }: { a: AnalisisVariante; alAccionar: AlAccionar }) {
  return (
    <button
      type="button"
      aria-label={`Ver el detalle de ${a.fila.referencia}${a.fila.color ? ` ${a.fila.color}` : ""}${a.fila.talla ? ` ${a.fila.talla}` : ""}`}
      onClick={(e) => (e.stopPropagation(), alAccionar.verDetalle(a))}
      className="flex h-8 w-8 items-center justify-center rounded-md text-tinta/55 transition-colors hover:bg-tinta/[0.06] hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta/50"
    >
      <Ellipsis aria-hidden strokeWidth={1.5} className="h-[18px] w-[18px]" />
    </button>
  );
}

export function ResumenPrioridades({
  datos,
  puedeBajarAlPiso,
  alAccionar,
  actualizar,
}: {
  datos: ResumenParaPantalla;
  puedeBajarAlPiso: boolean;
  alAccionar: AlAccionar;
  actualizar: (cambios: CambiosUrl, opciones?: { conservarPagina?: boolean }) => void;
}) {
  const { tabla, ubicacion, periodo, vista } = datos;
  const hayFiltros = datos.alcance.q !== "" || datos.alcance.categoriaId !== null || vista.cobertura !== "todas" || vista.sellThrough !== "todos" || vista.estado !== "todos";
  const irA = (pag: number) => actualizar({ pag: pag <= 1 ? null : String(pag) }, { conservarPagina: true });
  const limpiar = () => actualizar({ q: null, cat: null, cob: null, st: null, est: null, orden: null });
  const dias = periodo.dias;

  return (
    <section id="prioridades" className="card-cayla overflow-x-auto" aria-labelledby="prioridades-titulo">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 id="prioridades-titulo" className="font-display text-[1.35rem] leading-tight text-tinta">
            Prioridades de inventario
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-tinta/65">
            Productos que requieren tu atención, ordenados por prioridad. El stock es actual; velocidad y cobertura usan el período seleccionado.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="label-cayla text-[10px] text-tinta/60">Ordenar por</span>
          <span className="w-32">
            <SelectNativo value={vista.orden} onChange={(e) => actualizar({ orden: e.target.value === VISTA_INICIAL.orden ? null : (e.target.value as Orden) })}>
              {OPCIONES_ORDEN.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </SelectNativo>
          </span>
        </label>
      </div>

      {datos.tabla.totalSede === 0 ? (
        <p className="border-t border-tinta/10 px-5 py-10 text-sm text-tinta/65">
          {ubicacion.nombre} todavía no tiene prendas con stock, ventas ni historial. Cuando reciba mercadería, aparecerá acá.
        </p>
      ) : tabla.total === 0 ? (
        <div className="border-t border-tinta/10 px-5 py-10 text-sm text-tinta/65">
          <p>Ninguna prenda coincide con estos filtros.</p>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="label-cayla mt-3 rounded-md border border-tinta/25 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/50">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div role="row" className={`hidden items-end gap-x-3 border-t border-tinta/10 px-5 py-2 min-[1280px]:grid ${PLANTILLA}`}>
            <Cabecera arriba="Producto / variante" />
            <Cabecera arriba="Vendido" abajo={`en ${dias} d`} alinear="der" />
            <Cabecera arriba="Velocidad" abajo="uds/día" alinear="der" />
            <Cabecera arriba="Stock hoy" abajo="piso + almacén" alinear="der" />
            <Cabecera arriba="Cobertura" abajo="días" alinear="der" />
            <Cabecera arriba="Estado / interpretación" />
            <span role="columnheader" className="label-cayla hidden text-[10px] leading-4 text-tinta/60 min-[1560px]:block">
              Oportunidad / dónde hay
            </span>
            <Cabecera arriba="Acción sugerida" />
            <span />
          </div>

          <div role="rowgroup" className="divide-y divide-tinta/10 border-t border-tinta/10">
            {tabla.filas.map((a) => {
              const f = a.fila;
              const tinte = a.plan.urgencia === "alta" ? "bg-rojo/[0.035]" : "";
              const abrir = (e: React.MouseEvent) => {
                // No abrir el detalle si el clic fue en un enlace/botón, ni si se está seleccionando texto.
                if ((e.target as HTMLElement).closest("a, button")) return;
                if (window.getSelection()?.toString()) return;
                alAccionar.verDetalle(a);
              };
              return (
                <div key={f.varianteId}>
                  {/* Escritorio */}
                  <div role="row" onClick={abrir} className={`hidden cursor-pointer items-center gap-x-3 px-5 py-2.5 transition-colors hover:bg-sand/25 min-[1280px]:grid ${PLANTILLA} ${tinte}`}>
                    <PrendaCelda referencia={f.referencia} sku={f.sku} talla={f.talla} color={f.color} fotoUrl={f.fotoUrl} />
                    <Vendido a={a} />
                    <Velocidad a={a} />
                    <Stock a={a} />
                    <Cobertura a={a} />
                    <span className="min-w-0">
                      <Chips a={a} />
                      <span className="mt-1 block min-[1560px]:hidden">
                        <Oportunidad a={a} destino={ubicacion} />
                      </span>
                    </span>
                    <span className="hidden min-[1560px]:block">
                      <Oportunidad a={a} destino={ubicacion} />
                    </span>
                    <BotonAccion a={a} destino={ubicacion} puedeBajarAlPiso={puedeBajarAlPiso} alAccionar={alAccionar} />
                    <Menu a={a} alAccionar={alAccionar} />
                  </div>

                  {/* Celular y tablet angosta: una tarjeta por prenda */}
                  <div onClick={abrir} className={`space-y-3 px-4 py-3.5 min-[1280px]:hidden ${tinte}`}>
                    <div className="flex items-start justify-between gap-2">
                      <PrendaCelda referencia={f.referencia} sku={f.sku} talla={f.talla} color={f.color} fotoUrl={f.fotoUrl} />
                      <Menu a={a} alAccionar={alAccionar} />
                    </div>
                    <Chips a={a} />
                    <dl className="grid grid-cols-4 gap-2 text-center">
                      {[
                        ["Vendido", <Vendido key="v" a={a} />],
                        ["Uds/día", <Velocidad key="s" a={a} />],
                        ["Stock", <Stock key="t" a={a} />],
                        ["Cobert.", <Cobertura key="c" a={a} />],
                      ].map(([titulo, valor]) => (
                        <div key={titulo as string}>
                          <dt className="label-cayla text-[9px] text-tinta/55">{titulo}</dt>
                          <dd className="mt-0.5 [&>span]:text-center">{valor}</dd>
                        </div>
                      ))}
                    </dl>
                    <Oportunidad a={a} destino={ubicacion} />
                    <BotonAccion a={a} destino={ubicacion} puedeBajarAlPiso={puedeBajarAlPiso} alAccionar={alAccionar} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tinta/10 px-5 py-3 text-xs text-tinta/65">
            <p>
              {tabla.paginas > 1
                ? `Mostrando ${(tabla.pagina - 1) * FILAS_POR_PAGINA + 1}–${(tabla.pagina - 1) * FILAS_POR_PAGINA + tabla.filas.length} de ${tabla.total} variantes`
                : `${tabla.total} ${tabla.total === 1 ? "variante" : "variantes"}`}
              {tabla.total !== tabla.totalSede && ` (de ${tabla.totalSede} en la sede)`}
            </p>
            {tabla.paginas > 1 && (
              <nav aria-label="Paginación de prioridades" className="flex items-center gap-2">
                <button type="button" disabled={tabla.pagina <= 1} onClick={() => irA(tabla.pagina - 1)} className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/45 disabled:cursor-not-allowed disabled:opacity-40">
                  Anterior
                </button>
                <span className="tabular-nums">
                  {tabla.pagina} / {tabla.paginas}
                </span>
                <button type="button" disabled={tabla.pagina >= tabla.paginas} onClick={() => irA(tabla.pagina + 1)} className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/45 disabled:cursor-not-allowed disabled:opacity-40">
                  Siguiente
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}


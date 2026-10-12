"use client";

import { ArrowUp, Check, ChevronRight, X } from "lucide-react";
import { Tabla, Encabezado, TABLA } from "@/components/ui/Tabla";
import { useDetalleCierre } from "@/components/CierreCajaDetalle";
import type { CierreCaja } from "@/lib/caja";
import { agruparPorDia, estadoCierre, horaLima, quienAtendio, textoResultado, type EstadoCierre } from "@/lib/historial-cierres-reglas";

function money(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Las columnas de la maqueta aprobada (docs/maquetas/historial-cierres-2026-10, Felipe 2026-10-08): tienda · quién atendió
// la caja · debía haber · se contó · ¿cuadró? · ver detalle. Columnas fijas salvo «quién», para que las cifras queden
// una debajo de otra y el resultado siempre en el mismo lugar.
const PLANTILLA = "sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem_7.5rem_12rem_6rem]";

const RESULTADO: Record<EstadoCierre, { icono: typeof Check; fondo: string; texto: string }> = {
  cuadro: { icono: Check, fondo: "bg-verde", texto: "text-verde-profundo" },
  falto: { icono: X, fondo: "bg-rojo", texto: "text-rojo-profundo" },
  sobro: { icono: ArrowUp, fondo: "bg-ambar", texto: "text-ambar-profundo" },
};

/**
 * La tabla de /caja/historial: una fila por cierre, agrupadas por día (el día va una sola vez, en su título). Tocar
 * cualquier parte de la fila abre el detalle de ese cierre. La lógica (agrupado, resultado, quién) vive en
 * `lib/historial-cierres-reglas.ts`; el paginado lo hace la página, que solo le pasa los cierres de la página actual.
 */
export function HistorialCierresTabla({ cierres, pie }: { cierres: CierreCaja[]; pie?: React.ReactNode }) {
  const { abrir, modal } = useDetalleCierre();
  const grupos = agruparPorDia(cierres);

  return (
    <>
      <Tabla>
        <Encabezado
          grande
          plantilla={PLANTILLA}
          columnas={[
            { titulo: "Tienda" },
            { titulo: "Quién atendió la caja" },
            { titulo: "Debía haber", alinear: "der" },
            { titulo: "Se contó", alinear: "der" },
            { titulo: "¿Cuadró?" },
            { titulo: "" },
          ]}
        />
        {grupos.map((g) => (
          <section key={g.clave} aria-label={g.etiqueta}>
            <h3 className="px-5 pb-2 pt-4 text-[13.5px] font-semibold text-tinta">{g.etiqueta}</h3>
            <ul className="divide-y divide-sand border-t border-sand">
              {g.cierres.map((c) => {
                const estado = estadoCierre(c.diferencia);
                const r = RESULTADO[estado];
                const Icono = r.icono;
                const quien = quienAtendio(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => abrir(c)}
                      aria-label={`Ver el detalle del cierre de ${c.ubicacionNombre} a las ${horaLima(c.cerradaEn)}: ${textoResultado(c.diferencia)}`}
                      className={`group grid w-full gap-x-4 gap-y-1 px-5 py-3 text-left text-sm transition-colors hover:bg-sand/35 sm:items-center ${PLANTILLA}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-tinta">{c.ubicacionNombre.replace(/^Tienda\s+/i, "")}</span>
                        <span className="block text-xs text-tinta/60">cerró {horaLima(c.cerradaEn)}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-tinta">
                          {quien.mismaPersona ? (
                            <>
                              <b className="font-semibold">{quien.nombre}</b> abrió y cerró
                            </>
                          ) : (
                            <>
                              Abrió <b className="font-semibold">{quien.abrio}</b>, cerró <b className="font-semibold">{quien.cerro}</b>
                            </>
                          )}
                        </span>
                        <span className="block text-xs text-tinta/60">empezó con {money(c.montoApertura)} en el cajón</span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-tinta/70 sm:text-right">
                        <span className="mr-1 text-xs text-tinta/60 sm:hidden">Debía haber</span>
                        {money(c.montoCierreSistema)}
                      </span>
                      <span className="whitespace-nowrap font-semibold tabular-nums text-tinta sm:text-right">
                        <span className="mr-1 text-xs font-normal text-tinta/60 sm:hidden">Se contó</span>
                        {money(c.montoCierreReal)}
                      </span>
                      <span className={`flex items-center gap-2.5 whitespace-nowrap font-semibold ${r.texto}`}>
                        <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${r.fondo}`} aria-hidden>
                          <Icono className="h-3 w-3 text-papel" strokeWidth={3} />
                        </span>
                        {textoResultado(c.diferencia)}
                      </span>
                      <span className="flex items-center justify-end gap-0.5 whitespace-nowrap text-[13px] font-semibold text-rojo group-hover:text-rojo-profundo">
                        Ver detalle
                        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 ease-cayla group-hover:translate-x-0.5" aria-hidden />
                      </span>
                      {c.nota && <span className="col-span-full text-xs italic text-tinta/60">{c.nota}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {pie && <div className={TABLA.pie}>{pie}</div>}
      </Tabla>
      {modal}
    </>
  );
}

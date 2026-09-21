"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoSelectNativo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { DIAS_POR_DEFECTO, PERIODOS_RAPIDOS, type PeriodoMovimientos } from "@/lib/movimientos-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import type { ComprobanteFiltro, EstadoFiltro } from "@/lib/ventas-historial-reglas";

// Filtros de Ventas ▸ Historial (ADR-0144). Viven en la URL (?rango=…&estado=…&comp=…&pago=…&sede=…),
// igual que en Movimientos y Compras: la página es un Server Component que filtra en Postgres, el
// enlace se puede compartir y «atrás» vuelve al filtro anterior. Cambiar un filtro borra el cursor de
// paginado. Los valores que llegan por props ya vienen resueltos por `filtrosDesdeParams` (un valor
// inválido de la URL no queda «apretado» acá).
//
// Sin nada en la URL rigen los últimos 30 días, y el botón «30 días» aparece apretado: nadie se
// pregunta por qué no ve la venta de hace dos meses. Tienda y vendedor solo los recibe un líder.

const PASTILLA = "label-cayla inline-flex items-center rounded-full border px-3 py-1 text-[10px] transition-colors";
const PASTILLA_ACTIVA = "border-tinta bg-tinta text-crema";
const PASTILLA_INACTIVA = "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo";

function Pastilla({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`${PASTILLA} ${activa ? PASTILLA_ACTIVA : PASTILLA_INACTIVA}`}>
      {children}
    </button>
  );
}

function Grupo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden className="label-cayla mr-0.5 text-[10px] text-tinta/50">
        {etiqueta}
      </span>
      {children}
    </div>
  );
}

type Opcion = { id: string; nombre: string };

export function FiltrosHistorialVentas({
  tiendas,
  vendedores,
  periodo,
  desde,
  hasta,
  estado,
  comprobante,
  pago,
  sede,
  vendedor,
}: {
  /** Solo para un líder: las tiendas entre las que puede elegir. Sin esta prop no hay selector. */
  tiendas?: Opcion[];
  /** Solo para un líder: quiénes registraron ventas. */
  vendedores?: Opcion[];
  periodo: PeriodoMovimientos;
  /** Las fechas que rigen, para los campos de «Personalizado» (con un período rápido, el desde que aplicó la página). */
  desde: string;
  hasta: string;
  estado: EstadoFiltro;
  comprobante: ComprobanteFiltro;
  pago: string;
  sede: string;
  vendedor: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // «Personalizado» se abre con un toque aunque todavía no haya fechas en la URL.
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(false);
  const mostrarFechas = periodo === "personalizado" || periodo === "todo" || personalizadoAbierto;

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hayFiltros = periodo !== String(DIAS_POR_DEFECTO) || estado !== "todas" || comprobante !== "todos" || !!pago || !!sede || !!vendedor;

  return (
    <div className="card-cayla space-y-3 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Grupo etiqueta="Período">
          {PERIODOS_RAPIDOS.map((dias) => (
            <Pastilla
              key={dias}
              activa={!mostrarFechas && periodo === String(dias)}
              onClick={() => {
                setPersonalizadoAbierto(false);
                aplicar({ rango: dias === DIAS_POR_DEFECTO ? "" : String(dias), desde: "", hasta: "" });
              }}
            >
              {dias} días
            </Pastilla>
          ))}
          <Pastilla activa={mostrarFechas} onClick={() => setPersonalizadoAbierto(true)}>
            Personalizado
          </Pastilla>
        </Grupo>

        <Grupo etiqueta="Estado">
          <Pastilla activa={estado === "todas"} onClick={() => aplicar({ estado: "" })}>
            Todas
          </Pastilla>
          <Pastilla activa={estado === "completada"} onClick={() => aplicar({ estado: "completada" })}>
            Completadas
          </Pastilla>
          <Pastilla activa={estado === "anulada"} onClick={() => aplicar({ estado: "anulada" })}>
            Anuladas
          </Pastilla>
        </Grupo>

        <Grupo etiqueta="Comprobante">
          <Pastilla activa={comprobante === "todos"} onClick={() => aplicar({ comp: "" })}>
            Todos
          </Pastilla>
          <Pastilla activa={comprobante === "con"} onClick={() => aplicar({ comp: "con" })}>
            Con boleta o factura
          </Pastilla>
          <Pastilla activa={comprobante === "sin"} onClick={() => aplicar({ comp: "sin" })}>
            Sin comprobante
          </Pastilla>
        </Grupo>

        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setPersonalizadoAbierto(false);
              router.push(pathname);
            }}
            className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {mostrarFechas && (
        <div className="anim-revelar flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-sand/50 px-4 py-2.5">
          {/* Con un período rápido vigente, «Desde» muestra la fecha que rige aunque no esté en la URL: el
              control dice la verdad. Tocarlo la vuelve explícita. */}
          <div className="w-44">
            <CampoFecha etiqueta="Desde" valor={periodo === "todo" ? "" : desde} onValor={(v) => aplicar({ desde: v, rango: "" })} />
          </div>
          <div className="w-44">
            <CampoFecha etiqueta="Hasta" valor={periodo === "todo" ? "" : hasta} onValor={(v) => aplicar({ hasta: v, rango: "" })} />
          </div>
          <button
            type="button"
            onClick={() => aplicar({ rango: "todo", desde: "", hasta: "" })}
            aria-pressed={periodo === "todo"}
            className={`label-cayla pb-2 text-[11px] underline-offset-2 hover:text-rojo hover:underline ${periodo === "todo" ? "text-tinta" : "text-tinta/65"}`}
          >
            Todo el historial
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        {tiendas && (
          <div className="w-48">
            <CampoSelectNativo etiqueta="Tienda" value={sede} onChange={(e) => aplicar({ sede: e.target.value })}>
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </CampoSelectNativo>
          </div>
        )}
        {vendedores && vendedores.length > 0 && (
          <div className="w-52">
            <CampoSelectNativo etiqueta="Vendedor" value={vendedor} onChange={(e) => aplicar({ vendedor: e.target.value })}>
              <option value="">Todos</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </CampoSelectNativo>
          </div>
        )}
        <div className="w-44">
          <CampoSelectNativo etiqueta="Pago" value={pago} onChange={(e) => aplicar({ pago: e.target.value })}>
            <option value="">Todos los pagos</option>
            {Object.entries(NOMBRE_METODO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </CampoSelectNativo>
        </div>
      </div>
    </div>
  );
}

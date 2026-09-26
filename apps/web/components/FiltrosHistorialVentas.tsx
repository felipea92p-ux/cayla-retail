"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, FileText, Store, UserRound, Wallet } from "lucide-react";
import { BotonFiltros, DesplegablePildora, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { DIAS_POR_DEFECTO, PERIODOS_RAPIDOS, type PeriodoMovimientos } from "@/lib/movimientos-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import type { ComprobanteFiltro, EstadoFiltro } from "@/lib/ventas-historial-reglas";

// Filtros de Ventas ▸ Historial (ADR-0147), con el mismo patrón que Catálogo y Compras: a la vista el período
// (los atajos de siempre: 7, 30 y 90 días, o fechas propias) y un botón «Filtros · N» que despliega el panel
// de píldoras —tienda, vendedor, pago, estado, comprobante—, con un chip por cada filtro aplicado que se quita
// con un toque. Viven en la URL (?rango=…&estado=…&comp=…&pago=…&sede=…): la página es un Server Component
// que filtra en Postgres, el enlace se puede compartir y «atrás» vuelve al filtro anterior. Cambiar un filtro
// borra el cursor de paginado. Los valores llegan ya resueltos por `filtrosDesdeParams`: uno inválido de la URL
// no queda «apretado» acá. Sin nada en la URL rigen los últimos 30 días y «30 días» aparece apretado: nadie se
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

type Opcion = { id: string; nombre: string };
type Chip = { texto: string; quitar: Record<string, string> };

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
  incluirPrueba,
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
  /** D-54 (ADR-0159): con el toggle apagado (el default) las ventas `es_prueba` ni siquiera llegan de la base. */
  incluirPrueba: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activos = [sede, vendedor, pago, estado !== "todas" ? estado : "", comprobante !== "todos" ? comprobante : ""].filter(Boolean).length;
  const [panelAbierto, setPanelAbierto] = useState(activos > 0);
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

  const chips = (
    [
      sede && { texto: tiendas?.find((t) => t.id === sede)?.nombre ?? "Tienda", quitar: { sede: "" } },
      vendedor && { texto: vendedores?.find((v) => v.id === vendedor)?.nombre ?? "Vendedor", quitar: { vendedor: "" } },
      pago && { texto: (NOMBRE_METODO as Record<string, string>)[pago] ?? pago, quitar: { pago: "" } },
      estado !== "todas" && { texto: estado === "anulada" ? "Anuladas" : "Completadas", quitar: { estado: "" } },
      comprobante !== "todos" && { texto: comprobante === "con" ? "Con boleta o factura" : "Sin comprobante", quitar: { comp: "" } },
    ] as (Chip | false | "")[]
  ).filter((c): c is Chip => !!c);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-1.5">
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
          {/* D-54 (ADR-0159): apagado por defecto — las ventas de prueba (archivadas, nunca borradas) ni
              siquiera se piden a la base. Aparte de las demás píldoras porque no es un filtro del día a
              día, es una excepción puntual («¿dónde quedó esa venta de prueba de antes de salir en vivo?»). */}
          <Pastilla activa={incluirPrueba} onClick={() => aplicar({ prueba: incluirPrueba ? "" : "1" })}>
            Con datos de prueba
          </Pastilla>
        </div>
        {/* `BotonFiltros` trae su `mt-1.5` para alinearse con un campo con etiqueta; acá no hay etiqueta. */}
        <div className="-mt-1.5">
          <BotonFiltros abierto={panelAbierto} activos={activos} onClick={() => setPanelAbierto((v) => !v)} />
        </div>
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

      {panelAbierto && (
        <PanelPildoras>
          {tiendas && (
            <DesplegablePildora
              icono={Store}
              etiqueta="Tienda"
              valor={sede || TODOS}
              onValor={(v) => aplicar({ sede: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todas las tiendas" }, ...tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))]}
            />
          )}

          {vendedores && vendedores.length > 0 && (
            <DesplegablePildora
              icono={UserRound}
              etiqueta="Vendedor"
              valor={vendedor || TODOS}
              onValor={(v) => aplicar({ vendedor: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todos los vendedores" }, ...vendedores.map((v) => ({ valor: v.id, texto: v.nombre }))]}
            />
          )}

          <DesplegablePildora
            icono={Wallet}
            etiqueta="Pago"
            valor={pago || TODOS}
            onValor={(v) => aplicar({ pago: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todos los pagos" },
              ...Object.entries(NOMBRE_METODO).map(([valor, etiqueta]) => ({ valor, texto: etiqueta })),
            ]}
          />

          <DesplegablePildora
            icono={CircleCheck}
            etiqueta="Estado"
            valor={estado === "todas" ? TODOS : estado}
            onValor={(v) => aplicar({ estado: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todas las ventas" },
              { valor: "completada", texto: "Completadas" },
              { valor: "anulada", texto: "Anuladas" },
            ]}
          />

          <DesplegablePildora
            icono={FileText}
            etiqueta="Comprobante"
            valor={comprobante === "todos" ? TODOS : comprobante}
            onValor={(v) => aplicar({ comp: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Con o sin comprobante" },
              { valor: "con", texto: "Con boleta o factura" },
              { valor: "sin", texto: "Sin comprobante" },
            ]}
          />
        </PanelPildoras>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={Object.keys(c.quitar).join("|")}
              type="button"
              onClick={() => aplicar(c.quitar)}
              aria-label={`Quitar filtro ${c.texto}`}
              className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
            >
              {c.texto}
              <span aria-hidden className="text-sm leading-none">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPersonalizadoAbierto(false);
              router.push(pathname);
            }}
            className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}

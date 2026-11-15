"use client";

import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { DesplegablePildora } from "@/components/ui/FiltrosPildora";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { CampoFecha } from "@/components/ui/CampoFecha";
import type { Mes } from "@/lib/facturacion-reglas";
import { hrefPorEmpresa, tramoDelMes, type Periodo } from "@/lib/reportes-por-empresa-reglas";

// Los filtros de «CAYLA y CLAURE» (ADR-0667): el período (un mes, desde que llegó la otra empresa o dos fechas) y, para el líder, la tienda (solo las que
// tienen dos empresas). Viven en la URL (`hrefPorEmpresa`): la pantalla es de servidor, el enlace se comparte y «atrás» vuelve al filtro anterior. Las tres
// formas del período son `pildora-cayla` porque eligen un período (tabla «Pestañas y segmentos» de CLAUDE.md); el mes es el `SelectorMes` de siempre.
export function FiltrosPorEmpresa({
  periodo,
  tramo,
  actual,
  hoy,
  tiendas,
  tiendaId,
  otra,
}: {
  periodo: Periodo;
  /** Las fechas que usó la base (en «desde que llegó», las únicas que hay). */
  tramo: { desde: string; hasta: string } | null;
  actual: Mes;
  hoy: string;
  /** Las tiendas donde se puede mirar; con una sola no se dibuja el filtro. */
  tiendas: { id: string; nombre: string }[];
  tiendaId: string;
  /** El nombre de la empresa que no es la casa («CLAURE»), para «Desde que llegó CLAURE»; `null` si no se supo. */
  otra: string | null;
}) {
  const router = useRouter();
  const tiendaEnUrl = tiendas.length > 1 ? tiendaId : null;
  const ir = (p: Periodo, tienda: string | null = tiendaEnUrl) => router.push(hrefPorEmpresa({ periodo: p, tienda }));
  const mesHoy: Periodo = { modo: "mes", mes: actual, ...tramoDelMes(actual, hoy) };
  const fechas = periodo.modo === "fechas" ? periodo : { desde: tramo?.desde ?? mesHoy.desde, hasta: tramo?.hasta ?? hoy };

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5">
      <div role="group" aria-label="Período" data-guia="empresas.periodo" className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="pildora-cayla" aria-pressed={periodo.modo === "mes"} onClick={() => periodo.modo !== "mes" && ir(mesHoy)}>
          Un mes
        </button>
        <button type="button" className="pildora-cayla" aria-pressed={periodo.modo === "inicio"} onClick={() => periodo.modo !== "inicio" && ir({ modo: "inicio" })}>
          {otra ? `Desde que llegó ${otra}` : "Desde que llegó"}
        </button>
        <button
          type="button"
          className="pildora-cayla"
          aria-pressed={periodo.modo === "fechas"}
          onClick={() => periodo.modo !== "fechas" && ir({ modo: "fechas", desde: fechas.desde, hasta: fechas.hasta })}
        >
          Elegir fechas
        </button>
      </div>
      {periodo.modo === "mes" && <SelectorMes guia="empresas.mes" valor={periodo.mes} actual={actual} onCambiar={(m) => ir({ modo: "mes", mes: m, ...tramoDelMes(m, hoy) })} />}
      {periodo.modo === "fechas" && (
        <div data-guia="empresas.fechas" className="flex flex-wrap items-end gap-2.5">
          <div className="w-40">
            <CampoFecha etiqueta="Desde" valor={periodo.desde} max={periodo.hasta} onValor={(v) => v && ir({ modo: "fechas", desde: v, hasta: periodo.hasta })} />
          </div>
          <div className="w-40">
            <CampoFecha etiqueta="Hasta" valor={periodo.hasta} min={periodo.desde} max={hoy} onValor={(v) => v && ir({ modo: "fechas", desde: periodo.desde, hasta: v })} />
          </div>
        </div>
      )}
      {tiendas.length > 1 && (
        <div data-guia="empresas.tienda">
          <DesplegablePildora
            icono={Store}
            etiqueta="Tienda"
            valor={tiendaId}
            onValor={(v) => ir(periodo, v)}
            opciones={tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Building2, Store } from "lucide-react";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { paramDeMes, type Mes } from "@/lib/facturacion-reglas";
import type { EmpresaDeReporte } from "@/lib/reportes-empresa-reglas";
import { hrefVentasDelMes } from "@/lib/reportes-ventas-reglas";

// Los filtros de «Ventas del mes» (maqueta docs/maquetas/reportes-ventas-2026-11/): el mes («‹ Octubre 2026 ›»), la tienda y, donde conviven dos empresas
// (Lima, ADR-0665), la empresa (CAYLA o CLAURE). Viven en la URL (`?m=2026-10&tienda=<id>&emp=claure`): la pantalla es de servidor, el enlace se puede compartir
// y «atrás» vuelve al filtro anterior. `corte` se conserva al cambiar de mes, de tienda o de empresa (el de la tabla de abajo). `tiendas` es `null` cuando la
// cuenta ve una sola (la suya): no hay nada que elegir y el filtro no se dibuja; `empresas` es `null` donde opera una sola empresa. Al cambiar de tienda la
// empresa se quita: la nueva tienda puede no tener dos, y elegirla de nuevo es un toque.
export function FiltrosReporteMes({
  mes,
  actual,
  tiendas,
  tiendaId,
  empresas,
  empresaClave,
  corte,
}: {
  mes: Mes;
  actual: Mes;
  tiendas: { id: string; nombre: string }[] | null;
  tiendaId: string | null;
  empresas: EmpresaDeReporte[] | null;
  empresaClave: string | null;
  corte: string | null;
}) {
  const router = useRouter();
  const ir = (m: Mes, tienda: string | null, empresa: string | null) => router.push(hrefVentasDelMes({ mes: paramDeMes(m), tienda, empresa, corte }));
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5">
      <SelectorMes guia="reportes.mes" valor={mes} actual={actual} onCambiar={(m) => ir(m, tiendaId, empresaClave)} />
      {tiendas && tiendas.length > 1 && (
        <div data-guia="reportes.tienda">
          <DesplegablePildora
            icono={Store}
            etiqueta="Tienda"
            valor={tiendaId ?? TODOS}
            onValor={(v) => ir(mes, v === TODOS ? null : v, null)}
            opciones={[{ valor: TODOS, texto: "Todas las tiendas" }, ...tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))]}
          />
        </div>
      )}
      {empresas && (
        <div data-guia="reportes.empresa">
          <DesplegablePildora
            icono={Building2}
            etiqueta="Empresa"
            valor={empresaClave ?? TODOS}
            onValor={(v) => ir(mes, tiendaId, v === TODOS ? null : v)}
            opciones={[{ valor: TODOS, texto: "Todas" }, ...empresas.map((e) => ({ valor: e.clave, texto: e.nombre }))]}
          />
        </div>
      )}
    </div>
  );
}

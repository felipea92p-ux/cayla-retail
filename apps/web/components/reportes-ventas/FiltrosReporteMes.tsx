"use client";

import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { paramDeMes, type Mes } from "@/lib/facturacion-reglas";

// Los dos filtros de «Ventas del mes» (maqueta docs/maquetas/reportes-ventas-2026-11/): el mes («‹ Octubre 2026 ›») y la tienda. Viven en la URL
// (`?m=2026-10&tienda=<id>`): la pantalla es de servidor, el enlace se puede compartir y «atrás» vuelve al filtro anterior. `tiendas` es `null`
// cuando la cuenta ve una sola (la suya): no hay nada que elegir y el filtro no se dibuja.
export function FiltrosReporteMes({ mes, actual, tiendas, tiendaId }: { mes: Mes; actual: Mes; tiendas: { id: string; nombre: string }[] | null; tiendaId: string | null }) {
  const router = useRouter();
  const ir = (m: Mes, tienda: string | null) => router.push(`/vender/reportes?m=${paramDeMes(m)}${tienda ? `&tienda=${tienda}` : ""}`);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5">
      <SelectorMes valor={mes} actual={actual} onCambiar={(m) => ir(m, tiendaId)} />
      {tiendas && tiendas.length > 1 && (
        <DesplegablePildora
          icono={Store}
          etiqueta="Tienda"
          valor={tiendaId ?? TODOS}
          onValor={(v) => ir(mes, v === TODOS ? null : v)}
          opciones={[{ valor: TODOS, texto: "Todas las tiendas" }, ...tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))]}
        />
      )}
    </div>
  );
}

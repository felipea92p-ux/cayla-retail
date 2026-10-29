"use client";

import { useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, TABLA, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { soles } from "@/lib/compras-reglas";
import { horaDeMovimiento, totalesDeLaLista, type MovimientoCompradora } from "@/lib/mi-plata-reglas";
import { DetalleDeFila } from "./DetalleDeFila";
import { ICONO_MOVIMIENTO } from "./iconos";

// «En esta ronda» en PC (maqueta docs/maquetas/mis-compras-pc-mesa-2026-10/, Felipe 2026-10-28): una tabla con hora, movimiento, estado y
// monto, y el total al pie. Solo desde `lg`: en el celular y la tablet sigue la lista de `ListaDelDia` (la tabla de 4 columnas no cabe en
// 375 px). Al tocar una fila se abre la misma hoja que en la lista. Los estados son chips: ámbar si falta mandar, verde si ya salió, y quién
// lo revisa en pizarra (informativo: lo que falta lo hace Compras).

const COLUMNAS: Columna[] = [{ titulo: "Hora" }, { titulo: "Movimiento" }, { titulo: "Estado" }, { titulo: "Monto", alinear: "der" }];
const PLANTILLA = "lg:grid-cols-[4rem_minmax(0,1.6fr)_minmax(0,1.3fr)_8rem]";

function FilaDeTabla({ m }: { m: MovimientoCompradora }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLButtonElement>(null);
  const Icono = ICONO_MOVIMIENTO[m.icono];
  return (
    <>
      <button ref={origen} type="button" aria-haspopup="dialog" onClick={() => setAbierta(true)} className={`${fila(PLANTILLA, "w-full items-center text-left")} text-sm text-tinta`}>
        <span className={celda("izq", "tabular-nums text-taupe")}>{horaDeMovimiento(m) ?? "—"}</span>
        <span className={celda("izq", "flex items-center gap-3 overflow-visible")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hueso text-tinta">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{m.titulo}</span>
            <span className="block truncate text-xs text-taupe">{m.resumen}</span>
          </span>
        </span>
        <span className={celda("izq", "flex flex-wrap items-center gap-1.5 overflow-visible")}>
          {m.envio && <Chip tono={m.envio.tono}>{m.envio.texto}</Chip>}
          <Chip tono={m.estado.pendiente ? "pizarra" : "verde"} title={m.estado.detalle}>
            {m.estado.texto}
          </Chip>
        </span>
        <span className={celda("der", m.entra ? "text-verde" : "text-tinta")}>
          {m.entra ? "+" : "−"} {m.monto}
        </span>
      </button>
      {abierta && <DetalleDeFila m={m} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

export function TablaDeLaRonda({ actuales }: { actuales: MovimientoCompradora[] }) {
  const { entro, salio } = totalesDeLaLista(actuales);
  return (
    <Tabla className="max-lg:hidden">
      <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} visible="hidden lg:grid" />
      {actuales.map((m) => (
        <FilaDeTabla key={m.clave} m={m} />
      ))}
      <div className={`${TABLA.pie} flex flex-wrap justify-between gap-x-4`}>
        <span>
          Entró <b className="font-semibold tabular-nums text-tinta">{soles(entro)}</b> · salió <b className="font-semibold tabular-nums text-tinta">{soles(salio)}</b>
        </span>
      </div>
    </Tabla>
  );
}

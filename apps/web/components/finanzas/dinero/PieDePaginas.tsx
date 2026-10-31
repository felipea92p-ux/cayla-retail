"use client";

import { Paginas } from "@/components/ui/Paginas";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TAMANOS_PAGINA, type TamanoPagina } from "@/lib/dinero-estados-reglas";

/** El pie de una lista larga de Cuentas y dinero (la campana, los cobros, el historial): «1–30 de 73», cuántas por página (30 o 40) y las páginas. */
export function PieDePaginas({
  texto,
  tamano,
  onTamano,
  pagina,
  totalPaginas,
  onPagina,
}: {
  texto: string;
  tamano: TamanoPagina;
  onTamano: (t: TamanoPagina) => void;
  pagina: number;
  totalPaginas: number;
  onPagina: (p: number) => void;
}) {
  return (
    <div className="dp-pie">
      <span className="flex flex-wrap items-center gap-3 tabular-nums">
        {texto}
        <SegmentoDeslizante
          etiqueta="Cuántas por página"
          valor={String(tamano)}
          onCambio={(c) => onTamano(Number(c) as TamanoPagina)}
          opciones={TAMANOS_PAGINA.map((n) => ({ clave: String(n), etiqueta: String(n) }))}
        />
        por página
      </span>
      <Paginas pagina={pagina} totalPaginas={totalPaginas} onPagina={onPagina} />
    </div>
  );
}

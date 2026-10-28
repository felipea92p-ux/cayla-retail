import type { CSSProperties, ReactNode } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { RepartoEmpresas as Reparto } from "@/lib/vendido-por-empresa-reglas";

// «De quién es lo vendido» (ADR-0532): cuánto de lo vendido es de CAYLA y cuánto de CLAURE, en Caja y en el Historial de ventas de Lima.
// Solo dibuja: el reparto (prenda por prenda, sin anuladas) y cuándo se muestra los decide `repartoDeEmpresas`. Sin hooks: sirve en un
// Server Component (Historial) y dentro del tablero cliente de Caja.

const soles = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// CAYLA en tinta (la casa) y CLAURE en pizarra, el mismo tono de su insignia (`InsigniaEmpresa`). Una tercera empresa, en taupe.
const COLOR: Record<string, string> = { cayla: "bg-tinta", claure: "bg-pizarra" };
const colorDe = (clave: string) => COLOR[clave] ?? "bg-taupe";

export function RepartoEmpresas({
  reparto,
  frase,
  guia,
  indice,
  enHoja = false,
  className = "",
}: {
  reparto: Reparto;
  /** Qué se está repartiendo, en una línea: «Lo vendido hoy, prenda por prenda.» */
  frase: ReactNode;
  guia?: string;
  /** Su lugar en la cascada de entrada de la pantalla (`anim-sube`). */
  indice?: number;
  /** Dentro de una hoja (el detalle de un cierre): la tarjeta de sus vecinas y la barra sin entrada (ADR-0136). */
  enHoja?: boolean;
  className?: string;
}) {
  const nada = reparto.total === 0;
  return (
    <section
      data-guia={guia}
      aria-label="De quién es lo vendido"
      className={`${enHoja ? "min-w-0 rounded-2xl border border-sand bg-papel px-[18px] py-4" : "card-cayla p-5"} ${indice !== undefined ? "anim-sube" : ""} ${className}`}
      style={indice !== undefined ? ({ "--i": indice } as CSSProperties) : undefined}
    >
      <TituloSeccion nivel={enHoja ? 3 : 2} dato={<b className="tabular-nums">{soles(reparto.total)}</b>}>De quién es lo vendido</TituloSeccion>
      <p className="mt-1 text-[13px] text-taupe">{frase}</p>
      <BarraApilada
        className="mt-4"
        sinEntrada={enHoja}
        unidad="soles"
        formato={soles}
        etiqueta={`Lo vendido, ${soles(reparto.total)}: ${reparto.partes.map((p) => `${p.nombre} ${soles(p.total)}, ${p.pct} %`).join(" · ")}`}
        segmentos={reparto.partes.map((p) => ({ clave: p.empresaId, nombre: p.nombre, valor: p.total, clase: colorDe(p.clave) }))}
      />
      <dl className="mt-4 grid grid-cols-2 gap-4">
        {reparto.partes.map((p) => (
          <div key={p.empresaId} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-tinta">
              <MuestraTramo clase={colorDe(p.clave)} />
              {p.nombre}
            </dt>
            <dd className="font-display text-2xl leading-tight tabular-nums text-tinta sm:text-[28px]">{soles(p.total)}</dd>
            <dd className="text-[12.5px] text-tinta/65">
              {nada
                ? "Sin ventas todavía"
                : p.total === 0
                  ? "Nada vendido"
                  : `${p.pct} % · ${p.unidades} ${p.unidades === 1 ? "prenda" : "prendas"} en ${p.ventas} ${p.ventas === 1 ? "venta" : "ventas"}`}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-tinta/65">
        Cada prenda suma a la tienda de la que es, por lo que se cobró de ella. Una boleta con prendas de las dos se parte; los pagos no, porque es un solo cajón.
      </p>
    </section>
  );
}

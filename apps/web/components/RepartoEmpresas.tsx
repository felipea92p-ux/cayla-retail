import type { CSSProperties, ReactNode } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { RepartoEmpresas as Reparto } from "@/lib/vendido-por-empresa-reglas";

// «De quién es lo vendido» (ADR-0532): cuánto de lo vendido es de CAYLA y cuánto de CLAURE, en Caja y en el Historial de ventas de Lima.
// Solo dibuja: el reparto (prenda por prenda, sin anuladas) y cuándo se muestra los decide `repartoDeEmpresas`. Sin hooks: sirve en un
// Server Component (Historial) y dentro del tablero cliente de Caja.

const soles = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// CAYLA en tinta (la casa) y CLAURE en pizarra, el mismo tono de su insignia (`InsigniaEmpresa`). Una tercera empresa, en taupe.
// ADR-0683: la casa en tinta y cada aliada, en su orden, pizarra y luego taupe (CLAURE, la primera, queda en pizarra como siempre).
const TONOS_ALIADAS = ["bg-pizarra", "bg-taupe"] as const;
const colorDe = (clave: string, aliadas: readonly string[]) =>
  clave === "cayla" ? "bg-tinta" : TONOS_ALIADAS[Math.max(0, aliadas.indexOf(clave)) % TONOS_ALIADAS.length]!;

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
  const aliadas = reparto.partes.map((p) => p.clave).filter((c) => c !== "cayla");
  return (
    <section
      data-guia={guia}
      aria-label="De quién es lo vendido"
      className={`${enHoja ? "min-w-0 rounded-2xl border border-sand bg-papel px-[18px] py-4" : "card-cayla p-5"} ${indice !== undefined ? "anim-sube" : ""} ${className}`}
      style={indice !== undefined ? ({ "--i": indice } as CSSProperties) : undefined}
    >
      <TituloSeccion
        nivel={enHoja ? 3 : 2}
        dato={<b className="tabular-nums">{soles(reparto.total)}</b>}
        ayuda="Cada prenda suma a la tienda dueña, por lo cobrado. Una boleta mixta se parte; los pagos no: es un solo cajón."
      >
        De quién es lo vendido
      </TituloSeccion>
      <p className="texto-bajada">{frase}</p>
      <BarraApilada
        className="mt-4"
        sinEntrada={enHoja}
        unidad="soles"
        formato={soles}
        etiqueta={`Lo vendido, ${soles(reparto.total)}: ${reparto.partes.map((p) => `${p.nombre} ${soles(p.total)}, ${p.pct} %`).join(" · ")}`}
        segmentos={reparto.partes.map((p) => ({ clave: p.empresaId, nombre: p.nombre, valor: p.total, clase: colorDe(p.clave, aliadas) }))}
      />
      <dl className="mt-4 grid grid-cols-2 gap-4">
        {reparto.partes.map((p) => (
          <div key={p.empresaId} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-tinta">
              <MuestraTramo clase={colorDe(p.clave, aliadas)} />
              {p.nombre}
            </dt>
            <dd className="font-display text-2xl leading-tight tabular-nums text-tinta sm:text-[28px]">{soles(p.total)}</dd>
            <dd className="texto-detalle">
              {nada
                ? "Sin ventas todavía"
                : p.total === 0
                  ? "Nada vendido"
                  : `${p.pct} % · ${p.unidades} ${p.unidades === 1 ? "prenda" : "prendas"} en ${p.ventas} ${p.ventas === 1 ? "venta" : "ventas"}`}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { TEXTO_PAPEL, traerlaCosto, type GastoDeOrden } from "@/lib/gastos-viaje-reglas";

// «Traerla costó S/ X» (ADR-0362, fase 6 · actividad 3; decisión 20: el costo de traer una compra se ve junto a ella, nunca en el costo de
// la prenda). Los gastos del viaje de esta orden, con lo que le tocó a ella: un gasto de varias órdenes se reparte según el total de cada
// una y aquí se ve su parte («de S/ 100.00, entre 2 órdenes»). Sin gastos, no se dibuja: el botón «+ Gasto del viaje» ya está arriba.
// Sin columnas (menos de 40 rem disponibles), cada gasto en un renglón con su cuenta.

const PLANTILLA = "@min-[40rem]:grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_7rem]";
const EN_COLUMNAS = "hidden @min-[40rem]:block";

export function GastosDeOrden({ gastos }: { gastos: readonly GastoDeOrden[] | null | undefined }) {
  if (!gastos || gastos.length === 0) return null;
  const total = traerlaCosto(gastos);
  return (
    <section aria-label="Lo que costó traerla" data-guia="orden.gastos-viaje" className="space-y-2">
      <TituloGrupo cuenta={`${soles(total)} · ${gastos.length === 1 ? "1 gasto" : `${gastos.length} gastos`}`}>Traerla costó</TituloGrupo>
      <Tabla>
        <div className="hidden @min-[40rem]:block">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Fecha" },
              { titulo: "Qué" },
              { titulo: "Papel" },
              { titulo: "Salió de" },
              { titulo: "Le toca", alinear: "der" },
            ]}
          />
        </div>
        {gastos.map((g) => (
          <div key={g.gastoId} className={fila(PLANTILLA)}>
            <span className={celda("izq", `${EN_COLUMNAS} tabular-nums text-tinta/80`)}>{diaMes(g.fecha)}</span>
            <span className={celda("izq", "whitespace-normal text-tinta")}>
              {g.descripcion}
              <span className="block text-xs text-taupe">{g.tipo === "mercaderia" ? "Para traer la mercadería" : "Del viaje"}</span>
              {/* Sin columnas: lo demás en un renglón. */}
              <span className="block text-xs tabular-nums text-taupe @min-[40rem]:hidden">
                {[diaMes(g.fecha), TEXTO_PAPEL[g.papel], g.cuenta].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className={celda("izq", `${EN_COLUMNAS} text-tinta/80`)}>{TEXTO_PAPEL[g.papel]}</span>
            <span className={celda("izq", `${EN_COLUMNAS} text-tinta/80`)}>{g.cuenta ?? "—"}</span>
            <span className={celda("der", "font-medium text-tinta")}>
              {soles(g.monto)}
              {g.ordenes > 1 && (
                <span className="block whitespace-normal text-xs font-normal text-taupe">
                  de {soles(g.montoTotal)}, entre {g.ordenes} órdenes
                </span>
              )}
            </span>
          </div>
        ))}
      </Tabla>
    </section>
  );
}

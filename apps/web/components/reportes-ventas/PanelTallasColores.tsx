import { BarraAvance } from "@/components/ui/BarraAvance";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Palette, Ruler } from "lucide-react";
import { ordenarTallas, type Ranking } from "@/lib/reportes-ranking-reglas";

// «Las tallas que se llevan» y «Los colores que se llevan» del Ranking de prendas (maqueta docs/maquetas/reportes-ventas-2026-11/): lo mismo que dice la
// tabla, pero cortado por talla y por color, CON LOS MISMOS filtros. Es `<BarraAvance>` (ADR-0358, «La barra a escala»: tinta, nunca verde). El color de
// la prenda es dato, no tema: lleva `data-color-dato` (ADR-0336).
const bloque = "anim-sube rounded-[20px] bg-papel p-5 ring-1 ring-tinta/[0.07]";
const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

export function PanelTallasColores({ r }: { r: Ranking }) {
  const tallas = ordenarTallas(r.tallas);
  const totalTallas = tallas.reduce((a, t) => a + t.unidades, 0);
  const mayorTalla = Math.max(0, ...tallas.map((t) => t.unidades));
  const colores = r.colores;
  const totalColores = r.total.unidades;
  const mayorColor = Math.max(0, ...colores.map((c) => c.unidades));

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
      <section aria-label="Las tallas que se llevan" className={bloque}>
        <TituloSeccion>Las tallas que se llevan</TituloSeccion>
        <p className="mt-0.5 text-sm text-tinta/60">Con los filtros de arriba</p>
        {tallas.length === 0 ? (
          <Vacio tamano="chico" icono={<Ruler />}>Todavía no hay ventas que mostrar.</Vacio>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {tallas.map((t) => (
              <li key={t.talla} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                <span className="font-medium">{t.talla}</span>
                <BarraAvance pct={mayorTalla > 0 ? (t.unidades / mayorTalla) * 100 : 0} alto="normal" tono="tinta" decorativa />
                <span className="text-right tabular-nums text-tinta/70">{totalTallas > 0 ? `${PORCENTAJE.format((t.unidades / totalTallas) * 100)} %` : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Los colores que se llevan" className={bloque}>
        <TituloSeccion>Los colores que se llevan</TituloSeccion>
        <p className="mt-0.5 text-sm text-tinta/60">Con los filtros de arriba</p>
        {colores.length === 0 ? (
          <Vacio tamano="chico" icono={<Palette />}>Todavía no hay ventas que mostrar.</Vacio>
        ) : (
          <>
            <ul className="mt-4 space-y-2.5">
              {colores.map((c) => (
                <li key={c.codigo} className="grid grid-cols-[1rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                  <span aria-hidden data-color-dato className="h-3.5 w-3.5 rounded-full ring-1 ring-tinta/20" style={{ backgroundColor: c.hex ?? "var(--color-hueso)" }} />
                  <span className="min-w-0">
                    <span className="block truncate">{c.nombre}</span>
                    <BarraAvance pct={mayorColor > 0 ? (c.unidades / mayorColor) * 100 : 0} alto="fina" tono="tinta" decorativa className="mt-1" />
                  </span>
                  <span className="text-right tabular-nums text-tinta/70">{totalColores > 0 ? `${PORCENTAJE.format((c.unidades / totalColores) * 100)} %` : "—"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-tinta/70">
              <b className="font-semibold text-tinta">{colores[0]!.nombre}</b> es el color que más sale
              {colores[1] ? (
                <>
                  , seguido de <b className="font-semibold text-tinta">{colores[1].nombre.toLowerCase()}</b>
                </>
              ) : null}
              .
            </p>
          </>
        )}
      </section>
    </div>
  );
}

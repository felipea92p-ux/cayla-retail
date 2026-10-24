import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { rankingDeProveedores, type RendimientoProveedor } from "@/lib/proveedor-prendas-reglas";
import { soles } from "@/lib/compras";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Encabezado, Tabla, fila, celda, type Columna } from "@/components/ui/Tabla";

// «A quién le compro y qué me deja» (lista de Proveedores, 2026-10-24): cada proveedor al que se le compró algo, con lo gastado,
// lo vendido, el margen de lo vendido y la plata que sigue parada en prendas que no se han vendido. Server Component sin estado.
// El veredicto es una palabra con su porqué (`veredictoDe`): con pocas ventas dice «Pocas ventas» y no concluye nada.

// Columnas según el ANCHO DE LA TABLA (`@container`), como la lista de arriba: angosta, proveedor · gastaste · lectura (el nombre nunca se
// aplasta); desde 48 rem suma lo vendido, el margen y la plata sin vender.
const PLANTILLA = "grid-cols-[minmax(0,1fr)_7rem_7.5rem] @3xl:grid-cols-[minmax(0,1fr)_7rem_9rem_5rem_7.5rem_7.5rem_1.25rem]";
const SOLO_ANCHA = "hidden @3xl:block";
const COLUMNAS: Columna[] = [
  { titulo: "Proveedor" },
  { titulo: "Gastaste", alinear: "der" },
  { titulo: "Ya vendido", clase: SOLO_ANCHA, ayuda: "Cuántas de las unidades compradas ya se vendieron" },
  { titulo: "Margen", alinear: "der", clase: SOLO_ANCHA, ayuda: "Ganancia de lo ya vendido sobre su precio cobrado" },
  { titulo: "Sin vender", alinear: "der", clase: SOLO_ANCHA, ayuda: "Plata que sigue en estantes en prendas de las que no se vendió ni una unidad" },
  { titulo: "Lectura" },
  { titulo: "", clase: SOLO_ANCHA },
];

const pctTexto = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })} %`);

export function ProveedoresRendimiento({ filas }: { filas: RendimientoProveedor[] }) {
  if (filas.length === 0) return null;
  const { ranking, taller } = rankingDeProveedores(filas);
  return (
    <section className="space-y-3" data-guia="proveedores.rendimiento">
      <TituloSeccion cuenta={ranking.length} dato="ordenado por lo que gastaste (sin la producción propia)">A quién le compro y qué me deja</TituloSeccion>
      <Tabla className="@container">
        <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} visible="grid" />
        {ranking.map((r) => (
          <Link key={r.proveedorId} href={`/compras/proveedores/${r.proveedorId}`} className={`${fila(PLANTILLA)} group items-center sm:items-center transition-colors hover:bg-tinta/[0.03]`}>
            <span className={celda("izq")}>
              <span className="block truncate text-sm text-tinta">{r.nombre}</span>
              <span className="block truncate text-xs text-taupe">
                {r.prendas.toLocaleString("es-PE")} {r.prendas === 1 ? "prenda" : "prendas"} · {pctTexto(r.pesoPct)} de todo lo que gastaste · {pctTexto(r.costoRealPct)} con costo real
              </span>
            </span>
            <span className={celda("der", "text-sm text-tinta")}>{soles(r.gasto)}</span>
            <span className={celda("izq", `overflow-visible ${SOLO_ANCHA}`)}>
              <span className="block text-sm tabular-nums text-tinta">{pctTexto(r.vendidoPct)}</span>
              <BarraAvance pct={r.vendidoPct ?? 0} alto="fina" tono="tinta" decorativa className="mt-1" />
            </span>
            <span className={celda("der", `text-sm text-tinta ${SOLO_ANCHA}`)}>{pctTexto(r.margenPct)}</span>
            <span className={celda("der", `text-sm text-tinta ${SOLO_ANCHA}`)}>{r.plataSinVenta > 0 ? soles(r.plataSinVenta) : "—"}</span>
            <span className={celda("izq", "overflow-visible")}>
              <Chip tono={r.veredicto.tono} title={r.veredicto.porque}>
                {r.veredicto.texto}
              </Chip>
            </span>
            <ChevronRight aria-hidden className="hidden h-4 w-4 text-tinta/40 transition-[transform,color] duration-300 ease-cayla group-hover:translate-x-1 group-hover:text-rojo @3xl:block" />
          </Link>
        ))}
      </Tabla>
      {taller && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-hueso px-5 py-3 text-sm text-tinta">
          <span>
            <b className="font-semibold">Producción propia</b> · {taller.nombre}: {taller.prendas.toLocaleString("es-PE")} {taller.prendas === 1 ? "prenda" : "prendas"}, {pctTexto(taller.pesoPct)} del gasto
          </span>
          <span className="text-xs text-taupe">No entra al ranking ni a los avisos: es lo que hace el Taller, no un proveedor.</span>
        </p>
      )}
      <p className="nota-cayla">
        «Gastaste» es lo comprado (lo que llegó por Compras, exacto, más lo de la carga inicial, estimado); «Sin vender» es la plata que sigue en estantes en prendas de las que todavía no se vendió ni una unidad, solo de lo que tiene costo real.
        Con menos de 10 unidades vendidas la lectura dice «Pocas ventas»; si la mayor parte viene de la carga inicial dice «Costo por confirmar»: el margen y la plata parada se calculan solo con costo real.
      </p>
    </section>
  );
}

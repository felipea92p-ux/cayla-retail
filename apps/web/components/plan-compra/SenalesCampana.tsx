import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Chip } from "@/components/ui/Chip";
import { celda } from "@/components/ui/Tabla";
import { enteroES } from "@/lib/plan-compra-reglas";
import type { SenalCategoria } from "@/lib/plan-compra-resultados";

// «Pedir más o impulsar» (ADR-0372, act. 2026-10-12): por categoría y contra el FIN DE ESTA CAMPAÑA. La prenda exacta que se acaba o no se
// vende, y en qué tienda, ya la dice Análisis (contra Navidad y por tienda): aquí no se repite, se lleva allá (Felipe: «si ya existe, solo
// dar una forma rápida de ir al módulo que sí lo ve»). Solo las categorías que piden algo; las que van bien no hacen ruido.

const PLANTILLA = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.1fr)]";
const VISTA = { pedir: { vista: "acaba", texto: "Qué se está acabando" }, impulsar: { vista: "nose", texto: "Qué no se vende" } } as const;

export function SenalesCampana({ senales, faltan, veAnalisis }: { senales: SenalCategoria[]; faltan: number; veAnalisis: boolean }) {
  const piden = senales.filter((s) => s.senal !== "bien");
  return (
    // Sin `overflow-hidden` en la tarjeta: recortaba el globo del «!» (Felipe 2026-10-12). Lo que sí debe quedar dentro de las esquinas (las
    // filas) va en su propia caja recortada, abajo.
    <section className="card-cayla">
      <div className={`flex flex-wrap items-center justify-between gap-2 px-5 ${piden.length === 0 ? "py-3" : "py-4"}`}>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.13em] text-taupe">
          Pedir más o impulsar
          <Ayuda titulo="Pedir más o impulsar">
            <span className="block">«Alcanza para»: lo que queda de la categoría en todas las sedes (Taller incluido), al ritmo de esta campaña.</span>
            <span className="mt-2 block">«Pide más» si se acaba antes de que termine la campaña y no va por debajo del plan. «Impúlsala» si va 20 % o más por debajo del plan y le sobra: vitrina, combo o una rebaja chica.</span>
            <span className="mt-2 block">La prenda exacta, y en qué tienda, está en Análisis.</span>
          </Ayuda>
        </p>
        {/* Sin nada que pedir, una sola línea: no ocupa lugar que la tabla necesita (Felipe 2026-10-12). */}
        {piden.length === 0 ? (
          <span className="min-w-0 flex-1 basis-72 text-sm text-tinta/75">Ninguna categoría pide nada hoy: todas alcanzan y van al ritmo del plan.</span>
        ) : null}
        <span className="text-xs text-taupe">
          Quedan {faltan} {faltan === 1 ? "día" : "días"} de campaña
        </span>
      </div>
      {piden.length > 0 && (
        <div className="overflow-hidden rounded-b-2xl">
          <div className={`encabezado-tabla-cayla hidden gap-x-6 px-5 py-2 sm:grid ${PLANTILLA}`} role="row">
            {(
              [
                ["Categoría", ""],
                ["Vendidas", "text-right"],
                ["Contra el plan a hoy", "text-right"],
                ["Alcanza para", "text-right"],
                ["Qué hacer", ""],
                ["La prenda exacta", ""],
              ] as const
            ).map(([t, c]) => (
              <span key={t} className={`text-xs font-normal text-taupe ${c}`} role="columnheader">
                {t}
              </span>
            ))}
          </div>
          {piden.map((s) => (
            <div key={s.id} className={`fila-cayla grid gap-x-6 gap-y-1 px-5 py-3 sm:items-center ${PLANTILLA}`} role="row">
              <span className={celda("izq", "font-semibold text-tinta")}>{s.nombre}</span>
              <span className={celda("der", "text-tinta")}>{enteroES.format(s.vendidas)}</span>
              <span className={celda("der", "text-tinta/80")}>{s.diferencia === null ? "Sin plan" : `${s.diferencia >= 0 ? "+" : "−"}${Math.abs(Math.round(s.diferencia * 100))} %`}</span>
              <span className={celda("der", "text-tinta/80")}>
                {s.alcanzaDias === null ? "—" : s.alcanzaDias >= 60 ? "toda la campaña" : `${Math.round(s.alcanzaDias)} ${Math.round(s.alcanzaDias) === 1 ? "día" : "días"}`}
              </span>
              <span>{s.senal === "pedir" ? <Chip tono="rojo">Pide más</Chip> : <Chip tono="ambar">Impúlsala</Chip>}</span>
              <span>
                {veAnalisis && (
                  <Link href={`/inventario/resumen?vista=${VISTA[s.senal as "pedir" | "impulsar"].vista}`} className="inline-flex items-center gap-1 text-sm text-pizarra underline-offset-2 hover:underline">
                    {VISTA[s.senal as "pedir" | "impulsar"].texto}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

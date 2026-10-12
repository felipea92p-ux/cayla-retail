import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { enteroES } from "@/lib/plan-compra-reglas";
import type { cierre as calcularCierre } from "@/lib/plan-compra-resultados";

// El cierre de una campaña (ADR-0372, act. 2026-10-12 · lo que miden los grandes de moda: el sell-through). Qué parte de lo que había se
// vendió a precio lleno, cuánto con rebaja y cuánto sobró, por categoría; y por dónde empezar a liquidar, que ya lo resuelve Análisis ▸ No
// se vende (aquí solo se lleva allá). Solo lee.

type Cierre = NonNullable<ReturnType<typeof calcularCierre>>;
const pct = (n: number) => `${Math.round(n * 100)} %`;

export function CierreCampana({ c, veAnalisis }: { c: Cierre; veAnalisis: boolean }) {
  return (
    <section data-guia="plan-resultados.cierre" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Vendido a precio lleno" valor={pct(c.pctLleno)}>
          de lo que había para la campaña
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Con rebaja" valor={pct(c.pctRebaja)}>
          vendido por debajo de su precio
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Sobra" valor={enteroES.format(c.sobra)} unidad="prendas">
          al cerrar, en todas las sedes
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Liquidar primero" valor={c.liquidarPrimero?.nombre ?? null}>
          {c.liquidarPrimero ? (
            <span className="block">
              Es lo que más sobra ({enteroES.format(c.liquidarPrimero.sobra)}).
              {veAnalisis && (
                <Link href="/inventario/resumen?vista=nose" className="mt-1 flex items-center gap-1 text-pizarra underline-offset-2 hover:underline">
                  Qué no se vende, en Análisis
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              )}
            </span>
          ) : (
            "No sobró nada"
          )}
        </TarjetaCifra>
      </div>

      <div className="card-cayla p-5">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-taupe">
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase="bg-verde" /> A precio lleno
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase="bg-ambar" /> Con rebaja
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase="bg-sand" /> Sobra
          </span>
          <Ayuda titulo="Lo que había">
            Sin facturas de compra ligadas al plan, «lo que había» se mide como lo vendido en la campaña más lo que quedó al cerrar, en todas las
            sedes (sin Cuarentena). «Con rebaja» es lo cobrado por debajo de su precio de etiqueta.
          </Ayuda>
        </div>
        <ol className="space-y-3">
          {c.categorias.map((x) => (
            <li key={x.id} className="grid items-center gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_14rem]">
              <span className="truncate font-semibold text-tinta">{x.nombre}</span>
              {/* La pieza única de barra apilada (ADR-0358): la pista de arena es lo que había; lo que no se llena es lo que sobró. */}
              <BarraApilada
                alto={12}
                total={x.total}
                unidad="prendas"
                etiqueta={`${x.nombre}: ${x.lleno} a precio lleno, ${x.rebajadas} con rebaja y ${x.sobra} que sobran, de ${x.total}`}
                segmentos={[
                  { clave: "lleno", nombre: "A precio lleno", valor: x.lleno, clase: "bg-verde" },
                  { clave: "rebaja", nombre: "Con rebaja", valor: x.rebajadas, clase: "bg-ambar" },
                ]}
              />
              <span className="tabular-nums text-tinta/75">
                {pct(x.pctLleno)} a precio lleno · sobran {enteroES.format(x.sobra)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

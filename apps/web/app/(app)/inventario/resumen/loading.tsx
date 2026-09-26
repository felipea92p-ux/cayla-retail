// Esqueleto de carga del Análisis de inventario (ADR-0101 → ADR-0121 → ADR-0138). Pisa el
// "Cargando…" genérico de (app)/loading.tsx porque acá corre una RPC analítica sobre el ledger y la
// silueta —título, pestañas, una barra de período y filtros, y la tabla— evita el salto de
// "pantalla vacía → todo de golpe". Misma receta que compras/loading.tsx.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingResumen() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando análisis de inventario">
        <div className="space-y-2">
          <div className="h-3 w-44 rounded bg-sand" />
          <div className="h-8 w-80 max-w-full rounded bg-sand" />
          <div className="h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="h-9 w-64 max-w-full rounded-md bg-sand/70" />
          <div className="hidden h-3 w-28 rounded bg-sand/70 sm:block" />
        </div>
        <div className="card-cayla space-y-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="h-2.5 w-28 rounded bg-sand" />
              <div className="h-9 w-[28rem] max-w-full rounded-md bg-sand/70" />
            </div>
            <div className="flex gap-4">
              <div className="h-9 w-44 rounded-md bg-sand/70" />
              <div className="h-9 w-44 rounded-md bg-sand/70" />
            </div>
          </div>
          <div className="h-9 w-full rounded-md bg-sand/70" />
        </div>
        <div className="card-cayla divide-y divide-tinta/10">
          <div className="space-y-2 px-4 py-5">
            <div className="h-5 w-64 rounded bg-sand" />
            <div className="h-3 w-[30rem] max-w-full rounded bg-sand/70" />
          </div>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="space-y-1.5">
                <div className="h-3 w-44 rounded bg-sand" />
                <div className="h-2.5 w-28 rounded bg-sand/70" />
              </div>
              <div className="ml-auto hidden h-3 w-2/5 rounded bg-sand/70 min-[900px]:block" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

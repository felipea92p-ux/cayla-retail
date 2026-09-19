// Esqueleto de carga del Resumen (ADR-0101, rehecho en ADR-0113). Pisa el
// "Cargando…" genérico de (app)/loading.tsx porque acá corre una RPC analítica
// sobre el ledger y la silueta —título, franja de período y filtros, cinco
// señales, tabla y tres bloques— evita el salto de "pantalla vacía → todo de
// golpe". Misma receta que compras/loading.tsx.
export default function LoadingResumen() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando resumen de inventario">
      <div className="space-y-2">
        <div className="h-3 w-44 rounded bg-sand" />
        <div className="h-8 w-80 rounded bg-sand" />
        <div className="h-3 w-[26rem] max-w-full rounded bg-sand/70" />
      </div>
      <div className="grid gap-3 min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,0.62fr)]">
        <div className="card-cayla h-[5.25rem]" />
        <div className="card-cayla h-[5.25rem]" />
      </div>
      <div className="grid grid-cols-2 gap-3 min-[1100px]:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card-cayla flex items-start gap-3 p-3.5">
            <div className="h-11 w-11 shrink-0 rounded-full bg-sand" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-sand" />
              <div className="h-7 w-14 rounded bg-sand" />
              <div className="h-3 w-full rounded bg-sand/70" />
            </div>
          </div>
        ))}
      </div>
      <div className="card-cayla divide-y divide-tinta/10">
        <div className="space-y-2 px-5 py-5">
          <div className="h-5 w-56 rounded bg-sand" />
          <div className="h-3 w-[30rem] max-w-full rounded bg-sand/70" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3">
            <div className="h-9 w-9 shrink-0 rounded-md bg-sand/70" />
            <div className="h-3 w-48 rounded bg-sand" />
            <div className="ml-auto hidden h-3 w-2/5 rounded bg-sand/70 min-[1024px]:block" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 min-[1024px]:grid-cols-2 min-[1360px]:grid-cols-[1fr_1fr_1.3fr]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-cayla h-56" />
        ))}
      </div>
    </div>
  );
}

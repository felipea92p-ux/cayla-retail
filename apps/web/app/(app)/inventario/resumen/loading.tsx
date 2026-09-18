// Esqueleto de carga del Resumen (ADR-0101). Pisa el "Cargando…" genérico de
// (app)/loading.tsx porque acá corre una RPC analítica sobre el ledger y la
// silueta —título, dos filas de cuatro tarjetas, tabla, dos bloques— evita el
// salto de "pantalla vacía → todo de golpe". Misma receta que compras/loading.tsx.
export default function LoadingResumen() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando resumen de inventario">
      <div className="space-y-2">
        <div className="h-3 w-40 rounded bg-sand" />
        <div className="h-7 w-72 rounded bg-sand" />
        <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
      </div>
      {[0, 1].map((fila) => (
        <div key={fila} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-cayla space-y-2 p-5">
              <div className="h-3 w-28 rounded bg-sand" />
              <div className="h-8 w-20 rounded bg-sand" />
              <div className="h-3 w-36 rounded bg-sand/70" />
            </div>
          ))}
        </div>
      ))}
      <div className="card-cayla divide-y divide-tinta/10">
        <div className="px-5 py-3">
          <div className="h-3 w-44 rounded bg-sand" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-9 w-9 rounded-md bg-sand/70" />
            <div className="h-3 flex-1 rounded bg-sand/70" />
            <div className="h-5 w-28 rounded-full bg-sand/70" />
            <div className="h-3 w-16 rounded bg-sand" />
            <div className="h-3 w-20 rounded bg-sand" />
            <div className="h-5 w-20 rounded-full bg-sand/70" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card-cayla space-y-3 p-5">
            <div className="h-3 w-40 rounded bg-sand" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-3 rounded bg-sand/70" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

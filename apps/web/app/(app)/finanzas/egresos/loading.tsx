// Esqueleto de carga de Gastos: título, tarjetas por sede y una lista. Sin texto: la forma ya dice qué viene.
export default function LoadingGastos() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Cargando gastos">
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-sand" />
        <div className="h-8 w-40 rounded bg-sand" />
        <div className="h-3 w-56 rounded bg-sand/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-cayla space-y-2 p-5">
            <div className="h-3 w-24 rounded bg-sand" />
            <div className="h-7 w-32 rounded bg-sand" />
            <div className="h-3 w-40 rounded bg-sand/70" />
          </div>
        ))}
      </div>
      <div className="card-cayla space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 w-full rounded bg-sand/70" />
        ))}
      </div>
    </div>
  );
}

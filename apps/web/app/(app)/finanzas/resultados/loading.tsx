// Esqueleto de carga del Estado de Resultados: título y tarjetas con su columna de cifras. Sin texto: la forma dice qué viene.
export default function LoadingResultados() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Cargando el estado de resultados">
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-sand" />
        <div className="h-8 w-64 rounded bg-sand" />
        <div className="h-3 w-72 rounded bg-sand/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`card-cayla space-y-3 p-5 ${i === 0 ? "lg:col-span-full" : ""}`}>
            <div className="h-3 w-24 rounded bg-sand" />
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="flex justify-between">
                <div className="h-4 w-32 rounded bg-sand/70" />
                <div className="h-4 w-20 rounded bg-sand/70" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Esqueleto de carga de Compras. Pisa el "Cargando…" genérico de (app)/loading.tsx
// porque las cuatro pantallas del módulo tienen la misma silueta —título,
// tres cifras, filtros, tabla— y dibujarla en gris mientras Postgres responde
// evita el salto de "pantalla vacía → todo de golpe". Sin texto: la forma ya
// dice qué viene.
export default function LoadingCompras() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando compras">
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-sand" />
        <div className="h-7 w-64 rounded bg-sand" />
        <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-cayla space-y-2 p-4">
            <div className="h-3 w-20 rounded bg-sand" />
            <div className="h-7 w-32 rounded bg-sand" />
            <div className="h-3 w-24 rounded bg-sand/70" />
          </div>
        ))}
      </div>
      <div className="card-cayla p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 rounded bg-sand" />
              <div className="h-9 rounded bg-sand/60" />
            </div>
          ))}
        </div>
      </div>
      <div className="card-cayla divide-y divide-tinta/10">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-3 w-20 rounded bg-sand" />
            <div className="h-3 flex-1 rounded bg-sand/70" />
            <div className="h-5 w-24 rounded-full bg-sand/70" />
            <div className="h-5 w-20 rounded-full bg-sand/70" />
            <div className="h-3 w-20 rounded bg-sand" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Esqueleto de carga del panel comercial (ADR-0110). Pisa el "Cargando…" genérico de (app)/loading.tsx porque
// acá corren tres funciones de agregación y la silueta —título, fila de cuatro tarjetas, tarjetas por tienda—
// evita el salto de "pantalla vacía → todo de golpe". Misma receta que inventario/resumen/loading.tsx.
export default function LoadingComercial() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando el panel comercial">
      <div className="space-y-2">
        <div className="h-3 w-40 rounded bg-sand" />
        <div className="h-7 w-72 rounded bg-sand" />
        <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-cayla space-y-2 p-5">
            <div className="h-3 w-28 rounded bg-sand" />
            <div className="h-8 w-24 rounded bg-sand" />
            <div className="h-3 w-36 rounded bg-sand/70" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-cayla space-y-3 p-5">
            <div className="h-3 w-32 rounded bg-sand" />
            <div className="h-8 w-28 rounded bg-sand" />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="h-3 rounded bg-sand/70" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

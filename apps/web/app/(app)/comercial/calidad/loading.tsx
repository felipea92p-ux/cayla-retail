// Esqueleto de carga de Calidad (ADR-0214). Misma receta que comercial/loading.tsx: la silueta —título, fila de
// cuatro tarjetas y una tabla— evita el salto de "pantalla vacía → todo de golpe" mientras corren dos funciones.
export default function LoadingCalidad() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la calidad de las ventas">
      <div className="space-y-2">
        <div className="h-3 w-40 rounded bg-sand" />
        <div className="h-7 w-72 rounded bg-sand" />
        <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-cayla space-y-2 p-5">
            <div className="h-3 w-28 rounded bg-sand" />
            <div className="h-8 w-20 rounded bg-sand" />
            <div className="h-3 w-36 rounded bg-sand/70" />
          </div>
        ))}
      </div>
      <div className="card-cayla space-y-3 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-3 rounded bg-sand/70" />
        ))}
      </div>
    </div>
  );
}

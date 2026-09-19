// Esqueleto de carga de Compras. Pisa el "Cargando…" genérico de (app)/loading.tsx porque las
// pantallas del módulo comparten la misma silueta —título, cuatro cifras, pestañas, buscador,
// tabla— y dibujarla mientras Postgres responde evita el salto de «pantalla vacía → todo de
// golpe». Sin texto: la forma ya dice qué viene.
//
// 2026-09-19 (ADR-0130): las piezas brillan (`cmp-sk`: un destello suave que las cruza) en lugar del
// `animate-pulse` de antes, y la silueta ahora es la de /compras — cuatro tarjetas, pestañas, buscador y
// filas con las mismas siete columnas que la tabla real (`PLANTILLA` de compras/page.tsx), para que al
// llegar los datos nada se corra de lugar. El destello es la única animación en bucle y dura mientras se
// espera; con movimiento reducido queda quieto.
const PLANTILLA = "sm:grid-cols-[8rem_1fr_7.5rem_10.75rem_11rem_7.25rem_1rem]";

export default function LoadingCompras() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando compras">
      <div className="space-y-2">
        <div className="cmp-sk h-3 w-16" />
        <div className="cmp-sk h-7 w-64" />
        <div className="cmp-sk h-3 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-cayla space-y-2 p-4">
            <div className="cmp-sk h-3 w-20" />
            <div className="cmp-sk h-7 w-32" />
            <div className="cmp-sk h-3 w-24" />
            {i < 2 && <div className="cmp-sk h-1 w-full" />}
          </div>
        ))}
      </div>
      <div className="flex gap-6 border-b border-tinta/10 pb-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="cmp-sk h-3 w-16" />
        ))}
      </div>
      <div className="flex items-end gap-3">
        <div className="cmp-sk h-9 flex-1" />
        <div className="cmp-sk hidden h-9 w-24 sm:block" />
        <div className="cmp-sk hidden h-9 w-40 sm:block" />
      </div>
      <div className="card-cayla divide-y divide-tinta/10">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`grid items-center gap-x-4 gap-y-2 px-5 py-4 ${PLANTILLA}`}>
            <div className="cmp-sk h-3 w-16" />
            <div className="cmp-sk h-3 w-3/5" />
            <div className="cmp-sk h-3 w-20" />
            <div className="cmp-sk h-5 w-24 rounded-full" />
            <div className="cmp-sk h-5 w-20 rounded-full" />
            <div className="cmp-sk h-3 w-16 sm:justify-self-end" />
            <span className="hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Esqueleto de Notas de crédito. Pisa el de /compras (que dibuja la silueta de Comprobantes) porque
// esta pantalla tiene otra: cabecera con botón, segmentado del módulo, cuatro cifras, buscador con dos
// segmentados y una lista con banda de grupo. Sin texto: la forma ya dice qué viene, y al llegar los
// datos nada se corre de lugar.
//
// Las piezas brillan con `cmp-sk` (el destello del sistema, ADR-0136), no con un pulso: es la única
// animación en bucle y dura solo mientras se espera. Con movimiento reducido queda quieta.
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_9rem_9rem_9.5rem_9rem_10rem]";

export default function LoadingNotasCredito() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando notas de crédito">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="cmp-sk h-3 w-16" />
          <div className="cmp-sk h-7 w-56" />
          <div className="cmp-sk h-3 w-[34rem] max-w-full" />
        </div>
        <div className="cmp-sk h-11 w-40" />
      </div>

      <div className="cmp-sk h-10 w-56 rounded-lg" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-cayla space-y-2 p-4">
            <div className="cmp-sk h-3 w-24" />
            <div className="cmp-sk h-7 w-32" />
            <div className="cmp-sk h-3 w-28" />
            {i === 0 && <div className="cmp-sk h-2 w-full" />}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="cmp-sk h-9 min-w-[15rem] flex-1" />
        <div className="cmp-sk hidden h-9 w-72 rounded-lg sm:block" />
        <div className="cmp-sk hidden h-9 w-56 rounded-lg sm:block" />
      </div>

      <div className="card-cayla divide-y divide-tinta/10">
        <div className="cmp-sk m-0 h-9 w-full rounded-none" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`grid items-center gap-x-4 gap-y-2 px-5 py-4 ${PLANTILLA}`}>
            <div className="cmp-sk h-3 w-3/5" />
            <div className="cmp-sk hidden h-5 w-24 rounded-full lg:block" />
            <div className="cmp-sk h-5 w-24 rounded-full" />
            <div className="cmp-sk h-5 w-20 sm:justify-self-end" />
            <div className="cmp-sk hidden h-5 w-24 rounded-full lg:block" />
            <div className="cmp-sk hidden h-7 w-28 sm:block sm:justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}

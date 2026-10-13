// Esqueleto de carga de Órdenes de insumos (como el de Compras): la silueta de la lista —título, dos cifras, buscador, píldoras y filas
// con las mismas columnas que la tabla real (`PLANTILLA` de `page.tsx`, a 64 rem)— para que al llegar los datos nada se corra de lugar.
// Sin texto: la forma ya dice qué viene. Las piezas brillan (`cmp-sk`) mientras se espera; con movimiento reducido quedan quietas.
import { EsperaPantalla } from "@/components/ui/Espera";

const PLANTILLA = "sm:grid-cols-[7.5rem_1fr_5.5rem_10rem_7.5rem_6.5rem_1rem]";

export default function LoadingOrdenesInsumo() {
  return (
    <>
      <EsperaPantalla />
      <div className="space-y-6" aria-busy="true" aria-label="Cargando órdenes de insumos">
        <div className="space-y-2">
          <div className="cmp-sk h-3 w-16" />
          <div className="cmp-sk h-7 w-64" />
          <div className="cmp-sk h-3 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="card-cayla space-y-2 p-4">
              <div className="cmp-sk h-3 w-20" />
              <div className="cmp-sk h-7 w-32" />
              <div className="cmp-sk h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="card-cayla divide-y divide-tinta/10">
          <div className="flex items-end gap-3 px-5 py-4">
            <div className="cmp-sk h-9 flex-1" />
            <div className="cmp-sk hidden h-7 w-24 rounded-full sm:block" />
            <div className="cmp-sk hidden h-7 w-24 rounded-full sm:block" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`grid items-center gap-x-4 gap-y-2 px-5 py-4 ${PLANTILLA}`}>
              <div className="cmp-sk h-3 w-16" />
              <div className="cmp-sk h-3 w-3/5" />
              <div className="cmp-sk h-3 w-12" />
              <div className="cmp-sk h-3 w-24" />
              <div className="cmp-sk h-3 w-16 sm:justify-self-end" />
              <div className="cmp-sk h-5 w-20 rounded-full" />
              <span className="hidden sm:block" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

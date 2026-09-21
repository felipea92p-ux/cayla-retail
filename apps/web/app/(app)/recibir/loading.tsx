// Esqueleto de carga de Recibir mercadería: la silueta de la pantalla (lista a la izquierda, «¿Qué llegó?» y
// los cuatro indicadores a la derecha) en gris mientras Postgres responde. Sin texto: la forma ya dice qué viene.
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingRecibir() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando recibir mercadería">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-sand" />
          <div className="h-7 w-64 rounded bg-sand" />
          <div className="h-3 w-96 max-w-full rounded bg-sand/70" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(19rem,23rem)_1fr]">
          <div className="card-cayla space-y-3 p-4">
            <div className="h-6 w-40 rounded bg-sand" />
            <div className="h-10 rounded bg-sand/60" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded bg-sand/50" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="card-cayla h-40" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="card-cayla h-24" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

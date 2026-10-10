// Mientras se leen los grupos y las categorías (dos lecturas en paralelo): el loader general (ADR-0149) y la silueta de la pantalla —
// cabecera, cuatro cifras y la tarjeta con filas—, para que no salte de «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingPlanDelPiso() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando el plan del piso">
        {/* La silueta de `EncabezadoPagina` (ADR-0220): sede y fecha, título de 46 px y la frase. */}
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-72 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[104px] rounded-[20px] bg-sand/50" />
          ))}
        </div>
        <div className="card-cayla divide-y divide-sand">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="space-y-1.5">
                <div className="h-3 w-44 rounded bg-sand" />
                <div className="h-2.5 w-20 rounded bg-sand/70" />
              </div>
              <div className="ml-auto h-9 w-48 rounded-md bg-sand/70" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

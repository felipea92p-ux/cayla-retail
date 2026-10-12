// Mientras se leen las piezas de la sede: el loader general (ADR-0149) y la silueta de la pantalla —cabecera, tres cifras y la
// tarjeta con su lista—, para que no salte de «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingLiquidacion() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la liquidación">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-56 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-[20px] bg-sand/50" />
          ))}
        </div>
        <div className="card-cayla divide-y divide-sand">
          <div className="flex flex-wrap gap-2.5 p-4">
            <div className="h-10 w-72 max-w-full rounded-md bg-sand/70" />
            <div className="h-10 w-52 rounded-md bg-sand/70" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="h-9 w-9 rounded-md bg-sand/70" />
              <div className="h-3 w-44 rounded bg-sand" />
              <div className="ml-auto h-3 w-1/4 rounded bg-sand/70" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

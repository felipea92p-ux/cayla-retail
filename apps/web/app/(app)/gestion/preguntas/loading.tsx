// Mientras se leen las preguntas del mes: el loader general (ADR-0149) y la silueta de la pantalla —cabecera, cinco cifras, los dos
// resúmenes y la tarjeta con la lista—, para que no salte de «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingPreguntasEquipo() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando las preguntas del equipo">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-80 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-[20px] bg-sand/50" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-48 rounded-[20px] bg-sand/50" />
          <div className="h-48 rounded-[20px] bg-sand/50" />
        </div>
        <div>
          <div className="card-cayla divide-y divide-sand">
            <div className="flex flex-wrap gap-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 w-28 rounded-full bg-sand/70" />
              ))}
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <div className="h-8 w-8 rounded-full bg-sand/70" />
                <div className="h-3.5 w-2/5 rounded bg-sand" />
                <div className="ml-auto h-3 w-1/4 rounded bg-sand/70" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

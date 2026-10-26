// Mientras se lee la vitrina: el loader general (ADR-0149) y la silueta de la pantalla —cabecera, pestañas, tres cifras compactas y la tarjeta
// con su barra (buscador, filtros, vista) y las prendas—, para que no salte de «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingVitrina() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando la vitrina web">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-56 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="h-10 w-72 max-w-full rounded-full bg-sand/60" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] rounded-2xl bg-sand/50" />
          ))}
        </div>
        <div className="card-cayla">
          <div className="flex items-center gap-3 border-b border-sand px-4 py-4 sm:px-5">
            <div className="h-10 flex-1 rounded-md bg-sand/70" />
            <div className="h-9 w-9 rounded-full bg-sand/60 sm:w-24" />
            <div className="h-9 w-20 rounded-lg bg-sand/60 sm:w-28" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-3.5 sm:p-5">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={`h-[19rem] rounded-2xl bg-sand/50 ${i >= 4 ? "hidden sm:block" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

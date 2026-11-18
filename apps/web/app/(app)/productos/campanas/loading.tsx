// Mientras se leen las campañas: el loader general (ADR-0149) y la silueta de la pantalla —cabecera, la pila de pases y el pase abierto
// en grande—, para que no salte de «vacía» a «todo de golpe». Sin pestañas: Campañas y ofertas es un solo grupo (ADR-0655).
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingCampanas() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando las campañas">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-40 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)]">
          <div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-[76px] rounded-[20px] border border-papel bg-sand/60 ${i > 0 ? "-mt-[22px]" : ""}`} />
            ))}
          </div>
          <div className="space-y-4">
            <div className="h-14 w-3/4 rounded bg-sand/60" />
            <div className="h-5 w-1/2 rounded bg-sand/50" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="aspect-[3/4] rounded-xl bg-sand/50" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

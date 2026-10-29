// Mientras se lee el tráfico: el loader general (ADR-0149) y la silueta de la pantalla —cabecera, la fila del período, las cinco cifras,
// el gráfico con su lectura, el mapa de calor con «De dónde vienen» al costado, los 100 puntos y la tabla de prendas—, para que no salte
// de «vacía» a «todo de golpe».
import { EsperaPantalla } from "@/components/ui/Espera";

export default function LoadingTrafico() {
  return (
    <>
      <EsperaPantalla />
      <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando el tráfico de la tienda web">
        <div>
          <div className="h-3 w-64 max-w-full rounded bg-sand" />
          <div className="mt-3 h-9 w-48 max-w-full rounded bg-sand sm:h-[46px]" />
          <div className="mt-2.5 h-3 w-[26rem] max-w-full rounded bg-sand/70" />
        </div>
        <div className="h-10 w-[34rem] max-w-full rounded-full bg-sand/70" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="card-cayla h-24 space-y-2 p-4">
              <div className="h-3 w-24 rounded bg-sand" />
              <div className="h-6 w-16 rounded bg-sand/70" />
            </div>
          ))}
        </div>
        <div className="card-cayla h-[22rem] p-5">
          <div className="h-5 w-40 rounded bg-sand" />
          <div className="mt-4 h-[calc(100%-2.5rem)] rounded-xl bg-sand/50" />
        </div>
        <div className="trafico-cuerpo">
          <div className="trafico-cuerpo-rejilla">
            <div className="card-cayla h-[28rem] p-5">
              <div className="h-5 w-56 rounded bg-sand" />
              <div className="mt-4 h-[calc(100%-2.5rem)] rounded-xl bg-sand/50" />
            </div>
            <div className="card-cayla h-[28rem] p-5">
              <div className="h-5 w-40 rounded bg-sand" />
              <div className="mt-4 space-y-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-3 w-full rounded bg-sand/60" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="card-cayla grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="aspect-square rounded-xl bg-sand/50" />
          ))}
        </div>
      </div>
    </>
  );
}

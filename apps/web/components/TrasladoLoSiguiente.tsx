import Link from "next/link";
import type { LoSiguiente } from "@/lib/traslados-recepcion-reglas";

// «Lo siguiente» tras recibir un traslado (ADR-0242 D-6.1): qué sigue y a dónde llevar las prendas que acaban de entrar. Lo que
// llegó al almacén no se vende hasta bajarlo al piso, y nadie lo recordaba. La regla (qué se ofrece, con qué prendas, cuánto
// dura) vive en `loSiguienteDeLaRecepcion` (lib/traslados-recepcion-reglas.ts, con pruebas); esto solo la dibuja.
// Sin estado ni campos: es un componente de servidor, justo bajo el título, a la vista sin desplazarse.
export function TrasladoLoSiguiente({ intro, acciones }: LoSiguiente) {
  return (
    <section aria-labelledby="lo-siguiente" className="card-cayla flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="max-w-prose space-y-1">
        <h2 id="lo-siguiente" className="font-display text-xl text-tinta">
          Lo siguiente
        </h2>
        <p className="text-sm leading-relaxed text-taupe">{intro}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {acciones.map((a) => (
          <Link key={a.clave} href={a.href} className={`btn-cayla ${a.principal ? "btn-primario" : "btn-secundario"}`}>
            {a.texto}
          </Link>
        ))}
      </div>
    </section>
  );
}

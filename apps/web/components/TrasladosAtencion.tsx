import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import type { ResumenTraslados } from "@/lib/traslados-reglas";

// La franja de arriba: responde «¿tengo algo que atender ahora?». Solo se
// pinta en coral cuando SÍ hay algo que le toca a quien mira (una recepción
// que ya debió llegar, o una diferencia que un líder debe cerrar): un traslado
// que viaja a tiempo no la enciende. Sin nada pendiente, en vez de una alarma
// vacía queda una línea tranquila que responde lo mismo, pero en negativo.
// Sin «cerrar»: una alerta sobre algo real que se puede descartar sin
// resolverlo enseña a ignorarla — desaparece sola cuando se atiende.
export function TrasladosAtencion({ resumen, masUrgente }: { resumen: ResumenTraslados; masUrgente: { id: string; numero: number } | null }) {
  const n = resumen.requierenAccion;

  if (n === 0 || !masUrgente) {
    if (resumen.abiertos === 0) return null;
    return (
      <p className="card-cayla flex items-center gap-2.5 px-4 py-3 text-sm text-taupe">
        <CircleCheck aria-hidden strokeWidth={1.5} className="h-5 w-5 shrink-0 text-verde" />
        <span>
          <span className="text-tinta">Nada requiere tu acción por ahora.</span>{" "}
          {resumen.abiertos === 1 ? "Hay 1 traslado abierto." : `Hay ${resumen.abiertos} traslados abiertos.`}
        </span>
      </p>
    );
  }

  const titulo = n === 1 ? "1 traslado requiere revisión hoy" : `${n} traslados requieren revisión hoy`;
  const detalle =
    resumen.porRevisar === 0
      ? "Confirma la recepción para que las prendas entren a tu inventario."
      : resumen.porRecibir === 0
        ? "Revisa la diferencia y ciérrala para que las prendas recibidas entren a tu inventario."
        : "Confirma las recepciones y revisa las diferencias para que las prendas entren a tu inventario.";

  return (
    <section aria-labelledby="atencion-hoy" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-rojo/30 bg-rojo/[0.07] px-5 py-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="sr-only">Atención hoy</p>
        <h2 id="atencion-hoy" className="font-display text-lg leading-snug text-tinta">
          {titulo}
        </h2>
        <p className="text-[13px] text-taupe">
          {detalle}
          {n > 1 && <span className="text-taupe"> Empieza por el Traslado {masUrgente.numero}.</span>}
        </p>
      </div>
      <Link
        href={`/inventario/traslados/${masUrgente.id}`}
        aria-label={`Revisar ahora el traslado ${masUrgente.numero}`}
        className="btn-cayla btn-primario shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo"
      >
        Revisar ahora
        <ArrowRight aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

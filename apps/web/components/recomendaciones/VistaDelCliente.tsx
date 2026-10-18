import { MessageCircle } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { fechaDeLaTienda, sobreQue, textoLimpio, type Recomendacion } from "@/lib/recomendaciones-reglas";

/**
 * «Así lo verá en su cuenta» (actividad 3 de la hoja nueva, Felipe 2026-10-17): la tarjeta de «Lo que nos escribiste» de la tienda online
 * (`apps/tienda/components/recomendaciones/MisRecomendaciones.tsx`), con lo que se está escribiendo en el lugar de la respuesta. La
 * respuesta no se puede corregir después de enviada: verla como la verá el cliente es la última ocasión de notar una falta o un tono.
 * Es una réplica con los tokens del ERP (la tienda es otra app): la forma es la misma —sobre qué y cuándo, su estado, lo que escribió y
 * «CAYLA te respondió» con la raya verde—, no los píxeles. Si la tarjeta de la tienda cambia, esta se cambia con ella.
 */
export function VistaDelCliente({ recomendacion: r, respuesta, ahoraIso }: { recomendacion: Recomendacion; respuesta: string; ahoraIso: string }) {
  const texto = textoLimpio(respuesta);
  return (
    <section className="space-y-2" data-guia="recomendacion.vista-cliente" aria-label="Así lo verá en su cuenta de la tienda online">
      <TituloGrupo nota="en su cuenta de la tienda online">Así lo verá {r.cliente?.nombre.split(" ")[0] ?? "el cliente"}</TituloGrupo>
      <div className="space-y-2 rounded-2xl border border-sand bg-crema px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 text-[12.5px] text-taupe">
          <span>
            <b className="font-semibold text-tinta">{sobreQue(r)}</b> · {fechaDeLaTienda(r.creadaEn)}
          </span>
          <Chip tono="verde">Respondida</Chip>
        </div>
        <p className="whitespace-pre-line break-words text-[14px] leading-normal text-tinta">{r.texto}</p>
        <div className="rounded-r-xl border-l-[3px] border-verde bg-verde/[0.09] px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-verde">
            <MessageCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
            CAYLA te respondió · {fechaDeLaTienda(ahoraIso)}
          </p>
          {texto ? (
            <p className="mt-1.5 whitespace-pre-line break-words text-[14px] leading-normal text-tinta">{texto}</p>
          ) : (
            <p className="mt-1.5 text-[13px] italic text-taupe">Aquí aparece tu respuesta, tal como la escribas.</p>
          )}
        </div>
      </div>
    </section>
  );
}

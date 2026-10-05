import { Check, Circle } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { DIAS_SOSTENIDOS, fraseDelMotor, porciento, type PreparacionSede } from "@/lib/motor-demanda-reglas";

// Motor de demanda, etapa 0 (ADR-0344): una tarjeta por tienda que dice si el sistema ya puede recomendar ahí y, si no, qué le
// falta. Solo dibuja: el veredicto sale de `preparacionDeSede` (lib/motor-demanda-reglas.ts). Server Component.
//
// La racha se ve como 14 marcas, una por día: lo que el líder tiene que mirar es cuánto falta, no un porcentaje suelto.

function Racha({ dias }: { dias: number }) {
  const llenas = Math.min(dias, DIAS_SOSTENIDOS);
  return (
    <div className="mt-2 flex gap-1" role="img" aria-label={`Lleva ${llenas} de ${DIAS_SOSTENIDOS} días seguidos`}>
      {Array.from({ length: DIAS_SOSTENIDOS }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < llenas ? "bg-verde" : "bg-sand"}`} />
      ))}
    </div>
  );
}

function TarjetaSede({ p }: { p: PreparacionSede }) {
  return (
    <article className="card-cayla p-5" aria-labelledby={`motor-${p.ubicacionId}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 id={`motor-${p.ubicacionId}`} className="font-display text-lg text-tinta">
          {p.nombre}
        </h3>
        <Chip tono={p.puedeHablar ? "verde" : "ambar"}>{p.puedeHablar ? "Puede recomendar" : "Todavía no"}</Chip>
      </div>
      {/* El veredicto en una línea, la misma que verá la columna «Sugerencias» de Tareas (ADR-0345). */}
      <p className="mt-1 text-sm text-tinta/75">{fraseDelMotor(p)}</p>
      <ul className="mt-4 space-y-4">
        {p.condiciones.map((c) => (
          <li key={c.clave} className="flex gap-3">
            {c.cumple ? (
              <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-verde" />
            ) : (
              <Circle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ambar" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-tinta">
                {c.titulo}
                <span className="sr-only">{c.cumple ? ": listo" : ": falta"}</span>
              </p>
              <p className="mt-0.5 text-sm text-tinta/75">{c.detalle}</p>
              {c.clave === "venta_identificada" && <Racha dias={p.racha.dias} />}
              {c.falta && <p className="mt-1 text-sm text-ambar">{c.falta}</p>}
            </div>
          </li>
        ))}
      </ul>
      {p.identificadaHoy !== null && (
        <p className="mt-4 border-t border-sand pt-3 text-xs text-taupe-profundo">
          Hoy va {porciento(p.identificadaHoy)} con su prenda. Cuenta desde mañana, cuando el día cierre.
        </p>
      )}
    </article>
  );
}

export function PreparacionMotor({ sedes }: { sedes: PreparacionSede[] }) {
  if (sedes.length === 0) return <p className="nota-cayla">No hay tiendas activas.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sedes.map((p) => (
        <TarjetaSede key={p.ubicacionId} p={p} />
      ))}
    </div>
  );
}

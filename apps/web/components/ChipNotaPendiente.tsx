import { Chip } from "@/components/ui/Chip";
import { chipNotaPendiente, type NotaPendiente } from "@/lib/nota-pendiente-reglas";

// «Esperando nota S/ 236.00»: el aviso ámbar de las listas de Comprobantes y Por pagar (ADR-0111 D2)
// de que el proveedor todavía debe acreditar un faltante cerrado. Sin estado ni efectos: sirve tanto
// desde una página de servidor (Comprobantes) como desde la lista cliente de Por pagar. La redacción
// y el tono salen del módulo puro `nota-pendiente-reglas`.
//
// `conAyuda` muestra al lado la pista corta «Ya puedes registrarla» (solo cuando el comprobante ya está
// resuelto al 100 %). Se pide donde hay sitio (Por pagar); donde no (la celda angosta de Comprobantes)
// la misma frase va completa en el tooltip y en el texto para lector de pantalla.
export function ChipNotaPendiente({ nota, saldo, conAyuda = false, className = "" }: { nota: NotaPendiente | undefined; saldo: number; conAyuda?: boolean; className?: string }) {
  if (!nota) return null;
  const chip = chipNotaPendiente(nota, saldo);
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`} title={chip.pista}>
      <Chip tono={chip.tono}>{chip.texto}</Chip>
      {conAyuda && chip.ayuda && <span className="text-xs text-ambar-profundo">{chip.ayuda}</span>}
      <span className="sr-only">{chip.pista}</span>
    </span>
  );
}

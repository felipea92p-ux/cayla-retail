import { Chip } from "@/components/ui/Chip";
import { textoNoDeducible, type NoDeducible } from "@/lib/no-deducible-reglas";

// La marca «No deducible» de un pago o un gasto (ADR-0362, fase 6 · actividad 6; decisiones 56, 68 y 70), con su razón A LA VISTA (nunca
// solo al pasar el mouse): «Comprobante de S/ 2,360.00 pagado en efectivo o desde un fondo…» o «Pasa el tope diario de la planilla…».
// Informa, no pide nada: va en pizarra (el tono informativo), para no confundirse con «Sin papel», que sí pide algo. Lo que se marca lo
// decide la base (`fn_no_deducibles`); esta pieza solo lo dice.

export function MarcaNoDeducible({ nd, montoDeLaFila, className = "" }: { nd: NoDeducible | null | undefined; montoDeLaFila?: number; className?: string }) {
  if (!nd) return null;
  const t = textoNoDeducible(nd, montoDeLaFila);
  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <Chip tono="pizarra">{t.etiqueta}</Chip>
      <span className="text-xs text-taupe">{t.porque}</span>
    </span>
  );
}

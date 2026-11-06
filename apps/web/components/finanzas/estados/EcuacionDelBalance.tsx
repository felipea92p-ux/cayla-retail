import { Check } from "lucide-react";
import { textoDelLibro } from "@/lib/estados-partes";

/** Lo que cierra el libro del Balance: que la cuenta da, a la vista. */
export function EcuacionDelBalance({ tiene, debe, tuyo, dicho }: { tiene: number; debe: number; tuyo: number; dicho: string }) {
  return (
    <div className="estados-ecuacion">
      <Check aria-hidden className="h-5 w-5" />
      <span className="tabular-nums">{`${textoDelLibro(tiene)} = ${textoDelLibro(debe)} + ${textoDelLibro(tuyo)}`}</span>
      <small>{dicho}</small>
    </div>
  );
}

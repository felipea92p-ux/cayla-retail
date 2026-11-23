import { ScanLine } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";

/* ====================================================================
   BotonBarrido · la entrada fija al barrido del piso desde Existencias (ADR-0690, Felipe 2026-11-22)

   El barrido es una función de Existencias (ADR-0306): no tiene entrada en el menú. Hasta hoy «Cuadrar el piso» solo se veía mientras
   la tienda nunca había cuadrado; el barrido se hace una vez al mes, así que su botón queda siempre en la cabecera, junto a «Ajustar
   stock» (la otra excepción a «la cabecera no lleva botones», ADR-0494). En el celular es solo el ícono, como sus vecinos.
   Solo se dibuja en la sede activa de quien entra y si separa piso y almacén (el barrido barre siempre la sede activa).
   ==================================================================== */
export function BotonBarrido({ enCurso }: { enCurso: boolean }) {
  const nombre = enCurso ? "Barrido en curso" : "Barrido del piso";
  return (
    <BotonEnlace href="/inventario/barrido" data-guia="existencias.barrido" title={nombre} className="max-sm:min-w-11 max-sm:!px-3">
      <ScanLine aria-hidden className="h-4 w-4" />
      <span className="max-sm:sr-only">{nombre}</span>
    </BotonEnlace>
  );
}

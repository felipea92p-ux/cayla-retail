import { Car, Package, Shapes, Truck, User, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { ConceptoGasto } from "@/lib/mi-plata-reglas";

// El ícono de cada gasto que no es ropa: el mismo en «Gasté en otra cosa» y en la lista «Hoy» de Mi plata.
export const ICONO_GASTO: Record<ConceptoGasto, LucideIcon> = {
  taxi: Car,
  cargador: User,
  comida: UtensilsCrossed,
  envio: Truck,
  bolsas: Package,
  otro: Shapes,
};

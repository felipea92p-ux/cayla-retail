import { Car, HandCoins, Package, Shapes, ShoppingBag, Truck, User, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { ConceptoGasto, MovimientoCompradora } from "@/lib/mi-plata-reglas";

// El ícono de cada gasto que no es ropa: el mismo en «Gasté en otra cosa» y en la lista «Hoy» de Mi plata.
export const ICONO_GASTO: Record<ConceptoGasto, LucideIcon> = {
  taxi: Car,
  cargador: User,
  comida: UtensilsCrossed,
  envio: Truck,
  bolsas: Package,
  otro: Shapes,
};

/** El ícono de una fila de «En esta ronda»: la bolsa de una compra, las monedas de la plata, el de cada concepto de gasto. */
export const ICONO_MOVIMIENTO: Record<MovimientoCompradora["icono"], LucideIcon> = { compra: ShoppingBag, plata: HandCoins, ...ICONO_GASTO };

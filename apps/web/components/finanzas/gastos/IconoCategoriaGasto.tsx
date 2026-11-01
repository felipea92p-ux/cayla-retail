import {
  Banknote,
  Briefcase,
  Car,
  Coffee,
  Droplet,
  House,
  Landmark,
  Luggage,
  Megaphone,
  Monitor,
  PencilRuler,
  Phone,
  Plug,
  Receipt,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  SprayCan,
  Truck,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { iconoDeCategoria, type IconoGasto } from "@/lib/icono-categoria-gasto";

const DIBUJO: Record<IconoGasto, LucideIcon> = {
  gota: Droplet,
  casa: House,
  maletin: Briefcase,
  taza: Coffee,
  bolsa: ShoppingBag,
  billete: Banknote,
  wifi: Wifi,
  aerosol: SprayCan,
  rayo: Zap,
  llave: Wrench,
  megafono: Megaphone,
  escudo: ShieldCheck,
  enchufe: Plug,
  pantalla: Monitor,
  tijera: Scissors,
  telefono: Phone,
  camion: Truck,
  auto: Car,
  edificio: Landmark,
  maleta: Luggage,
  regla: PencilRuler,
  recibo: Receipt,
};

/**
 * El ícono de la categoría de un gasto sobre su cuadrito de hueso (la 06 del benchmark visual, Felipe 2026-10-31): 32 px en la fila del
 * extracto, 40 en la banda del cajón. Es un dibujo: el nombre de la categoría siempre va escrito al lado.
 */
export function IconoCategoriaGasto({ codigo, tamano = 32 }: { codigo: string | null | undefined; tamano?: 32 | 40 }) {
  const Dibujo = DIBUJO[iconoDeCategoria(codigo)];
  return (
    <span aria-hidden className="icono-categoria-gasto" data-tamano={tamano}>
      <Dibujo className={tamano === 40 ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

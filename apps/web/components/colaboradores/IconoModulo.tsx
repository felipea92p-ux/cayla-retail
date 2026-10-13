import { House, KeyRound, Settings, type LucideIcon } from "lucide-react";
import { IconoMenu } from "@/components/ui/IconoMenu";
import { iconoDeModulo } from "@/lib/menu-iconos";
import type { ClaveModulo } from "@/lib/modulos";

// Un ícono por módulo (Roles y accesos, ADR-0342): las tarjetas de los roles y las baldosas de «Qué ve» se reconocen de un
// vistazo. Solo decora: el nombre del módulo va siempre al lado o en el `title`.
//
// Desde el 2026-10-13 (Felipe: «alinea los otros dos lugares de íconos») es el MISMO dibujo que el del menú lateral
// (`iconoDeModulo`, lib/menu-iconos.ts): «Punto de Venta» es la caja registradora acá y en el lateral. Un módulo nuevo que sale en
// el menú hereda el ícono de su fila sin hacer nada. Quedan con un ícono propio, de lucide, solo los que no tienen trazo en el
// lateral: Roles y Configuración, que se abren desde los botones de la cabecera (ADR-0306).
const PROPIOS: Partial<Record<ClaveModulo, LucideIcon>> = {
  roles: KeyRound,
  configuracion: Settings,
};

export function IconoModulo({ clave, className = "h-4 w-4" }: { clave: ClaveModulo; className?: string }) {
  const delMenu = iconoDeModulo(clave);
  // 1,7 de grosor, el de siempre en estas piezas chicas (el lateral dibuja a 1,5 a 18-20 px).
  if (delMenu) return <IconoMenu clave={delMenu} className={className} strokeWidth={1.7} />;
  const Icono = PROPIOS[clave] ?? House;
  return <Icono aria-hidden className={className} strokeWidth={1.7} />;
}

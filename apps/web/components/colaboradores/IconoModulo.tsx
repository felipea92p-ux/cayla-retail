import {
  Activity, BarChart3, Banknote, Bookmark, CalendarCheck, ClipboardCheck, Coins, FileMinus, FileText, Gauge, Globe, History, House, LayoutGrid,
  KeyRound, Landmark, Leaf, LineChart, ListOrdered, MessageCircle, Package, PackageOpen, Percent, Receipt, Repeat, Scissors, Settings,
  Shirt, ShoppingCart, Store, Tag, Tags, Truck, Undo2, UserRound, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { ClaveModulo } from "@/lib/modulos";

// Un ícono por módulo (Roles y accesos, ADR-0342): las tarjetas de los roles y las baldosas de «Qué ve» se reconocen de un
// vistazo. Solo decora: el nombre del módulo va siempre al lado o en el `title`. Un módulo nuevo sin ícono sale con el de
// Inicio hasta que se le asigne uno aquí.
const ICONOS: Record<ClaveModulo, LucideIcon> = {
  inicio: House,
  vender: ShoppingCart,
  apartados: Bookmark,
  caja: Banknote,
  cambios: Repeat,
  devoluciones: Undo2,
  historial: History,
  facturacion: Receipt,
  clientas: UserRound,
  avisos_club: MessageCircle,
  existencias: Package,
  conteos: ClipboardCheck,
  traslados: Truck,
  movimientos: ListOrdered,
  frescura: Leaf,
  plan_piso: LayoutGrid,
  productos: Shirt,
  atributos: Tags,
  etiquetas: Tag,
  facturas_compra: FileText,
  recibir: PackageOpen,
  por_pagar: Wallet,
  proveedores: Store,
  notas_credito: FileMinus,
  produccion: Scissors,
  analisis: BarChart3,
  colaboradores: Users,
  roles: KeyRound,
  configuracion: Settings,
  gastos: Coins,
  cuentas_dinero: Landmark,
  reportes_financieros: LineChart,
  impuestos: Percent,
  cierre_mes: CalendarCheck,
  actividad: Activity,
  cayla_global: Globe,
  rendimiento: Gauge,
};

export function IconoModulo({ clave, className = "h-4 w-4" }: { clave: ClaveModulo; className?: string }) {
  const Icono = ICONOS[clave] ?? House;
  return <Icono aria-hidden className={className} strokeWidth={1.7} />;
}

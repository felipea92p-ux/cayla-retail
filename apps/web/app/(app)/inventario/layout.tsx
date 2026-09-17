import { InventarioNav } from "@/components/InventarioNav";

// Mismo patrón que `compras/layout.tsx`: el layout solo pone la
// sub-navegación, cada página resuelve su propia persona y datos. A
// diferencia de Compras, Inventario no es líder-only — un Colaborador
// también opera stock, recibe y cuenta, solo con menos permisos dentro de
// cada pantalla (`esLider` como prop), así que este layout no redirige a
// nadie.
export default function InventarioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <InventarioNav />
      {children}
    </div>
  );
}

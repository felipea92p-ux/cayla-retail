import { InventarioNav } from "@/components/InventarioNav";
import { requirePersonaActualV2 } from "@/lib/persona-actual";

// Mismo patrón que `compras/layout.tsx`: el layout solo pone la
// sub-navegación, cada página resuelve su propia persona y datos. A
// diferencia de Compras, Inventario no es líder-only — un Colaborador
// también opera stock, recibe y cuenta, solo con menos permisos dentro de
// cada pantalla (`esLider` como prop), así que este layout no redirige a
// nadie. La única pestaña líder-only es Resumen (ADR-0097): acá se decide si
// se dibuja, igual que el lateral, para que un integrante no vea una pestaña
// que lo rebota. `requirePersonaActualV2` está cacheada por request: la
// página no vuelve a consultar.
export default async function InventarioLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  return (
    <div className="space-y-6">
      <InventarioNav mostrarResumen={persona.rol === "lider"} />
      {children}
    </div>
  );
}

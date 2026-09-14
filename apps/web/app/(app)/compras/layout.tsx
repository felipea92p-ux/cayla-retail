import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { ComprasNav } from "@/components/ComprasNav";

// Compras (ADR-0035): tres pantallas sobre la misma entidad — la factura del
// proveedor. El layout solo pone la sub-navegación; cada página resuelve su
// propia persona y datos.
//
// Líder-only (0016_roles_colaborador.sql), igual que Facturación y
// Colaboradores. Faltaba acá: el menú ya escondía el enlace (`esLider` en
// AppShell.tsx), pero ninguna de las 5 pantallas de Compras tenía este
// redirect — un Colaborador que entrara por URL directa veía la pantalla
// entera (aunque no pudiera escribir nada, eso sí lo bloqueaban las RPC).
// Puesto acá, en el layout, protege las 5 de una sola vez.
export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  return (
    <div className="space-y-6">
      <ComprasNav />
      {children}
    </div>
  );
}

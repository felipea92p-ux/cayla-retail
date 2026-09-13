import { ComprasNav } from "@/components/ComprasNav";

// Compras (ADR-0035): tres pantallas sobre la misma entidad — la factura del
// proveedor. El layout solo pone la sub-navegación; cada página resuelve su
// propia persona y datos.
export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <ComprasNav />
      {children}
    </div>
  );
}

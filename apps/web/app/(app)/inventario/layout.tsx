// Inventario ya no lleva sub-navegación propia (2026-09-21, Felipe): entre Existencias, Movimientos, Traslados, Conteo y
// Análisis se navega solo con el lateral (`lib/menu.ts`, grupo «Inventario»). El layout queda como envoltorio de
// espaciado: cada página resuelve su persona y sus datos, y `(app)/layout.tsx` ya exige sesión.
export default function InventarioLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

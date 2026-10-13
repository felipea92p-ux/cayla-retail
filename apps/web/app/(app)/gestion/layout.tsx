// «Gestión» (ADR-0392) no lleva sub-navegación propia: entre Análisis, Frescura del piso, Plan del piso y Rendimiento se navega
// solo con el lateral (`lib/menu.ts`, grupo «Gestión»). El layout es el mismo envoltorio de espaciado que tenían en Inventario:
// cada página resuelve su persona y su módulo (`exigirModulo`), y `(app)/layout.tsx` ya exige sesión.
export default function GestionLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «reportes_ventas» (ADR-0161 B2): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// El candado real vive en cada función de lectura de la base; esto evita abrir una pantalla que después falla al leer.
export default async function ReportesVentasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("reportes_ventas");
  return <>{children}</>;
}

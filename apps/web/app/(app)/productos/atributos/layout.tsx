import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «atributos» (ADR-0161 B2): quien llega por URL directa sin ese módulo en su rol cae en «Sin acceso».
// El candado real sigue en la base; esto evita abrir una pantalla que después falla al guardar. Las etiquetas viven en una
// pestaña de esta pantalla: quien ve el módulo Etiquetas también entra (20260923130000), y la página le muestra solo esa.
export default async function AtributosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("atributos", "etiquetas");
  return <>{children}</>;
}

import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «beneficios_club» (programa de puntos, actividad 8; ADR-0161 B2): quien llega por URL directa sin ese módulo en su
// rol cae en «Sin acceso». Nace solo para el líder (sin rol) y no es delegable por ahora: `guardar_beneficios_puntos` pide al líder. El
// candado real sigue en la base (`resumen_beneficios_puntos` pide el módulo).
export default async function BeneficiosClubLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("beneficios_club");
  return <>{children}</>;
}

import { TelaHilos } from "@/components/finanzas/estados/TelaHilos";
import { letraEstados } from "@/lib/letra-estados";
import { exigirModulo } from "@/lib/persona-actual";

// Inter solo para las cifras de Estados financieros (ADR-0611, Felipe la eligió mirando): el resto del ERP sigue con DM Sans y EB Garamond. Las cifras la toman de `--letra-estados`.
// La puerta del módulo «reportes_financieros» (ADR-0195 F5): quien llega por URL directa sin el módulo cae en «Sin acceso».
// El candado real sigue en la base (`fn_diario_ubicaciones`: el líder, todo y el consolidado; con el módulo, su tienda).
export default async function ReportesLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("reportes_financieros");
  return (
    <div className={`${letraEstados.variable} estados-vidrio`}>
      <TelaHilos />
      {children}
    </div>
  );
}

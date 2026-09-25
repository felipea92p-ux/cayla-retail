import { exigirModulo } from "@/lib/persona-actual";
import { getResumenFinanzas } from "@/lib/resumen-finanzas";
import { leerVerResumen } from "@/lib/resumen-finanzas-reglas";
import { ResumenFinanzasPanel } from "@/components/finanzas/ResumenFinanzas";

// Finanzas ▸ Resumen (ADR-0195 F10; spike `vista-resumen.js`): el tablero del lunes. Una sola lectura
// (`fn_resumen_finanzas`) que junta lo que ya calcula cada fase. `?ver=` (solo el líder): «todas» (por defecto: el Resumen
// es de CAYLA entera), una ubicación o «empresa». Con el módulo sin ser líder, su sede: lo decide la base.
export default async function ResumenFinanzasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const esLider = persona.rol === "lider";
  const pedido = leerVerResumen(sp.ver, esLider);
  const { datos, falla } = await getResumenFinanzas(pedido);
  return <ResumenFinanzasPanel resumen={datos} falla={falla} acceso={{ lider: esLider, modulos: persona.modulos.map((m) => m.clave) }} />;
}

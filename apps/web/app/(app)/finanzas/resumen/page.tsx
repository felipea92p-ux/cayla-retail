import { exigirModulo } from "@/lib/persona-actual";
import { getConfianzaFinanzas, getResumenFinanzas } from "@/lib/resumen-finanzas";
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
  // Las dos lecturas van a la vez: el resumen y el medidor de confianza (ADR-0417) no dependen una de la otra.
  const [{ datos, falla }, confianza] = await Promise.all([getResumenFinanzas(pedido), getConfianzaFinanzas(pedido)]);
  return <ResumenFinanzasPanel resumen={datos} falla={falla} confianza={confianza} acceso={{ lider: esLider, modulos: persona.modulos.map((m) => m.clave) }} />;
}

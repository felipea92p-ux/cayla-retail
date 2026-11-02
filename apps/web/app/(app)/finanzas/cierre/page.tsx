import { exigirModulo } from "@/lib/persona-actual";
import { getPanelCierre } from "@/lib/cierre";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { hoyLima } from "@/lib/fechas-lima";
import { avisoAntesDelCorte, mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { mesDeLaRuta, mesDelDia, RUTA_CIERRE, sedesDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { CierreMes } from "@/components/finanzas/CierreMes";

// Finanzas ▸ Cierre de mes (ADR-0195 F9, ADR-0198). Lee en el servidor, en una sola función (`fn_cierre_panel`), y deja a
// una pieza cliente cerrar y reabrir. El mes y la sede los elige la barra común de Finanzas (`MesaDeMando`), igual que en los
// demás submódulos: `?mes=2026-08` es el mes que se cierra (por defecto, el anterior: el mes en curso nunca se cierra, y la
// barra lo sabe por `mesDeLaRuta`); `?sede=<id>` (o el viejo `?u=`) abre esa unidad: la clave de una sede de la barra es la
// misma que la de una unidad del cierre (el id de la tienda o «empresa»).
//
// ADR-0332: si Finanzas cuenta desde un día posterior al mes que se pide, no hay nada que cerrar todavía: se dice desde
// cuándo se mide, en vez de abrir un mes vacío. La fecha se lee con `fn_parametros_finanzas`; quien entra solo con el módulo
// Cierre y no puede leerla ve el comportamiento de siempre (la base igual no cuenta lo anterior).
export default async function CierrePage({ searchParams }: { searchParams: Promise<{ mes?: string; u?: string; sede?: string }> }) {
  await exigirModulo("cierre_mes");
  const sp = await searchParams;
  const inicio = (await getParametrosFinanzas())?.inicioFinanzas ?? null;
  const mes = mesDeLaRuta(RUTA_CIERRE, sp.mes, mesDelDia(hoyLima()));
  if (inicio && mesAntesDelCorte(mes, inicio)) {
    return <CierreMes panel={null} falla={null} unidadPedida={null} avisoCorte={avisoAntesDelCorte(inicio)} />;
  }
  const sedes = sedesDeLaUrl({ sede: sp.sede });
  const unidadPedida = sp.u ?? (sedes.length === 1 ? sedes[0]! : null);
  const panel = await getPanelCierre(mes);
  // La `key` vuelve a abrir la unidad pedida cuando la barra cambia de mes o de sede (la tarjeta elegida vive en la pieza cliente).
  return <CierreMes key={`${mes}|${unidadPedida ?? ""}`} panel={panel.datos} falla={panel.falla} unidadPedida={unidadPedida} />;
}

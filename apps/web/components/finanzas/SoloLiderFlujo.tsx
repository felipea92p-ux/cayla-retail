import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { GuiaVacia } from "@/components/finanzas/kit";

// Flujo de caja y Escenarios con el módulo «Reportes financieros» pero sin ser líder (ADR-0195 F6): son de CAYLA entera y
// leen los saldos de los bancos, que en Cuentas y dinero (F3) solo ve el líder. La base lo niega (42501); la pantalla lo
// explica en vez de mostrar un error. Si Felipe decide abrirlo, es un cambio en `fn_flujo_exigir_lider`.
export function SoloLiderFlujo({ pestana }: { pestana: "flujo" | "escenarios" }) {
  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana={pestana}
        titulo={pestana === "flujo" ? "¿Por qué vendí bien y no hay plata?" : "¿Qué pasa si…?"}
        bajada="Lo que entra y sale de las cuentas de CAYLA, y lo que viene en las próximas semanas."
      />
      <GuiaVacia sobre="Solo el líder" titulo="El flujo de caja es de CAYLA entera">
        Mira los bancos y todo lo que CAYLA debe, que por ahora ve el líder. Lo de tu tienda está en Cuentas y dinero (tu cajón y tu caja fuerte) y en el
        Estado de resultados.
      </GuiaVacia>
    </div>
  );
}

import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { Superficie } from "@/components/finanzas/kit";
import { Vacio } from "@/components/ui/Vacio";
import { Lock } from "lucide-react";

// Flujo de caja y Escenarios en una TERMINAL con el módulo (ADR-0585): son de CAYLA entera y el aparato del mostrador mira solo su
// tienda (ADR-0161 P6). La base lo niega (42501, `fn_exigir_estados_financieros_de_todo`); la pantalla lo explica en vez de
// mostrar un error. Desde ADR-0585 una PERSONA con el módulo sí lo ve, sea o no líder.
export function SoloLiderFlujo({ pestana }: { pestana: "flujo" | "escenarios" }) {
  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana={pestana}
        titulo={pestana === "flujo" ? "¿Por qué vendí bien y no hay plata?" : "¿Qué pasa si…?"}
        bajada="Lo que entra y sale de las cuentas de CAYLA, y lo que viene en las próximas semanas."
      />
      <Superficie>
        <Vacio icono={<Lock />} titulo="El flujo de caja es de CAYLA entera">
          Mira los bancos y todo lo que CAYLA debe, y eso no se muestra en el aparato de la tienda. Entra con tu cuenta para verlo. Lo de esta tienda está
          en Cuentas y dinero y en el Estado de resultados.
        </Vacio>
      </Superficie>
    </div>
  );
}

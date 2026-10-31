import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Superficie } from "@/components/finanzas/kit";
import { Vacio } from "@/components/ui/Vacio";
import { Lock } from "lucide-react";

// El flujo, lo que viene y lo tuyo en una TERMINAL con el módulo (ADR-0585): son de CAYLA entera y el aparato del mostrador mira solo su
// tienda (ADR-0161 P6). La base lo niega (42501, `fn_exigir_estados_financieros_de_todo`); la pantalla lo explica en vez de mostrar un
// error. Una PERSONA con el módulo sí lo ve, sea o no líder.
const TITULO = { flujo: "¿Dónde está la plata?", escenarios: "¿Qué pasa si…?", patrimonio: "¿Lo tuyo creció?" } as const;

export function SoloLiderFlujo({ pestana }: { pestana: keyof typeof TITULO }) {
  return (
    <div className="space-y-6">
      <EncabezadoPagina sede="Finanzas" titulo="Estados financieros" subtitulo={TITULO[pestana]} />
      <Superficie>
        <Vacio icono={<Lock />} titulo="Esto es de CAYLA entera">
          Mira los bancos, todo lo que CAYLA debe y lo que es del dueño, y eso no se muestra en el aparato de la tienda. Entra con tu cuenta para
          verlo. Lo de esta tienda está en ¿Ganamos? y en Cuentas y dinero.
        </Vacio>
      </Superficie>
    </div>
  );
}

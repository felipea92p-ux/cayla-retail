import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getBilleteraDeLaSede } from "@/lib/traslados-billetera";
import { paseInicial } from "@/lib/traslados-pases-reglas";
import { Escenario } from "@/components/traslados-pases/Escenario";
import { Package } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

// Al entrar a Traslados se abre solo el pase de lo primero que te toca (en computadora; en el celular se ve la billetera y el pase
// se abre al tocarlo). Sin ninguna caja, el escenario lo dice.
export default async function TrasladosPage() {
  const persona = await requirePersonaActualV2();
  const billetera = await getBilleteraDeLaSede(persona.ubicacionId, puede(persona, "ajustarInventario"));
  const inicial = paseInicial(billetera.pases);
  if (!inicial) {
    return (
      <div className="tp-escenario">
        <div className="card-cayla max-w-sm">
          <Vacio icono={<Package />} titulo="Todavía no hay cajas">
            Cuando envíes o te envíen un traslado, aparece aquí como un pase.
          </Vacio>
        </div>
      </div>
    );
  }
  return <Escenario id={inicial.id} />;
}

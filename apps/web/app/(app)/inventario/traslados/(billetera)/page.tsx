import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getBilleteraDeLaSede } from "@/lib/traslados-billetera";
import { paseInicial } from "@/lib/traslados-pases-reglas";
import { EscenarioPase } from "@/components/traslados-pases/EscenarioPase";

// Al entrar a Traslados se abre solo el pase de lo primero que te toca (en computadora; en el celular se ve la billetera y el pase
// se abre al tocarlo). Sin ninguna caja, el escenario lo dice.
export default async function TrasladosPage() {
  const persona = await requirePersonaActualV2();
  const billetera = await getBilleteraDeLaSede(persona.ubicacionId, puede(persona, "ajustarInventario"));
  const inicial = paseInicial(billetera.pases);
  if (!inicial) {
    return (
      <div className="tp-escenario">
        <div className="tp-vacia max-w-sm bg-papel">
          <b>Todavía no hay cajas</b>
          Cuando envíes o te envíen un traslado, aparece aquí como un pase.
        </div>
      </div>
    );
  }
  return <EscenarioPase id={inicial.id} />;
}

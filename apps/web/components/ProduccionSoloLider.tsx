import { ClipboardList } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";

// Lo que ve quien trabaja en el Taller y llega a una pantalla que es del líder (Resumen, Facturas de insumos, Por pagar, Proveedores, Eficiencia: llevan montos, deudas y datos de terceros).
// Antes se le devolvía a Órdenes sin decirle nada y parecía que el botón del menú no funcionaba (ADR-0400, actividad 8d; ley 9 de Formidable: vacíos que dicen qué pasa). Se le explica y se le lleva
// a donde sí trabaja.
export function ProduccionSoloLider({ titulo }: { titulo: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-tinta">{titulo}</h1>
      <div className="card-cayla">
        <Vacio
          icono={<ClipboardList />}
          titulo="Esta pantalla es de tu líder"
          acciones={
            <BotonEnlace href="/produccion/ordenes" peso="primario">
              Ir a Órdenes
            </BotonEnlace>
          }
        >
          Aquí se ven los montos, lo que se le debe a cada proveedor y sus datos. Tu trabajo —las órdenes, la tela y lo que cada una necesita— está en Órdenes.
        </Vacio>
      </div>
    </div>
  );
}

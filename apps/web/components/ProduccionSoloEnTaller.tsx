import { Factory } from "lucide-react";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Vacio } from "@/components/ui/Vacio";

// Lo que ve quien llega a una pantalla de Producción parado en otra ubicación (por la URL guardada, o por el enlace
// «Producción» del Resumen de Inventario). Producción solo se ve parado en el Taller (`puedeVerProduccion`); en vez de
// devolverlo al inicio sin decir nada, se le explica dónde está y qué hacer.
//
// Son dos personas distintas y a cada una se le dice lo que SÍ puede hacer (P15 del análisis del Taller, 2026-11-02): el líder
// puede cambiar la sede él mismo; quien no es líder no tiene selector, así que se le dice que su sede es otra y que lo pida.
// Antes la segunda caía en Inicio sin una palabra y parecía que el sistema se había roto.
export function ProduccionSoloEnTaller({ ubicacionActual, puedeCambiarUbicacion }: { ubicacionActual: string; puedeCambiarUbicacion: boolean }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-tinta">Producción</h1>
      <div className="card-cayla">
        {puedeCambiarUbicacion ? (
          <Vacio icono={<Factory />} titulo="Producción se trabaja desde el Taller">
            Ahora estás mirando desde «{ubicacionActual}». Cambia la sede en el selector de arriba y elige el Taller para ver las órdenes y los
            insumos.
          </Vacio>
        ) : (
          <Vacio icono={<Factory />} titulo="Producción se trabaja desde el Taller" acciones={<BotonVer href="/">Volver al inicio</BotonVer>}>
            Tu cuenta trabaja en «{ubicacionActual}», no en el Taller. Si te toca ayudar en Producción, pídele a tu líder que te asigne al Taller.
          </Vacio>
        )}
      </div>
    </div>
  );
}

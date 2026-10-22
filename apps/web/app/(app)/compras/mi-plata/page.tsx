import { HandCoins } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";

// Compras ▸ Mi plata para compras (ADR-0480, Compras simple): la pantalla de quien compra, hecha para el celular. La compradora
// anota la plata que le dieron, lo que compró (proveedor → sus productos de siempre → cantidad, costo, precio y tienda → la boleta
// con foto) y otros gastos; manda lo comprado a cada tienda y termina el día. Maqueta aprobada: docs/maquetas/compras-simple-2026-10/.
// Actividad 1: la pantalla existe en el menú y dice qué viene; el flujo llega en las actividades 2 a 5.
export default async function MiPlataPage() {
  const persona = await exigirModulo("ordenes_compra");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Mi plata para compras"
        subtitulo="Lo que tienes para comprar, lo que compraste y lo que mandas a la tienda."
      />
      <Vacio icono={<HandCoins aria-hidden />} titulo="Anota tu plata para comprar" guia="mi-plata.vacio">
        Aquí vas a anotar la plata que te dieron, lo que compraste y lo que mandas a cada tienda. Muy pronto.
      </Vacio>
    </div>
  );
}

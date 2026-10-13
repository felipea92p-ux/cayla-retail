import { exigirModulo } from "@/lib/persona-actual";

// La puerta del módulo «ordenes_insumos» (ADR-0362 fase 7, decisión 47; ADR-0161): quien llega por URL directa sin ese módulo en su rol
// cae en «Sin acceso». Nace solo para el líder (sin rol, 20261013035000); el líder decide después a quién se lo da. Quien lo tiene ve y
// hace todo en estas órdenes, con sus precios, así que basta el módulo: no pide el de Órdenes de producción (por eso la ruta no cuelga de
// `/produccion`, cuyo layout lo exige) ni el dinero del Taller. El candado real sigue en la base: cada función pide el módulo.
//
// `modal` es un slot paralelo (`@modal/`), como el de Compras: ahí Next dibuja una orden como ventana cuando se abre desde la lista
// (ruta interceptada `@modal/(.)ver/[id]`), sin desmontar la lista de `children`. El resto del tiempo está vacío (`@modal/default.tsx`,
// y `[...catchAll]` lo limpia al navegar a otra pantalla del módulo).
export default async function OrdenesInsumoLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  await exigirModulo("ordenes_insumos");
  return (
    <div className="space-y-6">
      {children}
      {modal}
    </div>
  );
}

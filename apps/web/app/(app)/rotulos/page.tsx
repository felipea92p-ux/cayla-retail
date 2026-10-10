import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getRotulos } from "@/lib/rotulos";
import { idsDeParam } from "@/lib/etiqueta-precio-reglas";
import { desdeDeParams } from "@/lib/vuelta-productos";
import { MAX_MODELOS_EN_URL, origenDeParam, volverDeRotulos } from "@/lib/rotulos-reglas";
import { ImprimirRotulos } from "@/components/ImprimirRotulos";

// Rótulos de anaquel (ADR-0366): el letrero de 62 × 100 mm para el canto del anaquel o el frente de las bolsas. Se llega desde:
//   - Catálogo ▸ Productos, con modelos marcados (`?productos=` + `?desde=` con la vista exacta, para volver a ella);
//   - Existencias, con tallas marcadas (`?productos=` de sus modelos + `?origen=existencias`);
//   - Inicio de Almacén (`?origen=almacen`), sin modelos: se buscan aquí mismo.
//
// No es un módulo del menú (ADR-0161, ADR-0306): es una salida de pantallas que ya tienen su módulo, como Etiquetas de precio,
// así que no lleva `exigirModulo`. Solo LEE el catálogo (nombre, categoría, colores y tallas de un modelo), que toda cuenta ya
// ve en Vender y en Buscar; no escribe nada.
type Params = { productos?: string | string[]; origen?: string | string[]; desde?: string | string[] };

export default async function RotulosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const persona = await requirePersonaActualV2();
  const params = await searchParams;
  const ids = idsDeParam(params.productos).slice(0, MAX_MODELOS_EN_URL);
  const desde = desdeDeParams(params.desde);
  const origen = origenDeParam(params.origen, desde);
  const { modelos, catalogo } = await getRotulos(ids);

  return (
    <ImprimirRotulos
      // Otra lista de modelos = otros rótulos: las copias y «juntos» elegidos para la anterior no se arrastran.
      key={modelos.map((m) => m.productoId).join(",")}
      modelos={modelos}
      catalogo={catalogo}
      origen={origen === "existencias" || origen === "almacen" ? { desde: origen } : { productos: desde }}
      volver={volverDeRotulos(origen, desde)}
      sede={persona.ubicacionEtiqueta}
    />
  );
}

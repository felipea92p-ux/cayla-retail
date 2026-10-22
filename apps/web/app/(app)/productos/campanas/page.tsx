import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { cargarEtiquetasPantalla } from "@/lib/etiquetas-pantalla-datos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { EtiquetasLista } from "@/components/EtiquetasLista";

// Catálogo ▸ Campañas (ADR-0473, Felipe 2026-10-22): San Valentín, Halloween, Navidad… con sus fechas, su descuento y dónde
// rigen. Hasta ese día vivían como un grupo de «Etiquetas» dentro de Atributos y se confundían con las etiquetas de precio
// que se imprimen. Son las mismas filas de `etiquetas` (estilo `campana`): Vender, la tienda online y su diseño las leen igual.
export default async function CampanasPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas");
  // Quien ve el módulo hace todo lo que hay en él (ADR-0161): crear, configurar y poner prendas. La base lo vuelve a exigir
  // (`fn_puede_campanas`: líder, Campañas, Campañas de la tienda web o Sellos; Felipe 2026-10-22).
  const puedeEditar = true;
  const datos = await cargarEtiquetasPantalla({ modo: "campanas", puedeEditar, conRotacion: false, esLider: persona.rol === "lider" });
  const veDisenoWeb = veModulo(persona, "campanas_web");

  return (
    <div className="space-y-6">
      <div data-guia="campanas.cabecera">
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo="Campañas"
          subtitulo="Las fechas del año en que se vende distinto: cuándo rige cada una, su descuento y en qué prendas. Vale en todas las tiendas y en la tienda online."
          acciones={
            veDisenoWeb ? (
              <BotonVer href="/tienda-web/campanas" guia="campanas.diseno-web">
                Cómo se ven en la tienda web
              </BotonVer>
            ) : undefined
          }
        />
      </div>
      <EtiquetasLista
        modo="campanas"
        etiquetasIniciales={datos.etiquetas}
        categorias={datos.categorias}
        prendasConCosto={datos.prendasConCosto}
        variantesManuales={datos.variantesManuales}
        rotacion={null}
        puedeEditar={puedeEditar}
        puedeDarDescuento={puedeEditar}
        disenoWeb={veDisenoWeb}
      />
    </div>
  );
}

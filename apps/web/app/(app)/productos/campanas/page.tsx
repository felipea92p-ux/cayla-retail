import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { cargarEtiquetasPantalla } from "@/lib/etiquetas-pantalla-datos";
import { SellosPantalla } from "@/components/sellos/SellosPantalla";

// Catálogo ▸ Campañas y ofertas (ADR-0655, Felipe 2026-11-13): las fechas especiales de la tienda y lo que el cliente paga de menos en ellas.
// Vivió como la primera vista de Catálogo ▸ Insignias (2026-10-22, ADR-0481), donde Felipe no encontraba los descuentos. Es la misma billetera de
// pases con un solo grupo, y cada campaña dice sus tres preguntas (qué le das, en qué prendas, cuándo y dónde) en vez de cuatro botones.
export default async function CampanasPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas", "etiquetas");
  const puedeEditarSellos = puede(persona, "editarEtiquetas");
  const puedeEditarCampanas = puedeEditarSellos || veModulo(persona, "campanas") || veModulo(persona, "campanas_web");
  const esLider = persona.rol === "lider";
  const datos = await cargarEtiquetasPantalla({
    modo: "campanas",
    puedeEditar: puedeEditarCampanas,
    // Unidades y ventas de 30 días: la misma puerta de Análisis (`fn_analisis_sede`). Sin ella, los pases no dicen esas cifras.
    conRotacion: esLider || veModulo(persona, "analisis"),
    esLider,
    conVitrina: true,
  });

  return (
    <SellosPantalla
      modo="campanas"
      sede={persona.ubicacionEtiqueta}
      etiquetasIniciales={datos.etiquetas}
      categorias={datos.categorias}
      tiendas={datos.tiendas}
      sedeActualId={persona.ubicacionId}
      prendasConCosto={datos.prendasConCosto}
      variantesManuales={datos.variantesManuales}
      prendasVitrina={datos.prendasVitrina}
      rotacion={datos.rotacion}
      vistas={["campanas"]}
      vistaInicial="campanas"
      puedeEditarSellos={puedeEditarSellos}
      puedeEditarCampanas={puedeEditarCampanas}
      disenoWeb={veModulo(persona, "campanas_web")}
      reglas={datos.reglas}
      reglasDisponibles={datos.reglasDisponibles}
      insignias={datos.insignias}
      choquesAbiertos={datos.choquesAbiertos ?? []}
    />
  );
}

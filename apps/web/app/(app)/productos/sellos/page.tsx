import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { cargarEtiquetasPantalla } from "@/lib/etiquetas-pantalla-datos";
import { SellosPantalla } from "@/components/sellos/SellosPantalla";
import { VISTAS_SELLOS, vistaInicial } from "@/lib/sellos-pases";

// Catálogo ▸ Sellos (Felipe 2026-10-22): lo que se le marca a una prenda, como una billetera de pases (la «II · Pases» de
// docs/maquetas/sellos-2026-10/). Junta lo que vivía en dos lugares: la pestaña «Sellos» de Atributos y Catálogo ▸ Campañas. Las
// campañas son la primera vista; Rotación, Artesanal y General, las otras tres. Todo es la misma tabla `etiquetas` (ADR-0473): Vender,
// la tienda online y su diseño las siguen leyendo igual.
export default async function SellosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("etiquetas", "campanas");
  const { vista: pedida } = await searchParams;
  // Quien ve Sellos ve las cuatro vistas (la base ya le deja guardar campañas: `fn_puede_campanas`); quien solo ve Campañas, esa.
  const veSellos = veModulo(persona, "etiquetas");
  const vistas = VISTAS_SELLOS.filter((v) => v === "campanas" || veSellos);
  const puedeEditarSellos = puede(persona, "editarEtiquetas");
  const puedeEditarCampanas = puedeEditarSellos || veModulo(persona, "campanas") || veModulo(persona, "campanas_web");
  const esLider = persona.rol === "lider";
  const datos = await cargarEtiquetasPantalla({
    modo: veSellos ? "todas" : "campanas",
    puedeEditar: puedeEditarSellos || puedeEditarCampanas,
    // Unidades y ventas de 30 días: la misma puerta de Análisis (`fn_analisis_sede`). Sin ella, los pases no dicen esas cifras.
    conRotacion: esLider || veModulo(persona, "analisis"),
    esLider,
    conVitrina: true,
  });

  return (
    <SellosPantalla
      sede={persona.ubicacionEtiqueta}
      etiquetasIniciales={datos.etiquetas}
      categorias={datos.categorias}
      prendasConCosto={datos.prendasConCosto}
      variantesManuales={datos.variantesManuales}
      prendasVitrina={datos.prendasVitrina}
      rotacion={datos.rotacion}
      vistas={vistas}
      vistaInicial={vistaInicial(pedida, vistas) ?? "campanas"}
      puedeEditarSellos={puedeEditarSellos}
      puedeEditarCampanas={puedeEditarCampanas}
      disenoWeb={veModulo(persona, "campanas_web")}
    />
  );
}

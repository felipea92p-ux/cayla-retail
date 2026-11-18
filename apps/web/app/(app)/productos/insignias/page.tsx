import { redirect } from "next/navigation";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { cargarEtiquetasPantalla } from "@/lib/etiquetas-pantalla-datos";
import { SellosPantalla } from "@/components/sellos/SellosPantalla";
import { VISTAS_SELLOS, vistaInicial } from "@/lib/sellos-pases";

// Catálogo ▸ Insignias (Felipe 2026-10-22): lo que se le marca a una prenda, como una billetera de pases (la «II · Pases» de
// docs/maquetas/sellos-2026-10/), en tres grupos: Rotación, Artesanal y General. Las campañas fueron su primera vista hasta el 2026-11-13: desde
// ADR-0655 viven en Catálogo ▸ Campañas y ofertas, y el enlace viejo (`?vista=campanas`, o quien solo tiene el módulo Campañas) lleva allá.
// Todo es la misma tabla `etiquetas` (ADR-0473): Vender, la tienda online y su diseño las siguen leyendo igual.
export default async function SellosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("etiquetas", "campanas");
  const { vista: pedida } = await searchParams;
  const veSellos = veModulo(persona, "etiquetas");
  if (pedida === "campanas" || !veSellos) redirect("/productos/campanas");
  const vistas = VISTAS_SELLOS.filter((v) => v !== "campanas");
  const puedeEditarSellos = puede(persona, "editarEtiquetas");
  const puedeEditarCampanas = puedeEditarSellos || veModulo(persona, "campanas") || veModulo(persona, "campanas_web");
  const esLider = persona.rol === "lider";
  const datos = await cargarEtiquetasPantalla({
    modo: "todas",
    puedeEditar: puedeEditarSellos || puedeEditarCampanas,
    // Unidades y ventas de 30 días: la misma puerta de Análisis (`fn_analisis_sede`). Sin ella, los pases no dicen esas cifras.
    conRotacion: esLider || veModulo(persona, "analisis"),
    esLider,
    conVitrina: true,
  });

  return (
    <SellosPantalla
      modo="insignias"
      sede={persona.ubicacionEtiqueta}
      etiquetasIniciales={datos.etiquetas}
      categorias={datos.categorias}
      tiendas={datos.tiendas}
      sedeActualId={persona.ubicacionId}
      prendasConCosto={datos.prendasConCosto}
      variantesManuales={datos.variantesManuales}
      prendasVitrina={datos.prendasVitrina}
      rotacion={datos.rotacion}
      vistas={vistas}
      vistaInicial={vistaInicial(pedida, vistas) ?? "rotacion"}
      puedeEditarSellos={puedeEditarSellos}
      puedeEditarCampanas={puedeEditarCampanas}
      disenoWeb={veModulo(persona, "campanas_web")}
      reglas={datos.reglas}
      reglasDisponibles={datos.reglasDisponibles}
      nombresDeCampanas={datos.nombresDeCampanas}
    />
  );
}

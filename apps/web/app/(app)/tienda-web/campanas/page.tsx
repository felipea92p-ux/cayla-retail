import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerCampanasWeb } from "@/lib/campanas-web-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { CampanasPantalla } from "@/components/campanas-web/CampanasPantalla";

// Tienda web ▸ Campañas (Felipe 2026-10-21; maqueta docs/maquetas/campanas-tienda-2026-10): cómo se ve la tienda online durante cada
// campaña. Esta primera entrega solo LEE: las campañas de Etiquetas con el diseño que ya tengan. Las fechas, el % y las prendas no se
// tocan aquí: se arman en Catálogo ▸ Campañas (ADR-0473; una sola fuente de verdad, así la tienda nunca dice un precio distinto al de la caja).
export default async function CampanasWebPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas_web");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_campanas_web");
  const lectura = error ? null : leerCampanasWeb(data);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Campañas"
        subtitulo="Cómo se ve la tienda online durante cada campaña. Las fechas, el descuento y las prendas se siguen armando en Catálogo ▸ Campañas."
      />
      {lectura ? (
        <CampanasPantalla lectura={lectura} puedeIrACampanas={veModulo(persona, "campanas_catalogo")} />
      ) : (
        <Aviso tono="error" titulo="No se pudieron leer las campañas">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      )}
    </div>
  );
}

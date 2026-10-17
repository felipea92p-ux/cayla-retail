import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerRecortes } from "@/lib/recorte-probador-reglas";
import { leerProbador } from "@/lib/vitrina-probador-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ProbadorPantalla } from "@/components/vitrina/ProbadorPantalla";
import { VitrinaPestanas } from "@/components/vitrina/VitrinaPestanas";

// Tienda web ▸ Vitrina ▸ Probador (ADR-0434, actividades 1 y 3): lo que necesita «Arma el tuyo», el probador de looks de la tienda online
// —la lista viva de prendas (`fn_vitrina_probador`) y los recortes de sus fotos (`fn_vitrina_recortes`)—. Es parte del módulo `vitrina_web`
// (una pestaña de la Vitrina, no otro módulo: ADR-0306), con la cabecera de las demás pestañas (`EncabezadoPagina`, ADR-0220).
export default async function VitrinaProbadorPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("vitrina_web");
  const supabase = await createClient();
  const [recortes, probador] = await Promise.all([supabase.rpc("fn_vitrina_recortes"), supabase.rpc("fn_vitrina_probador")]);
  const error = recortes.error ?? probador.error;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Vitrina"
        subtitulo="Lo que necesita «Arma el tuyo», el probador de looks de la tienda online: cada prenda con su largo, su recorte y una foto por color."
      />
      <VitrinaPestanas activa="probador" />
      {error ? (
        <Aviso tono="error" titulo="No se pudieron leer las fotos del probador">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <ProbadorPantalla fotos={leerRecortes(recortes.data)} probador={leerProbador(probador.data)} />
      )}
    </div>
  );
}

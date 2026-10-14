import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerVitrina } from "@/lib/vitrina-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { VitrinaPantalla } from "@/components/vitrina/VitrinaPantalla";

// Catálogo ▸ Vitrina web (ADR-0408, actividad 3; maqueta docs/maquetas/tienda-online-2026-10, «vitrina»): qué modelos se ven en la
// tienda online y a qué precio web. Es de CAYLA entera, no de una sede: la web es una sola. La cabecera es la de Catálogo ▸ Productos
// (`EncabezadoPagina`, ADR-0220), la misma que dibuja la maqueta aprobada.
export default async function VitrinaPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("vitrina_web");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_vitrina_modelos");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Vitrina web"
        subtitulo="Qué modelos se ven en la tienda online y a qué precio. El cliente ve cuánto hay en cada tienda."
      />
      {error ? (
        <Aviso tono="error" titulo="No se pudo leer la vitrina">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <VitrinaPantalla lectura={leerVitrina(data)} />
      )}
    </div>
  );
}

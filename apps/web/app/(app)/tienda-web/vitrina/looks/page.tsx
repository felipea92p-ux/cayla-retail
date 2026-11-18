import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerLooks, leerPorTienda } from "@/lib/vitrina-looks-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { LooksPantalla } from "@/components/vitrina/LooksPantalla";
import { VitrinaPestanas } from "@/components/vitrina/VitrinaPestanas";

// Tienda web ▸ Vitrina ▸ Looks (ADR-0408, actividad 11; maqueta docs/maquetas/tienda-online-2026-10, «looks-erp»): las combinaciones
// que la tienda online muestra en «Arma tu look». Es parte del módulo `vitrina_web` (una pestaña de la Vitrina, no otro módulo:
// ADR-0306), con la misma cabecera de Catálogo ▸ Productos (`EncabezadoPagina`, ADR-0220).
export default async function VitrinaLooksPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("vitrina_web");
  const supabase = await createClient();
  // En qué tiendas sale cada look (ADR-0468): se pide a la vez, y si falla (o todavía no está en la base) la lista se ve igual, solo sin los chips por tienda.
  const [{ data, error }, porTienda] = await Promise.all([
    supabase.rpc("fn_vitrina_looks"),
    supabase.rpc("fn_vitrina_looks_por_tienda").then(({ data: d, error: e }) => (e ? null : leerPorTienda(d))),
  ]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Vitrina"
        subtitulo="Los looks de «Arma tu look»: prendas que se ven bien juntas y que el cliente agrega completas, eligiendo cada talla."
      />
      <VitrinaPestanas activa="looks" />
      {error ? (
        <Aviso tono="error" titulo="No se pudieron leer los looks">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <LooksPantalla lectura={leerLooks(data)} porTienda={porTienda} />
      )}
    </div>
  );
}

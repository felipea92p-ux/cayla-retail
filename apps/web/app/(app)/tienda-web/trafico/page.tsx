import { Footprints } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { leerResumen, periodoSieteDias, sinNoticias } from "@/lib/trafico-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Vacio } from "@/components/ui/Vacio";
import { CifraTrafico } from "@/components/trafico/CifraTrafico";
import { RecorridoTrafico } from "@/components/trafico/RecorridoTrafico";
import { VitrinaTrafico } from "@/components/trafico/VitrinaTrafico";

// Tienda web ▸ Tráfico (ADR-0495; maqueta C «La vitrina», Felipe 2026-10-23): cuánta gente entra a la tienda online, qué mira y en qué
// paso se va, contado por persona anónima (`retail.resumen_trafico_web`, que pide el módulo «trafico»). Es de toda la tienda online: la
// cabecera dice «Todas las tiendas».
export default async function TraficoPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  await exigirModulo("trafico");
  const { desde, hasta } = periodoSieteDias(hoyLima());
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resumen_trafico_web", { p_desde: desde, p_hasta: hasta });
  const r = error ? null : leerResumen(data);
  const callada = r ? sinNoticias(r.ultimoDato, new Date()) : null;
  const total = r?.pasos[0] ?? 0;

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede="Todas las tiendas" detalle="Tienda web" titulo="Tráfico" subtitulo="Qué prendas mira la gente, de dónde viene y dónde se va.">
        {r && total > 0 ? <CifraTrafico r={r} /> : undefined}
      </EncabezadoPagina>
      {r === null ? (
        <Aviso tono="error" titulo="No se pudo leer el tráfico de la tienda web">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <>
          {callada && (
            <Aviso tono="atencion" titulo={`La tienda online no manda visitas desde ${callada.desde}`}>
              Las cifras de hoy pueden estar incompletas. Si sigue así, revisa que la tienda online esté publicada y abra bien.
            </Aviso>
          )}
          {total > 0 ? (
            <>
              <RecorridoTrafico r={r} />
              {r.prendas.length > 0 && (
                <VitrinaTrafico prendas={r.prendas} vieron={r.pasos[1]} base={r.base} periodo="Últimos 7 días" antes="Los 7 días anteriores" />
              )}
            </>
          ) : (
            <Vacio
              icono={<Footprints />}
              titulo={r.ultimoDato ? "Nadie entró a la tienda online en estos días" : "Todavía no hay visitas anotadas"}
              guia="trafico.vacio"
            >
              {r.ultimoDato
                ? "Cuando alguien entre, lo verás aquí con su camino, su ciudad y hasta dónde llegó."
                : "La tienda online empieza a contar a la gente desde que se publica esta medición. Vuelve en un rato."}
            </Vacio>
          )}
        </>
      )}
    </div>
  );
}

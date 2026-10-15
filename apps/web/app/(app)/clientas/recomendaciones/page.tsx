import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { leerRecomendaciones } from "@/lib/recomendaciones-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RecomendacionesPantalla } from "@/components/recomendaciones/RecomendacionesPantalla";

// Clientes ▸ Recomendaciones (ADR-0408, Felipe 2026-10-15; migraciones 20261015134000 y 20261015135000): lo que los clientes le
// recomiendan a CAYLA desde la tienda online, SIEMPRE con su nombre. Son de todas las tiendas y de CAYLA en general (por eso la
// cabecera dice «Todas las tiendas»). La recomendación abierta vive en la URL (`?r=<id>`): se comparte y sobrevive a recargar.
export default async function RecomendacionesPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  await exigirModulo("recomendaciones");
  const { r } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_recomendaciones");
  const lista = error ? null : leerRecomendaciones(data);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Recomendaciones"
        subtitulo="Lo que los clientes le recomiendan a CAYLA desde la tienda online, con su nombre. Léelas, respóndeles y archívalas."
      />
      {lista === null ? (
        <Aviso tono="error" titulo="No se pudieron leer las recomendaciones">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <RecomendacionesPantalla
          lista={lista}
          hoy={hoyLima()}
          ahoraIso={new Date().toISOString()}
          abiertaInicial={r && /^[0-9a-f-]{36}$/i.test(r) ? r : null}
        />
      )}
    </div>
  );
}

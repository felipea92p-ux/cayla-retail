import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerLibro } from "@/lib/libro-reclamaciones-lectura";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { LibroPantalla } from "@/components/libro-reclamaciones/LibroPantalla";

// Tienda web ▸ Libro de Reclamaciones (ADR-0679, Felipe 2026-11-18; migraciones 20261118145000 a 20261118151000): las hojas que los
// clientes dejan en el Libro de Reclamaciones virtual de la tienda online, con su plazo legal de 15 días hábiles. Son de todas las tiendas
// (por eso la cabecera dice «Todas las tiendas»). La hoja abierta vive en la URL (`?h=<id>`): se comparte y sobrevive a recargar.
export default async function LibroReclamacionesPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  await exigirModulo("libro_reclamaciones");
  const { h } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_libro_reclamaciones");
  const libro = error ? null : leerLibro(data);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        detalle="Tienda web"
        titulo="Libro de Reclamaciones"
        subtitulo="Las hojas que los clientes dejan en la tienda online. La ley da 15 días hábiles para responder cada una: aquí ves cuántos le quedan."
      />
      {libro === null ? (
        <Aviso tono="error" titulo="No se pudieron leer las hojas">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <LibroPantalla libro={libro} abiertaInicial={h && /^[0-9a-f-]{36}$/i.test(h) ? h : null} />
      )}
    </div>
  );
}

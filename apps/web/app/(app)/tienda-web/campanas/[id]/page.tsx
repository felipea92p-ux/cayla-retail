import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { leerFichaCampana } from "@/lib/campanas-web-editor";
import { pctDicho, vigenciaDicha } from "@/lib/campanas-web-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Volver } from "@/components/ui/Volver";
import { EditorCampana } from "@/components/campanas-web/EditorCampana";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tienda web ▸ Campañas ▸ Diseñar la campaña (Felipe 2026-10-21; maqueta docs/maquetas/campanas-tienda-2026-10, pantalla 2). Es una pantalla
// del módulo `campanas_web` (su layout ya lo exige), no un módulo nuevo (ADR-0306): se llega desde la lista. Las fechas, el descuento y las
// prendas no se tocan aquí: se arman en Catálogo ▸ Etiquetas (una sola fuente de verdad).
export default async function DisenarCampanaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas_web");
  const supabase = await createClient();
  // Un id que ni es un uuid no llega a la base: es una campaña que no existe, igual que uno borrado.
  const { data, error } = ES_UUID.test(id) ? await supabase.rpc("fn_campana_diseno", { p_etiqueta_id: id }) : { data: null, error: null };
  const ficha = error ? null : leerFichaCampana(data);
  const noExiste = !ficha && (!ES_UUID.test(id) || `${error?.message ?? ""}${error?.hint ?? ""}`.includes("campana_no_existe"));
  const c = ficha?.campana;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle={c ? `Tienda web · Campañas · ${c.nombre}` : "Tienda web · Campañas"}
        titulo="Diseñar la campaña"
        subtitulo={c ? `${c.nombre} · ${pctDicho(c.pct)} · ${vigenciaDicha(c.desde, c.hasta)}` : "Cómo se ve la tienda online durante esta campaña."}
        volver={<Volver href="/tienda-web/campanas" a="las campañas" />}
        acciones={
          c && veModulo(persona, "etiquetas") ? <EnlaceVer href="/productos/atributos?tipo=etiquetas">Cambiar fechas o prendas en Etiquetas</EnlaceVer> : undefined
        }
      />
      {ficha ? (
        <EditorCampana key={`${ficha.campana.id}-${ficha.diseno?.version ?? 0}`} ficha={ficha} tiendaUrl={process.env.TIENDA_URL || DIRECCION_TIENDA_ONLINE} />
      ) : noExiste ? (
        <Aviso tono="atencion" titulo="Esa campaña ya no existe">
          Puede que se haya archivado en Etiquetas o que el enlace esté viejo. Vuelve a la lista de campañas.
        </Aviso>
      ) : (
        <Aviso tono="error" titulo="No se pudo abrir la campaña">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      )}
    </div>
  );
}

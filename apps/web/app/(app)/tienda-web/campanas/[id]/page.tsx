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
import { Pestanas } from "@/components/ui/Pestanas";
import { TarjetaDeCampana } from "@/components/EtiquetasLista";
import { cargarEtiquetasPantalla } from "@/lib/etiquetas-pantalla-datos";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tienda web ▸ Campañas ▸ Diseñar la campaña (Felipe 2026-10-21; maqueta docs/maquetas/campanas-tienda-2026-10, pantalla 2). Es una pantalla
// del módulo `campanas_web` (su layout ya lo exige), no un módulo nuevo (ADR-0306): se llega desde la lista. Desde ADR-0473 (Felipe
// 2026-10-22: «que se pueda editar desde ambos módulos», «mismas piezas dentro») tiene una segunda pestaña, «Datos y prendas», con la
// MISMA tarjeta y las mismas hojas de Catálogo ▸ Insignias (`TarjetaDeCampana`): una sola fuente de verdad, dos puertas.
export default async function DisenarCampanaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pestana?: string }> }) {
  const { id } = await params;
  const pestana = (await searchParams).pestana === "datos" ? "datos" : "diseno";
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas_web");
  const supabase = await createClient();
  // Un id que ni es un uuid no llega a la base: es una campaña que no existe, igual que uno borrado.
  const { data, error } = ES_UUID.test(id) ? await supabase.rpc("fn_campana_diseno", { p_etiqueta_id: id }) : { data: null, error: null };
  const ficha = error ? null : leerFichaCampana(data);
  const noExiste = !ficha && (!ES_UUID.test(id) || `${error?.message ?? ""}${error?.hint ?? ""}`.includes("campana_no_existe"));
  const c = ficha?.campana;
  // «Datos y prendas» se lee solo al abrir esa pestaña, con el mismo cargador de Catálogo ▸ Insignias.
  // Si la lectura falla, la pestaña lo dice y el resto de la ficha sigue en pie.
  const datos =
    ficha && pestana === "datos"
      ? await cargarEtiquetasPantalla({ modo: "campanas", puedeEditar: true, conRotacion: false, esLider: persona.rol === "lider" }).catch((e: unknown) => {
          console.error("Datos y prendas (Tienda web ▸ Campañas):", e);
          return null;
        })
      : null;
  const campanaDatos = datos?.etiquetas.find((e) => e.id === id) ?? null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle={c ? `Tienda web · Campañas · ${c.nombre}` : "Tienda web · Campañas"}
        titulo="Diseñar la campaña"
        subtitulo={c ? `${c.nombre} · ${pctDicho(c.pct)} · ${vigenciaDicha(c.desde, c.hasta)}` : "Cómo se ve la tienda online durante esta campaña."}
        volver={<Volver href="/tienda-web/campanas" a="las campañas" />}
        acciones={
          c && veModulo(persona, "campanas") ? <EnlaceVer href="/productos/insignias">Cambiar fechas o prendas en Insignias</EnlaceVer> : undefined
        }
      />
      {ficha && (
        <Pestanas
          etiquetaAccesible="Partes de la campaña"
          idIndicador="campana-web-partes"
          guia="campana-web.pestanas"
          activa={pestana}
          items={[
            { clave: "diseno", etiqueta: "Diseño", href: `/tienda-web/campanas/${id}`, guia: "campana-web.pestana-diseno" },
            { clave: "datos", etiqueta: "Datos y prendas", href: `/tienda-web/campanas/${id}?pestana=datos`, guia: "campana-web.pestana-datos" },
          ]}
        />
      )}
      {ficha && pestana === "datos" ? (
        datos && campanaDatos ? (
          <div className="space-y-3" data-guia="campana-web.datos">
            <p className="max-w-prose text-[13px] text-taupe">
              Su descuento, sus fechas, las categorías donde rige y sus prendas. Es lo mismo que en Catálogo ▸ Insignias: lo que cambies aquí
              cambia allá, en la caja de las tiendas y en la tienda online.
            </p>
            <TarjetaDeCampana
              campana={campanaDatos}
              categorias={datos.categorias}
              tiendas={datos.tiendas}
              sedeActualId={persona.ubicacionId}
              prendasConCosto={datos.prendasConCosto}
              variantesManuales={datos.variantesManuales[id] ?? []}
            />
          </div>
        ) : (
          <Aviso tono="error" titulo="No se pudieron leer los datos de la campaña">
            Recarga la página; si sigue, avísale al líder.
          </Aviso>
        )
      ) : ficha ? (
        <EditorCampana key={`${ficha.campana.id}-${ficha.diseno?.version ?? 0}`} ficha={ficha} tiendaUrl={process.env.TIENDA_URL || DIRECCION_TIENDA_ONLINE} />
      ) : noExiste ? (
        <Aviso tono="atencion" titulo="Esa campaña ya no existe">
          Puede que se haya archivado en Catálogo ▸ Insignias o que el enlace esté viejo. Vuelve a la lista de campañas.
        </Aviso>
      ) : (
        <Aviso tono="error" titulo="No se pudo abrir la campaña">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      )}
    </div>
  );
}

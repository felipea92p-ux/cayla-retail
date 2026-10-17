import { notFound } from "next/navigation";
import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { leerTodas } from "@/lib/resultado";
import { getCostosVariantes } from "@/lib/catalogo-v2";
import { getPreciosDeLasTiendas } from "@/lib/precios-sede-datos";
import { aPrendasConCosto, type VarianteParaCosto } from "@/lib/etiqueta-campana";
import { leerCampanaDetalle } from "@/lib/campana-detalle";
import { datosDeCampana, estadoDeCampana, type Campana } from "@/lib/campanas-reglas";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";
import { Volver } from "@/components/ui/Volver";
import { DatosCampana } from "@/components/campanas/DatosCampana";
import { PrendasCampana } from "@/components/campanas/PrendasCampana";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sinPrecios = () => ({ nombres: new Map<string, string>(), porSede: {} as Record<string, Record<string, number>> });

// Tienda web ▸ Campañas ▸ una campaña (ADR-0436, actividad 2; maqueta, pantalla 4): sus Datos (lo que era «Configurar campaña» de
// Catálogo ▸ Atributos) y sus Prendas. La pestaña vive en la URL (`?pestana=prendas`). La campaña y las prendas para el aviso de costo
// se leen a la vez; el costo solo llega a quien puede verlo (`getCostosVariantes`), y sin él no hay aviso de «por debajo del costo».
export default async function CampanaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pestana?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("campanas");
  const [{ id }, { pestana }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const vista = pestana === "prendas" ? "prendas" : "datos";
  const supabase = await createClient();
  const hoy = hoyLima();

  const [detalle, categorias, familias, tiendas, nombres, variantes, costos] = await Promise.all([
    supabase.rpc("campana_detalle" as never, { p_id: id } as never),
    supabase.from("categorias").select("id, nombre, familia").eq("activo", true).order("nombre"),
    supabase.from("familias").select("codigo, nombre"),
    supabase.from("ubicaciones").select("nombre").eq("tipo", "tienda").eq("activo", true).order("nombre"),
    supabase.from("etiquetas").select("id, nombre"),
    leerTodas((desde, hasta) =>
      supabase.from("variantes").select("id, sku, precio, producto:productos ( referencia, categoria_id )").eq("activo", true).order("id").range(desde, hasta),
    ),
    getCostosVariantes(),
  ]);

  if (detalle.error?.hint === "campana_no_existe") notFound();
  const campana = detalle.error ? null : leerCampanaDetalle(detalle.data);
  const volver = <Volver href="/tienda-web/campanas" a="Campañas" />;
  if (!campana) {
    return (
      <div className="tw space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} detalle="Tienda web · Campañas" titulo="Campaña" volver={volver} />
        <Aviso tono="error" titulo="No se pudo leer la campaña">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      </div>
    );
  }

  // El precio más bajo al que se cobra cada prenda en las tiendas, solo si hay costos (sin ellos no hay aviso y no se pide).
  const precios = costos === null ? sinPrecios() : await getPreciosDeLasTiendas();
  const prendasConCosto = variantes.error ? [] : aPrendasConCosto((variantes.data ?? []) as unknown as VarianteParaCosto[], costos, precios);
  const nombreFamilia = new Map((familias.data ?? []).map((f) => [f.codigo, f.nombre]));
  const opcionesCategoria = (categorias.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, familia: (c.familia && nombreFamilia.get(c.familia)) || "Sin familia" }));
  // Para la cabecera y la insignia: la campaña con los conteos de la lista.
  const resumen: Campana = {
    id: campana.id,
    nombre: campana.nombre,
    activo: campana.activo,
    estado: campana.estado,
    desde: campana.desde,
    hasta: campana.hasta,
    pct: campana.pct,
    modelos: campana.prendas.length,
    variantes: campana.varianteIds.length,
    categorias: campana.categoriaIds.length,
  };
  const estado = estadoDeCampana(resumen, hoy);
  const chip =
    estado === "vigente" ? (
      <Chip tono="verde">Vigente</Chip>
    ) : estado === "proxima" ? (
      <Chip tono="ambar">Próxima</Chip>
    ) : estado === "desactivada" ? (
      <Chip tono="apagado" tachado={false}>
        Desactivada
      </Chip>
    ) : estado === "termino" ? (
      <Chip tono="neutro">Terminó</Chip>
    ) : estado === "por_aprobar" ? (
      <Chip tono="ambar">Por aprobar</Chip>
    ) : (
      <Chip tono="neutro">Sin fechas</Chip>
    );

  return (
    <div className="tw space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web · Campañas"
        titulo={campana.nombre}
        subtitulo={datosDeCampana(resumen).join(" · ")}
        volver={volver}
        pie={chip}
      />
      <Pestanas
        etiquetaAccesible={`Partes de ${campana.nombre}`}
        activa={vista}
        idIndicador="campana"
        guia="campana.pestanas"
        items={[
          { clave: "datos", etiqueta: "Datos", href: `/tienda-web/campanas/${campana.id}`, ayuda: "Nombre, fechas, descuento y dónde rige", guia: "campana.pestana-datos" },
          {
            clave: "prendas",
            etiqueta: "Prendas",
            href: `/tienda-web/campanas/${campana.id}?pestana=prendas`,
            conteo: campana.prendas.length,
            tono: "neutro",
            pide: "modelos",
            ayuda: "Las prendas que lleva la campaña",
            guia: "campana.pestana-prendas",
          },
        ]}
      />
      {vista === "datos" ? (
        <DatosCampana
          campana={campana}
          categorias={opcionesCategoria}
          prendasConCosto={prendasConCosto}
          tiendas={(tiendas.data ?? []).map((t) => nombreCorto(t.nombre))}
          nombresUsados={(nombres.data ?? []).filter((e) => e.id !== campana.id).map((e) => e.nombre)}
          hoy={hoy}
        />
      ) : (
        <PrendasCampana campana={campana} prendasConCosto={prendasConCosto} />
      )}
    </div>
  );
}

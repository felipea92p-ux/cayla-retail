import { CalendarClock, FileX, Shirt, Wallet } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getOpcionesNuevaOrden } from "@/lib/produccion";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { getEdicionDeTela, getOrdenProduccionPagina, sePuedeEditarLaTela } from "@/lib/orden-pagina";
import { cifrasDeLaOrden, fraseDeLaOrden, puedeCambiarQuien } from "@/lib/orden-pagina-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { FichaDeLaOrden } from "@/components/orden-pagina/FichaDeLaOrden";
import { RutaDeFases } from "@/components/orden-pagina/RutaDeFases";
import { TelaDeLaOrdenVista } from "@/components/orden-pagina/TelaDeLaOrdenVista";
import { CostoDeLaOrden } from "@/components/orden-pagina/CostoDeLaOrden";
import { LineaDeTiempo } from "@/components/orden-pagina/LineaDeTiempo";
import { AccionesDeLaOrden } from "@/components/orden-pagina/AccionesDeLaOrden";

// Una orden de producción en su propia página (ADR-0400, actividad 3; vista D de la lámina, elegida por Felipe el 2026-10-14): `/produccion/ordenes/OP-000012`. La cabecera dice qué orden es,
// qué prenda y cuántas; bajo ella, la ficha, las fases en fila con quién las hace y la acción de cada una, la tela y el costo, y la línea de tiempo. Se llega desde la lista de Órdenes y
// se puede mandar el enlace. La puerta del módulo la pone el layout de `/produccion`; aquí se pide la persona para la cabecera y para saber si está parada en el Taller.
export default async function OrdenProduccionPage({ params }: { params: Promise<{ numero: string }> }) {
  const persona = await requirePersonaActualV2();
  const volver = <Volver href="/produccion/ordenes" a="Órdenes" />;
  if (!puedeVerProduccion(persona)) return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  const { numero } = await params;
  const { orden: datos, falla } = await getOrdenProduccionPagina(numero);

  if (falla || !datos) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Orden de producción" subtitulo="Un lote que se fabrica en el Taller." volver={volver} />
        {falla ? (
          <Aviso tono="error" titulo="No se pudo leer la orden">
            {falla}
          </Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio
              icono={<FileX />}
              titulo="No encontramos esa orden"
              acciones={
                <BotonVer href="/produccion/ordenes">Ver las órdenes</BotonVer>
              }
            >
              El enlace no corresponde a ninguna orden del Taller.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  const hoy = hoyLima();
  const cifras = cifrasDeLaOrden(datos, hoy);
  // «Cambiar quién» necesita la lista de servicios con sus tarifas, y «Editar tela y avíos» lo que ya reservan las demás órdenes y el consumo del modelo; solo se pide si alguna de las dos
  // cosas se puede hacer. Es dato secundario: si no responde, la página se ve igual.
  const puedeEditarTela = sePuedeEditarLaTela(datos);
  const opciones = datos.fases.some((f) => puedeCambiarQuien(f, datos)) || puedeEditarTela ? await getOpcionesNuevaOrden(datos.orden.ubicacionId) : null;
  const edicionDeTela = await getEdicionDeTela(datos, opciones?.datos ?? null, hoy);

  return (
    <div className="op-pagina space-y-6">
      <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo={datos.orden.numeroTexto} subtitulo={fraseDeLaOrden(datos.orden)} volver={volver} acciones={<AccionesDeLaOrden datos={datos} />}>
        <ResumenSede
          sede={persona.ubicacionEtiqueta}
          cifras={[
            { valor: cifras.prendas.valor, etiqueta: cifras.prendas.etiqueta, aparte: cifras.prendas.aparte ?? undefined, icono: Shirt },
            { valor: cifras.entrega.valor, etiqueta: cifras.entrega.etiqueta, nota: cifras.entrega.nota ?? undefined, icono: CalendarClock, alerta: cifras.entrega.atrasada },
            ...(cifras.costo ? [{ valor: cifras.costo.valor, formato: "soles" as const, etiqueta: cifras.costo.etiqueta, nota: cifras.costo.nota, icono: Wallet }] : []),
          ]}
        />
      </EncabezadoPagina>

      <FichaDeLaOrden datos={datos} hoy={hoy} />
      <RutaDeFases datos={datos} opciones={opciones} hoy={hoy} />

      <div className="op-bloques">
        <div className="space-y-6">
          <TelaDeLaOrdenVista datos={datos} puedePedir={persona.modulos.some((m) => m.clave === "ordenes_insumos")} edicion={edicionDeTela.datos} edicionFalla={edicionDeTela.falla} />
          <CostoDeLaOrden datos={datos} />
        </div>
        <LineaDeTiempo datos={datos} hoy={hoy} />
      </div>
    </div>
  );
}

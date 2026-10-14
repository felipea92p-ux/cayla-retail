import { PackageX } from "lucide-react";
import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getCatalogoParaRecibir, getDatosRecepcionEnvio } from "@/lib/recepcion-envio";
import { getConteosDelEnvio } from "@/lib/recepcion-conteo";
import { getProveedoresActivos } from "@/lib/compras";
import { necesitaCatalogoAlCerrar } from "@/lib/recepcion-conteo-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { RecibirEnvio } from "@/components/recepcion-envio/RecibirEnvio";
import { RecibirContando } from "@/components/recepcion-conteo/RecibirContando";

// Recibir en la sede un envío de orden de compra (ADR-0362, fase 4; contrato:
// docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md). Se llega desde la puerta de Recibir («Envíos de órdenes de compra
// para esta sede») o desde «Recibir sin guía». La puerta del módulo la pone `recibir/layout.tsx` (el módulo Recibir es la llave, decisión 40);
// las reglas viven en `abrir_despacho`, `preparar_prenda_al_recibir` y `recibir_despacho`, y la pantalla las espeja para decirlas antes de pulsar.
//
// Si la base no responde, lo dice (principio 9): nunca un formulario que falle al guardar. Si el envío no existe, lo dice y lleva a Recibir.
//
// ADR-0393: con la base al día, el envío se recibe CONTANDO PRIMERO (la cara A: un número por categoría, lo demás para después). Si la base
// todavía no tiene ADR-0393 (la web se publica antes que el SQL, que se pega con el OK de Felipe), sigue la recepción de la fase 4.
export default async function RecibirEnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await requirePersonaActualV2();
  const { id } = await params;
  const [datos, conteos] = await Promise.all([getDatosRecepcionEnvio(id), getConteosDelEnvio(id)]);

  if (datos.falla || !datos.detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo="Recibir un envío"
          subtitulo="Lo que llega a tu sede de una orden de compra o sin aviso."
          volver={<Volver href="/recibir" a="Recibir mercadería" />}
        />
        {datos.falla ? (
          <Aviso tono="error" titulo="No se pudo leer el envío">
            {datos.falla}
          </Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio
              icono={<PackageX />}
              titulo="No encontramos ese envío"
              acciones={
                <BotonEnlace href="/recibir" peso="primario" /* unificar-fijo: la acción de un vacío (ronda 5): ahí, ir a otra pantalla es el paso principal */>
                  Ir a Recibir mercadería
                </BotonEnlace>
              }
            >
              El enlace no corresponde a ningún envío. Los que llegan a tu sede están en Recibir mercadería.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  if (conteos.soportado) {
    if (conteos.falla) {
      return (
        <div className="space-y-6">
          <EncabezadoPagina
            sede={persona.ubicacionEtiqueta}
            titulo={`Recibir ${datos.detalle.numero}`}
            subtitulo="Lo que llegó, contado por categoría."
            volver={<Volver href="/recibir" a="Recibir mercadería" />}
          />
          <Aviso tono="error" titulo="No se pudo leer lo contado">
            {conteos.falla}
          </Aviso>
        </div>
      );
    }
    // Cerrado con pendientes: «Hacer ahora» pone tallas o crea la prenda, y necesita el vocabulario (el cargador solo lo lee por recibir).
    const catalogo = datos.catalogo ?? (necesitaCatalogoAlCerrar(conteos.conteos) ? await getCatalogoParaRecibir() : null);
    // Llegó sin aviso y sin saber de quién (Felipe 2026-10-14): al cerrar se elige el proveedor. Solo entonces se leen.
    const proveedoresParaElegir = conteos.conteos?.proveedorPorConfirmar ? (await getProveedoresActivos()).map((p) => ({ id: p.id, nombre: p.nombre })) : [];
    return (
      <RecibirContando
        key={datos.detalle.id}
        detalle={datos.detalle}
        conteos={conteos.conteos}
        sedeActual={{ id: persona.ubicacionId, etiqueta: persona.ubicacionEtiqueta }}
        creadoPorMi={datos.creadoPorMi}
        catalogo={catalogo}
        lotes={datos.lotes}
        veExistencias={veModulo(persona, "existencias")}
        veDinero={puede(persona, "verDineroCompras")}
        proveedoresParaElegir={proveedoresParaElegir}
      />
    );
  }

  return (
    <RecibirEnvio
      key={datos.detalle.id}
      detalle={datos.detalle}
      sedeActual={{ id: persona.ubicacionId, etiqueta: persona.ubicacionEtiqueta }}
      creadoPorMi={datos.creadoPorMi}
      catalogo={datos.catalogo}
      lotes={datos.lotes}
      veExistencias={veModulo(persona, "existencias")}
    />
  );
}

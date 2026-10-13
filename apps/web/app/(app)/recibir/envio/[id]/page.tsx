import { PackageX } from "lucide-react";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getDatosRecepcionEnvio } from "@/lib/recepcion-envio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/campos";
import { RecibirEnvio } from "@/components/recepcion-envio/RecibirEnvio";

// Recibir en la sede un envío de orden de compra (ADR-0362, fase 4; contrato:
// docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md). Se llega desde la puerta de Recibir («Envíos de órdenes de compra
// para esta sede») o desde «Recibir sin guía». La puerta del módulo la pone `recibir/layout.tsx` (el módulo Recibir es la llave, decisión 40);
// las reglas viven en `abrir_despacho`, `preparar_prenda_al_recibir` y `recibir_despacho`, y la pantalla las espeja para decirlas antes de pulsar.
//
// Si la base no responde, lo dice (principio 9): nunca un formulario que falle al guardar. Si el envío no existe, lo dice y lleva a Recibir.
export default async function RecibirEnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const persona = await requirePersonaActualV2();
  const { id } = await params;
  const datos = await getDatosRecepcionEnvio(id);

  if (datos.falla || !datos.detalle) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo="Recibir un envío"
          subtitulo="Lo que llega de una orden de compra, contado talla por talla."
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

import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Aviso } from "@/components/ui/Aviso";
import { BarridoPiso } from "@/components/barrido-piso/BarridoPiso";
import { exigirModulo } from "@/lib/persona-actual";
import { getCatalogoConteo } from "@/lib/conteos";
import { getBarridoEstado, getPorResolver } from "@/lib/barrido-piso";

// «El barrido del piso» (ADR-0690, Felipe 2026-11-22): una o varias personas escanean lo COLGADO de la tienda, cada una desde su
// celular, sin repartirse áreas. Cada lectura va a la base con quién y a qué hora, y el total de cada prenda es la suma del equipo.
// La sede es siempre la activa de quien entra. Al confirmar (actividad 5) se corrige piso y almacén en los dos sentidos.
export default async function BarridoPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("existencias");
  const sede = persona.ubicacionEtiqueta;
  // En paralelo: el catálogo ENTERO de la sede (una prenda colgada que el sistema no tiene aquí también se escanea), el barrido y lo
  // que los barridos confirmados dejaron por resolver (actividad 8).
  const [prendas, barrido, porResolver] = await Promise.all([
    getCatalogoConteo(persona.ubicacionId),
    getBarridoEstado(persona.ubicacionId),
    getPorResolver(persona.ubicacionId),
  ]);

  return (
    <div className="space-y-6 pb-32 sm:pb-24">
      <EncabezadoPagina
        sede={sede}
        titulo="Barrido del piso"
        subtitulo="Escanea todo lo colgado. Pueden hacerlo varias personas a la vez, cada una desde su celular."
        volver={<Volver href="/inventario" a="Existencias" />}
        acciones={
          <BotonVer href="/inventario/barrido/historial" guia="barrido.historial">
            Historial
          </BotonVer>
        }
      />
      {!barrido.estado ? (
        <Aviso tono="error" titulo="No se pudo leer el barrido">
          {barrido.fallo}
        </Aviso>
      ) : !barrido.estado.separa ? (
        <p className="nota-cayla">{sede} todavía no separa piso y almacén, así que aquí no hay piso que barrer.</p>
      ) : (
        // `key`: si quien escanea cambia de sede, la cola de una tienda no se arrastra a otra.
        <BarridoPiso
          key={persona.ubicacionId}
          ubicacionId={persona.ubicacionId}
          sede={sede}
          prendas={prendas}
          estadoInicial={barrido.estado}
          porResolverInicial={porResolver}
          ahoraServidor={new Date().toISOString()}
        />
      )}
    </div>
  );
}

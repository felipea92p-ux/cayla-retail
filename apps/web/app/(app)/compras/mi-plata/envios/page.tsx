import { PackageCheck } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getMiPlata, getMisEnvios } from "@/lib/mi-plata";
import { hoyLima } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { MisEnvios } from "@/components/mi-plata/MisEnvios";

// Compras ▸ Mis compras ▸ Mis envíos (ADR-0480; maqueta docs/maquetas/mis-compras-envios-2026-10/, Felipe 2026-10-26): los paquetes que
// mandó la compradora a las tiendas, cada uno con su código (ENV-000118) para avisar a la sede qué buscar en Recibir, agrupados por la
// ronda en que salieron. Solo se lee. Si no se pudo leer, lo dice (principio 9): nunca «no mandaste nada» inventado. Una terminal no
// tiene «tus envíos».
export default async function MisEnviosPage() {
  const persona = await exigirModulo("ordenes_compra");
  const [envios, plata] = await Promise.all([getMisEnvios(), getMiPlata()]);
  const abierta = plata?.persona ? plata.ronda.abierta : null;
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Mis envíos"
        subtitulo="Los envíos que mandaste a las tiendas, con su código y en qué van."
        volver={<Volver href="/compras/mi-plata" a="Mis compras" />}
      />
      {/* Una terminal no tiene «tus envíos»: se dice primero, aunque la lectura de los envíos tampoco haya llegado (no es un error). */}
      {plata && !plata.persona ? (
        <Vacio icono={<PackageCheck aria-hidden />} titulo="Entra con tu cuenta">
          Los envíos son de cada persona: desde una terminal no hay «tus envíos». Entra con tu correo para verlos.
        </Vacio>
      ) : envios === null ? (
        <Aviso tono="error" titulo="No se pudieron leer tus envíos">
          Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.
        </Aviso>
      ) : (
        <MisEnvios
          envios={envios}
          rondaAbierta={abierta ? { id: abierta.id, texto: abierta.texto, abiertaEn: abierta.abiertaEn } : null}
          porMandar={plata?.porMandar ?? []}
          hoy={hoyLima()}
        />
      )}
    </div>
  );
}

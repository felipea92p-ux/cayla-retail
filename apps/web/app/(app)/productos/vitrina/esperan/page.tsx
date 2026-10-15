import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { leerEsperan } from "@/lib/vitrina-esperan-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { EsperanPantalla } from "@/components/vitrina/EsperanPantalla";

// Catálogo ▸ Vitrina web ▸ Esperan una talla (ADR-0408, actividad 12; maqueta docs/maquetas/tienda-online-2026-10, la cifra
// «Esperan una talla» de la Vitrina). Es una pantalla del módulo `vitrina_web` (su layout ya lo exige), no un módulo nuevo
// (ADR-0306): se llega desde la cifra de la Vitrina. Solo lee: lo que los clientes pidieron con «Avísame», sin datos de nadie.
export default async function EsperanPage() {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("vitrina_web");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_vitrina_esperan");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Esperan una talla"
        subtitulo="Lo que los clientes de la tienda online pidieron que les avisen cuando llegue, por modelo, color, talla y tienda."
        volver={<Volver href="/productos/vitrina" a="Vitrina web" />}
      />
      {error ? (
        <Aviso tono="error" titulo="No se pudo leer lo que esperan los clientes">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <EsperanPantalla lectura={leerEsperan(data)} hoy={hoyLima()} />
      )}
    </div>
  );
}

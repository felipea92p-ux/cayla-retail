import { exigirModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { filtrosDeLaUrl, leerVitrina } from "@/lib/vitrina-reglas";
import { personasQueEsperan } from "@/lib/vitrina-esperan-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { VitrinaPantalla } from "@/components/vitrina/VitrinaPantalla";
import { ReglaDelPrecio } from "@/components/vitrina/ReglaDelPrecio";
import { VitrinaPestanas } from "@/components/vitrina/VitrinaPestanas";

// Tienda web ▸ Vitrina (ADR-0408, actividad 3; maqueta docs/maquetas/tienda-online-2026-10, «vitrina»): qué modelos se ven en la
// tienda online y cómo entran a «Lo nuevo». No hay precio web: en la web cada modelo vale lo que vale en la tienda que el cliente elige
// (Felipe, 2026-10-14). Es de CAYLA entera, no de una sede: la web es una sola. La cabecera es la de Catálogo ▸ Productos
// (`EncabezadoPagina`, ADR-0220), la misma que dibuja la maqueta aprobada.
export default async function VitrinaPage({ searchParams }: { searchParams: Promise<{ filtro?: string; categoria?: string; lonuevo?: string }> }) {
  // Se repite la puerta del layout: un layout no vuelve a correr al navegar entre sus hijas.
  const persona = await exigirModulo("vitrina_web");
  // `?filtro=sin_precio` (y `categoria`, `lonuevo`) es el filtro con el que abre la lista: los enlaces del Resumen llegan ya filtrados.
  // Un valor que no existe se ignora (`filtrosDeLaUrl`): la lista abre completa, nunca rota.
  const filtros = filtrosDeLaUrl(await searchParams);
  const supabase = await createClient();
  // La cifra «Esperan una talla» (actividad 12) se lee a la vez; si falla, la cifra lo dice y la vitrina se ve igual.
  const [{ data, error }, esperan] = await Promise.all([supabase.rpc("fn_vitrina_modelos"), supabase.rpc("fn_vitrina_esperan")]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        detalle="Tienda web"
        titulo="Vitrina"
        subtitulo="Elige qué modelos ve el cliente en la tienda online."
      />
      <VitrinaPestanas activa="modelos" derecha={<ReglaDelPrecio />} />
      {error ? (
        <Aviso tono="error" titulo="No se pudo leer la vitrina">
          Recarga la página; si sigue, avísale al líder.
        </Aviso>
      ) : (
        <VitrinaPantalla
          // Otra dirección con otro filtro (un enlace del Resumen estando ya aquí) rehace la pantalla con ese filtro puesto.
          key={`${filtros.estado}|${filtros.categoria ?? ""}|${filtros.loNuevo}`}
          lectura={leerVitrina(data)}
          esperan={esperan.error ? null : personasQueEsperan(esperan.data)}
          inicial={filtros}
        />
      )}
    </div>
  );
}

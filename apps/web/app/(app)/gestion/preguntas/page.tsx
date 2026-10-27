import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { SelectorMesEnUrl } from "@/components/ui/SelectorMes";
import { Aviso } from "@/components/ui/Aviso";
import { PreguntasEquipo } from "@/components/asistente/PreguntasEquipo";
import { exigirModulo } from "@/lib/persona-actual";
import { mesActualLima, mesLimaUTC } from "@/lib/fechas-lima";
import { mesDeParametro } from "@/lib/facturacion-reglas";
import { getPreguntasEquipo } from "@/lib/asistente/equipo-servidor";
import { getAsistenteEncendido } from "@/lib/asistente/sedes-servidor";

// Gestión ▸ Preguntas del equipo (ADR-0529, actividad 9): lo que el equipo le pregunta a «Pregúntale a CAYLA» en un mes. Felipe lo
// pidió para que las preguntas digan qué falta construir (las que no tuvieron respuesta), qué está escondido (las que se repiten) y
// qué accesos pide la gente; con el nombre de quien preguntó (Felipe 2026-10-27). La sede es la que se mira (en CAYLA Global, todas);
// el mes, `?m=`. Las cifras las cuenta la base sobre todo el mes; la lista trae las 300 más recientes.

export default async function PreguntasEquipoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await exigirModulo("preguntas_equipo");
  const { m } = await searchParams;
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);
  const sede = persona.vista === "global" ? null : persona.ubicacionId;
  const [{ datos, falla }, encendido] = await Promise.all([getPreguntasEquipo(desde, hasta, sede), getAsistenteEncendido(sede)]);

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Preguntas del equipo"
        subtitulo="Lo que tu equipo le pregunta a CAYLA: qué se resolvió, qué no encontró y qué accesos pide."
        acciones={<SelectorMesEnUrl ruta="/gestion/preguntas" mes={mes} actual={actual} guia="preguntas.mes" />}
      />
      {falla ? (
        <Aviso tono="error" titulo="No se pudo cargar">
          {falla}
        </Aviso>
      ) : datos ? (
        <PreguntasEquipo
          datos={datos}
          encendido={encendido}
          puedeEncender={persona.modulos.some((x) => x.clave === "configuracion")}
          todasLasSedes={sede === null}
          mes={mes}
        />
      ) : null}
    </div>
  );
}

import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RespuestasEstados } from "@/components/finanzas/estados/RespuestasEstados";
import { DescargarContador } from "@/components/finanzas/estados/DescargarContador";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { getRespuestasEstados } from "@/lib/estados-financieros";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { ESTADOS, type ClaveEstado } from "@/lib/estados-financieros-reglas";
import { hilosDeLaRuta, hrefTelar, mesDelDia, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

// La cabecera de los cuatro estados (ADR-0585): la cabecera única del ERP (ADR-0220) con «Estados financieros» de título, y debajo las
// cuatro respuestas, que son las pestañas. Se dibuja en el servidor (cada cifra viene de la base) y la comparten las cuatro páginas;
// la sede y el mes son los de la barra del telar (`?sede=`, `?mes=`). A la derecha, «Descargar para el contador» (actividad 8): las
// cuentas van solo en esos archivos.
export async function CabeceraEstados({
  activa,
  mes,
  sede,
  hoy,
  params,
}: {
  activa: ClaveEstado;
  /** «2026-10». */
  mes: string;
  sede: ClaveSede;
  hoy: string;
  /** Los parámetros de la URL: al pasar a otro estado viajan la sede y el mes. */
  params: Iterable<[string, string]>;
}) {
  const ruta = ESTADOS.find((e) => e.clave === activa)!.ruta;
  const telar = await getSedesDelTelar();
  const { sedes } = hilosDeLaRuta(ruta, telar, telar.sedesEstados);
  const nombre = sede === SEDE_TODAS ? null : sede === SEDE_EMPRESA ? "Empresa" : (sedes.find((s) => s.clave === sede)?.nombre ?? null);
  const [respuestas, persona] = await Promise.all([getRespuestasEstados(mes, sede, hoy, nombre), requirePersonaActualV2()]);
  const actuales = [...params];
  const mesDeHoy = mesDelDia(hoy);
  const hrefs = Object.fromEntries(ESTADOS.map((e) => [e.clave, hrefTelar(e.ruta, actuales, {}, { mismaPantalla: false, mesDeHoy })])) as Record<ClaveEstado, string>;
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        sede={nombre ?? "Todas las sedes"}
        titulo="Estados financieros"
        subtitulo={`Cómo le fue a CAYLA en ${mesNombre(mes)}${mes === mesDeHoy ? " (a la fecha)" : ""}, en cuatro respuestas.`}
        acciones={<DescargarContador mes={mes} veTodo={veEstadosFinancierosDeTodoDe(persona)} />}
      />
      <RespuestasEstados respuestas={respuestas} activa={activa} hrefs={hrefs} />
    </div>
  );
}

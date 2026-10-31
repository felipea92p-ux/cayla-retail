import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RespuestasEstados } from "@/components/finanzas/estados/RespuestasEstados";
import { DescargarContador } from "@/components/finanzas/estados/DescargarContador";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { getRespuestasEstados } from "@/lib/estados-financieros";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { conForma, ESTADOS, type ClaveEstado, type FormaEstado } from "@/lib/estados-financieros-reglas";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { hilosDeLaRuta, hrefTelar, mesDelDia, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

// La cabecera de los cuatro estados (ADR-0585): la cabecera única del ERP (ADR-0220) con «Estados financieros» de título, y debajo las
// cuatro respuestas, que son las pestañas. Se dibuja en el servidor (cada cifra viene de la base) y la comparten las cuatro páginas;
// la sede y el mes son los de la barra del telar (`?sede=`, `?mes=`). A la derecha, cómo mirarlo —la respuesta o el formato formal del
// contador (`?forma=formal`, Felipe 2026-10-31: arriba y a la vista, no plegado al final)— y «Descargar para el contador» (actividad 8):
// las cuentas van solo en esos archivos. Al pasar de un estado a otro, la forma se queda.
export async function CabeceraEstados({
  activa,
  mes,
  sede,
  hoy,
  params,
  forma,
}: {
  activa: ClaveEstado;
  /** «2026-10». */
  mes: string;
  sede: ClaveSede;
  hoy: string;
  /** Los parámetros de la URL: al pasar a otro estado viajan la sede y el mes. */
  params: Iterable<[string, string]>;
  /** La respuesta o el formato formal (`formaDe(sp.forma)`). */
  forma: FormaEstado;
}) {
  const ruta = ESTADOS.find((e) => e.clave === activa)!.ruta;
  const telar = await getSedesDelTelar();
  const { sedes } = hilosDeLaRuta(ruta, telar, telar.sedesEstados);
  const nombre = sede === SEDE_TODAS ? null : sede === SEDE_EMPRESA ? "Empresa" : (sedes.find((s) => s.clave === sede)?.nombre ?? null);
  const [respuestas, persona] = await Promise.all([getRespuestasEstados(mes, sede, hoy, nombre), requirePersonaActualV2()]);
  const actuales = [...params];
  const mesDeHoy = mesDelDia(hoy);
  const hrefs = Object.fromEntries(ESTADOS.map((e) => [e.clave, conForma(hrefTelar(e.ruta, actuales, {}, { mismaPantalla: false, mesDeHoy }), forma)])) as Record<ClaveEstado, string>;
  // La misma pantalla con sus parámetros (la fecha del Balance, las semanas), en una forma o en la otra.
  const sinForma = actuales.filter(([k]) => k !== "forma");
  const hrefForma = (f: FormaEstado) => conForma(hrefTelar(ruta, sinForma, {}, { mismaPantalla: true, mesDeHoy }), f);
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        sede={nombre ?? "Todas las sedes"}
        titulo="Estados financieros"
        subtitulo={`Cómo le fue a CAYLA en ${mesNombre(mes)}${mes === mesDeHoy ? " (a la fecha)" : ""}, en cuatro respuestas.`}
        acciones={
          <>
            <SegmentoEnlaces
              etiquetaAccesible="Cómo mirar este estado"
              activo={forma}
              guia="fin-estados.forma"
              opciones={[
                { valor: "respuesta", etiqueta: "Respuesta", href: hrefForma("respuesta") },
                { valor: "formal", etiqueta: "Formato formal", href: hrefForma("formal") },
              ]}
            />
            <DescargarContador mes={mes} veTodo={veEstadosFinancierosDeTodoDe(persona)} />
          </>
        }
      />
      <RespuestasEstados respuestas={respuestas} activa={activa} hrefs={hrefs} />
    </div>
  );
}

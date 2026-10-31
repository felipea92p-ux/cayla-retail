import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RespuestasEstados } from "@/components/finanzas/estados/RespuestasEstados";
import { DescargarContador } from "@/components/finanzas/estados/DescargarContador";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { getRespuestasEstados } from "@/lib/estados-financieros";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { conForma, ESTADOS, type ClaveEstado, type FormaEstado } from "@/lib/estados-financieros-reglas";
import { VerEstados } from "@/components/finanzas/estados/VerEstados";
import { opcionesVer, RUTA_CUENTAS, vistaActiva, type VerCuentas } from "@/lib/contador-reglas";
import { hilosDeLaRuta, hrefTelar, mesDelDia, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

// La cabecera de los cuatro estados (ADR-0585): la cabecera única del ERP (ADR-0220) con «Estados financieros» de título, y debajo las
// cuatro respuestas, que son las pestañas. Se dibuja en el servidor (cada cifra viene de la base) y la comparten las cuatro páginas;
// la sede y el mes son los de la barra del telar (`?sede=`, `?mes=`). A la derecha, «Ver» (Felipe 2026-10-31: «la 2, el menú Ver»): las
// respuestas o cualquiera de los seis cuadros del contador —los cuatro estados en formato formal (`?forma=formal`), los saldos por cuenta
// y el libro diario (`RUTA_CUENTAS`)—, y «Descargar para el contador» con los mismos seis. Al pasar de un estado a otro, la forma se queda.
// En la pantalla de las cuentas ninguna tarjeta está marcada: tocar una vuelve a sus respuestas.
export async function CabeceraEstados({
  pantalla,
  mes,
  sede,
  hoy,
  params,
  forma,
}: {
  /** El estado que se mira, o el cuadro de la pantalla de las cuentas («saldos» o «diario»). */
  pantalla: ClaveEstado | VerCuentas;
  /** «2026-10». */
  mes: string;
  sede: ClaveSede;
  hoy: string;
  /** Los parámetros de la URL: al pasar a otro estado viajan la sede y el mes. */
  params: Iterable<[string, string]>;
  /** La respuesta o el formato formal (`formaDe(sp.forma)`). */
  forma: FormaEstado;
}) {
  const activa = ESTADOS.find((e) => e.clave === pantalla)?.clave ?? null;
  const ruta = ESTADOS.find((e) => e.clave === pantalla)?.ruta ?? RUTA_CUENTAS;
  const telar = await getSedesDelTelar();
  const { sedes } = hilosDeLaRuta(ruta, telar, telar.sedesEstados);
  const nombre = sede === SEDE_TODAS ? null : sede === SEDE_EMPRESA ? "Empresa" : (sedes.find((s) => s.clave === sede)?.nombre ?? null);
  const [respuestas, persona] = await Promise.all([getRespuestasEstados(mes, sede, hoy, nombre), requirePersonaActualV2()]);
  const actuales = [...params];
  const mesDeHoy = mesDelDia(hoy);
  // Desde las cuentas, una tarjeta lleva a sus respuestas; desde un estado, a otro estado en la misma forma.
  const formaDeLasTarjetas: FormaEstado = activa ? forma : "respuesta";
  const sinForma = actuales.filter(([k]) => k !== "forma");
  // El mismo estado conserva sus parámetros (la fecha del Balance, las semanas); otro estado, solo la sede y el mes.
  const hrefEstado = (clave: ClaveEstado, f: FormaEstado) => {
    const e = ESTADOS.find((x) => x.clave === clave)!;
    return conForma(hrefTelar(e.ruta, sinForma, {}, { mismaPantalla: clave === activa, mesDeHoy }), f);
  };
  const hrefCuentas = (v: VerCuentas) => {
    const base = hrefTelar(RUTA_CUENTAS, actuales, {}, { mismaPantalla: false, mesDeHoy });
    return `${base}${base.includes("?") ? "&" : "?"}cuadro=${v}`;
  };
  const hrefs = Object.fromEntries(ESTADOS.map((e) => [e.clave, hrefEstado(e.clave, formaDeLasTarjetas)])) as Record<ClaveEstado, string>;
  const veTodo = veEstadosFinancierosDeTodoDe(persona);
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        sede={nombre ?? "Todas las sedes"}
        titulo="Estados financieros"
        subtitulo={`Cómo le fue a CAYLA en ${mesNombre(mes)}${mes === mesDeHoy ? " (a la fecha)" : ""}, en cuatro respuestas.`}
        acciones={
          <>
            <VerEstados opciones={opcionesVer({ pantalla, hrefEstado, hrefCuentas, veTodo })} activa={vistaActiva(pantalla, forma)} />
            <DescargarContador mes={mes} veTodo={veTodo} />
          </>
        }
      />
      <RespuestasEstados respuestas={respuestas} activa={activa} hrefs={hrefs} />
    </div>
  );
}

import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { RespuestasEstados } from "@/components/finanzas/estados/RespuestasEstados";
import { DescargarCuadro } from "@/components/finanzas/estados/DescargarContador";
import { Pestanas } from "@/components/ui/Pestanas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { getRespuestasEstados } from "@/lib/estados-financieros";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { conForma, ESTADOS, type ClaveEstado, type FormaEstado } from "@/lib/estados-financieros-reglas";
import { ARCHIVOS_CONTADOR, opcionesVer, RUTA_CUENTAS, vistaActiva, type VerCuentas } from "@/lib/contador-reglas";
import { hilosDeLaRuta, hrefTelar, mesDelDia, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

// La cabecera de Estados financieros (ADR-0585): la cabecera única del ERP (ADR-0220) con «Estados financieros» de título y, debajo, la
// barra de las siete vistas (Felipe 2026-10-31, «una barra horizontal» elegida en `docs/maquetas/finanzas-eeff-contador-2026-10/`): las
// respuestas, los cuatro estados en el formato del contador (`?forma=formal`), los saldos por cuenta y el libro diario (`RUTA_CUENTAS`).
// En «Respuestas» van las cuatro tarjetas, que son las pestañas de cada estado; en un cuadro del contador, su título y su «Descargar
// Excel», que baja solo ese cuadro. Se dibuja en el servidor y la comparten las cinco páginas; la sede y el mes son los de la barra del
// telar (`?sede=`, `?mes=`). Al pasar de un estado a otro, la forma se queda. Una terminal ve solo lo de su tienda (sin los cuadros de
// CAYLA entera: una pestaña que la cuenta no ve, no está).
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
  const vista = vistaActiva(pantalla, forma);
  // Las tarjetas se leen solo donde se ven: en «Respuestas».
  const [respuestas, persona] = await Promise.all([vista === "respuestas" ? getRespuestasEstados(mes, sede, hoy, nombre) : Promise.resolve([]), requirePersonaActualV2()]);
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
  const vistas = opcionesVer({ pantalla, hrefEstado, hrefCuentas, veTodo }).filter((o) => !o.motivo);
  const cuadro = vista === "respuestas" ? null : ARCHIVOS_CONTADOR.find((a) => a.clave === vista)!;
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        sede={nombre ?? "Todas las sedes"}
        titulo="Estados financieros"
        subtitulo={`Cómo le fue a CAYLA en ${mesNombre(mes)}${mes === mesDeHoy ? " (a la fecha)" : ""}, en cuatro respuestas.`}
      />
      <Pestanas
        etiquetaAccesible="Qué ver de Estados financieros"
        idIndicador="estados-vistas"
        guia="fin-estados.vistas"
        activa={vista}
        items={vistas.map((o) => ({ clave: o.clave, etiqueta: o.corto, href: o.href, ayuda: o.etiqueta }))}
      />
      {cuadro ? (
        <TituloSeccion accion={<DescargarCuadro archivo={cuadro.clave} mes={mes} />}>{`${cuadro.etiqueta} · ${mesNombre(mes)}`}</TituloSeccion>
      ) : (
        <RespuestasEstados respuestas={respuestas} activa={activa} hrefs={hrefs} />
      )}
    </div>
  );
}

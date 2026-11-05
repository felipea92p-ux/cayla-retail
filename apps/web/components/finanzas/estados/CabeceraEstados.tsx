import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { DescargarCuadro } from "@/components/finanzas/estados/DescargarContador";
import { MenuContador } from "@/components/finanzas/estados/MenuContador";
import { Pestanas } from "@/components/ui/Pestanas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { conForma, ESTADOS, type ClaveEstado, type FormaEstado } from "@/lib/estados-financieros-reglas";
import { ARCHIVOS_CONTADOR, opcionesVer, RUTA_CUENTAS, vistaActiva, type VerCuentas } from "@/lib/contador-reglas";
import { hilosDeLaRuta, hrefTelar, mesDelDia, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { mesNombre } from "@/lib/resultados-reglas";

// La cabecera de Estados financieros (ADR-0585, rediseñada en ADR-0611): la cabecera única del ERP (ADR-0220) sobre vidrio, con «Estados financieros» de título, y debajo las cuatro
// pestañas fijas que eligió Felipe, cada una con el nombre real de su estado. Lo que es del contador (el formato formal, los saldos por cuenta y el libro diario) va en su botón,
// y en un cuadro del contador se ve su título y su «Descargar Excel». Se dibuja en el servidor y la comparten las cinco páginas; la sede y el mes son los de la barra del telar
// (`?sede=`, `?mes=`). Una terminal ve solo lo de su tienda (sin los cuadros de CAYLA entera: lo que la cuenta no ve, no está).
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
  const persona = await requirePersonaActualV2();
  const actuales = [...params];
  const mesDeHoy = mesDelDia(hoy);
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
  const veTodo = veEstadosFinancierosDeTodoDe(persona);
  const delContador = opcionesVer({ pantalla, hrefEstado, hrefCuentas, veTodo }).filter((o) => !o.motivo && o.clave !== "respuestas");
  const cuadro = vista === "respuestas" ? null : ARCHIVOS_CONTADOR.find((a) => a.clave === vista)!;
  return (
    <div className="space-y-4">
      <div className="placa-estados estados-cabecera">
        <EncabezadoPagina
          sede={nombre ?? "Todas las sedes"}
          titulo="Estados financieros"
          subtitulo={`Cómo le fue a CAYLA en ${mesNombre(mes)}${mes === mesDeHoy ? " (a la fecha)" : ""}.`}
          acciones={<MenuContador opciones={delContador.map((o) => ({ clave: o.clave, etiqueta: o.etiqueta, href: o.href }))} />}
        />
      </div>
      <Pestanas
        etiquetaAccesible="Los cuatro estados financieros"
        idIndicador="estados-vistas"
        guia="fin-estados.vistas"
        activa={activa ?? ""}
        items={ESTADOS.map((e) => ({ clave: e.clave, etiqueta: e.formal, href: hrefEstado(e.clave, "respuesta") }))}
      />
      {cuadro && <TituloSeccion accion={<DescargarCuadro archivo={cuadro.clave} mes={mes} />}>{`${cuadro.etiqueta} · ${mesNombre(mes)}`}</TituloSeccion>}
    </div>
  );
}

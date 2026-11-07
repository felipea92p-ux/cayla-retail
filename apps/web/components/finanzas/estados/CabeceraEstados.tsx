import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { DescargarCuadro } from "@/components/finanzas/estados/DescargarContador";
import { MenuContador } from "@/components/finanzas/estados/MenuContador";
import { SelectorPeriodo } from "@/components/finanzas/estados/SelectorPeriodo";
import { Pestanas } from "@/components/ui/Pestanas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { conElRango, leerPeriodo } from "@/lib/estados-periodo";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { ESTADOS, type ClaveEstado } from "@/lib/estados-financieros-reglas";
import { ARCHIVOS_CONTADOR, opcionesDelContador, RUTA_CUENTAS, type VerCuentas } from "@/lib/contador-reglas";
import { hilosDeLaRuta, hrefTelar, mesDelDia, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { rangoDelMes } from "@/lib/flujo-caja-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import { AVISO_SIN_SUELDOS, mesNombre, veLaPlanilla } from "@/lib/resultados-reglas";

// La cabecera de Estados financieros (ADR-0585, rediseñada en ADR-0611): la cabecera única del ERP (ADR-0220) sobre vidrio, con «Estados financieros» de título, el calendario de fechas, el
// botón «Para el contador» (los saldos, el libro diario y las descargas) y debajo las cuatro pestañas fijas que eligió Felipe, cada una con el nombre real de su estado. En un cuadro del
// contador se ve su título y su «Descargar Excel». Se dibuja en el servidor y la comparten las cinco páginas. Una terminal ve solo lo de su tienda (lo que la cuenta no ve, no está).
export async function CabeceraEstados({
  pantalla,
  mes,
  sede,
  hoy,
  params,
}: {
  /** El estado que se mira, o el cuadro de la pantalla de las cuentas («saldos» o «diario»). */
  pantalla: ClaveEstado | VerCuentas;
  /** «2026-10». */
  mes: string;
  sede: ClaveSede;
  hoy: string;
  /** Los parámetros de la URL: al pasar a otro estado viajan la sede y el mes. */
  params: Iterable<[string, string]>;
}) {
  const activa = ESTADOS.find((e) => e.clave === pantalla)?.clave ?? null;
  const ruta = ESTADOS.find((e) => e.clave === pantalla)?.ruta ?? RUTA_CUENTAS;
  const telar = await getSedesDelTelar();
  const { sedes } = hilosDeLaRuta(ruta, telar, telar.sedesEstados);
  const nombre = sede === SEDE_TODAS ? null : sede === SEDE_EMPRESA ? "Empresa" : (sedes.find((s) => s.clave === sede)?.nombre ?? null);
  const persona = await requirePersonaActualV2();
  const actuales = [...params];
  const mesDeHoy = mesDelDia(hoy);
  // `?forma=` era del formato formal que ya no tiene pantalla aparte: una dirección vieja se limpia al pasar de un estado a otro.
  const sinForma = actuales.filter(([k]) => k !== "forma");
  // El mismo estado conserva sus parámetros (las semanas); otro estado, solo la sede y el período: los cuatro miran las mismas fechas.
  const hrefEstado = (clave: ClaveEstado) => {
    const e = ESTADOS.find((x) => x.clave === clave)!;
    const base = hrefTelar(e.ruta, sinForma, {}, { mismaPantalla: clave === activa, mesDeHoy });
    return clave === activa ? base : conElRango(base, sinForma);
  };
  const hrefCuentas = (v: VerCuentas) => {
    const base = hrefTelar(RUTA_CUENTAS, actuales, {}, { mismaPantalla: false, mesDeHoy });
    return `${base}${base.includes("?") ? "&" : "?"}cuadro=${v}`;
  };
  const veTodo = veEstadosFinancierosDeTodoDe(persona);
  const cuadro = ARCHIVOS_CONTADOR.find((a) => a.clave === pantalla) ?? null;
  // Los cuatro estados eligen sus fechas con el calendario; los cuadros del contador van por mes, con el mes de la barra.
  const periodo = activa ? leerPeriodo(Object.fromEntries(actuales), hoy) : null;
  const una = activa === "vale";
  const parametros = activa ? await getParametrosFinanzas() : null;
  // Mismas fechas que la página: la lectura ya está en caché y no cuesta otra vuelta a la base (el Balance y los cuadros del contador, sí). Si falla, no se afirma nada.
  const rango = periodo ?? rangoDelMes(mes, hoy);
  const sinSueldos = veLaPlanilla(await getEstadoResultados(rango.desde, rango.hasta)) === false;
  const dicho = !periodo
    ? `Cómo le fue a CAYLA en ${mesNombre(mes)}${mes === mesDeHoy ? " (a la fecha)" : ""}.`
    : una
      ? `Una foto de lo que tiene CAYLA ${periodo.al.toLowerCase()}.`
      : `Cómo le fue a CAYLA ${periodo.en}${periodo.hasta === hoy ? " (a la fecha)" : ""}.`;
  return (
    <div className="space-y-4">
      <div className="placa-estados estados-cabecera">
        <EncabezadoPagina
          sede={nombre ?? "Todas las sedes"}
          titulo="Estados financieros"
          subtitulo={dicho}
          acciones={
            <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
              {periodo && <SelectorPeriodo desde={periodo.desde} hasta={periodo.hasta} hoy={hoy} minimo={parametros?.inicioFinanzas ?? null} una={una} sede={sede} />}
              <MenuContador opciones={opcionesDelContador({ veTodo, hrefCuentas })} mes={periodo?.mes ?? mes} />
            </div>
          }
        />
      </div>
      <Pestanas
        etiquetaAccesible="Los cuatro estados financieros"
        idIndicador="estados-vistas"
        guia="fin-estados.vistas"
        activa={activa ?? ""}
        items={ESTADOS.map((e) => ({ clave: e.clave, etiqueta: e.formal, href: hrefEstado(e.clave) }))}
      />
      {sinSueldos && (
        <Aviso tono="info" chico>
          {AVISO_SIN_SUELDOS} Los archivos que bajes lo dicen en su primera línea.
        </Aviso>
      )}
      {cuadro && <TituloSeccion accion={<DescargarCuadro archivo={cuadro.clave} mes={mes} />}>{`${cuadro.etiqueta} · ${mesNombre(mes)}`}</TituloSeccion>}
      {/* Va dentro de la página, no en su layout: tocar las placas antes de que React las hidrate sería una discrepancia. */}
    </div>
  );
}

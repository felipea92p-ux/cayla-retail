import { exigirModulo } from "@/lib/persona-actual";
import { getCargaInicial } from "@/lib/carga-inicial";
import { getConfiguracionMetas, getConfiguracionTiendas, getDatosEmpresa, getParametrosCaja, getParametrosFinanzas } from "@/lib/configuracion";
import { getCategoriasGasto, getContextoGastos, getFichasDeFijos, getFijosMes, getProveedoresParaGasto } from "@/lib/gastos";
import { anioLima, hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { PestanasFin } from "@/components/finanzas/kit";
import { VistaDinero } from "@/components/vistas-config/VistaDinero";
import { VistaMetas } from "@/components/vistas-config/VistaMetas";
import { VistaEmpresaTiendas } from "@/components/vitrinas-sedes/VistaEmpresaTiendas";
import { armarVitrinas } from "@/lib/vitrinas-sedes-reglas";
import { TablaGastosFijos } from "@/components/GastosFijosYActivos";
import { getParametrosTributarios } from "@/lib/impuestos";
import { ConfiguracionImpuestos } from "@/components/ConfiguracionImpuestos";
import { getMaquinasPos, getMediosDeCobro, getPlanillaCuentas, getSaldos } from "@/lib/cuentas-dinero";
import { getPresupuestoConfig } from "@/lib/presupuesto";
import { ConfiguracionPresupuesto } from "@/components/finanzas/ConfiguracionPresupuesto";
import { getAsistenteSedes } from "@/lib/asistente/sedes-servidor";
import { getRepartoClaure } from "@/lib/reparto-claure";
import { ConfiguracionRepartoClaure } from "@/components/ConfiguracionRepartoClaure";

// Configuración (ADR-0195, módulo «configuracion»; delegable desde el ADR-0253): lo que se ajusta una vez y todas las pantallas leen. Como
// en el spike (docs/maquetas/finanzas-2026-09/, `VISTAS.config`), una sola pantalla con pestañas por URL (`?tab=`). Hoy
// trae Empresa y tiendas, Metas (las dos salieron de «Tiendas y caja», que Felipe partió el 2026-11-04 porque juntaba 7 temas en 4,3 pantallas; una
// dirección vieja, `?tab=tiendas`, cae en Metas), Dinero (Cuentas y cobros con Caja y avisos, F3), Gastos fijos (F2b), Presupuesto (capa
// «para decidir», `?mes=` elige el mes) e Impuestos (F8), sin pestañas vacías. «Tienda web» fue una pestaña de aquí (ADR-0408 act. 6)
// hasta el 2026-10-16: desde ADR-0430 es Tienda web ▸ Datos y plazos (`/tienda-web/ajustes`), y desde 20261016223000 con su propio módulo
// (`ajustes_web`, `fn_puede_ajustes_tienda_web`): Configuración ya no la abre; la dirección vieja, `?tab=tienda-web`, lleva allá (`next.config.ts`).
const PESTANAS = [
  { clave: "empresa", etiqueta: "Empresa y tiendas", href: "/configuracion?tab=empresa", guia: "config.tab-empresa" },
  { clave: "metas", etiqueta: "Metas", href: "/configuracion?tab=metas", guia: "config.tab-metas" },
  { clave: "dinero", etiqueta: "Dinero", href: "/configuracion?tab=dinero", guia: "config.tab-dinero" },
  { clave: "fijos", etiqueta: "Gastos fijos", href: "/configuracion?tab=fijos", guia: "config.tab-fijos" },
  { clave: "presupuesto", etiqueta: "Presupuesto", href: "/configuracion?tab=presupuesto", guia: "config.tab-presupuesto" },
  { clave: "impuestos", etiqueta: "Impuestos", href: "/configuracion?tab=impuestos", guia: "config.tab-impuestos" },
  // Solo del líder (ADR-0560, actividad 17): mueve plata (lo que se le debe a Claudia).
  { clave: "claure", etiqueta: "Reparto CLAURE", href: "/configuracion?tab=claure", guia: "config.tab-claure" },
] as const;

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string; mes?: string }> }) {
  const persona = await exigirModulo("configuracion");
  const { tab, mes } = await searchParams;
  const pestanasDeEsteLider = PESTANAS.filter((p) => p.clave !== "claure" || persona.rol === "lider");
  // Una dirección vieja sigue llegando: «Cuentas y cobros» y «Caja y avisos» se juntaron en Dinero (Felipe 2026-11-05).
  const pedida = tab === "cuentas" || tab === "caja" ? "dinero" : tab;
  const pestana = pestanasDeEsteLider.find((p) => p.clave === pedida)?.clave ?? "metas";

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede="Toda CAYLA"
        titulo="Configuración"
        subtitulo="Lo que se ajusta una vez y todas las pantallas leen."
      />
      <PestanasFin etiqueta="Secciones de Configuración" valor={pestana} items={[...pestanasDeEsteLider]} guia="config.pestanas" />
      {pestana === "empresa" && <SeccionEmpresa esLider={persona.rol === "lider"} esAdmin={persona.esAdmin} />}
      {pestana === "metas" && <SeccionMetas />}
      {pestana === "dinero" && <SeccionDinero />}
      {pestana === "fijos" && <SeccionFijos />}
      {pestana === "presupuesto" && <SeccionPresupuesto mes={mes} />}
      {pestana === "impuestos" && <SeccionImpuestos />}
      {pestana === "claure" && <ConfiguracionRepartoClaure filas={await getRepartoClaure()} />}
    </div>
  );
}

// Si una lectura falla, la persona ve qué hacer; el detalle técnico (que trae el mensaje crudo de la base) va al registro del servidor.
function FallaDeSeccion({ falla }: { falla: string }) {
  console.error(`Configuración: ${falla}`);
  return (
    <Aviso tono="error" titulo="No se pudo leer una parte de esta sección">
      Recarga la página; si sigue, avísale al líder.
    </Aviso>
  );
}

// Empresa y tiendas, «Las vitrinas»: el carnet de la empresa, que solo se lee, y una tarjeta por sede. Si una lectura falla, lo demás se sigue viendo: las tiendas
// avisan (es lo único que se cambia a mano aquí), y la carga inicial o Preguntar simplemente no se dibujan si la base todavía no las tiene.
async function SeccionEmpresa({ esLider, esAdmin }: { esLider: boolean; esAdmin: boolean }) {
  const [empresa, tiendas, carga, asistente] = await Promise.all([
    getDatosEmpresa(),
    getConfiguracionTiendas().catch((e: Error) => e),
    getCargaInicial(),
    getAsistenteSedes(),
  ]);
  const falla = tiendas instanceof Error;
  const hoy = falla ? hoyLima() : tiendas.hoy;
  const vitrinas = armarVitrinas({ empresa, tiendas: falla ? [] : tiendas.tiendas, asistente: asistente?.sedes ?? null, carga, hoy });
  return (
    <>
      {falla && <FallaDeSeccion falla={tiendas.message} />}
      <VistaEmpresaTiendas datos={empresa} vitrinas={vitrinas} gastado={asistente?.gastado ?? null} carga={carga} esLider={esLider} esAdmin={esAdmin} />
    </>
  );
}

// Metas: lo normal de cada tienda, mes por mes, fechas especiales y campañas.
async function SeccionMetas() {
  const [datos, metas] = await Promise.all([getConfiguracionTiendas(), getConfiguracionMetas()]);
  // La meta de hoy de cada tienda la dice la base (`fn_parametros_caja`), con su campaña y su fecha especial: la pantalla no la recalcula.
  const hoy = await Promise.all(datos.tiendas.map(async (t) => [t.id, (await getParametrosCaja(t.id, datos.hoy))?.meta ?? null] as const));
  return <VistaMetas datos={datos} metas={metas} metaDeHoy={Object.fromEntries(hoy)} />;
}

// Dinero (ADR-0195 F3, Felipe 2026-11-05): a dónde entra cada cobro, las cuentas con su saldo de hoy (sumado por la base), las máquinas (ADR-0429; no se dibujan si la base todavía no
// las conoce), la planilla y cuándo avisa el sistema.
async function SeccionDinero() {
  const [cuentas, medios, maquinas, planilla, parametros] = await Promise.all([getSaldos(null), getMediosDeCobro(), getMaquinasPos(), getPlanillaCuentas(), getParametrosFinanzas()]);
  return (
    <>
      {[cuentas.falla, medios.falla]
        .filter((f): f is string => !!f)
        .map((f) => (
          <FallaDeSeccion key={f} falla={f} />
        ))}
      <VistaDinero cuentas={cuentas.datos} medios={medios.datos} maquinas={maquinas} planilla={planilla} parametros={parametros} hoy={hoyLima()} />
    </>
  );
}

async function SeccionFijos() {
  const { desde } = rangoMes(mesDe(hoyLima()));
  const [contexto, categorias, proveedores, fijos, fichas] = await Promise.all([
    getContextoGastos(),
    getCategoriasGasto(),
    getProveedoresParaGasto(),
    getFijosMes(desde, { clave: "todas", ubicacionId: null, soloEmpresa: false }),
    getFichasDeFijos(),
  ]);
  return (
    <>
      {fijos.falla && <FallaDeSeccion falla={fijos.falla} />}
      <TablaGastosFijos
        fijos={fijos.datos}
        categorias={categorias}
        ubicaciones={contexto.ubicaciones}
        proveedores={proveedores}
        fichas={fichas.porFijo}
        fichaDisponible={fichas.disponible}
        hoy={hoyLima()}
      />
      <p className="nota-cayla">
        Un fijo es un recordatorio: cada mes aparece en <b>Finanzas ▸ Gastos ▸ Fijos del mes</b> para registrarlo con lo que llegó de verdad. Si uno deja de pagarse, se archiva: sus gastos ya registrados se quedan.
      </p>
    </>
  );
}

// Presupuesto (ADR-0195, capa «para decidir»): los topes de gasto de cada unidad y rubro para el mes elegido. La meta de
// ventas no se escribe aquí: es la suma de las metas del día (Metas).
async function SeccionPresupuesto({ mes }: { mes: string | undefined }) {
  const hoy = hoyLima();
  const { datos, falla } = await getPresupuestoConfig(esMes(mes) ? mes : mesDe(hoy));
  return (
    <>
      {falla && <FallaDeSeccion falla={falla} />}
      {datos && <ConfiguracionPresupuesto datos={datos} hoy={hoy} />}
    </>
  );
}

// Impuestos (ADR-0195 F8): tasa de IGV, UIT y régimen de cada año, con vigencia. Solo se agregan filas.
async function SeccionImpuestos() {
  const parametros = await getParametrosTributarios();
  return (
    <>
      {parametros.falla && <FallaDeSeccion falla={parametros.falla} />}
      <ConfiguracionImpuestos parametros={parametros.datos} anioActual={anioLima()} />
    </>
  );
}

import { exigirModulo, veModulo } from "@/lib/persona-actual";
import { getCargaInicial } from "@/lib/carga-inicial";
import { getConfiguracionMetas, getConfiguracionTiendas, getDatosEmpresa, getParametrosCaja, getParametrosFinanzas } from "@/lib/configuracion";
import { getCategoriasGasto, getContextoGastos, getFichasDeFijos, getFijosMes, getProveedoresParaGasto } from "@/lib/gastos";
import { anioLima, hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { PestanasFin } from "@/components/finanzas/kit";
import { VistaDinero } from "@/components/vistas-config/VistaDinero";
import { VistaGastos } from "@/components/vistas-config/VistaGastos";
import { VistaImpuestos } from "@/components/vistas-config/VistaImpuestos";
import { VistaMetas } from "@/components/vistas-config/VistaMetas";
import { VistaEmpresaTiendas } from "@/components/vitrinas-sedes/VistaEmpresaTiendas";
import { armarVitrinas } from "@/lib/vitrinas-sedes-reglas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getPanelImpuestos, getParametrosTributarios } from "@/lib/impuestos";
import { getMaquinasPos, getMediosDeCobro, getPlanillaCuentas, getSaldos } from "@/lib/cuentas-dinero";
import { getPresupuestoConfig } from "@/lib/presupuesto";
import { getAsistenteSedes } from "@/lib/asistente/sedes-servidor";
import { getRepartoClaure } from "@/lib/reparto-claure";
import { getCuentasDeOtrasEmpresas } from "@/lib/cuenta-claure";

// Configuración (ADR-0195, módulo «configuracion»; delegable desde el ADR-0253): lo que se ajusta una vez y todas las pantallas leen. Como
// en el spike (docs/maquetas/finanzas-2026-09/, `VISTAS.config`), una sola pantalla con pestañas por URL (`?tab=`). Hoy
// trae Empresa y tiendas, Metas (las dos salieron de «Tiendas y caja», que Felipe partió el 2026-11-04 porque juntaba 7 temas en 4,3 pantallas; una
// dirección vieja, `?tab=tiendas`, cae en Metas), Dinero (Cuentas y cobros con Caja y avisos, F3), Gastos (fijos F2b, topes de la capa
// «para decidir», `?mes=` elige el mes, y Reparto CLAURE) e Impuestos (F8), sin pestañas vacías. «Tienda web» fue una pestaña de aquí (ADR-0408 act. 6)
// hasta el 2026-10-16: desde ADR-0430 es Tienda web ▸ Datos y plazos (`/tienda-web/ajustes`), y desde 20261016223000 con su propio módulo
// (`ajustes_web`, `fn_puede_ajustes_tienda_web`): Configuración ya no la abre; la dirección vieja, `?tab=tienda-web`, lleva allá (`next.config.ts`).
const PESTANAS = [
  { clave: "empresa", etiqueta: "Empresa y tiendas", href: "/configuracion?tab=empresa", guia: "config.tab-empresa" },
  { clave: "metas", etiqueta: "Metas", href: "/configuracion?tab=metas", guia: "config.tab-metas" },
  { clave: "dinero", etiqueta: "Dinero", href: "/configuracion?tab=dinero", guia: "config.tab-dinero" },
  { clave: "gastos", etiqueta: "Gastos", href: "/configuracion?tab=gastos", guia: "config.tab-gastos" },
  { clave: "impuestos", etiqueta: "Impuestos", href: "/configuracion?tab=impuestos", guia: "config.tab-impuestos" },
] as const;

// Una dirección vieja sigue llegando (Felipe 2026-11-05): de 8 pestañas quedaron 5.
const PESTANA_VIEJA: Record<string, string> = { cuentas: "dinero", caja: "dinero", fijos: "gastos", presupuesto: "gastos", claure: "gastos" };

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string; mes?: string }> }) {
  const persona = await exigirModulo("configuracion");
  const { tab, mes } = await searchParams;
  const pedida = PESTANA_VIEJA[tab ?? ""] ?? tab;
  const pestana = PESTANAS.find((p) => p.clave === pedida)?.clave ?? "metas";

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede="Toda CAYLA"
        titulo="Configuración"
        subtitulo="Lo que se ajusta una vez y todas las pantallas leen."
      />
      <PestanasFin etiqueta="Secciones de Configuración" valor={pestana} items={[...PESTANAS]} guia="config.pestanas" />
      {pestana === "empresa" && <SeccionEmpresa esLider={persona.rol === "lider"} esAdmin={persona.esAdmin} puedeHorario={veModulo(persona, "ajustes_web")} />}
      {pestana === "metas" && <SeccionMetas />}
      {pestana === "dinero" && <SeccionDinero />}
      {pestana === "gastos" && <SeccionGastos mes={mes} esLider={persona.rol === "lider"} />}
      {pestana === "impuestos" && <SeccionImpuestos />}
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
async function SeccionEmpresa({ esLider, esAdmin, puedeHorario }: { esLider: boolean; esAdmin: boolean; puedeHorario: boolean }) {
  const [empresa, tiendas, carga, asistente, ubicaciones] = await Promise.all([
    getDatosEmpresa(),
    getConfiguracionTiendas().catch((e: Error) => e),
    getCargaInicial(),
    getAsistenteSedes(),
    getUbicaciones().catch(() => null),
  ]);
  const falla = tiendas instanceof Error;
  const hoy = falla ? hoyLima() : tiendas.hoy;
  // El cierre de cada tienda sale de su horario por días (Tienda web ▸ Conf. Tienda, ADR-0642): aquí solo se lee el de hoy.
  const cierres = ubicaciones ? new Map(ubicaciones.map((u) => [u.id, { hora: u.horaCierre, cargado: u.horarioCargado }] as const)) : null;
  const vitrinas = armarVitrinas({ empresa, tiendas: falla ? [] : tiendas.tiendas, asistente: asistente?.sedes ?? null, carga, hoy, cierres });
  return (
    <>
      {falla && <FallaDeSeccion falla={tiendas.message} />}
      <VistaEmpresaTiendas datos={empresa} vitrinas={vitrinas} gastado={asistente?.gastado ?? null} carga={carga} esLider={esLider} esAdmin={esAdmin} puedeHorario={puedeHorario} />
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
  const [cuentas, medios, maquinas, planilla, parametros, cuentasAjenas] = await Promise.all([getSaldos(null), getMediosDeCobro(), getMaquinasPos(), getPlanillaCuentas(), getParametrosFinanzas(), getCuentasDeOtrasEmpresas()]);
  return (
    <>
      {[cuentas.falla, medios.falla]
        .filter((f): f is string => !!f)
        .map((f) => (
          <FallaDeSeccion key={f} falla={f} />
        ))}
      <VistaDinero cuentas={cuentas.datos} cuentasAjenas={cuentasAjenas} medios={medios.datos} maquinas={maquinas} planilla={planilla} parametros={parametros} hoy={hoyLima()} />
    </>
  );
}

// Gastos (F2b, ADR-0195 «para decidir», ADR-0560): los fijos, los topes del mes elegido y, solo para el líder, el reparto con CLAURE.
async function SeccionGastos({ mes, esLider }: { mes: string | undefined; esLider: boolean }) {
  const hoy = hoyLima();
  const { desde } = rangoMes(mesDe(hoy));
  const [contexto, categorias, proveedores, fijos, fichas, presupuesto, reparto] = await Promise.all([
    getContextoGastos(),
    getCategoriasGasto(),
    getProveedoresParaGasto(),
    getFijosMes(desde, { clave: "todas", ubicacionId: null, soloEmpresa: false }),
    getFichasDeFijos(),
    getPresupuestoConfig(esMes(mes) ? mes : mesDe(hoy)),
    esLider ? getRepartoClaure() : null,
  ]);
  return (
    <>
      {fijos.falla && <FallaDeSeccion falla={fijos.falla} />}
      {presupuesto.falla && <FallaDeSeccion falla={presupuesto.falla} />}
      <VistaGastos
        fijos={fijos.datos}
        categorias={categorias}
        ubicaciones={contexto.ubicaciones}
        proveedores={proveedores}
        fichas={fichas.porFijo}
        fichaDisponible={fichas.disponible}
        presupuesto={presupuesto.datos}
        reparto={reparto}
        esLider={esLider}
        hoy={hoy}
      />
    </>
  );
}

// Impuestos (ADR-0195 F8): tasa de IGV, UIT y régimen de cada año, con vigencia. Solo se agregan filas.
async function SeccionImpuestos() {
  // Lo vendido es un extra: si esa lectura falla (o esta cuenta no la ve), el límite se dibuja sin la barra y lo demás sigue igual.
  const [parametros, panel] = await Promise.all([getParametrosTributarios(), getPanelImpuestos().catch(() => null)]);
  return (
    <>
      {parametros.falla && <FallaDeSeccion falla={parametros.falla} />}
      <VistaImpuestos parametros={parametros.datos} anioActual={anioLima()} umbral={panel?.datos?.umbral ?? null} />
    </>
  );
}

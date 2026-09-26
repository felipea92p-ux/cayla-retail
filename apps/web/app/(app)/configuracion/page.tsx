import { exigirModulo } from "@/lib/persona-actual";
import { getConfiguracionTiendas, getDatosEmpresa, getParametrosFinanzas } from "@/lib/configuracion";
import { getCategoriasGasto, getContextoGastos, getFijosMes, getProveedoresParaGasto } from "@/lib/gastos";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { PestanasFin } from "@/components/finanzas/kit";
import { ConfiguracionTiendas } from "@/components/ConfiguracionTiendas";
import { ConfiguracionEmpresa } from "@/components/ConfiguracionEmpresa";
import { ConfiguracionCajaAvisos } from "@/components/ConfiguracionCajaAvisos";
import { TablaGastosFijos } from "@/components/GastosFijosYActivos";
import { getParametrosTributarios } from "@/lib/impuestos";
import { ConfiguracionImpuestos } from "@/components/ConfiguracionImpuestos";
import { ConfiguracionCuentas } from "@/components/finanzas/ConfiguracionCuentas";
import { getMediosDeCobro, getSaldos } from "@/lib/cuentas-dinero";
import { getPresupuestoConfig } from "@/lib/presupuesto";
import { ConfiguracionPresupuesto } from "@/components/finanzas/ConfiguracionPresupuesto";

// Configuración (ADR-0195, módulo «configuracion», solo líder): lo que se ajusta una vez y todas las pantallas leen. Como
// en el spike (docs/maquetas/finanzas-2026-09/, `VISTAS.config`), una sola pantalla con pestañas por URL (`?tab=`). Hoy
// trae Empresa (solo lectura), Tiendas y caja (F1), Cuentas y cobros (F3), Caja y avisos, Gastos fijos (F2b), Presupuesto
// (capa «para decidir», `?mes=` elige el mes) e Impuestos (F8), sin pestañas vacías.
const PESTANAS = [
  { clave: "empresa", etiqueta: "Empresa", href: "/configuracion?tab=empresa" },
  { clave: "tiendas", etiqueta: "Tiendas y caja", href: "/configuracion?tab=tiendas" },
  { clave: "cuentas", etiqueta: "Cuentas y cobros", href: "/configuracion?tab=cuentas" },
  { clave: "caja", etiqueta: "Caja y avisos", href: "/configuracion?tab=caja" },
  { clave: "fijos", etiqueta: "Gastos fijos", href: "/configuracion?tab=fijos" },
  { clave: "presupuesto", etiqueta: "Presupuesto", href: "/configuracion?tab=presupuesto" },
  { clave: "impuestos", etiqueta: "Impuestos", href: "/configuracion?tab=impuestos" },
] as const;

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string; mes?: string }> }) {
  await exigirModulo("configuracion");
  const { tab, mes } = await searchParams;
  const pestana = PESTANAS.find((p) => p.clave === tab)?.clave ?? "tiendas";

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión · Configuración"
        titulo="Configuración"
        bajada="Lo que se ajusta una vez y todas las pantallas leen. Cada cambio queda en la historia con quién lo hizo. Solo el líder entra aquí."
      />
      <PestanasFin etiqueta="Secciones de Configuración" valor={pestana} items={[...PESTANAS]} />
      {pestana === "empresa" && <ConfiguracionEmpresa datos={await getDatosEmpresa()} />}
      {pestana === "tiendas" && <SeccionTiendas />}
      {pestana === "cuentas" && <SeccionCuentas />}
      {pestana === "caja" && <ConfiguracionCajaAvisos parametros={await getParametrosFinanzas()} />}
      {pestana === "fijos" && <SeccionFijos />}
      {pestana === "presupuesto" && <SeccionPresupuesto mes={mes} />}
      {pestana === "impuestos" && <SeccionImpuestos />}
    </div>
  );
}

async function SeccionTiendas() {
  return <ConfiguracionTiendas datos={await getConfiguracionTiendas()} />;
}

// Cuentas y cobros (ADR-0195 F3): las cuentas con su saldo de hoy (sumado por la base) y a qué cuenta entra cada cobro.
async function SeccionCuentas() {
  const [cuentas, medios] = await Promise.all([getSaldos(null), getMediosDeCobro()]);
  return (
    <>
      {[cuentas.falla, medios.falla]
        .filter((f): f is string => !!f)
        .map((f) => (
          <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
            {f}
          </p>
        ))}
      <ConfiguracionCuentas cuentas={cuentas.datos} medios={medios.datos} hoy={hoyLima()} />
    </>
  );
}

async function SeccionFijos() {
  const { desde } = rangoMes(mesDe(hoyLima()));
  const [contexto, categorias, proveedores, fijos] = await Promise.all([
    getContextoGastos(),
    getCategoriasGasto(),
    getProveedoresParaGasto(),
    getFijosMes(desde, { clave: "todas", ubicacionId: null, soloEmpresa: false }),
  ]);
  return (
    <>
      {fijos.falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{fijos.falla}</p>}
      <TablaGastosFijos fijos={fijos.datos} categorias={categorias} ubicaciones={contexto.ubicaciones} proveedores={proveedores} />
      <p className="nota-cayla">
        Un fijo es un recordatorio: cada mes aparece en <b>Finanzas ▸ Gastos ▸ Fijos del mes</b> para registrarlo con lo que llegó de verdad. Si uno deja de pagarse, se archiva: sus gastos ya registrados se quedan.
      </p>
    </>
  );
}

// Presupuesto (ADR-0195, capa «para decidir»): los topes de gasto de cada unidad y rubro para el mes elegido. La meta de
// ventas no se escribe aquí: es la suma de las metas del día (Tiendas y caja).
async function SeccionPresupuesto({ mes }: { mes: string | undefined }) {
  const hoy = hoyLima();
  const { datos, falla } = await getPresupuestoConfig(esMes(mes) ? mes : mesDe(hoy));
  return (
    <>
      {falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>}
      {datos && <ConfiguracionPresupuesto datos={datos} hoy={hoy} />}
    </>
  );
}

// Impuestos (ADR-0195 F8): tasa de IGV, UIT y régimen de cada año, con vigencia. Solo se agregan filas.
async function SeccionImpuestos() {
  const parametros = await getParametrosTributarios();
  return (
    <>
      {parametros.falla && <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{parametros.falla}</p>}
      <ConfiguracionImpuestos parametros={parametros.datos} anioActual={Number(hoyLima().slice(0, 4))} />
    </>
  );
}

import { exigirModulo } from "@/lib/persona-actual";
import { getConfiguracionTiendas, getDatosEmpresa, getParametrosFinanzas } from "@/lib/configuracion";
import { getCategoriasGasto, getContextoGastos, getFijosMes, getProveedoresParaGasto } from "@/lib/gastos";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { PestanasFin } from "@/components/finanzas/kit";
import { ConfiguracionTiendas } from "@/components/ConfiguracionTiendas";
import { ConfiguracionEmpresa } from "@/components/ConfiguracionEmpresa";
import { ConfiguracionCajaAvisos } from "@/components/ConfiguracionCajaAvisos";
import { TablaGastosFijos } from "@/components/GastosFijosYActivos";

// Configuración (ADR-0195, módulo «configuracion», solo líder): lo que se ajusta una vez y todas las pantallas leen. Como
// en el spike (docs/maquetas/finanzas-2026-09/, `VISTAS.config`), una sola pantalla con pestañas por URL (`?tab=`). Hoy
// trae las que ya existen —Empresa (solo lectura), Tiendas y caja (F1), Caja y avisos y Gastos fijos (F2b)—; las siguientes
// fases de Finanzas suman las suyas (Cuentas y cobros, Presupuesto, Impuestos) aquí mismo, sin pestañas vacías.
const PESTANAS = [
  { clave: "empresa", etiqueta: "Empresa", href: "/configuracion?tab=empresa" },
  { clave: "tiendas", etiqueta: "Tiendas y caja", href: "/configuracion?tab=tiendas" },
  { clave: "caja", etiqueta: "Caja y avisos", href: "/configuracion?tab=caja" },
  { clave: "fijos", etiqueta: "Gastos fijos", href: "/configuracion?tab=fijos" },
] as const;

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await exigirModulo("configuracion");
  const { tab } = await searchParams;
  const pestana = PESTANAS.find((p) => p.clave === tab)?.clave ?? "tiendas";

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión · Configuración"
        titulo="Configuración"
        bajada="Lo que se ajusta una vez y todas las pantallas leen. Cada cambio queda en la historia con quién lo hizo. Solo el líder entra aquí."
      />
      <PestanasFin etiqueta="Secciones de Configuración" valor={pestana} items={[...PESTANAS]} />
      {pestana === "empresa" ? (
        <ConfiguracionEmpresa datos={await getDatosEmpresa()} />
      ) : pestana === "caja" ? (
        <ConfiguracionCajaAvisos parametros={await getParametrosFinanzas()} />
      ) : pestana === "fijos" ? (
        <SeccionFijos />
      ) : (
        <SeccionTiendas />
      )}
    </div>
  );
}

async function SeccionTiendas() {
  return <ConfiguracionTiendas datos={await getConfiguracionTiendas()} />;
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

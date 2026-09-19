import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedores, getProveedoresResumen, getProveedoresSerie } from "@/lib/proveedores";
import { ProveedoresPanel } from "@/components/ProveedoresPanel";

// Directorio de proveedores (20260914150000_proveedores_administrables.sql).
// Cualquiera con acceso ve el directorio (a quién se le compra); lo
// financiero (cuánto se le debe, recepción) y el detalle son solo de líder
// — corrección de D-27, 2026-09-17
// (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql). La
// pantalla lo esconde y `fn_proveedores()` lo vuelve a exigir (manda esos
// campos en NULL si no sos líder): dos capas, como siempre.
//
// ADR-0111: las cuatro cifras de arriba (a quién se le debe, cuánta deuda concentra un solo
// proveedor, quiénes llevan más de 90 días sin comprar) salen de `fn_proveedores_resumen()`, que
// se calcula sobre la misma lectura que la tabla: una sola fuente de verdad.
//
// ADR-0128: las cifras ahora las dibuja `ProveedoresIndicadores` (componente cliente: cuentan al cambiar
// y la barra de concentración conversa con la tabla). La serie mensual (`fn_proveedores_serie_12m`) es
// opcional: si la función no está en la base, `getProveedoresSerie()` devuelve `null` y la lista se pinta
// sin tendencias.
export default async function ProveedoresPage() {
  const persona = await requirePersonaActualV2();
  const esLider = persona.rol === "lider";
  const [proveedores, resumen, series] = await Promise.all([getProveedores(), esLider ? getProveedoresResumen() : null, esLider ? getProveedoresSerie() : null]);

  return <ProveedoresPanel proveedores={proveedores} esLider={esLider} resumen={resumen} series={series} />;
}

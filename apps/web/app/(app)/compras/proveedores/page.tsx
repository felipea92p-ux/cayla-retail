import { exigirModulo, puede } from "@/lib/persona-actual";
import { usaModulo } from "@/lib/modulos";
import { getMarcasPorProveedor, getProveedores, getProveedoresPrendas, getProveedoresRendimiento, getProveedoresResumen, getProveedoresSerie } from "@/lib/proveedores";
import { ProveedoresPanel } from "@/components/ProveedoresPanel";
import { LoQueQuizaNoVes } from "@/components/LoQueQuizaNoVes";
import { hallazgosDeCartera } from "@/lib/proveedor-analisis-reglas";
import { hoyLima } from "@/lib/fechas-lima";

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
//
// ADR-0140: el nombre es la razón social, pero se le conoce por su marca. `getMarcasPorProveedor()` trae las marcas
// (tablas `marcas` y `marca_proveedores`, sin migración) para buscar por ellas y verlas en cada fila; es opcional
// igual que la serie: si falla, la lista se pinta sin marcas.
export default async function ProveedoresPage() {
  // La puerta del módulo Proveedores. ADR-0161 P3 (20260923140000): con el módulo se da de alta, se edita y se archiva
  // (`fn_puede_gestionar_proveedores` en la base). Los montos, desde ADR-0387 (Felipe 2026-10-12, «el módulo es la llave»):
  // también con el módulo, completo (`fn_ve_plata_de_proveedores` en la base); antes, solo con los montos de Compras.
  const persona = await exigirModulo("proveedores");
  const verMontos = puede(persona, "verDineroCompras") || usaModulo(persona.rol, persona.modulos, "proveedores");
  const puedeEditar = puede(persona, "editarCuentasProveedor");
  const [proveedores, resumen, series, marcas, rendimiento, prendas] = await Promise.all([
    getProveedores(),
    verMontos ? getProveedoresResumen() : null,
    verMontos ? getProveedoresSerie() : null,
    getMarcasPorProveedor(),
    // Qué le deja cada proveedor (2026-10-24): plata, así que con la misma llave que las cifras. Opcional: si la base no tiene la función, la lista sale como antes.
    verMontos ? getProveedoresRendimiento().catch(() => null) : null,
    verMontos ? getProveedoresPrendas().catch(() => null) : null,
  ]);

  return (
    <div className="space-y-6">
      {/* Mercadería es el ranking (dirección «C», Felipe 2026-10-26): reemplaza a la tabla «A quién le compro y qué me deja», que contaba lo mismo. */}
      <ProveedoresPanel proveedores={proveedores} verMontos={verMontos} puedeEditar={puedeEditar} resumen={resumen} series={series} marcas={marcas} rendimiento={rendimiento} hoy={hoyLima()} />
      {prendas && <LoQueQuizaNoVes guia="proveedores.analisis" hallazgos={hallazgosDeCartera(prendas, hoyLima())} />}
    </div>
  );
}

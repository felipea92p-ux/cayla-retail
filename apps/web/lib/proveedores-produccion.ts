import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { ProveedorProduccion, RubroProduccion } from "@/lib/proveedores-produccion-reglas";

// Directorio de proveedores de Producción (ADR-0133, F4a; D-H). Solo lectura: toda escritura pasa por
// `guardar_proveedor_produccion` y `cambiar_estado_proveedor_produccion` (solo líder). La tabla y la función traen datos
// bancarios de terceros, así que la base solo se los da al líder: para quien no lo es, `fn_proveedores_produccion` responde
// cero filas. La página además lo redirige antes de llegar acá.

export async function getProveedoresProduccion(): Promise<ProveedorProduccion[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_proveedores_produccion"), "los proveedores de Producción");
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    rubro: f.rubro as RubroProduccion,
    ruc: f.ruc,
    contacto: f.contacto,
    telefono: f.telefono,
    plazoCreditoDias: f.plazo_credito_dias,
    formaPagoPreferida: f.forma_pago_preferida,
    banco: f.banco,
    cuentaBancaria: f.cuenta_bancaria,
    cci: f.cci,
    celularBilletera: f.celular_billetera,
    billeteras: f.billeteras,
    titularCuenta: f.titular_cuenta,
    activo: f.activo,
    lotes: Number(f.lotes),
    totalComprado: Number(f.total_comprado),
    ultimaEntrega: f.ultima_entrega,
  }));
}

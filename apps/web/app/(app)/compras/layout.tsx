import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";

// Compras (ADR-0035): varias pantallas sobre la misma entidad — la factura
// del proveedor. La sub-navegación que este layout ponía (`ComprasNav.tsx`,
// Proveedores/Facturas/Recibir mercadería/Por pagar) se retiró el
// 2026-09-16: las mismas cuatro secciones viven ahora en el lateral
// (`AppShell.tsx`) — tenerlas en los dos lados era la misma navegación
// repetida. Desde ADR-0133 ese grupo se llama «Producción» y también trae las
// Órdenes; las URLs de acá no cambiaron. El layout de acá abajo solo
// resuelve el candado de rol; cada página sigue resolviendo su propia
// persona y datos.
//
// Era líder-only (0016_roles_colaborador.sql) hasta el 2026-09-22 (ver abajo). Faltaba acá: el menú ya escondía el enlace (`esLider` en
// AppShell.tsx), pero ninguna de las 5 pantallas de Compras tenía este
// redirect — un Colaborador que entrara por URL directa veía la pantalla
// entera (aunque no pudiera escribir nada, eso sí lo bloqueaban las RPC).
// Puesto acá, en el layout, protege las 5 de una sola vez.
//
// `modal` es un slot paralelo (`@modal/`): ahí Next dibuja el detalle de una
// factura como modal cuando se abre desde una lista del módulo (ruta
// interceptada `@modal/(.)factura/[compraId]`), sin desmontar la lista de
// `children`. El resto del tiempo el slot está vacío (`@modal/default.tsx`).
//
// El detalle vive en `/compras/factura/<id>` y NO en `/compras/<id>` a
// propósito: la intercepción se aplica como reescritura ANTES de resolver
// rutas, y un `(.)[compraId]` directo bajo /compras se tragaba también
// `/compras/por-pagar`, `/compras/nueva`, etc. en navegación suave (Next
// intentaba abrir el modal con id "por-pagar"). Con el prefijo `factura/`
// el patrón interceptado ya no se solapa con las pantallas hermanas.
export default async function ComprasLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  // 20260923130000 (Felipe, 2026-09-22): ya no es solo del líder. Entra quien ve los montos de Compras (su rol ve Facturas
  // de compra, Por pagar o Notas de crédito: `verDineroCompras`); cada pantalla exige además SU módulo (`exigirModulo`).
  // ADR-0161 P3 (20260923140000): también quien tiene Proveedores, aunque no vea los montos: el directorio y la ficha viven
  // aquí. Las pantallas de dinero lo siguen pidiendo cada una (su módulo, y el detalle de un comprobante `verDineroCompras`).
  // ADR-0179: el rol dice QUIÉN entra; de QUÉ TIENDAS ve cada fila lo filtra la base (`fn_compras_ubicaciones`), no este layout.
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "verDineroCompras") && !puede(persona, "editarCuentasProveedor")) redirect("/");

  return (
    <div className="space-y-6">
      {children}
      {modal}
    </div>
  );
}

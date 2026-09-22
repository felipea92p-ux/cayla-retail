import { exigirLiderOCompradorDeTienda } from "@/lib/persona-actual";

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
// Líder o comprador de tienda (ADR-0151, F5) — antes era solo líder
// (0016_roles_colaborador.sql), igual que Facturación y Colaboradores.
// Faltaba acá: el menú ya escondía el enlace (`esLider` en AppShell.tsx),
// pero ninguna de las 5 pantallas de Compras tenía este redirect — un
// Colaborador que entrara por URL directa veía la pantalla entera (aunque no
// pudiera escribir nada, eso sí lo bloqueaban las RPC). Puesto acá, en el
// layout, protege las 5 de una sola vez. Un comprador que pasa este candado
// solo ve, dentro de cada pantalla, lo de SUS tiendas — eso lo filtra la
// base (RLS, `fn_compra_es_de_mis_tiendas`), no este layout.
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
  await exigirLiderOCompradorDeTienda();

  return (
    <div className="space-y-6">
      {children}
      {modal}
    </div>
  );
}

import Link from "next/link";
import { PorDondeSeguir } from "@/components/ayuda/PorDondeSeguir";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";

/**
 * Un pedido que no está: un número mal escrito o un enlace viejo. El de otra cuenta responde igual (la base no dice que existe). Antes
 * caía en la página de «no existe» de toda la tienda, con la cabecera de quien no tiene cuenta («Entrar») y «Volver a la portada»: aquí
 * se queda en su cuenta y lleva a sus pedidos. Lo dibuja el `notFound()` de la página (`page.tsx`), como antes. Revisión «a nivel
 * mundial» (2026-10-16): con la marca, «Ver mis pedidos» y, para una duda con el pedido, el WhatsApp de cada tienda (en Nuestras tiendas).
 */
export default function PedidoQueNoEsta() {
  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <PorDondeSeguir
        ceja="Mis pedidos"
        titulo={
          <>
            No encontramos <em>ese pedido.</em>
          </>
        }
        texto="Puede que el número esté mal escrito. Todos tus pedidos están en tu lista."
        acciones={
          <>
            <Link className="t-btn" href="/cuenta/pedidos">
              Ver mis pedidos
            </Link>
            <Link className="ay-enlace" href="/tiendas">
              ¿Una duda? Escríbele a tu tienda <Icono nombre="flecha" />
            </Link>
          </>
        }
      />
    </MarcoCuenta>
  );
}

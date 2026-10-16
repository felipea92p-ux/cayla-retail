import Link from "next/link";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import "../../../estilos/catalogo.css";

/**
 * Un pedido que no está: un número mal escrito o un enlace viejo. El de otra cuenta responde igual (la base no dice que existe). Antes
 * caía en la página de «no existe» de toda la tienda, con la cabecera de quien no tiene cuenta («Entrar») y «Volver a la portada»: aquí
 * se queda en su cuenta y lleva a sus pedidos. Lo dibuja el `notFound()` de la página (`page.tsx`), como antes.
 */
export default function PedidoQueNoEsta() {
  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <div className="t-ancho">
        <div className="t-vacio">
          <Icono nombre="pedido" />
          <h1>No encontramos ese pedido</h1>
          <p>Puede que el número esté mal escrito. Todos tus pedidos están en tu lista.</p>
          <Link className="t-btn" href="/cuenta/pedidos">
            Ver mis pedidos
          </Link>
        </div>
      </div>
    </MarcoCuenta>
  );
}

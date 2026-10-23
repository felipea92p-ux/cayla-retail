import { exigirModulo } from "@/lib/persona-actual";
import { getDatosCompraRapida } from "@/lib/compra-rapida";
import { getMiPlata } from "@/lib/mi-plata";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { RegistrarCompra } from "@/components/mi-plata/RegistrarCompra";
import { AbrirRonda } from "@/components/mi-plata/AbrirRonda";

// Compras ▸ Mi plata para compras ▸ Compré ropa (ADR-0480, actividad 3): la compra desde el celular, una pregunta a la vez. La pantalla
// trae al abrir los proveedores, las categorías, las tiendas y cuánto tiene para comprar; los habituales de cada proveedor se leen al
// elegirlo. Si algo no carga, lo dice (principio 9). La vuelta es la flecha del paso (en el primero, a «Mi plata para compras»): dos flechas
// una sobre otra no dicen cuál vuelve a dónde. Una compra va dentro de la ronda abierta (20261023183000): quien llega sin ella (un enlace
// guardado, la ronda cerrada en otra pestaña) la abre aquí mismo y sigue.
export default async function CompraRapidaPage() {
  const persona = await exigirModulo("ordenes_compra");
  const [datos, plata] = await Promise.all([getDatosCompraRapida(), getMiPlata()]);
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Compré ropa"
        subtitulo="A quién le compraste, qué prendas y el papel que te dieron."
      />
      {datos.falla ? (
        <Aviso tono="error" titulo="No se pudo abrir la compra">
          {datos.falla}
        </Aviso>
      ) : plata?.persona && !plata.ronda.abierta ? (
        <div className="mx-auto w-full max-w-md">
          <AbrirRonda ultimaCerrada={null} />
        </div>
      ) : (
        <RegistrarCompra datos={datos} />
      )}
    </div>
  );
}

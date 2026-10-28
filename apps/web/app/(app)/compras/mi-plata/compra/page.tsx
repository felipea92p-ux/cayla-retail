import { exigirModulo } from "@/lib/persona-actual";
import { getDatosCompraRapida } from "@/lib/compra-rapida";
import { getMiPlata } from "@/lib/mi-plata";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";
import { RegistrarCompra } from "@/components/mi-plata/RegistrarCompra";
import { AbrirRonda } from "@/components/mi-plata/AbrirRonda";

// Compras ▸ Mis compras ▸ Compré ropa (ADR-0480, actividad 3): la compra desde el celular, una pregunta a la vez. La pantalla
// trae al abrir los proveedores, las categorías, las tiendas y cuánto tiene para comprar; los habituales de cada proveedor se leen al
// elegirlo. Si algo no carga, lo dice (principio 9). La vuelta es la flecha del paso (en el primero, a «Mis compras»): dos flechas
// una sobre otra no dicen cuál vuelve a dónde. Una compra va dentro de la ronda abierta (20261023183000): quien llega sin ella (un enlace
// guardado, la ronda cerrada en otra pestaña) la abre aquí mismo y sigue.
export default async function CompraRapidaPage() {
  const persona = await exigirModulo("ordenes_compra");
  const [datos, plata] = await Promise.all([getDatosCompraRapida(), getMiPlata()]);
  const sinRonda = Boolean(plata?.persona && !plata.ronda.abierta);
  // Con la compra en marcha, la cabecera es la compacta de `RegistrarCompra` (Felipe 2026-10-26, opción B): la del ERP, con su título de
  // 46 px y su frase, ocupaba un tercio del celular antes de la primera pregunta. Sin pasos (no cargó, o falta abrir la ronda) vuelve la del ERP.
  const enMarcha = !datos.falla && !sinRonda;
  return (
    <div className="flex flex-col gap-6">
      {!enMarcha && (
        <EncabezadoPagina
          sede={persona.ubicacionEtiqueta}
          titulo="Compré ropa"
          subtitulo="A quién le compraste, qué prendas y el papel que te dieron."
          // Sin los pasos (no cargó, o falta abrir la ronda) no hay flecha del paso: sin esta, la única salida era el menú.
          volver={<Volver href="/compras/mi-plata" a="Mis compras" />}
        />
      )}
      {datos.falla ? (
        <Aviso tono="error" titulo="No se pudo abrir la compra">
          {datos.falla}
        </Aviso>
      ) : sinRonda ? (
        <div className="mx-auto w-full max-w-md">
          <AbrirRonda ultimaCerrada={null} />
        </div>
      ) : (
        <RegistrarCompra datos={datos} />
      )}
    </div>
  );
}

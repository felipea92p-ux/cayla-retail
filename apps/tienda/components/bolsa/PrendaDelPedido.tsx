import { formaDe, fotoOptimizable, soles } from "@/lib/catalogo";
import { detalleDeLaPrenda, diaCorto, type LineaPedido } from "@/lib/pedidos";
import { Icono } from "../Icono";
import { Miniatura } from "./Miniatura";

/** Una prenda de un pedido (maqueta, `lineasPedido`): su foto, su nombre, color y talla, de dónde viene o cuándo llega, y su precio. */
export function PrendaDelPedido({ linea }: { linea: LineaPedido }) {
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  return (
    <div className="t-bolsa-item">
      <Miniatura
        foto={linea.foto}
        optimizar={linea.foto ? fotoOptimizable(linea.foto, origenFotos) : false}
        forma={formaDe(linea.categoria?.prefijo)}
        color={linea.color.hex}
      />
      <span>
        <b>{linea.nombre}</b>
        <small>{detalleDeLaPrenda(linea)}</small>
        {linea.vieneDe && (
          <small className="t-traslado">
            <Icono nombre="traslado" />
            Viene de {linea.vieneDe}
          </small>
        )}
        {linea.estado === "por_conseguir" && linea.fechaCompromiso && (
          <small className="t-traslado">
            <Icono nombre="reloj" />
            Llega el {diaCorto(linea.fechaCompromiso)}
          </small>
        )}
      </span>
      <b className="num">{soles(linea.precio)}</b>
    </div>
  );
}

import type { PiezaDeHeroe } from "@cayla-retail/portada";
import { colorDeDibujo, formaDe, fotoOptimizable, fotosDeTarjeta, precioTarjeta, type Prenda } from "@/lib/catalogo";
import { FotoTarjeta } from "./FotoTarjeta";

/**
 * Las prendas del héroe como polaroids (`HeroeDePortada`, @cayla-retail/portada): el Inicio, con el precio de cada prenda, y la portada
 * de quien todavía no tiene cuenta, SIN precio (Felipe 2026-10-16: «fotos sin precio»): en su lugar «Ver precio», que lleva a crear la
 * cuenta y, al terminarla, a esa prenda. La foto la pone la tienda (con el optimizador de imágenes y la silueta de su categoría si no
 * tiene); el marco, el acomodo y la caída son de la pieza compartida.
 */
export function piezasDelHeroe(
  prendas: readonly Prenda[],
  { href, conPrecio, origenFotos }: { href: (p: Prenda) => string; conPrecio: boolean; origenFotos: string | undefined },
): PiezaDeHeroe[] {
  return prendas.map((p) => {
    const foto = fotosDeTarjeta(p)[0];
    const precio = conPrecio ? precioTarjeta(p) : null;
    return {
      id: p.id,
      nombre: p.nombre,
      href: href(p),
      // Lo que ya se ve, para la ficha que llega (`RecordarPrendaTocada`); sin cuenta no hay precio que adelantar.
      datos: {
        "data-prenda": p.id,
        "data-nombre": p.nombre,
        "data-precio": precio?.principal,
        "data-antes": precio?.anterior ?? undefined,
        "data-oferta": precio?.oferta ? "si" : undefined,
        "data-categoria": p.categoria?.nombre ?? undefined,
      },
      etiqueta: conPrecio ? `Ver ${p.nombre}` : `${p.nombre}: crea tu cuenta para ver su precio`,
      foto: (
        <FotoTarjeta
          foto={foto}
          segunda={null}
          optimizar={[foto ? fotoOptimizable(foto, origenFotos) : false, false]}
          nombre={p.nombre}
          forma={formaDe(p.categoria?.prefijo)}
          color={colorDeDibujo(p)}
          tamanos="(min-width: 960px) 22vw, 45vw"
          pronto
        />
      ),
      derecha: precio ? <span className="num">{precio.principal}</span> : <span className="t-polaroid-ver">Ver precio</span>,
    };
  });
}

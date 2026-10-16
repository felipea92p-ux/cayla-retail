import { EsqueletoDePagina } from "@/components/EsqueletoDePagina";

// Mientras llega la ficha de una prenda (Felipe 2026-10-15: «cuando presiono en una prenda para ver el detalle no da la sensación de
// carga»): la foto grande y, a su lado, el nombre, el precio, los colores, las tallas y el botón, que brillan al instante. Va aquí y no
// solo en el esqueleto del catálogo: al ir de la lista a una prenda la página del catálogo no cambia de lugar, y sin un esqueleto propio la
// lista se quedaba quieta, sin ninguna señal, hasta que llegaba la ficha. La franja de arriba ya la pone el marco del catálogo.
export default function CargandoFicha() {
  return <EsqueletoDePagina forma="ficha" />;
}

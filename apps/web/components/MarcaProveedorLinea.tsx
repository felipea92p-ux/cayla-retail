import { Chip } from "@/components/ui/Chip";

/* ====================================================================
   MarcaProveedorLinea · de quién es y quién lo trae, y lo que todavía falta (ADR-0283)

   Un producto puede crearse sin marca y/o sin proveedor (llegó a almacén antes de que
   alguien registrara de quién es). Lo que falta no se esconde ni se pinta como una cadena
   vacía con un «·» colgando: sale como un chip ámbar que dice exactamente qué falta, para
   que se vea de un vistazo qué productos quedaron por completar (y se listen con el filtro
   «Sin marca» de Productos).

   `compacta` (la grilla «Pequeño»): solo la marca; el proveedor no cabe y se ve en la Tabla.
   ==================================================================== */

export function MarcaProveedorLinea({
  marca,
  proveedor,
  compacta = false,
  className = "",
}: {
  marca: string | null;
  proveedor: string | null;
  compacta?: boolean;
  className?: string;
}) {
  const sinMarca = <Chip tono="ambar" versalitas={false}>Sin marca</Chip>;
  const sinProveedor = <Chip tono="ambar" versalitas={false}>Sin proveedor</Chip>;

  let contenido;
  if (compacta) {
    contenido = marca ?? sinMarca;
  } else if (!marca && !proveedor) {
    contenido = <Chip tono="ambar" versalitas={false}>Sin marca ni proveedor</Chip>;
  } else {
    contenido = (
      <>
        {marca ?? sinMarca} <span className="text-tinta/35">·</span> {proveedor ?? sinProveedor}
      </>
    );
  }
  return (
    <p className={className} title={[marca ?? "sin marca", compacta ? null : (proveedor ?? "sin proveedor")].filter(Boolean).join(" · ")}>
      {contenido}
    </p>
  );
}

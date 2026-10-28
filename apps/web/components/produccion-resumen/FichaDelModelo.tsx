import { Aviso } from "@/components/ui/Aviso";
import type { FichaDeModelo } from "@/lib/produccion-hoja-modelo";

// La ficha corta de la hoja «Ver el modelo»: lo mismo que dice la de Catálogo ▸ Productos (marca, material, patrón) más el proveedor, que a Producción le importa tanto como a Compras:
// quién trae la tela y los avíos de este modelo se decide mirando a quién se le compra. Es del modelo, no del color: no cambia con la foto. Lo que no está registrado se dice («Sin
// registrar»), porque es justo lo que falta completar en «Editar» del catálogo; pero si la ficha ni se pudo leer NO se dice «Sin registrar» (afirmaría que está vacía): se avisa.
// El estilo es el de la vista rápida (`.vr-ficha`, app/estilos/vista-rapida.css): la misma cuadrícula, los mismos rótulos.

export function FichaDelModelo({ ficha }: { ficha: FichaDeModelo | null }) {
  if (!ficha) {
    return (
      <Aviso tono="info" chico>
        No se pudo leer la ficha del catálogo (marca, proveedor, material y patrón). Lo demás de esta hoja sí está al día.
      </Aviso>
    );
  }
  const datos = [
    { clave: "marca", rotulo: "Marca", valor: ficha.marca },
    { clave: "proveedor", rotulo: "Proveedor", valor: ficha.proveedor },
    { clave: "tejido", rotulo: "Material", valor: ficha.tejido },
    { clave: "patron", rotulo: "Patrón", valor: ficha.patron },
  ];
  return (
    <dl data-guia="prod-resumen.hoja-ficha" className="vr-ficha !mt-0">
      {datos.map((d) => (
        <div key={d.clave} className="vr-ficha-fila" data-ficha={d.clave}>
          <dt className="vr-rotulo label-cayla">{d.rotulo}</dt>
          <dd className={d.valor ? undefined : "vr-ficha-falta"}>{d.valor ?? "Sin registrar"}</dd>
        </div>
      ))}
    </dl>
  );
}

// La guía de foco del formulario «Registrar marca o proveedor» (`NuevaMarcaForm`; CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: decir si la marca y el proveedor están hechos, con la MISMA regla que habilita «Registrar» (`registroListo`,
//            lib/marca-proveedor-reglas.ts): una marca con nombre y sin pregunta pendiente («¿no será una que ya existe?»), y un
//            proveedor elegido o con razón social, que no sea el de una pareja ya registrada ni tenga pregunta pendiente.
//   ASUME:   quien firma no es un campo: dentro del alta lo firma quien la inició y desde Catálogo ▸ Marcas va soltado del combo.
//   NO HACE: no agrega reglas. Una prueba exige que «se puede registrar» según la guía sea exactamente `registroListo`.
import type { CampoDeGuia } from "./guia-campos";
import { parejaYaExiste, pideDejarVacio, type MarcaDelFormulario, type ProveedorDelFormulario } from "./marca-proveedor-reglas";

export type PreguntasPendientes = {
  /** «¿No será una marca que ya existe?» sin responder. */
  marca: number;
  /** «¿No será un proveedor que ya tienes?» sin responder. */
  proveedor: number;
  /** El proveedor nuevo se llama igual a uno registrado: hay que elegir el que existe. */
  proveedorIgual: boolean;
};

export function camposDeRegistroMarca(marca: MarcaDelFormulario | null, proveedor: ProveedorDelFormulario, preguntas: PreguntasPendientes): CampoDeGuia[] {
  // «Sin marca», «-»… no son nombres (`pideDejarVacio`): la guía lo dice en vez de darlo por hecho.
  const marcaVacia = !!marca && pideDejarVacio(marca.nombre);
  const provVacio = proveedor?.tipo === "nuevo" && pideDejarVacio(proveedor.razonSocial);
  const conMarca = !!marca && marca.nombre.trim() !== "" && !marcaVacia;
  const conProveedor = !!proveedor && (proveedor.tipo !== "nuevo" || (proveedor.razonSocial.trim() !== "" && !provVacio));
  const repetida = parejaYaExiste(marca, proveedor);
  return [
    {
      id: "marca",
      nombre: "Marca",
      requerido: true,
      hecho: conMarca && preguntas.marca === 0,
      pendiente: marcaVacia
        ? "«" + marca!.nombre.trim() + "» no es una marca: cancela y deja el campo vacío."
        : conMarca
          ? "Responde si es una marca que ya existe."
          : "Elige la marca o escribe una nueva.",
    },
    {
      id: "proveedor",
      nombre: "Quién te la trae",
      requerido: true,
      hecho: conProveedor && !repetida && preguntas.proveedor === 0 && !preguntas.proveedorIgual,
      pendiente: provVacio
        ? "«" + (proveedor as { razonSocial: string }).razonSocial.trim() + "» no es un proveedor: cancela y deja el campo vacío."
        : !conProveedor
        ? proveedor?.tipo === "nuevo"
          ? "Escribe la razón social del proveedor."
          : "Elige quién te la trae."
        : repetida
          ? "Esa marca ya la trae este proveedor: elige otro o cancela."
          : preguntas.proveedorIgual
            ? "Ese proveedor ya está registrado: elígelo de la lista."
            : "Responde si es un proveedor que ya tienes.",
    },
  ];
}

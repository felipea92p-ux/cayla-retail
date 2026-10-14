import type { ConceptoGastoViaje, PapelGastoViaje, TipoGastoViaje } from "./gastos-viaje-reglas";

// Los ejemplos de la hoja «Gasto del viaje» (ADR-0290): siguen a lo que la persona ya eligió. La serie, al papel (una boleta empieza con B,
// una factura con F); la nota, al concepto (un flete dice a dónde, un hotel cuántas noches). Sin elección, un texto que no promete nada.
// Inventados, no de un gasto real (un dato real invita a copiarlo).

export function ejemploSerie(papel: PapelGastoViaje | ""): string {
  if (papel === "boleta") return "Ej. B001-000123";
  if (papel === "factura") return "Ej. F001-000123";
  if (papel === "ticket") return "Ej. el número del boleto";
  return "Opcional";
}

const NOTA: Record<Exclude<ConceptoGastoViaje, "otro">, string> = {
  flete: "Ej. de Lima a Trujillo",
  agencia: "Ej. la agencia que lo despachó",
  cargador: "Ej. del puesto a la agencia",
  embalaje: "Ej. sacos y cinta para el fardo",
  pasaje: "Ej. bus de Trujillo a Lima",
  hotel: "Ej. una noche cerca de Gamarra",
  comida: "Ej. almuerzo del viaje",
  taxi: "Ej. del terminal a Gamarra",
};

export function ejemploNota(tipo: TipoGastoViaje | "", concepto: ConceptoGastoViaje | ""): string {
  if (concepto === "otro") return tipo === "viaje" ? "Escribe qué se pagó en el viaje" : "Escribe qué se pagó para traer la compra";
  if (concepto) return NOTA[concepto];
  return "Opcional";
}

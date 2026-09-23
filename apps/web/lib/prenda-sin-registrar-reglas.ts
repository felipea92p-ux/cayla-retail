// Lo mínimo que caja anota de una prenda que todavía no está en el sistema (ADR-0178): con esto
// almacén la reconoce después y la regulariza. `registrar_venta` exige lo mismo en la base.
export type DatosPrendaSinRegistrar = {
  descripcion: string;
  categoriaId: string;
  tallaId: string;
  colorCodigo: string;
  precio: number;
};

/** El primer dato que falta, dicho a la colaboradora; `null` si ya se puede agregar al ticket. */
export function faltaEnPrendaSinRegistrar(d: Partial<DatosPrendaSinRegistrar>): string | null {
  if (!d.descripcion?.trim()) return "Escribe una descripción corta";
  if (!d.categoriaId) return "Elige la categoría";
  if (!d.tallaId) return "Elige la talla";
  if (!d.colorCodigo) return "Elige el color";
  if (!d.precio || !(d.precio > 0)) return "Escribe el precio que cobraste";
  return null;
}

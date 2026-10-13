// Cómo se dibuja un modelo en el Resumen de Producción (tarea #5 del análisis docs/pantallas/produccion.md). Puro: sin Supabase ni React.
//
// CONTRATO
//   PROMETE: para cada modelo del catálogo, la foto con que se lo reconoce y lo que hace falta para dibujarlo SIN foto (el color de la prenda y su
//            categoría: `SinFoto`, ADR-0333). La foto es la de Catálogo ▸ Productos: la del primer color que tenga una (`colorPrincipal`, decisión de Felipe
//            del 2026-10-08), así que la misma blusa se ve igual en las dos pantallas. Cada foto es de SU color (`fotoDeVariante`): nunca la de otro.
//            Sin foto, el ícono se pinta del color del modelo SOLO si tiene uno; con varios cae al tono de su familia, porque pintar el primero afirmaría
//            un color que el modelo no tiene (ADR-0333, el mismo criterio de `colorUnico` en `lib/inicio-almacen-reglas.ts`).
//   ASUME:   el catálogo ya trae por variante su foto estricta, su color y el prefijo y la familia de su categoría (`getCatalogo`).
//   NO HACE: no lee la base ni decide si un modelo se produce (eso es `esProducible`); un modelo que el catálogo no trae simplemente no tiene
//            presentación y quien dibuja usa la percha, nunca se cae.
import type { VarianteCatalogo } from "./catalogo-v2";
import { colorPrincipal, coloresDe } from "./productos-vista";

export type PresentacionDeModelo = {
  fotoUrl: string | null;
  colorHex: string | null;
  categoria: string | null;
  categoriaPrefijo: string | null;
  categoriaFamilia: string | null;
};

export function presentacionesDeModelos(catalogo: readonly VarianteCatalogo[]): Record<string, PresentacionDeModelo> {
  const porModelo = new Map<string, VarianteCatalogo[]>();
  for (const v of catalogo) {
    const lista = porModelo.get(v.productoId);
    if (lista) lista.push(v);
    else porModelo.set(v.productoId, [v]);
  }
  const salida: Record<string, PresentacionDeModelo> = {};
  for (const [productoId, variantes] of porModelo) {
    const principal = colorPrincipal(coloresDe(variantes));
    const conFoto = variantes.find((v) => v.fotoUrl);
    const primera = variantes[0];
    const fotoUrl = principal?.fotoUrl ?? conFoto?.fotoUrl ?? null;
    // Los colores distintos del modelo, con el hex tal como está en el catálogo (sin el gris de relleno que `coloresDe` le pone a uno sin hex).
    const colores = new Map<string, string | null>();
    for (const v of variantes) if (v.color && !colores.has(v.color)) colores.set(v.color, v.colorHex);
    salida[productoId] = {
      fotoUrl,
      // Con foto, el color solo sirve de respaldo si la imagen no carga; sin foto es lo que se dibuja.
      colorHex: fotoUrl ? (principal?.hex ?? conFoto?.colorHex ?? null) : colores.size === 1 ? [...colores.values()][0] : null,
      categoria: primera.categoria ?? null,
      categoriaPrefijo: primera.categoriaPrefijo ?? null,
      categoriaFamilia: primera.categoriaFamilia ?? null,
    };
  }
  return salida;
}

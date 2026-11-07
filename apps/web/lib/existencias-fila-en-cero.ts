// La fila en cero de UNA talla que esta sede nunca movió (ni una fila de `stock`), para abrir el modal de su prenda en «Ajustar stock».
//
// Existencias arma sus filas desde `stock`, y una fila nace de un movimiento: una prenda recién creada no tiene ninguna. El ajuste no la
// necesita (la planilla lee las tallas del producto de la base y marca «sin historia» la que nunca se movió, ADR-0235): solo hace falta saber
// de qué prenda se habla para abrir el MISMO modal de cualquier otra talla. La lee el servidor (`getFilaSinStockDeVariante`, el candado de
// Editar producto) y el navegador (el buscador de «Ajustar stock»). Mismo cuerpo que la fila «en camino» de `getExistencias`.

import { fotoPrincipal } from "./inventario-reglas";
import { codigoDeEtiqueta } from "./prenda-reglas";
import type { FilaExistencias } from "./inventario-v2";

/** Lo que se pide de `variantes` para armar la fila (el `select` de `COLUMNAS_FILA_EN_CERO`). */
export type VarianteParaFilaEnCero = {
  id: string;
  sku: string | null;
  codigo: string | null;
  talla: { valor: string } | null;
  color: { nombre: string; hex: string | null } | null;
  producto: {
    id: string;
    referencia: string;
    categoria: { nombre: string; prefijo: string | null; familia: string | null } | null;
    producto_fotos: { url: string; orden: number; es_principal: boolean }[] | null;
  } | null;
  codigos_barras: { codigo: string }[] | null;
};

export const COLUMNAS_FILA_EN_CERO = `id, sku, codigo, talla:tallas ( valor ),
       color:colores ( nombre, hex ),
       producto:productos ( id, referencia, categoria:categorias ( nombre, prefijo, familia ), producto_fotos ( url, orden, es_principal ) ),
       codigos_barras ( codigo )`;

export function filaEnCero(v: VarianteParaFilaEnCero, separaPisoAlmacen: boolean): FilaExistencias {
  return {
    varianteId: v.id,
    productoId: v.producto?.id ?? "",
    sku: codigoDeEtiqueta(v),
    talla: v.talla?.valor ?? null,
    color: v.color?.nombre ?? null,
    colorHex: v.color?.hex ?? null,
    referencia: v.producto?.referencia ?? "",
    categoria: v.producto?.categoria?.nombre ?? null,
    categoriaPrefijo: v.producto?.categoria?.prefijo ?? null,
    categoriaFamilia: v.producto?.categoria?.familia ?? null,
    codigosBarras: (v.codigos_barras ?? []).map((c) => c.codigo),
    fotoUrl: fotoPrincipal(v.producto?.producto_fotos),
    total: 0,
    piso: separaPisoAlmacen ? 0 : null,
    almacen: separaPisoAlmacen ? 0 : null,
    danado: separaPisoAlmacen ? 0 : null,
    apartado: 0,
    disponible: 0,
    pisoDisponible: separaPisoAlmacen ? 0 : null,
    almacenDisponible: separaPisoAlmacen ? 0 : null,
    enTransito: 0,
    enRed: [],
  };
}

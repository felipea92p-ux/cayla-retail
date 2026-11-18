// La compra que se está anotando en «Compré ropa» sobrevive a que Android cierre la pestaña (ADR-0674, Fase 2; Felipe 2026-11-17).
//
// EL PROBLEMA. Quien compra anota las prendas parada frente al proveedor y, para la foto del papel o para pagar por Yape, salta a la
// cámara o a otra aplicación. En un teléfono de 2–4 GB Android descarta la pestaña y al volver la recarga: lo anotado vivía solo en la
// pantalla y se perdía (la guardia de «salir sin guardar» no alcanza: nadie salió).
//
// QUÉ HACE. Mientras se anota, la pantalla guarda una FOTO de la compra en la memoria de ESA pestaña (`sessionStorage`, por cuenta). Al
// volver, la compra se rearma donde iba —en «revisar», o en el papel si ya estaba ahí— con un aviso que deja empezar de nuevo.
//
// LO QUE NO PUEDE PASAR. Que la compra se guarde dos veces: su plata bajaría dos veces. No hace falta el candado de Vender: la foto
// conserva el IDENTIFICADOR de la compra, y la base no repite una compra con el mismo identificador (20261023005000: lo mismo devuelve lo
// que ya quedó; otra cosa con ese identificador, `compra_rapida_otros_datos`). Si la base dice eso, la compra YA está guardada: la foto se
// borra y no se vuelve a guardar, o «recarga la pantalla» la traería de vuelta una y otra vez.
//
// LO QUE NO SE GUARDA. El archivo de la foto del papel (no cabe en la memoria de la pestaña): al volver se pide de nuevo, y el aviso lo
// dice. Tampoco la hoja de una prenda a medio escribir.

import type { LineaCompra, PagoCompra, PasoCompra, TipoPapel } from "@/lib/compra-rapida-reglas";

export type FotoDeCompra = {
  id: string;
  proveedorId: string;
  marcaElegida: { id: string; nombre: string } | null;
  porMarca: boolean;
  lineas: LineaCompra[];
  paso: PasoCompra;
  tipo: TipoPapel | null;
  monto: string;
  serie: string;
  numero: string;
  pago: PagoCompra;
  pagadoPropio: boolean;
  pagoParcial: boolean;
  /** Ya había tomado la foto del papel: al volver hay que tomarla otra vez, y el aviso lo dice. */
  teniaFoto: boolean;
};

/** Una llave por cuenta: en una pestaña que cambia de sesión, nadie ve la compra de otra persona. Una terminal, por su sede. */
export function claveDeCompraEnCurso(personaId: string | null, ubicacionId: string): string {
  return `cayla:mis-compras:${personaId ?? `terminal:${ubicacionId}`}:en-curso`;
}

/**
 * ¿Se guarda la foto o se borra? Sin proveedor o sin prendas no hay nada que recuperar; guardada, tampoco. Y si la base ya dijo que esa
 * compra existe (`yaEstaEnLaBase`), nunca más: recuperarla solo llevaría al mismo rechazo.
 */
export function queHacerConLaCompra(e: { paso: PasoCompra; hayProveedor: boolean; prendas: number; yaEstaEnLaBase: boolean }): "guardar" | "borrar" {
  return e.paso !== "listo" && e.hayProveedor && e.prendas > 0 && !e.yaEstaEnLaBase ? "guardar" : "borrar";
}

const texto = (x: unknown): x is string => typeof x === "string";
const numero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const TIPOS: readonly string[] = ["factura", "boleta", "nota_venta", "sin_comprobante"];
const MEDIOS: readonly string[] = ["yape", "efectivo", "transferencia"];

function lineaQueSirve(x: unknown): x is LineaCompra {
  if (typeof x !== "object" || x === null) return false;
  const l = x as Record<string, unknown>;
  return (
    texto(l.clave) &&
    texto(l.nombre) &&
    texto(l.categoria) &&
    texto(l.destinoId) &&
    (l.productoId === null || texto(l.productoId)) &&
    (l.categoriaId === null || texto(l.categoriaId)) &&
    (l.marcaId === null || texto(l.marcaId)) &&
    (l.marca === null || texto(l.marca)) &&
    numero(l.cantidad) &&
    l.cantidad > 0 &&
    numero(l.costo) &&
    l.costo >= 0 &&
    (l.venta === null || numero(l.venta)) &&
    typeof l.precioPorDefinir === "boolean"
  );
}

function pagoQueSirve(x: unknown): x is PagoCompra {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return (p.forma === "ahora" || p.forma === "despues") && texto(p.pagado) && (p.medio === null || (texto(p.medio) && MEDIOS.includes(p.medio)));
}

/** ¿Lo leído del navegador tiene la forma de una foto? Una vieja (de antes de un cambio de la pantalla), rota o vacía no se recupera. */
function fotoQueSirve(x: unknown): x is FotoDeCompra {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  const marca = f.marcaElegida as { id?: unknown; nombre?: unknown } | null;
  return (
    texto(f.id) &&
    f.id.length > 0 &&
    texto(f.proveedorId) &&
    (marca === null || (typeof marca === "object" && texto(marca.id) && texto(marca.nombre))) &&
    typeof f.porMarca === "boolean" &&
    Array.isArray(f.lineas) &&
    f.lineas.length > 0 &&
    f.lineas.every(lineaQueSirve) &&
    (f.paso === "habituales" || f.paso === "revisar" || f.paso === "papel") &&
    (f.tipo === null || (texto(f.tipo) && TIPOS.includes(f.tipo))) &&
    texto(f.monto) &&
    texto(f.serie) &&
    texto(f.numero) &&
    pagoQueSirve(f.pago) &&
    typeof f.pagadoPropio === "boolean" &&
    typeof f.pagoParcial === "boolean" &&
    typeof f.teniaFoto === "boolean"
  );
}

/**
 * ¿La compra de la foto YA está entre las guardadas? Pasa si la pestaña murió justo al guardar y la compra sí llegó a la base. Entonces
 * no se recupera: volver a guardarla no la duplicaría (mismo identificador), pero la pantalla la contaría como nueva y restaría su plata
 * dos veces («Ahora tienes…»). Sin la lista (una terminal, o no cargó), la red es el rechazo `compra_rapida_otros_datos`.
 */
export function fotoYaGuardada(leido: unknown, guardadas: ReadonlySet<string>): boolean {
  return fotoQueSirve(leido) && guardadas.has(leido.id);
}

export type CompraRecuperada = {
  foto: FotoDeCompra;
  /** A qué paso vuelve: al papel solo si estaba ahí y no se perdió ninguna prenda (el monto del papel ya no cuadraría). */
  paso: "revisar" | "papel";
  /** Prendas (unidades) que ya no se pueden anotar: su tienda o su categoría dejó de existir mientras la pestaña estuvo cerrada. */
  perdidas: number;
};

/**
 * Al abrir «Compré ropa»: lo que la pestaña guardó, contra lo que la pantalla sabe HOY. No se recupera si el proveedor ya no está en la
 * lista. Una prenda cuya tienda o categoría ya no existe se saca y se cuenta (la base la rechazaría al guardar): nunca en silencio.
 */
export function compraRecuperada(
  leido: unknown,
  hoy: { proveedores: ReadonlySet<string>; tiendas: ReadonlySet<string>; categorias: ReadonlySet<string> },
): CompraRecuperada | null {
  if (!fotoQueSirve(leido) || !hoy.proveedores.has(leido.proveedorId)) return null;
  const lineas = leido.lineas.filter((l) => hoy.tiendas.has(l.destinoId) && (l.categoriaId === null || hoy.categorias.has(l.categoriaId)));
  if (lineas.length === 0) return null;
  const perdidas = leido.lineas.reduce((s, l) => s + l.cantidad, 0) - lineas.reduce((s, l) => s + l.cantidad, 0);
  return { foto: { ...leido, lineas }, paso: leido.paso === "papel" && perdidas === 0 ? "papel" : "revisar", perdidas };
}

/** La segunda línea del aviso: a quién, cuántas prendas y, si toca, lo que hay que volver a hacer. Corta: cabe a 375 px. */
export function detalleDeRecuperada(r: CompraRecuperada, proveedor: string): string {
  const prendas = r.foto.lineas.reduce((s, l) => s + l.cantidad, 0);
  const partes = [`${proveedor} · ${prendas === 1 ? "1 prenda" : `${prendas} prendas`}`];
  if (r.perdidas > 0) partes.push(r.perdidas === 1 ? "1 prenda no se pudo recuperar: revísala" : `${r.perdidas} prendas no se pudieron recuperar: revísalas`);
  if (r.foto.teniaFoto) partes.push("Toma otra vez la foto del papel");
  return `${partes.join(". ")}.`;
}

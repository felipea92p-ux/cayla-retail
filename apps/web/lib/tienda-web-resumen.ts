// Tienda web ▸ Resumen (ADR-0430, Felipe 2026-10-16): lo que la tienda online pide hoy, de un vistazo. Lógica pura, sin React ni red:
// la usan la pantalla y sus pruebas.
//
// PROMETE: dadas las lecturas de las otras cuatro pantallas del grupo (cada una como la dejó su módulo: leída, sin el módulo o caída),
// (1) la lista de lo que pide acción, de lo más urgente a lo que solo informa, cada cosa con su número y la pantalla que la resuelve;
// (2) qué prendas mostrar en la ventana de la vitrina; (3) cómo está cada tienda en la web.
// ASUME: que cada número ya viene calculado por la regla de SU pantalla (`cifrasDe` de Pedidos, Vitrina y Recomendaciones,
// `cifrasEsperan`, `cifrasLooks`, `estadoSedeWeb`). Aquí no nace ninguna regla de negocio nueva: si un número de aquí no coincide con el de
// su pantalla, el error está aquí.

import type { CifrasPedidosWeb, PlazosPedidosWeb } from "./pedidos-web-reglas";
import { plazoCorto, URGENTE_MS } from "./pedidos-web-reglas";
import type { CifrasRecomendaciones } from "./recomendaciones-reglas";
import type { CifrasEsperan } from "./vitrina-esperan-reglas";
import type { CifrasLooks } from "./vitrina-looks-reglas";
import type { CifrasVitrina, ModeloVitrina } from "./vitrina-reglas";
import { esEncendidoSinPrecio, hrefVitrina, seVeEnLaWeb } from "./vitrina-reglas";

/** Cómo llegó cada lectura: leída, sin el módulo (no se pide ni se muestra) o caída (se dice, y el resto de la pantalla sigue). */
export type Lectura<T> = { estado: "ok"; dato: T } | { estado: "sin_modulo" } | { estado: "fallo" };

export type LecturaPedidos =
  | Lectura<{ cifras: CifrasPedidosWeb; plazos: PlazosPedidosWeb }>
  /** Con el módulo, pero parado fuera de una tienda: los pedidos web se atienden en una tienda. */
  | { estado: "no_tienda" };

export type LecturaVitrinaResumen = Lectura<{
  cifras: CifrasVitrina;
  /** Encendidos que no se ven porque ninguna tienda de la web les pone precio: se arreglan en su ficha. */
  encendidosSinPrecio: number;
  /** `null`: la lectura de los looks o de «Esperan» se cayó (la vitrina se ve igual). */
  looks: CifrasLooks | null;
  esperan: CifrasEsperan | null;
}>;

export type SedeEnLaWeb = { id: string; nombre: string; tono: "verde" | "ambar" | "neutro"; texto: string };

export type EntradaResumen = {
  pedidos: LecturaPedidos;
  vitrina: LecturaVitrinaResumen;
  recomendaciones: Lectura<CifrasRecomendaciones>;
  ajustes: Lectura<SedeEnLaWeb[]>;
};

export type TonoPendiente = "urgente" | "atencion" | "info";
export type IconoPendiente = "confirmar" | "cobrar" | "entregar" | "devolver" | "recomendacion" | "espera" | "vitrina" | "look" | "tienda";

export type Pendiente = {
  clave: string;
  tono: TonoPendiente;
  icono: IconoPendiente;
  cifra: number;
  formato: "entero" | "soles";
  /** Lo que pasa, en una línea de tienda: «2 pedidos esperan que los confirmes». */
  titulo: string;
  /** Por qué importa o qué hacer. */
  detalle: string;
  /** La pantalla que lo resuelve. */
  href: string;
  /** El texto del enlace: lo que se va a hacer allá. */
  accion: string;
};

const ORDEN_TONO: Record<TonoPendiente, number> = { urgente: 0, atencion: 1, info: 2 };
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Lo que pide la tienda online hoy, de lo más urgente a lo que solo informa (dentro de un mismo tono, en el orden en que se atiende:
 * pedidos, clientes, vitrina, tiendas). Lo que no se lee (sin el módulo o caído) no aparece: la pantalla dice aparte lo que se cayó.
 */
export function pendientesDe(e: EntradaResumen): Pendiente[] {
  const p: Pendiente[] = [];

  if (e.pedidos.estado === "ok") {
    const { cifras: c, plazos } = e.pedidos.dato;
    if (c.porConfirmar > 0) {
      const vence = c.proximoVenceEnMs;
      p.push({
        clave: "confirmar",
        tono: vence !== null && vence < URGENTE_MS ? "urgente" : "atencion",
        icono: "confirmar",
        cifra: c.porConfirmar,
        formato: "entero",
        titulo: `${plural(c.porConfirmar, "pedido espera", "pedidos esperan")} que lo${c.porConfirmar === 1 ? "" : "s"} confirmes`,
        detalle:
          vence !== null
            ? `El primero se cierra solo en ${plazoCorto(vence)} si nadie lo confirma.`
            : `Un pedido sin confirmar se cierra solo a las ${plazos.horasParaConfirmar} horas.`,
        href: "/tienda-web/pedidos?pestana=confirmar",
        accion: "Confirmar",
      });
    }
    if (c.porDevolver > 0) {
      p.push({
        clave: "devolver",
        tono: "urgente",
        icono: "devolver",
        cifra: c.porDevolver,
        formato: "soles",
        titulo: `por devolver en ${c.pedidosPorDevolver} ${plural(c.pedidosPorDevolver, "pedido anulado", "pedidos anulados")}`,
        detalle: "Es plata de clientes: se devuelve anulando cada pago del pedido.",
        href: "/tienda-web/pedidos?pestana=cerrados",
        accion: "Devolver",
      });
    }
    if (c.sinPagar > 0) {
      p.push({
        clave: "sin-pagar",
        tono: "atencion",
        icono: "cobrar",
        cifra: c.sinPagar,
        formato: "entero",
        titulo: `${plural(c.sinPagar, "pedido confirmado sin pagar", "pedidos confirmados sin pagar")} hace más de ${plazos.horasAvisoSinPagar} h`,
        detalle: "Sin ningún pago se anula solo y sus prendas vuelven; si pagó una parte, decides tú.",
        href: "/tienda-web/pedidos?pestana=cobrar",
        accion: "Cobrar",
      });
    }
    if (c.sinRecoger > 0) {
      p.push({
        clave: "sin-recoger",
        tono: "atencion",
        icono: "entregar",
        cifra: c.sinRecoger,
        formato: "entero",
        titulo: `${plural(c.sinRecoger, "pedido pagado sin recoger", "pedidos pagados sin recoger")} hace más de ${plazos.diasAvisoSinRecoger} días`,
        detalle: "Escríbele por WhatsApp: la prenda sigue reservada en la tienda.",
        href: "/tienda-web/pedidos?pestana=entregar",
        accion: "Entregar",
      });
    }
  }

  // Lo que espera respuesta, no lo que nadie abrió: leerla no le da nada al cliente (decisión #2 A, 2026-10-17).
  if (e.recomendaciones.estado === "ok" && e.recomendaciones.dato.porResponder > 0) {
    const n = e.recomendaciones.dato.porResponder;
    p.push({
      clave: "recomendaciones",
      tono: "atencion",
      icono: "recomendacion",
      cifra: n,
      formato: "entero",
      titulo: `${plural(n, "recomendación", "recomendaciones")} por responder`,
      detalle: "Un cliente se tomó el tiempo de escribirle a CAYLA: respóndele, o archívala si no hace falta.",
      href: "/tienda-web/recomendaciones",
      accion: "Responder",
    });
  }
  // Lo que más piden este mes, si dos o más lo nombran (actividad 4): no es un pendiente, es lo que dicen los propios clientes.
  if (e.recomendaciones.estado === "ok" && e.recomendaciones.dato.temaDelMes) {
    const t = e.recomendaciones.dato.temaDelMes;
    p.push({
      clave: "recomendaciones-tema",
      tono: "info",
      icono: "recomendacion",
      cifra: t.veces,
      formato: "entero",
      titulo: `recomendaciones de este mes piden ${t.nombre}`,
      detalle: "Lo dicen los propios clientes: vale contárselo a quien decide el próximo pedido.",
      href: "/tienda-web/recomendaciones",
      accion: "Leerlas",
    });
  }

  if (e.vitrina.estado === "ok") {
    const v = e.vitrina.dato;
    if (v.esperan && v.esperan.llegaron > 0) {
      const n = v.esperan.llegaron;
      p.push({
        clave: "llegaron",
        tono: "atencion",
        icono: "espera",
        cifra: n,
        formato: "entero",
        titulo: `${plural(n, "talla que esperaban ya llegó", "tallas que esperaban ya llegaron")}`,
        detalle: "Los clientes que tocaron «Avísame» la ven al entrar a su cuenta; está libre para separar.",
        href: "/tienda-web/vitrina/esperan",
        accion: "Ver quién espera",
      });
    }
    if (v.encendidosSinPrecio > 0) {
      const n = v.encendidosSinPrecio;
      p.push({
        clave: "sin-precio",
        tono: "atencion",
        icono: "vitrina",
        cifra: n,
        formato: "entero",
        titulo: `${plural(n, "modelo encendido no se ve", "modelos encendidos no se ven")}: sin precio`,
        detalle: "Ninguna tienda de la web les pone precio. Se arregla en su ficha, en Catálogo ▸ Productos.",
        href: hrefVitrina("sin_precio"),
        accion: "Revisar",
      });
    }
    if (v.looks && v.looks.noSeVen > 0) {
      const n = v.looks.noSeVen;
      p.push({
        clave: "looks",
        tono: "info",
        icono: "look",
        cifra: n,
        formato: "entero",
        titulo: `${plural(n, "look encendido no se ve", "looks encendidos no se ven")}`,
        detalle: "Una prenda suya dejó de verse en la web, y un look solo sale completo.",
        href: "/tienda-web/vitrina/looks",
        accion: "Revisar",
      });
    }
    if (v.cifras.sinStock > 0) {
      const n = v.cifras.sinStock;
      p.push({
        clave: "sin-stock",
        tono: "info",
        icono: "vitrina",
        cifra: n,
        formato: "entero",
        titulo: `${plural(n, "modelo se ve", "modelos se ven")} sin nada que separar`,
        detalle: "Se ven en la web, pero no queda libre en ninguna tienda.",
        href: hrefVitrina("sin_stock"),
        accion: "Ver",
      });
    }
  }

  if (e.ajustes.estado === "ok") {
    const incompletas = e.ajustes.dato.filter((s) => s.tono === "ambar");
    if (incompletas.length > 0) {
      p.push({
        clave: "tiendas",
        tono: "atencion",
        icono: "tienda",
        cifra: incompletas.length,
        formato: "entero",
        titulo: `${plural(incompletas.length, "tienda encendida no se ve", "tiendas encendidas no se ven")} en la web`,
        detalle: incompletas.map((s) => `${s.nombre}: ${s.texto.replace(/^No se ve: /, "")}`).join(" · "),
        href: "/tienda-web/ajustes",
        accion: "Completar",
      });
    }
  }

  // Estable: dentro de un mismo tono queda el orden de arriba.
  return p.map((x, i) => ({ x, i })).sort((a, b) => ORDEN_TONO[a.x.tono] - ORDEN_TONO[b.x.tono] || a.i - b.i).map(({ x }) => x);
}

/** Lo que no se pudo leer, para decirlo en una línea (y que la persona sepa que el Resumen está incompleto, no que todo va bien). */
export function lecturasCaidas(e: EntradaResumen): string[] {
  const caidas: string[] = [];
  if (e.pedidos.estado === "fallo") caidas.push("los pedidos");
  if (e.vitrina.estado === "fallo") caidas.push("la vitrina");
  if (e.recomendaciones.estado === "fallo") caidas.push("las recomendaciones");
  if (e.ajustes.estado === "fallo") caidas.push("los ajustes de cada tienda");
  return caidas;
}

/** Una prenda en la ventana de la vitrina: lo que ve el cliente al entrar. */
export type TeselaWeb = {
  id: string;
  nombre: string;
  foto: string | null;
  colorHex: string | null;
  prefijo: string | null;
  familia: string | null;
  categoria: string | null;
  nuevo: boolean;
};

/** Cuántas prendas entran en la ventana: dos filas de seis en la computadora. */
export const TESELAS = 12;

/**
 * Las prendas de la ventana: solo las que se ven en la web, primero las fijadas en «Lo nuevo» y las que tienen foto (es lo que el
 * cliente ve primero en la portada), en el orden en que llegan. Sin ninguna con foto, igual se dibujan (el ícono de su categoría sobre
 * su color, ADR-0333): la ventana nunca queda vacía si hay algo en la web.
 */
export function teselasDe(modelos: readonly ModeloVitrina[], cuantas = TESELAS): TeselaWeb[] {
  const visibles = modelos.filter(seVeEnLaWeb).map((m, i) => {
    const foto = m.foto ?? m.colores.find((c) => c.foto)?.foto ?? null;
    return { m, i, foto, fijo: m.vitrina?.enLoNuevo === "fijo" };
  });
  visibles.sort((a, b) => Number(b.fijo) - Number(a.fijo) || Number(Boolean(b.foto)) - Number(Boolean(a.foto)) || a.i - b.i);
  return visibles.slice(0, Math.max(0, cuantas)).map(({ m, foto, fijo }) => ({
    id: m.id,
    nombre: m.nombre,
    foto,
    colorHex: m.colores[0]?.hex ?? null,
    prefijo: m.prefijo,
    familia: m.familia,
    categoria: m.categoria,
    nuevo: fijo,
  }));
}

/** Los encendidos que la web no muestra porque ninguna tienda les pone precio (`razonNoSeMuestra`, el chip «Sin precio: no se ve»). */
export const encendidosSinPrecio = (modelos: readonly ModeloVitrina[]): number => modelos.filter(esEncendidoSinPrecio).length;

/** Lo que sigue al número de la ventana: «modelos en la web · se recoge en 2 tiendas» (el número va aparte, contando). */
export function fraseVentana(seVen: number, tiendasVisibles: number | null): string {
  const modelos = `${plural(seVen, "modelo", "modelos")} en la web`;
  if (tiendasVisibles === null) return modelos;
  if (tiendasVisibles === 0) return `${modelos}, pero ninguna tienda para recoger`;
  return `${modelos} · se recoge en ${tiendasVisibles} ${plural(tiendasVisibles, "tienda", "tiendas")}`;
}

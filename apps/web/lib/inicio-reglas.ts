// Reglas puras del Inicio (sin Supabase ni React): qué se le muestra a quién y cómo se lee cada cifra.
// Viven acá y no en `page.tsx` para poder probarlas (auditoría docs/pantallas/inicio.md, tarea #11) y porque
// un Server Component no puede llamar funciones de un archivo "use client" (CLAUDE.md).
//
// El Inicio se arma en cuatro capas, de arriba abajo, y cada una responde una pregunta distinta de quien
// abre el sistema: «Hoy» (¿cómo voy?), «Por atender» (¿qué me toca?), «Ir a» (¿a dónde voy?) y la actividad.
// Estructura tomada de tres referentes públicos (maqueta en docs/maquetas/inicio-referentes-2026-09/).

import { comparativoSemanaAnterior, type Comparativo } from "./caja-panel-reglas";

export type PerfilInicio = {
  rol: "lider" | "integrante";
  ubicacionTipo: "tienda" | "almacen" | "taller";
};

// ── «Hoy» ────────────────────────────────────────────────────────────────────────────────────────

/** Solo las tiendas venden: en un almacén o en el Taller no hay «ventas de hoy» que mostrar. */
export function mostrarHoy(perfil: Pick<PerfilInicio, "ubicacionTipo">): boolean {
  return perfil.ubicacionTipo === "tienda";
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** Nombre del día de HOY en hora de Lima (fija UTC−5, Perú no cambia la hora: mismo criterio que `panel-serie.ts`).
 *  Sirve para el «vs. viernes pasado»: el comparativo dice de qué día habla, no un genérico «semana pasada». */
export function nombreDiaLima(ahoraMs: number): string {
  return DIAS[new Date(ahoraMs - 5 * 3600 * 1000).getUTCDay()]!;
}

export type Meta = { pct: number; barra: number; falta: number; meta: number };

export type ResumenHoy = {
  importe: number;
  ventas: number;
  /** null = sin ventas: un promedio sin ventas no es cero, es «no hay». */
  valorMedio: number | null;
  /** null = no hay con qué comparar (semana pasada en cero, o no se pudo leer). */
  comparativo: Comparativo | null;
  /** null = la sede no tiene meta configurada (`ubicaciones.meta_venta_diaria`). */
  meta: Meta | null;
};

/**
 * @param totales    el `total` de cada venta del día (lo que devuelve `fn_ventas_del_dia`; una colaboradora
 *                   recibe solo las suyas, así que «Tus ventas» sale sin filtrar nada acá).
 * @param semanaAnterior lo vendido el mismo día de la semana pasada hasta esta misma hora; null si no aplica.
 */
export function resumirHoy(
  totales: number[],
  semanaAnterior: number | null,
  metaVentaDiaria: number | null,
  nombreDiaPasado: string
): ResumenHoy {
  const importe = totales.reduce((a, t) => a + t, 0);
  const ventas = totales.length;
  const meta =
    metaVentaDiaria && metaVentaDiaria > 0
      ? {
          pct: Math.round((importe / metaVentaDiaria) * 100),
          barra: Math.min(100, Math.round((importe / metaVentaDiaria) * 100)),
          falta: Math.max(0, metaVentaDiaria - importe),
          meta: metaVentaDiaria,
        }
      : null;
  return {
    importe,
    ventas,
    valorMedio: ventas > 0 ? importe / ventas : null,
    comparativo: semanaAnterior === null ? null : comparativoSemanaAnterior(importe, semanaAnterior, nombreDiaPasado),
    meta,
  };
}

// ── «Por atender» ────────────────────────────────────────────────────────────────────────────────

export type Cola = {
  clave: string;
  titulo: string;
  /** null = no se pudo leer. Nunca se dibuja como 0: una cola que no se lee no está «al día». */
  cantidad: number | null;
  detalle: string;
  href: string;
};

/**
 * Las colas de trabajo de la sede. Hoy solo hay una fuente ya construida y probada (`getTrasladosPorAtender`, la
 * misma que pinta el «2» del menú). SUNAT pendiente y compras por pagar se suman acá cuando su lectura viva en
 * `lib/` y no dentro de su pantalla (tarea #3 de la auditoría): así no se duplica ninguna definición de «pendiente».
 */
export function colasInicio(fuentes: { traslados: number | null }): Cola[] {
  return [
    {
      clave: "traslados",
      titulo: "Traslados por recibir",
      cantidad: fuentes.traslados,
      detalle:
        fuentes.traslados === null
          ? "No se pudo leer esta cola. Revisa Inventario → Traslados."
          : fuentes.traslados === 0
            ? "Nada pendiente."
            : fuentes.traslados === 1
              ? "1 espera tu confirmación."
              : `${fuentes.traslados} esperan tu confirmación.`,
      href: "/inventario/traslados",
    },
  ];
}

// ── «Ir a» ───────────────────────────────────────────────────────────────────────────────────────

export type Acceso = { href: string; etiqueta: string; detalle: string; principal: boolean };

/**
 * Tres accesos según quién mira y desde dónde, sin repetir lo que ya está en el menú lateral como lista:
 * son los primeros pasos del día. La decisión es por el TIPO de la ubicación activa (no por su nombre), igual
 * que `puedeVerProduccion` en `produccion-menu.ts`: un segundo Taller o una cuarta tienda entran solos.
 * `cajaAbierta`: true/false, o null si no se pudo leer (no se inventa un estado).
 */
export function accesosInicio(perfil: PerfilInicio, cajaAbierta: boolean | null): Acceso[] {
  const buscar: Acceso = { href: "/buscar", etiqueta: "Buscar", detalle: "SKU, talla o color", principal: false };
  const recibir: Acceso = { href: "/recibir", etiqueta: "Recibir", detalle: "Lo que llegó, contra sus comprobantes", principal: false };

  if (perfil.ubicacionTipo === "taller") {
    return [
      { href: "/produccion", etiqueta: "Producción", detalle: "Órdenes por etapa", principal: true },
      recibir,
      buscar,
    ];
  }
  if (perfil.ubicacionTipo === "almacen") {
    return [{ ...recibir, principal: true }, { href: "/inventario", etiqueta: "Inventario", detalle: "Stock por ubicación", principal: false }, buscar];
  }
  const vender: Acceso = { href: "/vender", etiqueta: "Vender", detalle: "Punto de venta", principal: true };
  if (perfil.rol === "lider") {
    return [
      vender,
      {
        href: "/caja",
        etiqueta: "Caja",
        detalle: cajaAbierta === null ? "Ver el estado de la caja" : cajaAbierta ? "Abierta" : "Cerrada · ábrela para vender",
        principal: false,
      },
      buscar,
    ];
  }
  return [vender, recibir, buscar];
}

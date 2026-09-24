// Reglas puras del Inicio (sin Supabase ni React): qué se le muestra a quién y cómo se lee cada cifra.
// Viven acá y no en `page.tsx` para poder probarlas (auditoría docs/pantallas/inicio.md, tarea #11) y porque
// un Server Component no puede llamar funciones de un archivo "use client" (CLAUDE.md).
//
// El Inicio se arma en cuatro capas, de arriba abajo, y cada una responde una pregunta distinta de quien
// abre el sistema: «Hoy» (¿cómo voy?), «Por atender» (¿qué me toca?), «Ir a» (¿a dónde voy?) y la actividad.
// Estructura tomada de tres referentes públicos (maqueta en docs/maquetas/inicio-referentes-2026-09/).

import { comparativoSemanaAnterior, type Comparativo } from "./caja-panel-reglas";
import type { ClaveModulo } from "./modulos";
import { DIAS_PARA_VENCER } from "./por-regularizar-reglas";
import { HORAS_REINTENTO_AUTOMATICO } from "./transmision-reglas";

export type PerfilInicio = {
  rol: "lider" | "integrante";
  ubicacionTipo: "tienda" | "almacen" | "taller";
  /** ¿Quien mira es una cuenta TERMINAL (un aparato, ADR-0162)? Una que ve el Punto de venta nunca llega acá: aterriza en
   *  `/vender` (`aterrizajeDe` en `lib/menu.ts`). Las que llegan no venden: su casa es lo que su rol ve. */
  terminal?: boolean;
  /** Los módulos de su rol. Solo se miran para una terminal: los accesos de «Ir a» salen de lo que ve. */
  modulos?: readonly ClaveModulo[];
};

// ── «Hoy» ────────────────────────────────────────────────────────────────────────────────────────

/** Solo las tiendas venden: en un almacén o en el Taller no hay «ventas de hoy» que mostrar. Tampoco una terminal que
 *  llega a Inicio: si su rol viera el Punto de venta habría aterrizado en `/vender`, así que no vende y un «Tu día» de
 *  ventas no le dice nada. */
export function mostrarHoy(perfil: Pick<PerfilInicio, "ubicacionTipo" | "terminal">): boolean {
  return perfil.ubicacionTipo === "tienda" && !perfil.terminal;
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
export function colasInicio(fuentes: {
  traslados: number | null;
  prendasVencidas?: number | null;
  aperturas?: number | null;
  comprobantesAtascados?: number | null;
}): Cola[] {
  const colas: Cola[] = [
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
  // ADR-0179: prendas vendidas sin registrar que almacén no regularizó a tiempo. Solo la recibe quien la
  // pasa (el líder): es el aviso de que el stock de esas prendas sigue sin cuadrar.
  if (fuentes.prendasVencidas !== undefined) {
    const n = fuentes.prendasVencidas;
    const plazo = `más de ${DIAS_PARA_VENCER} días sin regularizar.`;
    colas.push({
      clave: "prendas-por-regularizar",
      titulo: "Prendas por regularizar",
      cantidad: n,
      detalle:
        n === null
          ? "No se pudo leer esta cola. Revisa Recibir → Por regularizar."
          : n === 0
            ? `Ninguna lleva ${plazo}`
            : n === 1
              ? `1 lleva ${plazo}`
              : `${n} llevan ${plazo}`,
      href: "/recibir?vista=por-regularizar",
    });
  }
  // ADR-0186: aperturas de caja que no coincidieron con el último cierre. Solo la recibe quien la pasa (el líder):
  // `undefined` = esta cola no es para esta persona; `null` = no se pudo leer.
  if (fuentes.aperturas !== undefined) {
    const n = fuentes.aperturas;
    colas.push({
      clave: "aperturas",
      titulo: "Aperturas de caja con diferencia",
      cantidad: n,
      detalle:
        n === null
          ? "No se pudo leer esta cola. Revisa Caja → Historial de cierres."
          : n === 0
            ? "Todas las aperturas coinciden con su cierre."
            : n === 1
              ? "1 abrió con un monto distinto del último cierre."
              : `${n} abrieron con un monto distinto del último cierre.`,
      href: "/caja/historial",
    });
  }
  // PL-114: comprobantes que el reintento automático ya soltó (`HORAS_REINTENTO_AUTOMATICO`) sin llegar a SUNAT. Es
  // el aviso al líder de PL-113, el mismo camino que las dos colas de arriba: `undefined` = no es para esta persona.
  if (fuentes.comprobantesAtascados !== undefined) {
    const n = fuentes.comprobantesAtascados;
    const plazo = `más de ${HORAS_REINTENTO_AUTOMATICO} horas sin llegar a SUNAT: ya no se reintenta solo.`;
    colas.push({
      clave: "comprobantes-atascados",
      titulo: "Comprobantes sin llegar a SUNAT",
      cantidad: n,
      detalle:
        n === null
          ? "No se pudo leer esta cola. Revisa Comprobantes → Por reintentar."
          : n === 0
            ? "Todos llegaron o se están reintentando solos."
            : n === 1
              ? `1 lleva ${plazo}`
              : `${n} llevan ${plazo}`,
      href: "/vender/comprobantes/por-reintentar",
    });
  }
  return colas;
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
  const recibir: Acceso = { href: "/recibir", etiqueta: "Recibir", detalle: "Lo que llegó, contra sus facturas de proveedor", principal: false };

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
  // Una terminal que llega a Inicio no vende (ver `mostrarHoy`): sus accesos salen de lo que VE su rol, nunca uno que la
  // mande a una pantalla cerrada. El primero que tenga es el principal.
  if (perfil.terminal) {
    const ve = (m: ClaveModulo) => perfil.modulos?.includes(m) ?? false;
    const posibles: (Acceso | null)[] = [
      ve("existencias") ? { href: "/inventario", etiqueta: "Inventario", detalle: "Stock por ubicación", principal: false } : null,
      ve("recibir") ? recibir : null,
      ve("caja") ? { href: "/caja", etiqueta: "Caja", detalle: "Ver el estado de la caja", principal: false } : null,
      ve("productos") ? { href: "/productos", etiqueta: "Productos", detalle: "El catálogo de prendas", principal: false } : null,
    ];
    const accesos = posibles.filter((a): a is Acceso => a !== null).slice(0, 2);
    return [...accesos, buscar].map((a, i) => ({ ...a, principal: i === 0 }));
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

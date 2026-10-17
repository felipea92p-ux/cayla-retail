// Tienda web ▸ Ajustes (ADR-0408, actividad 6). Lógica pura: la usan la pantalla y sus pruebas.
// La base vuelve a cerrar todo (`guardar_sede_tienda_web`, `guardar_parametros_tienda_web` y `fn_sede_web_falta`,
// 20261014231000); aquí solo se dice con una frase clara ANTES de ir a la base y se arma lo que necesita la guía de foco.
//
// El WhatsApp de una tienda es `ubicaciones.whatsapp_numero`, el mismo número del QR del club (ADR-0288): esta pestaña lo
// guarda con la misma función que Tiendas y caja (`guardar_whatsapp_tienda`) y con la misma regla (`celularValido`).

import { celularValido } from "./club-reglas";
import type { CampoDeGuia } from "./guia-campos";
import type { Resultado } from "./configuracion-reglas";

export type SedeWeb = {
  id: string;
  /** El nombre de la sede en el sistema («Tienda TRU»): el título de su tarjeta. */
  nombre: string;
  /** El que lee el cliente («Trujillo»). */
  nombreWeb: string | null;
  /** 9 dígitos que empiezan en 9, sin +51; el mismo del QR del club. */
  whatsapp: string | null;
  direccion: string | null;
  horario: string | null;
  mostrar: boolean;
};

export type ParametrosTiendaWeb = { horasParaConfirmar: number; horasAvisoSinPagar: number; diasAvisoSinRecoger: number; quedanPocasDesde: number };

/** `parametros` es null si la base todavía no tiene la migración 20261014231000 (la pantalla lo dice en vez de caerse). */
export type ConfiguracionTiendaWeb = { sedes: SedeWeb[]; parametros: ParametrosTiendaWeb | null };

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Lo que devuelve `fn_configuracion_tienda_web()` → tipos de la pantalla. */
export function leerConfiguracionTiendaWeb(data: unknown): ConfiguracionTiendaWeb {
  const d = (data ?? {}) as { sedes?: Record<string, unknown>[]; parametros?: Record<string, unknown> | null };
  const p = d.parametros;
  return {
    sedes: (Array.isArray(d.sedes) ? d.sedes : []).map((s) => ({
      id: String(s.id),
      nombre: String(s.nombre ?? ""),
      nombreWeb: texto(s.nombre_web),
      whatsapp: texto(s.whatsapp),
      direccion: texto(s.direccion),
      horario: texto(s.horario),
      mostrar: s.mostrar === true,
    })),
    parametros: p
      ? {
          horasParaConfirmar: Number(p.horas_para_confirmar),
          horasAvisoSinPagar: Number(p.horas_aviso_sin_pagar),
          diasAvisoSinRecoger: Number(p.dias_aviso_sin_recoger),
          quedanPocasDesde: Number(p.quedan_pocas_desde),
        }
      : null,
  };
}

// ---- Una tienda ----------------------------------------------------------------------------------------------------------

/** Los topes de largo, los mismos que la base (`ubicacion_datos_web_*_valido`). */
export const TOPES_SEDE = { nombreWeb: 40, direccion: 160, horario: 120 } as const;

/** Lo que se escribe en las cajas de una tienda, tal cual (sin limpiar). */
export type BorradorSede = { nombreWeb: string; whatsapp: string; direccion: string; horario: string };

export const borradorDe = (s: Pick<SedeWeb, "nombreWeb" | "whatsapp" | "direccion" | "horario">): BorradorSede => ({
  nombreWeb: s.nombreWeb ?? "",
  whatsapp: s.whatsapp ?? "",
  direccion: s.direccion ?? "",
  horario: s.horario ?? "",
});

/** Como lo guarda la base: sin espacios de más; vacío = sin dato. */
export function limpiarTexto(t: string): string | null {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio === "" ? null : limpio;
}

/**
 * Llegaron datos nuevos de la base (otro guardado, un refresco): cada caja toma el valor nuevo, salvo la que la persona tiene
 * escrita distinto. Así un refresco que llega mientras se escribe en otra caja no le borra lo que lleva escrito.
 */
export function fusionarBorrador(actual: BorradorSede, baseAntes: BorradorSede, baseNueva: BorradorSede): BorradorSede {
  const tomar = (k: keyof BorradorSede) =>
    actual[k] === baseAntes[k] || limpiarTexto(actual[k]) === limpiarTexto(baseNueva[k]) ? baseNueva[k] : actual[k];
  return { nombreWeb: tomar("nombreWeb"), whatsapp: tomar("whatsapp"), direccion: tomar("direccion"), horario: tomar("horario") };
}

/** Lo que le falta a una tienda para verse en la web. LA MISMA regla que `retail.fn_sede_web_falta`, en el mismo orden. */
export type DatoWeb = "nombre_web" | "whatsapp" | "direccion";

export function faltaParaMostrar(b: Pick<BorradorSede, "nombreWeb" | "whatsapp" | "direccion">): DatoWeb[] {
  const falta: DatoWeb[] = [];
  if (limpiarTexto(b.nombreWeb) === null) falta.push("nombre_web");
  if (!celularValido(b.whatsapp)) falta.push("whatsapp");
  if (limpiarTexto(b.direccion) === null) falta.push("direccion");
  return falta;
}

/** Cómo lo nombra la persona (la guía de foco y la tarjeta). */
export const NOMBRE_DATO: Record<DatoWeb | "horario", string> = {
  nombre_web: "Nombre en la web",
  whatsapp: "WhatsApp",
  direccion: "Dirección",
  horario: "Horario",
};

/** Lo que hay que hacer con cada uno, en una frase. */
const PENDIENTE: Record<DatoWeb | "horario", string> = {
  nombre_web: "Escribe cómo la lee el cliente: la ciudad o el lugar.",
  whatsapp: "Escribe el celular de la tienda: 9 dígitos que empiezan en 9.",
  direccion: "Escribe dónde se recoge: la calle, el número y una referencia.",
  horario: "Escribe los días y las horas en que atiende.",
};

/** «el WhatsApp», «la dirección»: dentro de una frase. */
const EN_FRASE: Record<DatoWeb, string> = { nombre_web: "el nombre en la web", whatsapp: "el WhatsApp", direccion: "la dirección" };

/** La insignia de la tarjeta: lo que el cliente ve hoy de esa tienda. */
export function estadoSedeWeb(s: { mostrar: boolean } & Pick<BorradorSede, "nombreWeb" | "whatsapp" | "direccion">): { tono: "verde" | "ambar" | "neutro"; texto: string } {
  if (!s.mostrar) return { tono: "neutro", texto: "No se ve en la web" };
  const falta = faltaParaMostrar(s);
  // Encendida pero incompleta: pasa si le quitaron el WhatsApp en Tiendas y caja. La web ya no la muestra (`tienda_sedes`).
  if (falta.length > 0) return { tono: "ambar", texto: `No se ve: falta ${new Intl.ListFormat("es", { type: "conjunction" }).format(falta.map((d) => EN_FRASE[d]))}` };
  return { tono: "verde", texto: "Se ve en la web" };
}

/** Los largos, con la misma frase que la base. `null` si todo cabe. */
export function errorDeLargo(b: Pick<BorradorSede, "nombreWeb" | "direccion" | "horario">): string | null {
  if ((limpiarTexto(b.nombreWeb) ?? "").length > TOPES_SEDE.nombreWeb) return `El nombre en la web va hasta ${TOPES_SEDE.nombreWeb} letras.`;
  if ((limpiarTexto(b.direccion) ?? "").length > TOPES_SEDE.direccion) return `La dirección va hasta ${TOPES_SEDE.direccion} letras.`;
  if ((limpiarTexto(b.horario) ?? "").length > TOPES_SEDE.horario) return `El horario va hasta ${TOPES_SEDE.horario} letras.`;
  return null;
}

/**
 * La guía de foco de la pestaña (CLAUDE.md «Guía de foco»): qué le falta a cada tienda para verse en la web, en el orden de
 * la pantalla. Solo llevan marca los datos que LLEGARON vacíos al abrir la pestaña (`pendientesAlAbrir`): una tienda que ya
 * venía completa no se llena de marcas. Nombre web, WhatsApp y dirección son requeridos (sin ellos no se enciende, la misma
 * regla de la base); el horario, sugerido: la web lo muestra si está, y nunca es un candado.
 */
export function camposDeGuia(
  sedes: readonly { id: string; nombre: string; borrador: BorradorSede }[],
  pendientesAlAbrir: ReadonlySet<string>,
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  for (const s of sedes) {
    const falta = faltaParaMostrar(s.borrador);
    for (const dato of ["nombre_web", "whatsapp", "direccion", "horario"] as const) {
      const id = idCampo(s.id, dato);
      if (!pendientesAlAbrir.has(id)) continue;
      const corto = s.nombre.replace(/^tienda\s+/i, "").trim() || s.nombre;
      campos.push({
        id,
        nombre: `${NOMBRE_DATO[dato]} · ${corto}`,
        requerido: dato !== "horario",
        sugerido: dato === "horario",
        hecho: dato === "horario" ? limpiarTexto(s.borrador.horario) !== null : !falta.includes(dato),
        pendiente: PENDIENTE[dato],
      });
    }
  }
  return campos;
}

/** El id de un dato de una tienda en la guía y en el DOM (`data-campo`). */
export const idCampo = (sedeId: string, dato: DatoWeb | "horario") => `${sedeId}:${dato}`;

/** Los datos que están vacíos AHORA (al abrir la pestaña): los únicos que llevan marca de la guía. */
export function pendientesDe(sedes: readonly SedeWeb[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sedes) {
    const b = borradorDe(s);
    for (const dato of faltaParaMostrar(b)) ids.add(idCampo(s.id, dato));
    if (limpiarTexto(b.horario) === null) ids.add(idCampo(s.id, "horario"));
  }
  return ids;
}

// ---- Los plazos, para todas las sedes -----------------------------------------------------------------------------------

/** Los mismos rangos que la base (`configuracion_tienda_web_*_rango`). El umbral no pasa de 3: la cifra de 4 o más nunca
 *  sale a la web (ADR-0408, DECIDÍ 6). */
export const RANGOS_PARAMETROS: Record<keyof ParametrosTiendaWeb, readonly [number, number]> = {
  horasParaConfirmar: [1, 168],
  horasAvisoSinPagar: [1, 720],
  diasAvisoSinRecoger: [1, 60],
  quedanPocasDesde: [1, 3],
};

const FRASE_RANGO: Record<keyof ParametrosTiendaWeb, string> = {
  horasParaConfirmar: "Las horas para confirmar van de 1 a 168 (una semana).",
  horasAvisoSinPagar: "El aviso si no paga va de 1 a 720 horas (30 días).",
  diasAvisoSinRecoger: "El aviso si no recoge va de 1 a 60 días.",
  quedanPocasDesde: "El número se muestra desde 1, 2 o 3 unidades: la cifra de 4 o más nunca sale a la web.",
};

export type BorradorParametros = Record<keyof ParametrosTiendaWeb, string>;

export const borradorParametros = (p: ParametrosTiendaWeb): BorradorParametros => ({
  horasParaConfirmar: String(p.horasParaConfirmar),
  horasAvisoSinPagar: String(p.horasAvisoSinPagar),
  diasAvisoSinRecoger: String(p.diasAvisoSinRecoger),
  quedanPocasDesde: String(p.quedanPocasDesde),
});

/** Los cuatro números enteros y en su rango, con la misma frase que la base. */
export function validarParametrosTiendaWeb(b: BorradorParametros): Resultado<ParametrosTiendaWeb> {
  const valor = {} as ParametrosTiendaWeb;
  for (const k of Object.keys(RANGOS_PARAMETROS) as (keyof ParametrosTiendaWeb)[]) {
    const t = b[k].trim();
    const n = Number(t);
    const [min, max] = RANGOS_PARAMETROS[k];
    if (!/^-?\d+$/.test(t) || n < min || n > max) return { ok: false, error: FRASE_RANGO[k] };
    valor[k] = n;
  }
  return { ok: true, valor };
}

/** Lo que el cliente ve con cada cantidad según el umbral (ADR-0408, DECIDÍ 6): «Hay», el número, «Última» o «—». */
function nivelQueVe(cantidad: number, quedanPocasDesde: number): string {
  if (cantidad <= 0) return "—";
  if (cantidad === 1) return "Última";
  return cantidad <= quedanPocasDesde ? String(cantidad) : "Hay";
}

/** La ayuda del umbral, con lo que el cliente vería: «Con 4 o más ve «Hay»; con 3, «3»; con 2, «2»; con 1, «Última».».
 *  Un umbral fuera de rango (mientras se escribe) no promete nada. */
export function fraseNiveles(quedanPocasDesde: number): string {
  const [min, max] = RANGOS_PARAMETROS.quedanPocasDesde;
  if (!Number.isInteger(quedanPocasDesde) || quedanPocasDesde < min || quedanPocasDesde > max) {
    return "Con pocas unidades, el cliente ve el número; con más, ve «Hay».";
  }
  const partes = [`Con ${quedanPocasDesde + 1} o más ve «${nivelQueVe(quedanPocasDesde + 1, quedanPocasDesde)}»`];
  for (let n = quedanPocasDesde; n >= 1; n--) partes.push(`con ${n}, «${nivelQueVe(n, quedanPocasDesde)}»`);
  return `${partes.join("; ")}.`;
}

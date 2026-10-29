// La guía de foco de las hojas de la página de la orden: «Terminé» (anotar lo terminado en una fase), «Corregir» lo anotado, quitar una marca o restaurar, una nota, «Cambiar quién», la «Salida» y la «Vuelta» de un servicio, «Anular» una de las dos, «Pasar al stock» y anotar la tela usada (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo que la persona ya hizo en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón.
//   ASUME:   nada de negocio nuevo: cada `hecho` sale de lo que la base ya exige (`registrar_avance` rechaza un avance vacío; `fn_produccion_fases_normalizar` rechaza una fase de servicio
//            sin proveedor, tarifa o fecha válidos; `fn_actor_persona_id(true)` exige a alguien que firme). `lib/orden-pagina-guia.test.ts` recorre las combinaciones contra esas reglas.
//   NO HACE: no pinta ni toca la base; y ningún campo es «sugerido»: aquí no hay recomendaciones que avisen sin bloquear.

import type { CampoDeGuia } from "./guia-campos";

export type EleccionAvance = {
  /** Cuántas prendas buenas se anotaron (la suma de las celdas, enteras y mayores que cero). */
  total: number;
  /** Ya hay quién anota (el combo «Responsable», ADR-0161/0162). */
  responsableListo: boolean;
  /** Cuántas con falla se anotaron (ADR-0570): una anotación de solo fallas también vale. */
  conFalla?: number;
  /** Hay filas de prendas con falla en la hoja (aunque estén a medias): entonces son un campo más. */
  hayFallas?: boolean;
  /** Lo primero que impide anotar las fallas (`problemasDeFallas`), o `null`. */
  problemaFallas?: string | null;
  /** Lo que impide el día elegido (`problemaDeDia`), o `null`. */
  problemaDia?: string | null;
};

/**
 * «Terminé»: escribir cuántas (ya viene precargado con lo que falta), las prendas con falla si las hay, el día (hoy de fábrica) y quién lo anota. `anotar_termine` rechaza una anotación
 * sin buenas ni fallas, una falla a medias o sin motivo, un día futuro o anterior a la apertura, y la falta de alguien que firme: los campos son exactamente esos.
 */
export function camposDeAvance(e: EleccionAvance): CampoDeGuia[] {
  return [
    { id: "cantidades", nombre: "Cuántas terminaste", requerido: true, hecho: e.total + (e.conFalla ?? 0) > 0, pendiente: "Escribe cuántas terminaste en cada talla y color." },
    ...(e.hayFallas ? [{ id: "fallas", nombre: "Las prendas con falla", requerido: true, hecho: !e.problemaFallas, pendiente: e.problemaFallas ?? "" }] : []),
    { id: "dia", nombre: "Cuándo lo terminaste", requerido: true, hecho: !e.problemaDia, pendiente: e.problemaDia ?? "Elige el día en que lo terminaste." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esto." },
  ];
}

export type EleccionCambioDeQuien = {
  /** Lo que `problemasFases` dice de la fase tal como quedó (vacío = la base la aceptaría). */
  faltas: readonly string[];
  responsableListo: boolean;
};

/** «Cambiar quién»: la fase entera es UN campo (quién la hace, a quién y a cuánto, como en la hoja de Nueva orden) y después quién lo anota. */
export function camposDeCambiarQuien(e: EleccionCambioDeQuien): CampoDeGuia[] {
  return [
    { id: "fase", nombre: "Quién la hace", requerido: true, hecho: e.faltas.length === 0, pendiente: e.faltas[0] ?? "Elige quién hace esta fase." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}

/** «Agregar un paso» (ADR-0566): igual que «Cambiar quién» —el paso entero es UN campo: quién lo hace, a quién y a cuánto— y después quién lo anota. */
export function camposDeAgregarPaso(e: EleccionCambioDeQuien): CampoDeGuia[] {
  return [
    { id: "fase", nombre: "Quién lo hace", requerido: true, hecho: e.faltas.length === 0, pendiente: e.faltas[0] ?? "Elige quién hace este paso." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este paso." },
  ];
}

export type EleccionSalida = {
  /** Cuántas prendas se mandan en total. */
  total: number;
  /** Lo que la base rechazaría de la Salida (`problemasDeSalida`); vacío = la aceptaría. */
  excesos: readonly string[];
  responsableListo: boolean;
};

/** «Salida»: cuántas se mandan (precargado con lo que ya puede salir), y quién lo anota. La guía y el botón dicen lo mismo que `registrar_salida`. */
export function camposDeSalida(e: EleccionSalida): CampoDeGuia[] {
  const malas = e.total <= 0 || e.excesos.length > 0;
  return [
    { id: "cantidades", nombre: "Cuántas mandas", requerido: true, hecho: !malas, pendiente: e.excesos[0] ?? "Escribe cuántas mandas en cada talla y color." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esta salida." },
  ];
}

export type EleccionVuelta = {
  /** Lo que `problemasDeVuelta` dice de lo escrito (vacío = la base lo aceptaría), SIN contar el «qué pasó». */
  excesos: readonly string[];
  /** Cuántas prendas se anotan en total (buenas + segundas + faltantes). */
  total: number;
  /** Hay segundas o faltantes: entonces la base exige decir qué pasó. */
  hayExcepciones: boolean;
  /** Ya se escribió qué pasó. */
  conMotivo: boolean;
  responsableListo: boolean;
};

/** «Vuelta»: cuántas volvieron, qué pasó con lo que no volvió bueno (solo si hay algo así) y quién lo anota. */
export function camposDeVuelta(e: EleccionVuelta): CampoDeGuia[] {
  const malas = e.total <= 0 || e.excesos.length > 0;
  const campos: CampoDeGuia[] = [{ id: "cantidades", nombre: "Cuántas volvieron", requerido: true, hecho: !malas, pendiente: e.excesos[0] ?? "Escribe cuántas volvieron en cada talla y color." }];
  if (e.hayExcepciones) campos.push({ id: "motivo", nombre: "Qué pasó", requerido: true, hecho: e.conMotivo, pendiente: "Cuéntanos qué pasó con lo que no volvió bueno." });
  campos.push({ id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esta vuelta." });
  return campos;
}

export type EleccionAnulacion = {
  /** Lo que `problemaDeAnulacion` dice del motivo escrito (null = la base lo aceptaría). */
  problema: string | null;
  responsableListo: boolean;
};

/** «Anular» una salida o una vuelta: por qué (la base lo exige, `anular_sin_motivo`) y quién lo anota. */
export function camposDeAnulacion(e: EleccionAnulacion): CampoDeGuia[] {
  return [
    { id: "motivo", nombre: "Por qué la anulas", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? "Cuéntanos por qué se anula." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esta anulación." },
  ];
}

export type EleccionCorreccion = {
  /** Lo que impide las cantidades (`problemaDeCantidadesCorregidas`), o `null`. */
  problemaCantidades: string | null;
  hayFallas: boolean;
  problemaFallas: string | null;
  problemaDia: string | null;
  /** Lo que todavía no cambió nada (`correccionSinCambios`): las cantidades o el día tienen que moverse. */
  sinCambios: boolean;
  /** Lo que impide el motivo (`problemaDeMotivoCambio`), o `null`. */
  problemaMotivo: string | null;
  responsableListo: boolean;
};

/**
 * «Corregir» un «Terminé» (ADR-0570, actividad 3): las cantidades y las fallas tal como debieron ser, el día, por qué se corrige y quién lo anota. `corregir_anotacion_orden` rechaza
 * lo mismo que «Terminé» y además una corrección sin cambios o sin motivo: los campos son exactamente esos. «Eliminar» (en la misma hoja) solo pide el motivo y quién.
 */
export function camposDeCorreccion(e: EleccionCorreccion): CampoDeGuia[] {
  return [
    {
      id: "cantidades",
      nombre: "Cómo debió quedar",
      requerido: true,
      hecho: e.problemaCantidades === null && !e.sinCambios,
      pendiente: e.problemaCantidades ?? "Cambia la cantidad o el día que estaba mal.",
    },
    ...(e.hayFallas ? [{ id: "fallas", nombre: "Las prendas con falla", requerido: true, hecho: !e.problemaFallas, pendiente: e.problemaFallas ?? "" }] : []),
    { id: "dia", nombre: "Cuándo lo terminaste", requerido: true, hecho: !e.problemaDia, pendiente: e.problemaDia ?? "Elige el día en que lo terminaste." },
    { id: "porque", nombre: "Por qué lo corriges", requerido: true, hecho: e.problemaMotivo === null, pendiente: e.problemaMotivo ?? "Cuenta por qué lo corriges." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}

/** Quitar la marca de Ploteo o restaurar lo eliminado: por qué (la base lo exige) y quién lo anota. */
export function camposDeCambioConMotivo(e: EleccionAnulacion): CampoDeGuia[] {
  return [
    { id: "porque", nombre: "Por qué", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? "Cuenta por qué." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}

/** Una nota del equipo: qué quieres contar y quién la escribe. */
export function camposDeNota(e: EleccionAnulacion): CampoDeGuia[] {
  return [
    { id: "texto", nombre: "La nota", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? "Escribe la nota." },
    { id: "quien", nombre: "Quién la escribe", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién escribe la nota." },
  ];
}

export type EleccionCierre = {
  /** Cuántas prendas buenas se pasan al stock en total. */
  total: number;
  /** Lo que `problemasDeCierre` dice de lo escrito (vacío = la base lo aceptaría). */
  problemas: readonly string[];
  responsableListo: boolean;
  /** ADR-0570, actividad 4: la tela sin anotar frena el paso al stock. `null` o ausente: no frena (no hay tela pendiente, o un líder ya lo permitió). Si frena: si ya está resuelto (un líder
   *  escribió su porqué) y, si no, lo que falta. */
  tela?: { hecho: boolean; pendiente: string } | null;
};

/** «Pasar al stock»: cuántas salieron buenas (precargado con lo terminado en la última fase), la tela si falta y quién lo anota. La guía y el botón dicen lo mismo que `cerrar_produccion`. */
export function camposDeCierre(e: EleccionCierre): CampoDeGuia[] {
  const malas = e.total <= 0 || e.problemas.length > 0;
  return [
    { id: "cantidades", nombre: "Cuántas salieron buenas", requerido: true, hecho: !malas, pendiente: e.problemas[0] ?? "Escribe cuántas salieron buenas en cada talla y color." },
    ...(e.tela ? [{ id: "tela", nombre: "La tela", requerido: true, hecho: e.tela.hecho, pendiente: e.tela.pendiente }] : []),
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién pasa esto al stock." },
  ];
}

/** «Anotar lo usado» (ADR-0570, actividad 4): lo que quedó de cada tela y lo que se usó de cada avío, y quién lo anota. `anotar_insumos_de_la_orden` rechaza lo mismo. */
export function camposDeLoUsado(e: EleccionTelaUsada): CampoDeGuia[] {
  return [
    { id: "cantidades", nombre: "Lo que quedó o se usó", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? "Escribe lo que quedó de cada tela." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esto." },
  ];
}

/** «Encontré tela»: qué color, cuánta y quién lo anota. El precio es opcional (sin él va el último de ese color): no entra a la guía. */
export function camposDeTelaEncontrada(e: EleccionTelaUsada & { colorElegido: boolean }): CampoDeGuia[] {
  return [
    { id: "color", nombre: "Qué tela", requerido: true, hecho: e.colorElegido, pendiente: "Elige qué tela encontraste." },
    { id: "cantidad", nombre: "Cuánta encontraste", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? "Escribe cuánta tela encontraste." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota esto." },
  ];
}

export type EleccionTelaUsada = {
  /** Lo que `problemaDeTelaUsada` dice de lo escrito (null = la base lo aceptaría). */
  problema: string | null;
  responsableListo: boolean;
};

/** Anotar lo que se usó de una tela (o devolver lo que sobró): cuánto —la base rechaza más de lo que hay o de lo descontado— y quién lo anota. */
export function camposDeTelaUsada(e: EleccionTelaUsada, devuelve = false): CampoDeGuia[] {
  return [
    { id: "cantidad", nombre: devuelve ? "Cuánto devuelves" : "Cuánto usaste", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? (devuelve ? "Escribe cuánto devuelves." : "Escribe cuánto usaste.") },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: devuelve ? "Elige quién anota esta devolución." : "Elige quién anota esto." },
  ];
}

export type EleccionEditarTela = {
  /** Lo que `problemasTela` y `problemasDeEdicion` dicen de la lista tal como quedó (vacío = la base la aceptaría). */
  faltas: readonly string[];
  /** La lista de la hoja es distinta de la guardada (`hayCambios`): guardar lo mismo no es un paso. */
  hayCambios: boolean;
  responsableListo: boolean;
};

/** «Editar tela y avíos»: la lista entera es UN campo (la base la valida junta: `guardar_insumos_orden`) y después quién lo anota. Sin cambios o con una falta, la guía lo dice. */
export function camposDeEditarTela(e: EleccionEditarTela): CampoDeGuia[] {
  const bien = e.faltas.length === 0 && e.hayCambios;
  return [
    { id: "tela", nombre: "Tela y avíos", requerido: true, hecho: bien, pendiente: e.faltas[0] ?? "Cambia algo de la tela o de los avíos para guardar." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}

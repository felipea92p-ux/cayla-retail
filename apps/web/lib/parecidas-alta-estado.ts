// «Prendas parecidas» en el alta — el PEGAMENTO PURO entre la base, la lectura, las reglas y lo que se dibuja (Fase 1, sin tocar producción).
//
// EL PROBLEMA. La comprobación de nombres de la base (`buscar_productos_parecidos`) y la lectura de lo que ya existe (`useCandidatasAlta`)
// llegan por caminos distintos, a distinta hora, y la alerta nueva no puede frenar «Crear» por su cuenta: quien manda es la base, que rechaza el
// idéntico siempre y «una letra» si no se confirma. Si la pantalla no frena exactamente lo mismo, la persona llena cuatro pasos y choca al final;
// si frena de más, la deja sin salida. Aquí se decide, en funciones puras y probadas, qué frena, qué se dibuja y qué se manda al crear.
//
// CONTRATO
//   PROMETE: (1) el candado sale de la BASE, prenda por prenda: el idéntico frena siempre (`nombreBloqueado`); «una letra» frena hasta que la
//            persona responda «No, es otro diseño» a ESA prenda en la hoja (`confirmo` viaja como `p_confirmo_distinto`); lo parecido y lo
//            informativo no frenan nunca, tenga o no marca. (2) Si la base marca algo y la pantalla nueva no puede hablar de esa prenda (la
//            lectura carga, falló o no la trajo) vuelve la casilla de siempre (`respaldo`) y `confirmo` pasa a ser la casilla: nunca un «Crear»
//            apagado sin salida (principio 9). (3) Sin red no hay alerta ni hoja. (4) «Importado» y el uuid nulo cuentan como sin marca (D5).
//            (5) Las respuestas son por id y no se olvidan al cambiar nombre, marca o categoría; solo `reiniciar` las borra.
//            (6) Ninguna salida lleva precio ni costo (ni la entrada tiene dónde traerlos).
//   ASUME:   que `base` es la salida de `useParecidos` (mismo nombre que comprueba la base, ya con su espera de 350 ms) y que `resultado` sale de
//            `ordenarParaAlta` con el nombre de la pausa de 0,6 s (`atrasada` dice si todavía corre). Que los dos algoritmos de nombre coinciden
//            (`claveReferencia` espeja a `fn_clave_referencia`). Que «una letra» sigue frenando en la base: `CASI_IGUAL_FRENA_EN_BASE`.
//   NO HACE: no lee la red, no toca el reloj ni React (el hook `useParecidasAlta` solo conecta), no decide si dos prendas son la misma, no edita
//            `problemasAlta` ni `camposDelAlta` (el candado entra por los mismos dos booleanos de `EstadoAlta` de siempre) y no crea nada en la base.

import type { Parecido } from "@/components/alta-producto/AvisoParecidos";
import { claveReferencia } from "./alta-producto";
import { MARCA_SIN_MARCA_ID } from "./candidatas-alta-datos";
import type { CandidataAlta, ResultadoParecidas } from "./parecidas-alta-tipos";
import { buscarEnHoja, ordenarParecidas } from "./parecidas-alta-reglas";
import {
  armarAlerta,
  armarAvisoNombre,
  marcarRevisada,
  marcarVariasRevisadas,
  quitarRevisada,
  type AlcanceHoja,
  type AlertaVista,
  type AvisoNombreVista,
  type BuscarEnHoja,
  type RotuloTiempo,
} from "./parecidas-alta-vista";

/**
 * Hoy la base rechaza «una letra de diferencia» (`nombre_casi_igual`) salvo que llegue `p_confirmo_distinto = true`. Mientras sea así, «Crear» espera
 * a que la persona responda «No, es otro diseño» a esa prenda. Pasa a `false` el día que la base deje de exigirlo (decisión de Felipe, fase posterior):
 * entonces «una letra» solo avisa y este archivo deja de frenar lo que la base ya deja pasar.
 */
export const CASI_IGUAL_FRENA_EN_BASE = true;

/** Cuánto espera la alerta tras dejar de teclear antes de redibujarse (maqueta aprobada). La base tiene su propia espera de 350 ms: dos relojes. */
export const PAUSA_ALERTA_MS = 600;

/** Los textos que solo dice este pegamento (los de la alerta y la hoja viven en `TEXTO`, de la vista). Sin jerga ni veredictos. */
export const TEXTO_ALTA = {
  noPudeComprobar: "No pude comprobar si ya existe un producto con este nombre. Puedes seguir: el sistema lo revisa otra vez al guardar.",
  identicoExiste: (nombre: string) => `“${nombre}” ya existe: ábrela o cámbiale el nombre para seguir.`,
  unaLetraEspera: (nombre: string) => `Se escribe casi igual que «${nombre}»: mírala en «Ver y comparar» y di si es otro diseño.`,
  /** Lo mismo cuando la pantalla nueva no puede mostrar esa prenda (la lectura cae o carga): no hay «Ver y comparar», manda la casilla de siempre. */
  unaLetraCasilla: (nombre: string) => `Se escribe casi igual que «${nombre}»: marca la casilla si es otro producto, o ábrelo en vez de crearlo otra vez.`,
  /** Un nombre que el sistema ya usa para otra cosa (el producto de «prenda sin registrar» de las ventas) y que la base no ve como «ya existe». */
  nombreReservado: (nombre: string) => `“${nombre}” es un nombre que ya usa el sistema en las ventas: ponle otro para seguir.`,
  /** La lectura de lo que ya existe falló, pero la base sí marcó algo que frena: no se promete «puedes seguir». */
  noPudeVerConAviso: "Mira el aviso bajo el nombre o prueba de nuevo.",
} as const;

/**
 * Nombres que el sistema se reservó para su propio uso. «Prenda sin Registrar» es el producto de las ventas de algo que no está en el catálogo: no
 * tiene categoría, así que `buscar_productos_parecidos` (que une con `categorias`) no lo ve, pero el índice único `productos_referencia_clave_unica`
 * sí lo cuenta: escribirlo dejaba «Crear» habilitado y la base lo rechazaba recién al final de los 4 pasos (hallazgo H1 del adversario, 2026-09-30).
 * Hasta que la base lo vea (fase posterior: `left join categorias`), la pantalla lo frena sola.
 */
export const NOMBRES_RESERVADOS: readonly string[] = ["Prenda sin Registrar"];

/** El nombre reservado que coincide con lo tecleado (mismo nombre para la base: sin tildes, mayúsculas, espacios ni puntuación), o `null`. */
export function nombreReservado(nombre: string): string | null {
  const clave = claveReferencia(nombre);
  if (clave === "") return null;
  return NOMBRES_RESERVADOS.find((r) => claveReferencia(r) === clave) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Marca: «Importado» y «sin marca» son lo mismo (D5)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Marcas que no dicen nada del diseño («Importado»): se tratan como sin marca y manda la categoría (D5). No hay constante en la base: se reconoce por nombre. */
const NOMBRES_COMODIN_DE_MARCA = ["importado"];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const claveDeNombre = (t: string) => sinTildes(t).trim().toLowerCase();

export type MarcaEfectiva = { id: string | null; nombre: string | null };
const SIN_MARCA: MarcaEfectiva = Object.freeze({ id: null, nombre: null });

/**
 * La marca que cuenta para comparar. Sin marca, con el uuid nulo, o con una marca comodín («Importado»), es `null` en las dos: la lista sale de la
 * categoría. Una marca con id pero sin nombre tampoco sirve (la alerta tendría que decir «de null»): se degrada a sin marca, que es lo seguro.
 */
export function marcaEfectiva(marcaId: string, marcaNombre: string): MarcaEfectiva {
  const id = marcaId.trim();
  const nombre = marcaNombre.trim();
  if (id === "" || id.toLowerCase() === MARCA_SIN_MARCA_ID) return SIN_MARCA;
  if (nombre === "" || NOMBRES_COMODIN_DE_MARCA.includes(claveDeNombre(nombre))) return SIN_MARCA;
  return { id, nombre };
}

/** Lo que dibuja la alerta: lo tecleado, tras la pausa. Vaciar el campo es inmediato (no hay nada que esperar); escribir, no. */
export function textoVigente(actual: string, estable: string): string {
  return actual.trim() === "" ? "" : estable;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ordenar (lo pesado; el hook lo memoriza)
// ---------------------------------------------------------------------------------------------------------------------------------

export type EntradaOrden = {
  candidatas: readonly CandidataAlta[];
  marcaId: string | null;
  /** El nombre de la marca (`null` = sin marca o comodín). */
  marca: string | null;
  categoriaId: string | null;
  /** El nombre de la categoría HOJA («Jeans»), no «Indumentaria › Jeans». */
  categoria: string | null;
  nombre: string;
  descripcion: string;
  tejido: string | null;
  patron: string | null;
  ahora: number;
};

/** Las reglas con lo que la persona lleva escrito. `todaLaMarca`: «Ver las de Jirish» (todas sus categorías, sin pesar la elegida). */
export function ordenarParaAlta(e: EntradaOrden, opciones: { todaLaMarca?: boolean } = {}): ResultadoParecidas {
  const todaLaMarca = Boolean(opciones.todaLaMarca && e.marcaId);
  return ordenarParecidas(
    {
      marcaId: e.marcaId,
      marca: e.marca,
      categoriaId: todaLaMarca ? null : e.categoriaId,
      categoria: todaLaMarca ? null : e.categoria,
      nombre: e.nombre,
      descripcion: e.descripcion,
      tejido: e.tejido,
      patron: e.patron,
      ahora: e.ahora,
    },
    e.candidatas,
  );
}

/** El filtro de la hoja: el de las reglas, con la forma que pide `HojaParecidas` (una sola referencia, para no rearmar la hoja en cada render). */
export const buscarParecidas: BuscarEnHoja = (lista, busqueda) => buscarEnHoja(lista, busqueda);

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que están diciendo la base y la lectura, juntas
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que entrega `useParecidos` (la comprobación de nombres de la base). */
export type BaseComprobada = {
  items: readonly Parecido[];
  fallo: boolean;
  comprobando: boolean;
  hayIdentico: boolean;
  hayUnaLetra: boolean;
  /** La casilla de siempre («Es otro producto distinto, créalo igual»): solo cuenta en el respaldo. */
  confirmo: boolean;
};

export type EntradaEstado = {
  /** Hay categoría elegida: sin ella la base no comprueba y no se lee nada. */
  activo: boolean;
  enLinea: boolean;
  base: BaseComprobada;
  /** La lectura de lo que ya existe está en curso. */
  cargando: boolean;
  /** La lectura falló o venció. */
  falloLectura: boolean;
  /** El orden de las reglas con el nombre de la pausa; `null` = no se calculó (sin categoría o sin red). */
  resultado: ResultadoParecidas | null;
  /** El nombre de la marca; `null` = sin marca o comodín. */
  marca: string | null;
  categoria: string | null;
  /** Lo que la alerta tiene por nombre (el de la pausa). */
  nombreVigente: string;
  /** Lo tecleado ya no es lo que la alerta dibuja: la pausa todavía corre. Nada de respaldo hasta que la alerta se ponga al día. */
  atrasada: boolean;
  /** Ids de las prendas a las que la persona dijo «No, es otro diseño». */
  revisadas: readonly string[];
  rotuloTiempo: RotuloTiempo;
};

export type SalidaEstado = {
  // ---- el candado (lo que lee el formulario, con los mismos nombres de `useParecidos`) ----
  /** La base marcó un idéntico: «Crear» no avanza y no hay respuesta que lo destrabe. */
  nombreBloqueado: boolean;
  /** La base marcó «una letra» y esto frena (`CASI_IGUAL_FRENA_EN_BASE`). */
  hayUnaLetra: boolean;
  /** Lo que viaja como `p_confirmo_distinto` y lo que levanta `nombreSinConfirmar`. */
  confirmo: boolean;
  // ---- lo que se dibuja ----
  alerta: AlertaVista | null;
  /** El aviso rojo bajo «Nombre»: SOLO el idéntico. */
  avisoNombre: AvisoNombreVista | null;
  /**
   * El aviso ámbar bajo «Nombre» cuando la base marcó «una letra de diferencia» y «Crear» espera la respuesta: sin él, el campo parece terminado y aun así
   * «Nombre» aparece en «Faltan:». `id` es la prenda a la que abre «Ver y comparar». `null` = no hay, o la casilla de siempre ya habla (`respaldo`).
   */
  avisoUnaLetra: { id: string; texto: string } | null;
  /** Lo que vuelve a la casilla de siempre porque la pantalla nueva no puede hablar de esas prendas. */
  respaldo: Parecido[];
  /** «No pude comprobar…»: la comprobación falló (el sistema la repite al guardar). */
  noSePudoComprobar: boolean;
  /** «Revisa: 2 parecidas»: el pie del paso 2. Nunca apaga «Seguir». */
  pieRevisa: string | null;
  /** La línea de «Avance» del paso 2; `null` = no hay nada por mirar y manda «Faltan: …». */
  resumenAvance: string | null;
  /** Por qué «Crear» espera, para el lector de pantalla; `null` = no espera por los nombres. */
  motivoBloqueo: string | null;
  /** Ids de «una letra» que la persona todavía no respondió (solo los que frenan). */
  pendientes: string[];
};

/**
 * Junta lo que dicen la base y la lectura. El candado es de la base; la alerta solo AVISA y ORDENA. Ver el contrato.
 */
export function armarParecidasDelAlta(e: EntradaEstado, frenaCasiIgual: boolean = CASI_IGUAL_FRENA_EN_BASE): SalidaEstado {
  const revisadas = new Set(e.revisadas);
  const alertaActiva = e.activo && e.enLinea;

  // ---- lo que dibuja la pantalla nueva ----
  const alerta = alertaActiva
    ? armarAlerta({
        resultado: e.resultado,
        marca: e.marca,
        categoria: e.categoria,
        nombre: e.nombreVigente,
        revisadas,
        cargando: e.cargando,
        fallo: e.falloLectura,
        rotuloTiempo: e.rotuloTiempo,
      })
    : null;
  const avisoNombre = alertaActiva
    ? armarAvisoNombre({ resultado: e.resultado, marca: e.marca, categoria: e.categoria, cargando: e.cargando, fallo: e.falloLectura })
    : null;

  // ¿Puede la pantalla nueva hablar de esta prenda? Con la lectura al día y la prenda en la lista con el nivel que la base le dio.
  const puedeHablarDe = (id: string, nivel: "identico" | "casi_igual"): boolean =>
    alertaActiva && !e.atrasada && !e.cargando && !e.falloLectura && Boolean(e.resultado?.lista.some((p) => p.candidata.id === id && p.nivel === nivel));

  // ---- el candado, prenda por prenda ----
  const nombreBloqueado = e.base.hayIdentico;
  const deUnaLetra = e.base.items.filter((p) => p.nivel === "una_letra");
  const hayUnaLetra = frenaCasiIgual && deUnaLetra.length > 0;
  const pendientes = hayUnaLetra ? deUnaLetra.filter((p) => !revisadas.has(p.id)) : [];
  // Sin tarjeta a la que responder: la casilla de siempre. Con la alerta atrasada todavía no se sabe: se espera (nada de parpadeos entre pantallas).
  const sinTarjeta = e.atrasada ? [] : pendientes.filter((p) => !puedeHablarDe(p.id, "casi_igual"));
  const conTarjeta = pendientes.filter((p) => !sinTarjeta.includes(p));
  // Con `frenaCasiIgual` apagado («una letra» solo avisa) la persona ya vio la alerta: lo que viaja como `p_confirmo_distinto` es «sí», porque la base
  // que todavía lo exija no debe rechazar al final lo que la pantalla dejó pasar. Con la bandera encendida, lo manda la respuesta de la persona.
  const confirmo = hayUnaLetra ? conTarjeta.length === 0 && (sinTarjeta.length === 0 || e.base.confirmo) : !frenaCasiIgual && deUnaLetra.length > 0 ? true : e.base.confirmo;

  // ---- el respaldo: lo que la base marcó y la pantalla nueva no puede decir ----
  const respaldo: Parecido[] = [];
  if (e.activo && !e.atrasada) {
    const identico = e.base.items.find((p) => p.nivel === "identico");
    if (identico && !(avisoNombre && puedeHablarDe(identico.id, "identico"))) respaldo.push(identico);
    respaldo.push(...sinTarjeta);
    // Con la lectura caída, lo parecido que la base ya había visto sigue a la vista (como hasta hoy).
    if (e.falloLectura) respaldo.push(...e.base.items.filter((p) => p.nivel === "parecido"));
  }

  // El aviso bajo «Nombre»: la primera «una letra» sin responder que la pantalla nueva sí puede mostrar (las demás van en la casilla de respaldo).
  const conCaraEnLaHoja = conTarjeta.find((p) => puedeHablarDe(p.id, "casi_igual"));
  // Con un idéntico, ese es el aviso: responder a «casi igual» no destraba nada mientras el nombre sea el mismo, y dos avisos a la vez confunden.
  const avisoUnaLetra = hayUnaLetra && !nombreBloqueado && conCaraEnLaHoja ? { id: conCaraEnLaHoja.id, texto: TEXTO_ALTA.unaLetraEspera(conCaraEnLaHoja.referencia) } : null;

  // ---- lo que se dice junto a «Crear» ----
  const identicoBase = e.base.items.find((p) => p.nivel === "identico");
  const motivoBloqueo = nombreBloqueado
    ? ((alerta?.tipo === "identico" ? alerta.motivoBloqueo : null) ?? (identicoBase ? TEXTO_ALTA.identicoExiste(identicoBase.referencia) : null))
    : hayUnaLetra && !confirmo && pendientes[0]
      ? // Sin tarjeta en la hoja no hay «Ver y comparar» que prometer: se manda a la casilla de siempre.
        (sinTarjeta.includes(pendientes[0]) ? TEXTO_ALTA.unaLetraCasilla : TEXTO_ALTA.unaLetraEspera)(pendientes[0].referencia)
      : null;

  // «Revisa» y «Avance» solo hablan de lo que hay por mirar: una alerta que ya se revisó o que no pide nada deja hablar a «Faltan: …».
  const porMirar = Boolean(alerta && (alerta.bloqueaCrear || alerta.pieRevisa));

  // Con la lectura caída la alerta dice «Puedes seguir», pero si la base marcó algo que frena eso no es cierto: se cambia por lo que sí se puede hacer.
  const frenaLaBase = nombreBloqueado || (hayUnaLetra && !confirmo);
  const alertaDicha = alerta && alerta.tipo === "fallo" && frenaLaBase ? { ...alerta, texto: TEXTO_ALTA.noPudeVerConAviso } : alerta;

  return {
    nombreBloqueado,
    hayUnaLetra,
    confirmo,
    alerta: alertaDicha,
    avisoNombre,
    avisoUnaLetra,
    respaldo,
    noSePudoComprobar: e.activo && e.base.fallo,
    pieRevisa: alerta?.pieRevisa ?? null,
    resumenAvance: porMirar ? (alerta?.resumenAvance ?? null) : null,
    motivoBloqueo,
    pendientes: pendientes.map((p) => p.id),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que la persona responde y abre (las respuestas son por id; solo `reiniciar` las borra)
// ---------------------------------------------------------------------------------------------------------------------------------

export type EstadoParecidas = {
  /** Ids de las prendas a las que la persona dijo «No, es otro diseño». */
  revisadas: string[];
  /** La hoja «Ver y comparar»: `null` = cerrada. `id` = abrir parada en esa prenda. */
  hoja: { alcance: AlcanceHoja; id: string | null } | null;
};

export const PARECIDAS_INICIAL: EstadoParecidas = Object.freeze({ revisadas: [], hoja: null }) as EstadoParecidas;

export type AccionParecidas =
  | { tipo: "abrir"; id?: string; alcance?: AlcanceHoja }
  | { tipo: "cerrar" }
  | { tipo: "revisada"; id: string; resultado: ResultadoParecidas | null }
  | { tipo: "deshacer"; id: string }
  | { tipo: "ninguna"; ids: readonly string[] }
  | { tipo: "reiniciar" };

/** El reductor de la hoja y de las respuestas. Devuelve el MISMO estado cuando nada cambia (React no vuelve a dibujar). */
export function reducirParecidas(s: EstadoParecidas, a: AccionParecidas): EstadoParecidas {
  switch (a.tipo) {
    case "abrir": {
      const hoja = { alcance: a.alcance ?? "lista", id: a.id ?? null } as const;
      return s.hoja && s.hoja.alcance === hoja.alcance && s.hoja.id === hoja.id ? s : { ...s, hoja };
    }
    case "cerrar":
      return s.hoja ? { ...s, hoja: null } : s;
    case "revisada": {
      // Un idéntico no se responde: decir «es otro diseño» con el mismo nombre no destraba nada (hay que cambiarlo).
      const nuevas = marcarRevisada(s.revisadas, a.id, a.resultado);
      return nuevas ? { ...s, revisadas: nuevas } : s;
    }
    case "deshacer": {
      const nuevas = quitarRevisada(s.revisadas, a.id);
      return nuevas ? { ...s, revisadas: nuevas } : s;
    }
    case "ninguna": {
      const nuevas = marcarVariasRevisadas(s.revisadas, a.ids);
      return nuevas.length === s.revisadas.length ? s : { ...s, revisadas: nuevas };
    }
    case "reiniciar":
      return s.revisadas.length === 0 && s.hoja === null ? s : PARECIDAS_INICIAL;
  }
}

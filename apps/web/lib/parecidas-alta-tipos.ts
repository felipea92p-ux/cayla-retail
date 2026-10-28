// «Prendas parecidas» en el alta de producto — el CONTRATO entre sus piezas (Fase 1, sin tocar producción).
//
// EL PROBLEMA. Dos sedes cargan la misma prenda con nombres distintos y el stock queda partido en dos fichas. Lo que
// se compara para decidir es el DISEÑO (Felipe, 2026-09-30: «Wide Leg» y «Wide Leg Corto Comfo» son prendas distintas), y el
// diseño es visual: por eso la persona decide mirando foto y stock, y el sistema solo AVISA y ORDENA. Nunca fusiona ni decide.
//
// QUIÉN HACE QUÉ (una pieza por archivo, todas contra estos tipos):
//   · lib/parecidas-alta-reglas.ts   PURO. Ordena candidatas y dice cuáles se parecen a lo tecleado. Sin React ni red.
//   · lib/candidatas-alta-datos.ts   PURO. Convierte lo que devuelven las lecturas de la base en `CandidataAlta`.
//   · lib/useCandidatasAlta.ts       CLIENTE. Lee de la base (3 lecturas que ya existen) y entrega `CandidataAlta[]`.
//   · components/alta-producto/…     PANTALLA. La alerta del resumen, la hoja «Ver y comparar» y la tira del celular.
//
// CONTRATO
//   PROMETE: los tipos que comparten las reglas, la lectura, el hook y la pantalla (`CandidataAlta`, `ParecidaAlta`, `ResultadoParecidas`…): una sola forma
//            de hablar de «una prenda que ya existe», con los niveles (`identico`, `casi_igual`, `parecida`, `contexto`) y los motivos de cada aviso.
//   ASUME:   que quien construye una `CandidataAlta` (`candidatas-alta-datos.ts`) ya descartó el precio y el costo: estos tipos no tienen dónde traerlos.
//   NO HACE: no calcula ni lee nada (solo declara tipos) y no decide nada: que una prenda sea «la misma» lo dice la persona mirando foto y stock.
//
// LO QUE ESTE MÓDULO NUNCA LLEVA: precio ni costo. `fn_productos` los devuelve por variante; el mapper los descarta desde la
// lectura (candado de dinero, ADR-0126): una cifra que no se guarda no se puede filtrar por un descuido de pantalla.

/** Cuánto hay disponible en una sede (sin apartadas, dañadas ni en camino: la misma cifra que Existencias, ADR-0270). */
export type SedeDisponible = { sede: string; disponible: number };

/** Una prenda que YA existe en el catálogo y con la que se podría estar repitiendo la que se está cargando. */
export type CandidataAlta = {
  id: string;
  referencia: string;
  categoriaId: string | null;
  categoria: string | null;
  /** `null` = la prenda no tiene marca (ADR-0283: la marca es opcional). */
  marcaId: string | null;
  marca: string | null;
  estado: "activo" | "descontinuado";
  /** Texto libre de la ficha. Aquí suele venir el código de la marca escrito a mano («SS25 311», «79-SS24»). */
  descripcion: string | null;
  tejido: string | null;
  patron: string | null;
  /** Nombre legible de la temporada («Verano»), sin año: la base no lo guarda. `null` = sin temporada propia. */
  temporada: string | null;
  /** ISO. Ordena y rotula («hace 6 min»); NUNCA filtra (Felipe: «hace poco» no es preciso). */
  creadoEn: string | null;
  /** Foto principal, o la general de la prenda si su color no tiene foto propia. `null` = «Sin foto todavía». */
  fotoUrl: string | null;
  colores: { nombre: string; hex: string }[];
  /** Ya en el orden de la curva (XS S M L…), sin repetir. */
  tallas: string[];
  /** `null` = no se pudo leer el stock (la tarjeta lo dice; no inventa ceros). */
  disponible: { total: number; porSede: SedeDisponible[] } | null;
  /** «Tienda TRU»: la sede donde se cargó, INFERIDA (no hay columna): sede actual de quien la propuso o sede de su primer
   *  movimiento. `null` = no se pudo saber: la tarjeta dice solo «hace X h». */
  cargadaEn: string | null;
};

/** Lo que la persona lleva escrito en el alta, para compararlo con las candidatas. */
export type ConsultaAlta = {
  marcaId: string | null;
  categoriaId: string | null;
  /**
   * El NOMBRE de la marca elegida («Krisstell»). Con él se quita la marca si la escribieron dentro del nombre del producto
   * («Krisstell Polo Evaluna»). Es parte de la consulta, no algo que se deduzca de las candidatas: así el puntaje de una
   * candidata no cambia según qué otras candidatas lleguen. Ausente o `null` = no se quita nada. Solo vale con `marcaId`.
   */
  marca?: string | null;
  /**
   * El NOMBRE de la categoría elegida («Pantalones»). Con él se sabe si es VECINA de la de una candidata («Pantalones» ~ «Jeans»: pesa
   * ×0,9 en vez de ×0,7). Ausente o `null` = se cuenta como categoría distinta (lo seguro). Solo vale con `categoriaId`.
   */
  categoria?: string | null;
  /** Lo tecleado en «Nombre». */
  nombre: string;
  descripcion: string;
  tejido: string | null;
  patron: string | null;
  /**
   * @deprecated La caja de búsqueda de la hoja la resuelve `buscarEnHoja` (parecidas-alta-reglas.ts) sobre la lista ya ordenada,
   * para que el contador «3 de 12» y los avisos se calculen sobre TODAS. Este campo ya no se lee; se borra cuando ningún llamador lo pase.
   */
  busqueda?: string;
  /**
   * Ahora, en milisegundos. Se INYECTA para que las pruebas sean deterministas. Solo entra en el DESEMPATE por fecha: una fecha más de 5
   * minutos en el futuro (reloj desfasado o dato corrupto) cuenta como «sin fecha» y no queda primera. Nunca cambia el nivel ni el puntaje.
   * Ausente = el desempate no mira el futuro.
   */
  ahora?: number;
};

/**
 * Qué tan fuerte es el aviso de una candidata.
 *  · `identico`   — misma clave de nombre (`claveReferencia`). FRENA «Crear»: la base tampoco lo deja pasar.
 *  · `casi_igual` — una letra de diferencia. La base todavía lo frena salvo que se confirme (`p_confirmo_distinto`), así que en la
 *                   Fase 1 «Crear» espera a que la persona responda «No, es otro diseño» en la hoja. Se quita en la fase posterior.
 *  · `parecida`   — el puntaje pasa el corte PROVISIONAL: alerta ámbar. Avisa y sube en la lista; nunca frena.
 *  · `contexto`   — solo comparte marca (y categoría): alerta informativa.
 */
export type NivelParecida = "identico" | "casi_igual" | "parecida" | "contexto";

/** Por qué aparece, para que la persona pueda DEDUCIRLO (Felipe: «entender y deducir»). Una sola cosa, la más fuerte. */
export type MotivoParecida =
  | "mismo_nombre"
  | "una_letra"
  | "mismo_modelo"
  | "nombre_parecido"
  | "coincide_codigo"
  | "misma_marca_y_categoria"
  | "misma_marca_otra_categoria"
  | "misma_categoria"
  | "otra_marca"
  /** Sin marca elegida y la candidata es de otra categoría: solo llega por tener un nombre que la base marcó. */
  | "otra_categoria";

export type ParecidaAlta = {
  candidata: CandidataAlta;
  nivel: NivelParecida;
  /** 0..1. Solo ORDENA: no es un porcentaje de probabilidad y no se muestra. */
  puntaje: number;
  motivo: MotivoParecida;
  /** La frase corta que se muestra: «Mismo modelo: Wide Leg Corto», «Coincide el código: SS25 311». */
  frase: string;
  /** El código de la marca leído del texto (nombre o descripción) de cada lado. Si coinciden, son los DOS que coincidieron (cada uno como lo
   *  escribió su lado); si no, el primero que se leyó de cada lado. Distintos NO significa «otro diseño» (una reedición cambia de código):
   *  solo se muestra, sin veredicto. */
  codigo: { suyo: string | null; deLaOtra: string | null; distintos: boolean };
};

/** Desde dónde se armó la lista: con marca, la marca acota; sin marca, la categoría (D5); sin ninguna, no hay lista. */
export type AmbitoParecidas = "marca" | "categoria" | "ninguno";

export type ResultadoParecidas = {
  /** Ya ordenada: primero lo que frena, luego lo que se parece, luego el resto; a igual fuerza, la más reciente y con stock. */
  lista: ParecidaAlta[];
  ambito: AmbitoParecidas;
  hayIdentico: boolean;
  hayCasiIgual: boolean;
  hayParecida: boolean;
};

/**
 * El corte del puntaje para pasar de `contexto` a `parecida` (alerta ámbar). PROVISIONAL: salió de un corpus sintético
 * (docs/investigacion/2026-09-29-duplicados-de-producto.md, secciones 4.2 y 5.3) y no se ha calibrado con altas reales. Se fija
 * con datos reales en una fase posterior. Por eso el alta NUNCA frena por debajo de `identico` / `casi_igual`.
 */
export const UMBRAL_PARECIDA_PROVISIONAL = 0.48;

/** La lectura de candidatas, inyectable: en pruebas y en la página de prueba se pasa una que devuelve datos de ejemplo. */
export type LectorCandidatas = (p: { marcaId: string | null; categoriaId: string | null; idsExtra: readonly string[]; senal: AbortSignal }) => Promise<CandidataAlta[]>;

export type ParametrosCandidatas = {
  marcaId: string | null;
  categoriaId: string | null;
  /** Ids que la comprobación de nombres de la base (`buscar_productos_parecidos`) marcó y que pueden no ser de esta marca. */
  idsExtra: readonly string[];
  /** Falso mientras no haya categoría elegida: no se lee nada. */
  activo: boolean;
  leer?: LectorCandidatas;
};

export type EstadoCandidatas = {
  candidatas: CandidataAlta[];
  cargando: boolean;
  /** La lectura falló o venció: la pantalla lo dice y la base vuelve a comprobar el nombre al crear (principio 9). */
  fallo: boolean;
  reintentar: () => void;
};

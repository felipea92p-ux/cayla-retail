// «Prendas parecidas» en el alta de producto — LA VISTA PURA: lo que se dibuja, ya decidido (Fase 1, sin tocar producción).
//
// EL PROBLEMA. Las reglas (`parecidas-alta-reglas.ts`) entregan una lista ordenada de prendas que se parecen a lo que la persona
// lleva escrito, con un nivel cada una. Pero de ahí a lo que se ve en pantalla hay decisiones: qué tono tiene la alerta, qué título y
// qué frase lleva, cuántas filas caben en el resumen, cuándo «Crear» espera, qué pasa cuando la persona dice «No, es otro diseño».
// Si esas decisiones viven dentro de los componentes, nadie las puede probar sin abrir el navegador; aquí viven en un solo lugar.
//
// CONTRATO. PROMETE: que cada texto que ve la persona —los de la maqueta aprobada por Felipe (docs/maquetas/producto-buscar-primero-2026-09/)—
//   sale de este archivo (`TEXTO` y `FRASE`; los componentes solo los dibujan), sin veredictos («es la misma», «son distintas», «mismo modelo»)
//   ni jerga («umbral», «duplicado», «coincidencia», «la base»), y que ninguna salida lleva precio ni costo (candado de dinero, ADR-0126: ni
//   la entrada tiene dónde traerlos). Que SOLO frena «Crear» el idéntico exacto (decisión 3 de Felipe): lo casi igual, lo parecido y lo
//   informativo avisan y ordenan, nunca frenan. ASUME: que `lista` viene ya ordenada por las reglas (primero lo que frena, luego lo que se
//   parece, luego el resto), que quien llama pasa `marca: null` cuando no hay marca o cuando es un comodín como «Importado» (D5), y que quien
//   integra manda `p_confirmo_distinto: true` al crear cuando `resultado.hayCasiIgual` (la base sigue rechazando «una letra» sin esa
//   confirmación, y la persona ya lo vio aquí). NO HACE: comparar nombres, leer códigos del texto, filtrar la búsqueda de la hoja ni
//   calcular «hace 21 h» (todo eso lo entregan otras piezas: las reglas, la lectura y `rotuloTiempo`, que se INYECTA).
//
// Sin React ni red. Probada sola (`parecidas-alta-vista.test.ts`).

import type { TonoChip } from "@/components/ui/Chip";
import type { AmbitoParecidas, CandidataAlta, ParecidaAlta, ResultadoParecidas, SedeDisponible } from "./parecidas-alta-tipos";
import { tramoDeCodigo } from "./parecidas-alta-reglas";
import { nombreCortoSede } from "./stock-por-sede";

// ---------------------------------------------------------------------------------------------------------------------------------
// Textos fijos (los de la maqueta, tal cual)
// ---------------------------------------------------------------------------------------------------------------------------------

export const TEXTO = {
  /** Bajo el título de la hoja. */
  bajadaHoja: "Compara el diseño con la prenda que tienes en la mano.",
  /** El placeholder del buscador de la hoja: es una INSTRUCCIÓN, no un ejemplo (ADR-0290). */
  buscadorHoja: "Busca por nombre o por el código de la etiqueta…",
  /** El mismo, más corto, para una pantalla angosta: a 16 px (el mínimo para que Safari no haga zoom al enfocar) el largo no cabe en 375 px. */
  buscadorHojaCorto: "Nombre o código de la etiqueta…",
  /** Pie de la hoja y de cada tarjeta: lo honesto de la Fase 1. */
  noSeGuarda: "Lo que llenaste aquí no se guarda.",
  /** Lo que se dice junto a un enlace que SACA a la persona del formulario (la alerta y el aviso bajo Nombre): antes de tocar, no después. */
  noSeGuardaSiAbres: "Si la abres, lo que llenaste aquí no se guarda.",
  ningunaEsMiPrenda: "Ninguna es mi prenda",
  esElMismoDiseno: "Es el mismo diseño",
  noEsOtroDiseno: "No, es otro diseño",
  deshacer: "Deshacer",
  verYComparar: "Ver y comparar",
  verDeNuevo: "Ver de nuevo",
  reintentar: "Reintentar",
  sinFoto: "Sin foto todavía",
  descontinuada: "Descontinuada",
  disponibles: "Disponibles:",
  /** La frase honesta bajo los botones de una tarjeta: a dónde lleva «Es el mismo diseño» y qué NO hace. */
  fraseMismoDiseno: "Te lleva a esa prenda: ahí le sumas tallas y colores. Las unidades se registran en Recibir. Lo que llenaste aquí no se guarda.",
  /** Una descontinuada no se reactiva sola: la ficha ofrece «Estado» (ProductoForm) y la persona lo cambia ahí. */
  fraseMismoDisenoDescontinuada:
    "Te lleva a su ficha. Para volver a usarla, cambia ahí «Estado» a «Activo» y guarda: no se activa sola. Lo que llenaste aquí no se guarda.",
  /** Sin veredicto: no dice «es nueva» (lo que no aparece aquí puede ser la misma prenda con OTRO nombre). */
  hojaSinResultados: "No encontré ninguna con esa palabra. Prueba con otra o con el código de la etiqueta.",
  hojaVacia: "No hay prendas para mostrar.",
  noPudeVer: "No pude ver lo que ya hay",
  puedesSeguir: "Puedes seguir: el sistema revisa el nombre otra vez al guardar.",
  /** El aviso de la hoja cuando la lectura falló (principio 9: se dice, no se inventa «todo bien»). */
  avisoFalloHoja: "No pude ver lo que ya hay. Puedes seguir: el sistema revisa el nombre otra vez al guardar.",
  sinStock: "Sin stock en ninguna sede",
  stockNoLeido: "No pude leer el stock",
  consejoDeLasEtiquetas: "Mira la etiqueta de tu prenda: ¿cuál dice?",
  /** Lo casi igual AVISA, no frena (decisión 3 de Felipe): solo manda a mirar el diseño. */
  soloConLetraDeDiferencia:
    "Se escribe con una letra de diferencia. Compara su foto, sus colores y sus tallas con la prenda que tienes en la mano.",
  comparaFotoColoresTallas: "Compara su foto, sus colores y sus tallas con la prenda que tienes en la mano.",
  /** Las dos salidas, dichas con el mismo peso: el sistema no empuja a unir prendas (decisión 1 de Felipe). */
  sugerenciaSiEsLaTuya: "Si la tuya es una de ellas, ábrela y súmale tallas o colores. Si no, sigue.",
  sugerenciaSiEsLaTuyaSola: "Si la tuya es esa, ábrela y súmale tallas o colores. Si no, sigue.",
  sinMarca: "Sin marca no puedo reducir la lista",
  subtextoNombreOtroDiseno: "Si es otro diseño, ponle un nombre que lo distinga: el largo, el corte, el detalle.",
  subtextoNombreMismoDiseno:
    "Si es el mismo diseño, ábrela desde «Ver y comparar». Si es otro diseño, ponle un nombre que lo distinga: el largo, el corte, el detalle.",
  /** `title` de la sede en «Cargada en Tienda TRU…»: no hay columna, se infiere. */
  tituloCargada: "La sede es la actual de quien la cargó. Si no se puede saber, solo se dice cuándo.",
  tituloDisponibles: "Disponibles: lo que se puede vender hoy, sin apartadas, dañadas ni en camino",
  /** El nombre accesible del buscador de la hoja (el placeholder es una pista, no una etiqueta). */
  buscadorAria: "Buscar entre las prendas",
  /** El nombre accesible del «Ver» del pie del paso 2 («Revisa: 2 parecidas · Ver»): en celular hay otro «Ver» en la barra de la ficha, con otro sentido. */
  verParecidasAria: "Ver las prendas parecidas",
} as const;

/** Los textos que llevan un dato adentro (nombre, cantidad, campo). Mismas reglas que `TEXTO`: aquí se dicen, los componentes no los escriben. */
export const FRASE = {
  /** «y 2 más», al lado de la acción de la alerta. */
  yMas: (n: number) => `y ${n} más`,
  /** Lo que lee un lector de pantalla al llegar a una mini fila: el nombre y lo que dice su segunda línea, no solo «Wide Leg». */
  filaAria: (nombre: string, detalle: string) => `${nombre}${detalle ? `, ${detalle}` : ""}: abrir la comparación`,
  /** El nombre accesible del «Deshacer» de una prenda ya marcada: con dos o más marcadas, «Deshacer» a secas no dice cuál. */
  deshacerAria: (nombre: string) => `Deshacer: ${nombre}`,
  fotoAlt: (nombre: string) => `Foto de ${nombre}`,
  esElMismoAria: (nombre: string) => `${TEXTO.esElMismoDiseno} que ${nombre}`,
  noEsOtroAria: (nombre: string) => `No, ${nombre} es otro diseño`,
  coincideEn: (campo: string) => `Coincide en ${campo}: `,
} as const;

/** Un espacio que no se parte: el código de la etiqueta («SS25 311») y «hace 22 h» no se deshacen entre dos renglones. */
const DURO = "\u00A0";

/** Si `trozo` (un código) lleva espacios y aparece en `texto`, lo devuelve con espacios duros. Sin el trozo, `texto` tal cual. */
function pegarEspacios(texto: string, trozo: string | null): string {
  if (!trozo || !/\s/.test(trozo) || !texto.includes(trozo)) return texto;
  return texto.split(trozo).join(trozo.replace(/\s+/g, DURO));
}

/** «hace 22 h» con la unidad pegada a su número: una «h» sola en el renglón de abajo no se lee. */
function pegarUnidad(tiempo: string): string {
  return tiempo.replace(/(\d+) (\S+)$/, `$1${DURO}$2`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Tipos de lo que se dibuja
// ---------------------------------------------------------------------------------------------------------------------------------

/** El tono de la alerta, en palabras del negocio. `informativa` = pizarra, `ambar` = se parece, `roja` = frena, `neutra` = sin cifra o sin lista. */
export type TonoAlerta = "informativa" | "ambar" | "roja" | "neutra";

/** Qué es lo que dice la alerta. Cambia de `tipo` (o de `clave`) → la alerta hace su único pulso de entrada. */
export type TipoAlerta =
  | "cargando"
  | "fallo"
  | "identico"
  | "casi_igual"
  | "parecida"
  | "lista_de_marca"
  | "sin_marca"
  | "vacia"
  | "revisadas";

/** La acción que ofrece una alerta (y su tira del celular). `estilo`: «Ver y comparar» es un botón; «Ver de nuevo» o «Reintentar», un enlace. */
export type AccionAlerta =
  | { tipo: "comparar"; etiqueta: string; estilo: "boton" | "enlace"; /** Abre la hoja parada en esta prenda. */ id?: string }
  | { tipo: "ver_lista"; etiqueta: string; estilo: "boton" | "enlace" }
  | { tipo: "ver_marca"; etiqueta: string; estilo: "boton" | "enlace" }
  | { tipo: "ver_ficha"; etiqueta: string; estilo: "boton" | "enlace"; id: string; href: string }
  | { tipo: "reintentar"; etiqueta: string; estilo: "boton" | "enlace" };

/** Una mini fila del resumen: miniatura, nombre y «Disp. 2 · hace 21 h». Tocarla abre la hoja en esa prenda. */
export type FilaAlerta = {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  detalle: string;
  descontinuada: boolean;
  /** La que más se parece a lo tecleado: la fila se resalta. */
  destacada: boolean;
};

/** Un trozo de un texto: `codigo` = se dibuja en monoespaciado y negrita (SS25 311), `negrita` = énfasis. */
export type ParteTexto = { texto: string; codigo?: boolean; negrita?: boolean };

export type TiraVista = {
  texto: string;
  /** «Ver» o «Reintentar». */
  etiqueta: string;
  /** Lleva el triángulo de aviso (ámbar y rojo). */
  conAviso: boolean;
  /** «Crear» espera por esto (solo el idéntico): la tira lo dice además con el peso de la letra, no solo con el color. */
  frena: boolean;
  accion: AccionAlerta;
};

export type AlertaVista = {
  tipo: TipoAlerta;
  /** Cambia cuando cambia lo que la alerta dice (nivel, prenda principal, marca): es lo que dispara el pulso. No se muestra. */
  clave: string;
  tono: TonoAlerta;
  /** «chip» (un chip con el título) o «linea» (una línea gris, sin chip: «No hay prendas de Krisstell en Blazers todavía.»). */
  formaTitulo: "chip" | "linea";
  titulo: string;
  texto?: string;
  /** El mismo `texto`, en trozos, para dibujar los códigos en monoespaciado. Solo cuando hay códigos. */
  textoPartes?: ParteTexto[];
  /** El esqueleto parcial de la tarjeta mientras la base responde (no el loader de pantalla completa). */
  esqueleto: boolean;
  /** Máximo 2: la tercera y las siguientes solo viven en la hoja. */
  filas: FilaAlerta[];
  /** Cuántas más hay que no caben en `filas` («y 1 más»). */
  masFilas: number;
  accion: AccionAlerta | null;
  /** «Crear» espera. SOLO el idéntico exacto (decisión 3 de Felipe): la base tampoco lo deja pasar. Lo casi igual, lo parecido y lo informativo avisan. */
  bloqueaCrear: boolean;
  /** Por qué espera, para el pie del paso y el `title` del botón; `null` si no frena. */
  motivoBloqueo: string | null;
  /** La línea de la lista «Avance» del resumen: «Hay 2 parecidas: míralas». `null` = no hay línea propia. */
  resumenAvance: string | null;
  /** El pie del paso: «Revisa: 2 parecidas». `null` = no hay nada que revisar. */
  pieRevisa: string | null;
  /** La tira del celular y de la tablet. `null` = no hay nada que avisar. */
  tira: TiraVista | null;
};

/** El tono de un `<Chip>` para cada tono de alerta (la alerta pinta su título con un chip). */
export function tonoChipDeAlerta(t: TonoAlerta): TonoChip {
  return t === "informativa" ? "pizarra" : t === "ambar" ? "ambar" : t === "roja" ? "rojo" : "neutro";
}

export type RotuloTiempo = (iso: string) => string;

export type EntradaAlerta = {
  resultado: ResultadoParecidas | null;
  /** El nombre de la marca elegida; `null` = sin marca o comodín («Importado»). */
  marca: string | null;
  categoria: string | null;
  /** Lo tecleado en «Nombre»: solo sirve para saber si ya escribió algo (sin marca, la lista de la categoría se ofrece entonces). */
  nombre: string;
  /** Ids de las prendas a las que la persona dijo «No, es otro diseño». */
  revisadas: ReadonlySet<string> | readonly string[];
  cargando: boolean;
  fallo: boolean;
  rotuloTiempo: RotuloTiempo;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------------------------------------------

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const igual = (a: string | null, b: string | null) => a !== null && b !== null && sinTildes(a).trim().toLowerCase() === sinTildes(b).trim().toLowerCase();
const comoConjunto = (r: ReadonlySet<string> | readonly string[]): ReadonlySet<string> => (r instanceof Set ? r : new Set(r as readonly string[]));
const normCodigo = (t: string) => sinTildes(t).toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A dónde lleva «Es el mismo diseño» (ADR-0260: la ficha del existente, donde ya están «Agregar tallas» y «Agregar colores»). */
export function hrefProducto(id: string): string {
  return `/productos/${id}/editar`;
}

/** «Tienda TRU 2 · AQP 0…» → «TRU 2 · AQP 0 · LIM 0 · Taller 0». Lista vacía = sin stock en ninguna sede; `null` = no se pudo leer. */
export function textoDisponible(porSede: readonly SedeDisponible[] | null): string {
  if (porSede === null) return TEXTO.stockNoLeido;
  if (porSede.length === 0) return TEXTO.sinStock;
  return porSede.map((s) => `${nombreCortoSede(s.sede)} ${s.disponible}`).join(" · ");
}

/** Lo mismo, en trozos, para dibujar la cifra en negrita y los ceros apagados. */
export function sedesDisponibles(porSede: readonly SedeDisponible[]): { sede: string; cantidad: number }[] {
  return porSede.map((s) => ({ sede: nombreCortoSede(s.sede), cantidad: s.disponible }));
}

/** Dónde está la prenda respecto de la lista que se está armando. */
type Clase = "bloque" | "otra_categoria" | "fuera";

function clasificar(c: CandidataAlta, ambito: AmbitoParecidas, marca: string | null, categoria: string | null): Clase {
  const catIgual = categoria === null ? true : igual(c.categoria, categoria);
  if (ambito === "categoria") return catIgual ? "bloque" : "fuera";
  const marcaIgual = marca === null ? true : igual(c.marca, marca);
  if (marcaIgual && catIgual) return "bloque";
  if (marcaIgual) return "otra_categoria";
  return "fuera";
}

const esDeOtraMarca = (c: CandidataAlta, marca: string | null) => marca !== null && c.marca !== null && !igual(c.marca, marca);

/** Lo que tiene tarjeta en la hoja: lo de la lista (marca + categoría) y lo «casi igual» de donde sea, porque pide una respuesta. */
function tarjetasBase(r: ResultadoParecidas, marca: string | null, categoria: string | null): ParecidaAlta[] {
  return r.lista.filter((p) => clasificar(p.candidata, r.ambito, marca, categoria) === "bloque" || p.nivel === "casi_igual");
}

/** Las dos primeras palabras de código distinto entre las filas que se ven: «SS25 311» y «79-SS24». Distinto NO es «otro diseño»: solo se muestra. */
function codigosDistintosEntre(filas: readonly ParecidaAlta[]): [string, string] | null {
  const codigos = filas.map((p) => p.codigo.deLaOtra).filter((c): c is string => !!c);
  for (let i = 0; i < codigos.length; i++) {
    for (let j = i + 1; j < codigos.length; j++) {
      if (normCodigo(codigos[i]) !== normCodigo(codigos[j])) return [codigos[i], codigos[j]];
    }
  }
  return null;
}

/**
 * «Las dos tienen códigos distintos (SS25 311 y 79-SS24). Mira la etiqueta de tu prenda: ¿cuál dice?» — sin veredicto (un código distinto no dice «otro
 * diseño»). `de` es de cuántas prendas se sacó el par: con exactamente dos, «Las dos»; con más, «Dos de ellas» (sin un «ellas» que no sabe a quién se refiere).
 */
export function textoCodigosDistintos(a: string, b: string, de: number = 2): { texto: string; partes: ParteTexto[] } {
  const partes: ParteTexto[] = [
    { texto: `${de === 2 ? "Las dos" : "Dos de ellas"} tienen códigos distintos (` },
    { texto: a, codigo: true },
    { texto: " y " },
    { texto: b, codigo: true },
    { texto: `). ${TEXTO.consejoDeLasEtiquetas}` },
  ];
  return { texto: partes.map((p) => p.texto).join(""), partes };
}

function aFila(p: ParecidaAlta, destacada: boolean, rotulo: RotuloTiempo): FilaAlerta {
  const c = p.candidata;
  const disp = c.disponible ? `Disp. ${c.disponible.total}` : "Stock sin leer";
  const cuando = c.creadoEn ? pegarUnidad(rotulo(c.creadoEn)) : "";
  return {
    id: c.id,
    nombre: c.referencia,
    fotoUrl: c.fotoUrl,
    detalle: [disp, cuando].filter(Boolean).join(" · "),
    descontinuada: c.estado === "descontinuado",
    destacada,
  };
}

/** Sin marca y sin nombre escrito no hay nada que comparar; con marca sí (aunque no haya escrito nada). */
function hayQueBuscar(e: Pick<EntradaAlerta, "marca" | "categoria" | "nombre">): boolean {
  return !!e.marca || (!!e.categoria && e.nombre.trim().length > 0);
}

const enCategoria = (categoria: string | null) => (categoria ? ` en ${categoria}` : "");

// ---------------------------------------------------------------------------------------------------------------------------------
// LA ALERTA del resumen (y su tira)
// ---------------------------------------------------------------------------------------------------------------------------------

const BASE_ALERTA = {
  esqueleto: false,
  filas: [] as FilaAlerta[],
  masFilas: 0,
  accion: null,
  bloqueaCrear: false,
  motivoBloqueo: null,
  resumenAvance: null,
  pieRevisa: null,
  tira: null,
} as const;

/**
 * Convierte lo que entregan las reglas en la alerta que se dibuja en el resumen. `null` = no hay nada que avisar (sin marca y sin
 * nombre escrito, o sin lista). El orden de las preguntas es el de la maqueta: cargando → falló → idéntico → casi igual → sin marca →
 * lista vacía → todas revisadas → se parece → informativa. Solo el idéntico frena «Crear».
 */
export function armarAlerta(e: EntradaAlerta): AlertaVista | null {
  const { marca, categoria, rotuloTiempo } = e;
  const buscando = hayQueBuscar(e);

  // 1. La base está respondiendo: esqueleto parcial. Crear NO espera (la base vuelve a comprobar el nombre al guardar).
  if (e.cargando) {
    if (!buscando) return null;
    return {
      ...BASE_ALERTA,
      tipo: "cargando",
      clave: "cargando",
      tono: "neutra",
      formaTitulo: "linea",
      titulo: `Buscando lo que ya hay${marca ? ` de ${marca}` : ""}${enCategoria(categoria)}…`,
      esqueleto: true,
    };
  }

  // 2. La lectura falló: se dice, no se inventa «todo bien» (principio 9).
  if (e.fallo) {
    if (!buscando) return null;
    const accion: AccionAlerta = { tipo: "reintentar", etiqueta: TEXTO.reintentar, estilo: "enlace" };
    return {
      ...BASE_ALERTA,
      tipo: "fallo",
      clave: "fallo",
      tono: "neutra",
      formaTitulo: "chip",
      titulo: TEXTO.noPudeVer,
      texto: TEXTO.puedesSeguir,
      accion,
      tira: { texto: TEXTO.noPudeVer, etiqueta: TEXTO.reintentar, conAviso: false, frena: false, accion },
    };
  }

  const r = e.resultado;
  if (!r || r.ambito === "ninguno") return null;
  if (r.ambito === "categoria" && e.nombre.trim().length === 0) return null;

  const revisadas = comoConjunto(e.revisadas);
  const base = tarjetasBase(r, marca, categoria);
  const nBloque = base.filter((p) => clasificar(p.candidata, r.ambito, marca, categoria) === "bloque").length;

  // 3. El idéntico: frena siempre (la base tampoco lo deja pasar). Si es de otra marca o de otra categoría no tiene tarjeta en la hoja: lleva a su ficha,
  //    y entonces la alerta dice ANTES de tocar que lo llenado aquí no se guarda.
  const identico = r.lista.find((p) => p.nivel === "identico");
  if (identico) {
    const c = identico.candidata;
    const otraMarca = esDeOtraMarca(c, marca);
    const enLaHoja = base.some((p) => p.candidata.id === c.id);
    const accion: AccionAlerta = enLaHoja
      ? { tipo: "comparar", etiqueta: TEXTO.verYComparar, estilo: "boton", id: c.id }
      : { tipo: "ver_ficha", etiqueta: `Ver ${c.referencia}${otraMarca ? ` de ${c.marca}` : ""}`, estilo: "boton", id: c.id, href: hrefProducto(c.id) };
    const como = otraMarca
      ? "Hoy el sistema no acepta el mismo nombre en dos marcas: agrégale el modelo o la marca."
      : "Un nombre identifica a una sola prenda: ábrela o cámbiale el nombre.";
    return {
      ...BASE_ALERTA,
      tipo: "identico",
      clave: `roja|${c.id}`,
      tono: "roja",
      formaTitulo: "chip",
      titulo: `Ya existe «${c.referencia}»${otraMarca ? ` en ${c.marca}` : ""}`,
      texto: enLaHoja ? como : `${como} ${TEXTO.noSeGuardaSiAbres}`,
      filas: [aFila(identico, true, rotuloTiempo)],
      accion,
      bloqueaCrear: true,
      // Con otra marca, «ábrela» no es el camino que la persona busca (su prenda es de OTRA marca): se le dice qué cambiar.
      motivoBloqueo: otraMarca
        ? `“${c.referencia}” ya existe en ${c.marca}: agrégale el modelo o la marca para seguir.`
        : `“${c.referencia}” ya existe: ábrela o cámbiale el nombre para seguir.`,
      resumenAvance: "Ese nombre ya existe: no se puede crear igual.",
      tira: { texto: `«${c.referencia}» ya existe`, etiqueta: "Ver", conAviso: true, frena: true, accion },
    };
  }

  // 4. Casi igual (una letra de diferencia) sin responder: AVISA, no frena (decisión 3 de Felipe: «solo frena el idéntico exacto»). La base todavía
  //    rechaza «una letra» si no llega `p_confirmo_distinto`; quien integra lo manda (la persona ya vio la alerta), así que no hay un error a
  //    último momento. «No, es otro diseño» solo la baja a lo que ya no hay que mirar.
  const casiIgual = base.filter((p) => p.nivel === "casi_igual" && !revisadas.has(p.candidata.id));
  if (casiIgual.length > 0) {
    const top = casiIgual[0];
    const pendientes = base.filter((p) => !revisadas.has(p.candidata.id));
    const filasBase = [top, ...pendientes.filter((p) => p !== top)];
    const accion: AccionAlerta = { tipo: "comparar", etiqueta: TEXTO.verYComparar, estilo: "boton" };
    return {
      ...BASE_ALERTA,
      tipo: "casi_igual",
      clave: `casi|${top.candidata.id}`,
      tono: "ambar",
      formaTitulo: "chip",
      titulo: `Se escribe casi igual que «${top.candidata.referencia}»`,
      texto: TEXTO.soloConLetraDeDiferencia,
      filas: filasBase.slice(0, 2).map((p) => aFila(p, p === top, rotuloTiempo)),
      masFilas: Math.max(0, filasBase.length - 2),
      accion,
      resumenAvance: "Se escribe casi igual: míralo",
      pieRevisa: `Revisa: ${plural(pendientes.length, "parecida", "parecidas")}`,
      tira: { texto: plural(casiIgual.length, "prenda casi igual", "prendas casi iguales"), etiqueta: "Ver", conAviso: true, frena: false, accion },
    };
  }

  // 5. Sin marca: la lista de la categoría es larga y no se puede afinar. Se ofrece verla, sin juzgar.
  if (r.ambito === "categoria") {
    const accion: AccionAlerta | null =
      nBloque > 0 && categoria ? { tipo: "ver_lista", etiqueta: `Ver las de ${categoria}`, estilo: "boton" } : null;
    return {
      ...BASE_ALERTA,
      tipo: "sin_marca",
      clave: `sinmarca|${categoria ?? ""}`,
      tono: "neutra",
      formaTitulo: "chip",
      titulo: TEXTO.sinMarca,
      texto:
        nBloque > 0
          ? `Hay ${plural(nBloque, "prenda", "prendas")} de ${categoria ?? "esa categoría"}. ${TEXTO.sugerenciaSiEsLaTuya}`
          : `No hay prendas de ${categoria ?? "esa categoría"} todavía.`,
      accion,
      tira: accion ? { texto: TEXTO.sinMarca, etiqueta: "Ver", conAviso: false, frena: false, accion } : null,
    };
  }

  // 6. Con marca pero sin prendas en esa categoría. No tranquiliza («esta sería la primera» se quitó): solo dice lo que hay.
  if (nBloque === 0) {
    const deLaMarca = r.lista.filter((p) => clasificar(p.candidata, r.ambito, marca, categoria) === "otra_categoria");
    return {
      ...BASE_ALERTA,
      tipo: "vacia",
      clave: `vacia|${marca ?? ""}|${categoria ?? ""}`,
      tono: "neutra",
      formaTitulo: "linea",
      titulo: `No hay prendas de ${marca ?? "esa marca"}${enCategoria(categoria)} todavía.`,
      accion: deLaMarca.length > 0 && marca ? { tipo: "ver_marca", etiqueta: `Ver las de ${marca}`, estilo: "enlace" } : null,
    };
  }

  // 7. Todas revisadas («No, es otro diseño»): la alerta baja a neutra y deja volver a mirar.
  const pendientes = base.filter((p) => !revisadas.has(p.candidata.id));
  if (pendientes.length === 0) {
    return {
      ...BASE_ALERTA,
      tipo: "revisadas",
      clave: `rev|${marca ?? ""}|${categoria ?? ""}`,
      tono: "neutra",
      formaTitulo: "chip",
      titulo: `Revisaste ${plural(nBloque, "parecida", "parecidas")} ✓`,
      accion: { tipo: "ver_lista", etiqueta: TEXTO.verDeNuevo, estilo: "enlace" },
      resumenAvance: `Revisaste ${plural(nBloque, "parecida", "parecidas")} ✓`,
    };
  }

  const restantes = pendientes.length;
  const muchas = restantes > 8;
  const resumenAvance = muchas ? `Hay ${restantes} prendas de ${marca}: búscala` : `Hay ${restantes} ${restantes === 1 ? "parecida: mírala" : "parecidas: míralas"}`;
  const pieRevisa = `Revisa: ${plural(restantes, "parecida", "parecidas")}`;
  const accion: AccionAlerta = { tipo: "comparar", etiqueta: TEXTO.verYComparar, estilo: "boton" };

  // 8. Lo tecleado se parece a una prenda: ámbar, y esa prenda va primero y resaltada.
  const parecidas = pendientes.filter((p) => p.nivel === "parecida");
  if (parecidas.length > 0) {
    const top = parecidas[0];
    const orden = [top, ...pendientes.filter((p) => p !== top)];
    const filas = orden.slice(0, 2);
    const cd = codigosDistintosEntre(filas);
    const textoCodigos = cd ? textoCodigosDistintos(cd[0], cd[1], filas.length) : null;
    return {
      ...BASE_ALERTA,
      tipo: "parecida",
      clave: `ambar|${top.candidata.id}`,
      tono: "ambar",
      formaTitulo: "chip",
      titulo: `Se parece a «${top.candidata.referencia}»`,
      texto: textoCodigos ? textoCodigos.texto : TEXTO.comparaFotoColoresTallas,
      ...(textoCodigos ? { textoPartes: textoCodigos.partes } : {}),
      filas: filas.map((p) => aFila(p, p === top, rotuloTiempo)),
      masFilas: Math.max(0, orden.length - 2),
      accion,
      resumenAvance,
      pieRevisa,
      // La misma cuenta que «Revisa: N parecidas», «Hay N parecidas» y la hoja: en celular la tira y el pie se ven a la vez.
      tira: { texto: plural(restantes, "prenda parecida", "prendas parecidas"), etiqueta: "Ver", conAviso: true, frena: false, accion },
    };
  }

  // 9. Solo se eligió la marca: informativa. Lo que ya hay de esa marca en esa categoría, sin juzgar.
  const revisadasN = nBloque - restantes;
  const titulo = `Ya hay ${plural(nBloque, "prenda", "prendas")} de ${marca}${enCategoria(categoria)}`;
  return {
    ...BASE_ALERTA,
    tipo: "lista_de_marca",
    clave: `info|${marca ?? ""}|${categoria ?? ""}`,
    tono: "informativa",
    formaTitulo: "chip",
    titulo,
    texto: `${nBloque === 1 ? TEXTO.sugerenciaSiEsLaTuyaSola : TEXTO.sugerenciaSiEsLaTuya}${revisadasN > 0 ? ` Revisaste ${revisadasN} de ${nBloque}.` : ""}`,
    filas: pendientes.slice(0, 2).map((p) => aFila(p, false, rotuloTiempo)),
    masFilas: Math.max(0, pendientes.length - 2),
    accion,
    resumenAvance,
    pieRevisa,
    tira: { texto: titulo, etiqueta: "Ver", conAviso: false, frena: false, accion },
  };
}

/**
 * Lo que lee en voz alta un lector de pantalla cuando la alerta cambia: el título y la frase, sin las filas ni los botones. Vacío si no hay alerta.
 * Con `avisoEnLinea` (quien integra muestra un aviso bajo el campo Nombre —el rojo del idéntico, que se anuncia solo con `role="alert"`, o el ámbar del
 * «casi igual», con `role="status"`—), ese mismo nivel no se repite aquí: no se dice dos veces lo mismo.
 */
export function textoAnuncio(a: AlertaVista | null, opciones: { avisoEnLinea?: boolean } = {}): string {
  if (!a) return "";
  if ((a.tipo === "identico" || a.tipo === "casi_igual") && opciones.avisoEnLinea) return "";
  const titulo = a.titulo.trim();
  if (!a.texto) return titulo;
  return `${titulo}${/[.…?!)]$/.test(titulo) ? " " : ". "}${a.texto}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// EL AVISO EN LÍNEA bajo el campo Nombre (el rojo que frena debe verse junto al campo donde se produce)
// ---------------------------------------------------------------------------------------------------------------------------------

export type AvisoNombreVista = {
  /** El párrafo, en trozos (los nombres van en negrita). */
  partes: ParteTexto[];
  texto: string;
  /** La segunda línea gris bajo el enlace; `null` = no hay. */
  subtexto: string | null;
  accion: AccionAlerta;
};

/**
 * El aviso rojo que va DEBAJO del campo Nombre cuando hay un idéntico (y solo entonces). Lo dibuja quien integra con `AvisoInline`
 * (`tono="rojo" alerta`). Con el mismo nombre en otra marca dice qué hacer para distinguirla; con el mismo nombre en la lista, abre
 * «Ver y comparar». Mientras la base responde o si la lectura falló, no dice nada (no se puede saber).
 */
export function armarAvisoNombre(e: Omit<EntradaAlerta, "rotuloTiempo" | "nombre" | "revisadas">): AvisoNombreVista | null {
  if (e.cargando || e.fallo || !e.resultado) return null;
  const r = e.resultado;
  const identico = r.lista.find((p) => p.nivel === "identico");
  if (!identico) return null;
  const c = identico.candidata;
  const otraMarca = esDeOtraMarca(c, e.marca);
  const enLaHoja = tarjetasBase(r, e.marca, e.categoria).some((p) => p.candidata.id === c.id);

  if (otraMarca) {
    const partes: ParteTexto[] = [
      { texto: "Ese nombre ya existe en " },
      { texto: c.marca ?? "", negrita: true },
      { texto: `. Agrégale el modelo o la marca para distinguirla (ej.: ${e.marca} ${c.referencia}).` },
    ];
    return {
      partes,
      texto: partes.map((p) => p.texto).join(""),
      // El enlace saca a la persona del formulario: se le dice antes de que lo toque.
      subtexto: TEXTO.noSeGuardaSiAbres,
      accion: { tipo: "ver_ficha", etiqueta: `Ver ${c.referencia} de ${c.marca}`, estilo: "enlace", id: c.id, href: hrefProducto(c.id) },
    };
  }
  const partes: ParteTexto[] = [
    { texto: "Ya existe " },
    { texto: c.referencia, negrita: true },
    { texto: `${c.marca ? ` en ${c.marca}` : ""}. Un nombre identifica a una sola prenda.` },
  ];
  return {
    partes,
    texto: partes.map((p) => p.texto).join(""),
    subtexto: enLaHoja ? TEXTO.subtextoNombreMismoDiseno : `${TEXTO.subtextoNombreOtroDiseno} ${TEXTO.noSeGuardaSiAbres}`,
    accion: enLaHoja
      ? { tipo: "comparar", etiqueta: TEXTO.verYComparar, estilo: "enlace", id: c.id }
      : { tipo: "ver_ficha", etiqueta: `Ver ${c.referencia}`, estilo: "enlace", id: c.id, href: hrefProducto(c.id) },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// LA TARJETA de la hoja «Ver y comparar»
// ---------------------------------------------------------------------------------------------------------------------------------

/** En qué campo coincidió un texto buscado: «Coincide en descripción: …». El campo va en español, tal como se muestra. */
export type CoincidenciaBusqueda = { campo: string; texto: string };

export type EvidenciaVista = { texto: string; tono: TonoChip };

export type TarjetaVista = {
  id: string;
  nombre: string;
  href: string;
  /** «Jirish · Jeans» (o «Sin marca · Jeans»). */
  marcaCategoria: string;
  fotoUrl: string | null;
  /** El chip de QUÉ vio el sistema, nunca un veredicto. `null` = sin evidencia (solo comparte marca y categoría). */
  evidencia: EvidenciaVista | null;
  descontinuada: boolean;
  /** El código leído del texto, como chip. `titulo`: de dónde se leyó. */
  codigo: { texto: string; titulo: string } | null;
  /** La descripción SIN el código (para que no salga dos veces). */
  descripcion: string | null;
  descripcionCompleta: string | null;
  /** Tejido, patrón y temporada: chips pequeños. No separan ni puntúan (pista débil por decisión de Felipe). */
  chips: string[];
  /** Lo mismo, por campo, para la tarjeta en filas con título (Tela · Temporada): `null` si no lo tiene. */
  tejido: string | null;
  patron: string | null;
  temporada: string | null;
  colores: { nombre: string; hex: string }[];
  /** Hasta 4 cápsulas; el resto se cuenta. `varios`: el color no tiene hex (Estampado, Multicolor, Animal print): la cápsula se dibuja en rueda de tonos, no vacía. */
  coloresVisibles: { nombre: string; hex: string; varios: boolean }[];
  masColores: number;
  textoColores: string;
  tallas: string | null;
  /** Las tallas una por una («S», «M», «Estándar»), para dibujarlas en su cuadrito. */
  listaTallas: string[];
  /** «TRU 2 · AQP 0 · LIM 0 · Taller 0», o la frase de «sin stock» / «no pude leer». */
  disponible: string;
  /** Las sedes, en trozos, para la cifra en negrita; `null` si no hay lectura o está vacía. */
  disponibleSedes: { sede: string; cantidad: number }[] | null;
  /** «Cargada en Tienda TRU hace 21 h», o «Cargada hace 21 h»; `null` si no se sabe ni cuándo. */
  cargada: string | null;
  /** Mismo nombre que lo tecleado: «No, es otro diseño» no destraba nada (hay que cambiar el nombre). */
  exacto: boolean;
  /** Es una «casi igual» (una letra de diferencia): la tarjeta lo dice con su chip ámbar. Ya no frena «Crear» (solo frena el idéntico). */
  casiIgual: boolean;
  /** Se ofrece «No, es otro diseño» (todas menos la exacta). */
  puedeDescartar: boolean;
  frase: string;
  coincide: CoincidenciaBusqueda | null;
  /** La tarjeta plegada tras «No, es otro diseño»: «Marcaste «Wide Leg» como otro diseño.» */
  textoRevisada: string;
};

export type EntradaTarjeta = {
  parecida: ParecidaAlta;
  rotuloTiempo: RotuloTiempo;
  /** El código que la persona tecleó en el buscador de la hoja (leído como código), o `null`. */
  codigoBuscado?: string | null;
  /** ¿Esta prenda lleva el código buscado en su nombre o su descripción? */
  llevaCodigo?: boolean;
  coincidencia?: CoincidenciaBusqueda | null;
};

/**
 * El chip de evidencia según el motivo: dice QUÉ vio el sistema, nunca si es la misma prenda («Mismo…» solo con el nombre exacto; README de la maqueta).
 * Las frases de las reglas («Mismo modelo: …») son de quien ordena, no de quien mira: aquí cada motivo tiene su palabra de tienda. Los motivos que
 * solo dicen «misma marca / misma categoría» no llevan chip: ya se leen en «marca · categoría».
 */
function evidenciaDe(p: ParecidaAlta, codigoBuscado: string | null, lleva: boolean): EvidenciaVista | null {
  if (p.nivel === "identico" || p.motivo === "mismo_nombre") return { texto: p.frase || "Mismo nombre", tono: "tinta" };
  if (codigoBuscado && lleva) return { texto: pegarEspacios(`Coincide el código: ${codigoBuscado}`, codigoBuscado), tono: "verde" };
  switch (p.motivo) {
    case "una_letra":
      return { texto: p.frase || "Casi igual: una letra de diferencia", tono: "ambar" };
    case "coincide_codigo":
      return { texto: pegarEspacios(p.frase || "Coincide el código", p.codigo.deLaOtra), tono: "verde" };
    case "mismo_modelo":
      return { texto: "Nombre parecido", tono: "pizarra" };
    case "nombre_parecido":
      return { texto: "Algo parecido", tono: "neutro" };
    default:
      break;
  }
  if (codigoBuscado && p.codigo.deLaOtra) return { texto: "Otro código", tono: "pizarra" };
  return null;
}

/**
 * La descripción sin el código leído de ella («wide leg corto - SS25 311 - C» → «wide leg corto - C»). Quita el tramo TAL COMO lo escribieron
 * (con su «Ref.» si lo trae, con guion o pegado: «SS25-311», «Ref. 311») y deja un solo separador donde estaba. Si el código no está en la
 * descripción, no toca nada.
 */
export function descripcionSinCodigo(descripcion: string | null, codigo: string | null): string | null {
  if (!descripcion) return null;
  if (!codigo) return descripcion;
  const tramo = tramoDeCodigo(descripcion, codigo);
  if (!tramo) return descripcion;
  const limpia = `${descripcion.slice(0, tramo.desde)} ${descripcion.slice(tramo.hasta)}`
    .replace(/(\s*[-|]\s*){2,}/g, " - ")
    .replace(/^[\s\-|]+|[\s\-|]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return limpia || null;
}

/** Convierte una prenda parecida en todo lo que dice su tarjeta de la hoja. */
export function armarTarjeta(e: EntradaTarjeta): TarjetaVista {
  const p = e.parecida;
  const c = p.candidata;
  const codigoBuscado = e.codigoBuscado ?? null;
  const exacto = p.nivel === "identico";
  const descontinuada = c.estado === "descontinuado";

  const codigoTexto = p.codigo.deLaOtra;
  const enDescripcion = !!codigoTexto && !!c.descripcion && descripcionSinCodigo(c.descripcion, codigoTexto) !== c.descripcion;
  const visibles = c.colores.slice(0, 4);
  const mas = c.colores.length - visibles.length;
  const cuando = c.creadoEn ? pegarUnidad(e.rotuloTiempo(c.creadoEn)) : "";
  const donde = c.cargadaEn ? (/^taller/i.test(c.cargadaEn) ? `en el ${c.cargadaEn}` : `en ${c.cargadaEn}`) : "";
  const cargada = [donde ? "Cargada" : cuando ? "Cargada" : "", donde, cuando].filter(Boolean).join(" ");

  return {
    id: c.id,
    nombre: c.referencia,
    href: hrefProducto(c.id),
    marcaCategoria: [c.marca ?? "Sin marca", c.categoria].filter(Boolean).join(" · "),
    fotoUrl: c.fotoUrl,
    evidencia: evidenciaDe(p, codigoBuscado, !!e.llevaCodigo),
    descontinuada,
    codigo: codigoTexto ? { texto: codigoTexto, titulo: enDescripcion ? "Leído de la descripción" : "Leído del nombre" } : null,
    descripcion: enDescripcion ? descripcionSinCodigo(c.descripcion, codigoTexto) : c.descripcion,
    descripcionCompleta: c.descripcion,
    chips: [c.tejido, c.patron, c.temporada].filter((t): t is string => !!t),
    tejido: c.tejido ?? null,
    patron: c.patron ?? null,
    temporada: c.temporada ?? null,
    colores: c.colores,
    coloresVisibles: visibles.map((x) => ({ ...x, varios: !x.hex })),
    masColores: mas,
    textoColores: `${visibles.map((x) => x.nombre).join(" · ")}${mas > 0 ? ` +${mas}` : ""}`,
    tallas: c.tallas.length > 0 ? `Tallas: ${c.tallas.join(" · ")}` : null,
    listaTallas: [...c.tallas],
    disponible: textoDisponible(c.disponible ? c.disponible.porSede : null),
    disponibleSedes: c.disponible && c.disponible.porSede.length > 0 ? sedesDisponibles(c.disponible.porSede) : null,
    cargada: cargada || null,
    exacto,
    casiIgual: p.nivel === "casi_igual",
    puedeDescartar: !exacto,
    frase: descontinuada ? TEXTO.fraseMismoDisenoDescontinuada : TEXTO.fraseMismoDiseno,
    coincide: e.coincidencia ?? null,
    textoRevisada: `Marcaste ${c.referencia} como otro diseño.`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// LA HOJA «Ver y comparar»
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que devuelve el filtro de la hoja: las que quedan (en su orden), y qué se leyó. Lo entrega quien integra (las reglas); aquí solo se lee. */
export type ResultadoBusquedaHoja = {
  lista: ParecidaAlta[];
  /** La búsqueda se leyó como un CÓDIGO (un texto con dígitos y 3+ caracteres): solo ordena y rotula, no oculta nada. */
  codigo: string | null;
  /** Ids de las que llevan el código buscado en su nombre o su descripción. */
  llevanCodigo: readonly string[];
  /** Por id: en qué campo coincidió un TEXTO buscado («Coincide en descripción: …»). */
  coincideEn: Readonly<Record<string, CoincidenciaBusqueda>>;
};

/** El filtro de la hoja, inyectable: sin tildes ni mayúsculas, todas las palabras. Con búsqueda vacía no se llama. */
export type BuscarEnHoja = (lista: readonly ParecidaAlta[], busqueda: string) => ResultadoBusquedaHoja;

/** Qué lista abre la hoja: la de marca + categoría, o «Ver las de Krisstell» (toda la marca, en todas sus categorías). */
export type AlcanceHoja = "lista" | "marca";

export type AvisoHoja = {
  /** «gris»: una línea informativa sin acción; «neutro»: el cuadro gris con borde. */
  forma: "gris" | "neutro";
  texto: string;
  partes?: ParteTexto[];
  /** Solo la línea de «otra categoría» lleva acción (la de otras marcas no: «wide leg» es una silueta, no un modelo). */
  accion?: { tipo: "ver_marca"; etiqueta: string };
};

export type EntradaHoja = {
  resultado: ResultadoParecidas;
  marca: string | null;
  categoria: string | null;
  alcance: AlcanceHoja;
  revisadas: ReadonlySet<string> | readonly string[];
  busqueda: string;
  buscar: BuscarEnHoja;
  rotuloTiempo: RotuloTiempo;
  fallo: boolean;
};

export type HojaVista = {
  titulo: string;
  bajada: string;
  placeholder: string;
  /** El mismo buscador para una pantalla angosta (a 16 px el largo no cabe en 375 px). */
  placeholderCorto: string;
  /** «2 prendas» o «3 resultados de 12». */
  cuenta: string;
  avisos: AvisoHoja[];
  tarjetas: TarjetaVista[];
  /** Lo que se dice cuando no hay tarjetas. */
  vacio: string | null;
  pie: { nota: string; boton: string };
  /** Los ids que «Ninguna es mi prenda» marca como otro diseño (nunca la idéntica; con «Ver las de la marca», ninguna). */
  idsNinguna: string[];
  /** El texto buscado que se resalta en los nombres (no cuando es un código). */
  resaltar: string;
};

/** El título de la hoja según de dónde viene la lista. */
export function tituloHoja(ambito: AmbitoParecidas, alcance: AlcanceHoja, marca: string | null, categoria: string | null): string {
  if (alcance === "marca" && marca) return `Prendas de ${marca}`;
  if (ambito === "marca" && marca) return `Prendas parecidas de ${marca}${enCategoria(categoria)}`;
  return categoria ? `Prendas de ${categoria}` : "Prendas parecidas";
}

export function armarHoja(e: EntradaHoja): HojaVista {
  const r = e.resultado;
  const revisadas = comoConjunto(e.revisadas);
  const base =
    e.alcance === "marca"
      ? r.lista.filter((p) => igual(p.candidata.marca, e.marca))
      : tarjetasBase(r, e.marca, e.categoria);

  const q = e.busqueda.trim();
  const busqueda: ResultadoBusquedaHoja = q
    ? e.buscar(base, q)
    : { lista: [...base], codigo: null, llevanCodigo: [], coincideEn: {} };
  const llevan = new Set(busqueda.llevanCodigo);

  const tarjetas = busqueda.lista.map((p) =>
    armarTarjeta({
      parecida: p,
      rotuloTiempo: e.rotuloTiempo,
      codigoBuscado: busqueda.codigo,
      llevaCodigo: llevan.has(p.candidata.id),
      coincidencia: busqueda.coincideEn[p.candidata.id] ?? null,
    }),
  );

  const avisos: AvisoHoja[] = [];
  if (e.fallo) avisos.push({ forma: "neutro", texto: TEXTO.avisoFalloHoja });
  if (busqueda.codigo) {
    const n = llevan.size;
    avisos.push(
      n > 0
        ? {
            forma: "gris",
            texto: `${n === 1 ? "1 prenda lleva" : `${n} prendas llevan`} ${busqueda.codigo} en el nombre o la descripción. Las demás siguen abajo: el código es una pista, no una prueba.`,
            partes: [
              { texto: `${n === 1 ? "1 prenda lleva" : `${n} prendas llevan`} ` },
              { texto: busqueda.codigo, codigo: true },
              { texto: " en el nombre o la descripción. Las demás siguen abajo: el código es una pista, no una prueba." },
            ],
          }
        : {
            forma: "neutro",
            texto: `Ninguna lleva ${busqueda.codigo} en el nombre ni en la descripción. El código es una pista, no una prueba: mira el diseño igual.`,
            partes: [
              { texto: "Ninguna lleva " },
              { texto: busqueda.codigo, negrita: true },
              { texto: " en el nombre ni en la descripción. El código es una pista, no una prueba: mira el diseño igual." },
            ],
          },
    );
  } else {
    const cd = codigosDistintosEntre(base);
    if (cd) {
      const t = textoCodigosDistintos(cd[0], cd[1], base.length);
      avisos.push({ forma: "neutro", texto: t.texto, partes: t.partes });
    }
    if (e.alcance === "lista") {
      // Lo que solo informa: algo parecido en OTRA marca (sin acción) y lo mismo de esta marca en OTRA categoría (con «Ver las de …»).
      // Una prenda de OTRA marca llega a esta lista solo porque la comprobación de la base la marcó (la lectura trae lo de la marca y lo que la base marcó), y
      // las reglas la dejan en «contexto» (la marca distinta pesa ×0,4: nunca sube de ahí). Por eso se cuentan «parecida» y «contexto»: pedir solo «parecida»
      // dejaba esta línea —la del ejemplo aprobado, «Hay una «Adelle Wide Leg» de Pilar.»— sin forma de aparecer. El idéntico y el «casi igual» tienen su camino.
      const otras = r.lista.filter(
        (p) => clasificar(p.candidata, r.ambito, e.marca, e.categoria) === "fuera" && (p.nivel === "parecida" || p.nivel === "contexto") && r.ambito === "marca" && esDeOtraMarca(p.candidata, e.marca),
      );
      if (otras.length === 1) {
        avisos.push({ forma: "gris", texto: `Hay una «${otras[0].candidata.referencia}» de ${otras[0].candidata.marca ?? "otra marca"}.` });
      } else if (otras.length > 1) {
        const dos = otras.slice(0, 2).map((p) => `«${p.candidata.referencia}» (${p.candidata.marca ?? "otra marca"})`);
        avisos.push({ forma: "gris", texto: `Hay ${otras.length} de otras marcas: ${dos.join(" y ")}${otras.length > 2 ? ` y ${otras.length - 2} más` : ""}.` });
      }
      const enOtra = r.lista.filter((p) => clasificar(p.candidata, r.ambito, e.marca, e.categoria) === "otra_categoria" && p.nivel === "parecida");
      if (enOtra.length > 0 && e.marca) {
        const x = enOtra[0].candidata;
        avisos.push({
          forma: "gris",
          texto: `${x.referencia} también está en ${x.categoria ?? "otra categoría"}, de ${e.marca}.`,
          accion: { tipo: "ver_marca", etiqueta: `Ver las de ${e.marca}` },
        });
      }
    }
  }

  const cuenta =
    tarjetas.length === base.length ? plural(base.length, "prenda", "prendas") : `${plural(tarjetas.length, "resultado", "resultados")} de ${base.length}`;

  return {
    titulo: tituloHoja(r.ambito, e.alcance, e.marca, e.categoria),
    bajada: TEXTO.bajadaHoja,
    placeholder: TEXTO.buscadorHoja,
    placeholderCorto: TEXTO.buscadorHojaCorto,
    cuenta,
    avisos,
    tarjetas,
    vacio: tarjetas.length > 0 ? null : q ? TEXTO.hojaSinResultados : e.fallo ? null : TEXTO.hojaVacia,
    pie: { nota: TEXTO.noSeGuarda, boton: TEXTO.ningunaEsMiPrenda },
    // Solo lo que la persona VE: con una búsqueda de texto activa, «Ninguna es mi prenda» no marca las que la búsqueda ocultó (una «casi igual» que
    // frena «Crear» quedaría respondida sin haberla mirado). Con búsqueda de código la lista sigue completa: el código solo ordena.
    idsNinguna: e.alcance === "marca" ? [] : busqueda.lista.filter((p) => p.nivel !== "identico" && !revisadas.has(p.candidata.id)).map((p) => p.candidata.id),
    resaltar: busqueda.codigo ? "" : q,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// «No, es otro diseño» → revisadas
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Marca una prenda como «otro diseño». Devuelve un arreglo NUEVO (el estado vive en quien integra) y no repite ids. `null` para no cambiar
 * nada cuando ya estaba marcada. La idéntica no se marca: con el mismo nombre, decir «es otro diseño» no destraba nada (hay que cambiar el nombre).
 */
export function marcarRevisada(revisadas: readonly string[], id: string, r: ResultadoParecidas | null): string[] | null {
  if (revisadas.includes(id)) return null;
  const p = r?.lista.find((x) => x.candidata.id === id);
  if (p && p.nivel === "identico") return null;
  return [...revisadas, id];
}

/** Deshace la marca. Devuelve un arreglo nuevo, o `null` si no estaba. */
export function quitarRevisada(revisadas: readonly string[], id: string): string[] | null {
  return revisadas.includes(id) ? revisadas.filter((x) => x !== id) : null;
}

/** «Ninguna es mi prenda»: suma varias marcas de una vez (sin repetir ni perder las que ya había). */
export function marcarVariasRevisadas(revisadas: readonly string[], ids: readonly string[]): string[] {
  return [...new Set([...revisadas, ...ids])];
}

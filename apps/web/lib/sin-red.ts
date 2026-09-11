/**
 * Las piezas puras de "estoy contando sin internet".
 *
 * Viven acá, fuera del componente, por lo de siempre: lo que se puede probar sin montar un
 * árbol de React se prueba sin montarlo. `ConteoPanel` pone los efectos y el `navigator`,
 * que son los que no se pueden probar así.
 *
 * Ver ADR-0032. El resumen: el service worker sirve la ÚLTIMA versión de la pantalla que se
 * cargó con internet, así que sin red se sigue contando contra un catálogo con fecha. Eso no
 * es un defecto — un censo es justamente contra una foto fija — pero **la fecha hay que
 * decirla**. Un sistema que muestra datos viejos sin avisar es peor que uno que se cae.
 */

/** Cuánto puede tener la foto antes de que valga la pena nombrarlo en la pantalla. */
const UMBRAL_RECIENTE_MS = 90_000;

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * "hace 2 horas", en el idioma en que lo diría alguien en el mostrador.
 *
 * Devuelve `null` cuando la foto es tan reciente que decir la antigüedad solo agregaría
 * ruido: nadie necesita leer "hace 40 segundos" mientras cuenta.
 *
 * Redondea hacia abajo a propósito. Si pasaron 119 minutos, "hace 1 hora" subestima y
 * "hace 2 horas" exagera; entre las dos, la que se queda corta es la que no genera una
 * falsa alarma sobre un dato que probablemente sigue bien.
 */
export function describirAntiguedad(generadoEn: string | Date, ahora: number = Date.now()): string | null {
  const t = generadoEn instanceof Date ? generadoEn.getTime() : Date.parse(generadoEn);
  if (!Number.isFinite(t)) return null;

  const ms = ahora - t;
  // Un reloj del equipo adelantado respecto del servidor da negativo. No es un error del
  // que la Encargada pueda hacer nada, y "hace -3 minutos" no se lo dice a nadie.
  if (ms < UMBRAL_RECIENTE_MS) return null;

  if (ms < HORA) {
    const min = Math.floor(ms / MINUTO);
    return `hace ${min} ${min === 1 ? "minuto" : "minutos"}`;
  }
  if (ms < DIA) {
    const hs = Math.floor(ms / HORA);
    return `hace ${hs} ${hs === 1 ? "hora" : "horas"}`;
  }
  const dias = Math.floor(ms / DIA);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * El aviso completo de la pantalla, según los tres datos que lo cambian.
 *
 * Está acá y no dentro del JSX para poder fijar por prueba lo que la Encargada lee — que es
 * lo único de todo esto que ella ve. Devuelve `null` cuando no hay nada que avisar: con
 * internet y sin cola pendiente, la pantalla no habla de la red.
 */
export function avisoDeRed(opciones: {
  enLinea: boolean;
  /**
   * El service worker sirvió esta pantalla desde la caché. Es el dato DURO, y por eso pesa
   * igual que `enLinea`: `navigator.onLine` dice si hay una interfaz de red levantada, no si
   * el servidor contesta. Un wifi de tienda conectado a un router sin salida devuelve `true`
   * —comprobado apagando el servidor con la máquina en red— y sin esta señal la pantalla
   * mostraría el catálogo de ayer sin decir una palabra.
   */
  desdeCache: boolean;
  pendientes: number;
  generadoEn: string | Date;
  ahora?: number;
}): { tono: "sin-red" | "pendiente"; titulo: string; detalle: string } | null {
  const { enLinea, desdeCache, pendientes, generadoEn, ahora = Date.now() } = opciones;
  const antiguedad = describirAntiguedad(generadoEn, ahora);

  if (!enLinea || desdeCache) {
    const foto = antiguedad
      ? `Estás contando contra el catálogo de ${antiguedad}.`
      : "Estás contando contra el catálogo que se cargó recién.";
    return {
      tono: "sin-red",
      // Cuando el equipo tiene wifi pero el servidor no contesta, decir "sin internet" es
      // falso y manda a revisar el router de la tienda, que está bien. Se nombra lo que la
      // Encargada puede comprobar: la pantalla no se está actualizando.
      titulo: enLinea ? "Sin conexión con el sistema — seguí contando" : "Sin internet — seguí contando",
      detalle:
        pendientes === 1
          ? `${foto} La prenda que contaste está guardada en este equipo y sube sola cuando vuelva la red. No cierres esta pestaña.`
          : pendientes > 1
            ? `${foto} Las ${pendientes} prendas que contaste están guardadas en este equipo y suben solas cuando vuelva la red. No cierres esta pestaña.`
            : `${foto} Lo que escanees se guarda en este equipo y sube solo cuando vuelva la red. No cierres esta pestaña.`,
    };
  }

  if (pendientes > 0) {
    return {
      tono: "pendiente",
      titulo: `${pendientes} ${pendientes === 1 ? "prenda contada" : "prendas contadas"} sin guardar`,
      detalle: "El internet falló mientras las contabas. No se perdió nada — se están subiendo.",
    };
  }

  return null;
}

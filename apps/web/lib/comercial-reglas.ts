// Reglas del panel comercial (ADR-0110). La ÚNICA casa de "qué significan" los números que
// devuelven `fn_comercial_sedes`, `fn_comercial_horas` y `fn_comercial_colaboradoras`: el SQL suma
// lo vendido; acá se decide qué es "bajo su ritmo", cómo se proyecta el mes y en qué orden se
// muestran las tiendas. Puro TypeScript, sin base de datos: se prueba sin Docker.
//
// LA DECISIÓN QUE MÁS IMPORTA: EL SEMÁFORO NO MIRA LO VENDIDO HOY.
// A las 11 am cualquier tienda lleva una fracción de su meta diaria, así que comparar "hoy" contra
// la meta pondría en alerta a todas las tiendas cada mañana — y una alerta que salta siempre se
// deja de mirar. El semáforo compara el RITMO DEL MES hasta el CIERRE DE AYER (días completos)
// contra lo que la meta diaria prometía para esos días. Lo de hoy se muestra como dato, sin juicio.
//
// SIMPLIFICACIONES DECLARADAS (se dicen en voz alta en la pantalla, no se esconden):
//   · La meta es UNA cifra por día (`ubicaciones.meta_venta_diaria`). Un sábado vale como un martes.
//   · La proyección del mes es lineal: promedio diario de los días cerrados × días del mes. No sabe
//     de fines de semana ni de campañas. Es una brújula, no una predicción.
//   · Los umbrales (85% / 100%) son provisionales: se calibran con Felipe cuando haya meses reales.

/** Por debajo de este ritmo (fracción de lo prometido) la tienda está "bajo su ritmo". */
export const UMBRAL_BAJO_META = 0.85;
/** Desde este ritmo la tienda va "sobre su ritmo". Entre los dos umbrales: "en ruta". */
export const UMBRAL_SOBRE_META = 1;

export type EstadoMeta = "sin_meta" | "sin_dias_cerrados" | "bajo" | "en_ruta" | "sobre";

/** Todo lo que el SQL devuelve por tienda, ya en camelCase y como número. */
export type NumerosSede = {
  metaVentaDiaria: number | null;
  ventasHoy: number;
  ticketsHoy: number;
  unidadesHoy: number;
  devueltoHoy: number;
  ventasSemana: number;
  ticketsSemana: number;
  unidadesSemana: number;
  devueltoSemana: number;
  ventasMes: number;
  ticketsMes: number;
  unidadesMes: number;
  devueltoMes: number;
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** `YYYY-MM-DD` → partes. Se parsea a mano: `new Date("2026-09-18")` es UTC y correría el día. */
function partesFecha(fecha: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return { anio, mes, dia };
}

export function diaDelMes(fecha: string): number {
  return partesFecha(fecha).dia;
}

/** Días del mes de esa fecha (febrero de un año bisiesto = 29). */
export function diasDelMes(fecha: string): number {
  const { anio, mes } = partesFecha(fecha);
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Hora (0-23) en Lima de un instante. `hourCycle: "h23"` porque con `hour12: false` algunos motores
 * devuelven "24" a medianoche. Vive acá para que la hora que se resalta en el gráfico y la hora en
 * que el SQL agrupó las ventas hablen de la MISMA zona (Vercel corre en UTC, cinco horas distinta).
 */
export function horaLima(ahora: Date = new Date()): number {
  const texto = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", hourCycle: "h23" }).format(ahora);
  return Number(texto);
}

export type RitmoMes = {
  estado: EstadoMeta;
  /** Fracción de lo prometido por la meta, al cierre de ayer. 0,92 = va al 92%. Null si no aplica. */
  ritmo: number | null;
  /** Ventas del mes proyectadas al cierre, lineal sobre los días cerrados. Null si no hay días cerrados. */
  proyeccion: number | null;
  /** Días completos del mes ya cerrados (hoy no cuenta). */
  diasCerrados: number;
};

/**
 * Ritmo del mes al cierre de AYER. `ventasMes` incluye hoy, así que se le resta `ventasHoy`.
 * El día 1 de cada mes no hay ningún día cerrado: no se inventa un ritmo, se dice "sin días cerrados".
 */
export function ritmoDelMes(datos: {
  ventasMes: number;
  ventasHoy: number;
  metaVentaDiaria: number | null;
  fecha: string;
}): RitmoMes {
  const diasCerrados = diaDelMes(datos.fecha) - 1;
  const meta = datos.metaVentaDiaria;
  const tieneMeta = meta !== null && meta > 0;

  if (diasCerrados < 1) {
    return { estado: tieneMeta ? "sin_dias_cerrados" : "sin_meta", ritmo: null, proyeccion: null, diasCerrados: 0 };
  }

  const vendidoCerrado = Math.max(0, redondear2(datos.ventasMes - datos.ventasHoy));
  const proyeccion = redondear2((vendidoCerrado / diasCerrados) * diasDelMes(datos.fecha));

  if (!tieneMeta) return { estado: "sin_meta", ritmo: null, proyeccion, diasCerrados };

  const ritmo = vendidoCerrado / (meta * diasCerrados);
  const estado: EstadoMeta = ritmo < UMBRAL_BAJO_META ? "bajo" : ritmo < UMBRAL_SOBRE_META ? "en_ruta" : "sobre";
  return { estado, ritmo, proyeccion, diasCerrados };
}

/** Lo vendido hoy como fracción de la meta del día. Solo informativo: NO alimenta el semáforo. */
export function avanceDeHoy(ventasHoy: number, metaVentaDiaria: number | null): number | null {
  if (metaVentaDiaria === null || metaVentaDiaria <= 0) return null;
  return ventasHoy / metaVentaDiaria;
}

export function ticketPromedio(ventas: number, tickets: number): number | null {
  return tickets > 0 ? ventas / tickets : null;
}

export function unidadesPorTicket(unidades: number, tickets: number): number | null {
  return tickets > 0 ? unidades / tickets : null;
}

/** Cuánto del precio de lista se descontó. Null si no hubo nada vendido (evita 0/0). */
export function descuentoPct(bruto: number, descuento: number): number | null {
  return bruto > 0 ? descuento / bruto : null;
}

const ORDEN_ESTADO: Record<EstadoMeta, number> = { bajo: 0, en_ruta: 1, sobre: 2, sin_dias_cerrados: 3, sin_meta: 4 };

/**
 * Excepciones primero (patrón del resto de la app): las tiendas bajo su ritmo arriba, la más atrasada
 * antes; las que van bien, después; las que no tienen meta o días cerrados, al final por ventas del mes.
 */
export function ordenarPorExcepcion<T extends { ritmo: RitmoMes; ventasMes: number }>(filas: readonly T[]): T[] {
  return [...filas].sort((a, b) => {
    const porEstado = ORDEN_ESTADO[a.ritmo.estado] - ORDEN_ESTADO[b.ritmo.estado];
    if (porEstado !== 0) return porEstado;
    if (a.ritmo.ritmo !== null && b.ritmo.ritmo !== null) return a.ritmo.ritmo - b.ritmo.ritmo;
    return b.ventasMes - a.ventasMes;
  });
}

/**
 * Suma de las tiendas. La meta consolidada se calcula SOLO sobre las tiendas que tienen meta: sumar
 * la venta de una tienda sin meta contra la meta de otras inflaría el ritmo sin que nadie lo note.
 * `tiendasConMeta`/`tiendas` deja decirlo en la pantalla ("ritmo de 2 de 3 tiendas").
 */
export function consolidar(
  sedes: readonly NumerosSede[],
  fecha: string
): NumerosSede & { ritmo: RitmoMes; tiendas: number; tiendasConMeta: number } {
  const suma = (f: (s: NumerosSede) => number) => redondear2(sedes.reduce((acc, s) => acc + f(s), 0));
  const conMeta = sedes.filter((s) => s.metaVentaDiaria !== null && s.metaVentaDiaria > 0);
  const metaTotal = conMeta.reduce((acc, s) => acc + (s.metaVentaDiaria ?? 0), 0);

  const ritmo = ritmoDelMes({
    ventasMes: conMeta.reduce((acc, s) => acc + s.ventasMes, 0),
    ventasHoy: conMeta.reduce((acc, s) => acc + s.ventasHoy, 0),
    metaVentaDiaria: conMeta.length > 0 ? metaTotal : null,
    fecha,
  });

  return {
    metaVentaDiaria: conMeta.length > 0 ? metaTotal : null,
    ventasHoy: suma((s) => s.ventasHoy),
    ticketsHoy: suma((s) => s.ticketsHoy),
    unidadesHoy: suma((s) => s.unidadesHoy),
    devueltoHoy: suma((s) => s.devueltoHoy),
    ventasSemana: suma((s) => s.ventasSemana),
    ticketsSemana: suma((s) => s.ticketsSemana),
    unidadesSemana: suma((s) => s.unidadesSemana),
    devueltoSemana: suma((s) => s.devueltoSemana),
    ventasMes: suma((s) => s.ventasMes),
    ticketsMes: suma((s) => s.ticketsMes),
    unidadesMes: suma((s) => s.unidadesMes),
    devueltoMes: suma((s) => s.devueltoMes),
    ritmo,
    tiendas: sedes.length,
    tiendasConMeta: conMeta.length,
  };
}

/**
 * Serie para el gráfico de ventas por hora: desde la primera hora con ventas hasta la última (o hasta
 * la hora actual, si es más tarde), rellenando con cero las horas sin ventas. Nunca un 9am-8pm fijo:
 * una tienda que abre a las 11 no debe mostrar dos barras vacías que parecen un mal día.
 * Sin ninguna venta devuelve [] — la pantalla dice "aún no hay ventas", no dibuja un eje vacío.
 */
export function serieHoras(
  horas: readonly { hora: number; ventas: number }[],
  horaActual: number | null
): { hora: number; monto: number }[] {
  if (horas.length === 0) return [];
  const porHora = new Map(horas.map((h) => [h.hora, h.ventas]));
  const primera = Math.min(...horas.map((h) => h.hora));
  const ultima = Math.max(...horas.map((h) => h.hora), horaActual ?? -1);
  const serie: { hora: number; monto: number }[] = [];
  for (let h = primera; h <= ultima; h++) serie.push({ hora: h, monto: porHora.get(h) ?? 0 });
  return serie;
}

/** La hora con más ventas, o null si no hubo ninguna. Empate: la más temprana. */
export function horaPico(horas: readonly { hora: number; ventas: number }[]): number | null {
  if (horas.length === 0) return null;
  return [...horas].sort((a, b) => b.ventas - a.ventas || a.hora - b.hora)[0].hora;
}

/** Texto corto y honesto para cada estado. Va SIEMPRE con texto: nunca solo un color. */
export function textoEstado(e: EstadoMeta): string {
  switch (e) {
    case "bajo":
      return "Bajo su ritmo";
    case "en_ruta":
      return "En ruta";
    case "sobre":
      return "Sobre su ritmo";
    case "sin_dias_cerrados":
      return "Primer día del mes: aún sin ritmo";
    case "sin_meta":
      return "Sin meta configurada";
  }
}

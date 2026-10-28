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
//   · La meta de cada día es la que rige en Caja e Inicio (`fn_parametros_caja`, ADR-0435: fecha concreta > semana del mes >
//     semana tipo > `ubicaciones.meta_venta_diaria`, más el % de campaña). Solo si la base no la entrega, la tienda cae a
//     `meta_venta_diaria` igual todos los días (un sábado vale como un martes) y la pantalla sigue en pie.
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
  /** La meta de HOY de la tienda (la que rige en Caja e Inicio). Null = sin meta hoy. */
  metaVentaDiaria: number | null;
  /**
   * La meta de CADA día del mes de la fecha (índice 0 = día 1; null = ese día no tiene meta). Con ella el ritmo compara lo
   * vendido contra lo que de verdad prometían los días cerrados. Ausente o null = la tienda cae a `metaVentaDiaria` igual
   * todos los días (respaldo si la base no entregó las metas).
   */
  metasDelMes?: readonly (number | null)[] | null;
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

const esMeta = (m: number | null | undefined): m is number => m !== null && m !== undefined && m > 0;

/** La meta de cada día del mes de `fecha`: la de la tienda día por día o, sin ella, su meta de hoy repetida (el respaldo de antes). */
export function metasDelMesDe(s: Pick<NumerosSede, "metaVentaDiaria" | "metasDelMes">, fecha: string): (number | null)[] {
  const dias = diasDelMes(fecha);
  if (s.metasDelMes && s.metasDelMes.length === dias) return [...s.metasDelMes];
  return Array.from({ length: dias }, () => s.metaVentaDiaria);
}

/** La meta del mes: la suma de las metas de cada día (lo mismo que `retail.fn_meta_mes`). Null si ningún día tiene meta. */
export function metaDelMes(metas: readonly (number | null)[]): number | null {
  const total = metas.reduce<number>((acc, m) => acc + (esMeta(m) ? m : 0), 0);
  return total > 0 ? redondear2(total) : null;
}

/**
 * De lo que respondió la base por tienda a lo que usa el panel. `porDia` = la meta efectiva de cada día del mes (lo que da
 * `fn_parametros_caja`; null = ese día no tiene meta) o `null` si la base no respondió (la función aún no existe, un corte):
 * entonces se cae a `respaldo` (`ubicaciones.meta_venta_diaria`) igual todos los días, como antes, sin tumbar la pantalla.
 */
export function metasDeLaSede(
  porDia: readonly (number | null)[] | null,
  respaldo: number | null,
  fecha: string
): { metaVentaDiaria: number | null; metasDelMes: (number | null)[] | null; metaMes: number | null } {
  if (porDia === null || porDia.length !== diasDelMes(fecha)) {
    const metas = metasDelMesDe({ metaVentaDiaria: respaldo, metasDelMes: null }, fecha);
    return { metaVentaDiaria: esMeta(respaldo) ? respaldo : null, metasDelMes: null, metaMes: metaDelMes(metas) };
  }
  const hoy = porDia[diaDelMes(fecha) - 1] ?? null;
  return { metaVentaDiaria: esMeta(hoy) ? hoy : null, metasDelMes: [...porDia], metaMes: metaDelMes(porDia) };
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
  /** La meta de cada día del mes (índice 0 = día 1). Sin ella: `metaVentaDiaria` igual todos los días. */
  metasDelMes?: readonly (number | null)[] | null;
  fecha: string;
}): RitmoMes {
  const diasCerrados = diaDelMes(datos.fecha) - 1;
  const metas = metasDelMesDe(datos, datos.fecha);
  const tieneMetaEnElMes = metas.some(esMeta);

  if (diasCerrados < 1) {
    return { estado: tieneMetaEnElMes ? "sin_dias_cerrados" : "sin_meta", ritmo: null, proyeccion: null, diasCerrados: 0 };
  }

  const vendidoCerrado = Math.max(0, redondear2(datos.ventasMes - datos.ventasHoy));
  const proyeccion = redondear2((vendidoCerrado / diasCerrados) * diasDelMes(datos.fecha));

  // Lo prometido: la suma de la meta de cada día CERRADO. Un día sin meta (la tienda no abre) promete 0.
  const prometido = metas.slice(0, diasCerrados).reduce<number>((acc, m) => acc + (esMeta(m) ? m : 0), 0);
  if (prometido <= 0) return { estado: "sin_meta", ritmo: null, proyeccion, diasCerrados };

  const ritmo = vendidoCerrado / prometido;
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
): NumerosSede & { ritmo: RitmoMes; tiendas: number; tiendasConMeta: number; metaMes: number | null } {
  const suma = (f: (s: NumerosSede) => number) => redondear2(sedes.reduce((acc, s) => acc + f(s), 0));
  const metasPorSede = sedes.map((s) => metasDelMesDe(s, fecha));
  const conMetaIdx = sedes.map((_, i) => i).filter((i) => metasPorSede[i]!.some(esMeta));
  const conMeta = conMetaIdx.map((i) => sedes[i]!);
  // La meta de cada día del consolidado: la suma de las metas de ese día en las tiendas con meta.
  const metasTotal = Array.from({ length: diasDelMes(fecha) }, (_, d) =>
    conMetaIdx.reduce((acc, i) => acc + (metasPorSede[i]![d] ?? 0), 0)
  );
  const metaHoy = metasTotal[diaDelMes(fecha) - 1] ?? 0;

  const ritmo = ritmoDelMes({
    ventasMes: conMeta.reduce((acc, s) => acc + s.ventasMes, 0),
    ventasHoy: conMeta.reduce((acc, s) => acc + s.ventasHoy, 0),
    metaVentaDiaria: conMeta.length > 0 ? metaHoy : null,
    metasDelMes: conMeta.length > 0 ? metasTotal : null,
    fecha,
  });

  return {
    metaVentaDiaria: metaHoy > 0 ? redondear2(metaHoy) : null,
    metasDelMes: conMeta.length > 0 ? metasTotal : null,
    metaMes: metaDelMes(metasTotal),
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

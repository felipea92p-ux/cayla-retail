// Guías de Finanzas (ADR-0362): Resumen, Gastos, Cuentas y dinero (Cuentas, Efectivo por tienda, Por pagar, Conciliación), los seis
// Reportes (Estado de resultados, Presupuesto, Campañas, Escenarios, Flujo de caja, Balance), Impuestos y Cierre de mes. Es dinero:
// cada guía dice con cuidado QUÉ muestra cada cifra y DE DÓNDE sale (casi siempre: de lo que ya registran Ventas, Caja, Compras y
// Producción; aquí nadie escribe un saldo a mano), en lenguaje de tienda y sin estadística. El piloto solo cambia de pestaña dentro de
// Gastos, abre la ventana de clasificar un egreso, la de «De dónde sale» de una cifra y la de los saldos de arranque (para mirarlas,
// sin guardar), marca casillas de un escenario (que no se guarda) y elige otra tienda en Cierre. Registrar, Pagar, Anotar, Conciliar,
// Cerrar el mes, Reabrir y Descargar: se EXPLICAN con la pieza encendida, nunca se tocan.

import type { Guia, PasoGuia } from "../tipos";

/** «Ver»: el mismo combo en casi todas las pantallas de Finanzas (solo el líder elige; los demás ven su tienda). */
const VER: PasoGuia = {
  id: "ver",
  ancla: "fin-ver.combo",
  opcional: true,
  titulo: "Qué tienda mirar",
  texto: "Eliges si ves todas las tiendas juntas, una sola o lo de la empresa (lo que no es de ninguna tienda, como el contador). Lo elige el líder; si no lo eres, ves tu tienda.",
};

/** Las pestañas de Reportes: cada una es otra pantalla (se explican, no se tocan). */
const PESTANAS_REPORTES: PasoGuia = {
  id: "pestanas",
  ancla: "fin-reportes.pestanas",
  titulo: "Los seis reportes",
  texto: "Cada pestaña responde una pregunta: ¿ganamos? (Estado de resultados), ¿vamos según lo planeado? (Presupuesto), ¿valen las campañas?, ¿qué pasa si…? (Escenarios), ¿hay plata? (Flujo de caja) y ¿cuánto vale CAYLA? (Balance).",
};

const EXCEL: PasoGuia = {
  id: "excel",
  ancla: "fin-reportes.excel",
  titulo: "Descargar Excel",
  texto: "Baja este reporte en un archivo que se abre en Excel, para el contador o para guardarlo. No cambia nada en el sistema. En la demo no lo descargamos.",
};

/** Las pestañas de Cuentas y dinero: cada una es otra pantalla. */
const PESTANAS_DINERO: PasoGuia = {
  id: "pestanas",
  ancla: "fin-dinero.pestanas",
  titulo: "Las cuatro partes",
  texto: "Cuentas: cuánta plata hay en cada lugar. Efectivo por tienda: lo que debería haber en cada cajón. Por pagar: lo que se debe. Conciliación (solo el líder): comparar con lo que dice el banco. El número avisa lo pendiente.",
};

const REGISTRAR_MOVIMIENTO: PasoGuia = {
  id: "registrar",
  ancla: "fin-dinero.registrar",
  titulo: "Registrar un movimiento",
  texto: "Cuando la plata cambia de lugar —depositas el cajón en el banco, llega el abono de la tarjeta, pasas de una cuenta a otra— lo anotas aquí. No es venta ni gasto: la plata solo se mueve. En la demo no lo abrimos.",
};

export const GUIA_FIN_RESUMEN: Guia = {
  id: "finanzas.resumen",
  ruta: "/finanzas/resumen",
  titulo: "Resumen de Finanzas",
  resumen: "Cómo está el negocio hoy y qué conviene decidir primero.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "El tablero de la plata",
      texto: "Aquí ves de un vistazo cómo está CAYLA: si alcanza la plata, si las tiendas cubren sus costos y qué conviene decidir hoy. Nada se escribe aquí: todo sale de lo que ya registran Ventas, Caja, Compras y Producción. Es una demo.",
    },
    VER,
    {
      id: "salud",
      ancla: "fin-resumen.salud",
      opcional: true,
      titulo: "Cómo está, en tres frases",
      texto: "Para cuántos días alcanza tu plata si mañana no vendieras nada, qué día del mes CAYLA ya cubrió sus costos y cómo vas contra la meta de ventas. El color de la línea dice si va bien o pide atención.",
    },
    {
      id: "cifras",
      ancla: "fin-resumen.cifras",
      titulo: "Los números del mes",
      texto: "Lo vendido en el mes, la plata que hay en cajones y bancos, lo que debes pagar en los próximos 7 días, la utilidad del mes pasado y el IGV que se calcula para este mes. Si pasas el mouse, dice de qué pantalla sale.",
    },
    {
      id: "decidir",
      ancla: "fin-resumen.decidir",
      titulo: "Para decidir hoy",
      texto: "Los avisos que más cuestan si se dejan pasar van primero: una factura vencida, la caja bajo tu mínimo, un mes sin cerrar, egresos sin clasificar. Cada uno dice cuánto está en juego y de qué pantalla sale.",
    },
    {
      id: "aviso-accion",
      ancla: "fin-resumen.aviso-accion",
      opcional: true,
      titulo: "Ir a resolverlo",
      texto: "Cada aviso trae su botón (Pagar, Clasificar, Cerrar el mes…) que te lleva a la pantalla donde se arregla. Desde aquí no se paga ni se cierra nada. En la demo no salimos de esta pantalla.",
    },
    {
      id: "ver-mas",
      ancla: "fin-resumen.ver-mas",
      opcional: true,
      titulo: "Más avisos",
      texto: "Se muestran los cinco más importantes; aquí abres el resto (te lo mostramos).",
      demostrar: [{ tipo: "clic", ancla: "fin-resumen.ver-mas" }],
    },
    {
      id: "cobertura",
      ancla: "fin-resumen.cobertura",
      opcional: true,
      titulo: "¿Cada tienda cubre sus costos?",
      texto: "Una barra por tienda: lo que vendió el mes pasado contra lo que necesitaba vender para no perder. La línea punteada es el 100 %: por encima, la tienda ganó; por debajo, no alcanzó a cubrir sus gastos.",
    },
    {
      id: "semanas",
      ancla: "fin-resumen.semanas",
      opcional: true,
      titulo: "La plata de las próximas semanas",
      texto: "Lo que tendrías al final de cada semana: lo que hay hoy, más lo que esperas vender, menos lo que vence. La línea punteada es tu mínimo de caja; una barra roja avisa que esa semana bajarías de él.",
    },
    {
      id: "camino",
      ancla: "fin-resumen.camino",
      opcional: true,
      titulo: "Camino al punto de equilibrio",
      texto: "Mirando una tienda: cuánto lleva vendido este mes contra lo que necesita vender para cubrir sus costos. Cuando la barra llega al final, lo que venda después ya es ganancia.",
    },
    {
      id: "presupuesto",
      ancla: "fin-resumen.presupuesto",
      opcional: true,
      titulo: "El presupuesto de la tienda",
      texto: "Cuánto lleva gastado en cada rubro contra el tope que se puso, y a dónde llegaría al cierre si sigue al mismo ritmo.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes leer el tablero de Finanzas. Para repasarlo: Mi perfil ▸ Demo ▸ Resumen de Finanzas.",
    },
  ],
};

export const GUIA_FIN_GASTOS: Guia = {
  id: "finanzas.gastos",
  ruta: "/finanzas/gastos",
  titulo: "Gastos",
  resumen: "Lo que se paga para que el negocio funcione y no es mercadería: luz, alquiler, un mototaxi.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "Los gastos del negocio",
      texto: "Aquí va lo que se paga para que la tienda funcione y no es mercadería: alquiler, luz, el contador, un mototaxi. La mercadería va por Compras y la planilla la trae Dynamic. Es una demo: no se registra ni se anula nada.",
    },
    VER,
    {
      id: "registrar",
      ancla: "fin-gastos.registrar",
      titulo: "Registrar un gasto",
      texto: "Abre la ventana para anotar un gasto: qué fue, la categoría, el comprobante y cómo se pagó (del cajón, del banco o a crédito). En «Activos fijos» este botón registra un mueble o una máquina. En la demo no lo abrimos.",
    },
    {
      id: "cifras",
      ancla: "fin-gastos.cifras",
      titulo: "Los gastos en cifras",
      texto: "Lo gastado en el mes, el IGV que puedes descontar (solo de facturas; una boleta no da IGV), lo que falta pagar de gastos a crédito y los egresos de caja que nadie dijo todavía qué fueron.",
    },
    {
      id: "pestanas",
      ancla: "fin-gastos.pestanas",
      titulo: "Cuatro listas",
      texto: "Gastos: lo registrado en el mes. Fijos del mes: lo que se paga todos los meses. Activos fijos: muebles y máquinas. Egresos por clasificar: plata que salió del cajón y falta decir qué fue. Te las mostramos una por una.",
    },
    {
      id: "filtros",
      ancla: "fin-gastos.filtros",
      titulo: "Buscar y filtrar",
      texto: "Busca por descripción, proveedor o número de comprobante, deja una sola categoría o cambia de mes.",
    },
    {
      id: "lista",
      ancla: "fin-gastos.lista",
      titulo: "Los gastos del mes",
      texto: "Uno por fila: la fecha, qué fue, la categoría, el comprobante, cómo se pagó, el monto y su estado. Al tocar uno ves su detalle. Un gasto nunca se borra: si se registró mal, se anula con su motivo y queda a la vista.",
    },
    {
      id: "fijos",
      ancla: "fin-gastos.fijos",
      preparar: [{ tipo: "clic", ancla: "fin-gastos.tab-fijos" }],
      titulo: "Los fijos del mes",
      texto: "El alquiler, la luz o el contador se guardan una vez y cada mes el sistema dice cuáles llegaron y cuáles faltan. «Registrar» abre el gasto ya lleno. Si un gasto se repite, el sistema te pregunta si lo marca como fijo.",
    },
    {
      id: "activos",
      ancla: "fin-gastos.activos",
      preparar: [{ tipo: "clic", ancla: "fin-gastos.tab-activos" }],
      titulo: "Los activos fijos",
      texto: "Lo que se compra para durar años: un mostrador, una laptop, una máquina del Taller. No se cuenta como gasto de un mes: el sistema lo reparte (lo deprecia) mes a mes mientras se usa.",
    },
    {
      id: "egresos",
      ancla: "fin-gastos.egresos",
      preparar: [{ tipo: "clic", ancla: "fin-gastos.tab-egresos" }],
      titulo: "Egresos de caja por clasificar",
      texto: "Cuando la tienda saca plata del cajón, solo anota cuánto y un motivo. Aquí alguien dice qué fue: un gasto, un depósito al banco o un retiro. Hasta clasificarlo, no cuenta en ningún número.",
    },
    {
      id: "clasificar",
      ancla: "fin-gastos.clasificar",
      opcional: true,
      titulo: "Clasificar un egreso",
      texto: "Abre la ventana para decir qué fue esa salida (te la abrimos).",
    },
    {
      id: "clasificar-opciones",
      ancla: "fin-gastos.clasificar-opciones",
      opcional: true,
      preparar: [{ tipo: "clic", ancla: "fin-gastos.clasificar" }],
      titulo: "¿Qué fue esta salida?",
      texto: "Eliges una: un gasto (con su categoría), algo que dura años, un depósito al banco o un retiro. Según lo que elijas, la ventana pide lo que falta.",
    },
    {
      id: "clasificar-guardar",
      ancla: "fin-gastos.clasificar-guardar",
      opcional: true,
      titulo: "Guardar la clasificación",
      texto: "Con «Guardar» la salida queda clasificada y ya cuenta donde corresponde. En la demo no guardamos: cerramos la ventana.",
    },
    {
      id: "fin",
      ancla: null,
      preparar: [{ tipo: "escape" }, { tipo: "clic", ancla: "fin-gastos.tab-gastos" }],
      titulo: "¡Listo!",
      texto: "Ya sabes dónde va cada gasto. Para repasarlo: Mi perfil ▸ Demo ▸ Gastos.",
    },
  ],
  alSalir: [{ tipo: "escape" }],
};

export const GUIA_FIN_CUENTAS: Guia = {
  id: "finanzas.dinero",
  ruta: "/finanzas/dinero",
  titulo: "Cuentas y dinero",
  resumen: "Dónde está la plata de CAYLA: bancos, tarjeta por abonar, cajones y cajas fuertes.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Dónde está la plata?",
      texto: "Cada lugar donde CAYLA tiene dinero: los bancos, la tarjeta que todavía no abona, los cajones y las cajas fuertes. Un saldo nunca se escribe a mano: se suma de las ventas, los gastos y los movimientos. Es una demo.",
    },
    VER,
    REGISTRAR_MOVIMIENTO,
    PESTANAS_DINERO,
    {
      id: "cuentas",
      ancla: "fin-dinero.cuentas",
      titulo: "Cada lugar con su saldo",
      texto: "Una tarjeta por lugar: cuánto hay y de dónde sale. Los cajones suben con las ventas en efectivo y bajan con los egresos y depósitos. El saldo del cajón solo lo ve quien puede cerrar la caja.",
    },
    {
      id: "dueno",
      ancla: "fin-dinero.dueno",
      opcional: true,
      titulo: "La plata del dueño",
      texto: "Cuando pones plata tuya en CAYLA dices si es un aporte (se queda) o un préstamo (CAYLA te lo devuelve). Aquí ves cuánto te debe CAYLA. Poner o sacar plata se registra; en la demo no lo tocamos.",
    },
    {
      id: "medios",
      ancla: "fin-dinero.medios",
      opcional: true,
      titulo: "A qué cuenta entra cada cobro",
      texto: "Por tienda: a qué banco o billetera llega cada medio de pago (Yape, tarjeta, transferencia). Así Vender no cambia y Finanzas sabe dónde quedó cada cobro. Se cambia en Configuración.",
    },
    {
      id: "movimientos",
      ancla: "fin-dinero.movimientos",
      titulo: "Movimientos entre cuentas",
      texto: "Depósitos, abonos de tarjeta, transferencias y retiros, con quién los registró. No son ventas ni gastos: la plata solo cambia de lugar. Nada se borra: un error se anula con su motivo.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes dónde está la plata de CAYLA. Para repasarlo: Mi perfil ▸ Demo ▸ Cuentas y dinero.",
    },
  ],
};

export const GUIA_FIN_EFECTIVO: Guia = {
  id: "finanzas.dinero.efectivo",
  ruta: "/finanzas/dinero/efectivo",
  titulo: "Efectivo por tienda",
  resumen: "Lo que debería haber ahora mismo en el cajón de cada tienda.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "El efectivo de cada cajón",
      texto: "Lo que debería haber en el cajón de cada tienda en este momento. Es la misma cuenta que hace Caja al cerrar: Finanzas solo la junta para verlas todas. Es una demo.",
    },
    VER,
    PESTANAS_DINERO,
    {
      id: "efectivo",
      ancla: "fin-dinero.efectivo",
      titulo: "Lo que debería haber",
      texto: "Por tienda: si la caja está abierta, con cuánto abrió, más las ventas en efectivo, menos los egresos y los depósitos al banco. El resultado es lo que debería haber. El monto lo ve solo quien puede cerrar la caja.",
    },
    {
      id: "diferencias",
      ancla: "fin-dinero.diferencias",
      opcional: true,
      titulo: "Cierres con diferencia",
      texto: "Los últimos cierres de caja donde lo contado no coincidió con lo que debía haber: si faltó o sobró plata, cuánto y quién cerró. Sirve para conversarlo a tiempo con la tienda.",
    },
    REGISTRAR_MOVIMIENTO,
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes cuánto efectivo debería haber en cada tienda. Para repasarlo: Mi perfil ▸ Demo ▸ Efectivo por tienda.",
    },
  ],
};

export const GUIA_FIN_POR_PAGAR: Guia = {
  id: "finanzas.dinero.por-pagar",
  ruta: "/finanzas/dinero/por-pagar",
  titulo: "Por pagar (Finanzas)",
  resumen: "Todo lo que CAYLA debe en una sola lista: mercadería, gastos, activos e insumos del Taller.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "Todo lo que se debe",
      texto: "Las facturas de mercadería, de gastos, de activos y de los insumos del Taller que todavía tienen saldo, juntas y ordenadas por cuándo vencen. La planilla no está porque la paga Dynamic. Es una demo: no se paga nada.",
    },
    VER,
    PESTANAS_DINERO,
    {
      id: "cifras",
      ancla: "fin-por-pagar.cifras",
      titulo: "Cuándo vence la deuda",
      texto: "Lo que ya venció (se paga primero), lo que vence esta semana, la próxima y más adelante, con cuántas facturas hay en cada tramo.",
    },
    {
      id: "lista",
      ancla: "fin-por-pagar.lista",
      titulo: "La lista de lo que se debe",
      texto: "Cada factura con su vencimiento, el proveedor, de qué es (mercadería, gasto, activo o insumo), el total, lo pagado y el saldo. Mirando una tienda, de una factura repartida solo aparece su parte. Si no se debe nada, aquí lo dice.",
    },
    {
      id: "pagar",
      ancla: "fin-por-pagar.pagar",
      opcional: true,
      titulo: "Pagar una factura",
      texto: "Abre el mismo pago de Compras (o de Producción, si es tela del Taller): cuánto, con qué medio y desde qué cuenta. El pago queda en su factura y baja la deuda. En la demo no lo tocamos.",
    },
    {
      id: "varias",
      ancla: "fin-por-pagar.varias",
      opcional: true,
      titulo: "Pagar varias de un proveedor",
      texto: "Te lleva a Compras ▸ Por pagar, donde juntas varias facturas del mismo proveedor en un solo pago. En la demo no salimos de aquí.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes qué debe CAYLA y qué vence primero. Para repasarlo: Mi perfil ▸ Demo ▸ Por pagar (Finanzas).",
    },
  ],
};

export const GUIA_FIN_CONCILIACION: Guia = {
  id: "finanzas.dinero.conciliacion",
  ruta: "/finanzas/dinero/conciliacion",
  titulo: "Conciliación",
  resumen: "Comparar lo que dice el banco con lo que suma el sistema, cuenta por cuenta.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Coincide con el banco?",
      texto: "Cada viernes, el líder anota el saldo que muestra la banca por internet y el sistema dice si coincide con lo que él suma. Así se encuentra a tiempo un depósito que no se registró. Es una demo: no se anota nada.",
    },
    PESTANAS_DINERO,
    {
      id: "vacia",
      ancla: "fin-conciliacion.vacia",
      opcional: true,
      titulo: "Primero, los bancos",
      texto: "Si todavía no hay bancos, aquí lo dice: se agregan en Configuración ▸ Cuentas y cobros. Desde ese día ya se pueden conciliar.",
    },
    {
      id: "responsable",
      ancla: "fin-conciliacion.responsable",
      opcional: true,
      titulo: "Quién lo hace",
      texto: "Elige quién está revisando: queda escrito junto a cada línea que marque.",
    },
    {
      id: "lineas",
      ancla: "fin-conciliacion.lineas",
      opcional: true,
      titulo: "Lo que registró el sistema",
      texto: "Cada entrada y salida de esa cuenta en el período. Con el extracto del banco al lado, marcas «Revisada» cada línea que aparece en los dos. Lo que no encuentres en el banco es lo que hay que aclarar.",
    },
    {
      id: "anotar",
      ancla: "fin-conciliacion.anotar",
      opcional: true,
      titulo: "El saldo del banco",
      texto: "Escribes el saldo que muestra el banco y la fecha. Con «Anotar» el sistema lo compara con el suyo y dice si coinciden o cuánto es la diferencia. En la demo no anotamos nada.",
    },
    {
      id: "historial",
      ancla: "fin-conciliacion.historial",
      opcional: true,
      titulo: "Las conciliaciones anteriores",
      texto: "Cada vez que se anotó el saldo de esta cuenta: lo que dijo el banco, lo que dijo el sistema y si coincidieron.",
    },
    {
      id: "otras",
      ancla: "fin-conciliacion.otras",
      opcional: true,
      titulo: "Las otras cuentas",
      texto: "Los demás bancos, con cuándo se conciliaron por última vez y cuántas líneas faltan revisar. «Conciliar» abre esa cuenta.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes comparar el banco con el sistema. Para repasarlo: Mi perfil ▸ Demo ▸ Conciliación.",
    },
  ],
};

export const GUIA_FIN_RESULTADOS: Guia = {
  id: "finanzas.reportes",
  ruta: "/finanzas/reportes",
  titulo: "Estado de resultados",
  resumen: "¿Ganamos? Las ventas del mes menos lo que costó venderlas, tienda por tienda.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Ganamos?",
      texto: "Lo que se vendió en el mes, menos lo que costaron esas prendas y los gastos, tienda por tienda. Sale solo de cada venta, compra, gasto y movimiento de caja: nadie lo escribe. Es una demo.",
    },
    PESTANAS_REPORTES,
    VER,
    EXCEL,
    {
      id: "herramientas",
      ancla: "fin-resultados.herramientas",
      titulo: "El mes y la comparación",
      texto: "Eliges el mes. El mes en curso dice «a la fecha»: todavía puede cambiar.",
    },
    {
      id: "comparar",
      ancla: "fin-resultados.comparar",
      titulo: "Comparar con el mes anterior",
      texto: "Al marcarlo, debajo de cada cifra aparece cuánto subió o bajó contra el mes anterior (te lo mostramos).",
      demostrar: [{ tipo: "clic", ancla: "fin-resultados.comparar" }],
    },
    {
      id: "tabla",
      ancla: "fin-resultados.tabla",
      titulo: "De la venta a la utilidad",
      texto: "Arriba las ventas; restas lo que costó lo vendido, las mermas y los fletes, y queda el margen bruto. Restas los gastos (alquiler, luz, faltantes de caja…) y queda la utilidad. Una columna por tienda y al final CAYLA, la suma.",
      preparar: [{ tipo: "clic", ancla: "fin-resultados.comparar" }],
    },
    {
      id: "celda",
      ancla: "fin-resultados.celda",
      opcional: true,
      titulo: "Toca una cifra",
      texto: "Cada cifra se puede abrir para ver de qué ventas, compras o gastos sale (te abrimos la de ventas).",
    },
    {
      id: "origen",
      ancla: "fin-resultados.origen",
      opcional: true,
      preparar: [{ tipo: "clic", ancla: "fin-resultados.celda" }],
      titulo: "De dónde sale",
      texto: "Qué operaciones forman esa cifra y las más grandes, con su fecha. Sirve para entender un número raro sin pedirle nada al contador.",
    },
    {
      id: "avisos",
      ancla: "fin-resultados.avisos",
      opcional: true,
      preparar: [{ tipo: "escape" }],
      titulo: "Lo que hay que revisar",
      texto: "Si algo no cuadra (un cobro que no suma lo vendido, por ejemplo), aquí avisa: hasta revisarlo, esas cifras no son confiables.",
    },
    {
      id: "notas",
      ancla: "fin-resultados.notas",
      preparar: [{ tipo: "escape" }],
      titulo: "Cómo se reparte",
      texto: "El Taller no le vende a las tiendas: lo que cuesta hacer una prenda entra en el costo de la tienda que la vende. Y lo de la empresa (contador, publicidad) no se reparte entre tiendas.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes si CAYLA ganó en el mes. Para repasarlo: Mi perfil ▸ Demo ▸ Estado de resultados.",
    },
  ],
  alSalir: [{ tipo: "escape" }],
};

export const GUIA_FIN_PRESUPUESTO: Guia = {
  id: "finanzas.reportes.presupuesto",
  ruta: "/finanzas/reportes/presupuesto",
  titulo: "Presupuesto",
  resumen: "¿Vamos según lo planeado? Las metas y los topes del mes contra lo que va pasando.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Vamos según lo planeado?",
      texto: "Lo que pusiste como meta de ventas y como tope de gasto, contra lo que va pasando en el mes. No frena nada: nadie queda bloqueado por pasarse. Sirve para ver a tiempo en qué se va la plata. Es una demo.",
    },
    PESTANAS_REPORTES,
    VER,
    EXCEL,
    {
      id: "avance",
      ancla: "fin-presupuesto.avance",
      titulo: "En qué día del mes vas",
      texto: "Qué mes miras y en qué día va. «Al cierre» supone que el resto del mes sigue al mismo ritmo; lo fijo, como el alquiler, entra entero.",
    },
    {
      id: "cambiar",
      ancla: "fin-presupuesto.cambiar",
      opcional: true,
      titulo: "Cambiar metas y topes",
      texto: "Las metas y los topes se ponen en Configuración, mes por mes. Este botón te lleva ahí; en la demo no salimos.",
    },
    {
      id: "tabla",
      ancla: "fin-presupuesto.tabla",
      opcional: true,
      titulo: "Rubro por rubro",
      texto: "Las ventas contra su meta y cada gasto contra su tope: lo que va a la fecha, a dónde llegaría al cierre y una barra de avance. El estado dice si vas bien, justo o pasándote.",
    },
    {
      id: "avisos",
      ancla: "fin-presupuesto.avisos",
      opcional: true,
      titulo: "Lo que falta",
      texto: "Si el mes todavía no tiene topes de gasto, o hay gastos fuera de los rubros con tope, aquí lo dice.",
    },
    {
      id: "nota",
      ancla: "fin-presupuesto.nota",
      titulo: "Avisa, no frena",
      texto: "Pasarse de un tope no bloquea a nadie: la tienda sigue vendiendo y pagando. El presupuesto solo te avisa a tiempo en qué se va la plata, antes de que el mes cierre.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes si el mes va según lo planeado. Para repasarlo: Mi perfil ▸ Demo ▸ Presupuesto.",
    },
  ],
};

export const GUIA_FIN_CAMPANAS: Guia = {
  id: "finanzas.reportes.campanas",
  ruta: "/finanzas/reportes/campanas",
  titulo: "Campañas",
  resumen: "¿Valen la pena las campañas? Cuánto más se vendió y cuánto margen dejó cada una.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Valen la pena las campañas?",
      texto: "Cada campaña (Aniversario, Black Friday…) contra lo que la tienda vende en días normales: cuánto más vendió, cuánto se descontó y si al final dejó más o menos margen. El sistema no decide por ti. Es una demo.",
    },
    PESTANAS_REPORTES,
    EXCEL,
    {
      id: "grafico",
      ancla: "fin-campanas.grafico",
      titulo: "Margen extra de cada campaña",
      texto: "Una barra por campaña ya terminada: lo que dejó de más (o de menos) contra lo que habría dejado en días normales. Una barra roja es una campaña que no se pagó sola.",
    },
    {
      id: "pasadas",
      ancla: "fin-campanas.pasadas",
      titulo: "Las campañas del último año",
      texto: "Cuánto vendió cada una, contra un día normal, cuánto se descontó y el margen extra. «Normal» es lo que vende la tienda el mismo día de la semana en las 8 semanas anteriores, sin campañas.",
    },
    {
      id: "vienen",
      ancla: "fin-campanas.vienen",
      titulo: "Las que vienen",
      texto: "Antes de lanzarla: con ese descuento, cuánto más hay que vender para ganar lo mismo que un día normal, y cuánto sube la meta de la tienda esos días.",
    },
    {
      id: "nota",
      ancla: "fin-campanas.nota",
      titulo: "Dónde se cambian",
      texto: "Una campaña también puede valer por otras cosas, como clientes nuevos. Las fechas y el descuento se cambian en Catálogo ▸ Etiquetas; la meta y el fondo, en Configuración ▸ Tiendas y caja.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes si una campaña vale la pena. Para repasarlo: Mi perfil ▸ Demo ▸ Campañas.",
    },
  ],
};

export const GUIA_FIN_ESCENARIOS: Guia = {
  id: "finanzas.reportes.escenarios",
  ruta: "/finanzas/reportes/escenarios",
  titulo: "Escenarios",
  resumen: "¿Qué pasa si…? Mueve un valor y mira qué pasa con la utilidad y con la caja, sin guardar nada.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Qué pasa si…?",
      texto: "Aquí pruebas una decisión antes de tomarla: vender más, bajar un alquiler, pasar un pago, contratar a alguien. Ves qué pasa con la utilidad de cada tienda y con tu caja. Nada se guarda: es para pensar.",
    },
    PESTANAS_REPORTES,
    EXCEL,
    {
      id: "valores",
      ancla: "fin-escenarios.valores",
      titulo: "Mueve los valores",
      texto: "Parte del último mes completo y de tu caja de hoy. Cada cambio que hagas aquí se refleja al instante a la derecha.",
    },
    {
      id: "tienda",
      ancla: "fin-escenarios.tienda",
      opcional: true,
      titulo: "¿Qué tienda?",
      texto: "Eliges la tienda a la que le aplicas el alquiler, sus ventas o cerrarla.",
    },
    {
      id: "deslizador",
      ancla: "fin-escenarios.deslizador",
      titulo: "Arrastra para probar",
      texto: "Mueve la barra para subir o bajar las ventas (o el alquiler) en un porcentaje, y mira cómo cambia todo a la derecha.",
    },
    {
      id: "mover-pago",
      ancla: "fin-escenarios.mover-pago",
      opcional: true,
      titulo: "Pasar un pago",
      texto: "Prueba pagar una factura una o más semanas después: así ves si la caja respira. Hay que hablarlo con el proveedor (te lo marcamos).",
      demostrar: [{ tipo: "clic", ancla: "fin-escenarios.mover-pago-marca" }],
    },
    {
      id: "cerrar-tienda",
      ancla: "fin-escenarios.cerrar-tienda",
      opcional: true,
      titulo: "¿Y si cierro una tienda?",
      texto: "Quita sus ventas y sus costos para ver cuánto cambia CAYLA. Lo que se invirtió en ella se sigue depreciando.",
    },
    {
      id: "gasto-nuevo",
      ancla: "fin-escenarios.gasto-nuevo",
      titulo: "Un gasto nuevo",
      texto: "Contratar a alguien, una máquina, un local más: cuánto, si es cada mes o una sola vez, y desde qué semana (te escribimos un ejemplo).",
      demostrar: [
        { tipo: "clic", ancla: "fin-escenarios.gasto-nuevo-marca" },
        { tipo: "escribir", ancla: "fin-escenarios.gasto-monto", texto: "1500" },
      ],
    },
    {
      id: "que-pasaria",
      ancla: "fin-escenarios.que-pasaria",
      titulo: "Qué pasaría",
      texto: "En palabras simples: cuánto ganaría CAYLA al mes con el cambio, cuánto necesitaría vender la tienda para no perder y si tu caja bajaría del mínimo.",
    },
    {
      id: "utilidad",
      ancla: "fin-escenarios.utilidad",
      titulo: "Cada tienda, hoy y con el cambio",
      texto: "La utilidad al mes de cada tienda, del Taller, de la empresa y de CAYLA entera: hoy, con el cambio y la diferencia.",
    },
    {
      id: "caja",
      ancla: "fin-escenarios.caja",
      opcional: true,
      titulo: "Tu caja con el cambio",
      texto: "La plata que te quedaría cada semana con el cambio. La línea punteada es tu mínimo de caja.",
    },
    {
      id: "volver",
      ancla: "fin-escenarios.volver",
      titulo: "Volver a como está",
      texto: "Deja todos los valores como estaban, para empezar otra prueba (te lo dejamos como estaba).",
      demostrar: [{ tipo: "clic", ancla: "fin-escenarios.volver" }],
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes probar una decisión antes de tomarla. Para repasarlo: Mi perfil ▸ Demo ▸ Escenarios.",
    },
  ],
  alSalir: [{ tipo: "clic", ancla: "fin-escenarios.volver" }],
};

export const GUIA_FIN_FLUJO: Guia = {
  id: "finanzas.reportes.flujo",
  ruta: "/finanzas/reportes/flujo",
  titulo: "Flujo de caja",
  resumen: "¿Por qué vendí bien y no hay plata? Lo que entró y salió, y lo que viene.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Vendí bien y no hay plata?",
      texto: "Vender no es lo mismo que tener plata: una factura grande, un depósito o una diferencia de caja se la llevan. Aquí ves lo que ya entró y salió de las cuentas, y lo que viene en las próximas semanas. Es una demo.",
    },
    PESTANAS_REPORTES,
    EXCEL,
    {
      id: "paso",
      ancla: "fin-flujo.paso",
      titulo: "Lo que ya pasó",
      texto: "Lo que entró a las cuentas (efectivo, Yape, tarjeta) y lo que salió (pagos, gastos, retiros) en el mes, más las diferencias de caja. No es lo vendido: es la plata que de verdad se movió.",
    },
    {
      id: "mes",
      ancla: "fin-flujo.mes",
      titulo: "Qué mes mirar",
      texto: "Cambia el mes que se muestra a la izquierda.",
    },
    {
      id: "frase",
      ancla: "fin-flujo.frase",
      opcional: true,
      titulo: "En una frase",
      texto: "Si entró más de lo que salió, y cuánto tenías al empezar y al terminar el período.",
    },
    {
      id: "semana-a-semana",
      ancla: "fin-flujo.semana-a-semana",
      opcional: true,
      titulo: "Semana a semana",
      texto: "Lo que entró, lo que salió y lo que quedó al final de cada semana del mes.",
    },
    {
      id: "viene",
      ancla: "fin-flujo.viene",
      titulo: "Lo que viene",
      texto: "La plata que tienes hoy, más lo que esperas vender (la meta de cada día), menos lo que vence (facturas, alquileres, gastos fijos). Así sabes con tiempo qué semana te falta plata.",
    },
    {
      id: "cuantas-semanas",
      ancla: "fin-flujo.cuantas-semanas",
      titulo: "Cuántas semanas",
      texto: "Mira más o menos semanas hacia adelante.",
    },
    {
      id: "dias",
      ancla: "fin-flujo.dias",
      opcional: true,
      titulo: "Días de caja",
      texto: "Si mañana no vendieras nada, para cuántos días te alcanza la plata con lo que sale en un día normal.",
    },
    {
      id: "que-vence",
      ancla: "fin-flujo.que-vence",
      opcional: true,
      titulo: "Qué vence cada semana",
      texto: "Semana por semana: lo que entra, lo que sale, lo que queda y qué factura vence. Una semana bajo el mínimo es la que hay que preparar (vender más, pasar un pago o poner plata).",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes por qué la plata no siempre acompaña a las ventas. Para repasarlo: Mi perfil ▸ Demo ▸ Flujo de caja.",
    },
  ],
};

export const GUIA_FIN_BALANCE: Guia = {
  id: "finanzas.reportes.balance",
  ruta: "/finanzas/reportes/balance",
  titulo: "Balance",
  resumen: "¿Cuánto vale CAYLA? Lo que tiene, contra lo que debe y lo que es tuyo.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "¿Cuánto vale CAYLA?",
      texto: "Lo que CAYLA tiene (plata, mercadería, muebles), contra lo que debe (proveedores, impuestos) y lo que es tuyo. Mirando una tienda, ves cuánta plata tiene metida y cuánto le rinde. Es una demo.",
    },
    PESTANAS_REPORTES,
    VER,
    {
      id: "arranque",
      ancla: "fin-balance.arranque",
      opcional: true,
      titulo: "Saldos de arranque",
      texto: "Lo que CAYLA tenía el día que empezó a usar el sistema: el banco, lo que se debía, el capital. Se pone una sola vez, con el contador (te abrimos la ventana para mirarla).",
    },
    {
      id: "arranque-fecha",
      ancla: "fin-balance.arranque-fecha",
      opcional: true,
      preparar: [{ tipo: "clic", ancla: "fin-balance.arranque" }],
      titulo: "El día de arranque",
      texto: "El día desde el que parte todo. Lo ideal: el primer día de un mes, con el balance que te dé el contador al cierre del anterior.",
    },
    {
      id: "arranque-grupo",
      ancla: "fin-balance.arranque-grupo",
      opcional: true,
      titulo: "Lo que había ese día",
      texto: "Lo que el sistema ya sabe viene calculado (cajones, mercadería, lo que se debía a proveedores). El resto lo escribes tú: el banco, lo que se le debía a SUNAT, el capital.",
    },
    {
      id: "arranque-cuadre",
      ancla: "fin-balance.arranque-cuadre",
      opcional: true,
      titulo: "¿Cuadra?",
      texto: "Lo que tenía contra lo que debía más lo tuyo. Tiene que cuadrar antes de registrarlo.",
    },
    {
      id: "arranque-botones",
      ancla: "fin-balance.arranque-botones",
      opcional: true,
      titulo: "Registrarlo una vez",
      texto: "Al registrarlo, el Balance parte de aquí. Si después hay que corregirlo, se pide el motivo y lo anterior no se borra. En la demo no registramos: cerramos la ventana.",
    },
    {
      id: "chequeos",
      ancla: "fin-balance.chequeos",
      preparar: [{ tipo: "escape" }],
      titulo: "Primero, lo comprueba",
      texto: "Cada cuenta se calcula por dos caminos distintos. Si no coinciden, el Balance no se muestra y aquí dice qué falta: un número falso es peor que ninguno.",
    },
    {
      id: "resultado",
      ancla: "fin-balance.resultado",
      titulo: "El Balance",
      texto: "Si todo cuadra: lo que tiene CAYLA, lo que debe y lo que es tuyo. Si no, dice qué hay que resolver o que falta el punto de partida.",
    },
    {
      id: "tiendas",
      ancla: "fin-balance.tiendas",
      opcional: true,
      titulo: "Lo que es de cada tienda",
      texto: "Cuánta plata tiene metida cada tienda (su cajón, su mercadería, sus muebles, menos su parte de las facturas) y cuánto le rindió este mes. Sirve para comparar qué tienda aprovecha mejor cada sol.",
    },
    {
      id: "nota",
      ancla: "fin-balance.nota",
      opcional: true,
      titulo: "El capital no se inventa",
      texto: "El capital se registra una vez, al arrancar. Nunca se calcula como «lo que falta para que cuadre»: si así fuera, el Balance cuadraría siempre y no probaría nada.",
    },
    EXCEL,
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes cuánto vale CAYLA y cuánto tiene cada tienda. Para repasarlo: Mi perfil ▸ Demo ▸ Balance.",
    },
  ],
  alSalir: [{ tipo: "escape" }],
};

export const GUIA_FIN_IMPUESTOS: Guia = {
  id: "finanzas.impuestos",
  ruta: "/finanzas/impuestos",
  titulo: "Impuestos",
  resumen: "El IGV del mes: lo cobrado al vender menos lo pagado al comprar con factura.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "El IGV del mes",
      texto: "Lo que cobraste de IGV al vender, menos lo que pagaste de IGV al comprar con factura. El contador presenta los libros a SUNAT con lo que sale de aquí. Es una demo: no se declara ni se paga nada.",
    },
    {
      id: "registro-ventas",
      ancla: "fin-impuestos.registro-ventas",
      titulo: "Registro de ventas",
      texto: "Baja en Excel todas las boletas y facturas del mes, como las pide el contador.",
    },
    {
      id: "registro-compras",
      ancla: "fin-impuestos.registro-compras",
      titulo: "Registro de compras",
      texto: "Baja en Excel todas las facturas de compras y gastos del mes, con su IGV.",
    },
    {
      id: "paquete",
      ancla: "fin-impuestos.paquete",
      titulo: "Paquete para el contador",
      texto: "Los dos registros y el resumen del mes juntos, listos para mandarle al contador. En la demo no descargamos nada.",
    },
    {
      id: "cifras",
      ancla: "fin-impuestos.cifras",
      titulo: "El IGV en cuatro cifras",
      texto: "El IGV que cobraste al vender, el que descuentas por tus facturas de compra, lo que queda a pagar (o a tu favor para el mes siguiente) y el pago a cuenta del impuesto a la renta.",
    },
    {
      id: "limite",
      ancla: "fin-impuestos.limite",
      titulo: "El límite de ventas",
      texto: "Lo vendido en los últimos 12 meses contra el límite del régimen. Al cruzarlo, SUNAT pide llevar más libros. La franja rayada es a dónde llegarías a diciembre a este ritmo.",
    },
    {
      id: "revisar",
      ancla: "fin-impuestos.revisar",
      titulo: "Antes de declarar",
      texto: "Lo que puede hacer que pagues de más: compras con boleta (no dan IGV), comprobantes que SUNAT rechazó o no aceptó todavía, ventas sin comprobante. Cada punto lleva a donde se arregla.",
    },
    {
      id: "historial",
      ancla: "fin-impuestos.historial",
      titulo: "Los últimos 6 meses",
      texto: "Mes por mes: IGV cobrado, descontado, lo que tocó pagar y su estado. Al tocar un mes, toda la pantalla pasa a ese mes. El mes con asterisco va a la fecha y todavía puede cambiar.",
    },
    {
      id: "otro-mes",
      ancla: "fin-impuestos.otro-mes",
      titulo: "Otro mes",
      texto: "Para mirar un mes más antiguo que los seis de la lista.",
    },
    {
      id: "nota",
      ancla: "fin-impuestos.nota",
      titulo: "El pago a SUNAT",
      texto: "El pago del impuesto todavía no se registra aquí: llegará con Cuentas y dinero, porque sale de una cuenta de CAYLA.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes cuánto IGV toca y qué revisar antes de declarar. Para repasarlo: Mi perfil ▸ Demo ▸ Impuestos.",
    },
  ],
};

export const GUIA_FIN_CIERRE: Guia = {
  id: "finanzas.cierre",
  ruta: "/finanzas/cierre",
  titulo: "Cierre de mes",
  resumen: "Congelar un mes cuando ya está todo revisado: tienda por tienda y CAYLA entera.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "Cerrar el mes",
      texto: "Cerrar un mes lo congela: nadie puede registrar ni cambiar nada con fecha de ese mes, y sus números ya no se mueven. Se cierra cada tienda, el Taller y lo de la empresa; al final, CAYLA entera. Es una demo: no se cierra nada.",
    },
    {
      id: "matriz",
      ancla: "fin-cierre.matriz",
      titulo: "Cada parte de CAYLA",
      texto: "Una tarjeta por tienda, el Taller y lo de la empresa, con su estado: pendiente, lista para cerrar o cerrada. Arriba eliges qué mes se cierra.",
    },
    {
      id: "chequeos",
      ancla: "fin-cierre.chequeos",
      titulo: "Lo que se revisa antes",
      texto: "Para la parte elegida, el sistema revisa que las cajas estén cerradas, los egresos clasificados y que todo cuadre. Un ✓ está listo; un ! falta y no deja cerrar.",
    },
    {
      id: "resolver",
      ancla: "fin-cierre.resolver",
      opcional: true,
      titulo: "Resolver lo que falta",
      texto: "Cada cosa pendiente trae su botón, que te lleva a la pantalla donde se arregla. En la demo no salimos de aquí.",
    },
    {
      id: "boton",
      ancla: "fin-cierre.boton",
      titulo: "Cerrar esta parte",
      texto: "Se activa cuando no queda nada pendiente. Si ya está cerrada, «Reabrir» pide un motivo y queda en la historia. En la demo no lo tocamos.",
    },
    {
      id: "otra-unidad",
      ancla: "fin-cierre.otra-unidad",
      opcional: true,
      titulo: "Otra tienda",
      texto: "Al tocar otra tarjeta, ves lo que le falta a esa (te la abrimos).",
    },
    {
      id: "chequeos-otra",
      ancla: "fin-cierre.chequeos",
      opcional: true,
      preparar: [{ tipo: "clic", ancla: "fin-cierre.otra-unidad" }],
      titulo: "Lo que le falta a esa",
      texto: "Cada parte se revisa y se cierra por su cuenta: una tienda lista no espera a las demás.",
    },
    {
      id: "consolidado",
      ancla: "fin-cierre.consolidado",
      preparar: [{ tipo: "clic", ancla: "fin-cierre.primera-unidad" }],
      titulo: "CAYLA entera",
      texto: "Se cierra al final, cuando ya cerraron todas las partes. Mientras tanto dice cuántas faltan.",
    },
    {
      id: "rutina",
      ancla: "fin-cierre.rutina",
      titulo: "La rutina de fin de mes",
      texto: "Día 1, cada tienda cierra su última caja y clasifica sus egresos. Día 2, el líder revisa gastos fijos, facturas y el banco. Día 3, se mira el Estado de resultados y se cierra.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes cerrar un mes paso a paso. Para repasarlo: Mi perfil ▸ Demo ▸ Cierre de mes.",
    },
  ],
};

// Los módulos que un ROL puede ver (ADR-0150 retomado por el ADR-0161 B; migración 20260923030000_roles_por_modulo.sql).
//
// PROMETE: el catálogo de los módulos (el mismo de `retail.modulos`, en el mismo orden), la lista fija de lo que es
// «siempre solo del líder», lo que cada cuenta ve HOY sin haber leído la base, y la traducción de «qué módulos ve esta
// cuenta» a los permisos semánticos que ya preguntan las pantallas (`permisosDeModulos`). Lógica pura: se importa desde el
// servidor y desde el cliente, y se prueba con `modulos.test.ts`.
//
// LA REGLA (Felipe, 2026-09-22): un rol decide solo «ve / no ve» por módulo. Quien ve un módulo hace todo lo que hay en
// él, salvo la lista `SIEMPRE_SOLO_LIDER`, que vive en cada función de la base con `fn_es_lider()`.

import { PERMISOS, type Permiso } from "./menu";

export const CLAVES_MODULO = [
  "inicio",
  "vender", "apartados", "caja", "cambios", "devoluciones", "historial", "facturacion",
  "tienda_web", "pedidos_web", "vitrina_web", "campanas_web", "recomendaciones", "ajustes_web",
  "clientas", "avisos_club", "beneficios_club",
  "existencias", "conteos", "traslados", "movimientos", "recibir",
  "productos", "atributos", "etiquetas", "campanas", "liquidacion",
  "ordenes_compra", "facturas_compra", "por_pagar", "fondos", "proveedores", "plan_compra",
  "produccion", "ordenes_insumos",
  "analisis", "frescura", "plan_piso", "colaboradores", "roles",
  "configuracion",
  "gastos", "cuentas_dinero", "reportes_financieros", "impuestos", "cierre_mes",
  "actividad",
  "cayla_global",
  "rendimiento",
] as const;
export type ClaveModulo = (typeof CLAVES_MODULO)[number];

export type Modulo = {
  clave: ClaveModulo;
  grupo: "General" | "Ventas" | "Tienda web" | "Clientes" | "Inventario" | "Catálogo" | "Compras" | "Producción" | "Gestión" | "Finanzas";
  nombre: string;
  /** Lo que se da al encenderlo: quien ve el módulo hace todo esto. */
  incluye: string;
  /** Nunca se delega. Lo usaban Colaboradores y Roles y accesos (ADR-0150, decisión 3) hasta el 2026-09-22, cuando Felipe
   *  los abrió a cualquier rol (20260923131000). Hoy ningún módulo lo usa; queda por si uno nuevo nace así. */
  soloLider?: true;
  /** «Solo líder por ahora»: la base aún exige `fn_es_lider()` en sus funciones; encenderlo abriría una pantalla que
   *  falla al guardar. La base lo rechaza (`retail.modulos.delegable`). Desde 20260928220000 (ADR-0253, Felipe: «ningún
   *  módulo debería estar limitado a solo el líder») ningún módulo lo usa: Configuración, Impuestos y Cierre de mes, los
   *  últimos, se abrieron. Queda solo por si un módulo nuevo tiene que nacer así mientras se construye. */
  noDelegable?: true;
};

/** Espejo de `retail.modulos`. `modulos.test.ts` compara esta lista con la siembra de la migración. */
export const MODULOS: readonly Modulo[] = [
  // Inicio (20260925220000, Felipe 2026-09-25): antes no era de ningún módulo (lo veía toda persona, sin excepción).
  // Excepción a «un módulo nuevo nace solo del líder» (CLAUDE.md): nace ENCENDIDO en los roles que ya existen, o cada
  // cuenta se quedaba sin dónde aterrizar el mismo día. Una terminal de ventas no participa: su casa sigue siendo el
  // mostrador (regla propia de `aterrizajeDe`, `lib/menu.ts`), tenga o no este módulo.
  { clave: "inicio", grupo: "General", nombre: "Inicio", incluye: "Ver el tablero de inicio: lo del día, lo por atender y accesos rápidos a su tienda" },
  { clave: "vender", grupo: "Ventas", nombre: "Punto de venta", incluye: "Registrar ventas, descuento hasta su tope, dejar en espera, monto manual" },
  // Apartados (ADR-0196): se separó del Punto de venta a pedido de Felipe (2026-09-24). Nace sin rol: solo lo ve el líder.
  { clave: "apartados", grupo: "Ventas", nombre: "Apartados", incluye: "Apartar prendas con adelanto, entregar cobrando el saldo, extender, liberar y devolver el adelanto" },
  // Registrar el gasto de hoy desde la caja es de Caja, sin el módulo Gastos (ADR-0491, 20261023212000).
  { clave: "caja", grupo: "Ventas", nombre: "Caja", incluye: "Abrir y cerrar caja, ingresos y egresos, ajustes de caja, y registrar los gastos de hoy que se pagan del cajón o con el Yape o el Plin de la tienda" },
  { clave: "cambios", grupo: "Ventas", nombre: "Cambios", incluye: "Registrar cambios de prenda" },
  { clave: "devoluciones", grupo: "Ventas", nombre: "Devoluciones", incluye: "Solicitar devoluciones" },
  { clave: "historial", grupo: "Ventas", nombre: "Historial de ventas", incluye: "Consultar, reimprimir, exportar y corregir el pago mientras la caja siga abierta" },
  { clave: "facturacion", grupo: "Ventas", nombre: "Facturación", incluye: "Emitir boletas, facturas y notas; reenviar a SUNAT" },
  // Tienda web (ADR-0430, Felipe 2026-10-16; 20261016174000): el grupo de lo de la tienda online, justo después de Ventas (el mismo
  // lugar que en el lateral). Su Resumen nace SIN rol (solo el líder) y delegable; no trae funciones propias: lee con las lecturas de las
  // otras tres pantallas, y cada una pide SU módulo. Pedidos web, Vitrina web y Recomendaciones llegaron de Ventas, Catálogo y Clientes
  // sin cambiar quién los ve. Su quinta pantalla, Ajustes («Datos y plazos»), tiene su módulo desde 20261016223000 (abajo): antes la abría Configuración.
  { clave: "tienda_web", grupo: "Tienda web", nombre: "Resumen de la tienda web", incluye: "Ver de un vistazo lo que la tienda online pide hoy: los pedidos por atender de su tienda, las recomendaciones sin responder, quién espera una talla, qué modelos no se ven en la web y qué le falta a cada tienda para mostrarse (cada cosa, solo si también tiene su pantalla)" },
  // Pedidos web (ADR-0408, actividad 8; 20261015010000): lo que los clientes separan en la tienda online para esta tienda. Nace SIN rol
  // (solo el líder) y delegable: sus funciones piden este módulo (`fn_pedido_web_exigir`) y la tienda que se opera. Quien lo tiene ve
  // del cliente solo lo necesario para coordinar por WhatsApp (nombre, celular, el DNI a medias y si es del club), tenga o no «Clientes».
  { clave: "pedidos_web", grupo: "Tienda web", nombre: "Pedidos web", incluye: "Ver los pedidos que los clientes separan en la tienda online para su tienda, confirmarlos (de dónde sale cada prenda, conseguirla para una fecha o quitarla), no confirmarlos o anularlos con su motivo, cobrarlos, entregarlos con su código y, si ya pagó, anularlos devolviéndole su plata (el efectivo sale de la caja abierta de hoy) y anulando su boleta, y enviar a la tienda del pedido las prendas que se reservaron aquí" },
  // Vitrina web (ADR-0408, actividad 3; 20261014225000): qué modelos se ven en la tienda online y a qué precio web. Nace SIN rol
  // (solo el líder) y delegable: sus funciones piden este módulo. El costo y el margen siguen siendo del líder (la base no los manda).
  { clave: "vitrina_web", grupo: "Tienda web", nombre: "Vitrina web", incluye: "Elegir qué modelos se ven en la tienda online, mostrar u ocultar varios a la vez, fijarlos o quitarlos de Lo nuevo y armar los looks de «Arma tu look»" },
  // Campañas de la tienda web (Felipe 2026-10-21; 20261021161000): cómo se ve la tienda online durante cada campaña (ambiente del catálogo o
  // imagen propia, colores, movimiento, textos y dónde se muestra). El diseño cuelga de la campaña de Etiquetas; fechas, % y prendas no se
  // tocan aquí. Nace SIN rol (solo el líder) y delegable: sus funciones piden este módulo.
  { clave: "campanas_web", grupo: "Tienda web", nombre: "Campañas de la tienda web", incluye: "Elegir cómo se ve la tienda online durante cada campaña (el ambiente, los colores, el movimiento, los textos o una imagen propia y dónde se muestra), programarlo y verlo antes con un enlace privado. Las fechas, el descuento y las prendas se siguen armando en Catálogo ▸ Insignias" },
  // Recomendaciones (ADR-0408, Felipe 2026-10-15; 20261015135000): lo que los clientes recomiendan desde la tienda online, SIEMPRE con
  // su nombre. Nace SIN rol (solo el líder) y delegable: sus funciones piden este módulo. Quien lo tiene ve las de TODAS las tiendas y
  // las de CAYLA en general, con el nombre del cliente aunque no tenga «Clientes» (la ficha, solo si la ve).
  { clave: "recomendaciones", grupo: "Tienda web", nombre: "Recomendaciones", incluye: "Leer lo que los clientes recomiendan desde la tienda online, con su nombre y sobre qué tienda es, marcarlo como leído, responderles con un texto corto que ven en su cuenta y archivarlo" },
  // Datos y plazos (Felipe 2026-10-16; 20261016223000): Tienda web ▸ Ajustes. Antes la abría Configuración, que es mucho más (metas, fondo
  // de caja, gastos fijos, parámetros tributarios): para dar esta pantalla había que dar todo eso. Nace SIN rol (solo el líder) y delegable:
  // sus tres funciones propias piden este módulo (`fn_puede_ajustes_tienda_web`); `guardar_whatsapp_tienda`, compartida con Tiendas y
  // caja, acepta cualquiera de los dos. Configuración ya no abre esta pantalla.
  { clave: "ajustes_web", grupo: "Tienda web", nombre: "Datos y plazos de la tienda web", incluye: "Cambiar lo que la tienda online le muestra al cliente de cada tienda (nombre, WhatsApp, dirección, horario y si se ve en la web) y los plazos de los pedidos web (cuánto espera un pedido sin confirmar o sin pagar, cuánto sin recoger y desde cuántas unidades se muestra cuánto queda)" },
  { clave: "clientas", grupo: "Clientes", nombre: "Fichas de clientes", incluye: "Registrar, editar y archivar clientes; ver sus compras" },
  // Avisos del club (ADR-0288 act. g, G-8; 20261001210500): Clientas ▸ Avisos, los mensajes del club por mandar a las socias
  // con publicidad. Nace SIN rol (solo el líder) y delegable: sus funciones piden este módulo, no al líder.
  { clave: "avisos_club", grupo: "Clientes", nombre: "Avisos del club", incluye: "Ver los mensajes del club por mandar a los miembros con WhatsApp de su tienda (regalo de cumpleaños, puntos por vencer, novedades y rebajas en su talla), enviarlos por WhatsApp Web, deshacer un envío y anotar la BAJA" },
  // Beneficios del club (programa de puntos, actividad 8; 20261019215000): Clientes ▸ Beneficios del club, lo que se le ofrece al cliente
  // (cuánto vale cada punto, desde cuántos se canjea, cuánto dura un cupón, el regalo de cumpleaños), sin deploy. Nace SIN rol (solo el
  // líder) y delegable: sus funciones piden este módulo. Reemplaza la hoja «Beneficios del club» de Avisos.
  { clave: "beneficios_club", grupo: "Clientes", nombre: "Beneficios del club", incluye: "Ver y cambiar los beneficios del Club: cuánto vale cada punto, desde cuántos se canjea, cuánto dura un cupón y el regalo de cumpleaños, con lo que cuesta al negocio y los últimos cambios. Un cambio de lo que valen los puntos rige 15 días después de avisarlo" },
  // «Retirar del piso» (ADR-0208, bloque 2) vive en Existencias: el texto lo nombra para que el líder sepa qué da (20260926170000).
  // «Bajada al piso» y «Ajustar stock» NO son módulos (ADR-0306, Felipe 2026-10-02): son funciones de Existencias, porque no
  // tienen entrada propia en el menú. Regla: un módulo es una entrada del menú izquierdo; quien lo ve hace todo lo de adentro.
  { clave: "existencias", grupo: "Inventario", nombre: "Existencias", incluye: "Consultar stock, reponer el piso (bajar del almacén, subir y retirar), apartar prendas y ajustar stock" },
  { clave: "conteos", grupo: "Inventario", nombre: "Conteos", incluye: "Iniciar, registrar y cerrar conteos" },
  { clave: "traslados", grupo: "Inventario", nombre: "Traslados", incluye: "Enviar, recibir, cancelar y cerrar con diferencia" },
  { clave: "movimientos", grupo: "Inventario", nombre: "Movimientos", incluye: "Consultar y exportar" },
  // ADR-0393 (Felipe, 2026-10-14): Recibir vive en Inventario, para todos (20261014210000; la base de producción ya lo tenía ahí).
  { clave: "recibir", grupo: "Inventario", nombre: "Recibir mercadería", incluye: "Recibir envíos de proveedores" },
  { clave: "productos", grupo: "Catálogo", nombre: "Productos", incluye: "Crear, editar y archivar prendas; precios, fotos y códigos" },
  { clave: "atributos", grupo: "Catálogo", nombre: "Categorías, marcas y atributos", incluye: "Crear, editar, desactivar y aprobar propuestas" },
  // ADR-0473 (Felipe 2026-10-22): en pantalla se llamaron «Sellos» («etiqueta» queda para el papel con el precio) y desde el
  // 2026-10-23 se llaman «Insignias» (ADR-0481, 20261023142000); la clave no cambia.
  { clave: "etiquetas", grupo: "Catálogo", nombre: "Insignias", incluye: "Crear, editar, aprobar y archivar las insignias de las prendas (Nuevo, Top ventas, Hecho a mano…), con descuento o sin él, y ponérselas a las prendas" },
  // ADR-0473: las campañas salen de Atributos a su propia entrada. La clave `campanas` nació en Tienda web (PR #1190) y se muda
  // aquí (20261022151000, Felipe 2026-10-22: «reusar `campanas`»). Guarda una campaña quien ve Campañas, Campañas de la tienda web
  // o Insignias (`fn_puede_campanas`). Desde esa misma tarde no tiene fila propia: abre Catálogo ▸ Insignias, donde las campañas son
  // la primera vista (la fila Insignias la declara en sus `modulosAlternos`). Sigue siendo un módulo aparte en Roles y accesos.
  { clave: "campanas", grupo: "Catálogo", nombre: "Campañas", incluye: "Crear y archivar campañas (San Valentín, Halloween, Navidad…), elegir sus fechas, su descuento, sus prendas y las categorías donde rige, repetirlas el año siguiente e imprimir sus etiquetas de precio" },
  // ADR-0379 (Felipe 2026-10-10): las prendas sueltas que se liquidan sin entrar al catálogo. Nace sin rol (20261010195000);
  // el líder se lo da después a las terminales de almacén y caja.
  { clave: "liquidacion", grupo: "Catálogo", nombre: "Liquidación", incluye: "Etiquetar las prendas sueltas que se liquidan sin registrarlas en el catálogo, bajarles el precio con una etiqueta nueva y retirarlas" },
  // Órdenes de compra (ADR-0362, 20261010214500): lo que se le pide a cada proveedor antes de la factura. Nace SIN rol (solo el
  // líder) y delegable: sus funciones piden este módulo. Quien lo tiene ve las órdenes de TODAS las sedes con sus precios
  // (decisiones 34 y 37): no pasa por la regla de Compras por tienda (ADR-0184).
  // ADR-0480 (Compras simple, 20261022225000): la clave `ordenes_compra` se REUSA como «Mis compras». Unas 40 funciones de la
  // base la usan como llave (recibir, gastos del viaje, datos bancarios, proveedor nuevo, «Nos debe»); retirarla cambiaría en silencio
  // quién puede qué. Lo que se ve es la compradora en su celular; las pantallas de órdenes salen del menú.
  { clave: "ordenes_compra", grupo: "Compras", nombre: "Mis compras", incluye: "En el celular: abrir y cerrar tu ronda de compras, anotar la plata que te dieron, lo que compraste (proveedor, prendas y el papel) y otros gastos, y mandar lo comprado a cada tienda" },
  { clave: "facturas_compra", grupo: "Compras", nombre: "Historial de compras", incluye: "Ver todas las compras con su papel (factura, boleta, nota de venta o sin comprobante), lo que falta pagar y lo que falta llegar; adjuntar documentos, anular una compra sin pagos ni recepciones y descargar el mes para el contador" },
  { clave: "por_pagar", grupo: "Compras", nombre: "Por pagar", incluye: "Ver lo que se debe y registrar pagos" },
  // Fondos por rendir (ADR-0362, fase 6; 20261013181000): la plata que se le entrega a quien compra. Nace SIN rol (solo el líder) y
  // delegable: sus funciones piden este módulo, no al líder (decisión 35).
  // ADR-0480: «Revisar compras», la oficina. Misma clave y mismas funciones; cambia lo que se ve.
  { clave: "fondos", grupo: "Compras", nombre: "Revisar compras", incluye: "Confirmar la plata que anotaron las compradoras, completar las compras que llegaron a la tienda (serie y número del papel, y qué hacer si algo no cuadró), revisar sus gastos y recibir sus rondas cerradas" },
  { clave: "proveedores", grupo: "Compras", nombre: "Proveedores", incluye: "Crear, editar y archivar; cuentas bancarias, Yape y Plin" },
  // «Notas de crédito» se retiró (ADR-0480, 20261022225000): «por ahora no manejaremos notas de crédito» (Felipe, 2026-10-22).
  // Plan de campaña (ADR-0349, 20261005220000): cuánto comprar por categoría para una campaña (diciembre 2026 primero), con tres
  // escenarios, y compararlo después con lo vendido. Nace SIN rol (solo el líder) y delegable: sus funciones piden este módulo.
  { clave: "plan_compra", grupo: "Compras", nombre: "Plan de campaña", incluye: "Armar por categoría cuánto comprar para una campaña (tres escenarios, precio, costo, curva de tallas) y compararlo después con lo que se vendió" },
  { clave: "produccion", grupo: "Producción", nombre: "Órdenes de producción", incluye: "Crear, editar y cancelar órdenes; registrar avance" },
  // Órdenes de insumos (ADR-0362 fase 7, decisión 47; 20261013035000): lo que el Taller le pide a cada proveedor de tela y avíos, aparte
  // de la orden de tienda (decisiones 25 y 28). Nace SIN rol (solo el líder) y delegable: sus funciones piden este módulo y nada más.
  // Quien lo tiene ve y hace todo en esas órdenes, con sus precios, sin ver el resto de la plata del Taller; no necesita «Órdenes de
  // producción» (la pantalla vive en /ordenes-insumos, fuera del layout de /produccion).
  { clave: "ordenes_insumos", grupo: "Producción", nombre: "Órdenes de insumos", incluye: "Crear, ver, editar y anular las órdenes de compra de insumos del Taller, con sus precios, y descargar su PDF" },
  { clave: "analisis", grupo: "Gestión", nombre: "Análisis", incluye: "Reportes de ventas e inventario" },
  // Frescura del piso y Plan del piso viven en «Gestión» desde ADR-0392 (2026-10-13, migración 20261013134000: orden 212 y 214,
  // justo después de Análisis). Nacieron en «Inventario» (20260929100000 y 20261006100000); el lateral los muestra en «Gestión».
  // Frescura del piso (ADR-0208 paso 4, 20260929100000): cuánto lleva colgada cada prenda contra las demás de su categoría
  // en su sede, y qué hacer con lo que se queda. Nace SIN rol (solo el líder) y delegable: por el ADR-0253 sus tres
  // lecturas piden «el líder, o este módulo, en una sede que opera». Quien lo tiene sin ser líder ve SU sede entera; el
  // registro al colgar, «Las 3 tiendas» y la referencia de CAYLA (que leen las otras sedes) siguen siendo del líder.
  { clave: "frescura", grupo: "Gestión", nombre: "Frescura del piso", incluye: "Ver cuánto lleva colgada cada prenda de su tienda contra las demás de su categoría, y qué conviene hacer con la que se queda" },
  // Plan del piso (ADR-0329 + ADR-0328, actividad 12; 20261006100000): cuánto lugar tiene cada grupo de prendas en el riel de su
  // tienda. Primera entrega, solo lectura: la propuesta y los grupos del mix. Nace SIN rol (solo el líder) y delegable (ADR-0253).
  // Quien lo recibe sin ser líder VE la propuesta y los grupos; decidir a qué grupo va cada categoría sigue siendo del líder.
  { clave: "plan_piso", grupo: "Gestión", nombre: "Plan del piso", incluye: "Ver la propuesta de cuánto lugar tiene cada grupo de prendas en el piso de su tienda y contra qué se compara" },
  { clave: "colaboradores", grupo: "Gestión", nombre: "Colaboradores", incluye: "Dar y quitar accesos, suspender, cambiar ubicación" },
  { clave: "roles", grupo: "Gestión", nombre: "Roles y accesos", incluye: "Crear roles y asignarlos" },
  // ADR-0195 F1 (20260924210000): nació sin rol y «solo líder por ahora». Delegable desde el ADR-0253 (20260928220000):
  // con el módulo se hace todo lo del líder en sus pestañas, de todas las tiendas y de la empresa (`fn_puede_configurar`).
  { clave: "configuracion", grupo: "Gestión", nombre: "Configuración", incluye: "Metas de venta y fondo de caja de cada tienda, lo que cambia cada campaña en la caja, cuentas y cobros, gastos fijos, presupuesto y parámetros tributarios, de todas las tiendas" },
  // ADR-0195 F2 (20260924235100): nace sin rol; delegable (sus funciones preguntan por el módulo, no por el líder).
  // Con el módulo, una cuenta ve y registra los gastos de SU tienda; el líder, los de todas y los «de la empresa».
  { clave: "gastos", grupo: "Finanzas", nombre: "Gastos", incluye: "Registrar y anular los gastos de su tienda (luz, alquiler, movilidad) con o sin factura, sus gastos fijos del mes y sus activos fijos, y decir qué fue cada salida de plata del cajón" },
  // ADR-0195 (20260925100000): los que faltan de Finanzas, dados de alta juntos antes de construir F3–F10. Nacen sin rol.
  // Cuentas y dinero y Reportes son delegables (con el módulo, su tienda). Impuestos y Cierre de mes nacieron del líder y
  // se abrieron con el ADR-0253 (20260928220000): son de CAYLA entera, así que quien los tiene los ve como el líder.
  { clave: "cuentas_dinero", grupo: "Finanzas", nombre: "Cuentas y dinero", incluye: "Ver las cuentas y el efectivo de su tienda; registrar depósitos del cajón al banco, abonos de tarjeta y movimientos entre cuentas; ver lo que se debe y cuándo vence" },
  { clave: "reportes_financieros", grupo: "Finanzas", nombre: "Reportes financieros", incluye: "Ver el resumen, el estado de resultados, el flujo de caja y el balance de su tienda; cómo rindieron las campañas" },
  { clave: "impuestos", grupo: "Finanzas", nombre: "Impuestos", incluye: "Ver el IGV del mes de CAYLA entera (ventas contra compras), la alerta del límite de ventas del régimen y bajar el reporte para el contador" },
  { clave: "cierre_mes", grupo: "Finanzas", nombre: "Cierre de mes", incluye: "Cerrar el mes de cada tienda y de la empresa, y reabrirlo con motivo, viendo los números de todas las tiendas" },
  // ADR-0207 (20260926090000): el historial de cada módulo. No es una pantalla del lateral: se abre desde la cabecera
  // (botón «Actividad»). Nace sin rol; con el módulo, una cuenta ve la actividad de SU tienda; el líder, la de todas.
  // Solo para personas (`MODULOS_SOLO_PERSONAS`): una terminal compartida no revisa lo que hacen las demás.
  { clave: "actividad", grupo: "Gestión", nombre: "Actividad", incluye: "Ver quién hizo qué en cada módulo de su tienda: ventas, caja, cambios, apartados, existencias, conteos, traslados, productos, colaboradores, roles y configuración, con fecha, hora y persona" },
  // ADR-0275 (20260929140000, Felipe 2026-09-28): la vista de toda la empresa, desde el selector de sede. Excepción a «un
  // módulo nuevo nace visible para el líder»: nace QUITADO al Líder de equipo (`lider_modulos_ocultos`), así que al nacer
  // solo la ve el Admin, y solo un Admin la da (`fn_exigir_modulos_dentro_de_lo_mio`). Qué se usa ahí: `lib/vista-global.ts`.
  { clave: "cayla_global", grupo: "Gestión", nombre: "CAYLA Global", incluye: "Ver CAYLA como una sola empresa: las tiendas, el Taller y la empresa juntos, qué tan sano está el negocio y qué conviene decidir; desde el selector de sede" },
  // ADR-0219 (20260929160000, las 20 decisiones de Felipe del 2026-09-26): las ventas de cada persona del
  // mes, para reconocer y acompañar — sin comisión ni bono (D-65, D-112). Nace sin rol (ADR-0161): solo la ve
  // el líder hasta que Felipe se la da al rol de las encargadas. Solo para personas (`MODULOS_SOLO_PERSONAS`):
  // una terminal compartida no revisa el desempeño de nadie.
  { clave: "rendimiento", grupo: "Gestión", nombre: "Rendimiento", incluye: "Ver las ventas de cada persona del equipo en el mes: quién vende más por hora trabajada y quién cierra más ventas, y la ficha de cada quien" },
];

/** Lo que sigue siendo del líder aunque el rol vea el módulo: decisiones ya tomadas (ADR-0161 B2b), no nuevas.
 *  «Ver costos, márgenes y montos de Compras» (ADR-0126) SALIÓ de esta lista el 2026-09-22 (Felipe): los montos los ve
 *  quien tenga Facturas de compra, Por pagar o Notas de crédito (migración 20260923130000). «Poner etiquetas con descuento a
 *  una prenda» SALIÓ el 2026-09-30 (Felipe, ADR-0293): quien crea la prenda la etiqueta como quiera y quien tiene Etiquetas
 *  configura el descuento (migración 20261001130000). */
export const SIEMPRE_SOLO_LIDER: readonly { que: string; origen: string }[] = [
  // SALIERON el 2026-10-27 (Felipe, ADR-0534: la líder valida en persona): anular un comprobante y liberar uno no emitido
  // (Facturación), aprobar o rechazar devoluciones (Devoluciones) y decidir los grupos del plan del piso (Plan del piso).
  { que: "Anular una venta, y las series de SUNAT", origen: "ADR-0150, decisión 4" },
  { que: "Autorizar un descuento por encima del tope (a una persona; la terminal no tiene tope)", origen: "D-67" },
  // Colaboradores, y Roles y accesos, SALIERON de esta lista el 2026-09-22 (Felipe, 20260923131000). Lo que queda del
  // líder dentro de ellos son las protecciones mínimas de esa migración («decisión de arquitectura, revisable»):
  // ADR-0178 (Felipe, 2026-09-23): entre líderes manda el ADMIN, que se lee de Dynamic (admin allá + Líder aquí).
  { que: "Subir a alguien a Líder de equipo; cambiarle el rol o la sede, quitar, suspender o reactivar a un líder: solo un Admin (admin en Dynamic)", origen: "ADR-0178" },
  { que: "Siempre queda al menos un líder y un admin activos, y nadie se cambia su propio rol", origen: "ADR-0161 y ADR-0178" },
  { que: "Sin ser líder, solo se dan los módulos que uno mismo ve, y no se editan los del propio rol", origen: "ADR-0178" },
  // Las 6 decisiones (Felipe, 2026-09-22, migración 20260923140000):
  // OJO con la primera (corregido 2026-10-12, ADR-0161 «Actualización 2026-10-12»; el texto de la lista NO se tocó): la decisión P5 solo
  // cerró en la base el COSTO y `fn_resumen_variantes.en_red` para quien no es líder. El stock de las otras sedes en Existencias NO es solo
  // del líder: `fn_existencias` y `fn_stock_por_sede` piden solo `fn_tiene_acceso_retail()` (ADR-0270 y ADR-0289, migración 20261004110000) y
  // la web llena `enRed` para toda cuenta con Existencias (`lib/inventario-v2.ts`, vía `fn_stock_por_sede_json`), sin preguntar el rol.
  { que: "Ver el costo y el stock de las otras sedes en Existencias (Análisis analiza solo su sede)", origen: "ADR-0161 P5" },
  { que: "Ver lo comprado por el Taller en la ficha de un proveedor", origen: "ADR-0161 P3" },
  { que: "Colaboradores, y Roles y accesos, nunca van en el rol de una terminal: solo se dan a personas", origen: "ADR-0161 P6" },
];

/** Los módulos que nacen QUITADOS al Líder de equipo (su migración los inserta en `lider_modulos_ocultos`): al nacer solo
 *  los ve el Admin (`fn_ve_modulo`). Espejo de la base, para lo que la web supone sin haberla leído (`modulosDeHoy`). */
export const NACEN_QUITADOS_AL_LIDER: readonly ClaveModulo[] = ["cayla_global"];

/** Los módulos que solo se dan a PERSONAS, nunca a una terminal (ADR-0161 P6, Felipe 2026-09-22; en la base,
 *  `fn_exigir_rol_de_terminal`, migración 20260923140000): un aparato compartido de mostrador no da ni quita accesos.
 *  «Actividad» se sumó con el ADR-0207 (20260926090000): tampoco revisa lo que hacen las demás. «CAYLA Global», con el
 *  ADR-0275 (20260929140000): un aparato fijo a una tienda no mira la empresa entera. */
export const MODULOS_SOLO_PERSONAS: readonly ClaveModulo[] = ["colaboradores", "roles", "actividad", "cayla_global", "rendimiento"];

export function esClaveModulo(x: string): x is ClaveModulo {
  return (CLAVES_MODULO as readonly string[]).includes(x);
}

/** Se puede encender en un rol a medida (ni «solo del líder» ni «solo líder por ahora»). */
export function esDelegable(m: Modulo): boolean {
  return !m.soloLider && !m.noDelegable;
}

/** Un módulo que ve la cuenta. `completo = false`: lo VE pero sin sus capacidades de escritura (el rol está
 *  `limitado_como_hoy`, ADR-0161 B2d pendiente). */
export type ModuloDeCuenta = { clave: ClaveModulo; completo: boolean };

/** El «tipo» que tenían las terminales antes de los roles (ADR-0160/0162). Ya no decide nada en la base
 *  (20260923040000); solo sirve para leer una base VIEJA que todavía lo devuelve en `fn_mi_terminal()`. */
export type TipoTerminalLegado = "ventas" | "administrativa";
export const TIPOS_TERMINAL_LEGADO: readonly TipoTerminalLegado[] = ["ventas", "administrativa"];

/**
 * Lo que cada cuenta ve HOY, igual a la siembra de la migración (las claves son las de `retail.roles`, sin el prefijo
 * `terminal_`). Se usa solo si la base todavía no tiene `fn_mis_modulos()` (la web se publicó antes de pegar la
 * migración): la cuenta sigue viendo exactamente lo de antes.
 */
export const MODULOS_DE_HOY: Record<"integrante" | TipoTerminalLegado, readonly ModuloDeCuenta[]> = {
  integrante: (["vender", "caja", "cambios", "devoluciones", "historial", "clientas", "existencias", "conteos", "traslados", "movimientos", "productos", "atributos", "recibir", "produccion"] as const).map(
    (clave) => ({ clave, completo: false }),
  ),
  ventas: (["vender", "caja", "cambios", "devoluciones", "historial", "facturacion", "clientas"] as const).map((clave) => ({ clave, completo: true })),
  administrativa: (["existencias", "conteos", "traslados", "movimientos", "recibir", "productos", "atributos", "proveedores"] as const).map((clave) => ({
    clave,
    completo: true,
  })),
};

/** Sin `fn_mis_modulos()` en la base. `terminalLegado`: el tipo que devuelve una base VIEJA en `fn_mi_terminal()`; una
 *  terminal sin tipo reconocible no ve ningún módulo (falla cerrado: pierde poder, nunca lo gana). */
export function modulosDeHoy(
  rol: "lider" | "integrante",
  terminal: { legado: TipoTerminalLegado | null } | null = null,
): readonly ModuloDeCuenta[] {
  if (rol === "lider") return CLAVES_MODULO.filter((c) => !NACEN_QUITADOS_AL_LIDER.includes(c)).map((clave) => ({ clave, completo: true }));
  if (terminal) return terminal.legado ? MODULOS_DE_HOY[terminal.legado] : [];
  return MODULOS_DE_HOY.integrante;
}

/**
 * De los módulos que ve la cuenta a los permisos que preguntan las pantallas (`puede(persona, …)`). ESPEJA las
 * capacidades de la base (`fn_puede_*()` = líder o `fn_capacidad_por_modulos`), así pantalla y candado dicen lo mismo:
 *  - facturar               ← ve Facturación
 *  - gestionarCaja          ← ve Caja, completo (también registrar el gasto de hoy desde la caja sin el módulo Gastos:
 *                             `fn_puede_registrar_gasto`, ADR-0491)
 *  - ajustarInventario      ← ve Existencias, Conteos o Traslados, completo (cerrar conteo/traslado con diferencia;
 *                             sigue así desde antes de ADR-0250, a propósito: no es el botón «Ajustar»)
 *  - ajustarStock           ← lo mismo que ajustarInventario (`fn_puede_ajustar_stock`, ADR-0306): el botón «Ajustar» de
 *                             Existencias, Productos y Movimientos. Ajustar stock es una función de Existencias, no un módulo.
 *  - editarCatalogo         ← ve Productos o Categorías/atributos, completo
 *  - editarCuentasProveedor ← ve Proveedores, completo (`fn_puede_editar_cuentas_proveedor`; desde 20260923140000, P3,
 *                             también dar de alta, editar y archivar proveedores y abrir su ficha: `fn_puede_gestionar_proveedores`)
 *  - verDineroCompras       ← ve Facturas de compra, Por pagar o Notas de crédito, completo
 *                             (`fn_puede_ver_dinero_de_compras`, 20260923130000). Solo VER: qué ESCRIBE cada uno lo dice
 *                             `accionesDeCompra` (P1, 20260923140000)
 *  - editarEtiquetas        ← ve Insignias (`etiquetas`), completo (`fn_puede_editar_etiquetas`; también las etiquetas CON descuento, ADR-0293, ADR-0473)
 *  - analizar               ← ve Análisis, completo (`fn_puede_analizar`)
 *  - registrarGastos        ← ve Gastos, completo (`fn_gastos_ubicaciones`, ADR-0195 F2): los de SU tienda
 *  - verCuentasDinero       ← ve Cuentas y dinero, completo (ADR-0195 F3): las cuentas y el efectivo de SU tienda
 *  - verReportesFinancieros ← ve Reportes financieros, completo (ADR-0195 F5): los reportes de SU tienda
 *  - verImpuestos           ← ve Impuestos, completo (`fn_puede_ver_impuestos`, ADR-0253)
 *  - cerrarMes              ← ve Cierre de mes, completo (`fn_puede_cerrar_mes`, ADR-0253)
 * `administrar` y `verDinero` (el dinero del Taller y el Resumen de Producción) siguen siendo del líder: no salen de
 * ningún módulo delegable (`PERMISOS_SIN_MODULO`).
 *
 * El LÍDER (ADR-0253): tiene todos si ve todos los módulos; si un Admin le quitó alguno en Roles y accesos, pierde los
 * permisos que salen SOLO de lo quitado (como cualquier rol) y conserva los que no salen de ningún módulo. Lo que es
 * «siempre solo del líder» vive en la base (`fn_es_lider()`) y no depende de esto.
 */
export function permisosDeModulos(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[]): readonly Permiso[] {
  if (rol === "lider") {
    if (CLAVES_MODULO.every((c) => modulos.some((m) => m.clave === c))) return PERMISOS;
    const deSusModulos = permisosDeModulos("integrante", modulos.map((m) => ({ clave: m.clave, completo: true })));
    return PERMISOS.filter((p) => PERMISOS_SIN_MODULO.includes(p) || deSusModulos.includes(p));
  }
  const ve = (c: ClaveModulo) => modulos.some((m) => m.clave === c);
  const completo = (...cs: ClaveModulo[]) => modulos.some((m) => m.completo && cs.includes(m.clave));
  const permisos: Permiso[] = [];
  if (completo("analisis")) permisos.push("analizar");
  if (ve("facturacion")) permisos.push("facturar");
  if (completo("caja")) permisos.push("gestionarCaja");
  if (completo("existencias", "conteos", "traslados")) permisos.push("ajustarInventario");
  if (completo("existencias", "conteos", "traslados")) permisos.push("ajustarStock");
  if (completo("productos", "atributos")) permisos.push("editarCatalogo");
  if (completo("proveedores")) permisos.push("editarCuentasProveedor");
  if (completo("facturas_compra", "por_pagar")) permisos.push("verDineroCompras");
  if (completo("etiquetas")) permisos.push("editarEtiquetas");
  if (completo("gastos")) permisos.push("registrarGastos");
  if (completo("cuentas_dinero")) permisos.push("verCuentasDinero");
  if (completo("reportes_financieros")) permisos.push("verReportesFinancieros");
  if (completo("impuestos")) permisos.push("verImpuestos");
  if (completo("cierre_mes")) permisos.push("cerrarMes");
  return permisos;
}

/** Los permisos que no salen de ningún módulo: del líder, siempre (ADR-0253: quitarle módulos no se los quita). */
export const PERMISOS_SIN_MODULO: readonly Permiso[] = ["administrar", "verDinero"];

/**
 * ¿La cuenta USA este módulo? El líder, siempre; cualquier otra, si su rol lo ve COMPLETO (no `limitado_como_hoy`). Espeja
 * «`fn_es_lider()` o `fn_capacidad_por_modulos(array[clave])`», la forma de las capacidades de UN solo módulo. Existe para
 * lo que se decide módulo por módulo sin inventar un permiso por acción (ADR-0161 P1, 20260923140000: en Compras cada módulo
 * hace solo lo suyo —registrar/anular facturas, pagar, registrar notas de crédito— aunque los tres vean los montos).
 */
export function usaModulo(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[], clave: ClaveModulo): boolean {
  return rol === "lider" || modulos.some((m) => m.clave === clave && m.completo);
}

/**
 * Los módulos que, además del líder, abren «todas las tiendas y la empresa» en Finanzas (ADR-0253: Configuración y Cierre de mes,
 * «todo, como el líder»; ADR-0275: CAYLA Global). ESPEJA `retail.fn_ve_finanzas_de_todo()`: `lib/modulos.test.ts` la cruza con la
 * migración que la define, así la pantalla y el candado no pueden decir cosas distintas (auditoría de Finanzas 2026-10-16, G16).
 * @internal La usa la prueba que la cruza con la migración.
 */
export const MODULOS_QUE_VEN_TODO_FINANZAS: readonly ClaveModulo[] = ["configuracion", "cierre_mes", "cayla_global"];

/**
 * ¿Esta cuenta ve las finanzas de TODAS las tiendas y de la empresa (no solo las de su tienda)? Es la ÚNICA pregunta de alcance
 * de Finanzas en la web: espeja `fn_ve_finanzas_de_todo()` («`fn_es_lider()` o `fn_capacidad_por_modulos(…)`»). Una pantalla que
 * reparte columnas por tienda la usa en vez de `rol === "lider"`. No decide lo que es «solo del líder» de verdad (el Balance de
 * CAYLA entera, el Resumen): eso lo siguen decidiendo sus funciones con `fn_es_lider()`.
 */
export function veFinanzasDeTodo(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[]): boolean {
  return rol === "lider" || modulos.some((m) => m.completo && MODULOS_QUE_VEN_TODO_FINANZAS.includes(m.clave));
}

/** Qué hace cada cuenta con un comprobante de compra (ADR-0161 P1): cada acción es de UN módulo. */
export type AccionesDeCompra = { facturas: boolean; pagar: boolean; notas: boolean };
export function accionesDeCompra(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[]): AccionesDeCompra {
  return {
    facturas: usaModulo(rol, modulos, "facturas_compra"), // fn_puede_registrar_facturas_compra: registrar, anular, reparto, adjuntos
    pagar: usaModulo(rol, modulos, "por_pagar"), // fn_puede_pagar_compras: pagos y reembolsos
    notas: false, // ADR-0480: las notas de crédito de proveedor no se manejan por ahora (fn_puede_registrar_notas_credito, solo el líder)
  };
}

/** Normaliza lo que devuelve `fn_mis_modulos()`: ignora claves que esta versión de la web no conoce. */
export function leerModulos(filas: readonly { clave: string; completo: boolean }[]): ModuloDeCuenta[] {
  return filas.filter((f) => esClaveModulo(f.clave)).map((f) => ({ clave: f.clave as ClaveModulo, completo: !!f.completo }));
}

// Registro de la GUÍA DE FOCO por pantalla (regla — CLAUDE.md «Guía de foco», ADR-0284, Felipe 2026-09-29).
//
// La regla: toda pantalla o modal donde alguien llena campos o avanza por pasos le dice, en el propio lugar, qué está hecho, qué
// sigue y qué falta (`components/alta-producto/guia.tsx`, `useGuiaAlta.ts`, `lib/alta-producto-guia.ts`; modelo de una ficha que se
// edita: `components/ficha-producto/TiraFicha.tsx`). Este archivo es cómo se vigila y, a la vez, el tablero del despliegue módulo por
// módulo: `lib/guia-de-foco.test.ts` exige que CADA `page.tsx` de `app/(app)` esté aquí con uno de tres estados.
//
//   aplicada   la pantalla ya tiene su guía. `evidencia`: los archivos que usan las piezas (la prueba los abre y busca el uso: no se
//              puede declarar «aplicada» sin haberla puesto).
//   no-aplica  no hay nada que llenar ni pasos que seguir (un mensaje, una lista de solo lectura, una ruta técnica). `motivo` en
//              palabras del negocio; sin motivo, la prueba falla.
//   pendiente  DEUDA de las pantallas hechas antes de la regla. Una pantalla NUEVA no puede nacer aquí: o trae su guía o declara por
//              qué no aplica. Al terminar una, se pasa a «aplicada» y se baja `PENDIENTES_HOY` (la prueba exige la cuenta exacta:
//              así el tablero no miente ni en un sentido ni en el otro).
//
// Un modal o un componente con campos no es una `page.tsx`: la prueba no lo ve, pero la regla vale igual (casilla del PR).

export type PantallaGuia =
  | { estado: "aplicada"; evidencia: readonly string[] }
  | { estado: "no-aplica"; motivo: string }
  | { estado: "pendiente" };

/** Lo que una pantalla «aplicada» tiene que usar: al menos una de estas piezas aparece en cada archivo de su evidencia. */
export const PIEZAS_DE_LA_GUIA = ["MarcaCampo", "ConMarca", "FaltanDelPaso", "TiraFicha", "EtiquetaAhora", "CampoGuiado", "PieGuia", "useGuiaCampos"] as const;

/** Cuántas pantallas siguen `pendiente`. Baja a medida que se hacen; subir es romper la regla (una pantalla nueva no nace pendiente). */
export const PENDIENTES_HOY = 61;

const PENDIENTE: PantallaGuia = { estado: "pendiente" };

/** La ruta es la de la carpeta bajo `app/(app)`: «/» es Inicio y `[id]` se escribe tal cual. */
export const PANTALLAS: Record<string, PantallaGuia> = {
  // ---- Inicio ----
  "/": { estado: "no-aplica", motivo: "Panel de lectura: muestra lo que toca, lo nuevo y los accesos, sin campos que llenar ni pasos que seguir; su «Te toca» y «Sigue ahora» ya dicen qué sigue (Inicio de Almacén, ADR-0292). El único control parecido a un campo es la casilla «Ver N más»." },
  // ---- actividad ----
  "/actividad": PENDIENTE,
  // ---- buscar ----
  "/buscar": PENDIENTE,
  // ---- caja ----
  "/caja": PENDIENTE,
  "/caja/historial": PENDIENTE,
  // ---- cambios ----
  "/cambios": PENDIENTE,
  // ---- clientas ----
  "/clientas": { estado: "no-aplica", motivo: "Lista de clientas con buscador y filtros; todo lo que se llena vive en sus ventanas (registrar clienta, la ficha, «Llegó un mensaje de WhatsApp»), cada una con su guía en el registro de modales." },
  // ADR-0288 act. g (tanda 1g): una bandeja; lo único que se llena es quién envía (se enciende si falta). «Beneficios del club» es un modal.
  "/clientas/avisos": { estado: "aplicada", evidencia: ["components/clientas/AvisosClubPanel.tsx"] },
  "/clientas/cartel": { estado: "no-aplica", motivo: "Hoja de impresión del cartel del club: una hoja A4 por tienda con su QR; se revisa y se imprime, no hay campos que completar ni pasos." },
  // ---- colaboradores ----
  // Rediseño del 2026-10-05 (Equipo): una lista agrupada por sede con buscador y atajos; lo que se cambia vive en la ficha.
  "/colaboradores": { estado: "no-aplica", motivo: "Lista del equipo por sede, con buscador y atajos: no hay formulario que llenar. Lo que se cambia de una persona vive en su ficha (registro de modales), y las altas por aprobar se resuelven con un botón." },
  // ---- comercial ----
  "/comercial": PENDIENTE,
  "/comercial/calidad": PENDIENTE,
  // ---- compras ----
  "/compras": PENDIENTE,
  "/compras/@modal/(.)factura/[compraId]": PENDIENTE,
  "/compras/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/compras/factura/[compraId]": PENDIENTE,
  "/compras/notas-credito": PENDIENTE,
  "/compras/nueva": PENDIENTE,
  "/compras/parte/[compraId]": PENDIENTE,
  "/compras/por-pagar": PENDIENTE,
  // Plan de campaña (ADR-0349): lo que se llena (escenarios, precio, costo, lo que sobra, curva) vive en `FormularioCategoria`, el mismo formulario de la hoja de cada categoría y del paso a paso, con su guía de foco hecha. `PlanCategoriaModal` ya no tiene campos propios: por eso no figura entre los modales.
  "/compras/plan": { estado: "aplicada", evidencia: ["components/plan-compra/FormularioCategoria.tsx"] },
  "/compras/proveedores": PENDIENTE,
  "/compras/proveedores/[id]": PENDIENTE,
  // ---- configuracion ----
  "/configuracion": PENDIENTE,
  // ---- devoluciones ----
  "/devoluciones": PENDIENTE,
  // ---- etiquetas-de-precio ----
  "/etiquetas-de-precio": { estado: "no-aplica", motivo: "Hoja de impresión de etiquetas de precio: se revisa y se imprime; no hay campos que completar ni pasos." },
  // ---- rotulos ----
  "/rotulos": { estado: "no-aplica", motivo: "Hoja de impresión de rótulos de anaquel (ADR-0366): se eligen modelos con un solo buscador y se imprime; no hay campos obligatorios ni pasos." },
  // ---- finanzas ----
  "/finanzas": PENDIENTE,
  "/finanzas/cierre": PENDIENTE,
  "/finanzas/dinero": PENDIENTE,
  "/finanzas/dinero/conciliacion": PENDIENTE,
  "/finanzas/dinero/efectivo": PENDIENTE,
  "/finanzas/dinero/por-pagar": PENDIENTE,
  "/finanzas/gastos": PENDIENTE,
  "/finanzas/impuestos": PENDIENTE,
  "/finanzas/reportes": PENDIENTE,
  "/finanzas/reportes/balance": PENDIENTE,
  "/finanzas/reportes/campanas": PENDIENTE,
  "/finanzas/reportes/escenarios": PENDIENTE,
  "/finanzas/reportes/flujo": PENDIENTE,
  "/finanzas/reportes/presupuesto": PENDIENTE,
  "/finanzas/resumen": PENDIENTE,
  // ---- global ----
  "/global": PENDIENTE,
  "/global/elige-sede": PENDIENTE,
  // ---- inventario ----
  "/inventario": { estado: "no-aplica", motivo: "Lista de existencias con buscador y filtros: su único campo es el buscador, y lo que sigue lo dice «Para hoy» (tareas con su cifra y su botón, en orden; rediseño 2026-10-04). Lo que se llena vive en sus ventanas (Reponer, Subir, Ajustar, Dañadas), cada una con su guía en el registro de modales." },
  "/inventario/bajar": PENDIENTE,
  // ADR-0328 (actividad 3): nace con su guía. Escanear: «Lo guardado» (o «no hay nada guardado») y lo que hay que volver a escanear;
  // confirmar: quién cuadra y, si la sede ya se cuadró, por qué se vuelve a cuadrar (lo exige la base). Lógica en lib/cuadre-piso-reglas.ts.
  "/inventario/cuadrar": { estado: "aplicada", evidencia: ["components/cuadre-piso/CuadrarPisoForm.tsx"] },
  "/inventario/conteo": { estado: "aplicada", evidencia: ["components/AbrirConteo.tsx"] },
  "/inventario/conteo/[id]": PENDIENTE,
  // ADR-0328 (actividad 15): su único campo es «¿Quién cierra el conteo?», que aparece solo cuando hay que preguntarlo (terminal y conteo
  // de otro día); con él a la vista, la guía lo enciende y el pie dice qué falta. Sin él no hay nada que llenar: un botón.
  "/inventario/conteo/[id]/confirmar": { estado: "aplicada", evidencia: ["components/conteo/ConfirmarConteo.tsx"] },
  "/inventario/conteo/[id]/revisar": PENDIENTE,
  // «Ya decidí» (ADR-0208, paso 4b): el formulario de la hoja lleva la guía (qué hiciste, el traslado si es «La trasladé», quién anota;
  // la nota es opcional). Lo que cuenta como «falta» es lo mismo que apaga «Anotar»; la guía no agrega ninguna regla de negocio.
  "/inventario/frescura": { estado: "aplicada", evidencia: ["components/frescura/FrescuraDecidir.tsx"] },
  // Mudó a `/inventario/traslados/nuevo` (ADR-0242 D-4, 2026-10-03): esta ruta solo redirige, no tiene campos.
  "/inventario/mover": { estado: "no-aplica", motivo: "Solo redirige a /inventario/traslados/nuevo con los mismos parámetros: no tiene campos ni pasos." },
  "/inventario/movimientos": PENDIENTE,
  // ADR-0360 (maqueta A2 «Puente», Felipe 2026-10-07): el modal «Regularizar» pasó a ser el puente de la mesa; la guía dice qué prenda
  // elegir, cómo estaba y quién lo hace, y lo que falta sale de lo que ya apagaba el botón «Regularizar» (la regla de negocio no cambió).
  "/inventario/por-regularizar": { estado: "aplicada", evidencia: ["components/por-regularizar/MesaRegularizar.tsx", "components/por-regularizar/PuenteUnion.tsx", "components/por-regularizar/PanelPrendas.tsx"] },
  // Análisis v4 (ADR-0357): se lee, no se llena. El buscador filtra lo que se ve y los botones abren el flujo de cada acción en su
  // pantalla (ADR-0245), con su propia guía.
  "/inventario/resumen": {
    estado: "no-aplica",
    motivo: "Pantalla de lectura (Análisis v4, ADR-0357): no se llena ningún campo ni se avanza por pasos; cada botón abre el flujo de su acción en su propia pantalla.",
  },
  // ADR-0355: la billetera de pases. Abre el pase de lo primero que te toca, con su reverso (contar, revisar, anular): la misma guía
  // que «/inventario/traslados/(billetera)/[id]».
  "/inventario/traslados/(billetera)": { estado: "aplicada", evidencia: ["components/traslados-pases/ReversoPase.tsx", "components/traslados-pases/PasePedido.tsx"] },
  // La deuda de «/inventario/mover» se mudó aquí tal cual (el formulario de envío; tarea #8 del análisis de Traslados): no es una pantalla nueva.
  "/inventario/traslados/nuevo": PENDIENTE,
  // ADR-0355: el pase y su reverso. «Falta» = lo que ya bloquea la base: al contar, cada prenda enviada sin número (lo mismo que
  // apaga «Terminé de contar»; la siguiente se enciende y el pie las nombra); quién recibe (ADR-0328); al cerrar con diferencia, la
  // nota; al anular, el motivo y quién. Piso o almacén no es «falta»: viene marcado (D-131).
  "/inventario/traslados/(billetera)/[id]": { estado: "aplicada", evidencia: ["components/traslados-pases/ReversoPase.tsx", "components/traslados-pases/PasePedido.tsx"] },
  "/inventario/traslados/guia/[id]": { estado: "no-aplica", motivo: "Hoja de impresión de la guía de una caja (ADR-0242 D-3): se elige la hoja (térmica o A4, con valor de fábrica) y se imprime; no hay campos que completar ni pasos." },
  // ---- movimientos ----
  "/movimientos": PENDIENTE,
  // ---- pedidos-no-atendidos ----
  "/pedidos-no-atendidos": PENDIENTE,
  // ---- produccion ----
  "/produccion": PENDIENTE,
  "/produccion/comprobantes": PENDIENTE,
  "/produccion/cotizaciones-maquila": PENDIENTE,
  "/produccion/eficiencia": PENDIENTE,
  "/produccion/insumos": PENDIENTE,
  "/produccion/ordenes": PENDIENTE,
  "/produccion/por-pagar": PENDIENTE,
  "/produccion/proveedores": PENDIENTE,
  "/produccion/recibir": PENDIENTE,
  // ---- productos ----
  "/productos": PENDIENTE,
  "/productos/@modal/(.)[id]/historial": { estado: "no-aplica", motivo: "El mismo historial de solo lectura abierto como ventana (ADR-0354); solo hay filtros de tipo y de persona." },
  "/productos/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/productos/[id]/editar": { estado: "aplicada", evidencia: ["components/ProductoForm.tsx"] },
  "/productos/[id]/historial": { estado: "no-aplica", motivo: "Historial de solo lectura de una prenda (ADR-0354); solo hay filtros de tipo y de persona." },
  "/productos/atributos": { estado: "no-aplica", motivo: "Tablero de tarjetas, búsqueda y filtros por pestaña; todo lo que se llena vive en ventanas propias (colores, tejidos, patrones, tallas, temporadas, etiquetas), cada una con su guía en el registro de modales." },
  "/productos/categorias": PENDIENTE,
  "/productos/familias": { estado: "no-aplica", motivo: "Muestra las familias como tarjetas de solo lectura; lo que se llena vive en la ventana «Nueva familia», que lleva su propia guía (registro de modales)." },
  "/productos/marcas": { estado: "aplicada", evidencia: ["components/alta-producto/NuevaMarcaForm.tsx"] },
  "/productos/nuevo": { estado: "aplicada", evidencia: ["components/NuevoProductoForm.tsx", "components/alta-producto/piezas.tsx"] },
  "/productos/por-revisar": { estado: "no-aplica", motivo: "Cola de solo lectura de las prendas que alguien propuso (ADR-0371): cada fila trae sus datos y dos botones, Aprobar y Rechazar; no hay campos que llenar ni pasos que seguir. Lo único que se elige —quién firma— vive en la hoja de cada decisión (components/RevisarProductoHoja.tsx)." },
  // ---- recibir ----
  // ADR-0330: la puerta «Llegó mercadería» trae su guía (proveedor → prendas → quién recibe). La rama «contra factura»
  // (`RecepcionEnvio`) sigue declarada como modal pendiente más abajo.
  "/recibir": { estado: "aplicada", evidencia: ["components/LlegoMercaderia.tsx"] },
  // ---- rendimiento ----
  "/rendimiento": { estado: "no-aplica", motivo: "La pantalla solo lee: cifras, tabla, gráfico y rankings, sin campos ni pasos. El único formulario es el modal «Meta de…», que sí trae su guía." },
  // ---- sin-acceso ----
  "/sin-acceso": { estado: "no-aplica", motivo: "Solo muestra un mensaje y un enlace: no hay campos ni pasos." },
  // ---- vender ----
  "/vender": PENDIENTE,
  "/vender/apartados": PENDIENTE,
  "/vender/comprobantes": PENDIENTE,
  "/vender/comprobantes/emitidos": PENDIENTE,
  "/vender/comprobantes/por-reintentar": PENDIENTE,
  "/vender/comprobantes/proformas": PENDIENTE,
  "/vender/comprobantes/series": PENDIENTE,
  "/vender/historial": PENDIENTE,
};

// ---------------------------------------------------------------------------------------------------------------------------------
// MODALES (ADR-0284, actualización f). Un MODAL es todo archivo bajo `components/` o `app/(app)/` que dibuja un `<Modal>`, un `<ModalRuta>`
// o un `Dialog.Content` y tiene campos. Igual que las pantallas, cada uno se declara aquí, y la prueba falla si aparece uno sin declarar.
// Dentro de un modal la guía ENCIENDE el control que sigue —caja de texto, combo, chips, interruptor, un grupo de cajas— con
// `useGuiaCampos` + `<CampoGuiado>` + `<PieGuia>` (`components/guia-de-foco/`); la clave es la ruta del archivo bajo `apps/web`.
// El comentario de cada `pendiente` dice cuántos controles trae: con UNO solo no hay camino que indicar y suele ser «no-aplica» (con motivo).
// Un archivo que es a la vez el formulario principal de una pantalla y dibuja un `<Modal>` cuenta como modal: sepáralo si hace falta.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Cuántos modales siguen `pendiente`. Baja a medida que se hacen; un modal nuevo no nace pendiente. */
export const MODALES_PENDIENTES_HOY = 57;

export const MODALES: Record<string, PantallaGuia> = {
  "components/AdjuntosCompra.tsx": PENDIENTE, // 3 controles
  "components/AjustarInventarioModal.tsx": { estado: "aplicada", evidencia: ["components/AjustarInventarioModal.tsx"] },
  "components/AnularVentaForm.tsx": PENDIENTE, // 4 controles
  "components/ApartadosModal.tsx": PENDIENTE, // 3 controles
  // ADR-0328 (actividad 9): «La tengo en la mano» en Bajar al piso. Lo que falta es solo quién lo hace (lo mismo que apaga el botón);
  // de dónde salió es opcional (la nota automática va siempre).
  "components/BajarEnManoModal.tsx": { estado: "aplicada", evidencia: ["components/BajarEnManoModal.tsx"] },
  "components/BuscadorGlobal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/CambiarEstadoProductosHoja.tsx": { estado: "no-aplica", motivo: "Confirmación de UN solo control (quién firma): el título dice qué prendas cambian y a qué estado, y la nota cómo volver atrás; no hay camino que indicar. Salió de ProductosTabla.tsx (que era pendiente por esta misma hoja) para que la use también la vista rápida." },
  "components/CategoriasLista.tsx": PENDIENTE, // 14 controles
  // «Falta» = lo mismo que apaga el botón «Cerrar»: la tienda (si se elige entre varias) y el motivo. La nota es opcional (ADR-0334).
  "components/CerrarColaArranqueModal.tsx": { estado: "aplicada", evidencia: ["components/CerrarColaArranqueModal.tsx"] },
  "components/CerrarCajaModalV2.tsx": PENDIENTE, // 10 controles
  "components/CerrarFaltanteModal.tsx": PENDIENTE, // 5 controles
  // ADR-0328 (actividad 4): la hoja «Cierre de la carga inicial» de Configuración ▸ Tiendas y caja. Falta: la fecha (que cambie y la
  // base la acepte: `validarCierre`) y quién hace el cambio.
  // ADR-0354: la hoja de «Revisar y guardar» de Editar producto suma UN solo control, «Quién hace estos cambios»; su porqué va
  // bajo el combo y el botón espera hasta que haya alguien de turno.
  "components/ConfirmarCambios.tsx": { estado: "no-aplica", motivo: "Hoja de confirmación con un solo control (Responsable): el botón dice por qué espera." },
  "components/ConfiguracionCargaInicial.tsx": { estado: "aplicada", evidencia: ["components/ConfiguracionCargaInicial.tsx"] },
  // ADR-0288 tanda 1b: la ficha ganó las acciones del club y, con ellas, la guía en cada acción que se llena. Tanda 1g: se fueron «Unirse al
  // club», su QR y «Llegó su mensaje» (ella se une desde el cartel); quedan editar, archivar, unir y «Registrar su BAJA» (un solo control:
  // quién la registra, dentro de la misma hoja).
  "components/ClientaFichaModal.tsx": { estado: "aplicada", evidencia: ["components/ClientaFichaModal.tsx"] },
  // Desde ADR-0341 solo queda aquí confirmar desactivar o reactivar una terminal («Dar acceso» se mudó a colaboradores/DarAccesoModal).
  "components/ColaboradoresModales.tsx": { estado: "no-aplica", motivo: "Confirmación de desactivar o reactivar una terminal: lo único que pide es quién lo hace (el combo de toda la pantalla) y un botón." },
  "components/ColoresLista.tsx": { estado: "aplicada", evidencia: ["components/ColoresLista.tsx"] },
  "components/ComboResponsable.tsx": PENDIENTE, // 2 controles
  "components/CompraDetallePanel.tsx": PENDIENTE, // 8 controles
  "components/ComprobanteProduccionDetalle.tsx": PENDIENTE, // 2 controles
  "components/ComprobanteProduccionForm.tsx": PENDIENTE, // 13 controles
  "components/ComprobantesPanel.tsx": PENDIENTE, // 6 controles
  "components/ConfiguracionImpuestos.tsx": PENDIENTE, // 6 controles
  "components/ConfirmarConResponsable.tsx": { estado: "no-aplica", motivo: "Confirmación corta de una acción de un clic (aprobar, desactivar, reactivar), hoy sin responsable: un solo botón, no hay camino que indicar." },
  "components/ConfirmarTransmision.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/CotizacionesMaquilaPanel.tsx": PENDIENTE, // 6 controles
  "components/DetalleMuestraModal.tsx": { estado: "no-aplica", motivo: "Es el detalle de un tejido o patrón: se mira la foto y las prendas que lo usan, y subir una foto, generar un dibujo o quitar la imagen son acciones opcionales de un clic; no hay campo obligatorio ni pasos." },
  "components/EditarMarcaModal.tsx": { estado: "aplicada", evidencia: ["components/EditarMarcaModal.tsx"] },
  "components/EliminarProductoModal.tsx": { estado: "no-aplica", motivo: "Confirmación de UN solo control (quién firma): el texto ya dice qué se borra y por qué; no hay camino que indicar." },
  "components/EtiquetasLista.tsx": { estado: "aplicada", evidencia: ["components/EtiquetasLista.tsx"] },
  "components/FamiliasLista.tsx": { estado: "aplicada", evidencia: ["components/FamiliasLista.tsx"] },
  "components/FiltrosExistencias.tsx": { estado: "no-aplica", motivo: "Hoja de filtros de Existencias en el celular (misma estructura que Productos, 2026-10-03): cada control filtra la lista al tocarlo y el botón dice cuántos productos quedan; no hay nada que completar ni pasos que seguir." },
  "components/FiltrosHistorialVentas.tsx": PENDIENTE, // 3 controles
  "components/FiltrosProductos.tsx": { estado: "no-aplica", motivo: "Hoja de filtros de Productos en el celular (ADR-0308): cada control filtra la lista al tocarlo y el botón dice cuántas prendas quedan; no hay nada que completar ni pasos que seguir." },
  "components/FiltrosMovimientos.tsx": PENDIENTE, // 3 controles
  "components/GastosFijosYActivos.tsx": PENDIENTE, // 17 controles
  "components/GastosPanel.tsx": PENDIENTE, // 13 controles
  "components/InsumoModales.tsx": PENDIENTE, // 18 controles
  "components/MovimientoCajaModal.tsx": PENDIENTE, // 6 controles
  "components/NuevaClientaModal.tsx": { estado: "aplicada", evidencia: ["components/NuevaClientaModal.tsx"] },
  // Precio por tienda (Felipe 2026-10-09): «Precio distinto en una sede» (tienda, precio, por qué, quién) y «Quitar» (quién).
  "components/ficha-producto/PrecioSedeModal.tsx": { estado: "aplicada", evidencia: ["components/ficha-producto/PrecioSedeModal.tsx"] },
  "components/GastoRapidoModal.tsx": { estado: "aplicada", evidencia: ["components/GastoRapidoModal.tsx"] },
  "components/IngresoRapidoModal.tsx": { estado: "aplicada", evidencia: ["components/IngresoRapidoModal.tsx"] },
  "components/CorregirPagoModal.tsx": { estado: "aplicada", evidencia: ["components/CorregirPagoModal.tsx"] },
  "components/RevisarProductoHoja.tsx": { estado: "no-aplica", motivo: "Confirmación de UN solo control (quién firma): el título dice qué prenda se aprueba o se rechaza y la nota qué pasa después; cuando el rechazo está bloqueado (orden en proceso o stock) la hoja no pide nada, dice qué lo frena y a dónde ir. No hay camino que indicar (ADR-0371)." },
  "components/plan-compra/NuevaCampanaModal.tsx": { estado: "aplicada", evidencia: ["components/plan-compra/NuevaCampanaModal.tsx"] },
  "components/plan-compra/TopeModal.tsx": { estado: "aplicada", evidencia: ["components/plan-compra/TopeModal.tsx"] },
  "components/rendimiento/EditarMetaModal.tsx": { estado: "aplicada", evidencia: ["components/rendimiento/EditarMetaModal.tsx"] },
  "components/NuevaOrdenProduccionForm.tsx": PENDIENTE, // 11 controles
  "components/NuevaProformaModal.tsx": PENDIENTE, // 10 controles
  "components/OrdenModales.tsx": PENDIENTE, // 4 controles
  "components/OrdenPanel.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/PagarComprobanteProduccionModal.tsx": PENDIENTE, // 3 controles
  "components/PagoJuntosModal.tsx": PENDIENTE, // 6 controles
  "components/PatronesLista.tsx": { estado: "aplicada", evidencia: ["components/PatronesLista.tsx"] },
  // ADR-0328 act. 17: «Para enviar» en Traslados. Su ventana «Ya no la envío»: «falta» = el porqué (la base lo exige) y quién lo hace.
  "components/ParaEnviar.tsx": { estado: "aplicada", evidencia: ["components/ParaEnviar.tsx"] },
  // ADR-0328 act. 17: «Subir al almacén» (el primer paso de un pedido colgado), «Avisar al cliente» que llegó o que no va a
  // llegar, y «¿Sigue en pie?» (a los 7 días; decisión del 2026-10-04).
  "components/PedidoClienteModales.tsx": { estado: "no-aplica", motivo: "Tres ventanas de confirmación de un solo control: elegir quién lo hace (el combo Responsable). «Subir al almacén» confirma que la prenda del pedido se guardó; «Avisar al cliente» abre WhatsApp con el mensaje listo; «¿Sigue en pie?» se responde con uno de dos botones. No hay campos que llenar ni pasos." },
  // «Falta» = lo mismo que apaga el botón «Pedir»: la tienda (si se elige), al menos una prenda y quién registra. La nota es opcional.
  "components/PedirAOtraSedeModal.tsx": { estado: "aplicada", evidencia: ["components/PedirAOtraSedeModal.tsx"] },
  // ADR-0328 act. 17: «Pedir y apartar para el cliente» (Vender y Apartados). «Falta» = lo que apaga el botón y la base rechaza:
  // talla y tienda (si hay más de una), nombres, apellidos, celular de 9 dígitos que empieza en 9, y quién atiende. Nota opcional.
  "components/PedirYApartarModal.tsx": { estado: "aplicada", evidencia: ["components/PedirYApartarModal.tsx"] },
  "components/PerfilModal.tsx": PENDIENTE, // 12 controles
  "components/PrendaSinRegistrarModal.tsx": { estado: "aplicada", evidencia: ["components/PrendaSinRegistrarModal.tsx"] },
  "components/PrendasDeEtiquetaModal.tsx": { estado: "aplicada", evidencia: ["components/PrendasDeEtiquetaModal.tsx"] },
  "components/ProveedorModal.tsx": PENDIENTE, // 13 controles
  "components/ProveedorProduccionModal.tsx": PENDIENTE, // 13 controles
  "components/PuntoDeVenta.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/PuntoDeVentaTicket.tsx": PENDIENTE, // 12 controles
  // «Falta» = lo mismo que apaga el botón «Reabrir»: el motivo (único control obligatorio) (ADR-0334).
  "components/ReabrirPrendaModal.tsx": { estado: "aplicada", evidencia: ["components/ReabrirPrendaModal.tsx"] },
  "components/SugerenciasColaModal.tsx": {
    estado: "no-aplica",
    motivo: "Es una revisión, no un formulario (ADR-0334): la persona marca o desmarca sugerencias ya armadas por la base; no hay campos que llenar ni pasos. El único requisito —al menos una marcada— lo dice el propio botón («Marca al menos una»).",
  },
  "components/ReasignarReparto.tsx": PENDIENTE, // 9 controles
  "components/RecepcionEnvio.tsx": PENDIENTE, // 16 controles
  "components/RecibirComprobanteModal.tsx": PENDIENTE, // 7 controles
  "components/RegistrarGastoModal.tsx": PENDIENTE, // 29 controles
  "components/RegistrarNotaCreditoModal.tsx": PENDIENTE, // 9 controles
  // ADR-0328 act. 10: cuál (color y talla), dónde estaba, cuántas, qué tiene y quién: todo cuenta como «falta» (lo exige la base).
  // ADR-0328 act. 10 («Se arregló»): la guía enciende lo del panel abierto —qué se arregló, o precio y forma de pago al liquidar— y
  // quién decide. La nota de «Se botó» / «Donada» es opcional.
  "components/ResolverDanadosModal.tsx": { estado: "aplicada", evidencia: ["components/ResolverDanadosModal.tsx"] },
  "components/ResumenPrevioEnvio.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/RolesModales.tsx": PENDIENTE, // 17 controles
  "components/RolesPanel.tsx": PENDIENTE, // 5 controles
  "components/SaldoFavorAcciones.tsx": PENDIENTE, // 7 controles
  "components/SeriesPanel.tsx": PENDIENTE, // 8 controles
  "components/TallasLista.tsx": { estado: "aplicada", evidencia: ["components/TallasLista.tsx"] },
  "components/TejidosLista.tsx": { estado: "aplicada", evidencia: ["components/TejidosLista.tsx"] },
  "components/TemporadasLista.tsx": { estado: "aplicada", evidencia: ["components/TemporadasLista.tsx"] },
  "components/TerminalesModales.tsx": PENDIENTE, // 6 controles
  "components/actividad/BotonActividad.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  // ADR-0288 act. g (tanda 1g): «Beneficios del club», del líder, desde Clientas ▸ Avisos. Llega con lo vigente: la guía se mueve cuando algo
  // se borra o se escribe mal (`lib/club-beneficios-guia.ts`, la misma regla que apaga «Guardar»).
  // ADR-0341: Dar acceso en una hoja. Falta = lo mismo que apaga el botón: a quién, la sede, el rol (si se leyeron los roles) y quién lo da.
  "components/colaboradores/DarAccesoModal.tsx": { estado: "aplicada", evidencia: ["components/colaboradores/DarAccesoModal.tsx"] },
  "components/clientas/BeneficiosClubModal.tsx": { estado: "aplicada", evidencia: ["components/clientas/BeneficiosClubModal.tsx"] },
  "components/alta-producto/ElegirColores.tsx": { estado: "no-aplica", motivo: "Elegir colores sirve a la fila «Colores» de Nuevo producto, que ya lleva su guía (FilaAlta). Su hoja «Nuevo color» (2026-10-02) pide solo nombre y tono: la familia y el código se llenan solos, y lo que falta se dice al tocar «Crear y elegir»." },
  "components/alta-producto/ProponerValor.tsx": { estado: "no-aplica", motivo: "Modal «Nuevo tejido / patrón / talla» (2026-10-02): un solo campo, el nombre; «Agregar» se apaga mientras está vacío." },
  "components/alta-producto/ElegirEtiquetas.tsx": { estado: "no-aplica", motivo: "Hoja de elegir etiquetas que sirve a la fila «Etiquetas» de Nuevo producto, que ya lleva su guía (FilaAlta); elegir es opcional y «Listo» aplica lo marcado." },
  "components/alta-producto/ElegirMuestra.tsx": { estado: "no-aplica", motivo: "Hoja de elegir tejido o patrón que sirve a esas filas de Nuevo producto, que ya llevan su guía (FilaAlta); no tiene campo obligatorio propio: tocar una muestra la elige." },
  "components/alta-producto/ElegirTallas.tsx": { estado: "no-aplica", motivo: "Hoja de elegir tallas que sirve a la fila «Tallas» de Nuevo producto, que ya lleva su guía (FilaAlta); no tiene campo obligatorio propio: «Listo» aplica lo marcado." },
  "components/alta-producto/HojaParecidas.tsx": { estado: "no-aplica", motivo: "Hoja «Ver y comparar» de Nuevo producto: un solo campo (el buscador, opcional) y una respuesta por prenda («Es el mismo diseño» o «No, es otro diseño»); lo que falta y lo que sigue lo dicen la alerta del resumen y el pie del paso 2, que ya llevan la guía." },
  // ADR-0357 (Análisis v4): «Liquidar desde … para todas las tiendas». El número se mueve en «No se vende»; esta hoja solo lo confirma.
  "components/analisis/HojaLiquidarDesde.tsx": { estado: "no-aplica", motivo: "Hoja de confirmación de UN solo control (quién lo cambia, el combo Responsable): dice el nuevo «Liquidar desde» y cuántas prendas de tu tienda entran a «Liquidar»; el botón se apaga hasta elegir y dice por qué." },
  "components/apartados/ModalesApartado.tsx": PENDIENTE, // 22 controles
  "components/conteo/AltaAlVuelo.tsx": PENDIENTE, // 7 controles
  "components/conteo/CancelarConteoModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/ficha-producto/FotosPorColor.tsx": PENDIENTE, // 2 controles
  "components/finanzas/CierreMes.tsx": PENDIENTE, // 5 controles
  "components/finanzas/ConfiguracionCuentas.tsx": PENDIENTE, // 9 controles
  "components/finanzas/ConfiguracionPresupuesto.tsx": PENDIENTE, // 4 controles
  "components/finanzas/CuentasDinero.tsx": PENDIENTE, // 20 controles
  "components/finanzas/EditarCuentaModal.tsx": PENDIENTE, // 9 controles
  "components/finanzas/EstadoResultadosPanel.tsx": PENDIENTE, // 3 controles
  "components/finanzas/PagosSinCuenta.tsx": PENDIENTE, // 2 controles
  "components/finanzas/SaldosArranqueModal.tsx": PENDIENTE, // 3 controles
  // ADR-0288 tanda 1a: la hoja ganó el alta de la clienta. Tanda 1g: solo el documento (tipo, número, nombre) y quién atiende.
  "components/punto-de-venta/ClientaDelTicket.tsx": { estado: "aplicada", evidencia: ["components/punto-de-venta/ClientaDelTicket.tsx"] },
  "components/punto-de-venta/Esperas.tsx": PENDIENTE, // 2 controles
  "components/punto-de-venta/RegistrarBajadaModal.tsx": { estado: "no-aplica", motivo: "Confirmación de UN solo control (quién atiende, el mismo combo del ticket) antes de registrar desde Vender la bajada al piso que se olvidó (ADR-0321): el texto dice qué prenda entra y dónde queda; el botón se apaga hasta elegir y dice por qué." },
};

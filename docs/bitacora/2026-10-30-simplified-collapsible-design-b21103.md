## 2026-10-30 — La frase de la cabecera, detrás de un «?» de vidrio (ronda 18 de `/unificar`)

- **Qué:** la frase bajo el título de toda cabecera (`EncabezadoPagina subtitulo`) ya no se ve: la abre un «?» de vidrio de 20 px, arriba a la derecha de la última palabra del título como un superíndice, en un globo de vidrio con la letra a 16 px (`components/ui/AyudaCabecera.tsx`, `app/estilos/ayuda-cabecera.css`). También la frase que dice un dato, y lo que explicaba un «!» metido en el título (9 pantallas de Catálogo, Buscar, Rendimiento y el Plan de campaña) pasó a la prop `ayuda`.
- **Por qué:** las colaboradoras decían que el texto era chico y nadie lo leía. Felipe eligió mirando, en dos vueltas: globo (P2), datos también (D2), vidrio esmerilado (V1). Registro: `docs/unificar/titulo-pagina.md`, «Ronda 18»; ADR-0358.
- **Cómo verificas:** abre `/finanzas/gastos` o `/productos`, toca el «?» junto al título: el globo se abre con la frase; se cierra al tocar afuera o con Escape. Mira también en oscuro y a 375 px (Cambios). Lo que sigue: el «!» de ayuda fuera de la cabecera (28 pantallas, globo de 12 px).

## 2026-10-30 — Menos texto y letra más grande, empezando por Caja (ronda 19 de `/unificar`)

- **Qué:** la ayuda junto a una cifra o un campo (`<Ayuda>`) ya no es un «!» con un globo de 12 px: es el «?» de vidrio de la cabecera en chico (14 px, arriba a la derecha de la última palabra) con su globo a 16 px; el «!» queda solo para «falta algo» (A1). `<TituloSeccion ayuda>` pone el mismo «?» (16 px) junto al título de una sección (F1). En Caja y su historial, cada frase se acortó (una línea a la vista, lo que explica al «?», fuera las instrucciones), los títulos de tarjeta pasaron a `TituloSeccion` y la letra subió (`.texto-bajada` 15 px y `.texto-detalle` 14 px, en `estilos/titulos.css`, por ahora solo en Caja); las filas de Movimientos del turno, a 15/14/16 px. Las píldoras de filtro (`.pildora-cayla`, `.pildora-filtro`) y el vacío chico pasaron a 14 px en todo el ERP.
- **Por qué:** las colaboradoras no leen la letra chica. Felipe eligió mirando F1 y A1; el tamaño lo dejó para después de condensar «texto por texto» (inventario de 540 frases con su versión corta: de ~7.000 palabras a la vista a ~2.500). Pidió subir la letra de Movimientos y las píldoras a 14 px al verlo.
- **Cómo verificas:** abre `/caja`: los títulos de tarjeta en serif, «Hora por hora, contra ayer» bajo «Dónde ganas y dónde pierdes» y su «?» con la explicación de las barras; `/comercial`: el «?» chico junto a «Ventas de hoy». Pendiente: registrar la ronda 19 (familias, README, ADR-0358), decidir la escala de letra y aplicar el texto corto pantalla por pantalla con la revisión de Felipe. Visto de paso, sin arreglar: `/vender/historial` a 375 px se corre 5 px al costado por el globito de «Ventas por día».

## 2026-10-30 — Ventas con la letra a 14 px (ronda 19, segunda pasada)

- **Qué:** Punto de Venta, Apartados, Historial, Cambios, Devoluciones y Comprobantes (y las hojas que abren): lo que se lee pasa de 10,5–13 px a 14 px y el título de una fila de 13,5 a 15 px (versalitas, botones y papel impreso quedan igual); frases largas acortadas (nota del Historial, «De quién es lo vendido», bajadas de Cambios y Devoluciones, pendientes de Comprobantes). En todo el ERP: el detalle de `TarjetaCifra` y `TarjetaKpiVidrio`, `nota-cayla` y el texto de `<Aviso>` a 14 px. Los títulos de grupo del resumen de un cambio y de una devolución pasan a `<TituloGrupo>`.
- **Por qué:** Felipe vio Caja y pidió lo mismo en todo Ventas. El censo anterior había medido Ventas con una cuenta sin sede y solo vio «elige una sede».
- **Cómo verificas:** abre `/vender/historial` y `/cambios` (también a 375 px): las filas, el detalle y el pulso se leen a 14 px. No se miró con datos: las hojas de cobro, cambio y devolución abiertas (piden guardar en la base local).

## 2026-10-30 — Inventario con la letra a 14 px (ronda 19, tercera pasada)

- **Qué:** Existencias, Movimientos, Traslados, Conteo, Recibir mercadería y Por regularizar (y las hojas que abren): lo que se lee pasa de 10,5–13 px a 14 px y el título de una fila de 13,5 a 15 px. En CSS propio: el panel «Filtrar por tipo» y el trayecto de Movimientos (`movimientos-sellos.css`) y el texto de los pases de Traslados (`traslados-pases.css`), sin tocar sellos ni movimiento. El aviso del traslado en camino de Recibir, más corto. Quedan igual a propósito: la planilla de «Ajustar stock», las matrices de tallas y la hoja impresa de ingresos.
- **Por qué:** Felipe pidió seguir con Inventario tras ver Ventas.
- **Cómo verificas:** abre `/inventario`, `/inventario/movimientos` y `/inventario/traslados` (también a 375 px). No se miraron con datos las hojas que piden algo guardado (un conteo en curso, el cuadre del piso, una recepción abierta).

## 2026-10-30 — Catálogo con la letra a 14 px y frases más cortas (ronda 19, cuarta pasada)

- **Qué:** Productos (grilla, tabla, vista rápida), Categorías, Marcas, Atributos, Insignias, Liquidación, Nuevo producto y Por revisar (y las hojas que abren): lo que se lee pasa de 10,5–13 px a 14 px y el título de una fila de 13,5 a 15 px. En CSS propio: la vista rápida, los sellos de Insignias, las parecidas y la guía de Nuevo producto y la ficha del Taller, sin tocar sellos ni movimiento. Frases acortadas: Marcas, las cinco ayudas de Atributos, Temporadas, Liquidación, Nuevo producto, Por revisar y la identidad del alta; fuera la instrucción «Pasa el mouse…» de la vista rápida. Quedan igual a propósito: las descripciones de cada color (son datos), las etiquetas impresas y la matriz de stock de la ficha.
- **Por qué:** Felipe pidió seguir con Catálogo tras ver Inventario.
- **Cómo verificas:** abre `/productos` y toca una prenda (vista rápida), `/productos/atributos?tipo=temporadas` y `/productos/nuevo` (también a 375 px).

## 2026-10-31 — Compras con la letra a 14 px y frases más cortas (ronda 19, quinta pasada)

- **Qué:** Historial de compras, Por pagar, Proveedores y su ficha, Notas de crédito, Órdenes, Plan de campaña (sus cinco pestañas), Mis compras y Fondos (y las hojas que abren): lo que se lee pasa de 10,5–13 px a 14 px y el título de una fila de 13,5 a 15 px. En CSS propio: Calendario, Centro de avisos, Presupuesto, Paso 2, «Compré ropa» y el registro de un comprobante. Unas 45 frases acortadas (hojas de «Te debe», reasignar reparto, reembolso, envíos, Enviar a Compras, vacíos de cada lista, nota de prendas del proveedor); en Presupuesto, dos detalles de tarjeta fuera y el dato de «Plan con tu tope» al «?». Quedan igual a propósito: la lista de compra impresa y la orden de compra impresa.
- **Por qué:** Felipe pidió seguir con Compras tras ver Catálogo.
- **Cómo verificas:** abre `/compras/por-pagar`, `/compras/plan/presupuesto` y `/compras/mi-plata` (también a 375 px). No se miraron con datos: el detalle de una orden (la base local no tiene) ni las hojas que piden guardar (pagar, reasignar, reembolso).

## 2026-10-31 — Clientes con la letra a 14 px y frases más cortas (ronda 19, sexta pasada)

- **Qué:** Fichas, la ficha del cliente (historia, permisos, tienda online), Avisos y Beneficios del club: lo que se lee pasa de 10,5–13 px a 14 px. Diez frases acortadas: la nota de reglas de Avisos (de ~75 palabras a ~35), la nota al pie de Fichas, Registrar BAJA, Restablecer acceso, la historia de permisos y el aviso sin celular. Solo letra y texto: lo que hace cada pantalla no cambia (el plan de Clientes es de Dany). El cartel del club (papel) queda igual.
- **Por qué:** Felipe pidió seguir con Clientes tras ver Compras.
- **Cómo verificas:** abre `/clientas` y toca un cliente, `/clientas/avisos` y `/clientas/beneficios` (también a 375 px). No se miraron con datos las hojas que guardan (Nuevo cliente, Editar datos, BAJA, Restablecer acceso).

## 2026-10-31 — Gestión con la letra a 14 px y frases más cortas (ronda 19, séptima pasada)

- **Qué:** Análisis (sus cinco vistas), Frescura del piso, Plan del piso, Preguntas del equipo y Rendimiento: lo que se lee pasa de 10,5–13 px a 14 px, también en el CSS propio de Análisis y de Plan del piso; las etiquetas pegadas a los gráficos (ejes, riel, semanas, días, banderas) quedan igual para no encimarse. Quince frases acortadas; en Plan del piso, cómo leer «Dónde está cada grupo» pasa al «?» de su título.
- **Por qué:** Felipe pidió seguir con Gestión tras ver Clientes.
- **Cómo verificas:** abre `/gestion/analisis`, `/gestion/plan-del-piso` y `/rendimiento`. Visto de paso, sin arreglar: `/rendimiento` a 375 px se corre 21 px al costado (ya pasaba antes).

## 2026-10-31 — Finanzas con la letra a 14 px y frases más cortas (ronda 19, octava pasada)

- **Qué:** Resumen, Gastos, Cuentas y dinero (por pagar, conciliación, CLAURE, efectivo), Reportes (resultados, presupuesto, balance, campañas, escenarios, flujo), Impuestos y Cierre: unos 100 tamaños del kit (`finanzas.css`), de Cuentas y dinero, del recorrido y de El telar suben de 10,5–13 px a 14 (y 13,5 a 15), mirando el bloque entero de cada regla (versalitas, pestañas, chips, controles, gráficos, calendario, teclas y agenda quedan igual). Treinta frases acortadas (notas del Estado de resultados, Balance, Campañas, Conciliación, bajadas de Reportes, vacíos). Configuración cambia también: usa el mismo kit. Se aparta a propósito del tamaño del spike (ADR-0195): se anotará en ese ADR al registrar la ronda 19.
- **Por qué:** Felipe pidió seguir con Finanzas tras ver Gestión.
- **Cómo verificas:** abre `/finanzas/gastos`, `/finanzas/reportes` y `/finanzas/dinero`. Visto de paso, sin arreglar: `/finanzas/reportes/campanas` a 375 px se corre 163 px al costado (ya pasaba antes).

## 2026-10-31 — Producción con la letra a 14 px y frases más cortas (ronda 19, novena pasada)

- **Qué:** Resumen, Órdenes y la página de una orden (con sus hojas), Insumos, Recibir, Por pagar, Eficiencia, Proveedores, Comprobantes y Órdenes de insumos: lo que se lee pasa de 10,5–13 px a 14 px (también el CSS de la página de la orden y de la lista). Treinta y cinco frases acortadas (sin Taller, Eficiencia, recibir insumos, fases, anular, tela de la orden, vacíos). Quedan igual la hoja impresa de la orden de insumos y la matriz de tallas del modelo.
- **Por qué:** Felipe pidió seguir con Producción tras ver Finanzas.
- **Cómo verificas:** con el Taller elegido en el selector de sede, abre `/produccion`, `/produccion/eficiencia` y `/ordenes-insumos/nueva`. No se miraron con datos la página de una orden ni sus hojas (la base local no tiene órdenes de producción).

## 2026-10-31 — Tienda web con la letra a 14 px y frases más cortas (ronda 19, décima pasada)

- **Qué:** Resumen, Pedidos y su hoja, Vitrina (Modelos, Looks, Probador, Esperan), Campañas y su editor, Recomendaciones, Tráfico, Conf. Tienda y Pedidos no atendidos: lo que se lee pasa de 10,5–13 px a 14 px, también en el CSS de Tienda web, su configuración y Tráfico (quedan igual el mapa de calor, el calendario, la maqueta del navegador y la vista previa de la campaña). Veintidós frases acortadas (notas del Probador, Looks y Esperan, el editor de campaña, confirmar y anular un pedido). De paso: tres ayudas con ancho mínimo que el ajuste se había saltado (Probador, Looks y una de Nueva orden de Producción) también a 14 px.
- **Por qué:** Felipe pidió seguir con Tienda web tras ver Producción.
- **Cómo verificas:** abre `/tienda-web`, `/tienda-web/vitrina/probador` y `/tienda-web/pedidos`. No se miraron con datos el editor de una campaña ni las hojas que guardan.

## 2026-10-31 — Colaboradores con la letra a 14 px (ronda 19, undécima pasada)

- **Qué:** Equipo, Roles (la descripción de cada módulo y de cada grupo), Actividad, la ficha de una persona y de una terminal, y las hojas de dar acceso, cambiar rol y archivar rol: lo que se lee pasa de 10,5–13 px a 14 px. Sus frases ya eran cortas; solo se acortó la de cambiar el rol. La marca «ADMIN» en versalitas queda igual.
- **Por qué:** Felipe pidió seguir con Colaboradores tras ver Tienda web.
- **Cómo verificas:** abre `/colaboradores`, toca una persona, y `/colaboradores?pestana=roles`.

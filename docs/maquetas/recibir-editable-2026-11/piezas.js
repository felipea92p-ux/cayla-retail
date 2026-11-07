// Qué se puede mover y redimensionar en cada pantalla, y cómo se recorre el flujo en el modo «Probar».
// Cada pieza es un selector CSS sobre la captura REAL del ERP (las clases y los data-guia son los del código: apps/web/components/...).
// Una pieza dentro de otra queda anidada sola (doble clic para entrar). `nombre` es como se llama en el ERP (ADR-0575 para las de Recibir «B»).
// `todos: true` = la misma pieza repetida (se numera); `opcional: true` = puede no estar en todas las pantallas.
(() => {
  // La cabecera de toda pantalla de un envío: sede y título a la izquierda, el Trayecto a la derecha, y los pasos Contar / Cerrar debajo.
  const cabeceraDeEnvio = [
    { id: "cabecera", nombre: "Cabecera", sel: "main header" },
    { id: "titulo", nombre: "Título y sede", sel: "main header > div:first-child" },
    { id: "trayecto", nombre: "Trayecto del envío", sel: "main header .rc-tray-cabecera" },
    { id: "pasos", nombre: "Pasos · Contar y Cerrar", sel: "main nav:has(> .rc-riel)" },
  ];

  const contar = [
    ...cabeceraDeEnvio,
    { id: "aviso", nombre: "Aviso · quién cuenta y quién lo verá", sel: "main .aviso-linea", opcional: true },
    { id: "categorias", nombre: "Acordeón de categorías", sel: ".rc-mesa nav.rc-acord" },
    { id: "grupo", nombre: "Categoría del envío", sel: ".rc-mesa .rc-acord-grupo" },
    { id: "agregar", nombre: "+ Agregar categoría", sel: ".rc-mesa .rc-acord-agregar" },
    { id: "quien", nombre: "Quién cuenta", sel: ".rc-mesa .rc-quien" },
    { id: "contador", nombre: "Contador de la categoría", sel: ".rc-mesa section.rc-contador" },
    { id: "contador-cab", nombre: "Categoría que se cuenta", sel: ".rc-contador > div:first-child" },
    { id: "dial", nombre: "Dial", sel: ".rc-contador .rc-dial-col" },
    { id: "atajos", nombre: "Atajos (+5, +10, Llegaron las N…)", sel: ".rc-contador .rc-franja-lado" },
    { id: "observaciones", nombre: "Observaciones", sel: '.rc-contador [data-guia="recepcion.observaciones"]' },
    { id: "identificar", nombre: "¿Qué son? · identificar las prendas", sel: ".rc-mesa section.card-cayla" },
    { id: "nota-pie", nombre: "Nota de pie", sel: ".rc-mesa section.space-y-4 > p.text-verde", opcional: true },
    { id: "barra", nombre: "Barra de abajo · totales que ruedan", sel: ".rc-mesa .barra-abajo" },
    { id: "barra-anterior", nombre: "Botón Anterior", sel: ".barra-abajo > button" },
    { id: "totales", nombre: "Totales · dijeron, contadas, identificadas", sel: ".barra-abajo .rc-cierre-cifras" },
    { id: "barra-siguiente", nombre: "Botón Pasar a cerrar", sel: ".barra-abajo .barra-abajo-acciones" },
  ];

  window.PIEZAS_MAQUETA = {
    estados: [
      { id: "portada", archivo: "index.html", nombre: "Portada", ruta: "/recibir", nota: "Envíos por recibir y lo recibido" },
      { id: "sin-aviso", archivo: "sin-aviso.html", nombre: "Sin aviso", ruta: "/recibir (hoja)", nota: "«¿Llegó algo que no está en la lista?»" },
      { id: "contar", archivo: "contar.html", nombre: "Contar", ruta: "/recibir/envio/…", nota: "Un envío que cuadra (15 de 15)" },
      { id: "contar-diferencia", archivo: "contar-diferencia.html", nombre: "Contar · sobran", ruta: "/recibir/envio/…", nota: "Un envío con diferencia (sobran 5)" },
      { id: "cerrar", archivo: "cerrar.html", nombre: "Cerrar", ruta: "/recibir/envio/… (paso 2)", nota: "Podio, Vitrina y precios" },
      { id: "cerrado", archivo: "cerrado.html", nombre: "Cerrado", ruta: "/recibir/envio/… (cerrado)", nota: "Envío recibido y lo que queda para después" },
    ],

    // Lo que hace cada toque en el modo «Probar» (en el ERP navegan o abren una hoja; aquí solo pasan a la pantalla que sigue).
    va: {
      portada: [
        { sel: '[data-guia="recibir.envios-oc"] > div:first-child > div:last-child > button', a: "sin-aviso" },
        { sel: '[data-guia="recibir.por-terminar"] .fila-cayla', a: "cerrado" },
        { sel: '[data-guia="recibir.envios-oc"] .fila-cayla', a: "contar" },
      ],
      "sin-aviso": [
        { sel: ".hilo-seguir", a: "contar" },
        { sel: '[class*="bg-sombra"]', a: "portada" },
      ],
      contar: [
        { sel: '[data-guia="recepcion.pasar-a-cerrar"]', a: "cerrar" },
        { sel: "header a", a: "portada" },
      ],
      "contar-diferencia": [{ sel: "header a", a: "portada" }],
      cerrar: [
        { sel: '[data-guia="recepcion.cerrar-boton"]', a: "cerrado" },
        { sel: ".rc-riel li:nth-of-type(1) button", a: "contar" },
        { sel: "header a", a: "portada" },
      ],
      cerrado: [{ sel: "header a", a: "portada" }],
    },

    piezas: {
      portada: [
        { id: "cabecera", nombre: "Cabecera · Recibir mercadería", sel: "main header" },
        { id: "aviso", nombre: "Aviso · prendas por terminar", sel: '[data-guia="recibir.pendientes"]' },
        { id: "envios", nombre: "Envíos por recibir (sección)", sel: '[data-guia="recibir.envios-oc"]' },
        { id: "envios-titulo", nombre: "Título de la sección", sel: '[data-guia="recibir.envios-oc"] > div:first-child > div:first-child' },
        { id: "sin-aviso-bloque", nombre: "«¿Llegó algo que no está en la lista?»", sel: '[data-guia="recibir.envios-oc"] > div:first-child > div:last-child' },
        { id: "sin-aviso-boton", nombre: "Botón Sin aviso", sel: '[data-guia="recibir.envios-oc"] > div:first-child > div:last-child > button' },
        { id: "filtros", nombre: "Buscador y filtros", sel: '[data-guia="recibir.envios-filtros"]' },
        { id: "buscador", nombre: "Buscador", sel: '[data-guia="recibir.envios-filtros"] > .buscador' },
        { id: "f-estado", nombre: "Filtro · Estado", sel: '[data-guia="recibir.envios-filtros"] > .pildora-filtro:nth-child(2)' },
        { id: "f-proveedor", nombre: "Filtro · Proveedor", sel: '[data-guia="recibir.envios-filtros"] > .pildora-filtro:nth-child(3)' },
        { id: "f-fechas", nombre: "Filtro · Fechas", sel: '[data-guia="recibir.envios-filtros"] > .pildora-filtro:nth-child(4)' },
        { id: "tabla-envios", nombre: "Tabla de envíos", sel: '[data-guia="recibir.envios-oc"] > .tabla-cayla' },
        { id: "tabla-envios-enc", nombre: "Encabezado de la tabla", sel: '[data-guia="recibir.envios-oc"] > .tabla-cayla > .encabezado-tabla-cayla' },
        { id: "tabla-envios-pag", nombre: "Paginación", sel: '[data-guia="recibir.envios-oc"] > .tabla-cayla > div:last-child' },
        { id: "semana", nombre: "Lo recibido (sección)", sel: '[data-guia="recibir.semana"]' },
        { id: "semana-titulo", nombre: "Título · Lo recibido", sel: '[data-guia="recibir.semana"] > .titulo-seccion' },
        { id: "semana-segmento", nombre: "Pestañas · Por terminar / Terminados", sel: '[data-guia="recibir.semana"] > .segmento-cayla' },
        { id: "semana-tabla", nombre: "Tabla · Por terminar", sel: '[data-guia="recibir.por-terminar"]' },
      ],

      "sin-aviso": [
        { id: "hoja", nombre: "Hoja · «¿Llegó algo que no está en la lista?»", sel: "[role=dialog]" },
        { id: "titulo", nombre: "Título de la hoja", sel: "[role=dialog] > h2" },
        { id: "bajada", nombre: "Bajada", sel: "[role=dialog] > p" },
        { id: "proveedor", nombre: "¿De quién es? · proveedor", sel: '[role=dialog] [data-campo="sin-aviso-proveedor"]' },
        { id: "guia", nombre: "Número de guía (opcional)", sel: '[role=dialog] [data-campo="sin-aviso-guia"]' },
        { id: "quien", nombre: "Quién recibe", sel: '[role=dialog] [data-campo="sin-aviso-quien"]' },
        { id: "listo", nombre: "Aviso · Todo listo, ábrelo y cuenta", sel: "[role=dialog] form > p.text-verde" },
        { id: "empezar", nombre: "Botón Empezar a contar", sel: "[role=dialog] .hilo-seguir" },
        { id: "nota", nombre: "Nota de la hoja", sel: "[role=dialog] form > .nota-cayla" },
      ],

      contar,
      "contar-diferencia": contar,

      cerrar: [
        ...cabeceraDeEnvio,
        { id: "tabla", nombre: "Tabla de cierre", sel: '[data-guia="recepcion.tabla-cierre"]' },
        { id: "tabla-enc", nombre: "Encabezado de la tabla", sel: '[data-guia="recepcion.tabla-cierre"] > .encabezado-tabla-cayla' },
        { id: "fila", nombre: "Fila de la categoría", sel: '[data-guia="recepcion.tabla-cierre"] .fila-cayla' },
        { id: "podio", nombre: "Podio · dijeron, contaste, se venden, para después", sel: ".rc-podio" },
        { id: "precios-boton", nombre: "Botón Precio y costo", sel: ".rc-fila-precios" },
        { id: "detalle", nombre: "Detalle de precios", sel: '[data-guia="recepcion.tabla-cierre"] .border-t.border-sand' },
        { id: "vitrina", nombre: "Vitrina", sel: ".rc-vitrina", todos: true },
        { id: "nota", nombre: "Nota · lo que pasa al cerrar", sel: "main form > p.nota-cayla" },
        { id: "guia-nota", nombre: "Guía y nota del envío", sel: "main form > div.card-cayla.grid" },
        { id: "quien-cierra", nombre: "Quién cierra", sel: 'main form > [data-campo="responsable"]' },
        { id: "pie", nombre: "Barra de abajo · Cerrar el envío", sel: "main form > .pie-hoja-fijo" },
        { id: "cerrar-boton", nombre: "Botón Cerrar el envío", sel: '.pie-hoja-fijo [data-guia="recepcion.cerrar-boton"]' },
      ],

      cerrado: [
        ...cabeceraDeEnvio,
        { id: "lacre", nombre: "Sello de lacre · envío cerrado", sel: "section.rc-lacre" },
        { id: "lacre-sello", nombre: "Sello", sel: ".rc-lacre-sello" },
        { id: "lacre-cifras", nombre: "Cifras del cierre", sel: ".rc-lacre-cifras" },
        { id: "separar", nombre: "Las prendas están guardadas · Separarlas ahora", sel: 'main section.card-cayla:has([data-guia="recepcion.despues"])' },
        { id: "para-despues", nombre: "Para después · pendientes", sel: '[data-guia="recepcion.para-despues"]' },
        { id: "reabrir", nombre: "Reabrir el conteo", sel: '[data-guia="recepcion.reabrir"]' },
        { id: "acciones", nombre: "Imprimir etiquetas · Bajar al piso", sel: "main div.flex.flex-wrap.gap-2\\.5:has(> a.btn-cayla)" },
      ],
    },
  };
})();

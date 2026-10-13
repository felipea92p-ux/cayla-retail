// Arma spec.json de la ronda 6 (formularios: campo + combo, la lista, los filtros, el título del campo y las casillas) y llama a
// elegir.mjs. También escribe los fragmentos de propuesta del repo (docs/unificar/propuestas/).
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hojaGasto, hojaGastoHoy, hojaGastoFin, filtros, casillas, listas, campoP, ic } from "./piezas.mjs";

const fotos = existsSync("fotos.json") ? JSON.parse(readFileSync("fotos.json", "utf8")) : {};
const img = (clave) => fotos[clave] ?? [];
const censo = existsSync("numeros.json") ? JSON.parse(readFileSync("numeros.json", "utf8")) : {};
const N = (k, def) => censo[k] ?? def;

// Un demo: barra (selector de escenas + Repetir) y las escenas.
function demo({ titulo = "", escenas, nota }) {
  const sel = escenas.length > 1
    ? `<span class="dz-et">Ver</span>${escenas.map((e, i) => `<button type="button" class="dz-sel" data-ver="${e.id}" aria-pressed="${i === 0}">${e.nombre}</button>`).join("")}`
    : `<span class="dz-et">${titulo}</span>`;
  const cuerpo = escenas.map((e, i) => `<div data-escena="${e.id}"${i ? " hidden" : ""}>${e.html}</div>`).join("");
  return `<div class="dz"><div class="dz-barra">${sel}<button type="button" class="dz-repetir">↻ Repetir la entrada</button></div>${cuerpo}${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;
}
const NOTA_HOJA = "Escribe, abre los combos, elige con el mouse o con ↑ ↓ y Enter, escribe 11 dígitos en el RUC y toca «Registrar gasto» con algo vacío: nada se guarda.";

// ================= 1 · DÓNDE SE ESCRIBE Y SE ELIGE (campo + combo) =================
const formulario = {
  id: "caja",
  nombre: "1 · Dónde se escribe y dónde se elige",
  pregunta: "Dentro de una hoja (un formulario), ¿cómo se ve el lugar donde la persona escribe un dato o elige uno de una lista?",
  ayuda: "Es UNA pregunta para dos familias: si la caja de texto y el combo se ven distinto, la persona no sabe cuál se escribe y cuál se abre. Hoy una misma hoja mezcla hasta cinco caras (el hilo, la caja hundida, la raya de los combos que se escriben, la caja crema del Responsable y la cifra grande del monto). Toca cada campo de cada demo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · La caja que se enciende (mi recomendación)",
      detalle: "Todo campo y todo combo es la caja hundida en hueso de 40 px, la que ya usan los filtros, el buscador decidido en la ronda 5 y Finanzas. Al escribir o abrir, la caja SUBE a papel (más clara) y su borde de abajo dibuja el hilo rojo desde el centro: la persona ve dónde está. El monto conserva su cifra grande en serif; el Responsable, su avatar. Lo que hoy hace el hilo se queda: verde y con ✓ cuando el dato está bien (el RUC encontrado en SUNAT), barre mientras consulta, rojo suave con su «!» si falta.",
      movimiento: "Al entrar: la caja pasa de hueso a papel y el hilo rojo se dibuja desde el centro (320 ms, sin rebote); la etiqueta de arriba se oscurece con ella. Al pasar el mouse: el borde se calienta (taupe). Combo: la flecha gira media vuelta y se pone roja; la lista cae 3 px y sus filas entran en cascada (30 ms entre cada una); el valor elegido entra subiendo 6 px. RUC: el hilo barre mientras «busca en SUNAT» y luego se queda verde con el ✓ que se dibuja. Foco con teclado: el anillo del sistema (ADR-0351).",
      donde: `Une: CampoTexto (${N("campoTexto", 165)} usos), CampoSelect (${N("campoSelect", 55)}), Desplegable (${N("desplegable", 81)}), ComboBuscable (${N("comboBuscable", 22)}), ComboResponsable (${N("comboResponsable", 163)} hojas), CampoMonto (${N("campoMonto", 23)}) y los ${N("inputsMano", 200)} campos hechos a mano. Finanzas (fin-control) ya es casi esta caja: 36 px en vez de 40.`,
      demo: demo({ titulo: "Una hoja de ejemplo", escenas: [{ id: "h", nombre: "", html: hojaGasto("caja", { marcas: true }) }], nota: NOTA_HOJA + " Arriba, la guía de foco (ADR-0284) en la etiqueta: «✓ listo» y «Sigue aquí»." }),
      imagenes: img("form.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · El hilo para todo",
      detalle: "Todo campo y todo combo de una hoja es el hilo: transparente, una línea gris abajo que se vuelve roja al escribir. La caja hundida queda solo para las barras de filtros y los buscadores. Más liviano y más «papel», pero en una hoja con fondo papel los campos vacíos casi no se ven, y Finanzas quedaría distinta.",
      movimiento: "El de hoy del hilo: la línea roja se dibuja desde el centro al escribir o abrir (320 ms); con el mouse, un tinte muy suave. Lo mismo que P1 en la lista (cascada, ✓ que se dibuja), en el RUC (barre y queda verde) y en el error.",
      demo: demo({ titulo: "Una hoja de ejemplo", escenas: [{ id: "h", nombre: "", html: hojaGasto("hilo") }], nota: NOTA_HOJA }),
      imagenes: img("form.P2"),
    },
    {
      id: "A", tipo: "hoy", ancha: true,
      nombre: "A · Hoy: la mezcla",
      detalle: "Así se arma hoy una hoja con las piezas que existen: el concepto y la categoría sobre el hilo (CampoTexto, CampoSelect), «Pagado desde» en la caja hundida (CampoSelect caja), el proveedor sobre una raya donde se escribe directo (ComboBuscable, sin flecha), el RUC sobre el hilo y el Responsable en una caja crema de 48 px con su avatar. Cinco caras para la misma pregunta: «¿qué dato va aquí?».",
      movimiento: "Cada pieza con el suyo: el hilo rojo que se dibuja (CampoTexto, CampoSelect); la caja hundida sin cambio al pasar el mouse; la raya del ComboBuscable sin ningún movimiento; la flecha del Responsable gira en 200 ms (las demás, 300); la lista del Desplegable entra en cascada con el hilo de canto en la elegida, la del ComboBuscable aparece entera con la elegida en negrita.",
      donde: "Las hojas de Caja, Compras, Inventario, Cambios, Clientes, Colaboradores, Producción, Catálogo… (ver las fotos).",
      demo: demo({ titulo: "La misma hoja, hoy", escenas: [{ id: "h", nombre: "", html: hojaGastoHoy() }], nota: NOTA_HOJA }),
      imagenes: img("form.A"),
    },
    {
      id: "F", tipo: "hoy", ancha: true,
      nombre: "F · Finanzas (decidida a propósito, ADR-0195)",
      detalle: "Finanzas se dibuja con el kit de su spike: la caja hueso de 36 px (fin-control) con su flecha dibujada por CSS y los títulos de campo en versalitas taupe. Si eliges P1, Finanzas y el resto del ERP quedan casi iguales (36 px contra 40) y se pueden juntar; si eliges P2, Finanzas sigue aparte.",
      movimiento: "Ninguno al pasar el mouse; con el foco, el borde se calienta (taupe). La lista abierta es la de todo el ERP (cascada y hilo de canto).",
      donde: `SelectFin (${N("selectFin", 43)} usos en ${N("selectFinArchivos", 18)} archivos) y fin-control: Gastos, Configuración, Cuentas y dinero, Reportes, Impuestos.`,
      decidida: "ADR-0195: el kit de Finanzas existe por decisión. Felipe dice si se une.",
      demo: demo({ titulo: "En Finanzas", escenas: [{ id: "h", nombre: "", html: hojaGastoFin() }] }),
      imagenes: img("form.F"),
    },
  ],
};

// ================= 2 · LA LISTA QUE SE ABRE =================
const lista = {
  id: "lista",
  nombre: "2 · La lista que se abre",
  pregunta: "Cuando se abre un combo, ¿cómo se ve y cómo se mueve la lista?",
  ayuda: "La lista flotante (lista-flotante) ya es una sola superficie para todo combo, pero por dentro hay cuatro formas: cómo se marca la elegida, si entra en cascada, cómo se busca y qué pasa si no hay nada. Abre cada una.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · Una lista para todo combo (mi recomendación)",
      detalle: "La de Desplegable (que es la mejor de hoy) con lo que le falta: la elegida lleva el hilo rojo de canto Y un ✓ a la derecha (el hilo solo se pierde a la vista); con más de 8 opciones, un buscador fijo arriba con su lupa (ADR-0209); los grupos con su título en versalitas; si no hay nada, el vacío chico de la ronda 5 nombrando lo buscado; en un combo que se escribe, «Registrar … como nuevo» al pie. El Responsable conserva su título «De turno ahora» y los avatares, dentro de la misma lista.",
      movimiento: "Cae 3 px y aparece (240 ms); las filas entran en cascada (30 ms entre cada una, hasta 8; con buscador, todas juntas para no esperar). La fila bajo el mouse o las flechas se tiñe de terracota tenue. La elegida: el hilo crece de canto (220 ms) y el ✓ se dibuja (300 ms). Al elegir, la lista se va en 160 ms y el valor entra subiendo en la caja.",
      demo: demo({ titulo: "Abre los dos combos", escenas: [{ id: "h", nombre: "", html: listas.P1() }] }),
      imagenes: img("lista.P1"),
    },
    {
      id: "A", tipo: "hoy", ancha: true,
      nombre: "A · Desplegable / CampoSelect",
      detalle: "La elegida con el hilo rojo de canto (sin ✓); filas en cascada; con más de 8 opciones, un «Buscar…» sin lupa arriba.",
      movimiento: "Cae 3 px (240 ms), filas en cascada de 30 ms, el hilo de la elegida crece en 200 ms. La flecha del combo gira y se pone roja.",
      donde: "Todo CampoSelect y Desplegable (~136 usos), las píldoras de filtro (con casillas si eligen varias).",
      demo: demo({ titulo: "Abre los dos combos", escenas: [{ id: "h", nombre: "", html: listas.A() }] }),
      imagenes: img("lista.A"),
    },
    {
      id: "B", tipo: "hoy", nombre: "B · ComboBuscable",
      detalle: "Se escribe en el campo y la lista filtra debajo; la elegida va en negrita; si no está, «+ Registrar…» al pie. Corta en 50 con «+N más: sigue escribiendo».",
      movimiento: "Aparece (240 ms) sin cascada; la fila activa en terracota tenue; sin marca animada en la elegida.",
      donde: `ComboBuscable (${N("comboBuscable", 22)} usos): proveedor, producto, prenda que se lleva (Compras, Cambios, Recibir).`,
      demo: demo({ titulo: "Escribe un proveedor", escenas: [{ id: "h", nombre: "", html: listas.B() }] }),
      imagenes: img("lista.B"),
    },
    {
      id: "C", tipo: "hoy", nombre: "C · Responsable",
      detalle: "Título «De turno ahora · sede», cada persona con su avatar; la fila se tiñe al pasar el mouse.",
      movimiento: "Aparece (240 ms); la flecha gira en 200 ms; sin marca de la elegida.",
      donde: `ComboResponsable: ${N("comboResponsable", 163)} usos, en casi toda hoja que guarda (ADR-0162).`,
      demo: demo({ titulo: "Elige quién lo hace", escenas: [{ id: "h", nombre: "", html: listas.C() }] }),
      imagenes: img("lista.C"),
    },
  ],
};

// ================= 3 · EL COMBO QUE FILTRA UNA LISTA =================
const filtro = {
  id: "filtro",
  nombre: "3 · El combo que filtra una lista",
  pregunta: "En la barra de arriba de una lista (Productos, Existencias, Actividad, Compras), ¿cómo se ve el filtro que se elige de una lista?",
  ayuda: "En la ronda 1 decidiste que lo que filtra es una píldora (pildora-cayla) y que, puesta, se rellena de tinta. Los filtros que se ABREN (categoría, talla, estado, orden) quedaron fuera de esa decisión: hoy son cuatro caras. Abre, elige, y quita un filtro con su ✕.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · La píldora que dice su nombre (mi recomendación)",
      detalle: "La píldora de la ronda 1 con su ícono y su nombre en letra normal («Talla»); al elegir algo, se rellena de tinta y dice lo elegido («Talla: M») con su ✕ para quitarlo en un toque. Igual que el filtro por clic: puesta = negra, en todo el ERP. La lista es la de la pregunta 2 (con el número de prendas a la derecha y casillas si se eligen varias).",
      movimiento: "Al pasar el mouse el borde se calienta. Abierta: borde tinta, la flecha gira y se pone roja, la lista cae en cascada. Al elegir: la píldora se rellena de tinta (220 ms) y el valor entra subiendo; la ✕ aparece en su lugar. Al quitar: vuelve a papel.",
      donde: "Reemplaza a DesplegablePildora (Productos, Existencias, Compras, Historial de ventas) y a los combos en caja de las barras (Actividad, Movimientos, Equipo, Clientes).",
      demo: demo({ titulo: "Una barra de filtros", escenas: [{ id: "h", nombre: "", html: filtros.P1() }] }),
      imagenes: img("filtro.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · La caja con el nombre adentro",
      detalle: "La caja hundida de los formularios (la P1 de la pregunta 1), de 36 px, con el nombre del filtro adentro («Talla · Todas»). Puesta: borde más firme y el valor en negrita. Se parece a un campo de formulario: coherente con la hoja, pero se distingue menos de un dato que se llena.",
      movimiento: "El de la caja de la pregunta 1: se enciende a papel con el hilo rojo al abrir, la flecha gira, el valor entra subiendo.",
      demo: demo({ titulo: "Una barra de filtros", escenas: [{ id: "h", nombre: "", html: filtros.P2() }] }),
      imagenes: img("filtro.P2"),
    },
    {
      id: "A", tipo: "hoy", ancha: true,
      nombre: "A · Hoy: el panel de píldoras en versalitas",
      detalle: "DesplegablePildora: un panel con bordes, las píldoras en VERSALITAS de 11 px separadas por rayas, sin caja propia; puesta, el nombre se apaga y el valor se lee en tinta («CATEGORÍA: BLUSAS ✕»).",
      movimiento: "Al pasar el mouse el texto se oscurece; abierta, el hilo rojo se dibuja bajo la píldora; la lista en cascada.",
      donde: `DesplegablePildora: ${N("pildora", 32)} usos en ${N("pildoraArchivos", 5)} barras (Productos, Existencias, Compras, Historial).`,
      demo: demo({ titulo: "Una barra de filtros", escenas: [{ id: "h", nombre: "", html: filtros.A() }] }),
      imagenes: img("filtro.A"),
    },
    {
      id: "B", tipo: "hoy", ancha: true,
      nombre: "B · Hoy: la caja hundida con el valor",
      detalle: "Desplegable en caja: «Todas las categorías», «Todos los módulos». No dice qué filtra hasta que se lee el valor, y puesto se ve igual que sin poner. Existencias usa la misma en 36 px.",
      movimiento: "Ninguno al pasar el mouse; la flecha gira y se pone roja al abrir; la lista en cascada.",
      donde: "Actividad, Movimientos, Equipo, Clientes, Existencias (cajaBaja), Recibir.",
      demo: demo({ titulo: "Una barra de filtros", escenas: [{ id: "h", nombre: "", html: filtros.B() }] }),
      imagenes: img("filtro.B"),
    },
    {
      id: "C", tipo: "hoy",
      nombre: "C · Hoy: la pastilla en versalitas",
      detalle: "Desplegable forma=pastilla: versalitas de 11 px en un borde fino de 32 px («TIENDA LIMA»); abierta, el borde se pone rojo. Es la de «Dónde buscar la venta» en Cambios y Devoluciones.",
      movimiento: "Al pasar el mouse el borde se pone rojo; mientras busca, un hilo barre adentro; la lista en cascada.",
      donde: "Cambios y Devoluciones (la sede donde se busca la venta).",
      imagenes: img("filtro.V"),
    },
    {
      id: "F", tipo: "hoy", ancha: true,
      nombre: "F · Finanzas (decidida a propósito, ADR-0195)",
      detalle: "SelectFin: la caja de su spike con la flecha dibujada por CSS («Octubre 2026», «Tienda Lima»).",
      movimiento: "Ninguno al pasar el mouse; el borde se calienta con el foco.",
      decidida: "ADR-0195. Felipe dice si se une.",
      demo: demo({ titulo: "En Finanzas", escenas: [{ id: "h", nombre: "", html: filtros.F() }] }),
      imagenes: img("filtro.F"),
    },
  ],
};

// ================= 4 · EL TÍTULO DE CADA CAMPO =================
const etqHoja = (minus) => `<div class="dz-hoja"><h5 style="font-size:20px">Registrar cliente</h5><div class="dz-rej">
  ${campoP("caja", { tipo: "texto", et: "Nombre", ob: true, ph: "Ej. Rosa", minus, marca: ' <span class="pf-marca hecho">' + ic("check") + "listo</span>", valor: "Rosa Huamán" })}
  ${campoP("caja", { tipo: "texto", et: "Celular", ph: "9 dígitos", minus, marca: ' <span class="pf-marca sigue">Sigue aquí</span>' })}
  ${campoP("caja", { tipo: "texto", et: "DNI", opc: true, ph: "8 dígitos", minus })}
  ${campoP("caja", { tipo: "combo", et: "Tienda donde compra", ob: true, minus, opciones: ["Tienda Lima", "Tienda Trujillo", "Tienda Arequipa"], elegida: "Tienda Lima" })}
</div></div>`;
const etiqueta = {
  id: "etiqueta",
  nombre: "4 · El título sobre cada campo",
  pregunta: "¿Cómo se escribe el nombre del dato que va en cada caja?",
  ayuda: "Lo lleva toda caja de toda hoja. La guía de foco (ADR-0284) escribe su «✓ listo» y su «Sigue aquí» al lado del título, así que el título y la guía se eligen juntos. Las demos usan la caja de P1 para que solo cambie el título: escribe en el Celular.",
  opciones: [
    {
      id: "P1", tipo: "propuesta",
      nombre: "P1 · Versalitas que se encienden (mi recomendación)",
      detalle: "El de Campo, que es el más usado: VERSALITAS de 11 px en tinta al 62 %, el * rojo si es obligatorio, «· opcional» en minúscula tenue si no lo es, y la marca de la guía a la derecha. Se lee como un rótulo de tienda, no compite con lo que la persona escribe. Lo nuevo: se OSCURECE a tinta mientras su caja está encendida.",
      movimiento: "Cuando la caja se enciende, el título pasa de tinta 62 % a tinta (200 ms); al salir, vuelve. Las marcas de la guía, como hoy.",
      demo: demo({ titulo: "Escribe en el Celular", escenas: [{ id: "h", nombre: "", html: etqHoja(false) }] }),
      imagenes: img("etq.P1"),
    },
    {
      id: "P2", tipo: "propuesta",
      nombre: "P2 · En letra normal",
      detalle: "13 px, peso medio, en minúscula como se escribe («Tienda donde compra»). Más cálido y se lee de corrido, pero un título largo ocupa dos líneas y la marca de la guía queda más apretada.",
      movimiento: "El mismo: se oscurece con su caja.",
      demo: demo({ titulo: "Escribe en el Celular", escenas: [{ id: "h", nombre: "", html: etqHoja(true) }] }),
      imagenes: img("etq.P2"),
    },
    {
      id: "A", tipo: "hoy", nombre: "A · Hoy: versalitas de Campo",
      detalle: "VERSALITAS 11 px tinta al 65 %, quieta. La lleva todo CampoTexto, CampoSelect y CampoMonto.",
      movimiento: "Ninguno.",
      donde: `${N("etqA", "La mayoría")} (Campo).`,
      imagenes: img("etq.A"),
    },
    {
      id: "B", tipo: "hoy", nombre: "B · Hoy: letra normal a mano",
      detalle: "En los formularios hechos a mano: 12 a 14 px, en minúscula, con pesos distintos.",
      movimiento: "Ninguno.",
      donde: `${N("etqB", "Las hojas hechas a mano")}.`,
      imagenes: img("etq.B"),
    },
    {
      id: "F", tipo: "hoy", nombre: "F · Finanzas (decidida a propósito, ADR-0195)",
      detalle: "El rótulo del kit de Finanzas: versalitas taupe de 11 px, a veces AL LADO del control («VER Tienda Lima», «Otro mes»).",
      movimiento: "Ninguno.",
      decidida: "ADR-0195. Felipe dice si se une.",
      imagenes: img("etq.F"),
    },
  ],
};

// ================= 5 · CASILLAS E INTERRUPTORES =================
const casilla = {
  id: "casilla",
  nombre: "5 · Marcar sí o no",
  pregunta: "¿Cómo se ve una casilla que se marca, y un interruptor que se prende?",
  ayuda: "Toca las casillas y los interruptores de cada demo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta",
      nombre: "P1 · La casilla que se dibuja y el interruptor en tinta (mi recomendación)",
      detalle: "Casilla de 20 px con esquinas de 6: al marcarla, el fondo de tinta crece desde el centro y el ✓ se DIBUJA. El interruptor se prende en tinta, no en rojo: el rojo es el acento de la pantalla (máximo 2, ADR-0169) y un interruptor prendido no es una alarma. Con 24 px de alto tocables.",
      movimiento: "Casilla: el fondo crece de 40 % a lleno (220 ms) y el ✓ se traza (260 ms, con 90 ms de espera); al presionar se encoge un poco. Interruptor: la perilla se ESTIRA al presionar y se desliza al soltar (280 ms, sin rebote).",
      demo: demo({ titulo: "Marca y desmarca", escenas: [{ id: "h", nombre: "", html: casillas.P1() }] }),
      imagenes: img("cas.P1"),
    },
    {
      id: "A", tipo: "hoy", nombre: "A · Hoy: Casilla e Interruptor",
      detalle: "Casilla de 18 px que se rellena de tinta con el ✓ de golpe. Interruptor de 36 × 20 que se prende en ROJO.",
      movimiento: "Casilla: el color cambia (150 ms), el ✓ aparece sin trazo. Interruptor: la perilla se desliza (300 ms).",
      donde: `Casilla (${N("casilla", 26)} usos), Interruptor (${N("interruptor", 6)}).`,
      demo: demo({ titulo: "Marca y desmarca", escenas: [{ id: "h", nombre: "", html: casillas.A() }] }),
      imagenes: img("cas.A"),
    },
    {
      id: "B", tipo: "hoy", nombre: "B · Hoy: la casilla del navegador",
      detalle: "La casilla nativa de 16 px con su color de acento. Cambia según el navegador y el sistema.",
      movimiento: "El del navegador.",
      donde: `${N("nativa", 24)} casillas a mano (type="checkbox").`,
      demo: demo({ titulo: "Marca y desmarca", escenas: [{ id: "h", nombre: "", html: casillas.B() }] }),
      imagenes: img("cas.B"),
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 6 · formularios",
  clave: "unificar-ronda6",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["demo.css"],
  guion: "demo.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Todo lo que la colaboradora llena: las cajas donde escribe, los combos que abre, los filtros de las listas, el título de cada dato y las casillas. Todo lo de «Pruébalo» está VIVO y dibujado con el CSS real del ERP: escribe, abre, elige con el mouse o el teclado, toca «Registrar gasto» con algo vacío, y «Ver en oscuro» (abajo) para verlo en modo oscuro. Nada se guarda. Las fotos son de las pantallas reales de hoy. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "campo-combo", nombre: "Cajas y combos", pregunta: "Donde se escribe un dato y donde se elige uno.", ayuda: "Las familias campo y combo (y la lista del combo). La regla de buscar y paginar ya es una (ADR-0209) y no cambia; aquí se elige cómo se ve y cómo se mueve.", grupos: [formulario, lista] },
    { id: "filtro", nombre: "Filtros que se abren", pregunta: "El combo de una barra de filtros.", grupos: [filtro] },
    { id: "etiqueta-campo", nombre: "Títulos de campo", pregunta: "El nombre del dato, sobre su caja.", grupos: [etiqueta] },
    { id: "casilla", nombre: "Casillas e interruptores", pregunta: "Marcar sí o no.", grupos: [casilla] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });

// ---------- Los fragmentos de propuesta para el repo (docs/unificar/propuestas/<familia>.html) ----------
const DOCS = "../../../../../docs/unificar/propuestas";
const estilo = readFileSync("demo.css", "utf8");
const guion = readFileSync("demo.js", "utf8");
const cabecera = (familia, texto) => `<!-- Propuesta de /unificar · familia «${familia}» (ADR-0358) · ronda 6, 2026-10-12. Esperando la elección de Felipe.
     Fragmento: la lámina lo envuelve con el CSS real del ERP, en claro y en oscuro. Solo tokens (var(--color-…)); lo propio va con
     prefijo (dz- marco de la demo, pf- campo y combo, pp- píldora de filtro, pc-/pi- casilla e interruptor). Lleva su guion para que se
     pueda tocar: abrir, elegir, escribir. La página de elegir (apps/web/unificar/.salida/elegir-ronda6/, fuera de git) tiene además
     las formas de hoy vivas y las fotos reales.
${texto}
-->
<style>
${estilo}
</style>
`;
const pie = `\n<script>\n${guion}\n</script>\n`;
const opc = (g, id) => g.opciones.find((o) => o.id === id);
const fr = (titulo, o) => `<h3 style="font:500 20px/1.2 var(--font-serif);margin:24px 0 8px">${titulo}</h3>\n<p style="font-size:13px;color:var(--color-taupe);max-width:90ch">${o.movimiento}</p>\n${o.demo}\n`;
writeFileSync(`${DOCS}/campo-combo.html`, cabecera("campo + combo", `     La pieza (P1): toda caja de texto y todo combo de una hoja es la caja hundida en hueso de 40 px (caja-cayla). Encendida (cursor
     adentro o lista abierta) sube a papel y su borde de abajo dibuja el hilo rojo desde el centro (320 ms); la etiqueta se oscurece con
     ella. El hilo conserva lo que hoy hace: verde con ✓ cuando el dato está bien, barre mientras consulta, rojo suave con «!» si falta.
     Monto: la misma caja de 48 px con la cifra en serif. Responsable: la misma caja de 48 px con su avatar.
     La lista (una para todo combo): la de Desplegable + ✓ que se dibuja en la elegida + buscador fijo con lupa (más de 8) + grupos +
     vacío chico + «Registrar … como nuevo». P2 = el hilo para todo.`) + fr("P1 · la caja que se enciende", opc(formulario, "P1")) + fr("P2 · el hilo para todo", opc(formulario, "P2")) + fr("La lista", opc(lista, "P1")) + pie);
writeFileSync(`${DOCS}/filtro.html`, cabecera("filtro (el combo que filtra)", `     La pieza (P1): la píldora de la ronda 1 con ícono y nombre en letra normal; puesta, se rellena de tinta, dice lo elegido
     («Talla: M») y lleva su ✕. Abierta: borde tinta, flecha que gira roja, la lista de campo-combo. P2 = la caja con el nombre adentro.`) + fr("P1 · la píldora", opc(filtro, "P1")) + fr("P2 · la caja con el nombre", opc(filtro, "P2")) + pie);
writeFileSync(`${DOCS}/etiqueta-campo.html`, cabecera("etiqueta-campo", `     La pieza (P1): VERSALITAS 11 px tinta 62 %, * rojo si es obligatorio, «· opcional» tenue si no; la marca de la guía de foco a la
     derecha; se oscurece a tinta mientras su caja está encendida. P2 = letra normal de 13 px.`) + fr("P1 · versalitas que se encienden", opc(etiqueta, "P1")) + fr("P2 · letra normal", opc(etiqueta, "P2")) + pie);
writeFileSync(`${DOCS}/casilla.html`, cabecera("casilla", `     La pieza (P1): casilla de 20 px (esquinas 6) cuyo fondo de tinta crece desde el centro y cuyo ✓ se dibuja; interruptor de 38 × 22
     que se prende en TINTA (no en rojo) y cuya perilla se estira al presionar.`) + fr("P1", opc(casilla, "P1")) + pie);
console.log("propuestas escritas en docs/unificar/propuestas/");

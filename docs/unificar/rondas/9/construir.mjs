// Arma spec.json de la ronda 9 (las seis decisiones abiertas de las rondas 6–8) y llama a elegir.mjs.
//   node construir.mjs   (desde esta carpeta; antes: bajar-css.mjs, fotos-hoy.mjs y piezas-vivas.mjs con el ERP local arriba)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const foto = (archivo, pie) => (existsSync(`img/${archivo}`) ? [{ src: `img/${archivo}`, pie }] : []);

// ================= 1 · LA LISTA QUE SUGIERE =================
const sugerencias = {
  id: "sugerencias",
  nombre: "1 · La lista que sugiere mientras escaneas o buscas",
  pregunta: "En Llegó mercadería, en Recibir contra factura y en Registrar nota de crédito se escribe (o se pasa la pistola) y abajo aparece lo que coincide. ¿Cómo se ve esa lista?",
  ayuda: "Son los tres combos que quedaron fuera de la ronda 6: la lista de todo combo no sabía dibujar una foto, un dato a la derecha ni el Enter de la pistola. Hoy cada una es distinta: Llegó con foto o un cuadrito de color, Recepción sin foto y con la factura a la derecha, la de facturas con su chip y sus montos. En las demos, escribe, muévete con ↑ ↓ y presiona Enter.",
  opciones: [
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Una lista para las dos de la pistola; la de facturas se queda (mi recomendación)",
      detalle: "Llegó mercadería y Recibir contra factura hacen lo mismo (escanear y sumar una prenda), así que usan la lista de todo combo con su fila rica: la miniatura de la prenda (la foto o, sin foto, el ícono de su categoría sobre su color, como en todo el ERP), el nombre y debajo talla · color · código, la factura a la derecha cuando importa, y la tecla «Enter» en la que se va a sumar. La de facturas de la nota de crédito no es un combo que se abre: es la lista principal de ese paso, con filtros y montos, y ya marca la activa con el hilo rojo. Se declara a propósito.",
      movimiento: "Las filas entran en cascada (30 ms). La que se va a sumar lleva el hilo rojo de canto, que crece al llegar; la tecla «Enter» asoma a su derecha. ↑ ↓ y el mouse mueven el hilo. Al sumar, la fila respira en verde una vez. Sin rebote ni bucle.",
      demo: m.una("Escribe, usa ↑ ↓ y Enter", m.sugerencias.P2()),
      imagenes: [],
    },
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Una lista para las tres",
      detalle: "Lo mismo de P2, y además la lista de facturas de la nota de crédito pasa a la misma fila: el número y el proveedor arriba, su estado y la fecha abajo, el total y el saldo a la derecha, la activa con el hilo y su «Enter». Todo lo que sugiere se ve igual en el ERP.",
      movimiento: "El de P2, también en la lista de facturas (que no flota: es la lista del paso).",
      demo: m.una("Escribe, usa ↑ ↓ y Enter", m.sugerencias.P1()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cada una la suya (se declaran excepción)",
      detalle: "Llegó: foto o un cuadrito de color sin ícono (la regla de la prenda sin foto pide su categoría), «ENTER» en versalitas. Recepción: sin foto, filas con raya y la factura a la derecha. Nota de crédito: su lista con chips y montos. Elegir A deja las tres como están, marcadas como excepción.",
      movimiento: "Llegó y Recepción aparecen de golpe (sin cascada) y la activa solo se tiñe; la de facturas tiñe y marca con el hilo.",
      donde: "Llegó mercadería (`LlegoMercaderia`), Recibir contra factura (`RecepcionEnvio`), Registrar nota de crédito (`RegistrarNotaCreditoModal`).",
      demo: m.una("Así se ven hoy (copiadas del ERP)", m.sugerencias.A()),
      imagenes: [...foto("llegada.png", "Llegó mercadería"), ...foto("recepcion.png", "Recibir contra factura"), ...foto("notaCredito.png", "Nota de crédito")],
    },
  ],
};

// ================= 2 · LA PLANILLA DE CONTEO =================
const conteo = {
  id: "conteo",
  nombre: "2 · La planilla de Contar (Inventario ▸ Conteo)",
  pregunta: "Cada prenda del conteo es una tarjeta con sus tallas: talla, debe haber, contaste y estado. ¿Toma la cara de las tablas del sistema o se queda como está?",
  ayuda: "Es la única tabla que quedó a mano: con 800 tallas en pantalla, cada fila se dibuja sola cuando cambia (por eso es una tabla HTML y no la rejilla de <Tabla>). Cómo se arma por dentro es cosa mía: lo que eliges aquí es cómo se VE. Escribe un número y presiona Enter, usa − y +, o «Completar todo».",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Con la cara de la tabla del sistema (mi recomendación)",
      detalle: "La cabecera en arena con sus títulos en taupe, el rayado en hueso y las filas un poco más altas (se lee mejor de pie, con la prenda en la mano). Lo que ya decía se queda: la fila contada bien se tiñe de verde y el estado dice Correcto, Faltan o Hay de más. Gana lo que trae la tabla del sistema: la fila que acabas de contar respira en verde una vez, y las filas entran en cascada al abrir.",
      movimiento: "Al contar (Enter, − o +), la fila respira en verde (1,4 s, una vez) y el estado se asienta. Al abrir, las filas suben en cascada (28 ms). Sin rebote ni bucle.",
      demo: m.una("Cuenta: escribe y Enter, o − y +", m.conteo.P1()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: su propia planilla (excepción, como la matriz de tallas)",
      detalle: "Cabecera en hueso suave, divisiones finas y filas compactas de 33 px (caben más tallas sin bajar). Se declara como una planilla para llenar, igual que la matriz de tallas de Existencias, que tampoco es una tabla de registros.",
      movimiento: "El estado se asienta al pasar a Correcto; la fila se tiñe de verde sin más.",
      donde: "Inventario ▸ Conteo ▸ Contar (`ListaConteo` + `FilaConteo`). La base local no tiene un conteo abierto: la demo copia sus medidas del código.",
      demo: m.una("Cuenta: escribe y Enter, o − y +", m.conteo.A()),
      imagenes: [],
    },
  ],
};

// ================= 3 · LOS FILTROS DE FRESCURA =================
const frescura = {
  id: "frescura",
  nombre: "3 · Los filtros de Frescura del piso",
  pregunta: "Frescura es la única pantalla que filtra con dos cajas de formulario; todas las demás usan la píldora. ¿Cómo filtra?",
  ayuda: "Se quedó con sus cajas porque «Estado» tiene sus opciones en tres grupos con título («Cuánto lleva», «Otros», «Temporada») y la píldora no sabía dibujarlos. Abre «Estado» en cada demo y elige.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Píldoras, y la lista dibuja sus grupos con título (mi recomendación)",
      detalle: "«Categoría» y «Estado» pasan a la píldora del sistema (borde arena, su ícono y su nombre; puesta, se rellena de tinta con su ✕). La píldora aprende a dibujar grupos con el mismo título en versalitas que ya tiene la lista de un combo de formulario. Frescura se ve como Existencias, Actividad o Compras.",
      movimiento: "El de toda píldora: el borde se calienta al pasar el mouse; abierta, borde tinta; la lista cae y sus filas entran en cascada; al elegir, se rellena de tinta (220 ms). La elegida lleva el hilo rojo y su ✓ que se dibuja.",
      demo: m.una("Abre «Estado» y elige", m.frescura.P1()),
      imagenes: [...foto("filtroSistema.png", "La píldora del sistema hoy (Actividad)")],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Píldoras, con los grupos separados por una raya",
      detalle: "Igual que P1, pero los grupos se separan con una raya fina, sin título. La lista queda más corta; quien no sabe qué es «Clásicos» o «Su stock no cuadra» pierde la pista de a qué grupo pertenece.",
      movimiento: "El de P1.",
      demo: m.una("Abre «Estado» y elige", m.frescura.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: las dos cajas (excepción)",
      detalle: "La caja de formulario haciendo de filtro (`Desplegable forma=\"caja\"`), con la lista de un combo de formulario que sí dibuja los grupos. Elegir A la deja como excepción declarada.",
      movimiento: "El chevron gira y se pone rojo; la caja se enciende como un campo.",
      donde: "Gestión ▸ Frescura del piso (`FrescuraPanel`).",
      demo: m.una("Así filtra hoy (copiada del ERP)", m.frescura.A()),
      imagenes: [...foto("frescura.png", "Frescura hoy, con «Estado» abierto")],
    },
  ],
};

// ================= 4 · DESACTIVAR COLOR =================
const desactivar = {
  id: "desactivar",
  nombre: "4 · «Desactivar color» (Catálogo ▸ Colores)",
  pregunta: "Desactivar un color es lo peligroso de esa hoja. ¿Cómo se ve?",
  ayuda: "Lo peligroso es rojo desde el principio (ronda 4), pero aquí va dentro de una frase y quedó como enlace. En Categorías y Familias, «Desactivar» es un botón rojo en el pie, junto a Guardar. En todas las formas se conserva lo que hace hoy: dos toques («¿Seguro? Confirmar») y nada más. Tócalo dos veces en cada demo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · Como Categorías: botón rojo en el pie (mi recomendación)",
      detalle: "«Desactivar color» a la izquierda del pie, rojo desde el principio; Cancelar y Guardar a la derecha; debajo, en chico, cuándo se bloquea. Desactivar se ve igual en Familias, Categorías y Colores.",
      movimiento: "El de todo botón (sube, la luz cruza, se encoge al presionar, la onda). Al primer toque dice «¿Seguro? Confirmar».",
      demo: m.una("Toca «Desactivar color» dos veces", m.desactivar.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · La frase se queda, con el botón rojo chico al final",
      detalle: "Cancelar y Guardar como hoy; abajo, la frase que explica y, a su derecha, «Desactivar color» como botón rojo chico. La explicación queda pegada a la acción.",
      movimiento: "El de todo botón; al primer toque, «¿Seguro? Confirmar».",
      demo: m.una("Toca «Desactivar color» dos veces", m.desactivar.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "aplicada", ancha: true,
      nombre: "A · Lo aplicado: enlace dentro de la frase",
      detalle: "«¿Ya no se usa este color? Desactivar color. Se bloquea si…», con el enlace del sistema (tinta con el hilo que se llena). No dice que es peligroso hasta el segundo toque.",
      movimiento: "El hilo rojo se dibuja al pasar el mouse; al primer toque, «¿Seguro? Confirmar» en seminegrita.",
      donde: "Catálogo ▸ Atributos ▸ Colores, la hoja «Editar color» (`ColoresLista`).",
      demo: m.una("Toca «Desactivar color» dos veces", m.desactivar.A()),
      imagenes: [...foto("colores.png", "Editar color hoy")],
    },
  ],
};

// ================= 5 · EL CONTEO DE UN TÍTULO =================
const titulos = {
  id: "titulos",
  nombre: "5 · Cuántos hay, junto al título de un bloque",
  pregunta: "«Camisas y Blusas: 7 prendas», «Pendientes: 3», las columnas del tablero de Órdenes. ¿Dónde va el número?",
  ayuda: "En la migración, el número de un título de bloque pasó a la derecha (como un resumen), y el de un título de grupo quedó al lado con «·». En una tarjeta ancha (Frescura), el «7 prendas» queda a más de 1.000 px de su título. Un resumen de dinero o unidades («46 unidades · S/ 3,881») se queda a la derecha en todas las formas.",
  opciones: [
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Al lado del nombre, en su globito (mi recomendación)",
      detalle: "El número va pegado al título, en la píldora chica que ya usan las pestañas («PRENDAS DEL ENVÍO 110»): la misma función —cuántos hay aquí— con la misma pieza, en bloques, en grupos y en pestañas. A la derecha queda solo lo que resume (dinero, unidades) y la acción («Ver las 9 →»).",
      movimiento: "El globito entra subiendo con el título (320 ms, una vez); si el número cambia, cambia sin saltar. Sin bucle.",
      demo: m.una("Bloques y un tablero", m.titulos.P2()),
      imagenes: [],
    },
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Al lado del nombre, tenue",
      detalle: "«Camisas y Blusas 7 prendas» con el número en letra chica y tenue, pegado al título. Lo mismo en los grupos («GENERADAS · 3»). Más silencioso que el globito; no se parece a las pestañas.",
      movimiento: "Ninguno propio: entra con su título.",
      demo: m.una("Bloques y un tablero", m.titulos.P1()),
      imagenes: [],
    },
    {
      id: "A", tipo: "aplicada", entera: true,
      nombre: "A · Lo aplicado: a la derecha",
      detalle: "El número del bloque, a la derecha como un resumen («Pendientes ……… 3»); el de un grupo, al lado con «·». Lo que hay hoy en Frescura, Pedidos no atendidos, Cuadrar el piso, Apartados y el tablero de Órdenes.",
      movimiento: "Ninguno propio.",
      demo: m.una("Bloques y un tablero", m.titulos.A()),
      imagenes: [...foto("frescura.png", "Frescura: «7 prendas» a la derecha"), ...foto("pedidos.png", "Pedidos no atendidos")],
    },
    {
      id: "B", tipo: "hoy", entera: true,
      nombre: "B · Antes de la ronda 7 (como referencia)",
      detalle: "«Pendientes (3)» en versalitas, «Camisas y Blusas 7» en serif con el número chico, «GENERADAS … 3» en las columnas: tres formas para lo mismo.",
      movimiento: "Ninguno.",
      demo: m.una("Bloques y un tablero", m.titulos.B()),
      imagenes: [],
    },
  ],
};

// ================= 6 · LAS ACCIONES CHICAS =================
const acciones = {
  id: "acciones",
  nombre: "6 · Las acciones chicas dentro de una hoja",
  pregunta: "«Repartir todas en partes iguales», «Marcar las 3 atrasadas», «Usar S/ 120.00», «Cambiar», «Deshacer»: ¿cómo se ven?",
  ayuda: "Antes eran versalitas rojas de 10–11 px que se subrayaban; en la migración pasaron a enlace (tinta de 12 px con el hilo que se llena). Las tres primeras cambian VARIAS cosas de la hoja de un toque; «Cambiar» y «Deshacer» corrigen una sola. Tócalas en cada demo (en la demo no se guarda nada).",
  opciones: [
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · Según lo que hacen (mi recomendación)",
      detalle: "Lo que cambia varias cosas de un toque (repartir, marcar todas, usar un saldo) es un botón sutil chico: se ve que es una acción y responde como todo botón. Lo que corrige una sola cosa (Cambiar, Deshacer) sigue siendo enlace. La persona distingue «esto hace algo grande» de «esto corrige».",
      movimiento: "Los botones: el movimiento de todo botón y la onda al clic. Los enlaces: el hilo rojo que se llena.",
      demo: m.una("Toca cada acción", m.acciones.P2()),
      imagenes: [],
    },
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · Todas, botón sutil chico",
      detalle: "Las cinco como botón sutil chico. Todo lo que hace algo dentro de una hoja se ve igual; «Deshacer» y «Cambiar» quedan con el mismo peso que «Repartir».",
      movimiento: "El de todo botón y la onda al clic.",
      demo: m.una("Toca cada acción", m.acciones.P1()),
      imagenes: [],
    },
    {
      id: "A", tipo: "aplicada", ancha: true,
      nombre: "A · Lo aplicado: todas enlace",
      detalle: "Las cinco como enlace del sistema (12 px, tinta, el hilo que se llena). Las más silenciosas; «Repartir todas…» se lee como un texto más.",
      movimiento: "El hilo rojo se dibuja al pasar el mouse.",
      donde: "Nueva compra, Recibir, Por pagar, Nota de crédito, Facturas de proveedor, y unas 20 más.",
      demo: m.una("Toca cada acción", m.acciones.A()),
      imagenes: [...foto("atrasadas.png", "Recibir: «Marcar las 1 atrasadas»"), ...foto("ncCambiar.png", "Nota de crédito: «Cambiar»")],
    },
    {
      id: "B", tipo: "hoy", ancha: true,
      nombre: "B · Antes: versalitas rojas",
      detalle: "VERSALITAS rojas de 10–11 px que se subrayan al pasar el mouse. Gastan el rojo (el acento de la pantalla) en acciones que no son peligrosas.",
      movimiento: "El subrayado aparece de golpe.",
      demo: m.una("Toca cada acción", m.acciones.B()),
      imagenes: [],
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 9 · las seis que quedaron abiertas",
  clave: "unificar-ronda9",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["demo9.css"],
  guion: "demo9.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "La migración de las rondas 6–8 dejó seis preguntas que no se podían decidir por regla. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP: escribe en los buscadores, usa ↑ ↓ y Enter, cuenta tallas, abre los filtros, toca los botones (nada se guarda). Lo que dice «Existe hoy» o «Lo aplicado ahora» está copiado del ERP de hoy, y las fotos son de esta mañana. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario. «Ver en oscuro», abajo.",
  familias: [
    { id: "combo", nombre: "Listas que sugieren", pregunta: "Lo que aparece debajo de un buscador o de la pistola.", grupos: [sugerencias] },
    { id: "tabla", nombre: "La planilla de Conteo", pregunta: "La última tabla dibujada a mano.", grupos: [conteo] },
    { id: "filtro", nombre: "Filtros de Frescura", pregunta: "La última barra de filtros con cajas.", grupos: [frescura] },
    { id: "accion.eliminar", nombre: "Desactivar un color", pregunta: "Lo peligroso dentro de una frase.", grupos: [desactivar] },
    { id: "titulo-seccion", nombre: "El número de un título", pregunta: "Cuántos hay en un bloque o un grupo.", grupos: [titulos] },
    { id: "enlace", nombre: "Acciones chicas", pregunta: "Lo que se toca dentro de una hoja y no es el botón principal.", grupos: [acciones] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });

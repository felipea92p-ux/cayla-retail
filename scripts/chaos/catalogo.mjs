#!/usr/bin/env node
/**
 * Catálogo de ataques de `/chaos` — la lista de «maneras de usar mal el sistema», como DATOS, no como prosa.
 *
 * POR QUÉ DATOS. Un catálogo en un `.md` se lee una vez y se olvida; uno en datos se puede filtrar por lo que tiene una pantalla,
 * sortear con semilla (reproducible), comprobar contra las invariantes que existen y probar que cubre las ocho familias. Es la
 * decisión de Felipe (2026-10-06): «catálogo fijo + azar con semilla». El catálogo es lo conocido; el azar descubre lo que no
 * se nos ocurrió; y la semilla hace que un hallazgo se pueda repetir (un hallazgo que no se repite no se puede arreglar).
 *
 * QUÉ ES UN ATAQUE. `como` son los pasos (los hace el agente en el navegador, o una consulta en la base); `esperado` es lo que
 * un sistema resistente hace; `mira` son las invariantes de `invariantes.mjs` que hay que comprobar DESPUÉS si el ataque escribe.
 * `aplica` son los ingredientes que la pantalla debe tener para que el ataque tenga sentido (un ataque de montos no va en una
 * pantalla sin montos); vacío = aplica a todas. `nucleo` = siempre corre (el catálogo fijo); el resto entra por sorteo.
 *
 * GRAVEDAD TÍPICA. Es una pista, no un veredicto: la gravedad real la decide la EVIDENCIA del informe (1 estado imposible en la
 * base · 2 dato malo guardado en silencio · 3 pantalla caída · 4 error feo pero seguro). Un ataque de doble clic es gravedad 1
 * si la base queda con dos ventas y 4 si solo muestra un error crudo.
 *
 * LO QUE NO ES. No es una lista para recorrer entera en cada pantalla (serían cientos de pasos): `plan` elige lo que le toca a
 * la pantalla según sus ingredientes. Y los ataques de PERMISOS son de seguridad: sus hallazgos NO van a un archivo versionado
 * (el repo es público), se dicen en el chat.
 *
 * USO
 *   node scripts/chaos/catalogo.mjs [--familia entradas] [--capa base] [--json]
 *   node scripts/chaos/catalogo.mjs plan --aplica texto,monto,guarda,dinero [--semilla 42] [--azar 8] [--familias entradas,doble-clic] [--json]
 *   node scripts/chaos/catalogo.mjs valores [--tipo monto]
 */

import { pathToFileURL } from "node:url";

export const FAMILIAS = {
  entradas: { prefijo: "ENT", nombre: "Entradas hostiles", que: "Lo que se escribe o se pega: vacíos, límites, formatos peruanos y gringos, emojis, inyección." },
  "doble-clic": { prefijo: "DC", nombre: "Doble clic y reenvío", que: "Pulsar dos o diez veces, Enter repetido, enviar con el loader aún activo, reintentar el mismo envío." },
  navegacion: { prefijo: "NAV", nombre: "Navegación torcida", que: "Atrás, recargar a medio guardar, dos pestañas, URL directa a medio flujo, ids ajenos, cambiar de sede." },
  concurrencia: { prefijo: "CON", nombre: "Concurrencia entre cuentas", que: "Dos personas haciendo lo mismo a la vez: la última prenda, la misma caja, el mismo traslado." },
  permisos: { prefijo: "PER", nombre: "Permisos y URL ajena", que: "Entrar a lo que no se ve, llamar funciones de líder, leer dinero por la API, actuar sobre otra sede." },
  "red-sesion": { prefijo: "RS", nombre: "Red y sesión", que: "Sin red, red lenta, respuesta que no llega, sesión vencida, SUNAT o el padrón caídos." },
  celular: { prefijo: "CEL", nombre: "Celular 375 px", que: "Los mismos abusos con el dedo: toque doble, teclado virtual, rotar, pegar. Vender, Cambios y Devoluciones (PL-105)." },
  teclado: { prefijo: "TEC", nombre: "Teclado y accesibilidad", que: "Tab, Escape en un combo, Enter que envía sin querer, foco perdido, escribir muy rápido." },
};

/** Ingredientes que una pantalla puede tener (`aplica` y `--aplica` hablan este vocabulario). */
export const INGREDIENTES = [
  "texto", "numero", "monto", "documento", "telefono", "email", "fecha", // qué se escribe
  "guarda", "pasos", "modal", "combo", "lista", "busqueda-url", // cómo se arma la pantalla
  "dinero", "stock", "comprobante", // qué toca (lo que hace que un fallo sea de gravedad 1)
  "id-en-url", "sede", "celular", // dónde vive
];

const CAPAS = ["navegador", "base", "ambas"];

// ── Valores hostiles, por tipo de campo ─────────────────────────────────────────────────────────────────────────────────────

/** Cada valor lleva su `etiqueta` (para el informe) y el `valor` literal. Los largos se generan para no ensuciar el archivo. */
export const VALORES_HOSTILES = {
  texto: [
    { etiqueta: "vacío", valor: "" },
    { etiqueta: "solo espacios", valor: "     " },
    { etiqueta: "una letra", valor: "a" },
    { etiqueta: "espacios al borde", valor: "  Blusa Aurora  " },
    { etiqueta: "300 caracteres", valor: "A".repeat(300) },
    { etiqueta: "5000 caracteres", valor: "Blusa ".repeat(834) },
    { etiqueta: "una palabra de 400 letras", valor: "Z".repeat(400) },
    { etiqueta: "emojis", valor: "Blusa 👗🧵✂️ nueva" },
    { etiqueta: "tildes y eñe", valor: "Ñandú Ávila Güemes" },
    { etiqueta: "árabe (derecha a izquierda)", valor: "مرحبا بالعالم" },
    { etiqueta: "cero-ancho invisible", valor: "Blu​sa" },
    { etiqueta: "carácter nulo", valor: "a\u0000b" },
    { etiqueta: "salto de línea", valor: "línea uno\nlínea dos" },
    { etiqueta: "comillas tipográficas de WhatsApp", valor: "“Blusa” ‘Aurora’ — talla M" },
    { etiqueta: "SQL", valor: "'; drop table retail.ventas; --" },
    { etiqueta: "HTML", valor: "<img src=x onerror=alert(1)><b>negrita</b>" },
    { etiqueta: "plantilla", valor: "{{7*7}} ${7*7} %s %d" },
    { etiqueta: "comodines de búsqueda", valor: "100%_\\" },
  ],
  numero: [
    { etiqueta: "vacío", valor: "" },
    { etiqueta: "cero", valor: "0" },
    { etiqueta: "negativo", valor: "-1" },
    { etiqueta: "decimal con punto", valor: "1.5" },
    { etiqueta: "decimal con coma", valor: "1,5" },
    { etiqueta: "notación científica", valor: "1e3" },
    { etiqueta: "pasa el entero de 32 bits", valor: "2147483648" },
    { etiqueta: "doce nueves", valor: "999999999999" },
    { etiqueta: "letras", valor: "abc" },
    { etiqueta: "con espacios", valor: " 5 " },
    { etiqueta: "dígito árabe", valor: "٣" },
    { etiqueta: "NaN", valor: "NaN" },
    { etiqueta: "Infinity", valor: "Infinity" },
    { etiqueta: "signo suelto", valor: "5-" },
  ],
  monto: [
    { etiqueta: "cero", valor: "0" },
    { etiqueta: "un centavo negativo", valor: "-0.01" },
    { etiqueta: "tres decimales", valor: "0.001" },
    { etiqueta: "coma decimal", valor: "12,50" },
    { etiqueta: "miles con coma (S/ 1,299.50)", valor: "1,299.50" },
    { etiqueta: "miles con punto (1.299,50)", valor: "1.299,50" },
    { etiqueta: "con «S/»", valor: "S/ 50" },
    { etiqueta: "con la palabra soles", valor: "50 soles" },
    { etiqueta: "solo el punto", valor: ".5" },
    { etiqueta: "punto final", valor: "5." },
    { etiqueta: "cien millones", valor: "99999999.99" },
    { etiqueta: "notación científica", valor: "1e9" },
    { etiqueta: "una cuenta", valor: "0.1+0.2" },
  ],
  documento: [
    { etiqueta: "vacío", valor: "" },
    { etiqueta: "DNI de 7 dígitos", valor: "1234567" },
    { etiqueta: "DNI de 9 dígitos", valor: "123456789" },
    { etiqueta: "DNI con letra", valor: "12345678a" },
    { etiqueta: "DNI de ceros", valor: "00000000" },
    { etiqueta: "DNI con espacios", valor: "12 345 678" },
    { etiqueta: "RUC de 11 dígitos con dígito errado", valor: "20123456781" },
    { etiqueta: "RUC que empieza en 30", valor: "30123456789" },
    { etiqueta: "RUC de 10 dígitos", valor: "1012345678" },
  ],
  telefono: [
    { etiqueta: "vacío", valor: "" },
    { etiqueta: "muy corto", valor: "12345" },
    { etiqueta: "con +51 y espacios", valor: "+51 987 654 321" },
    { etiqueta: "con ceros delante", valor: "00987654321" },
    { etiqueta: "fijo con paréntesis", valor: "(01) 234-5678" },
    { etiqueta: "quince nueves", valor: "999999999999999" },
    { etiqueta: "letras", valor: "novecientos" },
  ],
  email: [
    { etiqueta: "vacío", valor: "" },
    { etiqueta: "sin dominio", valor: "a@b" },
    { etiqueta: "doble arroba", valor: "a@@b.com" },
    { etiqueta: "espacios al borde", valor: " a@b.com " },
    { etiqueta: "con eñe", valor: "ñandú@correo.pe" },
    { etiqueta: "muy largo", valor: `${"a".repeat(300)}@b.com` },
  ],
  fecha: [
    { etiqueta: "vacía", valor: "" },
    { etiqueta: "31 de febrero", valor: "31/02/2026" },
    { etiqueta: "mes 13", valor: "2026-13-01" },
    { etiqueta: "ceros", valor: "0000-00-00" },
    { etiqueta: "año 1900", valor: "1900-01-01" },
    { etiqueta: "año 2999", valor: "2999-12-31" },
    { etiqueta: "ambigua (06/10/26)", valor: "06/10/26" },
    { etiqueta: "en palabras", valor: "ayer" },
  ],
};

// ── Ataques ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Fábrica: numera dentro de la familia y valida lo básico al armar. */
const familia = (clave, lista) =>
  lista.map((a, i) => ({
    id: `${FAMILIAS[clave].prefijo}-${String(i + 1).padStart(2, "0")}`,
    familia: clave,
    capa: "navegador",
    aplica: [],
    escribe: false,
    nucleo: false,
    mira: [],
    gravedadTipica: 3,
    ...a,
  }));

export const ATAQUES = [
  ...familia("entradas", [
    { nombre: "Enviar vacío", aplica: ["guarda"], nucleo: true, como: "Abre el formulario, no escribas nada y pulsa el botón que guarda. Después llena solo UN campo y repite.", esperado: "Dice QUÉ falta, en lenguaje de tienda y junto al campo. No se guarda nada, no sale un error de Postgres.", gravedadTipica: 3 },
    { nombre: "Solo espacios", aplica: ["texto", "guarda"], como: "Escribe cinco espacios en cada campo de texto obligatorio y guarda.", esperado: "Cuenta como vacío (se recorta). No se guarda un nombre invisible.", escribe: true, mira: ["INV-10"], gravedadTipica: 2 },
    { nombre: "Texto larguísimo", aplica: ["texto"], nucleo: true, como: "Usa los valores `texto` de 300, 5000 y una palabra de 400 letras en cada campo de texto y guarda.", esperado: "Corta o rechaza con aviso claro (el campo tiene su límite). La pantalla no se desborda ni se parte, y nada responde 500.", escribe: true, gravedadTipica: 3 },
    { nombre: "Caracteres raros", aplica: ["texto"], como: "Usa los valores `texto`: emojis, tildes, árabe, cero-ancho, carácter nulo, salto de línea y comillas de WhatsApp.", esperado: "Se guardan y se ven tal cual, o se rechazan con un aviso. El carácter nulo NO produce un error crudo de Postgres. Se ven bien en el ticket y la etiqueta.", escribe: true, capa: "ambas", gravedadTipica: 2 },
    { nombre: "Inyección en un texto", aplica: ["texto"], nucleo: true, mira: ["INV-01", "INV-10"], como: "Usa los valores `texto` de SQL, HTML y plantilla, y guarda. Después ve a donde se muestra ese texto (lista, ticket, etiqueta, buscador).", esperado: "Se guarda LITERAL o se rechaza; jamás se ejecuta. Se ve como texto, no como negrita ni como un `alert`. La tabla sigue existiendo.", escribe: true, capa: "ambas", gravedadTipica: 1 },
    { nombre: "Números en el límite", aplica: ["numero"], nucleo: true, como: "Usa los valores `numero` (cero, negativo, decimal con punto y con coma, científica, 2147483648, letras, NaN) en cada campo de cantidad.", esperado: "Un entero se acepta; lo demás se rechaza con un aviso que dice qué se esperaba. Nunca una cantidad negativa o cero guardada, nunca un desborde.", escribe: true, mira: ["INV-01", "INV-03"], gravedadTipica: 1 },
    { nombre: "Montos con formato peruano y gringo", aplica: ["monto"], nucleo: true, como: "Usa los valores `monto` en cada campo de precio, abono o pago: «1,299.50», «1.299,50», «12,50», «S/ 50», «50 soles», tres decimales.", esperado: "O lo entiende bien (1,299.50 = mil doscientos noventa y nueve con cincuenta) o lo rechaza mostrando un ejemplo. JAMÁS lo interpreta distinto en silencio (1,299.50 como 1.29).", escribe: true, mira: ["INV-02", "INV-07"], gravedadTipica: 1 },
    { nombre: "Documentos mal formados", aplica: ["documento"], como: "Usa los valores `documento` (DNI de 7 y 9 dígitos, con letra, de ceros; RUC de 10, 11 con dígito errado y que empieza en 30).", esperado: "Dice qué documento espera y por qué no sirve. Una factura no sale con un RUC inválido. La consulta del padrón fallida no bloquea la pantalla.", escribe: true, mira: ["INV-06", "INV-07"], gravedadTipica: 2 },
    { nombre: "Teléfono y correo raros", aplica: ["telefono"], como: "Usa los valores `telefono` y `email` en el campo de contacto.", esperado: "Normaliza o rechaza con un ejemplo. El WhatsApp no recibe un número imposible.", escribe: true, gravedadTipica: 3 },
    { nombre: "Fechas imposibles", aplica: ["fecha"], como: "Usa los valores `fecha` (31/02, mes 13, ceros, 1900, 2999, 06/10/26, «ayer») en cada campo de fecha.", esperado: "Rechaza lo imposible y aclara lo ambiguo (día/mes). Una fecha de 1900 no entra a un cierre ni a un reporte.", escribe: true, gravedadTipica: 2 },
    { nombre: "Pegar basura", aplica: ["texto"], como: "Copia de Excel una celda con tabuladores y saltos de línea y pégala en un campo de una línea; copia de WhatsApp con comillas tipográficas y pégala en otro.", esperado: "El campo la limpia o la acepta sin partirse. No se guardan tabuladores ocultos que luego rompan una búsqueda o un código de barras.", escribe: true, gravedadTipica: 3 },
    { nombre: "Espacios y mayúsculas casi iguales", aplica: ["texto", "guarda"], como: "Crea «Vino»; después intenta crear «vino », «VINO» y «Víno». Repite con una marca, una categoría o un nombre de producto.", esperado: "Detecta «ya existe» (clave normalizada, ADR-0024). Nunca dos registros que son el mismo escrito distinto.", escribe: true, capa: "ambas", gravedadTipica: 2 },
    { nombre: "Un carácter más del límite", aplica: ["texto"], como: "Averigua el límite de cada campo (`maxlength`, `MAX_DESCRIPCION`, un `check` de la base) y envía exactamente el límite y el límite + 1.", esperado: "El límite entra; uno más se rechaza con un aviso. La pantalla y la base dicen lo mismo (no pasa en una y falla en la otra).", escribe: true, capa: "ambas", gravedadTipica: 3 },
    { nombre: "Función de la base con parámetros hostiles", aplica: [], capa: "base", escribe: true, como: "Llama la RPC que guarda la pantalla directo en Postgres local (`scripts/pruebas/` es el modelo): un `null` en cada parámetro obligatorio, un uuid que no existe, un uuid de otra sede, un arreglo vacío y uno con duplicados, un tipo equivocado.", esperado: "Cada rechazo sale con un mensaje en idioma CAYLA (la guardia de la función), no con `23502`, `22P02` ni `42883` crudos. Nada queda escrito.", mira: ["INV-01", "INV-02", "INV-03"], gravedadTipica: 2 },
  ]),

  ...familia("doble-clic", [
    { nombre: "Doble clic en el botón que guarda", aplica: ["guarda"], nucleo: true, escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-06", "INV-11", "INV-12"], como: "Llena el formulario bien y pulsa el botón que guarda dos veces seguidas, lo más rápido que puedas (dos clics en menos de 100 ms con `computer` → `double_click`).", esperado: "UNA fila, UN movimiento, UN comprobante. El botón se bloquea al primer clic (giro «Guardando…»).", gravedadTipica: 1 },
    { nombre: "Ráfaga de diez clics", aplica: ["guarda"], escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-11", "INV-12"], como: "Igual que el anterior, pero diez clics en ráfaga (por JavaScript: `for (i<10) boton.click()` en el mismo tick).", esperado: "Una sola operación. Un clic que llega antes de que React pinte el bloqueo no escapa: el candado debe estar también en la función de la base (token).", capa: "ambas", gravedadTipica: 1 },
    { nombre: "El mismo movimiento de stock dos veces", aplica: ["guarda", "stock"], nucleo: true, escribe: true, mira: ["INV-01", "INV-12"], como: "En Ajustar inventario, Recibir, Bajar al piso o Traslado: pulsa Guardar dos veces seguidas con una cantidad de 3.", esperado: "El stock cambia en 3, no en 6. `movimientos` tiene UNA fila. Si cambia en 6, es el peor hallazgo posible: stock que miente.", gravedadTipica: 1 },
    { nombre: "Enter repetido", aplica: ["guarda", "texto"], escribe: true, mira: ["INV-12"], como: "Con el foco en el último campo, pulsa Enter cinco veces seguidas (`key` con `repeat: 5`).", esperado: "Se envía una vez o ninguna. Enter en un campo de búsqueda o un combo no envía el formulario principal.", gravedadTipica: 2 },
    { nombre: "Cerrar apenas se pulsa Guardar", aplica: ["guarda", "modal"], escribe: true, como: "Pulsa Guardar y, antes de que termine el loader, pulsa Escape o la X del modal.", esperado: "La operación termina entera o no ocurre, nunca a medias. Al reabrir se ve el resultado verdadero.", mira: ["INV-01", "INV-02", "INV-03"], gravedadTipica: 1 },
    { nombre: "Pulsar con el loader activo", aplica: ["guarda"], como: "Pulsa Guardar y, mientras el loader a pantalla completa está visible, intenta pulsar cualquier cosa (clic, Tab+Enter).", esperado: "El loader único (ADR-0149) cubre y bloquea. Nada se activa debajo.", gravedadTipica: 3 },
    { nombre: "Dos botones que escriben a la vez", aplica: ["guarda", "dinero"], escribe: true, mira: ["INV-02", "INV-03", "INV-05"], como: "En una pantalla con dos acciones que escriben (Cobrar y Anular, Cerrar caja y Registrar movimiento), pulsa una y la otra sin esperar.", esperado: "Una gana y la otra recibe un mensaje claro, o se ponen en cola. Nunca las dos a medias.", gravedadTipica: 1 },
    { nombre: "Reintento con el mismo token", aplica: ["guarda"], capa: "base", escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-06"], como: "Llama dos veces la RPC con el MISMO `p_token` (como una cajera que reintenta tras cortarse la red). Mira `iniciar_traslado`, `registrar_venta`, `registrar_movimiento_caja`, `apartar_stock`, `recibir_lote`.", esperado: "Devuelve el MISMO id y mueve stock o dinero UNA sola vez (ADR-0032, ADR-0033, ADR-0190). Otro token = otra fila.", gravedadTipica: 1 },
  ]),

  ...familia("navegacion", [
    { nombre: "«Atrás» a mitad de un guardado por pasos", aplica: ["pasos"], nucleo: true, como: "Avanza hasta el paso 3 de un formulario por pasos o un cobro, usa el «Atrás» del navegador y vuelve a entrar.", esperado: "No pierde lo escrito sin avisar ni deja un registro a medias (un producto sin variantes, una venta sin pago).", mira: ["INV-02", "INV-03"], escribe: true, gravedadTipica: 2 },
    { nombre: "Recargar con el formulario lleno", aplica: ["guarda"], como: "Llena un formulario y pulsa F5 / Cmd+R sin guardar.", esperado: "Avisa «se perderá lo escrito» o conserva un borrador. No guarda nada a medias.", gravedadTipica: 3 },
    { nombre: "Recargar justo al pulsar Guardar", aplica: ["guarda"], nucleo: true, escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-06", "INV-11", "INV-12"], como: "Pulsa Guardar y recarga la página a los 100 ms, antes de que llegue la respuesta. Después ve a la lista y mira qué quedó.", esperado: "La operación se hizo UNA vez o no se hizo. Al reintentar tras recargar no se duplica.", gravedadTipica: 1 },
    { nombre: "Cerrar un modal con datos escritos", aplica: ["modal", "texto"], como: "Escribe en dos campos y cierra con Escape, con clic fuera y con la X.", esperado: "Una regla coherente en las tres vías (confirma o conserva); nunca pierde en una y confirma en otra. No guarda al cerrar.", gravedadTipica: 3 },
    { nombre: "La misma pantalla en dos pestañas", aplica: ["guarda"], escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-05"], como: "Abre la pantalla en dos pestañas, guarda el mismo dato en la primera y luego en la segunda (que quedó vieja).", esperado: "La segunda ve el estado actual o recibe un error claro («ya se registró»). Nada duplicado, nada pisado en silencio.", capa: "ambas", gravedadTipica: 1 },
    { nombre: "URL directa a medio flujo", aplica: ["pasos"], como: "Pega la URL del paso 3 sin haber pasado por el 1 y el 2; abre `/vender/apartados` sin caja abierta; abre una pantalla de edición sin el id.", esperado: "Redirige o explica qué falta. No se cae ni muestra una pantalla vacía sin decir por qué.", gravedadTipica: 3 },
    { nombre: "Id inexistente o ajeno en la URL", aplica: ["id-en-url"], nucleo: true, como: "Cambia el id de la URL por uno inventado (`00000000-0000-0000-0000-000000000000`), por texto (`abc`) y por el de un registro de OTRA sede.", esperado: "Un «no encontrado» amable. Nunca datos de otra sede, nunca una pantalla blanca ni un 500.", mira: [], gravedadTipica: 1 },
    { nombre: "Parámetros de URL basura", aplica: ["busqueda-url"], como: "En la URL de una lista pon `?q=%00`, `?pagina=-1`, `?pagina=999999`, `?orden=xyz`, `?q=` con 5000 caracteres.", esperado: "Se ignoran o se corrigen a un valor válido. La lista no se cae ni se queda en blanco sin decirlo.", gravedadTipica: 3 },
    { nombre: "Cambiar de sede con trabajo a medias", aplica: ["sede", "guarda"], nucleo: true, escribe: true, mira: ["INV-04", "INV-01"], como: "Con un carrito lleno o un formulario a medias, cambia la sede en el selector de arriba y luego guarda.", esperado: "El carrito se limpia con aviso o se conserva dejando claro de qué sede es. Nada se cobra ni se mueve en la sede equivocada.", gravedadTipica: 1 },
    { nombre: "Atrás y adelante después de guardar", aplica: ["guarda"], escribe: true, mira: ["INV-12", "INV-11"], como: "Guarda; usa Atrás (vuelve al formulario) y Adelante varias veces; pulsa Guardar en el formulario que reapareció.", esperado: "El formulario viejo no reenvía lo ya guardado. Si lo hace, el token lo frena.", gravedadTipica: 1 },
  ]),

  ...familia("concurrencia", [
    { nombre: "Dos cuentas venden la última prenda", aplica: ["stock", "dinero"], nucleo: true, capa: "ambas", escribe: true, mira: ["INV-01", "INV-03", "INV-02"], como: "Deja UNA unidad de una prenda en una sede. Con dos cuentas del seed (navegador A y B, o dos sesiones psql), vende esa prenda en el mismo instante. Base: dos transacciones llamando `registrar_venta` con el mismo `variante_id`.", esperado: "Una vende; la otra recibe «ya no hay stock» en idioma CAYLA. El stock queda en 0, nunca en -1 (`stock_cantidad_check`) y nunca vendida dos veces (INV-03).", gravedadTipica: 1 },
    { nombre: "Dos cuentas cierran la misma caja", aplica: ["dinero"], capa: "ambas", escribe: true, mira: ["INV-05", "INV-04"], como: "Con dos cuentas de la misma sede, pulsa «Cerrar caja» a la vez con montos contados distintos.", esperado: "Un solo cierre queda registrado; el otro recibe «ya está cerrada». La diferencia es la del que ganó.", gravedadTipica: 1 },
    { nombre: "Dos cuentas abren caja a la vez", aplica: ["dinero"], capa: "base", escribe: true, mira: ["INV-04", "INV-05"], como: "Dos sesiones llaman `abrir_caja` en la misma sede al mismo tiempo.", esperado: "Una caja abierta (`cajas_ubicacion_abierta_unica`) y un mensaje claro para la otra. Sin error crudo de índice único.", gravedadTipica: 1 },
    { nombre: "Dos cuentas editan el mismo producto", aplica: ["guarda", "id-en-url"], capa: "ambas", escribe: true, como: "A cambia el precio, B cambia la descripción del MISMO producto, cada una con su formulario abierto desde antes.", esperado: "O gana el último aviso incluido, o B ve que cambió algo. No se pierde el cambio de A en silencio sobrescribiendo campos que B nunca tocó.", gravedadTipica: 2 },
    { nombre: "Dos cuentas reciben el mismo traslado", aplica: ["stock"], capa: "base", escribe: true, mira: ["INV-01", "INV-08"], como: "Dos sesiones llaman la recepción del mismo traslado a la vez, con la cantidad completa.", esperado: "Una recepción. La otra recibe «ya fue recibido». La sede destino no ve el doble de stock (INV-08, INV-01).", gravedadTipica: 1 },
    { nombre: "Vender mientras otra cuenta ajusta ese stock", aplica: ["stock", "dinero"], capa: "base", escribe: true, mira: ["INV-01", "INV-03"], como: "A vende 2 unidades; B ajusta (-2) las mismas prendas en el mismo instante, con stock para solo una de las dos operaciones.", esperado: "Una gana, la otra recibe el aviso de stock insuficiente. Nunca negativo (la guardia con `for update` de `fn_aplicar_movimiento`).", gravedadTipica: 1 },
    { nombre: "Anular y devolver la misma venta", aplica: ["dinero", "stock"], capa: "base", escribe: true, mira: ["INV-01", "INV-03", "INV-02"], como: "Dos sesiones: una anula la venta, la otra aprueba su devolución, a la vez.", esperado: "Un solo reverso de stock y de dinero. La prenda no vuelve al estante dos veces.", gravedadTipica: 1 },
    { nombre: "Apartar y vender la misma prenda", aplica: ["stock"], capa: "base", escribe: true, mira: ["INV-01"], como: "Una sesión aparta la última unidad; otra la vende en el mismo instante.", esperado: "Una gana; la otra recibe un aviso claro. `cantidad_apartada` nunca excede la cantidad (`stock_cantidad_apartada_no_excede_cantidad`).", gravedadTipica: 1 },
    { nombre: "Ráfaga de diez sesiones", aplica: ["stock"], nucleo: true, capa: "base", escribe: true, mira: ["INV-01", "INV-03", "INV-12"], como: "Lanza 10 sesiones paralelas llamando la misma función con el mismo stock (`bajada_al_piso_concurrencia.mjs` es el modelo; usa `spawn` y `docker exec`).", esperado: "Ninguna se cancela con `40P01` (deadlock): las bloqueadas esperan en orden (ADR-0190). El stock cuadra con los movimientos.", gravedadTipica: 1 },
    { nombre: "Carrito al revés", aplica: ["stock", "dinero"], capa: "base", escribe: true, mira: ["INV-01", "INV-03"], como: "Una venta con el carrito [A, B] y otra [B, A] al mismo tiempo (ADR-0190).", esperado: "Las dos terminan; ninguna se cancela por deadlock.", gravedadTipica: 1 },
    { nombre: "Dos ventas, un correlativo", aplica: ["comprobante"], capa: "base", escribe: true, mira: ["INV-06", "INV-07"], como: "Dos ventas con boleta en la misma serie, a la vez.", esperado: "Dos números distintos y consecutivos (`fn_reservar_numero_serie` con `for update`). Nunca el mismo número dos veces.", gravedadTipica: 1 },
  ]),

  ...familia("permisos", [
    { nombre: "Entrar por URL a un módulo que no se ve", aplica: [], nucleo: true, como: "Con la cuenta de colaboradora del seed (`micaela`), abre por URL directa un módulo que su rol no ve: Finanzas, Roles y accesos, Compras.", esperado: "«Sin acceso» (`exigirModulo`). Ni un dato, ni un número, ni el esqueleto de la pantalla.", gravedadTipica: 1 },
    { nombre: "Función de líder desde una cuenta de colaboradora", aplica: [], capa: "base", nucleo: true, escribe: true, como: "Con el JWT de `micaela`, llama por la API una RPC de líder (`guardar_cuentas_proveedor`, una de Roles y accesos, un ajuste de stock de otra sede).", esperado: "Se rechaza con el mensaje de la guardia (`fn_es_lider()`). Nada queda escrito.", mira: ["INV-01", "INV-10"], gravedadTipica: 1 },
    { nombre: "Leer dinero por la API sin ser líder", aplica: ["dinero"], capa: "base", como: "Con el JWT de una colaboradora, haz `select` directo a `compras`, `compra_pagos` y `costo_historial` por la API REST.", esperado: "Vacío o rechazado (RLS, ADR-0126). El costo por prenda no se filtra.", gravedadTipica: 1 },
    { nombre: "Escribir directo en una tabla", aplica: ["stock"], capa: "base", escribe: true, como: "Con una sesión `authenticated`, intenta `insert`, `update` y `delete` directos sobre `movimientos`, `stock` y `ventas` por la API.", esperado: "Rechazado: solo se escribe por las funciones. El libro de `movimientos` es inmutable.", mira: ["INV-01", "INV-10"], gravedadTipica: 1 },
    { nombre: "Actuar sobre otra sede", aplica: ["sede"], capa: "base", escribe: true, como: "Con una cuenta fija a una sede (`micaela`), llama una RPC con el `ubicacion_id` de OTRA sede.", esperado: "Rechazo explícito. Una terminal fija a una sede no vende ni mueve stock en otra.", mira: ["INV-04", "INV-01"], gravedadTipica: 1 },
    { nombre: "Cuenta suspendida con la sesión abierta", aplica: ["guarda"], capa: "ambas", escribe: true, mira: ["INV-01", "INV-10"], como: "Suspende a una colaboradora de prueba desde otra cuenta y, SIN que ella cierre sesión, haz que guarde algo.", esperado: "Su próximo guardado se rechaza con un mensaje claro. El permiso se consulta en cada escritura, no solo al entrar.", gravedadTipica: 1 },
    { nombre: "Firmar como otra persona", aplica: ["guarda"], capa: "base", escribe: true, como: "Llama una RPC que guarda con el responsable de otra persona sin el candado de asistencia (`fn_actor_persona_id(true)`, ADR-0162).", esperado: "Se rechaza o exige la asistencia. El movimiento queda firmado por quien de verdad lo hizo.", mira: ["INV-10"], gravedadTipica: 1 },
    { mira: ["INV-01", "INV-10"], nombre: "Dar un permiso que no se tiene", aplica: [], capa: "base", escribe: true, como: "Con un colaborador que NO es líder, llama las RPC de Roles y accesos para asignarle a otro un módulo o rol que él mismo no ve.", esperado: "Se rechaza (`fn_exigir_modulos_dentro_de_lo_mio`, `fn_exigir_rol_dentro_de_lo_mio`, ADR-0178). Solo das lo que tienes.", gravedadTipica: 1 },
    { nombre: "Sin sesión (anon)", aplica: [], capa: "base", como: "Sin token, llama cada RPC que la pantalla usa por la API.", esperado: "Rechazada (`anon` no tiene EXECUTE). Ninguna devuelve un dato.", gravedadTipica: 1 },
    { nombre: "Ruta sin menú", aplica: ["id-en-url"], como: "Con cada cuenta del seed, abre por URL las rutas que NO salen en el menú (`/pedidos-no-atendidos`, `/actividad`) y las de otro módulo.", esperado: "Cada una respeta el módulo de la cuenta. Una ruta sin entrada de menú no es una ruta sin candado.", gravedadTipica: 1 },
  ]),

  ...familia("red-sesion", [
    { nombre: "Cortar la red al pulsar Guardar", aplica: ["guarda"], nucleo: true, escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-06", "INV-11", "INV-12"], como: "Activa modo sin conexión (`javascript_tool`: sustituye `window.fetch` por una función que lanza `TypeError: Failed to fetch`) y pulsa Guardar. Restablece la red y reintenta.", esperado: "Dice claramente que NO se guardó y conserva lo escrito. El reintento no duplica nada (token, ADR-0032).", gravedadTipica: 1 },
    { nombre: "Red lenta", aplica: ["guarda"], como: "Retrasa `fetch` 8 segundos con `javascript_tool` y pulsa Guardar; intenta pulsar de nuevo y navegar mientras espera.", esperado: "El loader único aparece y bloquea. No hay un segundo envío ni un timeout silencioso.", escribe: true, mira: ["INV-12"], gravedadTipica: 2 },
    { nombre: "La base guardó, la respuesta no llegó", aplica: ["guarda"], nucleo: true, escribe: true, capa: "ambas", mira: ["INV-01", "INV-02", "INV-03", "INV-06", "INV-11", "INV-12"], como: "Deja pasar el `fetch` real pero descarta su respuesta (`fetch(...).then(() => { throw new TypeError('Failed to fetch') })`) y pulsa Guardar; luego reintenta con el mismo formulario.", esperado: "El reintento devuelve lo ya guardado (mismo token) y NO cobra ni mueve stock dos veces. Es el escenario diario de una tienda con internet malo.", gravedadTipica: 1 },
    { nombre: "Sesión vencida con el formulario lleno", aplica: ["guarda"], como: "Borra las cookies de sesión (`javascript_tool` + `localStorage`/cookie) con el formulario lleno y pulsa Guardar.", esperado: "Lleva a iniciar sesión sin perder lo escrito, o avisa claramente. Jamás guarda como otra persona.", escribe: true, gravedadTipica: 2 },
    { nombre: "Cerrar sesión en otra pestaña", aplica: ["guarda"], escribe: true, como: "Abre dos pestañas, cierra sesión en una y guarda en la otra.", esperado: "La segunda recibe un rechazo claro y no escribe.", gravedadTipica: 2 },
    { nombre: "SUNAT o Lucode caídos al cobrar", aplica: ["comprobante"], nucleo: true, escribe: true, capa: "ambas", mira: ["INV-02", "INV-03", "INV-06", "INV-07"], como: "Simula que Lucode no responde (en local, el comprobante falla al transmitir) y cobra una venta.", esperado: "La venta SE GUARDA y se cobra; el comprobante queda `pendiente_reintento` y la pantalla lo dice. No se pierde la venta ni se pide cobrar de nuevo (principio 9).", gravedadTipica: 1 },
    { nombre: "El padrón DNI/RUC no responde", aplica: ["documento"], como: "Bloquea la consulta del padrón (SUNAT público y apis.net.pe) y escribe un DNI.", esperado: "Se puede seguir escribiendo a mano; la pantalla dice que no pudo consultar. No bloquea la venta.", gravedadTipica: 3 },
    { nombre: "Una lectura que falla (500)", aplica: ["lista"], como: "Haz que la primera petición de lectura de la pantalla devuelva 500 (interceptando `fetch`).", esperado: "Un estado de error con «Reintentar», no una pantalla en blanco. Los datos buenos no se borran.", gravedadTipica: 3 },
    { nombre: "El reloj del equipo mal puesto", aplica: ["dinero"], como: "Cambia la fecha de la página (`Date` simulada: ayer y mañana) y abre o cierra la caja.", esperado: "La fecha la manda el servidor. El cierre y los reportes no se corren de día.", gravedadTipica: 2 },
    { nombre: "Almacenamiento bloqueado", aplica: [], como: "Haz que `localStorage` lance una excepción (modo privado) antes de cargar la pantalla.", esperado: "La pantalla funciona igual. El tema y los borradores son comodidad, no requisito (ADR-0336).", gravedadTipica: 3 },
  ]),

  ...familia("celular", [
    { nombre: "Los ataques de entradas y de doble clic a 375 px", aplica: ["celular", "guarda"], nucleo: true, escribe: true, mira: ["INV-01", "INV-02", "INV-03", "INV-12"], como: "`resize_window` con el preset `mobile` y repite ENT-01, ENT-03, ENT-06, ENT-07 y DC-01 en Vender, Cambios y Devoluciones.", esperado: "Mismo resultado que en escritorio. El aviso de error cabe en 375 px y no queda tapado por el teclado.", gravedadTipica: 2 },
    { nombre: "Teclado virtual tapa el campo", aplica: ["celular", "texto"], como: "A 375 px, enfoca un campo de la mitad inferior y mira dónde queda respecto del teclado (`visualViewport` reducido).", esperado: "El campo con foco y el botón principal quedan a la vista.", gravedadTipica: 3 },
    { nombre: "Rotar con el modal abierto", aplica: ["celular", "modal"], como: "Con un modal abierto y datos escritos, cambia 375×812 a 812×375 y de vuelta.", esperado: "No se corta, no pierde lo escrito, el botón principal sigue alcanzable.", gravedadTipica: 3 },
    { nombre: "Toque doble accidental", aplica: ["celular", "guarda"], escribe: true, mira: ["INV-11", "INV-12", "INV-02"], como: "Dos toques con 80 ms de diferencia sobre Cobrar / Guardar con el emulador táctil.", esperado: "Una sola operación, igual que en DC-01: una fila, un movimiento, un comprobante.", gravedadTipica: 1 },
    { nombre: "Botones peligrosos juntos", aplica: ["celular"], como: "Mide la distancia y el tamaño de los botones que escriben junto a los que cancelan o borran (Cobrar/Cancelar, Anular/Cerrar).", esperado: "Al menos 44 px de alto y 8 px de separación (ADR-0350). Un dedo grande no acierta el equivocado.", gravedadTipica: 3 },
    { nombre: "Deslizar sobre una lista flotante", aplica: ["celular", "combo"], como: "Abre un combo con más de 8 opciones y desliza el dedo dentro de la lista.", esperado: "La lista se desplaza; no elige ni cierra por accidente.", gravedadTipica: 3 },
  ]),

  ...familia("teclado", [
    { nombre: "Tab no escapa del modal", aplica: ["modal"], nucleo: true, como: "Abre un modal y pulsa Tab 30 veces, luego Shift+Tab 30 veces.", esperado: "El foco recorre los controles en orden visual y NUNCA cae al fondo de la página.", gravedadTipica: 3 },
    { nombre: "Escape dentro de un combo", aplica: ["modal", "combo"], como: "Abre un combo dentro de un modal con texto escrito: Escape una vez, Escape otra vez.", esperado: "El primero cierra la lista, el segundo la hoja (ADR-0136, `useEscapeLibre`). Nunca cierra la hoja de golpe con la lista abierta.", gravedadTipica: 3 },
    { nombre: "Enter en un buscador o un combo", aplica: ["combo", "guarda"], escribe: true, mira: ["INV-12"], como: "Escribe en el campo de búsqueda de un combo y pulsa Enter.", esperado: "Elige la opción resaltada; no envía el formulario principal.", gravedadTipica: 2 },
    { nombre: "Flechas con un modal encima de la vista rápida", aplica: ["modal", "lista"], como: "Abre la vista rápida de un producto, abre un modal encima y pulsa ↑ ↓.", esperado: "La flecha no cambia de registro por debajo (ADR-0128, `useFlechasDelCajon`).", gravedadTipica: 3 },
    { nombre: "Atajos mientras se escribe", aplica: ["texto"], como: "Dentro de un campo pulsa Cmd+Z, Cmd+A, Cmd+Enter, Cmd+S y F5.", esperado: "Hacen lo que hacen en cualquier campo. Ninguno dispara un guardado ni una navegación.", escribe: true, mira: ["INV-12"], gravedadTipica: 2 },
    { nombre: "El foco vuelve a donde estaba", aplica: ["modal"], como: "Abre un modal desde un botón con el teclado, ciérralo con Escape.", esperado: "El foco vuelve al botón que lo abrió, no al principio de la página.", gravedadTipica: 4 },
    { nombre: "Escribir muy rápido", aplica: ["busqueda-url"], como: "Escribe 200 caracteres sin pausa en un buscador que filtra por URL (`type` sin espera).", esperado: "No pierde letras ni se traba; el loader no aparece por tipear (ADR-0149, `useBusquedaEnUrl`).", gravedadTipica: 3 },
    { nombre: "Autocompletado del navegador", aplica: ["texto"], como: "Deja que el navegador o un gestor de contraseñas rellene los campos del formulario.", esperado: "No se guarda una contraseña o un correo en un campo de nombre. Los campos de tienda llevan `autocomplete` explícito.", escribe: true, gravedadTipica: 3 },
  ]),
];

// ── Plan: lo que le toca a UNA pantalla ─────────────────────────────────────────────────────────────────────────────────────

/** PRNG pequeño y estable (mulberry32): la misma semilla da siempre la misma secuencia, en cualquier máquina. */
export function prng(semilla) {
  let a = Number(semilla) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un ataque aplica si la pantalla tiene TODOS los ingredientes que pide (vacío = todas). */
export const aplica = (ataque, ingredientes) => ataque.aplica.every((i) => ingredientes.includes(i));

/** Tipos de valores hostiles que le tocan a una pantalla según sus ingredientes. */
export const tiposDeValor = (ingredientes) => Object.keys(VALORES_HOSTILES).filter((t) => ingredientes.includes(t));

/** Sortea `cuantos` valores de un tipo, sin repetir, con la semilla. */
export function sortearValores(tipo, rng, cuantos = 4) {
  const lista = VALORES_HOSTILES[tipo].slice();
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista.slice(0, Math.min(cuantos, lista.length));
}

/**
 * El plan de UNA pantalla: el núcleo fijo (siempre) más `azar` ataques sorteados con la semilla. Devuelve también los valores
 * hostiles ya sorteados para cada tipo de campo que la pantalla tiene, para que dos corridas con la misma semilla sean idénticas.
 */
export function plan({ ingredientes, semilla = 1, azar = 8, familias } = {}) {
  const ing = ingredientes ?? [];
  const desconocidos = ing.filter((i) => !INGREDIENTES.includes(i));
  if (desconocidos.length) throw new Error(`Ingredientes desconocidos: ${desconocidos.join(", ")}. Válidos: ${INGREDIENTES.join(", ")}`);
  const permitidas = familias?.length ? familias : Object.keys(FAMILIAS);
  const malas = permitidas.filter((f) => !(f in FAMILIAS));
  if (malas.length) throw new Error(`Familias desconocidas: ${malas.join(", ")}. Válidas: ${Object.keys(FAMILIAS).join(", ")}`);
  const candidatos = ATAQUES.filter((a) => permitidas.includes(a.familia) && aplica(a, ing));
  const rng = prng(semilla);
  const nucleo = candidatos.filter((a) => a.nucleo);
  const resto = candidatos.filter((a) => !a.nucleo);
  // Fisher-Yates con la semilla: el orden depende solo de la semilla y del catálogo.
  const mezclados = resto.slice();
  for (let i = mezclados.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
  }
  const sorteados = mezclados.slice(0, azar);
  const valores = Object.fromEntries(tiposDeValor(ing).map((t) => [t, sortearValores(t, rng)]));
  return { semilla: Number(semilla), ingredientes: ing, nucleo, azar: sorteados, valores, noEntran: resto.length - sorteados.length };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const pie = (a) => `${a.escribe ? "escribe" : "lee"} · ${a.capa} · g${a.gravedadTipica}${a.mira.length ? ` · mira ${a.mira.join(",")}` : ""}`;

function main(argv) {
  const valor = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const lista = (n) => valor(n)?.split(",").map((s) => s.trim()).filter(Boolean);
  const json = argv.includes("--json");

  if (argv[0] === "valores") {
    const tipo = valor("--tipo");
    const que = tipo ? { [tipo]: VALORES_HOSTILES[tipo] } : VALORES_HOSTILES;
    if (tipo && !VALORES_HOSTILES[tipo]) return console.error(`Tipo desconocido. Válidos: ${Object.keys(VALORES_HOSTILES).join(", ")}`), 2;
    if (json) return console.log(JSON.stringify(que, null, 2)), 0;
    for (const [t, vs] of Object.entries(que)) {
      console.log(`\n${t} (${vs.length})`);
      for (const v of vs) console.log(`  · ${v.etiqueta}: ${JSON.stringify(v.valor.length > 60 ? `${v.valor.slice(0, 40)}… (${v.valor.length} caracteres)` : v.valor)}`);
    }
    return 0;
  }

  if (argv[0] === "plan") {
    let p;
    try {
      p = plan({ ingredientes: lista("--aplica"), semilla: valor("--semilla") ?? 1, azar: Number(valor("--azar") ?? 8), familias: lista("--familias") });
    } catch (e) {
      return console.error(e.message), 2;
    }
    if (json) return console.log(JSON.stringify(p, null, 2)), 0;
    console.log(`Plan de caos · semilla ${p.semilla} · ingredientes: ${p.ingredientes.join(", ") || "(ninguno)"}`);
    console.log(`\nNÚCLEO (siempre corre): ${p.nucleo.length}`);
    for (const a of p.nucleo) console.log(`  ${a.id}  ${a.nombre}  [${pie(a)}]`);
    console.log(`\nAZAR (semilla ${p.semilla}): ${p.azar.length}${p.noEntran > 0 ? ` de ${p.azar.length + p.noEntran} posibles` : ""}`);
    for (const a of p.azar) console.log(`  ${a.id}  ${a.nombre}  [${pie(a)}]`);
    for (const [t, vs] of Object.entries(p.valores)) console.log(`\nValores «${t}» sorteados: ${vs.map((v) => v.etiqueta).join(" · ")}`);
    console.log(`\nPara repetir exactamente esta corrida: --semilla ${p.semilla}`);
    return 0;
  }

  let sel = ATAQUES;
  if (valor("--familia")) sel = sel.filter((a) => a.familia === valor("--familia"));
  if (valor("--capa")) sel = sel.filter((a) => a.capa === valor("--capa"));
  if (json) return console.log(JSON.stringify(sel, null, 2)), 0;
  for (const [clave, f] of Object.entries(FAMILIAS)) {
    const deEsta = sel.filter((a) => a.familia === clave);
    if (!deEsta.length) continue;
    console.log(`\n${f.nombre} (${deEsta.length}) — ${f.que}`);
    for (const a of deEsta) console.log(`  ${a.nucleo ? "★" : " "} ${a.id}  ${a.nombre}  [${pie(a)}]`);
  }
  console.log(`\n${sel.length} ataques · ★ = núcleo (siempre corre) · ${sel.filter((a) => a.escribe).length} escriben (piden foto de estado e invariantes)`);
  return 0;
}

export { CAPAS };
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));

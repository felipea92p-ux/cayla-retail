# Tienda CAYLA · Rediseño Premium — maqueta navegable y comparador (2026-11-07)

**Qué es:** una maqueta de alta fidelidad de toda la tienda online, aislada, para mirarla y compararla con la tienda real antes de
aprobar nada. **No toca `apps/tienda`, ni la base, ni producción.** Nada de lo que se hace en la maqueta sale del navegador.

## Cómo verla

```bash
python3 -m http.server 3033 --bind 127.0.0.1 --directory docs/maquetas/tienda-premium-2026-11
```

- **Panel de revisión (comparador):** <http://127.0.0.1:3033/> — elige pantalla, versión (Actual · Premium · Lado a lado) y dispositivo (1440 · 1280 · 768 · 390 · 360). Lo de la derecha es la revisión: problemas, mejoras, notas y estado de cada pantalla.
- **La maqueta sola, como la vería la clienta:** <http://127.0.0.1:3033/premium/index.html>

El panel guarda tu revisión (estado por pantalla y notas con puntos señalados) **solo en tu navegador**. «Descargar todas» baja las notas en Markdown.

## Qué es real y qué no

| Real (leído de cayla.pe el 2026-11-07, solo lectura) | Simulado y marcado en pantalla |
|---|---|
| 412 prendas con nombre, precio, precio anterior, colores, tallas (y cuáles están agotadas) y disponibilidad en Trujillo, Arequipa y Lima | Sesión, bolsa, favoritos y pedidos (viven en `sessionStorage`) |
| Fotos del catálogo (recorte liviano de la tienda o la original) | Contraseña de prueba `cayla2026` y código `246810` |
| Campañas vigentes (nombre, % y fecha), tal como las anuncia la portada | WhatsApp, Google y «Cómo llegar»: abren una hoja que muestra qué pasaría, no salen |
| Plazos: 24 h confirmar · 48 h pagar · 7 días recoger · 15 días cambiar | Saldo de puntos del Club (340) |
| Reglas del Club de los Términos (1 punto por S/ 1, 100 = S/ 5, canje desde 200) | «Simular siguiente estado» de un pedido |
| Tiendas: dirección, horario, WhatsApp; abierta/cerrada con la hora de Lima | Fotos de las tiendas: **no hay**; se dice «pendiente» en vez de inventarlas |
| Textos legales vigentes (Privacidad, Términos) | Guía de tallas y materiales: **no existen** en el ERP; se dice así |
| Fotos del banner «Arma tu outfit» (las de producción, `apps/tienda/public/escenario`) | Página de preguntas frecuentes y ficha por tienda: **propuestas** nuevas |

Los outfits listos son los del 2026-11-05 (de la maqueta anterior, también de producción).

## Pantallas (33 en el panel; 23 con captura auténtica de cayla.pe)

**Inicio** · **Catálogo:** toda la tienda, categoría, lo nuevo, más vendidos, sin resultados, búsqueda, ficha de prenda, ofertas ·
**Outfits:** outfits listos, ficha de outfit, Arma tu outfit, favoritos · **Bolsa y separación:** bolsa vacía, bolsa con prendas,
completar datos, pedido separado (con sus 5 estados) · **Cuenta y Club:** entrar, crear cuenta con código, recuperar contraseña,
contraseña nueva, Mi perfil, Club (sin cuenta / con cuenta / miembro) · **Tiendas y ayuda:** tiendas, ficha de tienda, cómo separar,
cambios, preguntas frecuentes, términos, privacidad, 404, error, carga.

Atajos para revisar estados: `?demo=llena` (bolsa con prendas), `?demo=sesion` (sesión iniciada), `/separado/demo` (pedido).

## Interacciones que funcionan

Menú grande de Ropa y Accesorios · menú del celular · elegir tienda (precios y stock cambian) · buscar · filtrar por categoría, talla,
color y «solo lo que hay en mi tienda» · quitar filtros · ordenar · ver más · favoritos (piden cuenta) · agregar rápido · ficha: color,
talla obligatoria con su error, stock de las tres tiendas, avísame, acordeones, guía de tallas · outfits: agregar el outfit eligiendo
tallas · Arma tu outfit: zonas, elegir, flechas, candado, quitar, Sorpréndeme (con el mensaje real si todo está fijado), total y agregar ·
bolsa: cantidades (máx. 2 por prenda, 20 por pedido), quitar con deshacer, cambiar de tienda, separar → entrar → completar datos →
pedido con cuenta atrás, WhatsApp simulado y estados · entrar (errores reales, mostrar contraseña, Google simulado) · crear cuenta
(código de 6 números que avanza solo y acepta pegar) · recuperar y crear contraseña · Mi perfil · Club en sus tres estados y canje ·
Escape cierra capas · el foco vuelve a donde estaba.

## Sistema visual (un solo archivo: `premium/sistema.css`)

- **Color:** los tokens de `apps/tienda/app/estilos/diseno-nuevo.css`, sin uno nuevo. Lo que cambia es la jerarquía: **rojo del logo** solo
  en acciones y logo · **rojo hondo** en el bloque editorial · **vino** (`#7f1d16`, ya existía) para el Club y la etiqueta de descuento ·
  **rojo de letra** `#a8281f` para lo que se escribe en rojo · marfil, arena, rosa y cacao para superficies y texto.
- **Letra:** Playfair Display (títulos, cifras grandes) + Public Sans (todo lo demás). Escala: portada 40–72, página 32–50, sección 28–40, bloque 20–24, cuerpo 15, chico 13,5, versalitas 11,5.
- **Espacio:** múltiplos de 4 (4…88); sección 56–96 px; margen 16–48 px; contenido máximo 1320 px; lectura 680 px.
- **Forma:** radios 6/12/20/999; controles de 48 px (40 los chicos), toque de 44 px; fotos 3:4 sobre la placa rosa, siempre con el mismo aire.
- **Movimiento:** solo entradas de 200–300 ms, sin rebote ni bucle; todo se apaga con `prefers-reduced-motion`. Sin vidrio, sin degradados de adorno, sin sombras sobre superficies pegadas al fondo (solo lo que flota).

**Piezas:** franja de anuncio · cabecera con menú grande · cajón · hoja (modal; en el celular sube desde abajo) · aviso flotante ·
migas · encabezado de página · portada · barra de beneficios · carril · tarjeta de categoría · rejilla · tarjeta de prenda · bloque
editorial · tarjeta de outfit · tarjeta de campaña · bloque del Club · tarjeta de membresía · tarjeta de tienda · pasos · filtros
(columna, cajón, píldoras puestas, opciones) · selector · vacío · esqueleto · avisos (info, error, éxito, atención) · etiqueta «Demostración» ·
galería · selector de color · tallas · stock por tienda · acordeón · garantías · lienzo y ranuras del armador · pestañas · resumen ·
línea de bolsa · cantidad · caja de resumen · opción de tienda · campo · contraseña con ojo · código de 6 · separador · índice legal ·
preguntas · página de error · pie.

## Decisiones de diseño

1. **La portada no se rediseña:** se conserva el arco, los podios y las prendas reales; solo se ordena el texto y se suman dos acciones.
2. **Un nombre por destino:** «Outfits listos» (lo armado por CAYLA) y «Arma tu outfit» (la herramienta). Hoy hay cuatro nombres.
3. **Una etiqueta por tarjeta:** descuento > nuevo > más vendido. En «Lo nuevo» no se repite «Nuevo».
4. **La disponibilidad es un punto y una frase,** con los mismos textos de la tienda («Disponible», «Quedan 3», «Última», «Hay en Lima»).
5. **Ofertas como campañas,** con su % y su fecha, no como liquidación; sin condiciones inventadas.
6. **El rojo vuelve a ser señal:** el Club pasa a vino; el rojo pleno queda para «Agregar», «Separar», «Entrar».
7. **Login:** una tarjeta en dos columnas (formulario protagonista, Club en vino con la tarjeta); en el celular el formulario va primero.
8. **Bolsa:** «Pagas hoy: S/ 0.00» y los cuatro plazos al lado del botón; quitar se deshace en vez de preguntar.
9. **Arma tu outfit se hace tocando:** zona → prenda; flechas, candado, quitar y Sorpréndeme. No depende de arrastrar.
10. **«Recomendaciones» deja de flotar:** pasa al pie («Envíanos una sugerencia») y a Mi perfil.

**Lo que decide Felipe (marcado «Decide Felipe» en el panel):** cambiar de tienda sin vaciar la bolsa; guía de tallas y materiales
(cargar datos en el ERP); fotos de las tiendas; la unificación de textos que se contradicen (`AUDITORIA.md`, sección 4).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `panel.css`, `panel.js` | Panel de revisión (herramienta interna, gris a propósito) |
| `pantallas.js` | Registro de pantallas: ruta, captura y auditoría de cada una |
| `premium/index.html`, `premium/app.js` | La maqueta Premium (una app con rutas en el `#`) |
| `premium/sistema.css` | El sistema visual, único |
| `premium/datos.js` | Datos reales leídos de cayla.pe (generado) |
| `premium/recursos/` | Fotos del banner «Arma tu outfit» y escudos de las ciudades, copiados de `apps/tienda/public` |
| `actual/` | Capturas auténticas de cayla.pe a 5 anchos + `capturas.json` (se generan, no se versionan) |
| `premium-capturas/`, `comparativas/` | Capturas de la maqueta y láminas Actual \| Premium (se generan, no se versionan) |
| `herramientas/maqueta.mjs`, `herramientas/convertir.cjs` | Rehacen capturas, datos y láminas (ver la cabecera del archivo) |
| `AUDITORIA.md` | Auditoría: lo que hay, inconsistencias, problemas, textos que se contradicen y qué hacer con cada componente |

**Las capturas no se versionan** (`.gitignore`; ~50 MB entre las tres carpetas). Para el modo «Actual» del panel hay que crearlas una vez:

```bash
node docs/maquetas/tienda-premium-2026-11/herramientas/maqueta.mjs actual
```

Y para las láminas, con el servidor en marcha: `maqueta.mjs premium` y luego `maqueta.mjs comparar`.

## Validación (2026-11-07)

- **Recorridos:** `node docs/maquetas/tienda-premium-2026-11/herramientas/recorridos.mjs` — 18 recorridos a 1440 y a 390 px (36 en total): tienda, menú, filtros, orden, búsqueda vacía, talla obligatoria, favoritos sin cuenta, Arma tu outfit, bolsa con deshacer, entrar con error y con éxito, separar con datos y pedido, crear cuenta con código, recuperar contraseña, Club, 404, desborde y tamaño táctil. **36/36 bien.**
- **Responsive:** las 33 pantallas se capturan a 1440, 1280, 768, 390 y 360 px sin desborde horizontal (`maqueta.mjs premium` avisa si lo hay).
- **Contraste (WCAG 2.2 AA):** texto principal 14,3:1 · secundario 6,0:1 (5,2 sobre rosa) · terciario 5,0:1 · rojo de letra 6,6:1 · blanco sobre el botón rojo 4,9:1 · sobre vino 9,2:1 · borde de campos y opciones 3,5:1 (1.4.11).
- **Teclado y lector:** salto al contenido, foco visible, Escape cierra capas y el foco vuelve, hojas con `aria-modal`, errores con `role="alert"` bajo su campo, grupos de color y talla con `radiogroup`, imágenes decorativas con `alt=""`, `prefers-reduced-motion` apaga el movimiento. Controles táctiles de 44 px en el celular.
- **No revisado aquí:** lector de pantalla real (VoiceOver/TalkBack) ni aparatos físicos; modo oscuro (la maqueta solo propone el claro).

## La tienda real no se tocó

La única carpeta nueva del repositorio es `docs/maquetas/tienda-premium-2026-11/`. No hay cambios en `apps/tienda`, `apps/web`,
`packages`, `supabase` ni en ninguna configuración. A cayla.pe solo se le hicieron peticiones GET (lo demás se abortó, incluido el
`sendBeacon` de visitas y mediciones), sin sesión y sin escribir nada. La consulta directa a la base fue rechazada por permisos y no se insistió.

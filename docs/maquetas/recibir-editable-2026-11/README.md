# Maqueta editable · Recibir mercadería (2026-11-02)

Pedido de Felipe: una maqueta **exacta** a como está hoy el módulo de recibir mercadería, donde cada componente se pueda **mover y
redimensionar**, para empezar a trabajar el flujo desde ahí.

Abrir `index.html` (o con la config `maquetas` de `.claude/launch.json`: `http://localhost:8791/recibir-editable-2026-11/`). Sin build, sin
dependencias, funciona también con doble clic.

> **Ojo (2026-11-02):** las pantallas Contar y Contar · sobran son de ANTES de contar modelo por modelo (ADR-0604): muestran la placa vieja. Para verlas al día, recapturar (abajo).

## Qué es «exacta»

No es un dibujo: cada pantalla es una **captura del DOM real del ERP** corriendo en local (las mismas clases, los mismos `data-guia`), con el
**CSS compilado real** (`app.css`, el de `apps/web`, tema claro y oscuro) y las **mismas fuentes** (EB Garamond y DM Sans). Por eso las piezas
de Recibir «B» (Trayecto, Acordeón, Dial, totales que ruedan, Podio, Vitrina, sello de lacre; ADR-0575, con el vidrio de ADR-0596) se ven y se
mueven como en la app, y lo de adentro **se adapta solo al ancho de cada tarjeta** (`@container`): al angostar el Contador, el Dial pasa a vertical.

- Código fuente de lo capturado: `claude/mockup-receiving-merchandise-3f444e` en `ec15ad51d` (= `main` del 2026-11-02).
- Capturado a 1440 × 900 con la cuenta de pruebas de Felipe (Admin y Líder, Tienda Lima) y la base **local con datos inventados**.
- Lo que la maqueta **no** hace: no guarda nada, no llama a la base ni a SUNAT, no cuenta de verdad. Los números no se mueven.

## Las 6 pantallas del flujo

| Chip | Ruta del ERP | Qué muestra |
|---|---|---|
| Portada | `/recibir` | Aviso de prendas por terminar, «Envíos por recibir» con buscador, filtros y tabla, «Lo recibido» |
| Sin aviso | `/recibir` (hoja) | «¿Llegó algo que no está en la lista?»: de quién es, guía y quién recibe |
| Contar | `/recibir/envio/…` | Paso 1 de un envío que cuadra (15 de 15): Acordeón, Dial, atajos, ¿Qué son? y la barra de totales |
| Contar · sobran | `/recibir/envio/…` | Lo mismo con diferencia (sobran 5) y el aviso de quién cuenta |
| Cerrar | `/recibir/envio/…` (paso 2) | Tabla de cierre con Podio, Vitrinas de precio, quién cierra y la barra «Cerrar el envío» |
| Cerrado | `/recibir/envio/…` (cerrado) | Sello de lacre, «Para después» y «Reabrir el conteo» |

Los envíos de cada captura son distintos (los que tenía la base local en cada paso), así que el número de envío cambia entre Cerrar y Cerrado.

## Cómo se usa

El panel «Maqueta editable» nace sobre el menú lateral; se arrastra por su cabecera y se pliega con ▾.

- **Editar** (por defecto): **clic** elige una pieza · **arrastra** la mueve · las **manijas** de los 8 bordes cambian su tamaño · **doble clic**
  entra a sus partes (la Cabecera → el Trayecto; el Contador → el Dial) · **Esc** sube un nivel. También se elige en la lista «Piezas de esta pantalla».
- **Imán**: se alinea con los bordes y centros de las demás piezas y del contenedor (líneas rosadas). **Alt** lo apaga mientras arrastras.
- **Teclado**: flechas 1 px (con Mayús, 10) · **Mayús** en una esquina mantiene la proporción · **Supr** oculta la pieza · `[` `]` atrás y al frente ·
  **Ctrl/⌘ Z** deshace, **Ctrl/⌘ Shift Z** rehace.
- **Números**: en «Pieza elegida» se escriben X, Y, ancho y alto exactos (el (0, 0) es la esquina del contenido de la pantalla).
- **Probar**: apaga el editor y los botones recorren el flujo (Seguir recibiendo → Contar → Pasar a cerrar → Cerrar el envío → Cerrado; Sin aviso →
  Empezar a contar). Nada guarda.
- **Modo oscuro**: el del ERP, sobre los mismos tokens.
- **Copiar disposición**: arma un texto con **lo que cambiaste** (de dónde a dónde y el tamaño nuevo de cada pieza) y la lista de todas las piezas con
  su x, y y medidas, más un JSON. Es lo que se pega en el chat para llevar la disposición al código.
- **Restablecer pantalla** vuelve todo a como está hoy en el ERP. Lo editado se guarda en este navegador (por pantalla) y sobrevive a recargar.

## Cómo funciona (para quien lo toque)

- `editor.js` no toca la captura: cuando una pieza se mueve por primera vez, la «suelta» de la página. Deja en su lugar un **hueco invisible** del
  mismo tamaño (así lo demás no se corre) y la pasa a `position:absolute` con `left/top/width/height`. Lo que se guarda es lo movido respecto al sitio
  de hoy (`dx`, `dy`) y el tamaño nuevo.
- `piezas.js` declara, por pantalla, qué es una pieza (selector CSS sobre la captura, con el nombre que tiene en el ERP) y qué hace cada toque en
  «Probar». Una pieza dentro de otra queda anidada sola. Para sumar una pieza basta una línea ahí; no hay que recapturar.
- La interfaz del editor vive en un shadow DOM para no mezclarse con el CSS del ERP.

### Límites conocidos

- Las barras pegadas a la ventana («Anterior · totales · Pasar a cerrar» y «Cerrar el envío») pasan a `fixed`: se quedan pegadas donde las pongas.
- Las medidas se editan sobre el ancho de ventana en que se editó; al cambiar mucho el ancho, lo que no tocaste se reacomoda y lo que sí tocaste queda fijo.
- Al achicar una pieza más que su contenido, lo de adentro se sale (no se recorta): así se ve qué pasaría con una caja más chica.
- La captura es de un momento: si Recibir cambia, hay que ponerla al día (abajo).

## Cómo se pone al día

Con el ERP local corriendo (`pnpm --filter web dev`, un envío «Contando» listo para cerrar y otro ya cerrado en la base local):

```bash
node docs/maquetas/recibir-editable-2026-11/herramientas/recibe.mjs   # receptor temporal en 127.0.0.1:8899
```

1. En el navegador, sobre cada pantalla ya cargada y quieta, pegar `herramientas/capturar.js` y correr `await capturar("<estado>")`
   (`portada`, `sin-aviso`, `contar`, `contar-diferencia`, `cerrar`, `cerrado`; ver `piezas.js › estados`). Espera a que Next termine de cargar el
   contenido (si no, avisa y no captura: así quedó una vez la pantalla de carga dentro de la maqueta).
2. Armar las páginas (copia el CSS y las fuentes compilados y genera los `.html`):

```bash
node docs/maquetas/recibir-editable-2026-11/herramientas/armar.mjs <carpeta-de-capturas> <app.css-compilado> <carpeta-media-de-fuentes>
```

Las capturas se escriben donde corra `recibe.mjs` (carpeta `captura/` junto al script); el CSS compilado y las fuentes salen de `.next` (o de
`/_next/static/` del servidor de desarrollo). Las capturas en bruto no se versionan: las páginas `.html` ya las llevan.

## Qué sigue

Esta maqueta es el punto de partida del trabajo del flujo de recibir. Cuando Felipe deje una disposición, **Copiar disposición** da el texto para
pegarlo en el chat; de ahí sale el cambio real (cada pieza que se mueva en la maqueta es un componente de `apps/web/components/recepcion-conteo/` o
`recepcion-envio/`, ya nombrado con el mismo nombre del ERP).

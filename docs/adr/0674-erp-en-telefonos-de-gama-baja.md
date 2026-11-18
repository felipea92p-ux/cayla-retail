# ADR-0674 — El ERP en teléfonos de gama baja (Fase 1): medir el equipo, modo liviano, aviso de navegador viejo y menos peso común

- **Fecha:** 2026-11-17 · **Estado:** construido en la rama `claude/confident-gauss-v6tzn7` (cinco actividades de `/construir`, una por
  commit). Sin migraciones ni base: entra al fusionar y publicar la web. **Número sin reserva:** el remoto rechazó la etiqueta
  `reserva/adr-0674` desde la sesión en la nube (HTTP 403); el 0673 que se intentó primero lo reservó otra rama
  (`claude/anular-comprobante-permisos`) mientras tanto. Hay que reservar 0674 con `pnpm reservar adr` antes de abrir el PR.
- **Pidió:** Felipe, 2026-11-17: «qué se podría realizar para que el sistema retail sea funcional para teléfonos gama baja»; en el celular
  se usan **Catálogo, Compras, Inventario y Ventas (todo Ventas)**. Eligió «automático + botón» para el modo liviano y «Fase 1 primero».
- **Sigue a:** ADR-0654 (cronómetro del clic), ADR-0611 mejora 7 (el vidrio que aguanta), ADR-0623 (lo que se desplaza no se desenfoca),
  ADR-0625 (animaciones apagadas de fábrica), ADR-0479 (la hoja del celular), ADR-0670 (estación de impresión).

## Lo que se midió antes de decidir

Compilación de producción local de `main` (`73d68294`) y el ERP local con Supabase:

- **CSS:** un solo archivo de 1,7 MB (265 KB comprimido; 21 500 reglas, 240 desenfoques, 490 animaciones) en TODA pantalla.
- **JavaScript al abrir:** de 1,5 a 2,4 MB según la pantalla de los cuatro módulos; el marco (los dos layouts y la cabecera) eran 936 KB
  (303 comprimidos) en todas. Solo 11 cargas bajo demanda para ~1 000 componentes de cliente.
- **Nadie lo había probado en un teléfono barato:** ADR-0479 lo dice («no mide la tarjeta gráfica de un teléfono barato»).

## Las decisiones

### 1. La clase del equipo en el cronómetro del clic

Cada medición de ADR-0654 lleva memoria (`navigator.deviceMemory`, potencia de dos: hasta 8 GB antes, 16 o más en Chrome nuevo), núcleos
(tope 16), tipo de red, ahorro de datos y si la pantalla es táctil (`(pointer: coarse)`). Columnas planas en el registro (`ram`, `nucleos`,
`red`, `ahorro_datos`, `tactil`). Nada que identifique a la persona (ADR-0424). Lo puro: `lib/clase-de-equipo.ts`.

### 2. El modo liviano (`data-liviano` en `<html>`)

La cara maciza del vidrio, sin desenfoque y sin las nubes del fondo. **No se diseñó nada:** es «el vidrio que aguanta» (ADR-0611), cuyas
63 variables se repiten en `app/estilos/liviano.css` porque una media query no se suma a un atributo; `lib/liviano.test.ts` falla si una
receta maciza cambia o nace sin estar ahí con el mismo valor. Vive fuera de `vidrio/`: es una preferencia del aparato de Retail, no una
receta del contrato de familia.

**Cuándo se enciende solo** (solo con lo que Chrome dice de la memoria): 2 GB o menos; o 4 GB o menos con pantalla táctil; o ahorro de
datos. Un botón lo cambia a mano y desde ahí manda lo elegido (`localStorage["cayla-liviano"]`). El script del `<head>` lo decide antes de
pintar (`SCRIPT_LIVIANO_ANTES_DE_PINTAR`, ejecutado en la prueba contra una tabla de equipos).

```
DECIDÍ:     2 GB, o 4 GB con pantalla táctil, o ahorro de datos.
DESCARTÉ:   «2 GB o menos, o 4 núcleos o menos», la regla que Felipe aprobó en la pregunta. Al probarla: Safari en el iPhone reporta 2 núcleos
            a propósito (WebKit, NavigatorBase.cpp, contra la huella digital), así que todo iPhone caía en liviano; el teléfono barato de 2026
            (Galaxy A05, Redmi A3) tiene 3–4 GB y 8 núcleos y NO caía; y «4 núcleos» sí atrapaba computadores de escritorio viejos, que no
            eran el pedido. Es una constante (`RAM_LENTA_TACTIL`): se mueve con los datos del punto 1.
DESCARTÉ:   el botón en la cabecera del celular. Medido: le quitaba 45 px a la sede (de 122 a 77 a 375 px; a 320 px la dejaba en 22). En el
            celular va al pie del menú, antes de «Salir»; en escritorio, junto a «Animaciones».
SE ROMPE SI: una receta de vidrio translúcida nueva no se copia a `liviano.css` (la prueba lo frena), o un componente desenfoca con un
            `filter: blur()` en vez de `backdrop-filter` (ese no lo apaga la regla).
```

La profundidad de la hoja del celular (ADR-0479) no se toca: ya corre solo con las animaciones encendidas.

### 3. «Actualiza el navegador»

Si el navegador no entiende `color-mix()` (Chrome 111, Safari 16.2, Firefox 113), el script del `<head>` marca `<html>` con
`data-navegador-viejo` («android» o «si») y un aviso que el servidor ya dibujó escondido arriba del `<body>` (`AvisoNavegadorViejo`) se
muestra con CSS simple fuera de toda capa (`app/estilos/navegador-viejo.css`, colores con respaldo). En Android suma «Actualizar Chrome»
a la Play Store. No bloquea nada.

```
DESCARTÉ:   insertar el aviso desde el script: React lo borraba al hidratar el <body> («Hydration failed», visto en local).
DESCARTÉ:   `<Aviso>` del sistema: es de cliente y anima su ícono; en ese navegador React puede no correr (Next 16 arma para Chrome 111) y
            Tailwind 4 pone sus reglas en `@layer`, que antes de Chrome 99 se ignora entero.
```

### 4. CSS por pantalla

El CSS que solo usan pantallas de otros módulos se importa desde los componentes que usan sus clases, no desde `globals.css`. Medido en
Productos con el procesador frenado 4 veces: de 6 866 a 6 208 reglas y el recálculo de estilos de ~270 a ~217 ms (mediana de 3).

Se movieron 19 archivos (Observatorio, Inicio de almacén, pestañas de Análisis, rótulos, etiquetas de precio, cartel del club, acompañante,
recorrido de Finanzas, efectos de campaña, órdenes, clientes y colaboradores con vidrio). Los que van juntos y en orden tienen una entrada
en `app/estilos/por-pantalla/`. `lib/css-por-pantalla.test.ts` vigila que todo archivo que usa sus clases las importe (correcto por
construcción), que no vuelvan a `globals.css` y que ningún CSS global las pise.

```
DESCARTÉ:   mover 520 KB como se estimó al principio. Con el análisis fino (clases con guion, dentro de textos, siguiendo los import fijos y
            separando los diferidos), lo que solo usan otros módulos son 24 archivos y ~200 KB; de esos, 5 los pisa un CSS global que va
            después (tienda-web, tienda-web-conf, trafico, estados-financieros, vitrinas-sedes) y se quedan: cargados aparte, el orden se
            invertiría. Los otros 65 archivos (~744 KB) los alcanza el marco y moverlos es trabajo componente por componente.
SE ROMPE SI: un componente nuevo usa una clase de esos CSS sin importarlo (la prueba lo frena), o arma la clase por partes (`o-${x}`): la
            prueba no lo ve.
```

### 5. Un marco más liviano

El marco pasa de 936 KB (303 comprimidos) a 626 KB (200), y el JavaScript total de las pantallas de los cuatro módulos baja de 3 a 20 %
(9 % en promedio; Conteo –19 %, Historial de compras –20 %, Vender –7 %, Recibir –3 %):

- **Causa raíz:** el buscador de la cabecera (`BuscadorGlobal`, en toda pantalla) importaba `armarEquipo` y `textoEstado` de
  `lib/inicio-avisos.ts`, y con ellas las reglas de recepción, conteo, compras, pérdidas y comprobantes. Viven ahora en
  `lib/equipo-de-turno.ts`; `inicio-avisos.ts` las reexporta.
- **La estación de impresión** (ADR-0670) solo trabaja en la ventana «CAYLA Caja»: `EstacionDeImpresion` es una puerta con la misma
  pregunta (`estacionActiva`) y la estación de verdad (`EstacionActiva`) se descarga cuando está encendida.
- **El panel de Actividad** (`PanelActividad`) se descarga al acercar el mouse o el foco al botón, como «Mi perfil».

## Qué se verificó y qué no

- **Verificado (local, Supabase local con todas las migraciones, Chromium):** el modo liviano en teléfono de 2 GB y de 4 GB táctil (0
  elementos desenfocados, sin nubes), apagado en el computador de 16 GB y en el teléfono de 8 GB; el botón lo apaga y se recuerda al
  recargar; en el celular está al pie del menú y la sede conserva su ancho a 375 y 320 px. El aviso de navegador viejo forzando `CSS.supports`:
  sale arriba, con el enlace de 44 px, sin error de hidratación y el login funciona; en un Chrome al día no sale. CSS por pantalla: 12
  pantallas en claro y oscuro comparadas píxel a píxel contra su captura de antes; las únicas diferencias fueron la hora y la oferta de la
  guía (sale una vez). El buscador (Ctrl K) abre con el equipo de turno y Actividad abre su panel. `vitest` completo (939 archivos), `tsc`,
  `eslint` y `knip` en verde (salvo `apps/tienda`, sin dependencias instaladas en la sesión).
- **NO verificado:** la ganancia real del modo liviano. El emulador frena el procesador pero no la gráfica: desplazando y abriendo una hoja
  no hubo diferencia medible. Se mide en un teléfono real y con el punto 1. Tampoco se vieron el Inicio de almacén, el acompañante ni la vista
  previa de campañas (quedan cubiertos solo por la prueba del CSS), ni la estación de impresión encendida.

## Actualización 2026-11-17 — Fase 2 (6a y 6b): lo que se está anotando no se pierde si Android cierra la pestaña

**El problema.** En un teléfono de 2–4 GB, saltar a la cámara, a WhatsApp o a Yape hace que Android descarte la pestaña de Chrome; al volver
la recarga. El ticket que se armaba en Vender y la compra que se anotaba en «Compré ropa» vivían solo en la pantalla y se perdían. La guardia
de «salir sin guardar» no alcanza: nadie salió.

**La regla común.** Mientras se anota, una FOTO en la memoria de ESA pestaña (`sessionStorage`, `lib/almacen-local.ts` con `"pestana"`):
sobrevive a la recarga y al descarte, y no la ven otras pestañas ni otra cuenta. Nada se restaura en silencio: siempre hay un aviso.

### 6a · El ticket de Vender (`lib/ticket-en-curso.ts`, `components/PuntoDeVenta.tsx`)

- DECIDÍ: la foto vuelve como un ticket más de «En espera», con id nuevo, y se retoma con `retomar()` (precios y campañas al día). Desde que
  sale un cobro la foto se borra y no se vuelve a guardar hasta que el cobro se resuelve.
- DESCARTÉ: restaurar el ticket directo en pantalla, porque llegaría con los precios y las campañas de cuando se cerró la pestaña, y porque
  un ticket que ya se cobró podría volver y cobrarse dos veces.
- SE ROMPE SI: dos pestañas de Vender de la misma sede se recuperan en el mismo instante (las dos leen «En espera» vacía y la segunda pisa a
  la primera). Android restaura una pestaña a la vez, al mirarla; probado con dos pestañas recargadas una tras otra: cada ticket volvió una vez.

### 6b · La compra de «Compré ropa» (`lib/compra-en-curso.ts`, `components/mi-plata/RegistrarCompra.tsx`)

- DECIDÍ: la foto conserva el IDENTIFICADOR de la compra y la compra se rearma donde iba (en «revisar», o en el papel si estaba ahí). No lleva
  el candado de Vender porque la base no repite una compra con el mismo identificador (20261023005000). Una llave por cuenta
  (`cayla:mis-compras:<persona>:en-curso`; una terminal, por su sede).
- DESCARTÉ: darle un identificador nuevo al recuperarla (como el ticket), porque si la pestaña murió justo al guardar y la compra sí llegó,
  guardarla otra vez la duplicaría y su plata bajaría dos veces.
- SE ROMPE SI: la compra ya estaba guardada y se recupera igual. Dos redes: (1) al abrir, si su identificador ya está entre las compras de
  «Mis compras» (`guardadas`, de `getMiPlata()`), no se recupera y se avisa «ya se guardó» —sin esto la pantalla final restaba su plata dos
  veces, visto al probar—; (2) si la base responde `compra_rapida_otros_datos`, la foto se borra y no se vuelve a guardar: antes, «recarga la
  pantalla» la traía de vuelta con el mismo identificador y el mismo rechazo, sin salida.
- Lo que no vuelve: el archivo de la foto del papel (no cabe en la memoria de la pestaña; el aviso pide tomarla otra vez) y la hoja de una
  prenda a medio escribir. Una prenda cuya tienda o categoría dejó de existir se saca y el aviso dice cuántas.

**Verificado (local, 375 px, Playwright; base restaurada después con `estado.mjs`):** Compré ropa: recargar en «revisar» y en el papel
vuelve con el mismo identificador, el tipo, el monto y el medio; «Empezar de nuevo» limpia; guardar, reponer la foto y recargar → «ya se
guardó», una sola fila en `compra_papeles`; corte de red con la compra ya en la base + un cambio + guardar → «Esta compra ya estaba
guardada», recargar abre limpio; dos compras de prueba, ninguna repetida. Vender: dos pestañas, cada una con su foto; recargadas, cada ticket
entra una vez a «En espera» y otra recarga no lo duplica.
**No verificado:** un teléfono real con la pestaña descartada por Android (aquí se simuló con una recarga); la corrida completa de `/chaos`
(se hicieron a mano las familias «red y sesión» y «navegación torcida» sobre estos dos flujos).

## Actualización 2026-11-17 (b) — Fase 2, actividad 7: partir el código (primer corte)

**Lo que se midió antes de tocar** (cierre de imports fijos de cada pantalla, y el armado de producción): Caja, Apartados y «Compré ropa»
pesaban más que Vender y bajaban al diferir piezas de Vender. La causa no eran sus modales: era UN import. `money` —una función de una
línea— vivía exportada dentro de `components/PuntoDeVenta.tsx`, y `iconoMetodo`, dentro del ticket de Vender. Quien los importaba se llevaba
la pantalla de Vender entera (298 archivos, 2,6 MB de fuente): Caja (por el gasto rápido), Apartados y, por `components/ui/FichasMedio.tsx`,
todo lo que muestra fichas de medio de pago, Mis compras incluida.

### 7.1 · Lo que sirve a varias pantallas no vive dentro de una pantalla

- DECIDÍ: `money` va a `lib/money.ts` y los íconos de los medios a `components/punto-de-venta/iconoMetodo.tsx`; la prueba
  `lib/vender-no-se-arrastra.test.ts` falla si alguien importa un VALOR de la pantalla de Vender o de su ticket (un `import type` no
  arrastra), y si desde Caja, Apartados, Compré ropa o FichasMedio vuelve a haber un camino de imports fijos hasta ella.
- DESCARTÉ: dejar `money` donde estaba y confiar en que el empaquetador descarte lo que no se usa, porque no lo descarta: un archivo
  `"use client"` con efectos entra entero con todo lo que importa (medido: Compré ropa bajó 691 KB al mover dos imports).
- SE ROMPE SI: otra pantalla grande exporta una utilidad que usan las vecinas (el mismo patrón, con otro archivo). La prueba solo vigila
  Vender; el medidor de cierres (backlog, «Cómo medir») es lo que lo encuentra.

### 7.2 · Hojas bajo demanda (`lib/bajo-demanda.ts`, `components/HojaBajoDemanda.tsx`)

- DECIDÍ: en Vender bajan recién cuando hacen falta GSAP (solo con las animaciones encendidas; de paso el ticket deja de animar quieto, que
  incumplía ADR-0625), «Cerrar caja» (al abrirla) y «Prenda sin registrar» (apenas la pantalla queda libre, porque sirve sin conexión, y se
  reintenta al volver la red). Si el internet se cae justo al abrir: aviso «No se pudo abrir …», la hoja se cierra y la próxima vez reintenta.
- DESCARTÉ: `next/dynamic` (lo que decía el plan), porque recuerda el fallo de la descarga y lanza el error al árbol: un corte de red al
  tocar «Cerrar caja» tumbaba la pantalla hasta recargar. Y descarté diferir la hoja de cobro, «Venta registrada» y el cobro en duda: son lo
  que hace falta para cobrar sin conexión (ADR-0092), y una venta no puede depender de una descarga.
- SE ROMPE SI: alguien pasa a `hojaBajoDemanda` una pieza del cobro. La regla está escrita en la cabecera de `HojaBajoDemanda.tsx`; no hay
  prueba que lo impida.

**Medido** (armado de producción local, JavaScript total de la pantalla, crudo y comprimido):

| Pantalla | Antes | Ahora | Cambio |
|---|---|---|---|
| `/compras/mi-plata/compra` | 2 097 KB (681) | 1 406 KB (441) | −33 % |
| `/caja` | 2 241 (726) | 1 650 (520) | −26 % |
| `/vender/apartados` | 2 137 (684) | 1 692 (531) | −21 % |
| `/vender` | 1 938 (627) | 1 751 (561) | −10 % |

Sin cambio: Existencias, Nuevo producto, Recibir, Productos, Cambios y Devoluciones (no pasaban por Vender; les toca su propio corte).

**Verificado (local, Playwright, 375 y 1366 px):** Caja, Apartados y Mis compras abren sin errores; «Registrar gasto» de Caja y la hoja de
cobro de Vender muestran los seis íconos y los montos; «Prenda sin registrar» abre sin pedir nada a la red (ya precargada); «Cerrar caja»
sin red avisa y la pantalla sigue viva, y con red abre; quieto, agregar una prenda no descarga GSAP ni cambia estilos; con «Animaciones»
encendidas baja y el ticket se reacomoda. `vitest` (943 archivos), `tsc`, `eslint`, `knip` y `knip:produccion` en verde.
**No verificado:** el tiempo real de arranque en un teléfono barato (aquí se midió peso, no segundos), ni la caja cerrándose de verdad
desde la hoja diferida (se abrió y se canceló: no se cerró la caja de la base local).

## Actualización 2026-11-17 (c) — actividad 7, segundo corte: Caja

Medido antes de tocar (`scripts/peso/cierres.mjs`, lo que es solo suyo de cada hoja, en fuente): «Registrar gasto» completo 174 KB, el
detalle de una venta 154 (trae `qrcode.react`), el historial de cierres 114 y «Cerrar caja» 85. Las cuatro se abren con un toque y leen o
guardan en la base: sin internet no sirven de todos modos.

- DECIDÍ: las cuatro pasan a `hojaBajoDemanda`. «Cerrar caja» es LA acción de la pantalla: su código baja apenas la pantalla queda libre
  (`usePrecargarEnReposo`), así que abre al instante; el historial empieza a bajar al acercar el mouse o el foco; las otras dos, al abrirlas.
  Una sola definición de «Cerrar caja» para Caja y Vender (`components/caja/CerrarCajaBajoDemanda.tsx`).
- DESCARTÉ: poner las cuatro en un solo archivo, porque el escáner de las guías interactivas (`guias/escaner.mjs`) sigue los `import()` de
  cada archivo que una pantalla importa: le atribuía a Vender el historial, el detalle de venta y «Registrar gasto», que Vender no dibuja
  (48 controles de más en su huella). Y descarté dejarlas en un `.ts`: el escáner solo sigue `.tsx`, y los controles de esas hojas salían
  de la huella de Caja, es decir, su guía dejaba de estar vigilada. Aceptar la huella nueva habría «arreglado» la prueba rompiendo el candado.
- SE ROMPE SI: alguien difiere una hoja desde un archivo que no es `.tsx` o junta hojas de pantallas distintas en un archivo: la prueba
  `lib/guias.test.ts` lo marca (así salió), pero el mensaje habla de la guía, no de la extensión.

**Corrección de los medidores:** `cierres.mjs` y `camino.mjs` seguían los imports de los archivos `"use server"` (las acciones del
servidor) y contaban como código del teléfono lo que nunca viaja (el historial «alcanzaba» `next/headers`). Ahora un archivo de acciones es
una hoja del recorrido.

**Medido** (armado de producción local, ya con `main` del 2026-11-17 fusionado): `/caja` 1 650 → 1 454 KB (520 → 454 comprimido), −12 %; desde
antes de la actividad 7, 2 241 → 1 454 (−35 %). El texto propio de cada una de las cuatro hojas ya no aparece en los 27 archivos de la
carga inicial de `/caja`. Vender, Apartados y Compré ropa, sin cambio (1 750 · 1 690 · 1 404).

**Verificado (local, Playwright, 1366 y 375 px):** «Cerrar caja» abre sin pedir nada a la red (precargada), también desde la barra de
abajo del celular; el historial y el formulario completo de gasto abren y bajan su código al abrirse; recién cargada la pantalla y sin red,
el historial avisa «No se pudo abrir el historial de cierres», la pantalla sigue viva, y con red abre. Sin errores de página. La base
local quedó idéntica (no se guardó nada). `vitest` (945 archivos, huellas de guías sin cambio), `tsc`, `eslint`, `knip`, `knip:produccion`.
**No verificado:** el detalle de una venta abierto desde Caja (la base local no tenía ventas de hoy; es la misma pieza y los mismos tipos
que las otras tres), ni cerrar la caja de verdad.

## Actualización 2026-11-17 (d) — actividad 7, tercer corte: Existencias

Medido antes de tocar (`scripts/peso/cierres.mjs` sobre `components/InventarioPanel.tsx`): no había un arrastre de otra pantalla (como
`money` en Vender); lo que pesaba era suyo. El panel de la prenda (`existencias/PanelTalla.tsx`, con la planilla de «Ajustar stock» y los
flujos de colgar, subir, apartar y pedir) eran 625 KB de fuente en 54 archivos que bajaban aunque nadie tocara una prenda.

- DECIDÍ: seis hojas pasan a `hojaBajoDemanda` (`components/existencias/hojas-bajo-demanda.tsx`). El panel de la prenda y la cámara para
  escanear se precargan en reposo (`usePrecargarEnReposo`): son lo que más se abre —la cámara, en el celular— y así abren al instante.
  «Ajustar inventario», el buscador de prendas, las dañadas y el resumen del stock bajan al abrirlos.
- DESCARTÉ: dejar el panel fijo «porque se usa siempre», porque lo que se busca no es bajar menos código sino que la pantalla se pueda
  usar antes: con la precarga en reposo, la lista de Existencias aparece y responde sin esperar a leer el panel. Y descarté partir el
  panel por dentro (su planilla de ajuste aparte): son varias piezas y un gancho enlazados, y diferir el panel entero ya las saca todas.
- SE ROMPE SI: alguien toca una prenda en los primeros segundos con la red caída: sale «No se pudo abrir la prenda» en vez del panel
  (probado). Antes el panel ya estaba; pero sin red tampoco se podía hacer nada dentro de él.

**Medido** (armado de producción local): `/inventario` 1 899 → 1 546 KB (603 → 494 comprimido), −19 %. Lo que la pantalla alcanza con imports
fijos baja de 289 archivos y 2 836 KB de fuente a 189 y 1 664. El texto propio del panel, del buscador, de las dañadas y de la cámara ya no
aparece en los 32 archivos de la carga inicial.

**Verificado (local, Playwright, 1366 y 375 px):** el panel de la prenda y la cámara abren sin pedir nada a la red (precargados); el
buscador de «Ajustar stock» abre y baja su código al abrirse; las dañadas abren desde su dirección (`?danados=1`, la hoja se pide al cargar);
sin red desde que la pantalla pidió su código inicial, tocar una prenda avisa y la pantalla sigue viva, y con red abre; a 375 px el panel
abre sin desborde. La base local quedó idéntica. `vitest` (945 archivos, huellas de guías sin cambio), `tsc`, `eslint`, `knip`, `knip:produccion`.
**No verificado:** «Ajustar inventario» completo y el resumen del stock (con los datos de la base local no hay camino hasta ellos; misma
pieza y mismos tipos que las otras cuatro), ni guardar nada desde el panel diferido (colgar, ajustar, apartar): se abrió y se cerró.

## Actualización 2026-11-17 (e) — actividad 7: el marco se midió y NO se recorta

Felipe pidió el corte del marco común (lo que baja en toda pantalla: 1 069 KB, 333 comprimido). Se midió antes de tocar, esta vez con lo
que de verdad viaja: `scripts/peso/por-modulo.mjs` lee el mapa de cada archivo del navegador (armado con `MEDIR_PESO=1`) y dice cuántos KB
ya armados pone cada archivo de fuente o librería. `cierres.mjs` cuenta fuente con comentarios y aquí engañaba: daba 250 KB «solo suyos» a
`LogoutButton.tsx`, que armado pesa 2.

| De quién es | KB armados | Parte |
|---|---|---|
| Next y React (`react-dom` 202, el enrutador, la caché de segmentos) | 486 | 46 % |
| Supabase (sesión 96, tiempo real 55, archivos 24, consultas 15, el resto 25) | 215 | 20 % |
| Radix, `react-remove-scroll`, lucide y otros paquetes | 42 | 4 % |
| Arranque de Turbopack | 13 | 1 % |
| Código del ERP, en 153 archivos | 311 | 29 % |

El código nuestro no tiene un bulto: el archivo más grande pesa 22 KB (`lib/error-escritura.ts`, que casi toda pantalla usa igual) y
`components/AppShell.tsx`, 21. La Fase 1 ya había apartado lo que se abre a pedido (perfil, apariencia, demo, asistente, actividad, la guía).
`scripts/peso/si-corto.mjs` cruza el camino de imports con el peso armado y dice cuánto saldría con cada corte; los mayores:

| Corte posible | Saldrían | Por qué no |
|---|---|---|
| El motor de las guías | 14 KB | Decide en cada pantalla si ofrece la guía: bajaría igual, solo un poco después |
| Las fotos pendientes de la cola sin conexión | 10 KB | Es el camino que sube lo guardado sin red: no se le agrega un punto de falla por 10 KB |
| El recordatorio de cierre de caja | 10 KB | Solo lo recibe quien cierra caja, pero ver «probado y deshecho» |
| La estación de impresión de boletas | 7 KB | Imprime la boleta de una venta: tiene que estar |
| El buscador global | 7 KB | Se abre con una tecla en cualquier momento |

- DECIDÍ: no recortar el marco. Queda como está, y lo que se entrega es la medición y dos medidores nuevos para los cortes que siguen.
- DESCARTÉ: diferir esas cinco piezas (49 KB entre todas, menos del 5 % del marco), porque cada una agrega un «sin internet al abrir» a algo que
  hoy siempre está, y dos son de no perder datos o de imprimir una venta. Y descarté armar un cliente de Supabase a medida sin tiempo real
  ni archivos (−80 KB): la librería los crea al nacer, habría que reemplazar la pieza por la que pasa toda lectura y escritura del ERP.
  Eso es estructural y lo decide Felipe; no se hace por un 7 %.
- SE ROMPE SI: alguien lee «el marco pesa 1 069 KB» como «hay 1 069 KB por recortar». Dos tercios son React, Next y Supabase.

**Probado y deshecho** (un armado, nada quedó en el código):
- *El relleno de `Buffer`*: Next agrega 22 KB a toda pantalla porque la librería de archivos de Supabase pregunta `typeof Buffer` para
  codificar un encabezado que el ERP no usa (es el único código del navegador que lo nombra, medido sobre los 504 archivos). Se probó
  apuntarlo a un archivo vacío con `turbopack.resolveAlias` (`buffer` y `node:buffer`): Turbopack no lo tomó, el relleno siguió ahí.
  Quitarlo pide parchar la librería, y un parche a una dependencia se paga en cada actualización.
- *El recordatorio de cierre con `next/dynamic` desde el layout del servidor*: sigue en la lista de archivos del layout y baja para todos.

**Dónde sí hay peso** (las 138 pantallas, ordenadas por lo que cada una suma al marco; mediana 184 KB): `/recibir/envio/[id]` 1 034 KB,
`/gestion/preguntas` 854, `/recibir` 684, `/vender` 681, `/productos/[id]/editar` 644, `/productos/nuevo` 635, `/vender/apartados` 621,
`/produccion/ordenes/[numero]` 610, `/productos/campanas` e `/insignias` 554, `/productos` 532. De las que se usan en el celular, la más
pesada del ERP es contar un envío de Recibir.

**El interruptor `MEDIR_PESO`** (`apps/web/next.config.ts`): solo agrega `productionBrowserSourceMaps` al medir, y nunca con la llave de
Sentry presente. Importa: si esa llave de la configuración existiera siempre (aunque fuera `false`), Sentry la tomaría por una decisión
nuestra y dejaría de generar los mapas que sube en producción (ADR-0424). Sin `MEDIR_PESO`, la configuración que llega a Vercel es la de antes.

## Actualización 2026-11-17 (f) — actividad 7, cuarto corte: zod fuera de 50 pantallas y contar un envío de Recibir

Contar un envío (`/recibir/envio/[id]`) era la pantalla más pesada del ERP (1 031 KB propios) y es la que el almacén usa en el celular.
Medida archivo por archivo (`por-modulo.mjs … propio`) no tenía un bulto: eran muchas piezas medianas. Lo que salió, en orden de hallazgo:

**1. zod bajaba en 52 de las 139 pantallas y ninguna lo usaba.** El índice de `@cayla-retail/shared` reexportaba `./schemas`, que arma sus
esquemas con zod apenas se carga. El armado no puede saber que eso no hace falta, así que toda pantalla que importaba un enum o un
formateador del índice bajaba zod entero: 52 KB ya armados (más 2 de los esquemas) en Vender, Caja, Inicio, Recibir, Existencias, Cambios,
Devoluciones… Los esquemas no tienen ningún consumidor desde julio (`enums.ts` ya lo decía en un comentario).

- DECIDÍ: sacar `./schemas` del índice y dejarlo como subruta (`@cayla-retail/shared/schemas`). Lo vigila `lib/compartido-sin-zod.test.ts`:
  desde el índice no se llega a ninguna librería.
- DESCARTÉ: borrar `schemas.ts`, porque tres documentos de `docs/datos/` lo citan con línea como evidencia de promesas incumplidas y
  borrarlo es decisión de Felipe (queda en el backlog); y `"sideEffects": false` en el paquete, porque deja la decisión en manos del
  armado y un cambio de versión de Next la puede deshacer sin que nadie lo vea.
- SE ROMPE SI: alguien vuelve a reexportar desde el índice un archivo que importa una librería (la prueba lo dice con el archivo).

Quedan 2 pantallas con zod, las dos porque lo usan de verdad: Configuración (el precio propuesto con IA) y Preguntas del equipo (el asistente).

**2. Dos arrastres como el de `money`** (un import chico que trae un módulo entero; sin punto de falla, solo se movió código):
- La etiqueta de precio importaba `descuentoDeCampana` de `vender-reglas.ts` y con ella las reglas de la caja (13 KB). La cuenta vive ahora
  en `lib/descuento-por-porcentaje.ts`, sin importar nada; `vender-reglas.ts` la sigue exportando. Es la misma función, sin tocar.
- Recibir importaba `TIPOS_PAPEL` y `subirFotoPapel` de las reglas y acciones de «Compré ropa» (24 KB). Viven en `lib/papel-de-compra.ts`
  y `lib/papel-de-compra-acciones.ts`; `compra-rapida-*` los sigue exportando.

**3. Dos piezas que bajan cuando hacen falta** (`components/recepcion-conteo/hojas-bajo-demanda.tsx`), con el patrón de 7.2:
- La hoja que crea una prenda o le agrega tallas y colores (`HojaPrenda`, 112 KB con las piezas de Nuevo producto que usa). La montan
  Contar, «Hacer ahora» y la recepción de la fase 4; si no se puede abrir, se cierra como con su ×.
- El paso «Cerrar» (`CerrarEnvio`, 65 KB). Si no hay red al pasar a él, avisa y la pantalla vuelve a Contar con lo contado intacto.
- Contar las precarga apenas la pantalla queda libre (`usePrecargarEnReposo`): abren al instante. Las dos guardan en la base, así que sin
  internet no servían de todos modos. **Contar no se difiere**: lo contado que todavía no llegó a la base vive en la pantalla.

**Lo que no se cortó, y por qué.** «Llevar al stock» con su etiqueta y el QR (45 KB): es un botón de la tarjeta, no una hoja; diferirlo
pide partir el archivo. El envío ya cerrado (28 KB) y la recepción de la fase 4 (29 KB) son caras completas, no hojas: el patrón de 7.2
no dice qué se ve si fallan. «Nuevo modelo» (11 KB) es la acción de cada toque en un envío sin aviso. Cada uno queda bajo el 5 %.

| KB propios (lo que cada pantalla suma al marco) | Antes | Después | |
|---|---|---|---|
| Contar un envío de Recibir | 1 031 | 765 | −26 % |
| Recibir | 684 | 597 | −13 % |
| Vender | 681 | 625 | −8 % |
| Editar producto | 644 | 588 | −9 % |
| Nuevo producto | 635 | 579 | −9 % |
| Apartados | 621 | 565 | −9 % |
| Productos | 532 | 477 | −10 % |
| Existencias | 477 | 421 | −12 % |
| Caja | 385 | 330 | −14 % |
| Las 138 pantallas, sumadas | 31 878 | 28 619 | −10 % |

51 pantallas bajaron 40 KB o más; la mediana pasó de 183 a 175 KB. El marco no cambió (1 068 KB).

**Verificado.** Tipos, lint, Knip (los dos) y las pruebas. En el navegador a 375 px, con un envío abierto de la base local: Contar se ve
igual; «Revisar y cerrar» abre sin pedir nada (ya estaba precargado); con la precarga apagada y la red cortada, avisa «No se pudo abrir el
cierre del envío», se queda en Contar y al volver la red el mismo botón abre; lo mismo con «Agregar talla o color» (avisa, vuelve a la tabla
de tallas y al reintentar abre la hoja). La base local quedó igual (mismas versiones de cada conteo).
**No verificado.** Cerrar un envío de verdad y «Hacer ahora» en uno ya cerrado (escriben en la base local, que es compartida); la recepción
de la fase 4 (no se alcanza con la base al día); `/chaos` y `guias:recorrer` sobre Recibir; un teléfono real.

**Visto de paso** (al backlog, sin tocar): el dial de «¿Cuántas llegaron?» no hidrata igual en el servidor y en el navegador (el último
decimal de dos coordenadas), y **Preguntas del equipo** quedó como la pantalla más pesada (786 KB): baja el texto de todas las guías (650 KB).

## Actualización 2026-11-17 (g) — actividad 7, quinto corte: Preguntas del equipo, y zod fuera de todo el navegador

Tras el cuarto corte, la pantalla más pesada era Gestión ▸ Preguntas del equipo: 786 KB propios. Medida con `por-modulo.mjs`, 650 eran el
texto de las 122 guías interactivas (`lib/guias/pantallas/*.ts`) y 52, zod. Ninguna de las dos cosas hacía falta en el navegador: eran tres
arrastres como el de `money`, y los tres se quitan moviendo código, sin diferir nada y sin agregar ningún punto de falla.

**1. El título de una guía lo resuelve el servidor.** La pantalla dice a qué pantalla llevó cada respuesta («→ Caja»). Para ese nombre,
`lib/asistente/equipo.ts` buscaba en `GUIAS` (el registro, que importa el texto de todas las guías) desde el navegador.

- DECIDÍ: `getPreguntasEquipo` (servidor) devuelve, junto con los datos, el título de las guías que salen ese mes (`lib/guias/titulos.ts`),
  y `nombreDeGuia` / `respuestaCorta` lo reciben como parámetro. `equipo.ts` ya no importa el registro.
- DESCARTÉ: un índice liviano de títulos escrito aparte, porque serían dos listas que hay que mantener iguales con una prueba; y bajar las
  guías bajo demanda, porque la pantalla nunca necesitó su texto.
- SE ROMPE SI: un componente del navegador importa `lib/guias/titulos.ts` o el registro (vuelve a bajar todo). Lo vigila el candado.

**2. El esquema de zod del informe del lunes vive aparte** (`lib/asistente/informe-esquema.ts`). Estaba en `informe.ts`, que también
importa la tarjeta del informe: por dos constantes y una función, el navegador bajaba zod y las instrucciones que se le dan a la IA.

**3. Los límites del asistente viven aparte** (`lib/asistente/limites.ts`: el tope del mes y el largo de una pregunta). Configuración leía
`TOPE_MENSUAL_USD` de `respuesta.ts`, que arma un esquema de zod al cargarse: el armado dejaba 0,6 KB de ese archivo y los 52 de zod.
`respuesta.ts` sigue exportando lo que usa el servidor.

| KB propios | Antes del quinto corte | Después | |
|---|---|---|---|
| Preguntas del equipo | 786 | 69 | −91 % |
| Configuración | 384 | 331 | −14 % |
| Pantallas que bajan zod | 2 (eran 52 antes del cuarto corte) | 0 | |
| Las 138 pantallas, sumadas (31 878 antes del cuarto corte) | 28 619 | 27 849 | −13 % en total |

La más pesada vuelve a ser contar un envío (765 KB); la mediana queda en 173. El marco no cambia (1 068 KB).

**Candado** (`lib/vender-no-se-arrastra.test.ts`): desde la lista de preguntas y la tarjeta del informe no hay camino de imports fijos al
registro de las guías ni al esquema; y, general, **ningún archivo de `components/` llega por imports fijos a un archivo que importa zod**.

**Verificado.** Tipos, lint, Knip (los dos) y las pruebas (las de `equipo` cubren el título pedido, la guía que ya no existe y que el
servidor manda solo los títulos que se piden). En el navegador, en local: Preguntas del equipo carga sin errores (vacía: la base local no
tiene preguntas) y Configuración ▸ Empresa y tiendas dice «Este mes: US$ 0,00 de US$ 30,00».
**No verificado.** La lista con preguntas de verdad (la base local no tiene ninguna y es compartida: no se sembraron); el informe del lunes
armado por la IA (pide la clave); el cajón del asistente abierto (está apagado en la sede local). Los tres quedan cubiertos por tipos y pruebas.

**Visto de paso.** El cajón del asistente y «Elegir demo» sí bajan el texto de todas las guías cuando se abren (van aparte del marco). El
cajón las necesita para buscar; «Elegir demo» solo pregunta si una pantalla tiene guía. Queda en el backlog.

## Actualización 2026-11-17 (h) — actividad 7, sexto corte: el texto de las guías ya no baja en cada sesión

Felipe pidió seguir con «Elegir demo», que importaba el texto de todas las guías para saber si una pantalla tenía guía. Medido, recortar solo
eso no ahorraba nada: el texto de las 122 guías es UN archivo del navegador (665 KB ya armados, 177 comprimidos) que «Demo», el acompañante del
asistente y el motor de las guías comparten. Y el motor (`MotorGuias`, en el marco) lo pedía **en el primer momento libre de cada sesión, en
toda pantalla y para todos**, solo para saber qué guía tenía la pantalla y ofrecerla la primera vez. No pesaba en la carga (`por-modulo.mjs` no
lo ve: llega después), pero un teléfono de 2–4 GB lo bajaba y lo leía justo cuando la colaboradora empezaba a usar la pantalla.

- DECIDÍ: el servidor manda un **índice** de las guías (id, ruta, título y resumen; `indiceDeGuias`, `lib/guias/titulos.ts`) desde
  `app/(app)/layout.tsx` hasta el marco: unos 21 KB de datos, 6 comprimidos, una vez por carga completa. Con eso el motor sabe qué guía tiene
  la pantalla y la ofrece, «Demo» arma su lista y el acompañante nombra la pantalla de un paso. El texto (los pasos) se pide recién **cuando una
  demo va a correr** (`guiaCompleta`, `lib/guias/diferidas.ts`), con el loader si todavía no bajó, y empieza a bajar antes cuando hay una buena
  razón: al ofrecer la demo de la primera visita y al abrir «Demo».
- DESCARTÉ: un índice escrito (o generado) en el código del navegador, porque serían dos listas que mantener iguales y sumaría ~22 KB al marco
  de todos; y mantener la carga en reposo solo en las pantallas cuya guía no se ha visto, porque igual necesita el índice y seguiría bajando
  665 KB en la primera pantalla nueva de cada sesión.
- SE ROMPE SI: un componente del marco vuelve a importar el registro de las guías (lo vigila `lib/vender-no-se-arrastra.test.ts`); o se pide
  una demo sin internet (avisa «No se pudo abrir la demo» y el siguiente intento vuelve a pedir el texto).

**Lo que se paga.** La primera demo de una sesión, si no se ofreció ni se abrió «Demo» antes, espera la descarga (177 KB comprimidos) con el
loader de siempre. Desde «Demo» casi nunca se nota: el texto empieza a bajar mientras la persona elige.

**De paso, un arreglo del principio 9.** `diferidas.ts` guardaba la promesa de la descarga aunque fallara: una sola falla de red dejaba las guías
apagadas hasta recargar, sin aviso. Ahora usa `bajoDemanda` (7.2), que no recuerda los fallos.

**Sigue bajando el texto** el cajón del asistente al abrirse (`CajonAsistente`): busca en los pasos de las guías para responder, así que lo
necesita de verdad. Ya estaba diferido al abrirlo (ADR-0623).

**Verificado.** Tipos, lint, Knip (los dos) y las pruebas; el candado nuevo (ni el marco, ni el motor, ni «Demo», ni el acompañante llegan al
registro por un import fijo). En el navegador, en local, como líder en Caja: al cargar y esperar 9 s **no se pidió** el archivo de las guías;
al abrir Mi perfil ▸ Demo la lista salió completa desde el índice («45 demos en tu menú», con «Esta pantalla: Caja») y recién ahí se pidió el
texto; la demo de Caja arrancó («1 de 22»). Con la red cortada solo para ese archivo, «Demo» abrió igual, la demo avisó «No se pudo abrir la
demo» sin romper nada y, al volver la red, el mismo camino la arrancó.
**No verificado.** La oferta de la primera visita (la cuenta de prueba ya vio las guías), un tramo del asistente (apagado en la sede local), el
botón «Demo» de una terminal, el peso real del índice dentro del HTML de producción (calculado: 21,5 KB, 5,9 comprimidos) y un teléfono real.

## Para Dynamic

`components/ui/BotonLiviano.tsx` es una pieza nueva en una carpeta que Dynamic mira: **queda como tarea allá**, si quieren el modo liviano.
Actividad 7 (2026-11-17): `components/ui/FichasMedio.tsx` cambia UNA línea de import (el ícono del medio sale del ticket de Vender); no
cambia cómo se ve ni qué hace. El vigilante puede abrir una tarea allá: no hay nada que copiar.
No cambia `recetas.css` ni `contrato.json`; nada viaja solo.

## Actualización 2026-11-17 — «Apariencia»: los tres ajustes del aparato en un solo lugar, y «Volver a automático»

**El pedido (Felipe):** la barra de arriba del celular tenía botones que no son de trabajo (la luna del modo oscuro y el destello de las
animaciones), y la pluma del modo liviano, al pie del menú junto a «Salir», casi no se descubría. Felipe decidió las tres preguntas de la
propuesta (`docs/backlog/2026-11-17-friendly-faraday-ld7j6p.md`): se llama **«Apariencia»**; el modo liviano lleva **«Volver a
automático»**; y va **en el celular y en el escritorio** («primero en celular, luego en PC»: dos commits, en ese orden).

- **DECIDÍ:** una fila «Apariencia» al pie del menú, sobre la tarjeta de la persona, con la misma cara que las filas del menú (abierta,
  plegada y en el cajón del celular). Abre una hoja (`components/HojaApariencia.tsx`, `<Modal conCerrar>`) con tres interruptores que se
  aplican al tocar: Modo oscuro, Animaciones y Modo liviano, cada uno con su dibujo y su porqué en una línea. Los tres botones de la cabecera
  (`BotonTema`, `BotonMovimiento`, `BotonLiviano`) se borraron, con su CSS y sus funciones de texto.
- **DESCARTÉ:** ponerlos en «Mi perfil», porque una terminal no tiene perfil y son ajustes del aparato, no de la persona; y dejar los íconos en
  la cabecera del escritorio, porque serían dos lugares para lo mismo.
- **SE ROMPE SI:** quien cambia de tema varias veces al día en el escritorio extraña el clic único (ahora son dos: la fila y el interruptor).
  La salida sería un atajo de teclado, no volver el ícono a la cabecera.

**El tercer estado del modo liviano.** «Automático» = no hay nada guardado en `localStorage["cayla-liviano"]`: decide el equipo, como
siempre. Si alguien lo cambia a mano, la hoja muestra «Volver a automático», que **borra** lo guardado (no guarda «auto») y vuelve a
preguntarle al equipo (`volverLivianoAutomatico`, `lib/liviano-cliente.ts`). Así el script del `<head>` no cambia y `lib/liviano.test.ts`
sigue exigiendo que diga lo mismo que `resolverLiviano`. La regla pura es `livianoEsAutomatico` (`lib/liviano-reglas.ts`). En una ventana
privada, lo elegido vale para esa carga y no se muestra como «Automático».

**Lo que no es:** no es un módulo (ADR-0306): no está en `lib/modulos.ts` ni en Roles y accesos; lo ve toda cuenta, también una terminal. No
cambia qué hace ninguno de los tres ajustes: solo dónde se tocan.

**Verificado (local, `next dev` y la base local):** a 375 y 320 px la barra de arriba queda con «Actividad», la sede (entera, 122 px a 320) y
la lupa; la hoja sube desde abajo con su asa; cada interruptor cambia el ERP al momento y se mantiene al recargar; tocar el modo liviano a
mano cambia «Automático» por «Volver a automático», y este lo devuelve (en el Mac de 16 GB, a «apagado»). En el escritorio, la fila mide 40
px como las del menú, y plegada queda centrada con «Apariencia» entero debajo; Escape cierra la hoja y el foco vuelve a la fila. La auditoría
del modo oscuro (`tema:auditar`, escenario `estructura.apariencia`) da 0 hallazgos propios; `/milimetro`: ficha `docs/milimetro/apariencia.md`
y auditoría `docs/milimetro/auditorias/2026-11-17-apariencia.md`. `vitest` de `lib` completo (937 archivos), `tsc` y `knip` en verde.
**No verificado:** un teléfono de gama baja real decidiendo «Automático» encendido.

**Para Dynamic:** se borraron `components/ui/BotonTema.tsx`, `BotonMovimiento.tsx` y `BotonLiviano.tsx`, que Dynamic mira: **queda como
tarea allá** (si Dynamic tiene sus propios botones, no se rompe nada; si quiere «Apariencia», la hoja vive en `components/`, fuera de lo
que mira). No cambia `recetas.css` ni `contrato.json`; nada viaja solo.


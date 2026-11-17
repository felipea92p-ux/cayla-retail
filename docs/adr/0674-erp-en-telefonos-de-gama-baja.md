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

## Para Dynamic

`components/ui/BotonLiviano.tsx` es una pieza nueva en una carpeta que Dynamic mira: **queda como tarea allá**, si quieren el modo liviano.
No cambia `recetas.css` ni `contrato.json`; nada viaja solo.

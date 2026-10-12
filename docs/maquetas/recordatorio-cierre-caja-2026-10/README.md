# Maquetas · Recordatorio de cierre de caja (2026-10-01)

> **Estado (2026-10-01): implementada la maqueta 2, «Isla», tal cual — ver `docs/adr/0305-recordatorio-de-cierre-de-caja-la-isla.md`.**
> **Actualización 2026-10-06:** la Isla se mudó al centro de la cabecera como «Marcador» (ADR-0359, `docs/maquetas/recordatorio-cierre-barra-superior-2026-10/`).
>
> Lo que el ERP decidió para las preguntas abiertas: la ve quien puede cerrar la caja, solo de la sede donde está parado,
> sin preaviso y con los cortes de 30 y 60 min. Las maquetas 1 y 3 quedan como referencia. Los datos de abajo son inventados
> (Arequipa: S/ 1,284.50 en el cajón, 23 ventas; Trujillo: S/ 962.00, 17 ventas).

`index.html` es un solo archivo y se abre en el navegador. La barra negra de arriba no es parte del ERP. Desde ahí se
cambia la maqueta, la sede, la hora simulada, la velocidad del reloj, la vista (escritorio o celular de 375 px) y tres
opciones: preaviso de 15 min, lateral plegado y movimiento reducido.

**Recorrido:** abre la página y espera unos 3 s (el reloj corre ×10). A las 9:30 p. m. de Arequipa aparece el
recordatorio. Navega por el menú (Vender, Caja, Existencias) y fíjate que te acompaña. Usa «+35 min» y «+1 h 10» para
ver cómo sube de nivel. Toca «Cerrar caja»: te lleva a Caja, ilumina el botón y abre el cierre. Confírmalo y mira cómo
se despide. «Reabrir caja» empieza de nuevo. Prueba también TRU (7:45 p. m.) y LIM (sin hora, sin recordatorio).

## Lo que comparten las tres

| Regla | Por qué |
|---|---|
| **La hora sale de `ubicaciones.hora_cierre`**, que ya existe (`20260925101000_hora_de_cierre_por_tienda.sql`) y el líder cambia en Configuración ▸ Tiendas y caja | AQP 21:30 y TRU 19:45 son datos, no código. Si mañana Arequipa cierra a las 10, se cambia sin deploy. Una tienda sin hora no tiene recordatorio (LIM en la maqueta) |
| **No tiene ✕.** Se va solo cuando la caja se cierra | Es lo que pediste. Se puede plegar o mirar de reojo, pero no se puede descartar |
| **No tapa nada para siempre ni roba el foco** | Quien está cobrando sigue cobrando. Ningún recordatorio abre un modal solo ni mueve el contenido de la página |
| **Tres niveles por tiempo:** en hora (0 a 29 min), sigue abierta (30 a 59) y sin cerrar (1 h o más). Colores: pizarra → ámbar → rojo profundo | Sube la presencia con el tiempo, no de golpe. Pizarra es el color «informativo» de la paleta (ADR-0169): a las 9:30 todavía no es un problema |
| **«Cerrar caja» lleva a Caja, ilumina su botón y abre el cierre** (`CerrarCajaModalV2`) | El recordatorio no cierra nada por su cuenta: solo acorta el camino |
| **Al cerrar se despide** con un ✓ verde y una salida corta | Confirma que se fue porque se cerró, no porque falló algo |

**Movimiento (ADR-0136):** cada efecto responde a algo que pasó: llegó la hora, pasaron diez minutos más, subió de nivel
o se cerró la caja. Todos usan `--ease-cayla` y ninguno rebota. La barra, el anillo y las estrellas que avanzan son un
dato (cuánto pasó desde la hora), no un adorno. Todo se apaga con `prefers-reduced-motion`. **Una excepción que tendrías
que aprobar:** el punto que late en el nivel «sin cerrar». Es la misma señal que el chip «Vencida», y por eso lo puse
solo en el nivel 3.

## Las tres maquetas

### 1 · Hilo

La línea «sede · fecha» que ya tiene la cabecera de cada pantalla (`EncabezadoPagina`) se vuelve el aviso. La fecha sube
y sale, entra «Hora de cerrar caja · hace 12 min · Cerrar caja →», y el hilo taupe se alarga y se llena con el tiempo.
Un reloj chico mueve sus agujas hasta la hora de cierre de la sede. Si bajas y la cabecera sale de la vista, queda
colgado arriba un hilo de 2 px con una pestaña «Cerrar caja · 12 min». Desde los 30 min, ese hilo se queda fijo.

- **Gana:** es la menos invasiva y la más fiel al sistema visual. No agrega ni mueve nada.
- **Paga:** es la más fácil de no ver, porque depende de mirar arriba. Además vive en `EncabezadoPagina`, que hoy solo
  usan Ventas, Inventario y Catálogo ▸ Productos: en las demás pantallas solo quedaría el hilo colgado.

### 2 · Isla

Una píldora oscura abajo a la derecha (centrada en el celular). Nace como un punto, se estira y se abre en una tarjeta:
título, línea del día (de la apertura al cierre, con lo que pasó después en color), efectivo en el cajón y ventas
(las cifras cuentan hasta su valor) y «Cerrar caja». A los 5 s se pliega sola si el mouse no está encima. Su anillo
se llena con el tiempo y, al subir de nivel, cambia de color y lanza una sola onda.

- **Gana:** es la más visible, la que mejor sirve en el celular (Vender se usa ahí, PL-105) y la única que muestra
  cuánto hay que cuadrar antes de entrar a Caja.
- **Paga:** abierta, tapa la esquina. En Vender, ahí está «Cobrar». Plegada mide 44 px, pero sigue encima del contenido.

### 3 · Crepúsculo

Una tarjeta al pie del lateral con el cielo de la sede: el Misti en Arequipa y el mar en Trujillo. A la hora, el sol se
pone detrás del paisaje, sale la luna y cada 10 minutos sin cerrar se prende una estrella (hasta 6): la noche cuenta el
tiempo. El ítem «Caja» del menú dice «● Cerrar» y el chip de sede lleva un punto. Al cerrar: «Buenas noches, Arequipa».
En el celular, como el lateral está escondido, queda una luna con anillo de tiempo junto a la sede, y al tocarla se abre
el menú.

- **Gana:** es la más elegante, tiene identidad de sede y no toca el área de trabajo.
- **Paga:** en el celular se esconde detrás de un toque. Con el lateral plegado queda reducida a un círculo de 46 px.

## Mi recomendación

**La 2 (Isla), sumándole la marca «● Cerrar» en el ítem Caja del menú que trae la 3.** Lo que decide es el celular:
Vender y Caja se usan en el teléfono y ahí el lateral no se ve, así que la 3 pierde casi todo. La 1 es preciosa, pero un
recordatorio que se puede no ver no cumple «no quitarse hasta que se cierre». La Isla es la que menos se pierde sin
volverse invasiva: llega abierta una sola vez y después queda como una píldora de 44 px.

## Qué haría falta para construirla (sin construir)

- **Sin migración:** `ubicaciones.hora_cierre` ya existe. Hay que confirmar con un `select` en producción que AQP diga
  21:30 y TRU 19:45. Si está vacía, se carga en Configuración ▸ Tiendas y caja.
- **Lógica pura en `lib/recordatorio-cierre-reglas.ts`, con su prueba:** `estadoRecordatorio({ ahoraLima, horaCierre,
  cajaAbierta, aperturaFecha, preaviso })` devuelve `{ nivel, minutos }`. Tiene que cubrir **el paso de medianoche**: si
  la caja de ayer sigue abierta a las 00:15, el tiempo se cuenta desde la hora de cierre del día en que se abrió, no
  desde el de hoy (con esa caja ya serían 2 h 45 min, nivel 3).
- **Un componente montado una vez en `AppShell`**, como `<EsperaGlobal />`, que lee la caja abierta de la sede y vuelve
  a preguntar cada minuto (o con realtime). Así, si alguien cierra la caja desde otra terminal, el recordatorio
  desaparece en todas.
- Al pasar a `/caja` con la intención de cerrar (`?cerrar=1`), se abre `CerrarCajaModalV2`. Hoy ese modal no se abre
  desde la URL.

## Preguntas abiertas (del negocio)

1. **¿Quién lo ve?** ¿Todas las cuentas de la sede, o solo quien puede cerrar caja (`gestionarCaja`)? Mi recomendación:
   quien ve el módulo Caja, porque es quien puede actuar.
2. **¿El líder ve los recordatorios de otras sedes?** Por ejemplo, «TRU sin cerrar hace 1 h» mientras mira AQP.
3. **Lima no tiene hora** en la maqueta. ¿Cuál es?
4. **¿Preaviso 15 min antes?** Está en la maqueta como opción, apagado por defecto.
5. **¿Los cortes de 30 y 60 min están bien?** ¿O el nivel «sin cerrar» debería empezar antes?

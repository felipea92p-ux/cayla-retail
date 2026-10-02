# ADR-0305 — Recordatorio de cierre de caja: la «Isla»

**Fecha:** 2026-10-01 · **Estado:** construido y probado en local; sin migración · **Decide:** Felipe (que exista, la maqueta
elegida y las horas: AQP 21:30, TRU 19:45); Claude (quién lo ve, los cortes de nivel, cómo se entera de un cierre, el resto
de lo técnico) · **Rama:** `claude/cash-closing-reminder-mockups-01e53f` · **Maqueta:** `docs/maquetas/recordatorio-cierre-caja-2026-10/`
(maqueta 2, «Isla», elegida por Felipe «tal cual»).

## 1. El problema, primero

Una caja que se queda abierta de noche rompe el día siguiente. La apertura se compara con el cierre anterior (ADR-0186), y si
el cierre no existe, quien abre hereda un cajón sin cuadre. Hoy nada le avisa a la tienda que ya es hora de cerrar. Felipe
pidió un recordatorio que no sea invasivo pero sí se note, que se active a la hora de cierre de cada tienda y que **no se
quite hasta que la caja se cierre**.

## 2. Decisión

```
DECIDÍ:    una píldora flotante (la «Isla») montada una vez en el layout de la app, para quien puede cerrar la caja de una tienda.
           Aparece a la hora de `ubicaciones.hora_cierre` (la que ya existía, 20260925101000), sube de nivel a los 30 y 60 min, no
           tiene ✕ y se va solo cuando la caja se cierra. Sin migración.
DESCARTÉ:  (a) las maquetas 1 «Hilo» (en la línea sede · fecha de la cabecera) y 3 «Crepúsculo» (en el lateral): la primera es
           fácil de no ver y la segunda se esconde en el celular, donde se usan Vender y Caja (PL-105); Felipe eligió la Isla;
           (b) escribir AQP 21:30 y TRU 19:45 en el código: la hora ya es un dato que el líder cambia en Configuración ▸ Tiendas y caja;
           (c) leer la caja solo en el layout: el layout no se vuelve a pintar al navegar, y un cierre hecho desde otra terminal
           no llegaría; (d) Supabase Realtime: suma una suscripción por terminal para algo que cambia una vez al día; un sondeo
           de un minuto alcanza.
SE ROMPE SI: una tienda no tiene `hora_cierre` (no hay recordatorio: se ve igual que hoy) o la base no responde (la isla se queda
           como estaba; nunca se despide por un error de red).
```

## 3. Las reglas

| Regla | Dónde vive |
|---|---|
| **Quién lo ve:** la vista de una sede (no CAYLA Global), en una **tienda** (Almacén y Taller no tienen caja) y solo quien puede cerrar la caja (`gestionarCaja`). La isla lleva a cerrarla; a quien no puede, el botón le diría que no | `lib/recordatorio-cierre.ts:recibeRecordatorioCierre` |
| **Desde cuándo se cuenta:** desde la **primera hora de cierre que llega después de abrir la caja**. Una caja de ayer que sigue abierta a las 00:15 ya va 2 h 45 min tarde (contar desde el cierre de hoy diría «todavía no es hora»), y una caja abierta después de la hora no nace atrasada: su cierre es el del día siguiente | `lib/recordatorio-cierre-reglas.ts:instanteDeCierre` |
| **Niveles:** 1 «Es hora de cerrar caja» (0–29 min, pizarra), 2 «La caja sigue abierta» (30–59, ámbar), 3 «Caja sin cerrar» (60+, rojo) | `nivelPorMinutos`, `MINUTOS_NIVEL_2/3` |
| **Se abre sola una vez por caja y por pestaña** (5 s, o hasta que el mouse se va); después es una píldora de 44 px que se abre al tocarla. Recargar no la vuelve a desplegar encima del trabajo | `sessionStorage` `cayla:recordatorio-cierre:<caja>` |
| **Se entera del cierre** por el `router.refresh()` de `CerrarCajaModalV2` (misma terminal) o por el sondeo de `GET /api/caja/recordatorio` cada minuto mientras está a la vista, y cada 5 min si no (otra terminal). Un 503 no es «ya cerraron» | `components/RecordatorioCierreCaja.tsx`, `app/api/caja/recordatorio/route.ts` |
| **«Cerrar caja»** lleva a `/caja?cerrar=1` y `CajaAbiertaPanel` abre `CerrarCajaModalV2` (borra el parámetro al llegar: recargar no lo vuelve a abrir); ya en Caja, el evento `cayla:cerrar-caja` | `CajaAbiertaPanel.tsx`, `EVENTO_CERRAR_CAJA` |
| **No tapa barras fijas de abajo** (la de Caja y la de Cobrar en el celular, la de un formulario largo): mide qué hay pintado bajo ella y flota encima. Se mira el DOM y no una lista de pantallas, así que una barra nueva queda cubierta sola | `alturaBarraInferior` |
| **Capas:** z 40, sobre la cabecera (30) y bajo los modales (50) y el loader global (60). La consulta es un GET a `/api`, que no abre el loader (`clasificarPeticion`) | `app/estilos/recordatorio-cierre.css` |

## 4. Movimiento (ADR-0136)

Cada efecto responde a algo que pasó. Al llegar la hora nace como un punto (300 ms), se estira a píldora, y las agujas del reloj
viajan a la hora de cierre de la sede (1,1 s). La primera vez se abre en tarjeta: entra en cascada con 55 ms entre piezas, la
línea del turno se llena y las cifras cuentan hasta su valor. Al subir de nivel cambia de color y lanza **una** onda. Cada
minuto, el número rueda. Al cerrar la caja se pone verde, traza su ✓ y se encoge. El anillo y la línea avanzan con el tiempo:
son un dato, no un adorno. Todo usa `--ease-cayla`, sin rebote, y con `prefers-reduced-motion` pasa en un instante.

**Excepción aprobada con la maqueta:** el punto que late en el nivel 3 («Caja sin cerrar»). Es la misma señal que el chip
«Vencida» (ADR-0136 act. c) y solo existe en ese nivel.

## 5. Lo que queda para Felipe

- **Producción:** consultado el 2026-10-01, las tres tiendas tienen `hora_cierre` vacía. Hay que cargar AQP 21:30 y TRU 19:45
  en Configuración ▸ Tiendas y caja (queda firmado en `configuracion_historial`). Sin ese dato, la isla no aparece.
- **Abiertas, con la respuesta por defecto construida:** el líder no ve los recordatorios de otras sedes (solo el de la sede
  donde está parado); Lima no tiene hora; no hay preaviso de 15 min.

## 6. Cómo se verificó

`lib/recordatorio-cierre-reglas.test.ts` (16 pruebas: horas de AQP y TRU, cortes de 30/60, medianoche, caja abierta después
de la hora, tienda sin hora, textos). En el navegador, sobre la base local con una hora de cierre puesta y quitada a mano en
Tienda Trujillo: llega y se abre sola, se pliega, «Cerrar caja» desde Inicio lleva a Caja con el cierre abierto, desde Caja
lo abre por evento, un cierre simulado desde otra terminal la despide en verde, y a 375 px flota sobre la barra de Caja y
se abre bien en Vender.

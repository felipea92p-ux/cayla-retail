# Apartados v2 — spike visual (2026-09-26)

Spike interactivo: `apartados-v2-spike.html` (abrir en el navegador, sin servidor). No toca código ni base.
Capturas en `capturas/`. Estado por URL para abrir una vista concreta, por ejemplo
`apartados-v2-spike.html#device=cel&forma=pasos&paso=2&clienta=1` o `#tab=todos&preset=completo`.

## Estado de construcción (2026-09-26)

| Función | Dónde | Estado |
|---|---|---|
| Celular pasos + pestañas abajo, cámara QR, arreglos | #482, ADR-0223 | En producción |
| Recordar en lote | #490, ADR-0227 | En producción |
| Abonos, estante, editar, actividad, opciones, clienta por DNI, «Qué ver» | ADR-0236 | Web en PR; 4 migraciones por pegar |
| Apartar de otra sede | — | Espera decisión de Felipe (toca Traslados) |

Abonos (Felipe): sin mínimo; el plazo no cambia solo; «esperarla» da 2 días, o 3 si abona la mitad o más de lo que le faltaba.

## Cómo se usa la demo

- **Barra negra de arriba (solo demo):** Computador / Celular; en celular, las tres formas a comparar (Pasos + barra
  fija, Apilado + «Ver ticket», Pestañas abajo); punto de partida (Esencial / Recomendado / Completo); «Marcar arreglos
  y lo nuevo» enciende las etiquetas `ARREGLO n` y `NUEVO`.
- **Botón «Opciones» dentro de la pantalla (propuesta de producto):** la pantalla se personaliza con presets y se
  enciende función por función. En el producto real lo decidiría el líder por tienda (Configuración ▸ Tiendas y caja);
  el rol sigue mandando qué módulo se ve (ADR-0161).
- **«Qué ver» en Todos:** qué datos lleva cada fila (prendas, pagado y saldo, vence, estante, quién atendió, celular),
  con valores de fábrica y «Volver a lo de fábrica».

## Arreglos que el spike ya dibuja corregidos (vistos en las capturas de Felipe)

| # | Hoy | En el spike | Código a tocar |
|---|---|---|---|
| 1 | Dos líneas del ticket dicen «Test de Produto 2» sin color ni talla | Cada línea: color · talla · código | `components/apartados/ApartarVista.tsx:449` |
| 2 | «Código» vacío en la tarjeta de la prenda | Si no hay SKU, el código armado (`codigoPrenda`) | `ApartarVista.tsx:377` |
| 3 | En Entregar la prenda dice «· 1 u.» | Color · talla · código · cantidad | `components/apartados/EntregarVista.tsx:157` |
| 4 | El modal «Apartado registrado» corta sus botones cuando la pantalla es baja | Cuerpo con scroll y pie fijo | `components/apartados/ModalesApartado.tsx` |
| 5 | Aceptó un DNI de 9 dígitos | DNI de 8 dígitos y celular de 9 que empieza en 9, con aviso junto al campo | `ApartarVista.tsx` (paso clienta) |
| 6 | «S/0.00 en el cajón» en En custodia parecía plata faltante | «Anticipos: entran a ventas al entregar» | `components/apartados/TodosVista.tsx` |
| — | «Buscar apartado» en Apartar repetía la pestaña Entregar | Quitado | `ApartarVista.tsx:352` |

## Funciones nuevas (todas se encienden en «Opciones»)

| Función | Preset | Qué muestra el spike | Qué cuesta construirla |
|---|---|---|---|
| Clienta por DNI o celular | Recomendado | Busca en la ficha (D-76/D-77); si existe, llena sus datos y muestra el club, sus compras y su permiso de WhatsApp; si no, pide los datos y trae el nombre del padrón (ADR-0008) | Web + ligar `separaciones` a `clientas` (columna `clienta_id`): **migración** |
| Cámara QR en el celular | Recomendado | El escáner de Vender como primera tarjeta del paso 1; en Entregar se escanea el QR de la boleta y se abre el saldo | Solo web (`EscanerCamara` ya existe); el QR en la boleta toca la impresión |
| Abonos a cuenta | Recomendado | Interruptor «Puede abonar en partes» al apartar; en Entregar, «¿Viene solo a abonar?» → modal con su boleta de anticipo y la opción de extender 7 días | **Migración** (pagos intermedios y un anticipo SUNAT por abono; la boleta final descuenta todos) |
| Estante «Apartados» real | Recomendado | Lugar numerado (A-01…) al confirmar; sale en Entregar, en Todos y en la etiqueta | **Migración** (movimiento piso → sububicación «apartados», ADR-0199) |
| Recordar en lote | Recomendado | Aviso «N clientas por avisar hoy» → cola que abre WhatsApp una por una y marca a quién ya se le escribió | **Migración** chica (`ultimo_aviso_en` por apartado) |
| Editar un apartado abierto | Completo | Cambiar talla, quitar o sumar prendas; recalcula el saldo y, si ya pagó de más, la diferencia queda a su favor | **Migración** (una RPC que libere, aparte y recalcule todo o nada) |
| Apartar de otra sede | Completo | Si aquí no queda: «AQP tiene 2 → Apartar y traer de AQP»; el filtro «En camino»; Entregar espera a que llegue | Toca **Traslados** (otro módulo): decisión de varios módulos |
| Actividad del módulo | Completo | Panel lateral de quién apartó, abonó, avisó, extendió, liberó o devolvió | **Migración** según la receta del ADR-0207 (ya en BACKLOG) |

## Celular: las tres formas

1. **Pasos + barra fija (recomendada).** Prendas → clienta → adelanto, cada paso en la pantalla entera, y una barra
   negra fija con el total y el botón que sigue. En Entregar la barra dice el saldo y «Cobrar». Así nada queda enterrado
   bajo la búsqueda, que es el problema de hoy (`lg:grid-cols-[…_420px]` apila todo por debajo de 1024 px).
2. **Apilado + «Ver ticket».** Es el cambio más chico y copia la barra de Vender (`PuntoDeVenta.tsx:1390`), pero el
   formulario del adelanto sigue siendo largo.
3. **Pestañas abajo.** Queda cómodo para el pulgar, pero suma un segundo menú encima del cajón ☰ (ADR-0206) y el botón
   que guarda vuelve a quedar al final del contenido.

## Cómo apartan otros (investigación del 2026-09-26)

Leídos directo: Burlington, Lightspeed R-Series, la app de Shopify «Layaway: Reserve & Deposit», Square y el retiro con
QR de Oechsle. Odoo, Ripley, Falabella, Kmart y Walmart salen de resúmenes del buscador de páginas oficiales o de prensa;
Coppel y Elektra solo de blogs (poco confiable).

| Referente | Depósito mínimo | Plazo | Abonos | Si no recoge |
|---|---|---|---|---|
| Burlington (moda, EE. UU.) | Lo mayor entre $10 y 20 %, más $5 que no se devuelve | 30 días | Sí | Cargo de $10 y devuelve en crédito de tienda; pide DNI con foto para abrir, recoger y devolver; SMS antes de vencer |
| Lightspeed R-Series | Lo fija la tienda | Lo fija la tienda | Sí, se reabre y se suma | La reserva aparece en inventario como «Reservations»; exige clienta |
| Shopify POS + app de apartados | Opcional | Lo fija el comercio | Sí | Vence solo y repone el stock; correo antes de vencer; un tablero para varias tiendas |
| Square | % o monto | Fecha de la factura | Hasta 12 hitos | **No descuenta stock hasta el pago total** (no copiar) |
| Odoo POS | Libre | — | Varios anticipos | «Settle the order»: la boleta final descuenta todos los anticipos |
| Ripley / Falabella Perú | Pago total | 10 días / 3–5 días | No | Anula y devuelve por el mismo medio |
| Oechsle | Pago total | — | No | Recojo con QR y DNI; foto de la entrega |

**Lo que CAYLA toma:** sin clienta no hay apartado (Lightspeed); DNI también al entregar (Burlington, Oechsle); abonos
sobre el mismo apartado con una sola boleta final (Lightspeed, Odoo); avisar antes y liberar solo (Shopify); la reserva
visible en inventario (Lightspeed, la base del «estante real»); QR del apartado (Oechsle); precio congelado (Burlington);
plazo corto, porque 7 días está dentro de lo normal en Perú (Ripley y Falabella, de 3 a 10 días).

**Lo que no se copia:** cobrar por abrir o cancelar, o devolver en crédito de tienda (choca con el 100 % por
Yape/Plin/transferencia de CAYLA y en Perú pide revisión legal); descontar stock recién al pago total (el principio 2:
la misma prenda vendida dos veces); plazos de meses con cuotas obligatorias (en moda la temporada rota y el apartado se
vuelve crédito, con su cobranza).

## Lo que falta decidir (Felipe)

1. Qué forma de celular se implementa (el spike recomienda **Pasos + barra fija**).
2. Qué preset queda de fábrica (el spike propone **Recomendado**) y si «Opciones» vive en la pantalla o en
   Configuración ▸ Tiendas y caja, solo para el líder.
3. ~~Abonos y plazo~~: decidido (arriba).
4. Editar: si el nuevo total queda por debajo de lo pagado, ¿se devuelve la diferencia o queda como saldo a favor para
   su próxima compra? (hoy no existe el saldo de clienta: `venta_pagos.metodo` es un CHECK cerrado).
5. Apartar de otra sede toca Traslados: ¿el plazo corre desde que llega la prenda (propuesta) o desde que se apartó?

## Orden sugerido para construir

1. **PR solo web, sin migración:** los arreglos 1–6, la cámara QR y la forma de celular elegida. Se prueba a 375 px (PL-105).
2. Clienta por DNI o celular: espera el Paso 1 del club (Caja) para usar la misma búsqueda.
3. Abonos + estante real: una migración cada uno, con sus pruebas de Postgres (`scripts/pruebas/separaciones.mjs`).
4. Recordar en lote, actividad, editar y otra sede, en ese orden.

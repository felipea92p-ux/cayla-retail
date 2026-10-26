# ADR-0497 — Cuentas y dinero en El telar: tres caras por sede (frascos, burbujas y pares)

- **Fecha:** 2026-10-23
- **Estado:** aceptado. Felipe aprobó la lista de 7 actividades («aprueba a todos y que tenga en cuenta esa barra») y las
  decisiones D1–D5 y D7. D6 sigue esperando su OK.
- **Rama:** `claude/finanzas-dinero-maquetas-5ec52e`.
- **Relacionados:**
  - ADR-0493 (El telar: la barra común sobre la que se enchufa esta pantalla).
  - ADR-0195 F3/F4 (Cuentas y dinero, Por pagar, Conciliación).
  - ADR-0284 (guía de foco), ADR-0389 (guías interactivas).
  - ADR-0136 (movimiento: excepción de Finanzas en ADR-0493).
  - ADR-0169 y ADR-0336 (tokens y modo oscuro).
  - ADR-0433 (el alcance y la proyección de Finanzas, que no se tocan aquí).
- **Diagnóstico y maquetas:** `docs/maquetas/finanzas-v3-2026-10/dinero/` (README con 14 hallazgos; CONSTRUIR.md con la lista).

## El problema

Cuentas y dinero tenía cuatro pestañas («Cuentas», «Efectivo por tienda», «Por pagar», «Conciliación»). La auditoría del 23-oct encontró
cuatro problemas:
- **«¿Me alcanza?» mezclaba alcances.** Comparaba la proyección de toda la empresa con el efectivo de una sola sede.
- **Las cifras de Por pagar no filtraban**, aunque parecían botones.
- **Cada pestaña tenía su propio «Ver».** Con una sede elegida, «tienes» sumaba los bancos, que son de CAYLA entera.
- **El efectivo estaba repartido.** Vivía en dos pestañas que no se hablaban: el cajón en una y la caja fuerte en otra.

Felipe pidió que todo Finanzas pudiera separarse siempre por sede y eligió «El telar».

## Lo que se decidió

### 1. Tres caras en vez de cuatro pestañas

Cada cara es una ruta, para que los enlaces de Resumen, Impuestos, Balance y Confianza sigan funcionando:

| Cara | Ruta | Qué muestra |
|---|---|---|
| **Dónde está** | `/finanzas/dinero` | Cada cuenta es un frasco que se llena hasta su saldo, con la raíz cuadrada para que un cajón se vea al lado de un banco, en la repisa de su sede. |
| **Qué debes** | `/finanzas/dinero/por-pagar` | Cada factura es una burbuja del color de su sede y del tamaño de su saldo, en un calendario de 30 días. |
| **Cuadrar con el banco** | `/finanzas/dinero/conciliacion` | Cada línea que anotó CAYLA va junto a «¿está en el extracto?», unidas por un hilo que se vuelve verde al revisarla. |

**Efectivo por tienda se retira.** El frasco del cajón dice lo mismo que esa pestaña (`fn_efectivo_por_tienda`, la cuenta del cierre),
y la caja fuerte dice hace cuánto se depositó: en ámbar pasados 3 días. Su ruta solo redirige, con la sede que traía.

### 2. De quién es cada peso (D1–D4: con lo que la base ya trae, sin migración)

- El cajón y la caja fuerte son de su sede.
- Los bancos, lo entregado al líder (`por_rendir`) y la tarjeta de crédito son de CAYLA entera.
- Lo «por depositar» de las máquinas va aparte, «En camino», hasta que tenga sede (D1).

Con una sede elegida, «¿Cuánta plata tiene Trujillo hoy?» suma solo lo suyo. «¿Me alcanza?» lleva el chip «de CAYLA entera»: la
proyección por sede es de ADR-0433 y no se toca aquí. Una factura cuenta entera para la sede que la pidió (D3, decisión 45 de ADR-0387).
Cuadrar es solo de CAYLA entera (D4).

### 3. Cuadrar sin el extracto del banco (D5, opción a)

La base no guarda el estado de cuenta del banco: solo el saldo anotado (`conciliaciones`) y las líneas revisadas (`dinero_revisados`).
Los pares se dibujan con eso, sin migración. Subir el extracto (CSV o Excel) para que el sistema proponga cada pareja queda para otra obra.

### 4. Los filtros viven en la URL y filtran en el navegador

En «Qué debes», `?tramo=`, `?tipo=` y `?q=` filtran la lista que ya llegó, sin volver a la base ni abrir el loader. Cada filtro se ve
puesto (`FiltroPuesto`) y se quita; «Limpiar todo» los quita juntos. Lo escrito vive en el campo, y la URL guarda lo buscado sin espacios
sobrantes.

### 5. Enchufada a la barra común (ADR-0493)

- **Cabecera:** `EncabezadoPagina` con `RespuestaTelar`. Las preguntas son «¿Cuánta plata tienes hoy?», «¿Cuánto debes?» y «¿Cuánto
  dicen tus bancos?», cada una con sus chips.
- **Orillo:** el de la cara. Cuadrar no lleva, porque los bancos son de CAYLA entera.
- **Colores:** los tokens `--color-sede-*` en frascos, burbujas y repisas.
- **Dock:** Registrar movimiento (M), Dónde está (D), Qué debes (P) y Cuadrar (C, solo el líder). Desde otra cara, la M lleva a Dónde
  está con `?registrar=1`. La hoja se abre al montar la página: abierta desde el primer pintado, no dejaba hidratarla (medido).
- **«Te toca»:** suma lo vencido y lo de esta semana (frena), cada caja fuerte sin depositar y las líneas del banco sin revisar (avisan).
  Sale de `pendientesDeDinero`.
- **Sede:** el «Ver» propio se va; la sede se lee con `sedeDeLaUrl`.

### 6. Movimiento (D7, la excepción de Finanzas de ADR-0493)

Una sola vez y sin rebote:
- el líquido de los frascos sube;
- las burbujas caen a su fecha;
- el hilo de un par se dibuja verde al revisarlo.

Todo se apaga con `prefers-reduced-motion`.

## Lo que se descartó

- **Calcular la plata de cada sede en la pantalla** (por ejemplo, repartir los bancos por lo que vende cada tienda). Inventaría un
  dato: los bancos se dicen aparte, como de CAYLA entera.
- **Una migración para el extracto bancario ahora (D5 b).** Felipe la dejó para otra obra.
- **Una hoja propia para pagar varias facturas de distintos proveedores desde una cuenta (D6).** Mueve dinero de una forma nueva y espera
  el OK de Felipe; mientras tanto, la burbuja abre el pago de Compras o de Producción de siempre.

## Cómo se verifica

- Pruebas de las reglas: `lib/dinero-telar-reglas.test.ts`, `lib/que-debes-reglas.test.ts`, `lib/cuadrar-reglas.test.ts` (incluye la guía
  de foco cruzada contra `anotar()`) y `lib/dinero-te-toca-reglas.test.ts`.
- Navegador local, a 1440 y 375 px, en claro y en oscuro:
  - las tres caras con y sin sede;
  - los filtros puestos y quitados;
  - la burbuja que abre el pago;
  - «Sí, está» con un banco de prueba, que después se anuló y se archivó;
  - el dock y «Te toca» con la sede.

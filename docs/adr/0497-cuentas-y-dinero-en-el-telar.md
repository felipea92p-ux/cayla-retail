# ADR-0497 — Cuentas y dinero en El telar: tres caras por sede (cuentas, burbujas y pares)

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
| **Dónde está** | `/finanzas/dinero` | Un círculo reparte la plata entre las sedes y, debajo, una tarjeta por sede con cada cuenta y su saldo (nació como un frasco por cuenta; cambió el 2026-10-28, ver «Actualización 2026-10-28»). |
| **Qué debes** | `/finanzas/dinero/por-pagar` | Cada factura es una burbuja del color de su sede y del tamaño de su saldo, en un calendario de 30 días. |
| **Cuadrar con el banco** | `/finanzas/dinero/conciliacion` | Cada línea que anotó CAYLA va junto a «¿está en el extracto?», unidas por un hilo que se vuelve verde al revisarla. |

**Efectivo por tienda se retira.** La fila del cajón dice lo mismo que esa pestaña (`fn_efectivo_por_tienda`, la cuenta del cierre),
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
- las porciones del círculo de «Dónde está» se trazan en cascada (antes, el líquido de los frascos subía);
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

## Actualización 2026-10-28 — «Dónde está» deja los frascos

Felipe vio la pantalla con datos reales y la rechazó: los frascos con líquido son decoración y no sirven para gestionar. Pidió que se
presente como un informe de Anthropic o de Apple, con un gráfico circular o algo con estilo, y no como una lista aburrida.

**DECIDÍ:** «Dónde está» abre con un resumen (`RepartoDeDinero`): un círculo que es toda la plata de CAYLA, partido en los lugares donde está
(cada cuenta con saldo), con lo que hay al centro y, al lado, una leyenda con monto y porcentaje de cada una. Debajo, una tarjeta por sede
con una fila por cuenta (nombre, qué es, estado, saldo a la derecha y una barra fina de cuánto pesa). Los verdes son los bancos, los
terracotas las tiendas y la pizarra lo que viene en camino.

**DESCARTÉ:**
- **Seguir con los frascos.** El nivel salía de una raíz cuadrada, así que el dibujo mentía: S/ 500 parecía la mitad de un banco de
  S/ 18,000. Y lo que sí importa (qué es la cuenta, si lleva 12 días sin depositar, cuánto hay) quedaba en letra chica bajo el dibujo.
- **Solo la lista de filas.** Era correcta pero fría: no tenía una imagen que se lea de un vistazo.
- **Una sola tabla con subtotales.** Pierde la tarjeta por sede y los colores que la barra común ya usa. Queda como alternativa si
  Felipe prefiere un estado de cuenta.

**SE ROMPE SI:** una cuenta con saldo negativo es lo normal y no una anomalía (hoy «En camino» sale en negativo cuando se anotaron más
depósitos que ventas con tarjeta): un círculo reparte partes mayores que cero, así que lo negativo se dice aparte y el total lo resta.

**Cómo funciona:**
- El círculo está siempre, con todas las sedes y con una sola: con una sede reparte su cajón y su caja fuerte; con una sola cuenta con plata
  es un anillo entero («toda la plata está en un solo lugar») y sin ninguna, un anillo vacío que lo dice. Antes se escondía con menos de dos
  cuentas y Felipe, al cambiar a Lima, preguntó «¿no muestra el gráfico?» (2026-10-28): que un gráfico desaparezca al cambiar de sede confunde.
- La primera versión repartía por sede y «CAYLA entera» era una sola porción de casi todo el círculo (77 %). Felipe, viéndola con datos
  reales, pidió que el círculo fuera el todo y que cada parte se viera con color: ahora cada porción es una cuenta, así los bancos se
  ven uno por uno. Una cuenta que pesa menos de 1 % dice «<1 %» y no le quita un punto a otra.
- Los colores son tokens: verde y verde claro para los bancos, pareja de terracotas por tienda (en el orden de la lista de ubicaciones, así
  una tienda lleva los mismos tonos con todas las sedes que con una sola), pizarra para lo en camino. Seis colores de dato nuevos
  (`--color-reparto-*`, en claro y en oscuro) siguen el precedente de los de sede; la paleta oficial no cambia. El color de una cuenta no
  depende de su saldo: no cambia de un día a otro.
- Los porcentajes enteros suman 100 (método del mayor resto): tres tercios dan 33 + 33 + 34, no 99.
- Lo negativo no entra al círculo; «Tienes hoy» lo resta y coincide con la cabecera.
- La barra de cada fila es lineal contra la cuenta con más plata. La cifra va escrita al lado, así que ya no hace falta deformarla.
- Dentro de la tarjeta de una sede, el nombre pierde el lugar repetido: «Caja Operativa», no «Caja Operativa · Tienda AQP».
- Un saldo negativo se escribe siempre igual (por ejemplo `−S/ 24,000`, con el menos de verdad) en la fila y en el total del grupo.

**Piezas y reglas:** `lib/dinero-reparto-reglas.ts` (qué porción y qué color le toca a cada cuenta), `components/finanzas/dinero/RepartoDeDinero.tsx`
(el círculo y la leyenda; el único estado es qué porción se mira) y `components/finanzas/dinero/GruposDeCuentas.tsx` (las tarjetas).
Las barras son `BarraAvance` y los chips, `Chip`. Movimiento (ADR-0136, excepción de Finanzas, D7): las porciones se trazan una vez
y en cascada, sin rebote ni bucle, y se apagan con `prefers-reduced-motion`. Tampoco se ven con el `:hover` de CSS: la porción que se
destaca la elige el mouse en la leyenda.

**Tensión conocida con ADR-0358:** allí la dona de lo cobrado pasó a la barra apilada, y aquí vuelve un círculo. Es una decisión de Felipe
de este día, para el gráfico propio de este submódulo (ADR-0493); si quiere el mismo reparto como barra, es `BarraApilada`.

## Actualización 2026-10-28 (b) — «Empresa» y «Todas» no son lo mismo

**Decidí:** en «Dónde está», `?sede=empresa` mira solo lo que no es de ninguna sede (grupos `empresa` y `camino`: bancos, lo entregado al líder, lo que viene
en camino) y suma la deuda de la tarjeta de crédito; `?sede=todas` sigue siendo toda la plata, un grupo por sede, y la empresa es una de esas partes. El
mismo sentido que la barra común ya le daba a «Empresa» en Gastos (`soloEmpresa`) y en Por pagar. El grupo que se llamaba «CAYLA entera» pasa a llamarse
«Empresa» (el mismo nombre de su hilo en la barra); «CAYLA entera» queda para el total. «En camino» cuenta dentro de «Empresa»
(Felipe lo confirmó el 2026-10-28): con los datos de ese día, bancos y lo del líder más lo que las máquinas aún no depositan.

**Descarté:** dejar «Empresa» leída como «todas» porque «la empresa no tiene cajón». Es cierta la premisa y falsa la conclusión: no tiene cajón pero sí
cuentas, y las dos opciones de la barra mostraban lo mismo. También descarté la otra lectura de «Todas» (solo las sedes, sin los bancos): rompería que las
partes del orillo sumen el todo y que «Todas» sea el total que Gastos y el Resumen ya usan.

**Se rompe si:** una cuenta de la empresa lleva `ubicacion_id` de una sede (`grupoDe` la manda a su sede y «Empresa» no la ve), o si Felipe quiere que lo
«en camino» tenga sede (hoy cuenta en la empresa, igual que en el orillo): entonces `GRUPOS_DE_LA_EMPRESA` cambia en un solo lugar.

**Piezas:** `lib/dinero-telar-reglas.ts` (`GRUPOS_DE_LA_EMPRESA`, `gruposDelAlcance`, `cuentasDelAlcance`, `movimientosDeLaEmpresa`; `gruposDeDinero` acepta una
lista de grupos), `lib/dinero-reparto-reglas.ts` (`textosDelReparto`), `app/(app)/finanzas/dinero/page.tsx` y `CuentasPanel` (la tabla «A qué cuenta entra
cada cobro» es por sede y solo sale con «Todas»; la plata del dueño y lo que no dice su cuenta salen con «Todas» y con «Empresa»). El efectivo de hoy y los
cierres con diferencia son del cajón de una tienda y no se leen con «Empresa».


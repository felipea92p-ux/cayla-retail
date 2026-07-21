# Plan de trabajo CAYLA — para revisar juntos

> Escrito la noche del 2026-07-19 mientras Felipe descansaba. Es el mapa completo:
> dónde estamos, qué falta, en qué orden, quién hace cada cosa y por qué. En lenguaje
> de negocio, no de código. Léelo de arriba a abajo — al final está "por dónde empezar
> mañana".

---

## 1. Dónde está CAYLA hoy (lo que YA funciona en producción)

En pocos días, CAYLA pasó de un Excel con 2,368 errores a un sistema real con **10
mundos de trabajo**. Todo esto ya está vivo en `cayla-retail.vercel.app`:

| Mundo | Qué hace | Estado |
|---|---|---|
| **Inicio** | Panel del día del Líder (ventas de hoy, cajas, reponer, inventario a costo) y buscador protagonista para las Encargadas | ✅ |
| **Vender** | Abrir caja, registrar ventas, cerrar con conteo ciego, ventas del día | ✅ |
| **Inventario** | Catálogo agrupado por modelo, recibir mercadería, almacén con ubicaciones, compras, etiquetas de código de barras, proveedores | ✅ |
| **Producción** | El Taller: corte → confección → acabado, con receta de costo | ✅ |
| **Comercial** | Rotación por familia, sugerencias de compra, comparativo entre sedes, valor del inventario | ✅ |
| **Finanzas** | Estado de Resultados mensual, cuadre de efectivo, año vs año, patrimonio, y **los 4 estados financieros** (Balance, EERR, Flujo, Cambios en Patrimonio) | ✅ |
| **Búsqueda global** | Escribe o escanea con la Zebra: stock por sede + ubicación exacta en segundos | ✅ |
| **Selector de sede** | El Líder opera TRU, AQP, LIM o el Taller desde su cuenta | ✅ |
| **Identidad CAYLA** | Los tres colores, EB Garamond, el colibrí, sin sombras — nivel editorial | ✅ |
| **Ayudas (!)** | Cada concepto financiero se explica en tu idioma al tocarlo | ✅ |

**Debajo, lo invisible que importa:** 19 migraciones, stock blindado contra descuadres,
seguridad por sede en el servidor, y un modelo de lectura que arma los balances solos.

**La verdad honesta:** el sistema está **casi completo en software**, pero **casi vacío
de tu data real**. Es un auto de carrera con el tanque a medio llenar. Todo lo que sigue
es, sobre todo, llenar el tanque — no construir más motor.

---

## 2. Lo que quedó a medias (pendientes inmediatos, cortos)

Tres cosas están listas o casi, esperando un paso tuyo:

1. **Cargar los 292 proveedores** — el archivo limpio está en tu `Downloads/proveedores_carga.sql`.
   Ábrelo, cópialo, pégalo en el SQL Editor de Supabase, Run. (5 minutos.)
2. **Tu IME categorizado** — ya construí que tu IME (muebles, equipos, intangibles) se
   registre bien clasificado en Finanzas → Patrimonio. Falta que corras **una línea** de
   migración (te la doy) y yo subo el cambio. Hoy está hecho pero sin publicar, a
   propósito, para no romper nada.
3. **Alinear la taxonomía de categorías** — decidido por ti. Mi propuesta concreta está
   en la §4 de abajo. Es una conversación de 10 minutos y una migración.

---

## 3. El gran mapa: los 3 frentes que quedan

Todo lo pendiente cae en tres frentes. Este es el corazón del plan.

### 🅐 FRENTE 1 — Cargar el catálogo real *(el desbloqueo #1, todo depende de esto)*

**Por qué es lo más importante:** sin tus 300-900 prendas reales adentro, la inteligencia
comercial, los balances y las sugerencias de compra trabajan sobre datos de prueba. Cada
día que el catálogo real no está, el sistema no aprende tu rotación verdadera.

**Por qué NO se puede importar de golpe:** ya lo estudiamos — tu data de SINATRA es un
*registro de compras*, no un catálogo. No tiene SKU, ni tallas, ni colores. Meterla
crearía cientos de productos a medias. La forma correcta es **capturarlo bien una vez**.

**El plan de captura (para que no pare la venta) — ver §5 abajo.**

### 🅑 FRENTE 2 — Terminar la contabilidad *(de "muy bueno" a "nivel banco")*

Hoy tienes los 4 estados financieros, pero el Balance es aproximado en dos puntos. Para
cerrarlo:

- **Fase C2 — Cuentas por Pagar + IGV real.** Registrar lo que debes a proveedores
  (compras a crédito) y el IGV como lo que de verdad es (débito y crédito fiscal). Esto
  convierte el "Capital y aportes" grande de tu Balance en tu aporte real. *La pieza que
  más afina el Balance.*
- **Fase C3 — Flujo formal + cierre de mes.** El cierre que congela el período para que
  la historia no cambie, y el triple amarre verificado (utilidad → patrimonio → caja).
- **Fase C4 — Cumplimiento SUNAT.** Registro de Ventas y Compras en formato PLE. **Ojo:
  proyectas ~S/1.19M en 2026 = 72% del umbral de 300 UIT.** Cuando lo cruces, esto pasa
  de opcional a obligatorio. Mejor tenerlo listo antes.

### 🅒 FRENTE 3 — Formalización y crecimiento *(cuando lo anterior ruede)*

- **Boleta electrónica SUNAT** con tu Epson TM-T20III (necesita cuenta Nubefact — trámite tuyo).
- **Fotos del catálogo** (ya está el soporte; se llena al cargar productos).
- **Asistencia / DO** — tus archivos "DynamicTime" de personal. Hoy fuera de alcance;
  es otro módulo (marcaje, tardanzas, rangos). A decidir si entra.

---

## 4. Propuesta concreta: la taxonomía alineada a lo que VENDES

Estudié tus categorías reales del registro de compras. Hoy el sistema tiene 30 categorías
"de manual"; tú vendes otras. Esta es mi propuesta para que el sistema hable tu idioma.

**Tus categorías más usadas (con # de compras reales):**
Polos & Tops (429) · Complementos (412) · Blusas & Camisas (177) · Jeans (120) ·
Conjuntos (119) · Faldas & Shorts (116) · Chompas & Poleras (114) · Vestidos & Enterizos
(108) · Pantalones (95) · Casacas & Abrigos (95) · Chaleco (66) · Body (51) · Bisutería (25).

**Hallazgo #1:** tu "Complementos" (412 compras — ¡la segunda más grande!) son
mayormente **bisutería** (aretes, anillos, collares). La bisutería NO es un rubro menor
para ti: es enorme. El sistema debe reflejarlo.

**Hallazgo #2:** en tu data **no aparece calzado**. Las categorías de zapatos que tiene
el sistema hoy están vacías. No estorban, pero confirman que tu fuerte es indumentaria +
bisutería.

**Categorías a AGREGAR (indumentaria) — hoy no existen y tú las vendes mucho:**
- **Conjuntos** (119 compras) — dos piezas.
- **Enterizos** — hoy van pegados a Vestidos; merecen separarse.
- **Chalecos** (66 compras).
- **Bodys** (51 compras).
- **Blazers / Sacos** — los juntaría en una.

**Categorías que se mantienen** (ya calzan): Blusas, Camisas, Polos/Camisetas, Tops,
Chompas, Poleras/Sudaderas, Vestidos, Faldas, Shorts/Bermudas, Pantalones, Jeans,
Casacas/Chaquetas, Abrigos + toda la Bisutería (Pulseras/Aretes/Anillos/Collares) y
Accesorios (Bufandas/Chalinas, Carteras/Bolsos).

> **Decisión para ti (mañana, 10 min):** ¿apruebo esta lista y agrego las 5 categorías
> nuevas (Conjuntos, Enterizos, Chalecos, Bodys, Blazers/Sacos)? Con tu sí, preparo la
> migración y queda.

---

## 5. Plan de captura del catálogo real (el trabajo físico, sin parar la venta)

Esto es lo único que depende de tu equipo, no de mí. Diseñado para no cerrar tienda:

**Idea base:** el catálogo se llena **a medida que recibes** los fardos, con el formulario
de "Recibir mercadería" que ya pide todo (categoría, talla, color, costo, precio, ubicación).
No es un evento único de "parar todo y contar 900 prendas"; es un ritmo.

**Orden sugerido, por semana:**
1. **Semana 1 — arranque con lo que llega.** Cada fardo nuevo que entra esta semana se
   recibe por el sistema, completo. Así el catálogo empieza a existir con lo más fresco
   (lo que más rota).
2. **Semana 1-2 — las estrellas primero.** El equipo etiqueta y registra las prendas de
   mayor movimiento de cada tienda (las clase A). Son pocas y son el 80% de la venta.
3. **Semana 2-3 — barrido por familia.** Una familia por día (hoy blusas, mañana jeans…),
   dividido entre las Encargadas en horas de poca clienta. La foto se toma con el celular
   en el momento.
4. **Semana 3-4 — el resto y el conteo de cierre.** Lo que quede, y un conteo físico que
   fija el stock real de arranque. Desde ahí, el stock del sistema es la verdad.

**Lo que yo preparo para esto:** una guía imprimible paso a paso para las Encargadas (que
cualquiera pueda seguir sin que le expliquen), y si hace falta, ajustes al formulario para
que capturar sea aún más rápido.

**La regla de oro que hay que grabar en el equipo:** *lo que entra, se registra al
entrar; lo que se deposita, se registra al depositar.* El sistema solo es tan verdadero
como lo que se le cuenta el día que pasa.

---

## 6. Quién hace qué (para que quede claro)

| Lo hago YO (sin que pares) | Lo haces TÚ (o el equipo) |
|---|---|
| Alinear la taxonomía (con tu OK) | Correr las migraciones en Supabase (pegar y Run) |
| Construir C2, C3, C4 | Contar el catálogo físico real |
| La guía de captura imprimible | Decidir prioridades y aprobar lo estructural |
| Cargar/limpiar la data que me pases | Abrir la cuenta Nubefact (para boleta SUNAT) |
| Arreglar y afinar lo que uses en vivo | Revisar los 3 RUC en conflicto de proveedores |

---

## 7. Por dónde empezar mañana (mi recomendación)

En orden, del más rápido y desbloqueante al más grande:

1. **Corre los 292 proveedores** (`Downloads/proveedores_carga.sql`). 5 min. Valor
   inmediato: directorio real listo para asociar al recibir.
2. **Aprueba la taxonomía** (§4) — dime sí a las 5 categorías nuevas, o ajústalas. 10 min.
   Yo preparo la migración.
3. **Corre la migración del IME** (una línea) para que suba tu Patrimonio categorizado.
4. **Arranca el plan de captura del catálogo** (§5) — el desbloqueo #1. Te entrego la guía
   imprimible y empezamos con lo que reciba esta semana.
5. **En paralelo, yo construyo la Fase C2** (Cuentas por Pagar + IGV real), que es lo que
   lleva tu Balance a nivel banco — no depende de que cuentes nada.

**La objeción honesta, una vez más:** todo lo que construyamos de aquí en adelante rinde
el doble cuando el catálogo real esté adentro. Si tuviera que elegir UNA cosa para las
próximas dos semanas, es esa. El resto es afinar un motor que ya está armado.

---

*Este plan es un documento vivo. Se ajusta con lo que decidas mañana.*

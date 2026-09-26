# `docs/datos` — la base de datos de CAYLA, documentada

> **Qué es esto:** el único lugar donde está escrito qué guarda CAYLA, cómo, y por
> qué. Cubre los dos sistemas — `cayla-retail` (tiendas, taller, plata) y
> `cayla-dynamic` (personal) — porque comparten la misma base de datos en producción
> y documentar uno solo es documentar media verdad.
>
> **Para quién:** para las personas que escriben código en este repo, y para los
> agentes de IA que trabajan en él. No es material para el contador ni para tienda:
> ellos reciben reportes, no documentación de base de datos.

---

## La regla de oro

> **Una migración no está terminada hasta que su tabla está en el diccionario.**

Si esa regla se rompe dos veces seguidas, este directorio se convierte en lo que ya
pasó antes: tres documentos que dan tres números distintos de cuántas tablas tiene
CAYLA. Por eso la mitad de esto se genera solo.

---

## Cómo está armado

Este directorio tiene **dos mitades, y funcionan distinto**:

**La mitad que se genera sola.** Sale de la base de datos con un script. Nadie la
escribe a mano, nadie la corrige a mano. Si dice algo raro, es porque la base dice
algo raro. Es toda la carpeta `generado/`.

**La mitad que se escribe a mano.** Explica el *porqué*: qué problema resuelve cada
módulo, qué se rompe sin él, qué decisión de negocio hay detrás. Cambia poco, porque
las razones cambian menos que las columnas. Es todo lo demás.

Mezclar las dos mitades es lo que mata a este tipo de documento: alguien escribe a
mano una lista de columnas, la lista envejece, y a los dos meses nadie le cree a nada
del archivo — ni siquiera a la parte que sigue siendo cierta.

---

## Los archivos

### Empieza por aquí

| Archivo | Qué responde | Cuándo lo abres |
|---|---|---|
| **[`00-MAPA.md`](00-MAPA.md)** | ¿Cómo está armado todo esto? | Primer día. Si solo lees uno, que sea este |
| **[`01-INVARIANTES.md`](01-INVARIANTES.md)** | ¿Qué cosas la base impide que pasen? | Antes de tocar cualquier tabla |
| **[`12-ONBOARDING.md`](12-ONBOARDING.md)** | ¿Qué hago mi primer día? | Primer día, después del mapa |

### Referencia (generada, siempre al día)

Todo esto vive en [`generado/`](generado/) y **nadie lo edita a mano**.

> **De dónde salió la foto de hoy.** El diccionario describe **la producción real**:
> 45 tablas y 2 vistas en `retail`, leídas el 2026-09-12. Cada archivo generado dice en
> su cabecera de qué base salió y cuándo. Para refrescarlo ver
> [`generado/COMO-REFRESCAR.md`](generado/COMO-REFRESCAR.md).

| Archivo | Qué responde |
|---|---|
| **[`generado/DICCIONARIO-RETAIL.md`](generado/DICCIONARIO-RETAIL.md)** | Campo por campo, las tablas de tienda, taller y plata. Tipo, si acepta vacío, valor por defecto, candados, quién puede qué |
| **[`generado/DICCIONARIO-DYNAMIC.md`](generado/DICCIONARIO-DYNAMIC.md)** | Lo mismo para el sistema de personas |
| **[`generado/RPCS.md`](generado/RPCS.md)** | Las funciones que escriben en la base: firma exacta, si corren como dueño, y aviso si alguna tiene dos firmas vivas |
| **[`generado/AVIARIO.md`](generado/AVIARIO.md)** | De qué pájaro es cada tabla: tienes un nombre de tabla, quieres saber a quién preguntarle. Sale de `scripts/datos/aviario.mjs` y CI falla si una tabla de producción queda sin pájaro |
| **[`generado/DRIFT.md`](generado/DRIFT.md)** | Qué pantallas están rotas en las tiendas ahora mismo porque llaman a una función con parámetros que allá no existen |
| **[`generado/glosario.json`](generado/glosario.json)** | **Lo único editable a mano de esta carpeta:** la explicación de cada columna. El generador la respeta |

### Los 14 módulos

Un archivo por módulo en [`modulos/`](modulos/), cada uno con su pájaro dueño, su
diagrama, sus tablas campo por campo y sus huecos conocidos.

| | | | |
|---|---|---|---|
| [01 · Ganso — Identidad y acceso](modulos/01-identidad-y-acceso.md) | [02 · Loro — Catálogo](modulos/02-catalogo-y-vocabulario.md) | [03 · Tucán — Taxonomía](modulos/03-taxonomia-universal.md) | [04 · Golondrina — Importación](modulos/04-importacion-de-catalogo.md) |
| [**05 · Halcón — Inventario**](modulos/05-inventario-y-movimientos.md) | [06 · Lechuza — Conteo](modulos/06-conteo-y-censo.md) | [07 · Colibrí — Ventas y caja](modulos/07-ventas-y-caja.md) | [08 · Cuervo — Facturación](modulos/08-facturacion-sunat.md) |
| [09 · Pelícano — Compras](modulos/09-compras-y-proveedores.md) | [10 · Gallito — Producción](modulos/10-produccion-del-taller.md) | [11 · Garza — Finanzas](modulos/11-finanzas-operativas.md) | [12 · Urraca — Contabilidad](modulos/12-contabilidad.md) |
| [13 · Águila — Inteligencia](modulos/13-inteligencia-y-reportes.md) | [14 · Gorrión — Plataforma](modulos/14-plataforma-y-esquema.md) | | |

### Lo transversal

| Archivo | Qué responde |
|---|---|
| **[`05-SEGURIDAD.md`](05-SEGURIDAD.md)** | Quién ve qué y quién puede escribir qué, tabla por tabla |
| **[`06-DATOS-PERSONALES.md`](06-DATOS-PERSONALES.md)** | Qué datos de personas guarda CAYLA, cuánto tiempo, y qué hacer si alguien pide que los borren |
| **[`07-GOBIERNO.md`](07-GOBIERNO.md)** | Los pájaros, los cuatro niveles de permiso, y qué hay que hacer antes de cambiar el esquema |
| **[`08-OPERACION.md`](08-OPERACION.md)** | Los entornos, los respaldos, y cómo se aplica un cambio a las tiendas sin romper nada |
| **[`09-CONTRATOS.md`](09-CONTRATOS.md)** | Qué le promete cada módulo a los demás — incluidas las promesas que hoy están rotas |
| **[`10-ROADMAP-DATOS.md`](10-ROADMAP-DATOS.md)** | Qué falta construir y qué tablas exigiría cada cosa |
| **[`11-KPIS.md`](11-KPIS.md)** | Cada número del negocio y de qué columna depende |
| **[`13-PROMESAS-INCUMPLIDAS.md`](13-PROMESAS-INCUMPLIDAS.md)** | Las 20 cosas que la documentación de CAYLA promete y la base no cumple |
| **[`14-DYNAMIC.md`](14-DYNAMIC.md)** | El otro sistema, y exactamente dónde está la frontera entre los dos |
| **[`consultas/`](consultas/)** | Consultas de solo lectura para pegar en el SQL Editor de producción y medir la tienda real; hoy, el termómetro semanal de Frescura ([`frescura-termometro.sql`](consultas/frescura-termometro.sql)) con su rutina de los lunes |

### El acta

**[`DECISIONES-2026-09-12.md`](DECISIONES-2026-09-12.md)** — las 52 decisiones de
Felipe que gobiernan todo lo anterior. **Manda sobre el resto de este directorio.**
Si una decisión cambia, se corrige ahí primero y después se propaga.

---

## Cómo se mantiene

**La mitad generada** se regenera con un comando:

```bash
pnpm datos:generar:produccion
```

Lee el volcado de producción guardado en `generado/retail_*.json` y reescribe los
diccionarios y `RPCS.md`. Se corre cada vez que cambia el esquema **de producción**, después
de refrescar el volcado como explica [`generado/COMO-REFRESCAR.md`](generado/COMO-REFRESCAR.md).

> `pnpm datos:generar` (sin `:produccion`) existe, pero lee el Postgres **local** por Docker y
> pisa estos archivos con la foto de tu máquina — que es exactamente la mentira que este
> directorio vino a matar. Úsalo solo para mirar un diff, y revierte con
> `git checkout -- docs/datos/generado/` antes de commitear.

**La comparación entre lo que las pantallas llaman y lo que producción acepta** — la que
detecta que algo está roto en las tiendas sin que nada falle en tu máquina:

```bash
pnpm datos:comparar
```

Sale con código 1 si encuentra una llamada que la foto de producción no respalda, así
que sirve como alarma automática (D-19). No es lo mismo que «pantalla rota»: la foto
puede estar vieja (el informe dice de cuándo es). Los dos casos que motivaron la
herramienta fueron registrar un gasto y recibir mercadería ligada a una producción.

**La mitad escrita a mano** se actualiza cuando cambia el *porqué*, no cuando cambia
una columna. En la práctica: cuando se agrega un módulo, cuando se cierra un hueco
conocido, o cuando una decisión del acta deja de ser cierta.

---

## Qué NO va aquí

- **El estado del día a día** → `docs/BACKLOG.md` y `docs/BITACORA.md`.
- **El porqué de una decisión puntual** → `docs/adr/`.
- **El mapa de rutas, componentes y librerías del front** → `docs/ARQUITECTURA.md`.
  ⚠️ Ese archivo es una foto del 2026-09-04 y hoy tiene afirmaciones que el SQL no
  respalda; las que encontramos están listadas en `13-PROMESAS-INCUMPLIDAS.md`.
- **Contenido en la memoria de Claude.** La memoria guarda solo punteros a este
  directorio, nunca copias de lo que dice. Una copia en memoria es una tercera versión
  de la verdad esperando a desincronizarse.

---

*Creado el 2026-09-12. La estructura sale de lo que hacen bien SAP (una referencia
exhaustiva que nadie lee entera pero todos consultan), Odoo (documentación organizada
por módulo funcional, no por tabla) y Oracle Fusion (invariantes y contratos
explícitos), dimensionado a un equipo de seis personas y no a una corporación.*

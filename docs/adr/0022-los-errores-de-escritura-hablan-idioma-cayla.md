# ADR-0022 — Los errores de escritura hablan idioma CAYLA (y los que ya lo hacían, no se tocan)

**Fecha:** 2026-09-09
**Estado:** Aplicado en el camino de venta (Vender · Abrir caja · Cerrar caja); el resto migra
pantalla por pantalla.
**Deriva de:** ADR-0021 y el commit `dcc2f37`, que resolvieron lo mismo del lado de la **lectura**.
**Afecta:** `apps/web/lib/error-escritura.ts` (nuevo), `RegistrarVentaModal`, `AbrirCajaModal`,
`CerrarCajaModal`.

## Contexto

El apartado D del documento *el estándar, los doce y el camino* mide una dimensión que ninguna
ficha comercial trae: **facilidad de aprendizaje** — minutos hasta que una persona nueva vende
sola. Square, Loyverse e INVY sacan 5/5 ahí. INVY, además, está marcado en ese mismo documento
como *"nuestro competidor"*.

Al auditar el camino de venta contra esa vara apareció una asimetría que no se había visto:

`lib/resultado.ts` (2026-09-09) arregló los errores de **lectura** y dejó la regla escrita —
los mensajes se muestran *"sin jerga de Postgres, que no le sirve de nada y la asusta"*. Pero
ese archivo solo cubre `select`. Del lado de la **escritura** no había equivalente: **29
llamadas en 17 componentes** hacían `setError(error.message)` con el texto crudo de
Postgres/PostgREST. En la pantalla de más presión del sistema —`RegistrarVentaModal.tsx:96`,
con la clienta en el mostrador— lo que se leía era:

```
new row for relation "stock" violates check constraint "stock_cantidad_no_negativa"
```

La única traducción que existía en todo el repo era un caso suelto en
`RecibirLoteForm.tsx:461-463` (el de `productos_sku_padre_key`) — y tenía la mejor idea del
asunto: no solo decía qué falló, decía **a dónde ir en vez de**.

## Decisión

**Un traductor, `apps/web/lib/error-escritura.ts`, hermano de `lib/resultado.ts`**, con una
sola función: `traducirError(error, contexto)`. Lo que lo define no es lo que traduce, sino lo
que decide **no** tocar:

1. **No re-traduce lo que las RPC ya dicen bien.** Las funciones del repo levantan sus errores
   en castellano de CAYLA —*"Esta caja ya está cerrada — no se pueden registrar más ventas
   ahí"*, *"No tienes permiso para vender en esa caja"*— y Postgres los devuelve con
   `code = 'P0001'`. Esos pasan palabra por palabra. Reescribirlos alejaría el mensaje de la
   regla de negocio que lo produjo y dejaría **dos textos que se pueden desincronizar**, que es
   exactamente la falla que este repo ya evitó al no duplicar las reglas de RLS (ADR-0018).

2. **Sí traduce lo que Postgres escribe por su cuenta:** violaciones de `check`, de índice
   único, de RLS y de llave foránea. Son las redes de seguridad del esquema (principio 2), y
   cuando saltan siempre existe una frase humana equivalente — porque sabemos con precisión qué
   estado imposible estaban impidiendo. La huella que se busca es el **nombre real de la
   restricción** (`stock_cantidad_no_negativa`, `cajas_sede_abierta_unique`), no una palabra
   suelta del mensaje: esos nombres los elegimos nosotros y no cambian con la versión de
   Postgres.

3. **Lo que no reconoce, no se lo traga.** Cae a un mensaje honesto con el texto original detrás
   de *"Código:"*, igual que `app/(app)/error.tsx` hace con `error.digest`. Un error escondido
   es peor que uno feo: si mañana aparece una huella nueva, queremos verla para agregarla.

4. **Se aplica pantalla por pantalla, no de un saque.** En este paso solo el camino de venta.
   Es la misma regla que el BACKLOG ya fijó para la migración de los campos viejos: un cambio
   mecánico sobre 17 componentes que nadie puede probar a la vez es cómo se rompen cosas en
   silencio.

## Consecuencias

- Queda una **prueba por huella** (`lib/error-escritura.test.ts`, 9 casos). Es el único lugar
  del repo donde un renombre de restricción en una migración se nota sin abrir el navegador: si
  alguien renombra `stock_cantidad_no_negativa` y no toca la lista, el error vuelve a salir en
  inglés y nadie se entera hasta que una Encargada lo lee en el mostrador.
- El traductor **no sustituye a la validación previa**. En el modal de venta, la cantidad se
  topa contra el stock de la sede **antes** de llamar a la RPC: traducir bien un error es el
  último recurso, no el primero.
- Los otros 14 componentes siguen mostrando el texto crudo. Anotado en BACKLOG.
- `CerrarCajaModal` perdió su cadena `error?.message ?? "No se pudo cerrar la caja"`: el
  traductor devuelve esa misma frase cuando el error viene nulo, así que el comportamiento no
  cambió, solo dejó de estar escrito dos veces.

# ADR-0683 — Empresas aliadas: se crean, se editan y se dan de baja desde Configuración

- **Fecha:** 2026-11-21 · **Decidió:** Felipe · **Estado:** actividad 1 de 8 construida y probada en local; la migración `20261121152000` **no está en producción** (se pega con las de las actividades 2 a 7: sola, una aliada nueva rompería el Balance con su primera venta).
- **Relacionados:** ADR-0463 (empresas CAYLA y CLAURE), ADR-0505 (CLAURE solo en Lima), ADR-0542 (stock por dueño), ADR-0558 / ADR-0560 / ADR-0638 (la cuenta con Claudia y su Yape), ADR-0008 (padrón).
- **Investigación y maqueta:** `docs/investigacion/2026-11-21-empresas-aliadas-y-boleta-por-ruc.md`, `docs/maquetas/empresas-aliadas-2026-11/`.

## El problema primero

Una empresa que no es CAYLA pero vende en sus tiendas (hoy CLAURE en Lima) solo podía nacer con una migración. Felipe quiere poder sumar otra
(por ejemplo, una futura CAYLA KIDS en Trujillo) él mismo, «y que no me dé problemas cuando haga ventas»; también poder borrarla, con doble
confirmación y una semana de plazo.

## Lo que se decidió

1. **Se llaman «empresas aliadas»** (Felipe): otro negocio que trabaja junto a CAYLA. «Ramas» decía lo contrario (que son parte de CAYLA).
2. **Dónde (opción D, Felipe):** la banda de CAYLA sigue como está, arriba y de solo lectura; debajo, «Empresas aliadas» con una tarjeta por
   empresa y el botón «Agregar empresa aliada» solo ahí, a un lado del título. Las tiendas no muestran quién vende en ellas (Felipe: «Nada»).
3. **Qué se guarda:** nombre, RUC (módulo 11 de SUNAT, único, nunca el de CAYLA), razón social (del padrón o a mano), régimen, tiendas, y como
   opcionales correo, teléfono y **cuentas para cobrar** (Yape, Plin o cuenta bancaria; varias). Nunca la clave SOL.
4. **Una sola función guarda todo** (`guardar_empresa_aliada`, solo el Admin): datos, tiendas y cuentas en una transacción.
5. **Sus cuentas son de su empresa** (banco 104, saldo 0, como el Yape de Claudia): no suman a CAYLA. `cuentas_dinero.medio_ajeno` dice con qué
   se le paga en cada una.
6. **Al sumar una aliada a una tienda sin filas en `empresa_sedes`, se escribe también la de CAYLA**: si no, `fn_empresas_de_sede` dejaba de
   ver a la casa en esa tienda.
7. **Un Nuevo RUS va a una sola tienda** (el régimen opera en un establecimiento; confirmar con el contador, relajarlo es una línea).
8. **La baja (Felipe: doble confirmación y una semana):** «Dar de baja» en su hoja → una segunda hoja donde se escribe su nombre → queda para
   dentro de 7 días y se deshace desde su tarjeta. Pasada la semana, el trabajo diario `/api/empresas/bajas` (3:50 de Lima) la aplica:
   - **sin historia** (ni prendas ni movimientos, y nada la apunta): se borra de verdad, con sus tiendas y cuentas;
   - **con historia:** deja de estar activa y sus cuentas se archivan; lo que vendió y su cuenta pasada se quedan;
   - **con prendas en una tienda:** no se pide (ni se aplica), y su tarjeta dice por qué.
   Registrar otra vez el RUC de una dada de baja la trae de vuelta con su historia.

DECIDÍ «dar de baja» con borrado real solo si nunca tuvo historia.
DESCARTÉ borrar siempre (lo que se pidió al pie de la letra): una aliada con ventas dejaría sus líneas, movimientos y pagos apuntando a nada, y
los meses ya cerrados cambiarían de cifra (CLAUDE.md: nunca se borran datos con historia).
SE ROMPE SI una función que decide «¿esto es de una aliada?» pregunta `activo`: al darla de baja, su pasado volvería a contarse como de CAYLA.
Hoy `fn_item_es_de_claure` lo pregunta; la actividad 2 lo quita (la regla mira la fecha de su cuenta, no si sigue activa).

DECIDÍ un trabajo diario de Vercel para aplicar las bajas.
DESCARTÉ calcular «activa» en cada lectura: decenas de funciones leen `empresas.activo` y habría que tocarlas todas.
SE ROMPE SI el cron no corre: la aliada sigue vendiendo hasta la próxima corrida; no se pierde nada (la baja sigue anotada).

## Las 8 actividades (aprobadas por Felipe el 2026-11-21)

1. **Crear, editar y dar de baja una aliada desde Configuración** — esta.
2. Que el Balance y el Diario no se rompan con cualquier aliada (hoy la reclasificación es solo de CLAURE).
3. La cuenta con cada dueña (deuda, pagos, efectivo al cierre), una por aliada; la baja exigirá su saldo en cero.
4. Vender con cualquier aliada: cobro partido por dueña y su propio Yape o cuenta.
5. Campañas y reparto de gastos por aliada.
6. Las cifras de CAYLA sin ninguna aliada (Inicio, metas, Rendimiento, Club, Análisis, Impuestos).
7. Filtros por empresa en toda tienda con más de una (Productos, Existencias, Historial, Comprobantes, Pedidos web, Reportes).
8. Producción (Felipe pega las migraciones en orden), y el PR.

## Verificación

- `pnpm pruebas:empresas-aliadas` — 35/35 en Postgres local (cada caso en su transacción, con ROLLBACK).
- `lib/empresas-aliadas-reglas.test.ts` — 16/16; la guía de foco coincide con la validación.
- En el navegador (local, cuenta Admin del seed): crear una aliada en Trujillo con su Yape, verla en su tarjeta, pedir la baja escribiendo su
  nombre, ver «Se da de baja el 28-nov» y deshacerla. Claro, oscuro y 375 px.
- Toda la suite de `apps/web` en verde con las guías y la huella de Configuración al día; Knip limpio.
- **No verificado:** producción; el cron en Vercel; una aliada con historia dada de baja de punta a punta en la pantalla (sí en las pruebas de la base).

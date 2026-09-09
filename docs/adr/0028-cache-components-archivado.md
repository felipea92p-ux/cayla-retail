# ADR-0028 — Cache Components se archiva: el menú depende del rol

**Fecha:** 2026-09-09
**Estado:** Archivado (no aplazado) — se intentó de verdad y se decidió no hacerlo
**Cierra:** la Fase 1b de ADR-0013 y el ítem de `cacheComponents` del backlog

## Contexto

`cacheComponents` era la última pieza pendiente del trabajo de rendimiento: prometía que el
armazón —navegación y cabecera— apareciera al instante mientras los datos entran por
streaming. Se había aplazado dos veces por tener otras sesiones editando el mismo árbol.
Con el árbol quieto se intentó **de verdad**: flag activado, codemod oficial corrido, build
ejecutado.

### Lo que resultó no ser problema

Varias preocupaciones anotadas por la mañana se cayeron al medirlas:

| Preocupación | Realidad |
|---|---|
| Migrar `dynamic` / `revalidate` / `fetchCache` | **0 casos** en el repo |
| Convertir `unstable_cache` a `use cache` | **0 casos** |
| Rutas sin `<Suspense>` | **13 pantallas ya lo tenían** (trabajo del mismo día, ADR-0021) |
| El codemod `cache-components-instant-false` | 27 rutas, **0 errores** |

También apareció un arreglo legítimo por el camino: `/almacen` y `/almacen/recibir` eran
páginas de React que solo llamaban a `redirect()` —pantallas que no dibujan nada— y con
Cache Components eso rompe el prerender. Un alias de ruta pertenece a la config, no al árbol
de páginas. **Ese cambio queda pendiente aparte, no entró con esta reversión.**

### El impedimento real

El build siguió fallando incluso en pantallas que **sí** tenían `<Suspense>`. La causa está
en `components/AppShell.tsx`:

```
línea 328:  const esLider = persona.rol === "lider";
línea 330:  const esTaller = persona.sedeTipo === "fabrica";
```

**La navegación depende del rol.** Comercial y Finanzas solo se dibujan para el Líder; el
Taller ve lo suyo. Un armazón prerenderizado, por definición, no puede contener un menú
cuyo contenido cambia según quién mira.

Ese es el nudo, y es de diseño de producto, no de código: como el layout tiene que leer
cookies para saber qué enlaces poner, **bloquea la ruta entera por más `<Suspense>` que se
le agregue a cada página.** El trabajo por página no compra nada mientras eso siga así.

## Decisión

**Se archiva.** No se aplaza: se intentó con el árbol quieto y el flag activado, y la
conclusión es que no conviene con esta forma de navegación.

Las tres salidas posibles y por qué ninguna paga:

| Salida | Costo |
|---|---|
| El menú muestra todo a todos y el servidor bloquea al entrar | Una Encargada vería "Finanzas" sin poder abrirla — regresión de UX para la usuaria principal |
| Transmitir el menú por streaming | El armazón estático queda en el logo y poco más: casi ningún valor |
| Rediseñar la navegación para que no dependa del rol | Rehacer el riel del lateral (ADR-0014), del mismo día, por una ganancia sin medir |

Y el contexto que lo cierra, todo medido el mismo día:

- El **streaming dio cero** en tiempo (ADR-0021): TTFB 131→124 ms, carga 750→730 ms.
- La **caché del router ya entrega 6-7 ms** en pantalla repetida.
- El armazón hoy llega en **124 ms**.

Cache Components costaría ~28 archivos, rediseñar la navegación y revisar 7 modales, para
ganar sobre un armazón que ya llega en 124 ms y una navegación repetida que ya es
instantánea. **La relación no existe.**

## Consecuencias

- El repo se queda sin `cacheComponents` y sin PPR. `staleTimes` sigue siendo la pieza de
  rendimiento que sí paga.
- **Si algún día la navegación deja de depender del rol** —porque el producto lo pida, no
  porque lo pida el rendimiento— esta decisión se revisa. Ese es el único disparador.
- Queda escrito el intento, no solo la conclusión: la próxima persona que lea "PPR haría
  esto más rápido" encuentra acá que se probó, dónde exactamente se detuvo, y con qué
  números se decidió. Evita repetir un experimento de un día entero.

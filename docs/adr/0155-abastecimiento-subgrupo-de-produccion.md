# ADR-0155 — Producción vuelve a caber en el tope: Abastecimiento es un SUBGRUPO, no cuatro filas sueltas

**Fecha:** 2026-09-21
**Estado:** Aceptado e implementado. Verificado con `tsc --noEmit` y `eslint` limpios en todo el repo, la suite completa
(2546 pruebas) y una vuelta manual en el navegador (perfil líder-Taller y colaborador-Taller) sobre `lib/menu.ts` real,
sin base de datos (andamio temporal bajo `/login`, borrado al cerrar).
**Decide:** Felipe, con esta pieza (D-84, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`). Ese documento ya fija
el resultado exacto («Producción queda en Resumen, Órdenes, Insumos, Abastecimiento») y una condición de despliegue:
**se aplica cuando Felipe decida, nunca mientras el Taller está en turno** — este PR deja el cambio listo y sin
fusionar hasta esa señal.
**Afecta:** `apps/web/lib/menu.ts` (el árbol y `menuPara`), `apps/web/lib/produccion-menu.ts` y su prueba (contrato de
`hijosMenuProduccion`), `apps/web/lib/menu-hoy.golden.json` (regenerada a propósito), `apps/web/lib/menu.test.ts`
(invariantes recursivos + pruebas de Producción reescritas), `apps/web/components/AppShell.tsx` (el lateral y el cajón
plegado aprenden a pintar un grupo dentro de otro) y `apps/web/app/globals.css` (una regla de opacidad que se acotaba
de más).

## Contexto (verificado, 2026-09-21)

ADR-0144 dejó registrada una deuda con nombre: **Producción, vista por el líder parado en el Taller, cuenta 7 hijas**
(Resumen, Órdenes, Insumos, Proveedores, Comprobantes, Recibir, Por pagar) — por encima del tope de 6 por grupo que el
propio `menu.test.ts` hace cumplir. La rompió la fila «Resumen» (F6, #231), no el paso «menú a datos»; la excepción
vivía declarada y con fecha de caducidad: `EXCEPCIONES_TOPE_HIJAS = { produccion: 7 }` y una prueba «DEUDA: Producción
supera el tope…» que fallaba tanto si el grupo crecía como si bajaba a 6 sin quitar la excepción. El propio ADR-0144
ya señalaba el remedio: bajar Proveedores, Comprobantes, Recibir y Por pagar a un subgrupo, `produccion.abastecimiento`
— nodo que ya existía en el árbol, declarado `futura`, exactamente para esto.

## Decisión

**DECIDÍ:** las cuatro hijas de dinero/abastecimiento de Producción (Proveedores, Comprobantes, Recibir, Por pagar)
cuelgan ahora de un **subgrupo**, `produccion.abastecimiento` — mismo patrón que ya usa «Compras» (una cabecera que
agrupa, no una pantalla propia), un nivel más adentro. Producción queda con **4 hijas de primer nivel**: Resumen,
Órdenes, Insumos, Abastecimiento — con sitio de sobra (5 de 6) para cuando `produccion.eficiencia` (F7) esté lista.

Para que esto fuera posible sin romper el resto del árbol ni reescribir el lateral, el cambio de fondo es que **un
grupo (`Grupo` en `lib/menu.ts`) ahora puede tener, entre sus hijas, a OTRO grupo** — el tipo es recursivo
(`hijos: readonly (Hoja | Grupo | Futura)[]`) y `menuPara` lo arma con la MISMA función llamándose de nuevo
(`construirFila`), sin un caso especial para «un grupo dentro de otro». Tres piezas de esa recursión:

- **La regla de «una sola hija se disuelve» cambia según la profundidad.** Un grupo de primer nivel con una sola hija
  visible absorbe su etiqueta con el nombre del grupo (ya se comportaba así «Compras» o «Catálogo»: el módulo necesita
  un nombre estable aunque adentro quede una sola pantalla). Un SUBGRUPO no: su hija sube con su propio nombre, sin
  pasar por el del subgrupo. Por qué: quien no ve el dinero en el Taller (integrante, o líder mirando solo con
  `administrar`) se queda con una sola hija dentro de Abastecimiento — Recibir, que no exige dinero — y debe seguir
  leyendo «Recibir», no «Abastecimiento». El resultado es que, para ese perfil, Producción se ve **exactamente igual
  que antes de esta pieza** (Órdenes, Insumos, Recibir): la única fotografía que cambió en `menu-hoy.golden.json` es
  la de líder-Taller.
- **`hojasDe(fila)`** (nueva, exportada desde `lib/menu.ts`) baja hasta las pantallas de verdad sin importar cuántos
  subgrupos haya en el medio: la usan `menuPara` (sumar el número de la barra del celular y de una cabecera cerrada),
  `menu.test.ts` (para que los invariantes — ninguna ruta repetida, ningún grupo con una sola hija, el tope de 6 —
  seguían valiendo a cualquier profundidad, no solo en el primer nivel) y `AppShell.tsx`.
- **`grupoDe` sigue devolviendo el id del grupo de PRIMER NIVEL**, nunca el del subgrupo: aterrizar en
  `/produccion/proveedores` sigue abriendo «Producción» (cierra Compras/Ventas/etc.), no «Abastecimiento» a secas. Un
  ayudante nuevo en `AppShell.tsx` (`cadenaAbiertaDesde`) además abre el SUBGRUPO cuando la ruta activa vive adentro,
  para que la fila activa no quede escondida detrás de una cabecera cerrada.

**El lateral (`AppShell.tsx`) tuvo que aprender a pintar un grupo dentro de otro.** No era gratis: `GrupoLateral`
asumía en dos sitios que las hijas de un grupo eran siempre pantallas (`.href` directo) y `CajonGrupo` (el cajón que
reemplaza al lateral en línea cuando está plegado a íconos) lo mismo. Se resolvió reusando el mismo patrón de un
grupo de primer nivel un nivel más adentro (mismo botón, mismo chevron, misma insignia sumada, un `pl-14` de
indentación en vez de `pl-9`) en vez de un caso aparte, y en el cajón plegado — donde abrir un segundo cajón en
cascada para cuatro filas no valía la complejidad — el subgrupo se aplana con una etiqueta de sección, sin perder la
navegación por teclado (flechas/Inicio/Fin siguen moviéndose entre PANTALLAS, no entre etiquetas).

**DESCARTÉ:**
- *Subir el tope de 6 a 7 (u 8).* Es exactamente lo que ADR-0144 dejó prohibido a propósito («estos números no se
  suben para que la prueba pase»): un lateral que no cabe en un vistazo deja de servir para lo que se diseñó.
- *Una pantalla nueva `/produccion/abastecimiento` con pestañas internas (Proveedores/Comprobantes/Recibir/Por
  pagar), en vez de un subgrupo del menú.* Hubiera evitado tocar `AppShell.tsx`, pero cambia el contrato de cuatro
  RPC/páginas que ya existen y funcionan, por un problema que es de MENÚ, no de pantalla — y contradice el patrón que
  el propio árbol ya usa para «Compras» (varias pantallas reales bajo una cabecera que agrupa).
  El costo de tocar `AppShell.tsx` fue real pero acotado y localizado (dos funciones del lateral, una del cajón).
- *Un cajón plegado en cascada (un segundo flotante a la derecha del primero) para el subgrupo.* Es el patrón «correcto»
  de un menú de sistema operativo, pero para cuatro filas dentro de un cajón que ya es una vista rápida, la
  complejidad (una segunda posición flotante, un segundo temporizador de apertura/cierre) no se paga sola. Aplanar con
  una etiqueta de sección es la salida más simple que sigue sin mezclar Proveedores de Producción con los de Compras.

**SE ROMPE SI:** (a) alguien agrega una fila directo en `AppShell.tsx` en vez de en `menu.ts` — sigue sin tener
constantes de filas, ver ADR-0144; (b) un subgrupo llega a 6 hijas propias y alguien sube el tope en vez de volver a
regrupar — la prueba `caben en el tope…` ahora revisa la profundidad completa (`gruposDe`, recursivo), así que atrapa
esto igual que atrapaba el caso de primer nivel; (c) se cambia la fotografía del golden para que una prueba en rojo
pase sin explicar en el PR qué perfil ve algo distinto (esta pieza: solo líder-Taller, de 7 filas sueltas a 4, con
Abastecimiento como una de ellas); (d) alguien nombra `h.href` sobre una hija de un grupo sin pasar por `esGrupoMenu`
primero — el tipo `FilaMenu` es una unión (`ItemMenu | GrupoMenu`) desde antes de esta pieza, pero ahora es más
probable toparse con el caso `GrupoMenu` un nivel más adentro; TypeScript lo atrapa en compilación, no en producción.

## Qué ve cada perfil (el diff exacto del golden)

Un único perfil cambia: **líder parado en el Taller.** Antes veía, dentro de «Producción»: Resumen, Órdenes, Insumos,
Proveedores, Comprobantes, Recibir, Por pagar (7 filas sueltas). Ahora ve: Resumen, Órdenes, Insumos, Abastecimiento
(4 filas), y dentro de Abastecimiento, al abrirlo: Proveedores, Comprobantes, Recibir, Por pagar (las mismas 4
pantallas, mismas rutas, mismo orden). Ningún otro perfil de los 6 de `menu-hoy.golden.json` cambia — el colaborador
en el Taller, quien solo tiene `administrar`, y quien solo tiene `analizar` ya veían menos de 4 pantallas ahí, y con
el subgrupo disolviéndose a una sola hija visible (ver arriba) terminan viendo exactamente lo mismo que antes.

## Qué queda abierto

- `produccion-menu.ts` (`ClaveMenuProduccion`) ya no nombra a Proveedores/Comprobantes/Por pagar como hijas directas —
  ahora son `"abastecimiento"` (o `"recibirProduccion"` cuando el subgrupo se disuelve). Sigue siendo una vista de
  compatibilidad que ninguna pantalla real importa (solo su propia prueba, `produccion-menu.test.ts`) — se borra el
  día que las páginas de Producción importen `puedeVerProduccion` directo de `lib/menu.ts` (ADR-0144 ya lo señalaba).
- Nombres repetidos entre Compras y Producción («Proveedores», «Comprobantes», «Por pagar») siguen sin resolverse —
  es el «paso de nombres» que ADR-0144 dejó para después, ahora dentro de un subgrupo en vez de sueltas.
- Cuando nazca `produccion.eficiencia` (F7), Producción sube a 5 hijas de primer nivel — sigue dentro del tope de 6,
  a propósito.

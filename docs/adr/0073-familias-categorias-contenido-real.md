# ADR-0073 — El contenido de familias y categorías, no solo el mecanismo

**Fecha:** 2026-09-17
**Estado:** Construido y verificado en local (ver "Cómo se verificó").
Producción: pendiente de que Felipe pegue el SQL correspondiente.
**Afecta:** `retail.categorias` (39 filas: renombres, 2 archivadas, 7 nuevas),
`retail.productos` (reasigna 3 productos de prueba a su categoría correcta),
`CategoriasLista.tsx` (etiqueta visible de la familia `accesorios`).

## El problema

ADR-0072 construyó el mecanismo (vocabulario cerrado, propone/aprueba,
filtro por categoría). Pero cuando se propuso confirmar las 6 familias tal
cual ya existían, Felipe frenó: le había dado ejemplos casuales para
ilustrar, no una decisión — y pidió investigar primero qué venden
realmente marcas de moda reales (Zara, H&M, Bershka, Hermès, Ralph Lauren,
LVMH) antes de tocar nombres, en vez de que yo tomara su ejemplo al pie de
la letra.

## Cómo se investigó

3 rondas de investigación real (no memoria): navegando en vivo los sitios
oficiales de Zara, H&M, Bershka, Hermès, Ralph Lauren y dos Maisons de
LVMH (Dior, Fendi, Tiffany, Bulgari) — capturando su navegación real,
citando cada afirmación con la URL exacta, y declarando explícito cuándo un
sitio bloqueó el acceso (varios lo hicieron: Zara, Bershka, Hermès en
español) en vez de inventar contenido. Una ronda adicional en Platanitos
(zapatería peruana real) para terminología específica de Perú — español de
España no siempre calza ("Mules" allá, "Mulas" acá).

## La decisión

**DECIDÍ — 6 familias, 2 renombradas:** Indumentaria, Calzado,
**Accesorios y Complementos** (antes "Accesorios" — Zara usa exactamente
este nombre fusionado), Belleza, Papelería, Bisutería.

**DESCARTÉ — Joyería como familia aparte:** Zara y H&M no tienen línea de
joyería fina en absoluto, solo bisutería de fantasía — y CAYLA tampoco.
Ralph Lauren/Hermès sí la separan, pero porque tienen ambos niveles reales
con una brecha de precio de un orden de magnitud. Mismo criterio que sacó
Papelería de la lista en el primer intento — sin producto real detrás, no
se abre.

**DESCARTÉ — "Make up" como familia propia:** las 3 marcas que venden esto
(H&M, Zara, Hermès) coinciden: es una categoría (`Maquillaje`) dentro de la
familia `Belleza`, no una familia aparte.

**DECIDÍ — Blusas se fusiona con Camisas → "Camisas y Blusas":** Ralph
Lauren ("Camisas y blusas") y Zara ("Shirts | Blouses") las tratan como una
sola categoría. Los 2 productos de prueba que tenía Blusas se reasignaron
antes de archivarla — nunca se pierde ni se borra el producto real que
apuntaba ahí.

**DECIDÍ — Blazers se queda separada, no se fusiona con Casacas:** al
revés que Blusas — Ralph Lauren y Zara la tienen como categoría propia,
nunca junto a chaquetas/casacas.

**DECIDÍ — Calzado suma Botines, Mocasines y Bailarinas** (respaldo real:
Zara separa Botines de Botas Altas explícitamente; Mocasines aparece en 4
de 5 marcas; Bailarinas en 4 de 5). **DESCARTÉ** Alpargatas/Mulas/
Plataformas/Chanclas — menor consenso (1-3 de 5) y Felipe confirmó que hoy
no tienen volumen real en CAYLA.

**DECIDÍ — limpieza de datos de paso:** existía una categoría huérfana
"Polos" (sin familia, sin prefijo — basura del corte V1→V2) con un producto
de prueba ya descontinuado colgando. Se reasignó ese producto a la
categoría real (`Polos/Camisetas`, renombrada acá a `Polos`) y se borró la
fila huérfana — no es "borrar datos con historial", es una fila que nunca
debió existir con `familia null`.

## Cómo se hace cumplir

- `Blusas` y `Trajes de baño` quedan con `activo = false` — nunca `DELETE`.
  Siguen visibles en `/productos/categorias`, en la sección "Desactivadas",
  simplemente no aparecen como opción al dar de alta un producto nuevo.
- Los prefijos nuevos (`BOI`, `MSN`, `BAI`, `REL`, `RIN`, `LIB`, `UOF`) se
  verificaron uno por uno contra los 37 prefijos ya existentes antes de
  insertarlos — sin eso, `categorias_prefijo_unico` los habría rechazado.

## Cómo se verificó

`npx supabase db reset` limpio con el backfill de productos de prueba
corriendo DESPUÉS de la migración (así se detectó que `seed.sql` seguía
apuntando a `Blusas` por nombre — corregido a `Camisas y Blusas`). Consulta
directa a Postgres: 39 categorías activas + 2 archivadas, cada familia con
el conteo exacto diseñado. En el navegador, como Felipe (Líder):
`/productos/categorias` muestra las 6 familias con sus nombres y
categorías reales, y la sección "Desactivadas — no aparecen al crear
productos nuevos" confirma que Blusas/Trajes de baño quedaron ahí, no
desaparecidas. `pnpm typecheck`, `pnpm lint` y los 293 tests, en verde.

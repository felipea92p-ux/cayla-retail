## 2026-09-29 (La grilla de Vender ya no se congela con el catálogo cargado)

Qué hice: con las ~1.500 tarjetas que va a tener TRU cargada, cada escaneo o cada tecla en el buscador
volvía a montar la grilla entera (medido: 1,2 s por escaneo). Tres causas, las tres corregidas: (1) la
grilla pintaba TODAS las tarjetas de una vez — ahora pinta 60 y revela más solas al llegar al fondo,
como ya hacen los combos largos del sistema; (2) el sondeo de stock de cada 10 segundos avisaba a la
pantalla aunque nada hubiera cambiado, y eso repintaba la grilla entera en silencio cada 10 s — ahora
compara antes de avisar; (3) ese mismo sondeo pedía varias páginas a la vez, multiplicando las peticiones
de todas las cajas abiertas sin necesidad — ahora va siempre en serie.

Por qué así: el catálogo real (medido en Alegra: ~1.559 tarjetas el primer día en TRU) hace que la
solución de hoy, pensada para un catálogo chico, se note. Corregir dónde nace el costo (cuántas tarjetas
se pintan, y cuándo se avisa de un cambio) es más seguro esta noche que tocar `agregar()` o el buscador
del escáner: esos dos manejan dinero y quedan para la semana, con más tiempo para revisar cada caso.

Verificado con un andamio temporal (sin Supabase local, que sigue caído): `PuntoDeVentaCatalogo` con 300
prendas sintéticas, a 375 px. Arranca con 60 tarjetas, llega a 300 revelando de a tandas al hacer scroll,
y cambiar de categoría vuelve a la primera tanda. Sin errores en consola. `pnpm typecheck`, `pnpm lint` y
las 227 suites de pruebas (152.700 casos) en verde.

Felipe se lleva: sin migración, nada que pegar. Queda pendiente para la semana (más riesgo, necesita más
tiempo de revisión): que cada tarjeta se pinte sola en vez de repintar el bloque entero, y el buscador que
encuentra "negro m" como dos palabras sueltas.

# Checklist para mañana — revisión nocturna del 2026-07-17

> Felipe se fue y me pidió revisar todo el proyecto y dejar esto. Lo hice: leí las 9
> migraciones, las 3 RPCs de dinero/stock, todas las políticas RLS, la lógica de
> inteligencia/finanzas, y los 15 componentes. **No apliqué nada riesgoso.** Lo único
> que toqué en código es un cambio de texto trivial (abajo). Todo lo importante que
> encontré son decisiones que son tuyas, no mías — están aquí para que las apruebes.

---

## ✅ LO QUE YA HICE (seguro, reversible, sin tocar la base de datos)

- **Arreglé un texto que mentía.** El mensaje de error del login decía "date de alta en
  la **hoja** `personas`" — herencia de cuando esto vivía en Google Sheets. Ya no hay
  ninguna hoja; ahora dice "date de alta en el sistema". Nada más cambió en la app.
- Build y lint quedaron limpios. La app sigue exactamente igual de funcional.

---

## 🔴 DECISIÓN 1 — la importante: arreglar una condición de carrera en el stock

**El problema (real, no teórico):** si dos ventas de la **última unidad** de la misma
prenda, en la **misma sede**, se registran en el mismo instante, las dos leen "hay 1",
las dos pasan la validación, y las dos descuentan → el stock queda en **-1**. El sistema
te mostraría stock negativo y nadie se enteraría hasta el conteo físico.

**¿Urgente?** Hoy no es probable: cada tienda tiene una sola cajera, y para que pase
tienen que coincidir dos ventas de la MISMA prenda en el MISMO segundo. Pero es una
bomba silenciosa — el día que crezcas (dos cajas por tienda, o ventas online + tienda
sobre el mismo stock) empieza a pasar, y es de las cosas que arruinan la confianza en el
sistema porque el número simplemente deja de cuadrar.

**La solución** está escrita y lista en [`docs/propuestas/0010_stock_concurrencia.sql`](propuestas/0010_stock_concurrencia.sql).
Hace dos cosas: (1) bloquea la fila de stock mientras valida, para que la segunda venta
espere a la primera; (2) le pone a la base la regla "el stock nunca puede ser negativo"
como red de seguridad definitiva.

**Cómo aplicarla (cuando digas que sí):**
1. Primero, en el SQL Editor de Supabase, revisa que no haya ya stock negativo:
   ```sql
   select * from stock where cantidad < 0;
   ```
   - Si no devuelve nada (lo esperado): sigue al paso 2.
   - Si devuelve filas: avísame, lo corregimos antes (esto probaría que el bug ya ocurrió).
2. Pega el contenido de `docs/propuestas/0010_stock_concurrencia.sql` en el SQL Editor y
   dale Run. Debe decir "Success".
3. Cuando esté aplicada, movemos el archivo a `supabase/migrations/0010_stock_concurrencia.sql`
   para que quede en el historial oficial de migraciones.

> **Por qué te dejo el archivo en `docs/propuestas/` y no en `supabase/migrations/`:**
> para que NO se aplique solo por accidente. Una migración sin aprobar que toca el
> corazón del stock no debe estar en la carpeta que se corre automáticamente.

---

## 🟡 DECISIÓN 2 — precisión: "Estancado" se está engañando con las bajadas de almacén

**El problema:** el sistema marca una prenda como "Estancada" si pasa 45 días sin
salida. Pero desde que existe el almacén (Fase 3), **bajar mercadería del almacén a la
tienda cuenta como "salida"** del almacén — aunque nadie la haya comprado. Resultado: una
prenda puede estar 44 días sin venderse en el piso, le bajas una unidad más del almacén,
y el contador de "días sin venta" se **reinicia a 0**. La prenda estancada se esconde.

Lo confirma el propio sistema: el orden del catálogo ya se llama "días sin **venta**",
pero por dentro está mirando "días sin **cualquier salida**". La intención siempre fue
"sin venta"; la implementación quedó a medias cuando llegó el almacén.

**Por qué NO lo arreglé solo:** el arreglo correcto necesita una columna nueva en la base
(`stock.ultima_venta`, que se actualice solo con las ventas reales). Intenté hacerlo solo
en el código de lectura, pero es frágil: Supabase corta las consultas en 1000 filas, y
con el tiempo eso haría que tus mejores vendedores aparezcan como "estancados" — el peor
error posible. Hacerlo bien es una migración pequeña, y como cambia números que tú ves,
prefiero que lo decidas tú.

**Mi recomendación:** sí hacerlo, es media hora. Cuando vuelvas, dímelo y preparo la
migración `0011` igual que la 0010 (propuesta primero, la corres tú).

---

## 🟡 DECISIÓN 3 — seguridad: las funciones de stock/caja confían en el cliente

**El problema:** cinco funciones del servidor (`registrar_movimiento`, `abrir_caja`,
`cerrar_caja`, `registrar_venta`, `recibir_lote`) corren con permisos elevados y **no
verifican que quien las llama sea de la sede** sobre la que actúan. La app siempre manda
la sede correcta, así que en el uso normal no pasa nada. Pero un usuario con acceso que
supiera un poco de técnica podría, con una llamada directa a la API, mover stock o abrir/
cerrar cajas de OTRA sede — sin pasar por la pantalla.

Esto choca con lo que el propio sistema promete por escrito (en `0003_rls.sql`: "roles
validados en el servidor, no solo ocultos en la UI"). Hoy, con 3 tiendas y equipo de
confianza, el riesgo es bajo. Cuando el equipo crezca o si alguna vez se filtra una
contraseña, deja de ser bajo.

**El arreglo:** agregar dentro de cada una de esas funciones un chequeo simple — "el que
llama es Líder, o es de esta sede; si no, error". Es el mismo criterio que ya usan las
reglas de RLS de las tablas. Es una migración pequeña. **No urgente, pero sí antes de
sumar más gente al sistema.** Cuando quieras, la preparo (propuesta primero, la corres tú).

---

## ⚪ NOTAS — cosas para que TÚ decidas (no son bugs, son criterios de negocio)

1. **"Reponer ya" cuenta el stock del almacén.** Si tienes 40 unidades guardadas en el
   almacén y 0 en el piso de venta, hoy NO salta la alerta "Reponer ya" (porque sumado
   tienes 40). ¿Está bien? Se puede argumentar que sí (tienes stock, solo hay que
   bajarlo) o que no (el piso está vacío y deberías verlo). Es tu decisión de cómo
   quieres que se comporte. Lo dejo anotado, no lo toqué.

2. **El costo de lo vendido usa el costo de HOY, no el del día de la venta.** El Estado
   de Resultados calcula "cuánto me costó lo que vendí" con el costo actual de cada
   prenda. Si le cambias el costo a una prenda, cambia el costo histórico de ventas
   viejas. Para costos estables (lo normal en tu negocio) no importa; si algún día los
   costos se mueven mucho, habría que guardar el costo al momento de cada venta. Nota
   para el futuro, no urgente.

3. **Pendiente de siempre:** rediseñar el formulario de "Recibir mercadería" para que los
   campos (talla/color/familia/categoría) se vean desde el inicio y no después de buscar.
   Ya está en el backlog. La taxonomía de categorías (lo de hoy) ya quedó lista; falta
   solo esa parte de que se vea más directo.

---

## 🟢 LO QUE REVISÉ A FONDO Y ESTÁ BIEN (para tu tranquilidad)

No todo son problemas — la mayor parte del sistema está sólida. Tracé con cuidado:

- **El cálculo de la transacción de venta** (`registrar_venta`): crea la venta y descuenta
  el stock de cada prenda en un solo bloque atómico — o se registra todo, o no se registra
  nada. No puede quedar a medias. Correcto.
- **El conteo ciego de caja** (`cerrar_caja`): el esperado se calcula del lado del servidor
  después de que mandas el contado, y solo cuenta el efectivo. Bien hecho.
- **La gráfica de tendencia de stock** de cada producto: reconstruye el histórico caminando
  hacia atrás desde el stock actual. Revisé los signos (entradas suman, salidas restan,
  traslados no cambian el total de red, ajustes suman con su signo) — cuadra, el último
  punto siempre coincide con el stock real.
- **La devolución de tienda a almacén**: reutiliza el traslado, guarda el motivo, y mueve
  el stock a la ubicación correcta. Correcto.
- **El pipeline de respaldo/deploy**: probé el ciclo completo esta noche (subir a GitHub →
  Vercel → producción) y funciona; la app en `cayla-retail.vercel.app` está viva y sana.

---

## 📌 RESUMEN EN UNA LÍNEA

El código está sano. Lo único que de verdad recomiendo hacer pronto es **la Decisión 1**
(el fix de concurrencia del stock) — el resto es afinar. La Decisión 3 (seguridad) hazla
antes de sumar gente nueva al equipo. Dime "sí a la 1" y te guío para correrla en 3 pasos.

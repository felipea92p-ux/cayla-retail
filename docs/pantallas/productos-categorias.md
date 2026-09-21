# Pantalla — Categorías (`/productos/categorias`)

> Modo: **rápido** (no comparable con filas de modo completo) · Fecha: 2026-09-21 · Rol/sede: líder, tienda TRU · Datos: sin SQL (captura + código)
> SHA analizado: `17bdb269` (= origin/main; rama al día, `0 0`) — si `page.tsx` o `CategoriasLista.tsx` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/productos/categorias/page.tsx` · `apps/web/components/CategoriasLista.tsx` · `app/api/productos/categorias/route.ts` (+ `/ejes`) · RPC `actualizar_categoria`, `desactivar_categoria`, `reactivar_categoria`, `actualizar_categoria_ejes` · tablas `categorias`, `familias`, `productos`
> Otra sesión tocándola: **sí** — `SESIONES-ACTIVAS.md` líneas 21 (árbol de decisión de producto: «Categorías (curva)», ADR-0109, pendiente de pegar 8 SQL) y 45 (rediseño visual de tarjetas, PR #119). Las tareas de abajo pueden chocar con ambas.

## 0 · Veredicto
Pantalla sana y bien construida: agrupa por familia, es de solo lectura para quien no es líder y el candado de desactivar vive en la base. Su debilidad no es la pantalla sino que **casi todo está vacío** (la mayoría de tarjetas dice «sin productos») y no ayuda a decidir nada.
**Cumple su finalidad:** 7.5/10 · **Relevancia:** 5.8/10 — Comodidad (pero es raíz de la analítica: si una categoría se crea mal, todo reporte por categoría hereda el error)

## 1 · Finalidad declarada
"Esta pantalla existe para mantener el vocabulario cerrado de categorías (familia + prefijo de 3 letras + qué tallas/tejidos/patrones ofrece cada una), del que depende el código de cada prenda." Fuente: comentario de `page.tsx` (ADR-0095) y ayuda en pantalla `[código page.tsx:9-10]`. Coinciden docs y pantalla: sí. Nota: el módulo de datos aún no lo verifiqué en `docs/datos/modulos/` (modo rápido).

## 2 · Objeción
1. **El conteo «38 productos clasificados» y «42 categorías activas» no se explican solos.** `page.tsx` cuenta solo productos `estado = 'activo'` y la cabecera cuenta *todas* las categorías activas incluidas subcategorías, mientras cada sección muestra solo raíces `[código page.tsx:58-60, CategoriasLista.tsx:319]`. Si hay subcategorías, 18+7+… no suma 42 y la líder desconfía del número. `[inferido]`
2. **Pantalla muerta como herramienta de gestión.** 42 categorías para 38 productos: la mayoría vacía `[visto]`. No dice cuáles rotan, cuáles nunca vendieron ni cuáles no deberían existir todavía. Es un catálogo, no un tablero — está bien si es solo mantenimiento, mal si se le pide decidir.
3. Trade-off: no la llenes de métricas ahora; con 38 productos sería ruido. Primero arregla los números que ya muestra.

## 3 · Lo que está bien y no se toca
- Candado real en la base, no solo en pantalla: `desactivar_categoria` bloquea si hay productos activos, y el frontend solo lo refleja `[código CategoriasLista.tsx:29, page.tsx:44-46]`.
- Solo líder edita: API con `persona.rol !== "lider"` en POST/PUT/PATCH y RLS de escritura `[código route.ts:25,75,130]`. Vista rápida de solo lectura para cualquier rol `[código CategoriasLista.tsx:113]`.
- Nunca se borra: desactivar/reactivar con sección aparte de inactivas (regla «nunca DELETE») `[código CategoriasLista.tsx:626]`.
- Familia validada por FK, no por texto libre `[código page.tsx:72-78]`.
- Usa `<Modal>` del sistema (ADR-0136), tarjeta con el mismo gesto que `TarjetaProducto`, crema/tinta sin blanco ni negro puro `[visto]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 8 | Coherente con CAYLA y con Productos. Rojo prácticamente ausente (bien, máx. 2). Etiqueta «SIN PRODUCTOS» a 9px y tinta/50 se lee mal | `[visto]` `[código CategoriasLista.tsx:670 text-[9px] text-tinta/50]` |
| Lógica de negocio | 7 | Vocabulario cerrado bien protegido. Falta: nadie avisa que crear una categoría nueva no la deja usable hasta definir sus ejes (tallas/tejidos/patrones) | `[código CategoriasLista.tsx:205 ejes por separado]` `[inferido]` |
| Arquitectura | 7 | Cadena page → lista → API → RPC correcta. Conteo de productos trae *todas* las filas de `productos` al servidor solo para contar: hoy 38, pero a 3 años (~10–20 mil variantes, algunos miles de productos) pasa el tope de filas de Supabase y el conteo se trunca en silencio | `[código page.tsx:36, 55-58]` `[inferido]` |
| Funciones | 8 | Existen y funcionan: agregar, editar, subcategorías, vista rápida, ver en Productos, desactivar/reactivar. Fantasma: el icono «!» junto al título es la ayuda, se parece a una alerta | `[visto]` `[código]` |
| Utilidad | 7 | Colaboradora nueva: entiende el prefijo de 3 letras solo si abre la ayuda. Quien busca «Camisas y Blusas» no tiene buscador; con 42 tarjetas aún se lee, con 80 no | `[visto]` `[inferido]` |
| Conexión con el ERP | 8 | Aguas arriba: `familias`. Aguas abajo: crear/editar producto (prefijo → código, ejes → variantes), filtros de Productos, reportes por categoría. Sin API externa: no tiene punto de caída externo | `[código page.tsx:36-47]` |

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Directa baja; indirecta alta: toda analítica por categoría nace acá |
| Dinero y stock que toca | ×1 | 3 | No mueve stock ni dinero; sí el código de prenda |
| Frecuencia y personas | ×1 | 3 | Solo líder, esporádica (alta de categoría nueva) |
| Qué se detiene si falla | ×1 | 7 | Sin categoría válida no se puede crear producto |

Relevancia = (2·8 + 3 + 3 + 7) / 5 = **5.8** → Comodidad.
Cumple su finalidad = (8+7+7+8+7+8)/6 = **7.5** (sin tope: no hay defecto que dañe dinero o stock).

## 6 · Conexión con el ERP
- **Aguas arriba:** `familias` (ADR-0103), `tallas`/`tejidos`/`patrones` aprobados (`page.tsx:38-40`).
- **Aguas abajo:** Nuevo/Editar producto, Productos, censo, curva por categoría (sesión ADR-0109).
- **Pájaro dueño y vecinos:** catálogo/vocabulario; vecinos Atributos y Familias `[no verificable en rápido — sin leer AVIARIO.md]`.
- **Externos:** ninguno. Se degrada así: si la base no responde, `exigir()` corta la página con error; no se pierde ningún dato.

## 7 · Las 12 tareas, por importancia
1. **Corregir** — Alinear los números de cabecera: separar «X categorías (Y subcategorías)» y decir «N productos activos». Dónde: `page.tsx:58-60`. Por qué: un número que no cuadra con lo que se ve destruye la confianza en el resto. Verificas: sumas las tarjetas y da la cifra de la cabecera. S · sin dependencias.
2. **Corregir** — Contar productos en la base, no trayendo todas las filas: una vista/RPC `count(*) group by categoria_id where estado='activo'`. Dónde: `page.tsx:36`. Por qué: a miles de productos el conteo se trunca sin avisar. Verificas: con >1000 productos el total sigue exacto. S–M · no antes de aplicar migración en producción (regla de CAYLA).
3. **Corregir** — Subir el contraste y tamaño de «SIN PRODUCTOS» (mín. 11px, tinta/65) según ADR-0012. Dónde: `CategoriasLista.tsx:670`. Por qué: accesibilidad, es el texto que más aparece. Verificas: zoom a la tarjeta, se lee sin esfuerzo. S · choca con PR #119 (sesión de rediseño): coordinar.
4. **Mejorar** — Buscador arriba (filtra por nombre o prefijo). Dónde: `CategoriasLista.tsx` sobre las secciones. Por qué: 42 hoy, crecerá con calzado/accesorios. Verificas: escribes «BLZ» y queda solo Blazers. S.
5. **Mejorar** — Avisar al crear categoría que sin ejes no queda usable, o abrir directo el paso de ejes. Dónde: `CategoriasLista.tsx:205`. Por qué: la líder crea, guarda y luego no puede crear producto sin saber por qué. Verificas: crear categoría → aparece el aviso o paso siguiente. S–M.
6. **Mejorar** — Hacer visible la ayuda: cambiar el «!» por «?» o el texto «¿Cómo se lee esto?», con el prefijo explicado en la propia tarjeta (tooltip). Dónde: `page.tsx:66`. Verificas: una persona nueva explica sola qué es «BLZ». S.
7. **Mejorar** — Marcar las categorías vacías con una acción útil («Crear el primer producto aquí») en lugar de solo «sin productos». Dónde: `CategoriasLista.tsx:670` y vista rápida. Por qué: convierte estado vacío en flujo. Verificas: clic en la tarjeta vacía lleva a Nuevo producto con la categoría preseleccionada. S–M · no antes de la #9 (ADR-0109 cambia Nuevo producto).
8. **Eliminar/fusionar/conectar** — Confirmar con la sesión de ADR-0109 quién es dueño de «Categorías (curva)» para no duplicar. Dónde: `SESIONES-ACTIVAS.md:21,45`. Por qué: dos sesiones ya rediseñando la misma pantalla. Verificas: una sola rama abierta sobre `CategoriasLista.tsx`. S · **hacer antes que cualquier otra tarea que toque el archivo**.
9. **Conectar** — Esperar a que se peguen los 8 SQL de ADR-0109 en producción antes de tocar el flujo Nuevo producto. Por qué: la pantalla puede romperse si el código sale antes que el SQL (regla «SQL en producción, en orden y antes de desplegar»). Verificas: `pnpm datos:comparar` limpio. S · no es de esta pantalla pero la condiciona.
10. **Replantear** — Decidir si Categorías es solo mantenimiento (como hoy) o un tablero de gestión (rotación, sin ventas en 60 días). DECIDÍ: dejarla como mantenimiento hasta tener ventas reales. DESCARTÉ: agregar métricas ahora, porque con 38 productos de prueba serían números inventados. SE ROMPE SI: CAYLA empieza a pedirle a esta pantalla qué categoría recortar antes de que exista historial de ventas por categoría. **Decide Felipe.**
11. **Mejorar** *(bajo valor / opcional)* — Orden manual de tarjetas dentro de la familia. Hoy es alfabético `[código page.tsx:33]`. Solo si la líder lo pide.
12. **Mejorar** *(futuro)* — Multi-idioma / etiquetas por marca. No le sirve a 3 tiendas y 1 taller hoy.

## 8 · Estrategia alternativa
Fusionar Categorías + Familias + Atributos en un solo «Vocabulario del catálogo» con pestañas (ya se hizo con Colores/Tallas/Tejidos en `AtributosHub`). **Ganas:** un solo lugar, un solo patrón (integridad conceptual). **Pagas:** un hub grande que mezcla frecuencias distintas y una migración de rutas. Decide Felipe.

## 10 · Fuera de esta pantalla
`page.tsx:36` (`productos.select` sin límite ni paginación) es el mismo patrón que probablemente usan otras pantallas del catálogo: si dos o más traen «todas las filas para contar», es una tarea raíz de conteo en base, no una por pantalla. `[inferido — no verifiqué otras pantallas]`

## Historial
| Fecha | Modo | SHA | Puntajes | Nota |
|---|---|---|---|---|
| 2026-09-21 | rápido | `17bdb269` | 7.5 / 5.8 | Primer análisis |

## Líneas propuestas para BACKLOG.md
*(pendientes de aprobación de Felipe; no anexadas)*
- [pantalla:productos-categorias] Alinear cifras de cabecera (categorías vs subcategorías, productos activos).
- [pantalla:productos-categorias] Contar productos por categoría en la base (RPC/vista), no en el servidor.
- [pantalla:productos-categorias] Subir contraste de «SIN PRODUCTOS» (ADR-0012).
- [pantalla:productos-categorias] Buscador por nombre/prefijo.
- [pantalla:productos-categorias] Aviso «sin ejes, no usable» al crear categoría.
- [pantalla:productos-categorias] Hacer legible la ayuda (icono «!» → «?»).
- [pantalla:productos-categorias] Estado vacío accionable: «Crear primer producto aquí».
- [pantalla:productos-categorias] Coordinar con sesiones ADR-0109 y PR #119 antes de tocar `CategoriasLista.tsx`.
- [pantalla:productos-categorias] Decisión Replantear: mantenimiento vs tablero de gestión.

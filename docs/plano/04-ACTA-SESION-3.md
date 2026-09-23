# Acta de la Sesión 3 — Permisos + Pantallas (PL-83 a PL-112)

> **Fecha:** 2026-09-22/23 · **Quién decide:** Felipe Alvarez · **De dónde salen:** las 30 preguntas de la
> Sesión 3 del banco (`01-BANCO-PREGUNTAS.md`), frentes «Identidad y permisos» (14) y «Pantallas y principios
> de producto» (16). Continúa la numeración de `03-ACTA-SESION-2.md` (que terminó en PL-82).
>
> Esta sesión trajo dos correcciones importantes verificadas en vivo (PL-84/85, PL-92) y una **corrección al
> acta original** (PL-09): el primer rastreo del repo solo encontró 2 constructores activos, y Felipe reveló
> a mitad de sesión que el equipo real son 6 personas con horas reales. Ver «Corrección a PL-09» al final.

---

## Bloque A — Identidad y permisos (PL-83 a PL-96)

| # | Decisión |
|---|---|
| PL-83 | **Rol Admin en la base:** se construye ahora, antes de sumar más pantallas que solo saben de líder/colaborador. |
| PL-84 | **Corazón de la venta** *(verificado en vivo, dos veces)*: `ventas`/`venta_items`/`venta_anulacion_items` siguen aceptando escritura directa desde el navegador. Se rescata el arreglo existente (ADR-0119), se re-ensaya y se pega esta semana. *(Buena noticia verificada en el camino: `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios` ya fueron cerrados hoy por otra sesión de Felipe — commit `520915d0`, ADR-0166, en la rama `claude/pantalla-ventas-module-bf9b1b`, aún sin fusionar a main.)* |
| PL-85 | **`clientas` (no "clientes"), `conteos`, `lotes`:** mismo hueco, verificado hoy — se cierran en el mismo paquete que PL-84. |
| PL-86 | **Segundo pegador de SQL (pendiente de PL-11):** Dany. |
| PL-87 | **Checklist de SQL a producción:** obligatorio para Felipe y Dany por igual — ensayo en Postgres desechable + sonda de solo lectura + registro de qué y cuándo. |
| PL-88 | **Niveles de rol:** se mantienen los 4 de D-12 tal cual, aunque el contador no use «Solo lectura» todavía. |
| PL-89 | **Líderes con alcance global → por sede:** se acota en la primera semana completa después del lanzamiento de TRU (fecha exacta, no «cuando sienta confianza»). |
| PL-90 | **Cubrir otra sede con fecha de vencimiento (D-14):** tabla `retail.coberturas` (persona, ubicación, vence_el) + rama en `fn_puede_operar_ubicacion`, con lista visible de coberturas activas. |
| PL-91 | **Tope de descuento:** Integrante hasta 5%, Líder hasta 15%; categoría aparte «liquidación» sin tope pero con motivo obligatorio. |
| PL-92 | **Baja de acceso** *(verificado en vivo)*: el hueco de V1 (colaboradora dada de baja seguía pudiendo vender) ya está cerrado en V2 — `fn_es_lider()` y `fn_ubicacion_actual_persona()` ya filtran `estado='activo'`. Se corrige el documento que lo listaba como pendiente; nada que construir. |
| PL-93 | **Auditoría menú-vs-base:** se hacen los dos, en orden — auditoría manual completa ahora (qué tabla depende solo de esconder el botón), chequeo automático en CI después (para que no vuelva a dormir sin avisar). |
| PL-94/95 | **Círculo de SQL y Admin, ampliado:** cada dueño de pájaro pega SQL de su propio módulo (no «cualquiera sin restricción»), con el mismo checklist de PL-87. Quien tiene esa llave también ve el negocio completo como Admin — decisión explícita de Felipe, no separación técnica/de negocio. Bitácora: tabla nueva (`sql_aplicado`) **y** el PR de GitHub, ambos — no son alternativas, son gratis juntos. |
| PL-96 | **Ascender/bajar de rol:** función `security definer`, solo Admin, con registro de quién y cuándo — deja de depender de un `UPDATE` manual por SQL. |

**Pendientes que nacen de este bloque:**
- PL-84/85: rescatar ADR-0119, re-ensayar, pegar esta semana — el de mayor riesgo de la sesión.
- PL-83, PL-90, PL-96: construir Admin, tabla de coberturas, función de ascenso — tres piezas nuevas de esquema.
- PL-89: fijar la fecha exacta de la primera semana post-lanzamiento cuando TRU salga en vivo.
- PL-92: corregir `05-SEGURIDAD.md` (pendiente fantasma).

### Reflexión del bloque
- **Lo que ya hacemos bien:** dos de los hallazgos más alarmantes de esta ronda (baja de acceso, PL-92) resultaron ya resueltos en V2 cuando se verificaron contra producción — el núcleo de identidad ya es más sólido de lo que la documentación vieja sugería.
- **Qué podría hacer mejor que yo un integrante:** los topes de descuento (PL-91) los fijé yo con un criterio razonable, pero una líder de equipo que negocia con clientas todos los días sabe mejor si 15% alcanza para una prenda con un defecto visible.
- **La próxima objeción que quiero escuchar:** en PL-94/95 Felipe eligió simplicidad (SQL = Admin siempre) sobre separación de confianza. Puede ser correcto para un equipo de 6 que se conoce, pero si el equipo crece, alguien debería preguntar «¿de verdad todo el que toca infraestructura necesita ver márgenes de toda la empresa?» antes de que se vuelva costumbre.

---

## Bloque B — Pantallas y principios de producto (PL-97 a PL-112)

| # | Decisión |
|---|---|
| PL-97 | **Cajones/paneles fuera de `<Modal>`** (7-8 componentes): se migran todos al `<Modal>` existente. |
| PL-98 | **Máximo de rojo por pantalla:** prueba automática en CI que cuenta el rojo y falla si excede el tope. |
| PL-99 | **Contraste de texto (ADR-0012):** prueba automática en CI contra los tokens reales de `globals.css`. |
| PL-100 | **Cabecera común (`EncabezadoPagina`)** *(verificado: 4 de 52 la usan)*: pasa a obligatoria, con una prueba que falla si una pantalla no la usa. |
| PL-101 | **Modo oscuro** *(colisión de ADR verificada)*: se mantiene «sin modo oscuro» por ahora y se corrige la numeración duplicada, pero el «sí» que Felipe ya dio no se descarta — queda anotado como fase futura con fecha después del lanzamiento. |
| PL-102 | **`design-tokens.ts` vs `globals.css`:** gana `globals.css` (esquinas redondeadas, la paleta real); se borra/corrige `design-tokens.ts`. |
| PL-103 | **Manual de moldes de pantalla:** sí, documento corto a mano con un ejemplo real por tipo (listado, formulario, modal, cajón). |
| PL-104 | **Prueba «persona sin contexto»:** se mantiene como revisión posterior, no bloquea la fusión — con Danixa como probadora natural (menos contexto del equipo). |
| PL-105 | **Prueba en ancho de celular por PR** *(decidido por el arquitecto, con datos de Felipe)*: obligatoria solo para Vender/Cambios/Devoluciones — Caja y Almacén son de escritorio en la práctica, según confirmó Felipe. |
| PL-106 | **Estados vacíos sin acción** (ej. «SIN PRODUCTOS»): regla general — todo estado vacío con una acción posible la ofrece. |
| PL-107 | **Subir/bajar a alguien de Líder desde la pantalla:** se construye, visible solo para Felipe, con confirmación y quedando en el historial de accesos. |
| PL-108 | **Detalle con URL propia (`@modal`) vs. modal simple:** regla escrita — URL propia cuando el detalle se comparte o recarga, modal simple cuando solo tiene sentido dentro del flujo. |
| PL-109 | **Orden de auditoría de pantallas:** por relevancia dinero/stock, empezando por Vender, Caja y Compras. |
| PL-110 | **3 análisis de pantalla en ramas sin fusionar** (Caja, historial de ventas, uno más): se rescatan y se verifican a fondo contra el código de hoy antes de fusionarlos — sin arrastrar hallazgos ya vencidos. |
| PL-111 | **Estándar de tono para mensajes de error:** sí — siempre neutro en género, siempre dice qué hacer ahora, nunca nombra algo técnico. |
| PL-112 | **Ícono de ayuda vs. ícono de alerta:** se separan — signo de pregunta/info para ayuda, el símbolo de alerta queda exclusivo para alertas reales. |

**Pendientes que nacen de este bloque:**
- PL-98, PL-99, PL-100: tres pruebas nuevas de CI (rojo, contraste, cabecera obligatoria).
- PL-97: migrar 7-8 componentes al `<Modal>` existente.
- PL-101: renumerar el ADR de modo oscuro y archivar su rama; agendar la fase futura sin fecha aún.
- PL-102: borrar o corregir `design-tokens.ts`.
- PL-103: escribir el manual de moldes de pantalla.
- PL-107: nueva función `security definer` + UI para ascender/bajar Líder.
- PL-110: rescatar y re-verificar 3 análisis de pantalla antes de fusionarlos.

### Reflexión del bloque
- **Lo que ya hacemos bien:** varios de los patrones que esta ronda «decidió» (cuándo usar `@modal`, PL-108; cómo se separan Comprobante/Nota de crédito por módulo) resultaron ser prácticas que el código YA seguía consistentemente — solo faltaba escribirlas, no inventarlas.
- **Qué podría hacer mejor que yo un integrante:** Fernanda, dueña de las reglas transversales de pantalla desde hoy, va a encontrar más inconsistencias visuales de las que esta sesión detectó con /pantalla en solo 2 de 48 pantallas — su criterio de diseño es más fino que el mío en el detalle.
- **La próxima objeción que quiero escuchar:** varias de estas reglas (rojo máximo, contraste, cabecera obligatoria) se volvieron pruebas de CI porque «la costumbre ya falló una vez». Vale la pena que alguien del equipo pregunte, dentro de unos meses, si el CI se volvió tan estricto que frena cambios legítimos — un candado que nadie puede pasar también es un costo.

---

## Corrección a PL-09 (acta original) — el equipo real y el reparto de pájaros

El primer rastreo del repo (mapeo previo, Sesión 0) solo encontró 2 constructores activos en el historial de
git (Danytristee y Felipe), y PL-09 dejó 4 pájaros sin dueño. A mitad de esta sesión, Felipe reveló el equipo
real, con horas semanales:

| Persona | Horas/semana | Dedicación real |
|---|---|---|
| Felipe | 48+ | Todo un poco, sobre todo Catálogo |
| Dany | 45 | Ventas |
| Diego | 45 | Proveedores y compras |
| Benja | 45 | Inventario |
| Fernanda | 22.5 | UI/UX (transversal) |
| Danixa | 7.5 (llegando) | Casi nada del retail todavía |

**Corrección al reparto de pájaros de PL-09:**

| Pájaro | Dueño anterior (PL-09) | Dueño corregido | Motivo |
|---|---|---|---|
| Halcón (Inventario) | Felipe | **Benja** | Es donde Benja trabaja de verdad — «a quién le preguntas primero» solo tiene sentido si esa persona ya está ahí. |
| Loro (Catálogo) | Felipe | Felipe (sin cambio) | Coincide con su dedicación real. |
| Colibrí (Ventas y caja) | Dany | Dany (sin cambio) | Coincide con su dedicación real. |
| Pelícano (Compras) | *libre* | **Diego** | Coincide con su dedicación real. |
| Gallito (Producción del Taller) | Benja (propuesta inicial, corregida) | *libre — nadie trabaja ahí hoy* | Se retira la asignación errónea de esta misma sesión. |
| Garza (Finanzas operativas) | Fernanda (propuesta inicial, corregida) | *libre — nadie trabaja ahí hoy* | Se retira la asignación errónea de esta misma sesión. |
| — (no es uno de los 14) | — | **Fernanda** — reglas transversales de pantalla (Modal, Espera, sistema de diseño) | Su trabajo cruza todos los módulos; no es dueña de una tabla, es dueña de la consistencia visual. |
| Águila (Inteligencia) | *libre* | Felipe (diseña, no construye) | Sin cambio — ligado a PL-76 de la Sesión 2. |

**Nota para el aviario real:** esta tabla corrige la propuesta que este mismo asistente anunció (por error, antes
de tener la información real) a mitad de sesión. `docs/datos/07-GOBIERNO.md` §1 debe actualizarse con esta
versión, no con el anuncio intermedio.

**Nota sobre el círculo de SQL/Admin (PL-94/95, ampliado):** con el reparto corregido, quienes pegarían SQL de
su propio módulo son Felipe (Catálogo), Dany (Ventas), Diego (Compras) y Benja (Inventario) — cada uno con el
checklist de PL-87, y cada uno viendo el negocio completo como Admin por la decisión explícita de Felipe.

---

## Balance acumulado

24 (acta) + 29 (Sesión 1) + 29 (Sesión 2) + 30 (Sesión 3) = **112 de 143 preguntas del plano maestro.**
Queda 1 sesión: Integraciones + Equipo (~31 preguntas).

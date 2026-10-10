## 🧵 Producción: modelo nuevo desde la orden (2026-10-07, 2026-10-09 y 2026-10-10, ADR-0361) — primera parte solo web; segunda parte con migración aditiva; rama `claude/vista-inicial-taller-3c5f9a`

### Primera parte (2026-10-07): ida y vuelta entre la orden y el alta — construida

- [x] Rastreo del historial: lo que Felipe recordaba (costeo con tela y avíos, costo por prenda, semáforo 60/40) vive hoy en «Nueva orden»; lo perdido era crear el modelo desde la orden.
- [x] `lib/modelo-nuevo-orden-reglas.ts` (+ prueba de 14): ida y vuelta por la URL (`?desde=produccion&tipo=…` y `?nueva=<modelo>&tipo=…`), con parámetros rotos sin lanzar.
- [x] Nueva orden: tipo preelegido, margen y semáforo del líder sin depender de la red, aviso de modelo sin precio, pista de la matriz hacia Editar producto.
- [x] Nuevo producto → pantalla de éxito: «Abrir la orden de producción/muestra» como salida principal si venía de una orden (sin tocar `NuevoProductoForm.tsx`).

### Segunda parte (2026-10-09): «Modelo nuevo» dentro de «Nueva orden» — construida (Felipe aprobó el plan: «aprobado el plan, hazlo»)

Decisiones por defecto que Felipe aprobó con el plan: precio obligatorio en una producción y opcional en una muestra; el costo de la variante nace en 0 y el real se pega al cerrar (D-31); el material libre de julio no vuelve (el tejido es vocabulario y lo completa quien edita el catálogo); lo puede crear quien opera el Taller, y el modelo nace `pendiente` si no edita el catálogo.

- [x] `supabase/migrations/20261009120000_abrir_produccion_con_modelo_nuevo.sql`: función `retail.abrir_produccion_con_modelo_nuevo` (aditiva, precedente `censo_crear_variante`): modelo + variantes + orden en una transacción y con un token; tallas y colores validados por conjuntos; llama a `abrir_produccion` sin tocarla.
- [x] `scripts/pruebas/abrir_produccion_con_modelo_nuevo.mjs` (20 casos contra el Postgres local, todos con `ROLLBACK`; Felipe la corrió dos veces: 20/20), `pnpm pruebas:abrir-produccion-modelo-nuevo` y su paso en el CI.
- [x] `lib/modelo-nuevo-reglas.ts` (+ prueba de 40, con dos pruebas de azar con semilla fija y la paridad de nombres con la migración y los tipos generados) y `getVocabularioModeloNuevo`.
- [x] «Modelo nuevo» dentro de «Nueva orden» (`ModeloNuevoCampos.tsx`, guía de foco); un nombre repetido ofrece «Usar ese modelo» y uno casi igual «Es otro modelo, crearlo igual»; el tablero sin modelos ofrece «+ Crear el primer modelo»; el enlace a Productos queda como alta completa con fotos.
- [x] `/focus` y `/sugerir`: «Nueva orden» pasó de `pendiente` a aplicada (contadores 61 → 60 y 58 → 57); nota de ejemplo según el tipo de orden.
- [x] ADR-0361 reescrito y ajuste del punto 5 del ADR-0051.
- [x] Verificado en una copia de `main`: `tsc` y `eslint` en 0; 387 archivos / 156.458 pruebas del web; en el navegador con un servidor simulado: éxito, nombre repetido, casi igual, función ausente, vocabulario caído y sin modelos. Se encontró y corrigió un error real (los botones del aviso reenviaban el formulario: faltaba `type="button"`), con prueba de regresión.

### Pasadas de calidad (2026-10-10) — hechas, y los arreglos que Felipe eligió ya están aplicados

- [x] **Recorrido con datos reales en local** (como líder): «Prueba Short Taller A» nació `aprobado`, `SHO-0001`, 3 variantes a S/ 85,00 con costo 0, orden `en_proceso` 6/4/2; 9 tablas tocadas, ninguna de `stock` ni `movimientos`.
- [x] **`/chaos`** (semilla 1010; informe local `docs/taller-vista-inicial/chaos-informe-produccion-ordenes-2026-10-10.md`): 19 ataques corridos, 13 resistieron, 8 hallazgos (g2 ×4, g4 ×4), ninguno de gravedad 1; los 12 detectores sin violaciones nuevas. Fila en `docs/chaos/README.md`.
- [x] **`/formidable`** (`docs/formidable/produccion-nueva-orden.md`): leyes 4,8 y oficio 5; ciega ✓ con Opus (el ciego con Sonnet cayó dos veces por el filtro de seguridad), real sin probar; veredicto del escéptico sobre cada hallazgo. Fila en `docs/formidable/README.md`.
- [x] Corregido en los documentos: «un líder lo revisa» era falso (Felipe quitó el aviso «Pendiente de revisar» el 2026-10-02; ADR-0361, «Lo que “pendiente” significa hoy»).
- [x] **Arreglos aplicados (Felipe: «Reglas de la función», «Precio antes de Colores y carta cerrada», «“Falta” que explica y costos con coma», «“Pierde” y botón recortado, más los de gravedad 4»; la coma solo se explica, no se acepta)**, cada grupo en su commit, con la prueba que falla primero:
  - [x] La función valida nombre ≤ 80 y nota ≤ 200, precio a céntimos ≥ 0.01 y ≤ 99,999.99 sin `NaN`, costos sin `NaN`/negativos y ≤ 999,999.99, talla obligatoria en categorías con tallas y uuid mal escrito (migración `20261009120000`, 35 casos SQL: 12 de los nuevos fallan contra la migración vieja).
  - [x] La pantalla lee los montos estricto y dice qué hacer a la vista (`PieGuia conFrase`); nombre con `maxLength` y sin caracteres de control; Tela, Avíos y Maquila dicen «Opcional».
  - [x] Precio antes de Colores y la carta de 89 colores cerrada solo en «Modelo nuevo» (`ElegirColores cartaAbierta`, por defecto `true`).
  - [x] «Pierde» → «Margen bajo» (una sola fuente en `lib/produccion-reglas.ts`) y el botón «Crear y abrir orden» cabe a 375 px.
  - [x] Doble clic = 1 llamada; «No podemos confirmar si llegó a guardarse» tras perder la respuesta; «¿Salir sin guardar?» con trabajo escrito.
- [x] **Mismos ataques, misma semilla, tras los arreglos:** ENT-03, ENT-07, ENT-14, DC-01, RS-03 y NAV-04 resisten; 0 violaciones nuevas; la base se restauró idéntica. Remedido a 1440 × 900: del nombre a «Cuántas por talla y color» **413 px y no 1.199**; a 375 px el botón no se recorta. La prueba ciega **no se repitió**.

### Lo que NO se aplicó (queda abierto)

- [ ] **Del núcleo, es de Felipe:** los CHECK `>= 0` de `variantes` y `producciones` admiten `NaN`, y `abrir_produccion` acepta un costo `NaN` si se la llama directo (un `NaN` llegaría a `variantes.costo` al cerrar: [inferido], sin probar con `ROLLBACK`). Arreglo sugerido: `CHECK (precio >= 0 and precio <> 'NaN')` y lo mismo en los costos, y la misma validación dentro de `abrir_produccion`.
- [ ] **Aceptar la coma decimal** («12,50» = 12.50): decidido «solo explicar»; si algún día se acepta, es leer dinero distinto y pide una regla para «1,299.50» y «1.299,50» (precedente: `recibir-produccion-reglas.ts:78`).
- [ ] De la lista aparte de `/formidable`: borrador que sobrevive a Escape, callejones (sin modelos y sin vocabulario; «Ese modelo ya existe» sin botón), rojo por celda con cantidad, bordes dobles, rótulos «Modelo / Ya existe · Modelo nuevo», «ficha viva» de la prenda y el ADR del sistema para las etiquetas de 11 px.

### Pendiente — en este orden

- [ ] **Felipe: pegar la migración `20261009120000` en producción ANTES de fusionar y publicar la web.** Una sola parte (solo una función y sus permisos), idempotente; ensayar antes con `begin; …; rollback;`. Verificar después con `select proname from pg_proc where proname = 'abrir_produccion_con_modelo_nuevo'` (1 fila). Si los arreglos #1, #2 y #4 se aprueban, van **dentro de esta misma migración** (todavía no está en producción). Si la web sale antes, «Modelo nuevo» avisa que aún no está activo y no se cae.
- [ ] **Ver la pantalla del colaborador del Taller sin permiso de catálogo** (no se hizo en el navegador por decisión de Felipe de no tocar permisos; en SQL está probado, casos 2 y 2b). Receta **validada con `ROLLBACK`** (Micaela pasa a poder operar el Taller y a no poder editar el catálogo), solo en la base local:
  ```bash
  node scripts/flujo-de-negocio/estado.mjs guardar vista-colaborador --reemplazar
  docker exec -i supabase_db_cayla-retail psql -U supabase_admin -d postgres -c "
    update retail.colaboradores set ubicacion_asignada_id = (select id from retail.ubicaciones where tipo='taller')
      where persona_id = (select p.id from public.personas p join auth.users u on u.id = p.auth_user_id where u.email = 'micaela@cayla.local');
    delete from retail.rol_modulos where rol_id = (select id from retail.roles where nombre = 'Integrante') and modulo in ('productos','atributos');"
  # entrar como micaela@cayla.local ▸ Producción ▸ Órdenes ▸ Nueva orden ▸ Modelo nuevo: no debe verse «Créalo en Productos»; el modelo nace pendiente
  node scripts/flujo-de-negocio/estado.mjs restaurar vista-colaborador --si
  ```
  *(El restaurar deshace también lo que escriba cualquier otra sesión mientras tanto: comprobar antes que nadie más esté escribiendo.)*
- [ ] **`cerrar_produccion` con costo `NaN`** (inferido, no probado): abrir una orden con `p_costo_tela = 'NaN'` y cerrarla en una transacción con `ROLLBACK` para ver si `variantes.costo` queda en `NaN`. Si sí, es del núcleo de Producción (ADR-0052): de Felipe.
- [ ] Pasada de `/formidable` con **3 a 5 colaboradoras reales** del Taller, en su equipo (la ley 1 no pasa de 8 sin ella).
- [ ] La rama partió de `main` en `d6acc5ce`; `main` ya avanzó (29 commits al 2026-10-10). Al abrir el PR puede pedir ponerse al día; los dos contadores de `lib/guia-de-foco-pantallas.ts` y `lib/sugerir-archivos.ts` son los que más chocan (sumar a mano). **No hay PR abierto.**

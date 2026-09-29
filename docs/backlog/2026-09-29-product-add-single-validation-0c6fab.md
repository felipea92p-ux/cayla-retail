## 🧾 Una identidad para todo el alta de producto (2026-09-29, ADR-0283) — solo web, sin migración; rama `claude/product-add-single-validation-0c6fab`

**Estado:** hecho en la rama; pruebas (153 027), `tsc` y `eslint` en verde; el recuadro se vio en el navegador con una sesión de Admin
(escritorio y 375 px, sin errores de consola ni de servidor). **El camino de una terminal no se pudo ejercer en local** (falta la asistencia de Dynamic).

- [x] `lib/identidad-alta-reglas.ts` (+ prueba) y `components/alta-producto/IdentidadAlta.tsx` (contexto, `useFirmaDeMitad`, `QuienRegistra`, `AvisoSinIdentidad`).
- [x] Los ocho componentes del alta firman con la identidad del alta; el paso 4 muestra el nombre con «Cambiar»; guardar con éxito ya no suelta la identidad.
- [ ] **Probar con una terminal (o en producción con una cuenta de persona):** abrir «Nueva prenda», crear un color y una marca nuevos,
      comprobar `retail.colores.propuesto_por`, tocar «Crear otro parecido» (sigue el nombre) y salir y volver (vacío en terminal).
- [ ] **Decidir si la identidad debe caducar** si otra colaboradora toma la terminal sin salir de «Nueva prenda» (hoy se conserva hasta
      salir; riesgo aceptado por Felipe, mitigado con el nombre visible arriba y en el paso 4).
- [ ] Las otras veinte acciones del ADR-0280 siguen sin nombre en una terminal (la pregunta abierta de «último responsable del turno»
      queda para ellas). Y seis claves `alta_producto_*` de `retail.acciones_sin_responsable` ya no se usan en la web: se pueden quitar en una migración futura.

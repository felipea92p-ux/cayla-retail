## 🎛️ Filtro de Color de Productos: misma escala, casillas honestas y rótulo (2026-10-02, ADR-0312 act. c) — solo web, sin migración; rama `claude/filtro-color-claro`

- [x] Los tonos de cada familia salen en la escala de la carta (`opcionesDeColor` con `enEscala`), no alfabéticos.
- [x] Casillas como árbol: familia marcada ⇒ tonos incluidos; algunos tonos ⇒ familia parcial (−); tocar un tono de una familia marcada la abre en sus otros tonos; el último tono recompone la familia (`estadoDeColor`, `alternarColor`; 37 casos).
- [x] Jerarquía visible (encabezado, sangría, muestras de 14 px con borde del propio tono, textura jaspeada) y rótulo «Prendas · una con varios colores cuenta en cada uno».
- [x] `agruparPorFamilia` única para Nuevo producto, Atributos y el filtro; una familia desconocida sale con su nombre, no «Sin familia».
- [x] Verificado con el componente real en Chrome sin ventana, 1280 y 375 px (dentro de la hoja): sin desborde ni errores; la URL va `familia=neutro` → `color=…` → `familia=neutro`. Suite completa: 312 archivos, 154.946 pruebas.
- [ ] **Sin probar con datos y sesión reales** (solo el componente con los 75 colores y cifras de ejemplo): conviene mirarlo en producción tras el despliegue.
- [ ] La captura de Atributos con «Sin familia 7» coincide con una pestaña abierta antes del despliegue de #736 (despliegue `success` a las 22:42Z): recargar. Desde aquí no se puede inspeccionar el código servido (protegido por inicio de sesión de Vercel).
- [ ] **Pedido de Felipe (nuevo):** completar colores de las familias más pobres (Rosado 3, Naranja 4, Rojo 5, Amarillo 5): requiere proponer la lista, anclarla a Pantone TCX y una migración. Ver la propuesta aparte.

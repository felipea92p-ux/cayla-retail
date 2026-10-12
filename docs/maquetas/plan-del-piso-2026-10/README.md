# Spike visual · Plan del piso ▸ Propuesta (2026-10-11)

> **Decidido (Felipe, 2026-10-11): la dirección A, «La percha».** Se lleva al ERP en la rama `claude/plan-del-piso-percha`; la tabla de detalle y la mancuerna se **quedan**, rediseñadas con el lenguaje de A. B y C quedan como referencia. Lo que sigue describe el spike tal como se dibujó.
>
> *(Antes de decidir:)* Nada de esto está en el ERP. Datos **inventados** (Tienda AQP, sábado 10 de octubre, 21:14).
> Nació de que Felipe vio el rediseño del PR #944 (riel en dos barras, tres tarjetas, aviso) y dijo que **el estilo general no lo convenció**.
> No dijo qué le molestaba: en vez de adivinar, se dibujaron tres direcciones distintas para que **elija mirando**.

Abrir `plan-del-piso.html` en el navegador. La barra negra cambia **Diseño** (Actual, A, B, C), **Tema** (claro u oscuro) y **Vista**
(escritorio 1440 · laptop con el menú abierto a 1024, donde el contenido mide 657 px · celular 375 px).

## Los cuatro diseños
- **Actual (PR #944)** — reconstrucción fiel de lo que está en `main`, para comparar. Conserva a propósito sus defectos conocidos (jerga como «Peso de la venta», aviso apretado a 375 px, ejes que se pisan).
- **A · La percha** — el riel dibujado como pictograma: cada percha vale 50 prendas, con una silueta de prenda por grupo. «Hoy» son 3 perchas y «1,722 lugares libres». Gana calidez y marca; pierde la tabla numérica por grupo.
- **B · La frase primero** — editorial: una frase de veredicto en serif grande y una sola lista de seis grupos con «le falta / en su lugar / le sobra». Gana calma; pierde el riel dibujado, la mancuerna y la tabla (el cálculo queda plegado).
- **C · Un grupo, una tarjeta** — seis tarjetas, cada una con su ícono, «hoy → propuesta», un veredicto y un «¿Por qué?» que explica el cálculo en palabras. Gana que cada grupo se explica solo; pierde la vista de conjunto del riel.

## Lo que se corrigió al revisarlas (un revisor escéptico por diseño)
- **Las tres direcciones nuevas afirmaban «78 prendas cuelgan» como un hecho.** Son lo que el sistema cree: la sede no ha cuadrado su piso. Ahora dicen «según el sistema» y el veredicto es condicional.
- B escondía las 5 ventas confirmadas dentro de un plegable cerrado; ahora la nota visible dice que casi todo el reparto sigue a las tiendas de ropa en general.
- C mezclaba unidades en «30 → 788» (prendas contra ganchos) y llamaba «parejo» a un grupo con 14 prendas en un riel al 4 %; ahora lo aclara y el protagonista es «78 de 1,800».
- Colores sueltos, movimiento fuera de regla (solo `transform` y `opacity`, ≤ 500 ms), selectores sin prefijo y contrastes bajo AA (siluetas de Bodys en A).

## Para decidir (no los resolvió ningún revisor)
- **B:** «Le sobra» sobre Abrigo (16 prendas en un riel al 4 %) choca con la intuición: la cifra compara el reparto, no cantidades. ¿Otra palabra? ¿Un gráfico de llenado aparte?
- **C:** el «¿Por qué?» del primer grupo viene abierto para que se vea el patrón; a 375 px son unos 4,300 px de alto. Y «hoy → propuesta» sigue comparando prendas con ganchos.
- **A:** a 375 px el riel de la propuesta se parte en tres filas; las perchas parciales salen angostas (es honesto, pero se deforma).
- **Todas:** falta la prueba ciega con alguien sin contexto y con colaboradoras reales (`/formidable`); y los botones «Revisar en Grupos» son maqueta (no navegan).
- **Actual:** ¿se compara con sus defectos tal cual (como está) o corregido?

## Cómo se hizo
`BRIEF.md` (reglas y verdades que no se pueden ocultar), `base.html` (tokens reales de `globals.css`/`tema.css`, marco y `window.DATOS`), `fragmentos/<id>.html` (un archivo por diseño, selectores con prefijo propio),
`armar.mjs` (los junta en `plan-del-piso.html`) y `capturar.mjs` (capturas con el Chrome instalado, sin usar el navegador del app).

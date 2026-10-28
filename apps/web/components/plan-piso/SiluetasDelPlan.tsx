// Las siluetas del Plan del piso, dibujadas UNA vez por pantalla y usadas con <use> (maqueta A, ADR-0352 act. 2026-10-11): la percha (`pp-h`) y la prenda
// de cada grupo (`pp-s-<clave>`). La prenda sin foto se dibuja como el ícono de su categoría sobre el color de su grupo, nunca como el logo (ADR-0333).
// Una silueta es un dibujo sencillo y reconocible, no un retrato: lo que importa es leer «blusa», «jean», «vestido» a 15 px. Un grupo nuevo sin dibujo propio
// usa `pp-s-otro` (`lib/plan-piso-siluetas.ts`). El color no está aquí: lo pone quien usa la silueta con `--pp-c` (`--grupo-N`, en `plan-piso.css`).
export function SiluetasDelPlan() {
  return (
    <svg className="pp-defs" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="pp-h" viewBox="0 0 40 60">
          <g className="pp-hg">
            <path d="M20 12 V8 C20 5 21.6 3.2 23.7 3.2 C25.7 3.2 27.2 4.6 27.2 6.4" />
            <path d="M20 12 L4.5 24.5 H35.5 Z" />
          </g>
        </symbol>
        {/* «Polos, tops y blusas» dibuja tres prendas, no una (Felipe, 2026-10-13; `lib/plan-piso-siluetas.ts`): el polo (la primera, la de siempre), el top de
            tirantes anchos y la blusa de escote en V con manga acampanada. Las tres caben en el mismo 40 × 60 y se leen a 15 px. */}
        <symbol id="pp-s-polos_tops_blusas" viewBox="0 0 40 60">
          <path d="M14.5 17.5 L4.5 22.5 L8 30 L13 27.5 L13 53.5 Q20 55.5 27 53.5 L27 27.5 L32 30 L35.5 22.5 L25.5 17.5 C24 21.2 16 21.2 14.5 17.5 Z" />
        </symbol>
        <symbol id="pp-s-polos_tops_blusas_top" viewBox="0 0 40 60">
          <path d="M13.5 17 L18 17 C18.5 24 21.5 24 22 17 L26.5 17 C26.5 24 28 27.5 29.5 29.5 L28.5 51.5 Q20 53.5 11.5 51.5 L10.5 29.5 C12 27.5 13.5 24 13.5 17 Z" />
          <path className="pp-d" d="M10.9 47.5 H29.1" />
        </symbol>
        <symbol id="pp-s-polos_tops_blusas_blusa" viewBox="0 0 40 60">
          <path d="M15 17.5 L20 25.5 L25 17.5 L31.5 19.2 C34 20.5 36.4 29 37.2 38 L30.2 37 C29.8 34 29 31.5 28.2 29.5 L30.5 54 Q20 57 9.5 54 L11.8 29.5 C11 31.5 10.2 34 9.8 37 L2.8 38 C3.6 29 6 20.5 8.5 19.2 Z" />
          <path className="pp-d" d="M16.2 19.6 L20 24 L23.8 19.6 M10.6 50.5 Q20 53.5 29.4 50.5" />
        </symbol>
        <symbol id="pp-s-jeans" viewBox="0 0 40 60">
          <path d="M12 17.5 H28 L30.8 55.5 H21.3 L20 31 L18.7 55.5 H9.2 Z" />
          <path className="pp-d" d="M12.2 22 H27.8 M20 22 V31" />
        </symbol>
        <symbol id="pp-s-pantalones_faldas_shorts" viewBox="0 0 40 60">
          <path d="M13 17.5 H27 L27.8 23 L36 53 Q20 57.5 4 53 L12.2 23 Z" />
          <path className="pp-d" d="M12.4 23 H27.6" />
        </symbol>
        <symbol id="pp-s-vestidos_conjuntos" viewBox="0 0 40 60">
          <path d="M14.5 16.5 L17 16.5 L18.2 22.5 C19.2 24.3 20.8 24.3 21.8 22.5 L23 16.5 L25.5 16.5 L26.8 27 L24.4 32 L36 55 Q20 59 4 55 L15.6 32 L13.2 27 Z" />
          <path className="pp-d" d="M15.8 32 H24.2" />
        </symbol>
        <symbol id="pp-s-bodys_corsets_lenceria" viewBox="0 0 40 60">
          <path d="M13.5 16.5 L16.8 16.5 L18 22 C19 24.2 21 24.2 22 22 L23.2 16.5 L26.5 16.5 L27.8 27 C27.8 31.5 25.6 33.5 25.6 37.5 C29 39.5 31 43.5 31 47.5 C27.8 46.8 24.6 47.8 23.2 52 H16.8 C15.4 47.8 12.2 46.8 9 47.5 C9 43.5 11 39.5 14.4 37.5 C14.4 33.5 12.2 31.5 12.2 27 Z" />
          <path className="pp-d" d="M13.8 28 H26.2" />
        </symbol>
        <symbol id="pp-s-abrigo_y_capas" viewBox="0 0 40 60">
          <path d="M14 17 L7.2 20.4 L4 49 H10 L11.4 31.5 V56 H28.6 V31.5 L30 49 H36 L32.8 20.4 L26 17 L20 26.5 Z" />
          <path className="pp-d" d="M20 26.5 V56 M14.6 18.5 L17.8 32 M25.4 18.5 L22.2 32" />
        </symbol>
        <symbol id="pp-s-accesorios_de_impulso" viewBox="0 0 40 60">
          <path d="M5 27 H17.5 V34.5 C17.5 39 14.5 41.5 11.2 41.5 C7.8 41.5 5 39 5 34.5 Z" />
          <path d="M22.5 27 H35 V34.5 C35 39 32.2 41.5 28.8 41.5 C25.5 41.5 22.5 39 22.5 34.5 Z" />
          <path className="pp-hd" d="M17.5 29.5 Q20 27.4 22.5 29.5 M5 28 L2.5 25.5 M35 28 L37.5 25.5" />
        </symbol>
        <symbol id="pp-s-bolsos_y_calzado" viewBox="0 0 40 60">
          <path d="M7 30 H33 L35.5 52 Q35.5 54.5 33 54.5 H7 Q4.5 54.5 4.5 52 Z" />
          <path className="pp-hd" d="M13.5 30 V25 C13.5 19.5 26.5 19.5 26.5 25 V30" />
          <path className="pp-d" d="M5.5 38 H34.5" />
        </symbol>
        <symbol id="pp-s-otro" viewBox="0 0 40 60">
          <path d="M14 17.5 L6 21.5 L9 29 L13 27.5 L13 53 H27 L27 27.5 L31 29 L34 21.5 L26 17.5 C24 20 16 20 14 17.5 Z" />
        </symbol>
      </defs>
    </svg>
  );
}

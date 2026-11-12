#!/usr/bin/env perl
# /textos · auditar — el colador de textos que rompen las reglas (SKILL.md, «Cómo se usa ▸ auditar»).
#
# Uso (desde cualquier carpeta del repo):
#   perl .claude/skills/textos/referencia/auditar.pl                         # todo apps/web: app, components, lib
#   perl .claude/skills/textos/referencia/auditar.pl components/CerrarCajaModalV2.tsx  # solo esas rutas (relativas a apps/web)
#   SOLO=R10 perl .claude/skills/textos/referencia/auditar.pl                # una sola regla
#   CONTAR=1 perl .claude/skills/textos/referencia/auditar.pl                # solo la cuenta por regla (el tablero)
#
# Es un COLADOR, no un juez: no distingue en todos los casos un texto visible de un identificador. Cada hallazgo se LEE
# antes de cambiarlo. Ya descarta: las pruebas (*.test.ts[x]), las huellas de guías, los comentarios (`//`, `/* … */`,
# `{/* … */}`, quitados antes de mirar sin mover los números de línea) y las líneas eximidas con
# `// textos-fijo: <por qué>` (10 caracteres o más). Solo lee; no escribe nada.
use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));
use File::Find;
use Cwd qw(abs_path);
use File::Basename qw(dirname);

my $raiz = `git -C "@{[dirname(abs_path($0))]}" rev-parse --show-toplevel 2>/dev/null`;
chomp $raiz;
die "No encuentro la raíz del repo\n" unless $raiz && -d "$raiz/apps/web";
chdir "$raiz/apps/web" or die "No puedo entrar a apps/web\n";
my @rutas = @ARGV ? @ARGV : qw(app components lib);

# Un texto entre comillas o un texto de JSX: lo que viene después de « " ' ` > » sin cerrar.
my $T = qr{["'`>][^"'`<>]*};
my $SIGLAS = qr{(?:SUNAT|IGV|RUC|DNI|PDF|CSV|SKU|CAYLA|AQP|TRU|LIM|USD|PEN|POS|WEB|SBI|ISC|NIUBIZ|BCP|BBVA|IBK|OK)};

my @reglas = (
  # ── Vocabulario (CLAUDE.md «Vocabulario obligatorio», ADR-0288 act. k) ──
  [R01 => "«clienta/socia» en pantalla (se dice cliente; en el club, miembro)",
    qr{\b(?:[Ll]as?|[Uu]nas?|[Tt]us?|[Ss]us?|[Cc]ada|[Oo]tras?|[Nn]uevas?|[Ee]stas?|[Ee]sas?|[Dd]e la|[Aa] la)\s+(?:clientas?|socias?)\b}],
  [R02 => "empleado/jefe/sucursal (colaborador o integrante · líder o encargado · sede)",
    qr{$T\b(?:[Ee]mplead[oa]s?|[Jj]ef[ea]s?|[Ss]ucursal(?:es)?)\b}],
  [R03 => "«Bienvenido/a» con género (se dice «Te damos la bienvenida»)",
    qr{\b[Bb]ienvenid(?:o|a|os|as)(?:\(a\)|\(o\)|(?=[\s,.!:]|$))}],
  [R04 => "«usted» o su imperativo (el ERP tutea: «Escribe», no «Ingrese»)",
    qr{$T\b(?:[Uu]sted|Ingrese|Seleccione|Haga|Elija|Escriba|Presione|Verifique|Intente|Comuníquese|Digite)\b}],
  # ── Botones y acciones (tabla «Una función, una pieza», ADR-0358) ──
  [R05 => "«Exportar» (se dice «Descargar» + qué, con <BotonDescargar>)",
    qr{$T\bExportar\b}],
  [R06 => "botón genérico, sin decir qué hace (OK, Aceptar, Enviar, Sí, Submit)",
    qr{>\s*(?:OK|Ok|Aceptar|Enviar|Submit|Sí|Si)\s*<}],
  [R07 => "MAYÚSCULAS escritas a mano (la versalita la pone el lugar o la clase)",
    qr{>\s*(?!$SIGLAS\s*<)\p{Lu}{4,}(?:\s+[\p{Lu}\d]{2,})*\s*<}],
  [R08 => "Mayúscula De Título tras un verbo (solo la inicial: «Nuevo producto»)",
    qr{>\s*(?:Nuev[oa]|Agregar|Guardar|Crear|Ver|Registrar|Editar|Descargar|Imprimir|Buscar|Cancelar|Confirmar|Anular)\s+(?!(?:$SIGLAS|Excel|Yape|Plin|WhatsApp|Lucode|Shopify|Mercado|Instagram|Interbank|Google)\b)\p{Lu}\p{Ll}}],
  [R09 => "«clic aquí / haz clic» (el botón dice lo que hace; en una frase, «toca» o «elige»)",
    qr{$T(?:\bClick\s+\p{L}|\b[Cc]lick aquí|[Hh]az clic|[Dd]a clic|[Cc]liquea|[Cc]lic aquí|[Pp]resiona aquí)}],
  # ── Errores (ADR-0022, NN/g; «errores en tres líneas» de Formidable) ──
  [R10 => "«inválido/incorrecto/erróneo» (di qué falta o cómo se escribe)",
    qr{$T\b(?:[Ii]nválid[oa]s?|[Nn]o válid[oa]s?|[Ii]ncorrect[oa]s?|[Ee]rróne[oa]s?)\b}],
  [R11 => "«Error:» o un error que no dice nada («Ocurrió un error», «Algo salió mal»)",
    qr{["'`>]\s*(?:Error\s*[:.!]|Ha ocurrido un error|Ocurrió un error|Algo salió mal|Error desconocido|Hubo un error|Error inesperado)}],
  [R12 => "signo de exclamación en un error o una advertencia",
    qr{(?:avisar\.(?:error|aviso)|setError|marcarError|traducirError)\(\s*(?:[^,()"'`]*,\s*)?["'`][^"'`]*(?:¡|!(?![.\[(]))}],
  [R13 => "«Por favor» (sobra: el pedido claro ya es amable)",
    qr{$T\b[Pp]or favor\b}],
  [R14 => "«exitosamente / satisfactoriamente / con éxito» (di qué pasó: «Venta guardada»)",
    qr{$T\b(?:exitosamente|satisfactoriamente|con éxito)\b}],
  # ── Espera y formatos (ADR-0149, ADR-0413) ──
  [R15 => "tres puntos «...» (es «…», un solo carácter)",
    qr{$T\p{L}\.\.\.(?=["'`<]|\s*$)}],
  [R16 => "«Cargando…» suelto (el loader es uno solo; dentro de una sección, esqueleto)",
    qr{(?:>\s*|["'`])Cargando(?:…|\.\.\.)?\s*(?:<|["'`])}],
  [R17 => "«S/» pegado a la cifra o «S/.» (es «S/» + espacio duro + cifra)",
    qr{S/(?=\d)|S/\.\s?\d}],
  [R18 => "fecha, hora o número sin locale, o con en-US (el ERP escribe es-PE)",
    qr{\.toLocale(?:Date|Time)?String\(\s*\)|toLocale(?:Date|Time)?String\(\s*["'`]en-US|Intl\.(?:NumberFormat|DateTimeFormat)\(\s*["'`]en-US}],
);

my @archivos;
for my $r (@rutas) {
  if (-f $r) { push @archivos, $r; next; }
  next unless -d $r;
  find({ no_chdir => 1, wanted => sub {
    return unless /\.tsx?$/;
    return if /\.test\.tsx?$/ || m{/guias/huellas/} || m{/node_modules/};
    push @archivos, $File::Find::name;
  } }, $r);
}

# Cada archivo, sin comentarios y con sus números de línea intactos.
my %lineas;
for my $f (sort @archivos) {
  open my $fh, '<', $f or next;
  local $/; my $txt = <$fh>; close $fh;
  my @orig = split /\n/, $txt, -1;
  $txt =~ s{/\*.*?\*/}{ (my $m = $&) =~ s/[^\n]//g; $m }gse;   # bloque: deja solo los saltos de línea
  my @l = split /\n/, $txt, -1;
  for my $i (0 .. $#l) {
    next if $orig[$i] =~ /textos-fijo:\s*\S.{9,}/;
    (my $s = $l[$i]) =~ s{(?<![:"'`\w])//.*$}{};                  # de línea (respeta «https://»)
    push @{ $lineas{$f} }, [$i + 1, $s, $orig[$i]] if $s =~ /\S/;
  }
}

for my $r (@reglas) {
  my ($id, $que, $re) = @$r;
  next if $ENV{SOLO} && $ENV{SOLO} ne $id;
  my @h;
  for my $f (sort keys %lineas) {
    for my $l (@{ $lineas{$f} }) { push @h, "$f:$l->[0]: " . substr($l->[2] =~ s/^\s+//r, 0, 200) if $l->[1] =~ $re; }
  }
  printf "%-4s %4d  %s\n", $id, scalar @h, $que;
  if (!$ENV{CONTAR} && @h) { print "        $_\n" for @h; print "\n"; }
}

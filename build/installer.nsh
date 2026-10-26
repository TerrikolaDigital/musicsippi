; Checkbox de "borrar también mis datos guardados" en el desinstalador.
;
; Contexto: electron/main.cjs's prepararDatosDeUsuario() guarda la biblioteca
; real del usuario (biblioteca.json, ejes, favoritos, historial, cache) en
; %APPDATA%\Musicsippi\data — AFUERA de la carpeta de instalación a propósito,
; para que sobreviva a reinstalaciones/actualizaciones (ver uninstallOldVersion
; en node_modules/app-builder-lib: reinstalar borra $INSTDIR entero, pero
; nunca toca %APPDATA%). Consecuencia directa de esa decisión: un desinstalado
; normal tampoco borra esos datos — quedan huérfanos en %APPDATA% para
; siempre, sin que el usuario tenga forma de pedir lo contrario desde la UI.
; Este checkbox le da esa opción explícita, sin cambiar el comportamiento por
; defecto (que sigue siendo conservar).
;
; Por qué "customUninstallPage" y no una página anterior: este hook se
; inserta DESPUÉS de MUI_UNPAGE_INSTFILES (o sea, después de que ya se borró
; $INSTDIR) y ANTES de MUI_UNPAGE_FINISH — momento perfecto para una acción
; adicional e independiente como esta, porque %APPDATA%\Musicsippi no tiene
; ninguna relación con el borrado de $INSTDIR que ya ocurrió.
;
; Por qué esto NUNCA se dispara en una reinstalación/actualización: NSIS no
; muestra páginas custom (ni corre su función Leave) en modo silencioso, y
; uninstallOldVersion SIEMPRE invoca al desinstalador viejo con /S. Este
; checkbox solo puede aparecer cuando alguien desinstala Musicsippi a mano
; (Panel de control, o corriendo el Uninstall Musicsippi.exe directo).
!include nsDialogs.nsh

; electron-builder incluye este archivo SIN condicionar en las dos pasadas de
; compilación de NSIS (la del instalador y la del desinstalador embebido). Si
; estas Var/Function quedaran sueltas sin el !ifdef, la pasada del instalador
; las ve como "código de desinstalador huérfano" (nunca hay un WriteUninstaller
; en esa pasada) y NSIS tira el warning 6020 — que electron-builder trata como
; error fatal (warningsAsErrors). Por eso todo lo específico del desinstalador
; va adentro de este bloque, igual que hace uninstaller.nsh en las plantillas
; base de app-builder-lib.
!ifdef BUILD_UNINSTALLER
  Var dialogoBorrarDatos
  Var checkboxBorrarDatos
  Var estadoBorrarDatos
!endif

!macro customUninstallPage
  UninstPage custom un.paginaBorrarDatosCrear un.paginaBorrarDatosSalir
!macroend

!ifdef BUILD_UNINSTALLER
  Function un.paginaBorrarDatosCrear
    nsDialogs::Create 1018
    Pop $dialogoBorrarDatos

    ${If} $dialogoBorrarDatos == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 50u "Musicsippi guarda tu biblioteca importada, favoritos e historial en una carpeta separada de esta instalación, para que no se pierdan en futuras actualizaciones.$\r$\n$\r$\nSi no marcás la casilla, esos datos quedan intactos en tu carpeta de usuario y los vas a recuperar si volvés a instalar Musicsippi más adelante."
    Pop $0

    ${NSD_CreateCheckbox} 0 55u 100% 12u "Eliminar también mi biblioteca y datos guardados"
    Pop $checkboxBorrarDatos
    ${NSD_SetState} $checkboxBorrarDatos ${BST_UNCHECKED}

    nsDialogs::Show
  FunctionEnd

  Function un.paginaBorrarDatosSalir
    ${NSD_GetState} $checkboxBorrarDatos $estadoBorrarDatos
    ${If} $estadoBorrarDatos == ${BST_CHECKED}
      RMDir /r "$APPDATA\${APP_FILENAME}"
    ${EndIf}
  FunctionEnd
!endif

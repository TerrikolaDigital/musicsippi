package com.terrikola.musicsippi;

import android.graphics.Color;
import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.terrikola.musicsippi.reproductor.ReproductorNativoPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin local (no es un paquete npm): se registra antes de super.onCreate.
        registerPlugin(ReproductorNativoPlugin.class);
        // Si el sistema restaura la tarea tras matar el proceso, el intent original (un
        // «Compartir» viejo) vuelve en getIntent(): se descarta para no reprocesarlo.
        if (savedInstanceState != null) getIntent().setAction(null);
        super.onCreate(savedInstanceState);
        // Modo iframe: el iframe de YouTube debe poder arrancar el audio sin gesto
        // (siguiente pista con la pantalla bloqueada, reanudar desde la notificacion).
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        aspectoBarrasDelSistema();
        // «Atrás» (botón o gesto, también el predictivo de Android 13+): la navegación del
        // móvil vive en el historial del WebView. Sin historial, la app pasa a segundo plano
        // (la música sigue) en vez de cerrarse.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge().getWebView().canGoBack()) {
                    getBridge().getWebView().goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // El plugin SystemBars de Capacitor reescribe el aspecto según el tema del
        // sistema (claro => iconos oscuros): se reafirma al volver a la app.
        aspectoBarrasDelSistema();
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration nuevaConfiguracion) {
        super.onConfigurationChanged(nuevaConfiguracion);
        // uiMode está en configChanges: cambiar el tema claro/oscuro del sistema con la app
        // abierta no recrea la actividad, pero sí puede devolver los iconos oscuros.
        aspectoBarrasDelSistema();
    }

    /**
     * Android 15+ (targetSdk 36) fuerza edge-to-edge e ignora statusBarColor de los
     * estilos: la barra de estado salía blanca con iconos oscuros. Se pide aquí que los
     * iconos sean claros y que el fondo tras las barras sea el de la app (#0D0E18).
     */
    private void aspectoBarrasDelSistema() {
        int fondo = Color.parseColor("#0D0E18");
        getWindow().getDecorView().setBackgroundColor(fondo);
        getWindow().setStatusBarColor(fondo);
        getWindow().setNavigationBarColor(fondo);
        WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(false);
        c.setAppearanceLightNavigationBars(false);
    }
}

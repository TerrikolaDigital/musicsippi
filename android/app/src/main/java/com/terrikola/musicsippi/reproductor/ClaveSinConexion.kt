package com.terrikola.musicsippi.reproductor

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Clave AES de 16 bytes de la caché sin conexión. Se genera una vez y se guarda
 * envuelta (AES/GCM) con una clave del Android Keystore, que no sale del dispositivo.
 */
object ClaveSinConexion {
    private const val ALIAS = "musicsippi_sin_conexion"
    private const val PREFS = "sin_conexion_clave"
    private const val CAMPO = "clave"

    /** [nueva] indica que se acaba de generar: lo cifrado antes con otra clave no sirve. */
    class Clave(val bytes: ByteArray, val nueva: Boolean)

    @Volatile private var enMemoria: ByteArray? = null

    @Synchronized
    fun obtener(ctx: Context): Clave {
        enMemoria?.let { return Clave(it, false) }
        val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val guardada = prefs.getString(CAMPO, null)
        if (guardada != null) {
            try {
                val datos = Base64.decode(guardada, Base64.NO_WRAP)
                val cifrado = Cipher.getInstance("AES/GCM/NoPadding")
                cifrado.init(Cipher.DECRYPT_MODE, claveKeystore(), GCMParameterSpec(128, datos, 0, 12))
                return Clave(cifrado.doFinal(datos, 12, datos.size - 12).also { enMemoria = it }, false)
            } catch (_: Exception) {
                // Keystore reiniciado o dato corrupto: se genera una clave nueva
                // (lo cifrado con la anterior queda inservible y se redescarga).
            }
        }
        val nueva = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val cifrado = Cipher.getInstance("AES/GCM/NoPadding")
        cifrado.init(Cipher.ENCRYPT_MODE, claveKeystore())
        val envuelta = cifrado.iv + cifrado.doFinal(nueva)
        prefs.edit().putString(CAMPO, Base64.encodeToString(envuelta, Base64.NO_WRAP)).apply()
        enMemoria = nueva
        return Clave(nueva, true)
    }

    private fun claveKeystore(): SecretKey {
        val almacen = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (almacen.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generador.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generador.generateKey()
    }
}

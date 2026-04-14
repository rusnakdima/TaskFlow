package com.tcs.taskflow

import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor

class MainActivity : TauriActivity() {
    private var biometricCallback: ((Boolean, String?) -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PasskeyPlugin::class.java)
        super.onCreate(savedInstanceState)
        instance = this
        
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    companion object {
        private var instance: MainActivity? = null

        fun getInstance(): MainActivity? = instance
    }

    fun checkBiometricAvailable(): Boolean {
        val biometricManager = BiometricManager.from(this)
        return biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun authenticateBiometric(title: String, subtitle: String): Boolean {
        val executor: Executor = ContextCompat.getMainExecutor(this)
        var authResult = false
        val lock = java.util.concurrent.CountDownLatch(1)

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                authResult = false
                lock.countDown()
            }

            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                authResult = true
                lock.countDown()
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                authResult = false
            }
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        val biometricPrompt = BiometricPrompt(this, executor, callback)
        biometricPrompt.authenticate(promptInfo)

        try {
            lock.await(30, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            // timeout
        }

        return authResult
    }
}

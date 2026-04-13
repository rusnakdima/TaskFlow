package com.tcs.taskflow

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor

class BiometricHelper(private val activity: FragmentActivity) {
    private val executor: Executor = ContextCompat.getMainExecutor(activity)
    private val biometricManager: BiometricManager = BiometricManager.from(activity)

    fun canAuthenticate(): Int {
        return biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
    }

    fun isHardwareSupported(): Boolean {
        return when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> true
            else -> false
        }
    }

    fun authenticate(
        title: String,
        subtitle: String,
        negativeButtonText: String,
        callback: BiometricCallback
    ) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText(negativeButtonText)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        val biometricPrompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                callback.onError(errorCode, errString.toString())
            }

            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                callback.onSuccess()
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                callback.onFailed()
            }
        })

        biometricPrompt.authenticate(promptInfo)
    }

    interface BiometricCallback {
        fun onSuccess()
        fun onError(errorCode: Int, errorMessage: String)
        fun onFailed()
    }

    companion object {
        const val BIOMETRIC_ERROR_NO_HARDWARE = 1
        const val BIOMETRIC_ERROR_HW_UNAVAILABLE = 2
        const val BIOMETRIC_ERROR_NONE_ENROLLED = 3
        const val BIOMETRIC_ERROR_AVAILABLE = 0
    }
}

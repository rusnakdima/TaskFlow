package com.tcs.taskflow

import android.app.Activity
import androidx.credentials.*
import androidx.credentials.exceptions.*
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@TauriPlugin
class PasskeyPlugin(private val activity: Activity) : Plugin(activity) {
    private val credentialManager = CredentialManager.create(activity)

    @Command
    fun createPasskey(invoke: Invoke) {
        val requestJson = invoke.getString("requestJson") ?: run {
            invoke.reject("Missing requestJson")
            return
        }

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val request = CreatePublicKeyCredentialRequest(
                    requestJson = requestJson,
                    preferImmediatelyAvailableCredentials = false
                )
                val result = credentialManager.createCredential(activity, request)
                val response = result as CreatePublicKeyCredentialResponse
                val ret = JSObject()
                ret.put("responseJson", response.registrationResponseJson)
                invoke.resolve(ret)
            } catch (e: CreateCredentialException) {
                invoke.reject("Create failed: ${e.message}", e.errorCode.toString())
            }
        }
    }

    @Command
    fun getPasskey(invoke: Invoke) {
        val requestJson = invoke.getString("requestJson") ?: run {
            invoke.reject("Missing requestJson")
            return
        }

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val request = GetCredentialRequest(
                    listOf(GetPublicKeyCredentialOption(requestJson = requestJson))
                )
                val result = credentialManager.getCredential(activity, request)
                val credential = result.credential as PublicKeyCredential
                val ret = JSObject()
                ret.put("responseJson", credential.authenticationResponseJson)
                invoke.resolve(ret)
            } catch (e: GetCredentialException) {
                invoke.reject("Get failed: ${e.message}", e.errorCode.toString())
            }
        }
    }
}
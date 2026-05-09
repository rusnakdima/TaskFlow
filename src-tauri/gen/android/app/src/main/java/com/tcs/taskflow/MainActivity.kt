package com.tcs.taskflow

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    WindowCompat.setDecorFitsSystemWindows(window, false)

    val rootView = findViewById<View>(android.R.id.content)
    rootView.setOnApplyWindowInsetsListener { v, platformInsets ->
      val compatInsets = WindowInsetsCompat.toWindowInsetsCompat(platformInsets)
      val systemBars = compatInsets.getInsets(WindowInsetsCompat.Type.systemBars())
      v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
      platformInsets
    }
  }
}

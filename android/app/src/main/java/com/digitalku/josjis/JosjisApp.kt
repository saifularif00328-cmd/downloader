package com.digitalku.josjis

import android.app.Application

class JosjisApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Engine.init(this)
    }
}

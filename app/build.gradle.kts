plugins {
    id("com.android.application")
}

android {
    namespace = "de.fixcash.app"
    compileSdk = 35
    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "de.fixcash.app"
        minSdk = 23
        targetSdk = 35
        versionCode = providers.gradleProperty("appVersionCode").orNull?.toInt() ?: 1
        versionName = providers.gradleProperty("appVersionName").orNull ?: "1.0.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file(providers.gradleProperty("releaseStoreFile").orNull ?: "release-key.jks")
            storePassword = providers.gradleProperty("releaseStorePassword").orNull ?: ""
            keyAlias = providers.gradleProperty("releaseKeyAlias").orNull ?: ""
            keyPassword = providers.gradleProperty("releaseKeyPassword").orNull ?: ""
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
}

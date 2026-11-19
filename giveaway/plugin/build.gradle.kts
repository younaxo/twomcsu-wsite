plugins {
    java
}

group = "ru.twomc"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://hub.spigotmc.org/nexus/content/repositories/snapshots/") {
        content { includeGroup("org.spigotmc") }
    }
    maven("https://repo.extendedclip.com/content/repositories/placeholderapi/") {
        content { includeGroup("me.clip") }
    }
}

dependencies {
    // Стабильный Bukkit/Spigot API; на сервере API предоставляет сам сервер. Без NMS и Paper-API.
    compileOnly("org.spigotmc:spigot-api:1.21.4-R0.1-SNAPSHOT")
    // PlaceholderAPI: softdepend, на сервере предоставляется плагином; версия закреплена.
    compileOnly("me.clip:placeholderapi:2.11.6")

    testImplementation(platform("org.junit:junit-bom:5.11.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(21)
}

tasks.processResources {
    inputs.property("version", project.version)
    filesMatching("plugin.yml") {
        expand("version" to project.version)
    }
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = false
    }
}

tasks.jar {
    archiveBaseName.set("TwoMCGiveaway")
}

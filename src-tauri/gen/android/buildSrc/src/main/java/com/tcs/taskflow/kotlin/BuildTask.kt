import java.io.File
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        try {
            runTauriCli("node")
        } catch (e: Exception) {
            throw GradleException("Failed to run tauri CLI: ${e.message}", e)
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        val tauriPath = npmTauriPath
        val workingDir = File(project.projectDir, rootDirRel)

        val argsList = mutableListOf<String>()
        argsList.add("android")
        argsList.add("android-studio-script")
        if (project.logger.isEnabled(LogLevel.DEBUG)) {
            argsList.add("-vv")
        } else if (project.logger.isEnabled(LogLevel.INFO)) {
            argsList.add("-v")
        }
        if (release) {
            argsList.add("--release")
        }

        project.exec {
            workingDir(workingDir)
            executable(tauriPath)
            args(argsList)
        }.assertNormalExitValue()
    }

    @get:Internal
    val npmTauriPath: String
        get() {
            val rootDirRel = rootDirRel ?: return "tauri"
            val rootDir = File(project.projectDir, rootDirRel)
            val tauriBin = File(rootDir, "node_modules/.bin/tauri")
            return if (tauriBin.exists()) tauriBin.absolutePath else "tauri"
        }
}
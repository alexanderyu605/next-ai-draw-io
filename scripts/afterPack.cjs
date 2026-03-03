/**
 * electron-builder afterPack hook
 * Copies node_modules to the standalone directory in the packaged app
 * and ad-hoc signs macOS apps for offline draw.io bundle compatibility
 */

const {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    statSync,
} = require("fs")
const path = require("path")
const { execSync } = require("child_process")

/**
 * Copy directory recursively, converting symlinks to regular files/directories.
 * This is needed because cpSync with dereference:true does NOT convert symlinks.
 * macOS codesign fails if bundle contains symlinks pointing outside the bundle.
 */
function copyDereferenced(src, dst) {
    const lstat = lstatSync(src)

    if (lstat.isSymbolicLink()) {
        // Follow symlink and check what it points to
        const stat = statSync(src)
        if (stat.isDirectory()) {
            // Symlink to directory: recursively copy the directory contents
            mkdirSync(dst, { recursive: true })
            for (const entry of readdirSync(src)) {
                copyDereferenced(path.join(src, entry), path.join(dst, entry))
            }
        } else {
            // Symlink to file: copy the actual file content
            mkdirSync(path.join(dst, ".."), { recursive: true })
            copyFileSync(src, dst)
        }
    } else if (lstat.isDirectory()) {
        mkdirSync(dst, { recursive: true })
        for (const entry of readdirSync(src)) {
            copyDereferenced(path.join(src, entry), path.join(dst, entry))
        }
    } else {
        mkdirSync(path.join(dst, ".."), { recursive: true })
        copyFileSync(src, dst)
    }
}

module.exports = async (context) => {
    const appOutDir = context.appOutDir
    const resourcesDir = path.join(
        appOutDir,
        context.packager.platform.name === "mac"
            ? `${context.packager.appInfo.productFilename}.app/Contents/Resources`
            : "resources",
    )
    const standaloneDir = path.join(resourcesDir, "standalone")
    const sourceNodeModules = path.join(
        context.packager.projectDir,
        "electron-standalone",
        "node_modules",
    )
    const targetNodeModules = path.join(standaloneDir, "node_modules")

    console.log(`[afterPack] Copying node_modules to ${targetNodeModules}`)

    if (existsSync(sourceNodeModules) && existsSync(standaloneDir)) {
        copyDereferenced(sourceNodeModules, targetNodeModules)
        console.log("[afterPack] node_modules copied successfully")
    } else {
        console.error("[afterPack] Source or target directory not found!")
        console.error(
            `  Source: ${sourceNodeModules} exists: ${existsSync(sourceNodeModules)}`,
        )
        console.error(
            `  Target dir: ${standaloneDir} exists: ${existsSync(standaloneDir)}`,
        )
        throw new Error(
            "[afterPack] Failed: Required directories not found. " +
                "Ensure 'npm run electron:prepare' was run before building.",
        )
    }

    // Copy Electron binary files for Windows
    if (context.packager.platform.name === "win") {
        const sourceElectronDir = path.join(
            context.packager.projectDir,
            "node_modules",
            "electron",
            "dist"
        )
        console.log(`[afterPack] Copying Electron binaries to ${appOutDir}`)

        const filesToCopy = [
            "electron.exe",
            "chrome_100_percent.pak",
            "chrome_200_percent.pak",
            "d3dcompiler_47.dll",
            "dxcompiler.dll",
            "dxil.dll",
            "ffmpeg.dll",
            "icudtl.dat",
            "libEGL.dll",
            "libGLESv2.dll",
            "resources.pak",
            "snapshot_blob.bin",
            "v8_context_snapshot.bin",
            "vk_swiftshader_icd.json",
        ]

        for (const file of filesToCopy) {
            const src = path.join(sourceElectronDir, file)
            const dst = path.join(appOutDir, file)
            if (existsSync(src)) {
                copyFileSync(src, dst)
                console.log(`[afterPack] Copied ${file}`)
            } else {
                console.warn(`[afterPack] Warning: ${file} not found at ${src}`)
            }
        }

        // Copy locales folder
        const sourceLocales = path.join(sourceElectronDir, "locales")
        const targetLocales = path.join(appOutDir, "locales")
        if (existsSync(sourceLocales)) {
            copyDereferenced(sourceLocales, targetLocales)
            console.log("[afterPack] Copied locales folder")
        }

        // Copy resources folder
        const sourceResources = path.join(sourceElectronDir, "resources")
        const targetResources = path.join(appOutDir, "resources")
        if (existsSync(sourceResources)) {
            copyDereferenced(sourceResources, targetResources)
            console.log("[afterPack] Copied resources folder")
        }
    }

    // Ad-hoc sign macOS apps to fix signature issues with bundled draw.io files
    if (context.packager.platform.name === "mac") {
        const appPath = path.join(
            appOutDir,
            `${context.packager.appInfo.productFilename}.app`,
        )
        console.log(`[afterPack] Ad-hoc signing macOS app: ${appPath}`)
        try {
            execSync(`codesign --force --deep --sign - "${appPath}"`, {
                stdio: "inherit",
            })
            console.log("[afterPack] Ad-hoc signing completed successfully")
        } catch (error) {
            console.error("[afterPack] Ad-hoc signing failed:", error.message)
            throw error
        }
    }
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const rootDir = join(__dirname, "..")
const appPackagePath = join(rootDir, "package.json")
const appPackage = JSON.parse(readFileSync(appPackagePath, "utf-8"))
const productName = "Next AI Draw.io"
const stageRoot = join(rootDir, "release-prepackaged")
const stageAppDir = join(stageRoot, `win-${resolveArch()}`)
const stageAppSourceDir = join(stageRoot, "app-source")
const passthroughArgs = process.argv.slice(2)
const RESERVED_WINDOWS_BASENAMES = new Set([
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
])

function resolveArch() {
    if (process.arch === "x64") {
        return "x64"
    }

    if (process.arch === "arm64") {
        return "arm64"
    }

    throw new Error(`Unsupported Windows packaging architecture: ${process.arch}`)
}

function shouldSkipEntry(src) {
    const normalized = src.replaceAll("\\", "/")
    const baseName = normalized.split("/").pop()?.split(".")[0]?.toLowerCase()

    if (baseName && RESERVED_WINDOWS_BASENAMES.has(baseName)) {
        console.warn(`[build-electron-windows] Skipping reserved Windows path: ${src}`)
        return true
    }

    return false
}

function copyDereferenced(src, dst) {
    if (shouldSkipEntry(src)) {
        return
    }

    const lstat = lstatSync(src)

    if (lstat.isSymbolicLink()) {
        const stat = statSync(src)
        if (stat.isDirectory()) {
            mkdirSync(dst, { recursive: true })
            for (const entry of readdirSync(src)) {
                copyDereferenced(join(src, entry), join(dst, entry))
            }
        } else {
            mkdirSync(join(dst, ".."), { recursive: true })
            copyFileSync(src, dst)
        }
    } else if (lstat.isDirectory()) {
        mkdirSync(dst, { recursive: true })
        for (const entry of readdirSync(src)) {
            copyDereferenced(join(src, entry), join(dst, entry))
        }
    } else {
        mkdirSync(join(dst, ".."), { recursive: true })
        copyFileSync(src, dst)
    }
}

function assertExists(targetPath, message) {
    if (!existsSync(targetPath)) {
        throw new Error(message)
    }
}

function writeAppPackageJson() {
    const appManifest = {
        name: appPackage.name,
        productName,
        version: appPackage.version,
        license: appPackage.license,
        main: appPackage.main,
    }

    writeFileSync(
        join(stageAppSourceDir, "package.json"),
        `${JSON.stringify(appManifest, null, 4)}\n`,
        "utf-8",
    )
}

async function preparePrepackagedApp() {
    const electronDistDir = join(rootDir, "node_modules", "electron", "dist")
    const electronBundleDir = join(rootDir, "dist-electron")
    const standaloneDir = join(rootDir, "electron-standalone")
    const iconPath = join(rootDir, "resources", "icon.png")

    assertExists(
        electronDistDir,
        "Electron runtime is missing. Run `npm install` before packaging.",
    )
    assertExists(
        electronBundleDir,
        "Compiled Electron files are missing. Run `npm run electron:build` first.",
    )
    assertExists(
        standaloneDir,
        "Standalone Next.js output is missing. Run `npm run electron:prepare` first.",
    )

    console.log("[build-electron-windows] Preparing prepackaged Windows app...")

    rmSync(stageRoot, { recursive: true, force: true })
    mkdirSync(stageAppDir, { recursive: true })
    mkdirSync(stageAppSourceDir, { recursive: true })

    copyDereferenced(electronDistDir, stageAppDir)

    const electronExe = join(stageAppDir, "electron.exe")
    assertExists(
        electronExe,
        "electron.exe is missing from the Electron runtime directory.",
    )
    renameSync(electronExe, join(stageAppDir, `${productName}.exe`))

    copyDereferenced(electronBundleDir, join(stageAppSourceDir, "dist-electron"))
    writeAppPackageJson()

    const resourcesDir = join(stageAppDir, "resources")
    copyDereferenced(stageAppSourceDir, join(resourcesDir, "app"))

    if (existsSync(iconPath)) {
        copyFileSync(iconPath, join(resourcesDir, "icon.png"))
    }

    copyDereferenced(standaloneDir, join(resourcesDir, "standalone"))
}

function runElectronBuilder(target) {
    const arch = resolveArch()
    const args = [
        "electron-builder",
        "--config",
        "electron/electron-builder.yml",
        "--prepackaged",
        stageAppDir,
        "--win",
        target,
        `--${arch}`,
        ...passthroughArgs,
    ]
    const command = process.platform === "win32" ? "cmd.exe" : "npx"
    const commandArgs =
        process.platform === "win32"
            ? ["/d", "/s", "/c", "npx", ...args]
            : args

    console.log(`[build-electron-windows] Building ${target} target...`)

    const result = spawnSync(command, commandArgs, {
        cwd: rootDir,
        stdio: "inherit",
    })

    if (result.error) {
        throw result.error
    }

    if (result.status !== 0) {
        throw new Error(
            `electron-builder failed for target: ${target} (exit code ${result.status})`,
        )
    }
}

async function main() {
    try {
        await preparePrepackagedApp()
        runElectronBuilder("nsis")
        runElectronBuilder("portable")
        rmSync(stageRoot, { recursive: true, force: true })
        console.log("[build-electron-windows] Windows artifacts created in release/")
    } catch (error) {
        console.error("[build-electron-windows] Windows packaging failed.")
        console.error(error instanceof Error ? error.message : error)

        if (existsSync(stageRoot)) {
            console.error(
                `[build-electron-windows] Intermediate files were kept in ${stageRoot}`,
            )
        }

        process.exit(1)
    }
}

await main()

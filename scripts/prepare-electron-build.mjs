#!/usr/bin/env node

/**
 * Prepare standalone directory for Electron packaging
 * Copies the Next.js standalone output to a temp directory
 * that electron-builder can properly include
 */

import { execFileSync } from "node:child_process"
import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const rootDir = join(__dirname, "..")
const DRAWIO_RELEASE_TAG = process.env.DRAWIO_RELEASE_TAG || "v29.5.2"
const DRAWIO_DOWNLOAD_URL =
    process.env.DRAWIO_DOWNLOAD_URL ||
    `https://github.com/jgraph/drawio/releases/download/${DRAWIO_RELEASE_TAG}/draw.war`
const SKIPPED_STANDALONE_SEGMENTS = new Set([
    "electron-standalone",
    "release",
    "release-manual",
    "release-prepackaged",
])
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

function shouldSkipEntry(src) {
    const normalized = src.replaceAll("\\", "/")
    const segments = normalized.split("/")
    const baseName = normalized.split("/").pop()?.split(".")[0]?.toLowerCase()

    if (baseName && RESERVED_WINDOWS_BASENAMES.has(baseName)) {
        console.warn(`Skipping reserved Windows path: ${src}`)
        return true
    }

    if (segments.some((segment) => SKIPPED_STANDALONE_SEGMENTS.has(segment))) {
        console.warn(`Skipping nested standalone path: ${src}`)
        return true
    }

    return false
}

/**
 * Copy directory recursively, converting symlinks to regular files/directories.
 * This is needed because cpSync with dereference:true does NOT convert symlinks.
 * macOS codesign fails if bundle contains symlinks pointing outside the bundle.
 */
function copyDereferenced(src, dst) {
    if (shouldSkipEntry(src)) {
        return
    }

    const lstat = lstatSync(src)

    if (lstat.isSymbolicLink()) {
        // Follow symlink and check what it points to
        const stat = statSync(src)
        if (stat.isDirectory()) {
            // Symlink to directory: recursively copy the directory contents
            mkdirSync(dst, { recursive: true })
            for (const entry of readdirSync(src)) {
                copyDereferenced(join(src, entry), join(dst, entry))
            }
        } else {
            // Symlink to file: copy the actual file content
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

function toPowerShellLiteral(value) {
    return `'${value.replaceAll("'", "''")}'`
}

async function downloadFile(url, destinationPath) {
    console.log(`Downloading draw.io bundle from ${url}...`)

    if (process.platform === "win32") {
        const command = `Invoke-WebRequest -Headers @{ 'User-Agent' = 'next-ai-draw-io-build' } -Uri ${toPowerShellLiteral(url)} -OutFile ${toPowerShellLiteral(destinationPath)}`
        execFileSync("powershell", ["-NoProfile", "-Command", command], {
            stdio: "inherit",
        })
        return
    }

    try {
        execFileSync(
            "curl",
            [
                "-L",
                "-H",
                "User-Agent: next-ai-draw-io-build",
                "-o",
                destinationPath,
                url,
            ],
            { stdio: "inherit" },
        )
        return
    } catch {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "next-ai-draw-io-build",
            },
        })

        if (!response.ok) {
            throw new Error(
                `Failed to download draw.io bundle: ${response.status} ${response.statusText}`,
            )
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        writeFileSync(destinationPath, buffer)
    }
}

function extractArchive(archivePath, destinationPath) {
    if (process.platform === "win32") {
        const command = `Expand-Archive -LiteralPath ${toPowerShellLiteral(archivePath)} -DestinationPath ${toPowerShellLiteral(destinationPath)} -Force`
        execFileSync("powershell", ["-NoProfile", "-Command", command], {
            stdio: "inherit",
        })
        return
    }

    execFileSync("tar", ["-xf", archivePath, "-C", destinationPath], {
        stdio: "inherit",
    })
}

async function ensureBundledDrawio(targetPublicDir) {
    if (process.env.NEXT_PUBLIC_DRAWIO_BASE_URL) {
        console.log(
            "NEXT_PUBLIC_DRAWIO_BASE_URL is set. Skipping bundled draw.io download.",
        )
        return
    }

    const targetDrawioDir = join(targetPublicDir, "drawio")
    const targetDrawioIndex = join(targetDrawioDir, "index.html")
    const cacheDir = join(tmpdir(), "next-ai-drawio-cache")
    const archivePath = join(cacheDir, `drawio-${DRAWIO_RELEASE_TAG}.zip`)

    if (existsSync(targetDrawioIndex)) {
        console.log("Using draw.io bundle from public/drawio.")
        return
    }

    const tempExtractDir = mkdtempSync(join(tmpdir(), "next-ai-drawio-"))

    try {
        mkdirSync(cacheDir, { recursive: true })

        if (!existsSync(archivePath)) {
            await downloadFile(DRAWIO_DOWNLOAD_URL, archivePath)
        } else {
            console.log(`Using cached draw.io bundle from ${archivePath}`)
        }

        const extractDir = join(tempExtractDir, "extract")
        mkdirSync(extractDir, { recursive: true })
        extractArchive(archivePath, extractDir)

        mkdirSync(targetDrawioDir, { recursive: true })

        for (const entry of readdirSync(extractDir)) {
            if (entry === "META-INF" || entry === "WEB-INF") {
                continue
            }

            copyDereferenced(
                join(extractDir, entry),
                join(targetDrawioDir, entry),
            )
        }

        console.log(`Bundled draw.io web app into ${targetDrawioDir}`)
    } catch (error) {
        rmSync(targetDrawioDir, { recursive: true, force: true })
        console.warn(
            "Warning: Failed to prepare bundled draw.io. Electron will fall back to the configured remote draw.io URL.",
        )
        console.warn(error)
    } finally {
        rmSync(tempExtractDir, { recursive: true, force: true })
    }
}

const standaloneDir = join(rootDir, ".next", "standalone")
const staticDir = join(rootDir, ".next", "static")
const targetDir = join(rootDir, "electron-standalone")

console.log("Preparing Electron build...")

// Clean target directory
if (existsSync(targetDir)) {
    console.log("Cleaning previous build...")
    rmSync(targetDir, { recursive: true })
}

// Create target directory
mkdirSync(targetDir, { recursive: true })

// Copy standalone (includes node_modules)
console.log("Copying standalone directory...")
copyDereferenced(standaloneDir, targetDir)

// Copy static files
console.log("Copying static files...")
const targetStaticDir = join(targetDir, ".next", "static")
copyDereferenced(staticDir, targetStaticDir)

// Copy public folder (required for favicon-white.svg and other assets)
console.log("Copying public folder...")
const publicDir = join(rootDir, "public")
const targetPublicDir = join(targetDir, "public")
if (existsSync(publicDir)) {
    copyDereferenced(publicDir, targetPublicDir)
}

await ensureBundledDrawio(targetPublicDir)

console.log("Done! Files prepared in electron-standalone/")

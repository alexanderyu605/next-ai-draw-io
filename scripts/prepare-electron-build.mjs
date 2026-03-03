#!/usr/bin/env node

/**
 * Prepare standalone directory for Electron packaging
 * Copies the Next.js standalone output to a temp directory
 * that electron-builder can properly include
 */

import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const rootDir = join(__dirname, "..")
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

console.log("Done! Files prepared in electron-standalone/")

import { copyFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, normalize } from "node:path";
import packageJson from "../package.json";

const PACKAGE_NAME = packageJson.name;

export const VERSION = packageJson.version ?? "0.0.0";

const APP_NAME = PACKAGE_NAME
    .split("/")
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, "-")!;

const OWNER = "AnimeThemes";
const REPO = "animethemes-batch-encoder-ts";

const IS_WINDOWS = process.platform === "win32";

const INSTALL_DIR = join(
    process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
    "Programs",
    APP_NAME,
);

const INSTALL_EXE = join(INSTALL_DIR, `${APP_NAME}.exe`);

type GitHubRelease = {
    tag_name: string;
    assets: Array<{
        name: string;
        browser_download_url: string;
    }>;
};

function samePath(a: string, b: string) {
    return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

function cleanVersion(version: string) {
    return version.replace(/^v/i, "").trim();
}

function sameVersion(a: string, b: string) {
    return cleanVersion(a) === cleanVersion(b);
}

function escapePowerShellString(value: string) {
    return value.replace(/'/g, "''");
}

function runPowerShell(script: string) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            { windowsHide: true },
        );

        let stderr = "";

        child.stderr.on("data", data => {
            stderr += String(data);
        });

        child.on("close", code => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(stderr || `PowerShell exited with code ${code}`));
        });
    });
}

async function addInstallDirToPath() {
    const safeInstallDir = escapePowerShellString(INSTALL_DIR);

    const script = `
$InstallDir = '${safeInstallDir}'
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')

if ([string]::IsNullOrWhiteSpace($UserPath)) {
  [Environment]::SetEnvironmentVariable('Path', $InstallDir, 'User')
  exit 0
}

$Parts = $UserPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }

if ($Parts -notcontains $InstallDir) {
  $NewPath = ($Parts + $InstallDir) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
}
`;

    await runPowerShell(script);
}

export async function ensureInstalled() {
    if (!IS_WINDOWS) return;

    await mkdir(INSTALL_DIR, { recursive: true });

    const currentExe = process.execPath;

    if (!samePath(currentExe, INSTALL_EXE)) {
        await copyFile(currentExe, INSTALL_EXE);
        await addInstallDirToPath();

        console.log(`Installed at: ${INSTALL_EXE}`);
        console.log(`Open a new terminal and run: ${APP_NAME} --help`);
        return;
    }

    await addInstallDirToPath();
}

async function getLatestRelease() {
    const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
        {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": APP_NAME,
            },
        },
    );

    if (!response.ok) return null;

    return response.json() as Promise<GitHubRelease>;
}

async function downloadFile(url: string, destination: string) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": APP_NAME,
        },
    });

    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }

    await Bun.write(destination, await response.arrayBuffer());
}

async function replaceInstalledExe(sourceExe: string) {
    const ps1Path = join(tmpdir(), `${APP_NAME}-update-${Date.now()}.ps1`);

    const script = `
param(
  [int]$ProcessIdToWait,
  [string]$Source,
  [string]$Destination
)

Wait-Process -Id $ProcessIdToWait -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Copy-Item -LiteralPath $Source -Destination $Destination -Force

Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

    await Bun.write(ps1Path, script);

    const child = spawn(
        "powershell.exe",
        [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            ps1Path,
            String(process.pid),
            sourceExe,
            INSTALL_EXE,
        ],
        {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        },
    );

    child.unref();

    console.log("Update downloaded. Please run the command again.");
    process.exit(0);
}

export async function update(options?: { silent?: boolean }) {
    if (!IS_WINDOWS) return;

    const release = await getLatestRelease();

    if (!release) {
        if (!options?.silent) console.log("Could not check for updates.");
        return;
    }

    if (sameVersion(release.tag_name, VERSION)) {
        if (!options?.silent) console.log("No update available.");
        return;
    }

    const asset = release.assets.find(asset => asset.name === `${APP_NAME}.exe`);

    if (!asset) {
        if (!options?.silent) {
            console.log("No Windows executable found in the latest release.");
        }
        return;
    }

    console.log(`Updating from ${VERSION} to ${release.tag_name}...`);

    const tempExe = join(tmpdir(), `${APP_NAME}-${cleanVersion(release.tag_name)}.exe`);

    await downloadFile(asset.browser_download_url, tempExe);
    await replaceInstalledExe(tempExe);
}
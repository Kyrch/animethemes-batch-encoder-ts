import { copyFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, normalize } from "node:path";
import packageJson from "../package.json";

function getPackageString(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const VERSION = getPackageString(packageJson.version, "0.0.0");

const APP_NAME = getPackageString(packageJson.name, "batch-encoder");
const OWNER = getPackageString(packageJson.author, "");
const REPO = getPackageString((packageJson as { repo?: unknown }).repo, "");

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

export async function ensureInstalled(): Promise<boolean> {
    if (!IS_WINDOWS) return false;

    await mkdir(INSTALL_DIR, { recursive: true });

    const currentExe = process.execPath;

    if (!samePath(currentExe, INSTALL_EXE)) {
        await copyFile(currentExe, INSTALL_EXE);
        await addInstallDirToPath();

        console.log(`Installed at: ${INSTALL_EXE}`);
        console.log(`Open a new terminal and run: ${APP_NAME} --help`);

        return true;
    }

    await addInstallDirToPath();

    return false;
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
    if (!OWNER || !REPO) {
        console.log("GitHub owner or repository is missing in package.json.");
        return null;
    }

    const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
        {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": APP_NAME,
            },
        },
    );

    if (!response.ok) {
        console.log(`Update check failed: ${response.status} ${response.statusText}`);
        return null;
    }

    return response.json() as Promise<GitHubRelease>;
}

async function downloadFile(url: string, destination: string) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": APP_NAME,
        },
    });

    if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await Bun.write(destination, await response.arrayBuffer());
}

async function replaceInstalledExe(sourceExe: string) {
    const cmdPath = join(tmpdir(), `${APP_NAME}-update-${Date.now()}.cmd`);
    const logPath = join(tmpdir(), `${APP_NAME}-update.log`);

    const script = `@echo off
setlocal

set "SOURCE=${sourceExe}"
set "DESTINATION=${INSTALL_EXE}"
set "LOG=${logPath}"
set "ATTEMPT=0"

echo Starting update... > "%LOG%"
echo Source: %SOURCE% >> "%LOG%"
echo Destination: %DESTINATION% >> "%LOG%"
echo Waiting for current process to exit... >> "%LOG%"

timeout /t 2 /nobreak >nul

:retry
set /a ATTEMPT+=1

echo Copy attempt %ATTEMPT%... >> "%LOG%"

copy /Y "%SOURCE%" "%DESTINATION%" >> "%LOG%" 2>&1

if not errorlevel 1 (
    echo Copy succeeded. >> "%LOG%"
    del /F /Q "%SOURCE%" >> "%LOG%" 2>&1
    del /F /Q "%~f0" >nul 2>&1
    exit /b 0
)

echo Copy failed. >> "%LOG%"

if %ATTEMPT% GEQ 30 (
    echo Update failed after 30 attempts. >> "%LOG%"
    exit /b 1
)

timeout /t 1 /nobreak >nul
goto retry
`;

    await Bun.write(cmdPath, script);

    const safeCmdPath = cmdPath.replace(/"/g, '""');

    const child = spawn(
        "cmd.exe",
        [
            "/d",
            "/s",
            "/c",
            `start "" /min "${safeCmdPath}"`,
        ],
        {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        },
    );

    child.unref();

    console.log("Update downloaded. Please run the command again.");
    console.log(`Update log: ${logPath}`);

    process.exit(0);
}

export async function update() {
    if (!IS_WINDOWS) {
        console.log("Update is only available on Windows.");
        return;
    }

    const release = await getLatestRelease();

    if (!release) {
        console.log("Could not check for updates.");
        return;
    }

    if (sameVersion(release.tag_name, VERSION)) {
        console.log("No update available.");
        return;
    }

    const asset = release.assets.find(asset => asset.name === `${APP_NAME}.exe`);

    if (!asset) {
        console.log("No Windows executable found in the latest release.");
        return;
    }

    console.log(`Updating from ${VERSION} to ${release.tag_name}...`);

    const tempExe = join(
        tmpdir(),
        `${APP_NAME}-${cleanVersion(release.tag_name)}.exe`,
    );

    await downloadFile(asset.browser_download_url, tempExe);
    await replaceInstalledExe(tempExe);
}
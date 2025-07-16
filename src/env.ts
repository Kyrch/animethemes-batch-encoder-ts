import { loadConfig } from "@/config/loader.ts";
import { $ } from "bun";

async function loadEnvironment() {
    await checkEncodingTools();

    const workDir = process.cwd();

    const config = await loadConfig(workDir);

    return { workDir, config };
}

async function checkEncodingTools() {
    if (Bun.which("ffmpeg") === null) {
        throw new Error("FFmpeg is required");
    }

    const ffmpegVersionOutput = await $`ffmpeg -version`.text();
    const ffmpegVersion = ffmpegVersionOutput.match(/^ffmpeg version (\d+\.\d+\.\d+)/)?.[1];
    const [major] = ffmpegVersion?.split(".") ?? [];

    if (major === undefined || parseInt(major) < 6) {
        throw new Error("FFmpeg 6.0.0 or newer is required");
    }

    if (Bun.which("ffprobe") === null) {
        throw new Error("FFprobe is required");
    }
}

export { loadEnvironment };

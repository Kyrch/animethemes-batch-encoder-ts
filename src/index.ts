import { Command } from "commander";
import * as prompts from "@inquirer/prompts";
import * as fs from "node:fs/promises";
import { ffprobe, streamToString } from "./ffprobe.ts";
import * as v from "valibot";
import { loadConfig } from "./config/loader.ts";
import { Presets, SingleBar } from "cli-progress";
import { isValidDuration, parseDuration } from "./ffmpeg/duration.ts";

const program = new Command();

program
  .name("batch-encoder")
  .version("1.0.0")
  .description("Generate/Execute FFmpeg commands for files in acting directory")
  .action(withErrorHandling(selectMode));

program
  .command("generate")
  .alias("g")
  .description("Generate commands and write to file")
  .action(withErrorHandling(generate));

await program.parseAsync();

function withErrorHandling(action: () => Promise<void>) {
  return async () => {
    try {
      await action();
    } catch (error) {
      if (error instanceof v.ValiError) {
        console.error(v.summarize(error.issues));
        return;
      }

      if (error instanceof Error) {
        console.error(error.message);
        return;
      }

      throw error;
    }
  };
}

async function selectMode() {
  const runMode = await prompts.select({
    message: "Select mode",
    choices: [
      {
        name: "Generate commands",
        value: generate,
      },
    ],
  });

  await runMode();
}

async function generate() {
  await checkEnvironment();

  const config = await loadConfig();

  const allowedFileTypes = config.allowedFileTypes.split(",");
  const sourceFileCandidates = (await fs.readdir(".")).filter((file) =>
    allowedFileTypes.some((type) => file.endsWith(type)),
  );

  if (sourceFileCandidates.length === 0) {
    throw new Error("No source file candidates in current directory");
  }

  const sourceFiles = await prompts.checkbox({
    message: "Select source files",
    choices: sourceFileCandidates.map((file) => ({
      value: file,
      name: file,
    })),
  });

  for (const sourceFile of sourceFiles) {
    const sourceMeta = await ffprobe(sourceFile);

    const videoStream = await prompts.select({
      message: "Select video stream",
      choices: sourceMeta.streams
        .filter((stream) => stream.codec_type === "video")
        .map((stream) => ({
          value: stream,
          name: streamToString(stream),
        })),
    });

    const audioStream = await prompts.select({
      message: "Select audio stream",
      choices: sourceMeta.streams
        .filter((stream) => stream.codec_type === "audio")
        .map((stream) => ({
          value: stream,
          name: streamToString(stream),
        })),
    });

    function promptDuration(message: string) {
      return prompts.input({
        message,
        validate: (value) =>
          isValidDuration(value) ||
          "Please enter a valid duration. See FFmpeg documentation for accepted formats: https://ffmpeg.org/ffmpeg-utils.html#time-duration-syntax",
      });
    }

    const from = await promptDuration("Enter start time");
    const to = await promptDuration("Enter end time");

    const duration = parseDuration(to) - parseDuration(from);

    const outputFile = await prompts
      .input({
        message: "Enter output file name",
      })
      .then((fileName) =>
        fileName.endsWith(".webm") ? fileName : `${fileName}.webm`,
      );

    const ffmpegCommand = [
      "ffmpeg",
      "-ss",
      from,
      "-to",
      to,
      "-i",
      sourceFile,
      "-map",
      `0:${videoStream.index}`,
      "-map",
      `0:${audioStream.index}`,
      outputFile,
    ];

    const process = Bun.spawn({
      cmd: ffmpegCommand,
      stdout: "inherit",
      stderr: "pipe",
    });

    const progress = new SingleBar({}, Presets.shades_grey);

    progress.start(Math.floor(duration * 100) / 100, 0);

    for await (const chunk of process.stderr) {
      const decoder = new TextDecoder();
      const line = decoder.decode(chunk);

      const time = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/)?.[1];
      if (time) {
        progress.update(Math.floor(parseDuration(time) * 100) / 100);
      }
    }

    progress.update(duration);
    progress.stop();
  }

  // const audioFilter = await select({
  //   message: "Select an audio filter",
  //   choices: audioFilters.map((audioFilter) => ({
  //     value: audioFilter,
  //     name: audioFilter.label,
  //   })),
  // });
  //
  // const audioFilterString = await audioFilter.promptToString();
  //
  // console.info(audioFilterString);
}

async function checkEnvironment() {
  if (Bun.which("ffmpeg") === null) {
    throw new Error("FFmpeg is required");
  }

  if (Bun.which("ffprobe") === null) {
    throw new Error("FFprobe is required");
  }
}

import { Command } from "commander";
import * as prompts from "@inquirer/prompts";
import * as v from "valibot";
import { generate } from "@/command/generate.ts";

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

async function checkEnvironment() {
    if (Bun.which("ffmpeg") === null) {
        throw new Error("FFmpeg is required");
    }

    if (Bun.which("ffprobe") === null) {
        throw new Error("FFprobe is required");
    }
}

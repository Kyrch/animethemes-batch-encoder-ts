import { Command } from "commander";
import * as prompts from "@inquirer/prompts";
import * as v from "valibot";
import { generate } from "@/command/generate.ts";
import { execute } from "./command/execute";

const program = new Command();

program
    .name("batch-encoder")
    .version("3.0.0")
    .description("Generate/Execute FFmpeg commands for files in acting directory")
    .action(withErrorHandling(selectMode));

program
    .command("generate")
    .alias("g")
    .description("Generate commands and write to file")
    .action((args) => withErrorHandling(() => generate(args))());

program
    .command("execute")
    .alias("e")
    .description("Execute commands")
    .action((args) => withErrorHandling(() => execute(args))());

program
    .option(
        "-f, --file <file>",
        "Name of file commands are written to or execute from",
        "commands.txt"
    );

program
    .option(
        "--configfile <file>",
        "Name of config file (default: config.json)",
        "config.json"
    );

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
            {
                name: "Execute commands",
                value: execute,
            },
        ],
    });

    await runMode(program.opts());
}

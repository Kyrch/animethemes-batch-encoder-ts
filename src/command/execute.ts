import { $ } from "bun";
import { existsSync } from "node:fs";

type ExecuteArgs = {
    file: string;
}

async function execute(args: ExecuteArgs) {
    if (!existsSync(args.file)) {
        console.error(`File '${args.file}' does not exist`);
        process.exit(1);
    }

    const commands = (await Bun.file(args.file).text())
        .split(/\r?\n/)
        .map(command => command.trim())
        .filter(command => command.length > 0);

    console.info(`Reading ${commands.length} commands from file '${args.file}'...`);

    for (const command of commands) {
        await $`${{ raw: command }}`;
    }
}

export { execute };
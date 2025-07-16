import type { BunFile } from "bun";
import { type Config, getDefaultConfig, parseConfig } from "./schema.ts";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as v from "valibot";

async function loadConfig(workDir: string): Promise<Config> {
    const [localConfig, globalConfig] = await Promise.all([
        getLocalConfigFile(workDir).then((file) => file && loadConfigFromFile(file)),
        getGlobalConfigFile().then((file) => file && loadConfigFromFile(file)),
    ]);

    const configs = [globalConfig, localConfig].filter((config) => config !== null);

    return mergeConfigs([getDefaultConfig(), ...configs]);
}

async function getLocalConfigFile(workDir: string): Promise<BunFile | null> {
    for (
        let currentDir = path.resolve(workDir);
        await fs.exists(currentDir);
        currentDir = path.resolve(currentDir, "..")
    ) {
        const configFile = Bun.file(`${currentDir}/config.json`);

        if (await configFile.exists()) {
            return configFile;
        }
    }

    return null;
}

async function getGlobalConfigFile(): Promise<BunFile | null> {
    const homeDir = os.homedir();
    const configFile = Bun.file(`${homeDir}/.config/batch-encoder/config.json`);

    if (await configFile.exists()) {
        return configFile;
    }

    return null;
}

function mergeConfigs(configs: [Config, ...Array<Config>]): Config {
    return configs.reduce((mergedConfig, nextConfig) => {
        return {
            ...mergedConfig,
            ...nextConfig,
        };
    });
}

async function loadConfigFromFile(file: BunFile): Promise<Config | null> {
    try {
        const configJson = await file.json();

        return parseConfig(configJson);
    } catch (error) {
        if (error instanceof v.ValiError) {
            console.error(`Invalid config file: ${file.name}`);
            console.error(v.summarize(error.issues));
        } else {
            console.error(`Could not load config file: ${file.name}`);
            console.error(error);
        }

        return null;
    }
}

export { loadConfig };

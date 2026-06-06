import * as prompts from "@inquirer/prompts";
import { bitRateModes } from "@/ffmpeg/bitrateMode";
import type { Config } from "@/config/schema";

async function promptCustomQuestions(config: Config): Promise<Config> {
    const newConfig = {...config};

    newConfig.limitSizeEnable = await prompts.confirm({
        message: "Limit Size Enable?",
        default: config.limitSizeEnable,
    });

    newConfig.encodingModes = await prompts.checkbox({
        message: "Select Encoding Modes",
        choices: Object.keys(bitRateModes).map(mode => ({
            value: mode,
            name: mode,
            checked: config.encodingModes.includes(mode),
        })),
    });

    if (newConfig.encodingModes.includes("VBR") || newConfig.encodingModes.includes("CQ")) {
        const crfs = await prompts.input({
            message: "CRF Value (0-63, lower is better quality)",
            default: config.crfs.join(","),
            validate: (value) => value.split(",").every(v => /^-?\d+$/.test(v.trim())),
        });

        newConfig.crfs = crfs.split(",").map(Number);
    }

    if (newConfig.encodingModes.includes("CBR") || newConfig.encodingModes.includes("CQ")) {
        const bitrate = await prompts.input({
            message: "Bitrate Value",
            default: config.cbrBitrates.join(","),
            validate: (value) => value.split(",").every(v => /^-?\d+$/.test(v.trim())),
        });

        const maxBitrate = await prompts.input({
            message: "Max Bitrate Value",
            default: config.cbrMaxBitrates.join(","),
            validate: (value) => value.split(",").every(v => /^-?\d+$/.test(v.trim())),
        });

        newConfig.cbrBitrates = bitrate.split(",").map(Number);
        newConfig.cbrMaxBitrates = maxBitrate.split(",").map(Number);
    }

    return newConfig;
}

export { promptCustomQuestions };
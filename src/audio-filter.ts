import { number } from "@inquirer/prompts";

interface AudioFilterConfig<T> {
    label: string;
    prompt: () => Promise<T>;
    toString: (options: T) => string;
}

interface AudioFilter {
    label: string;
    promptToString: () => Promise<string>;
}

function createAudioFilter<T>(config: AudioFilterConfig<T>): AudioFilter {
    return {
        label: config.label,
        promptToString: async () => {
            const options = await config.prompt();

            return config.toString(options);
        },
    };
}

const audioFilters = [
    createAudioFilter({
        label: "Fade In",
        prompt: async () => ({
            duration: await number({
                message: "Duration",
                required: true,
            }),
        }),
        toString: (options) => `afade=d=${options.duration}:curve=exp`,
    }),
    createAudioFilter({
        label: "Fade Out",
        prompt: async () => ({
            startTime: await number({ message: "Start Time", required: true }),
            duration: await number({
                message: "Duration",
                required: true,
            }),
        }),
        toString: (options) => `afade=t=out:st=${options.startTime}:d=${options.duration}`,
    }),
] satisfies Array<AudioFilter>;

export { audioFilters };

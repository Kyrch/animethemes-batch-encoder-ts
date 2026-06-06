import type { MediaAnalysis, VideoStream } from "@/ffprobe/schema";

// Bitrate Mode determines the rate control argument values for our commands
// Further Reading: https://developers.google.com/media/vp9/bitrate-modes
type BitrateModes = {
    // Variable Bitrate Mode / Constant Quality Mode
    VBR: {
        firstPass: (crf: number) => string;
        secondPass: (crf: number) => string;
    };
    // Constant Bitrate Mode
    CBR: {
        firstPass: (bitrate: number, maxBitrate: number) => string;
        secondPass: (bitrate: number, maxBitrate: number) => string;
    };
    // Constrained Quality Mode
    CQ: {
        firstPass: (crf: number, bitrate: number) => string;
        secondPass: (crf: number, bitrate: number) => string;
    };
};

const bitRateModes = {
    VBR: {
        firstPass: (crf: number) => `-crf ${String(crf)}`,
        secondPass: (crf: number) => `-crf ${String(crf)}`,
    },
    CBR: {
        firstPass: (bitrate: number, maxBitrate: number) => `-b:v ${String(bitrate)} -maxrate ${String(maxBitrate)}`,
        secondPass: (bitrate: number, maxBitrate: number) => `-b:v ${String(bitrate)} -maxrate ${String(maxBitrate)} -bufsize 6000k`,
    },
    CQ: {
        firstPass: (crf: number, bitrate: number) => `-crf ${String(crf)} -b:v ${String(bitrate)}`,
        secondPass: (crf: number, bitrate: number) => `-crf ${String(crf)} -b:v ${String(bitrate)}`,
    },
} satisfies BitrateModes;

function getBitrateModePass<T extends keyof BitrateModes>(mode: T): BitrateModes[T] {
    return bitRateModes[mode];
}

// Audio must use a default bitrate of 192 kbps
// Audio must use a bitrate of 320 kbps if the source bitrate is > 320 kbps
function getAudioBitrateArgs(meta: MediaAnalysis): string {
    const audioBitrate: number = parseInt(meta.format.bit_rate);

    return `-c:a libopus -b:a ${audioBitrate > 320000 ? "320k" : "192k"} -ar 48k`;
};

// Approximation of target average bitrate near file size limit
function getCbrBitrate(videoStream: VideoStream): number {
    const resolution = videoStream.height;

    if (resolution >= 1080) {
        return 5600;
    } else if (resolution >= 720) {
        return 3700;
    } else if (resolution >= 576) {
        return 3200;
    }

    return 2400;
}

// Approximation of max overall bitrate near file size limit
function getCbrMaxBitrate(videoStream: VideoStream): number {
    const resolution = videoStream.height;

    if (resolution >= 1080) {
        return 6400;
    } else if (resolution >= 720) {
        return 4200;
    } else if (resolution >= 576) {
        return 3700;
    }

    return 3200;
}

export {
    type BitrateModes,
    bitRateModes,
    getBitrateModePass,
    getAudioBitrateArgs,
    getCbrBitrate,
    getCbrMaxBitrate,
};
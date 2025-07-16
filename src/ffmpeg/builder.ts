type EncoderArg =
    | {
          key: string;
      }
    | {
          key: string;
          value: string;
          escape?: boolean;
      }
    | {
          value: string;
          escape?: boolean;
      };

type EncoderArgs = Array<EncoderArg | EncoderArgs>;

function toArray(args: EncoderArgs, escape?: boolean): Array<string> {
    const flattenedArgs = flatten(args).flatMap((arg) => {
        const tuple = [];

        if ("key" in arg) tuple.push(arg.key);
        if ("value" in arg) tuple.push(escape && arg.escape ? `"${arg.value}"` : arg.value);

        return tuple;
    });

    return ["ffmpeg", ...flattenedArgs];
}

function toString(args: EncoderArgs): string {
    return toArray(args, true).join(" ");
}

function flatten(args: EncoderArgs): Array<EncoderArg> {
    return args.flatMap((arg) => (Array.isArray(arg) ? flatten(arg) : [arg]));
}

function input(sourceFile: string): EncoderArg {
    return {
        key: "-i",
        value: sourceFile,
        escape: true,
    };
}

function output(outputFile: string): EncoderArg {
    return {
        value: outputFile,
        escape: true,
    };
}

function seek(from: string, to?: undefined): EncoderArg;
function seek(from: undefined, to: string): EncoderArg;
function seek(from: string, to: string): [EncoderArg, EncoderArg];
function seek(from?: string, to?: string): EncoderArg | [EncoderArg, EncoderArg] {
    if (from === undefined) {
        return { key: "-to", value: to };
    } else if (to === undefined) {
        return { key: "-ss", value: from };
    } else {
        return [
            { key: "-ss", value: from },
            { key: "-to", value: to },
        ];
    }
}

function map(streamIndex: number): EncoderArg {
    return {
        key: "-map",
        value: `0:${streamIndex}`,
    };
}

export { toArray, toString, input, output, seek, map };

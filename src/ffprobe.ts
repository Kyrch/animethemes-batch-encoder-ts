import * as v from "valibot";
import { $ } from "bun";

const StreamSchema = v.looseObject({
  index: v.pipe(v.number(), v.integer()),
  codec_type: v.string(),
});

const VideoStreamSchema = v.object({
  ...StreamSchema.entries,
  codec_type: v.literal("video"),
  codec_name: v.string(),
  profile: v.string(),
  width: v.number(),
  height: v.number(),
  pix_fmt: v.string(),
  color_range: v.string(),
  color_space: v.string(),
});

const AudioStreamSchema = v.object({
  ...StreamSchema.entries,
  codec_type: v.literal("audio"),
  codec_name: v.string(),
  channels: v.number(),
  channel_layout: v.string(),
  sample_rate: v.string(),
});

const MediaStreamSchema = v.variant("codec_type", [
  VideoStreamSchema,
  AudioStreamSchema,
]);

type MediaStream = v.InferOutput<typeof MediaStreamSchema>;

const FFprobeSchema = v.object({
  streams: v.pipe(
    v.array(StreamSchema),
    v.filterItems((item) => ["video", "audio"].includes(item.codec_type)),
    v.array(MediaStreamSchema),
  ),
});

type FFprobe = v.InferOutput<typeof FFprobeSchema>;

async function ffprobe(sourceFile: string): Promise<FFprobe> {
  const result =
    await $`ffprobe -v quiet -print_format json -show_streams ${sourceFile}`.json();

  return v.parse(FFprobeSchema, result);
}

function streamToString(stream: MediaStream): string {
  switch (stream.codec_type) {
    case "video":
      return `${stream.codec_name} (${stream.profile}), ${stream.pix_fmt} (${stream.color_range}, ${stream.color_space}), ${stream.width}x${stream.height}`;
    case "audio":
      return `${stream.codec_name} (${stream.channels} channels, ${stream.sample_rate} Hz)`;
  }
}

export { ffprobe, streamToString };

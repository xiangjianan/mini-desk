import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("companion GIF assets", () => {
  it.each(["static/video/hermes.gif", "static/video/hermes-dark.gif"])("%s loops forward then backward", (assetPath) => {
    const data = readFileSync(resolve(root, assetPath));
    const frameHashes = readGifFrameBlocks(assetPath).map(hashBuffer);
    const forwardFrameCount = (frameHashes.length + 2) / 2;

    expect(hasInfiniteLoopExtension(data), `${assetPath} should keep GIF playback looping indefinitely`).toBe(true);
    expect(Number.isInteger(forwardFrameCount), `${assetPath} should have a mirrored ping-pong frame count`).toBe(true);
    expect(forwardFrameCount, `${assetPath} should include enough frames to mirror the animation`).toBeGreaterThan(2);
    expect(frameHashes.slice(forwardFrameCount), `${assetPath} should mirror its interior frames in reverse order`).toEqual(
      frameHashes.slice(1, forwardFrameCount - 1).reverse(),
    );
  });
});

function readGifFrameBlocks(assetPath: string): Buffer[] {
  const data = readFileSync(resolve(root, assetPath));

  expect(data.subarray(0, 3).toString("ascii"), `${assetPath} should be a GIF file`).toBe("GIF");

  let offset = 6;
  const logicalScreenPackedByte = data[offset + 4];
  offset += 7;

  if ((logicalScreenPackedByte & 0x80) !== 0) {
    offset += getColorTableByteLength(logicalScreenPackedByte);
  }

  const frames: Buffer[] = [];
  let pendingFrameStart: number | undefined;

  while (offset < data.length) {
    const blockStart = offset;
    const introducer = data[offset++];

    if (introducer === 0x3b) break;

    if (introducer === 0x21) {
      const label = data[offset++];
      if (label === 0xf9 && pendingFrameStart === undefined) pendingFrameStart = blockStart;
      offset = skipExtension(data, offset);
      continue;
    }

    if (introducer === 0x2c) {
      if (pendingFrameStart === undefined) pendingFrameStart = blockStart;
      const imageDescriptorPackedByte = data[offset + 8];
      offset += 9;
      if ((imageDescriptorPackedByte & 0x80) !== 0) {
        offset += getColorTableByteLength(imageDescriptorPackedByte);
      }
      offset += 1;
      offset = skipSubBlocks(data, offset);
      frames.push(Buffer.from(data.subarray(pendingFrameStart, offset)));
      pendingFrameStart = undefined;
      continue;
    }

    throw new Error(`Unsupported GIF block 0x${introducer.toString(16)} in ${assetPath}`);
  }

  return frames;
}

function skipExtension(data: Buffer, offset: number): number {
  return skipSubBlocks(data, offset);
}

function skipSubBlocks(data: Buffer, offset: number): number {
  while (offset < data.length) {
    const length = data[offset++];
    if (length === 0) return offset;
    offset += length;
  }
  throw new Error("Unexpected end of GIF sub-blocks");
}

function getColorTableByteLength(packedByte: number): number {
  return 3 * 2 ** ((packedByte & 0x07) + 1);
}

function hasInfiniteLoopExtension(data: Buffer): boolean {
  const applicationIdOffset = data.indexOf(Buffer.from("NETSCAPE2.0", "ascii"));
  if (applicationIdOffset === -1) return false;

  const loopSubBlockOffset = applicationIdOffset + "NETSCAPE2.0".length;
  const loopCount = data.readUInt16LE(loopSubBlockOffset + 2);
  return data[loopSubBlockOffset] === 0x03 && data[loopSubBlockOffset + 1] === 0x01 && loopCount === 0;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

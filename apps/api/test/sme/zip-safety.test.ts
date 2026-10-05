/**
 * ZipSafety port pins (T-MIG-033 tranche-3) — the deep-audit 09-28 M3 law:
 * absolute per-entry / total / entry-count budgets enforced WITHOUT
 * allocating past a cap, the verbatim traversal guard, CRC verification,
 * and the fail-closed deviations (data descriptors, encryption), each with
 * its frozen line reference.
 */
import { describe, expect, test } from "bun:test";
import {
  readEachZip,
  ZipFormatError,
  zipLimitsDefaults,
  type ZipLimits,
} from "../../src/services/sme/zip-safety";
import { BadRequestError } from "../../src/services/selfmark";
import { buildZip, bytes, type ZipEntrySpec } from "./helpers";

function walk(zip: Uint8Array, limits = zipLimitsDefaults()) {
  const seen: Array<{ name: string; data: Uint8Array }> = [];
  readEachZip(zip, limits, (name, data) => seen.push({ name, data }));
  return seen;
}

const small = (): ZipLimits => ({
  maxEntryBytes: 64,
  maxTotalBytes: 256,
  maxEntries: 100,
});

describe("readEachZip — happy paths", () => {
  test("walks package.json + assets in archive order, skipping directories", () => {
    const zip = buildZip([
      { name: "package.json", data: bytes("{}") },
      { name: "assets/", data: new Uint8Array(0) }, // directory entry
      { name: "assets/a.png", data: bytes("PNGDATA") },
      { name: "assets/b.pdf", data: bytes("%PDF-1.4") },
    ]);
    const seen = walk(zip);
    expect(seen.map((s) => s.name)).toEqual([
      "package.json",
      "assets/a.png",
      "assets/b.pdf",
    ]);
    expect(new TextDecoder().decode(seen[0]!.data)).toBe("{}");
    expect(new TextDecoder().decode(seen[1]!.data)).toBe("PNGDATA");
    expect(new TextDecoder().decode(seen[2]!.data)).toBe("%PDF-1.4");
  });

  test("stored (method 0) entries round-trip", () => {
    const zip = buildZip([{ name: "assets/s.bin", data: bytes("STORED"), method: 0 }]);
    const seen = walk(zip);
    expect(seen).toHaveLength(1);
    expect(new TextDecoder().decode(seen[0]!.data)).toBe("STORED");
  });

  test("plain names containing dots stay legal (a..b.png, :126-128)", () => {
    const zip = buildZip([{ name: "assets/a..b.png", data: bytes("x") }]);
    expect(walk(zip).map((s) => s.name)).toEqual(["assets/a..b.png"]);
  });

  test("an archive with zero file entries walks to nothing (EOCD only)", () => {
    expect(walk(buildZip([]))).toEqual([]);
  });
});

describe("readEachZip — absolute budgets (deep-audit 09-28 M3)", () => {
  test("per-entry uncompressed budget fails closed with the verbatim message", () => {
    const zip = buildZip([
      { name: "assets/bomb.png", data: new Uint8Array(65) }, // over the 64 cap
      { name: "package.json", data: bytes("{}") },
    ]);
    expect(() => walk(zip, small())).toThrow(
      new BadRequestError(
        "archive entry 'assets/bomb.png' decompresses beyond the 64 byte per-entry budget",
      ),
    );
  });

  test("the per-entry budget aborts DURING inflation — no allocation past the cap", () => {
    // 1 MB of zeros deflates to ~1 KB (a classic zip-bomb shape); with a
    // 4 KB per-entry cap the walker must refuse without ever materializing
    // the full megabyte
    const bomb = buildZip([
      { name: "assets/zeros.png", data: new Uint8Array(1024 * 1024) },
    ]);
    expect(() =>
      walk(bomb, { maxEntryBytes: 4 * 1024, maxTotalBytes: 1 << 30, maxEntries: 100 }),
    ).toThrow(
      new BadRequestError(
        "archive entry 'assets/zeros.png' decompresses beyond the 4096 byte per-entry budget",
      ),
    );
  });

  test("total uncompressed budget fires on the entry that crosses it (:89-92)", () => {
    const zip = buildZip([
      { name: "assets/one.png", data: new Uint8Array(15) },
      { name: "assets/two.png", data: new Uint8Array(15) }, // total 30 > 20
    ]);
    expect(() =>
      walk(zip, { maxEntryBytes: 64, maxTotalBytes: 20, maxEntries: 100 }),
    ).toThrow(
      new BadRequestError(
        "archive decompresses beyond the 20 byte total budget",
      ),
    );
  });

  test("entry-count budget fires with the verbatim message (:82-85)", () => {
    const zip = buildZip([
      { name: "assets/1.png", data: bytes("1") },
      { name: "assets/2.png", data: bytes("2") },
      { name: "assets/3.png", data: bytes("3") },
    ]);
    expect(() =>
      walk(zip, { maxEntryBytes: 64, maxTotalBytes: 256, maxEntries: 2 }),
    ).toThrow(
      new BadRequestError("archive contains more than 2 entries"),
    );
  });
});

describe("readEachZip — structural traversal guard (:129-145)", () => {
  const cases: Array<[ZipEntrySpec, string]> = [
    [{ name: "../evil.png", data: bytes("x") }, "../evil.png"],
    [{ name: "assets/../../evil.png", data: bytes("x") }, "assets/../../evil.png"],
    [{ name: "back\\slash.png", data: bytes("x") }, "back\\slash.png"],
    [{ name: "/abs.png", data: bytes("x") }, "/abs.png"],
    [{ name: "C:drive.png", data: bytes("x") }, "C:drive.png"],
  ];
  for (const [entry, name] of cases) {
    test(`refuses ${name}`, () => {
      const zip = buildZip([entry]);
      expect(() => walk(zip)).toThrow(
        new BadRequestError(`archive contains an unsafe entry path: ${name}`),
      );
    });
  }

  test("the rendered name truncates at 100 chars with the ellipsis (:147-152)", () => {
    const long = "../" + "x".repeat(200) + ".png"; // unsafe AND over 100 chars
    const zip = buildZip([{ name: long, data: bytes("x") }]);
    try {
      walk(zip);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestError);
      const msg = (e as Error).message;
      expect(msg.startsWith("archive contains an unsafe entry path: ")).toBe(true);
      expect(msg.length).toBe("archive contains an unsafe entry path: ".length + 100 + 1);
      expect(msg.endsWith("…")).toBe(true);
    }
  });
});

describe("readEachZip — malformed archives (the ZipFormatError/IOException class)", () => {
  test("a bad local-header signature is a format error, not a budget error", () => {
    const zip = buildZip([{ name: "a.png", data: bytes("x") }]);
    zip[3] = 0x00; // corrupt the first local signature (PK\x03\x04)
    expect(() => walk(zip)).toThrow(ZipFormatError);
  });

  test("truncated archive is a format error", () => {
    const zip = buildZip([{ name: "a.png", data: new Uint8Array(64) }]);
    expect(() => walk(zip.subarray(0, 20))).toThrow(ZipFormatError);
  });

  test("CRC mismatch is a format error (ZipInputStream verification parity)", () => {
    const zip = buildZip([{ name: "assets/a.png", data: bytes("real"), crcOverride: 0xdeadbeef }]);
    expect(() => walk(zip)).toThrow(/failed CRC verification/);
    expect(() => walk(zip)).toThrow(ZipFormatError);
  });

  test("encrypted entries (flag bit 0) fail as the not-a-ZIP class", () => {
    const zip = buildZip([{ name: "assets/a.png", data: bytes("x"), flagsOverride: 0x1 }]);
    expect(() => walk(zip)).toThrow(ZipFormatError);
  });

  test("an unknown compression method is a format error", () => {
    const zip = buildZip([{ name: "a.png", data: bytes("x"), method: 0 }]);
    zip[8] = 99; // method field: local header offset 8 (after sig+version+flags)
    expect(() => walk(zip)).toThrow(/unsupported compression method 99/);
  });
});

describe("readEachZip — disclosed fail-closed deviations", () => {
  test("data-descriptor (streamed) entries are refused with a named 400", () => {
    // flag bit 3: sizes live in a trailing descriptor — ZipInputStream
    // ACCEPTS this layout; the port refuses it (disclosed deviation)
    const zip = buildZip([{ name: "assets/a.png", data: bytes("x"), flagsOverride: 0x8 }]);
    expect(() => walk(zip)).toThrow(
      new BadRequestError(
        "archive uses streamed entries (data descriptors) — unsupported",
      ),
    );
  });
});

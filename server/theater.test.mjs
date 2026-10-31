import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createTheater } from "./theater.mjs";

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "theater-"));
const T = createTheater({ vaultDir: () => vault });
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const video = Buffer.from(Array.from({ length: 2500 }, (_, i) => i % 251));
const pieces = [video.subarray(0, 1000), video.subarray(1000, 2000), video.subarray(2000)];
const job = { shelf: "Kai's films", name: "skate.mp4", size: video.length, modified: Date.UTC(2026, 5, 1) };

test("an upload comes in pieces, refuses a damaged one, and carries on after a break", () => {
  assert.deepEqual(T.uploadPiece({ ...job, offset: 0, sha256: sha(pieces[0]) }, pieces[0]), { have: 1000, done: false, path: null });
  assert.throws(() => T.uploadPiece({ ...job, offset: 1000, sha256: sha(pieces[0]) }, pieces[1]), /damaged/);
  // the connection dropped: the phone asks where it got to
  assert.deepEqual(T.uploadState(job), { have: 1000 });
  // a piece sent twice is ignored, not appended
  assert.equal(T.uploadPiece({ ...job, offset: 0, sha256: sha(pieces[0]) }, pieces[0]).have, 1000);
  T.uploadPiece({ ...job, offset: 1000, sha256: sha(pieces[1]) }, pieces[1]);
  const end = T.uploadPiece({ ...job, offset: 2000, sha256: sha(pieces[2]) }, pieces[2]);
  assert.equal(end.done, true);
  assert.equal(end.path, path.join(vault, "Videos", "Kai's films", "skate.mp4"));
  assert.deepEqual(fs.readFileSync(end.path), video);
  // it keeps the phone's own date
  assert.equal(new Date(fs.statSync(end.path).mtimeMs).getUTCMonth(), 5);
});

test("only videos are taken, and names can't climb out", () => {
  assert.throws(() => T.uploadPiece({ ...job, name: "notes.txt", offset: 0 }, pieces[0]), /isn't a video/);
  const r = T.uploadPiece({ ...job, shelf: "../../escape", name: "../x.mp4", size: 10, offset: 0 }, Buffer.alloc(10));
  assert.ok(r.path.startsWith(path.join(vault, "Videos") + path.sep), r.path);
});

test("the list has shelves, the phone's share-menu videos, and knows what's kept already", () => {
  fs.mkdirSync(path.join(vault, "From devices"), { recursive: true });
  fs.writeFileSync(path.join(vault, "From devices", "shared.MOV"), "1234567");
  fs.writeFileSync(path.join(vault, "From devices", "photo.jpg"), "not a video");
  const l = T.list();
  assert.deepEqual(l.shelves, ["escape", "Kai's films", "From devices"]);
  assert.deepEqual(l.videos.map((v) => v.name).sort(), ["shared", "skate", "x"]);
  const skate = l.videos.find((v) => v.name === "skate");
  assert.equal(skate.shelf, "Kai's films");
  assert.deepEqual(
    T.have([
      { name: "SKATE.mp4", size: video.length },
      { name: "skate.mp4", size: 99 },
      { name: "other.mp4", size: 7 },
    ]).map(Boolean),
    [true, false, false],
  );
});

test("favourites and thumbnails follow a video when it moves shelf", () => {
  const skate = T.list().videos.find((v) => v.name === "skate");
  T.setFav(skate.id, true);
  T.setThumb(skate.id, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 12.34);
  const moved = T.moveTo(skate.path, "Best");
  assert.equal(moved, path.join(vault, "Videos", "Best", "skate.mp4"));
  const again = T.list().videos.find((v) => v.name === "skate");
  assert.equal(again.shelf, "Best");
  assert.equal(again.fav, true);
  assert.equal(again.thumb, 1);
  assert.equal(again.seconds, 12.3);
  assert.throws(() => T.setThumb(skate.id, Buffer.from("png?"), 0), /JPEG/);
  assert.throws(() => T.moveTo(path.join(vault, "elsewhere.mp4"), "Best"), /isn't there/);
});

const assert = require("assert");
const {
  chunkPages,
  validateCollectionName,
  validateItemName,
  pickRandom,
  nameAtTick,
  formatTime,
} = require("../miniprogram/utils/format.js");
const { planDefaultSeed, keepsCloudImage, cloudFilesToDelete } = require("../miniprogram/utils/db.js");
const {
  SEED_NAME,
  callerOpenid,
  pickTemplate,
  pickSeedPlans,
  planSeedCollection,
  planSeedWrites,
  planSeedItem,
  partitionCollections,
} = require("../../travel-cat/cloudfunctions/eatwhatSeed/seed.js");
const { cloudPathOf, bucketOf, mergeStorageRule, pickTemplates, runPrepare } = require("./prepare-samples.js");

assert.deepStrictEqual(chunkPages([], 6), []);
assert.deepStrictEqual(chunkPages(null, 6), []);
assert.deepStrictEqual(
  chunkPages([1, 2, 3, 4, 5, 6], 6),
  [[1, 2, 3, 4, 5, 6]]
);
assert.deepStrictEqual(
  chunkPages([1, 2, 3, 4, 5, 6, 7], 6),
  [[1, 2, 3, 4, 5, 6], [7]]
);
assert.strictEqual(chunkPages(["a", "b", "c"], 0).length, 1);

const created = validateCollectionName("  午餐  ", ["晚餐"]);
assert.strictEqual(created.ok, true);
assert.strictEqual(created.name, "午餐");
assert.strictEqual(validateCollectionName("   ", []).ok, false);
assert.strictEqual(validateCollectionName("午餐", ["午餐"]).ok, false);
assert.strictEqual(validateCollectionName("午餐", ["午餐"]).message, "已有同名清单");
assert.strictEqual(validateCollectionName("", []).message, "请填写清单名称");
assert.strictEqual(validateCollectionName("啊".repeat(20), []).ok, true);
assert.strictEqual(validateCollectionName("啊".repeat(21), []).ok, false);
assert.strictEqual(validateCollectionName("午餐", ["午餐", "晚餐"], "午餐").ok, true);
assert.strictEqual(validateCollectionName("晚餐", ["午餐", "晚餐"], "午餐").ok, false);

assert.strictEqual(validateItemName(" 兰州拉面 ").ok, true);
assert.strictEqual(validateItemName(" 兰州拉面 ").name, "兰州拉面");
assert.strictEqual(validateItemName("").ok, false);
assert.strictEqual(validateItemName("面".repeat(40)).ok, true);
assert.strictEqual(validateItemName("面".repeat(41)).ok, false);

const items = [{ name: "a" }, { name: "b" }, { name: "c" }];
assert.strictEqual(pickRandom(items, () => 0).name, "a");
assert.strictEqual(pickRandom(items, () => 0.999).name, "c");
assert.strictEqual(pickRandom(items, () => 1).name, "c");
assert.strictEqual(pickRandom([], () => 0.2), null);
const names = new Set();
for (let i = 0; i < 200; i += 1) {
  const picked = pickRandom(items);
  assert.ok(items.indexOf(picked) >= 0);
  names.add(picked.name);
}
assert.ok(names.size >= 1);

const tagged = [{ _id: "a", name: "a" }, { _id: "b", name: "b" }, { _id: "c", name: "c" }];
assert.strictEqual(pickRandom(tagged, () => 0, tagged[0])._id, "b");
assert.strictEqual(pickRandom(tagged, () => 0, "a")._id, "b");
assert.strictEqual(pickRandom(tagged, () => 0.999, tagged[2])._id, "b");
assert.strictEqual(pickRandom([tagged[0]], () => 0, tagged[0])._id, "a");
let previous = pickRandom(tagged);
for (let i = 0; i < 80; i += 1) {
  const next = pickRandom(tagged, null, previous);
  assert.ok(next && next._id !== previous._id);
  previous = next;
}

assert.strictEqual(nameAtTick(["面", "饭"], 0), "面");
assert.strictEqual(nameAtTick(["面", "饭"], 1), "饭");
assert.strictEqual(nameAtTick(["面", "饭"], 3), "饭");
assert.strictEqual(nameAtTick(["面", "饭"], -1), "饭");
assert.strictEqual(nameAtTick([], 2), "");

const stamp = new Date(2026, 9, 24, 9, 5).getTime();
assert.strictEqual(formatTime(stamp), "10月24日 09:05");
assert.strictEqual(formatTime("not-a-date"), "");

const fresh = planDefaultSeed([], null);
assert.strictEqual(fresh.seed, true);
assert.strictEqual(fresh.markSeeded, false);

const already = planDefaultSeed([{ name: "做饭吃" }], null);
assert.strictEqual(already.seed, false);
assert.strictEqual(already.markSeeded, true);

const seeded = planDefaultSeed([], { seeded: true });
assert.strictEqual(seeded.seed, false);
assert.strictEqual(seeded.markSeeded, false);

const seededWithData = planDefaultSeed([{ name: "外卖" }], { seeded: true });
assert.strictEqual(seededWithData.seed, false);
assert.strictEqual(seededWithData.markSeeded, false);

const partial = planDefaultSeed([{ name: "做饭吃清单示例", seedCopy: true }], null);
assert.strictEqual(partial.seed, true);
assert.strictEqual(partial.markSeeded, false);

const systemOnly = planDefaultSeed([{ name: "做饭吃", is_system: true }], null);
assert.strictEqual(systemOnly.seed, false);
assert.strictEqual(systemOnly.markSeeded, true);

assert.strictEqual(keepsCloudImage({ sharedImage: true, imageFileId: "a" }), true);
assert.strictEqual(keepsCloudImage({ is_system: true, imageFileId: "a" }), true);
assert.strictEqual(keepsCloudImage({ imageFileId: "a" }), false);
assert.deepStrictEqual(
  cloudFilesToDelete([
    { imageFileId: "shared", sharedImage: true },
    { imageFileId: "mine" },
    { imageFileId: "system", is_system: true },
    { imageFileId: "mine" },
  ]),
  ["mine"]
);

assert.strictEqual(SEED_NAME, "做饭吃清单示例");
assert.strictEqual(planSeedCollection("openid", 1).name, "做饭吃清单示例");
assert.strictEqual(planSeedCollection("openid", 1, "外卖").name, "外卖");
assert.strictEqual(planSeedCollection("openid", 1, "午餐").name, "午餐");
assert.strictEqual(planSeedCollection("openid", 1).seedCopy, true);
assert.strictEqual(planSeedCollection("openid", 1).is_system, false);
const seedPlans = pickSeedPlans([
  { _id: "lunch", name: "午餐", is_system: true },
  { _id: "other", name: "别的", is_system: true },
  { _id: "takeout", name: "外卖", is_system: true },
  { _id: "cook", name: "做饭吃", is_system: true },
  { _id: "copy", name: "外卖", seedCopy: true },
]);
assert.deepStrictEqual(
  seedPlans.map((plan) => plan.seedName),
  ["做饭吃清单示例", "外卖", "午餐"]
);
assert.strictEqual(seedPlans[1].template._id, "takeout");
assert.strictEqual(seedPlans[2].template._id, "lunch");
const seedWrites = planSeedWrites(
  seedPlans,
  [{ _id: "existing", name: "做饭吃清单示例", seedCopy: true }],
  "openid",
  100
);
assert.strictEqual(seedWrites[0].existingId, "existing");
assert.strictEqual(seedWrites[0].collection.name, "做饭吃清单示例");
assert.strictEqual(seedWrites[1].existingId, "");
assert.strictEqual(seedWrites[1].collection.name, "外卖");
assert.strictEqual(seedWrites[1].collection.seedCopy, true);
assert.strictEqual(seedWrites[1].collection.is_system, false);
assert.ok(seedWrites[0].collection.createdAt > seedWrites[1].collection.createdAt);
assert.ok(seedWrites[1].collection.createdAt > seedWrites[2].collection.createdAt);
assert.deepStrictEqual(
  pickTemplates([
    { name: "午餐", is_system: true },
    { name: "外卖", is_system: true },
    { name: "做饭吃", is_system: true },
    { name: "别的", is_system: true },
  ]).map((item) => item.name),
  ["做饭吃", "外卖", "午餐"]
);
const copied = planSeedItem(
  { name: "番茄炒蛋", imageFileId: "cloud://a", is_system: true, createdAt: 5 },
  "col",
  "openid",
  9
);
assert.strictEqual(copied.name, "番茄炒蛋");
assert.strictEqual(copied.imageFileId, "cloud://a");
assert.strictEqual(copied.sharedImage, true);
assert.strictEqual(copied.is_system, false);
assert.strictEqual(copied._openid, "openid");
assert.strictEqual(copied.collectionId, "col");
assert.strictEqual(copied.createdAt, 5);
assert.strictEqual(planSeedItem({ name: "白粥", is_system: true }, "col", "openid", 9).sharedImage, false);
assert.strictEqual(callerOpenid({ FROM_OPENID: "from", OPENID: "own" }), "from");
assert.strictEqual(callerOpenid({ OPENID: "own" }), "own");
assert.strictEqual(
  pickTemplate(
    [
      { name: "别的", is_system: true },
      { name: "做饭吃", is_system: true },
    ],
    "做饭吃"
  ).name,
  "做饭吃"
);
const parts = partitionCollections([{ seedCopy: true }, { is_system: true }, { name: "外卖" }]);
assert.strictEqual(parts.seedCopies.length, 1);
assert.strictEqual(parts.own.length, 2);

assert.strictEqual(cloudPathOf("cloud://env.bucket/eatwhat/a.jpg"), "eatwhat/a.jpg");
assert.strictEqual(bucketOf("cloud://env.bucket/eatwhat/a.jpg"), "bucket");
assert.strictEqual(mergeStorageRule("READONLY", null).changed, false);
const merged = mergeStorageRule("PRIVATE", null);
assert.strictEqual(merged.changed, true);
assert.ok(merged.rule.read.indexOf("eatwhat\\/samples") >= 0);
assert.strictEqual(mergeStorageRule("CUSTOM", JSON.stringify(merged.rule)).changed, false);

async function testPrepare() {
  const updates = [];
  const removed = [];
  let stored = null;
  const result = await runPrepare({
    listCollections: async () => [{ _id: "col", name: "做饭吃", is_system: true }],
    listItems: async () => [
      { _id: "a", name: "面", imageFileId: "cloud://env.bucket/eatwhat/a.jpg" },
      { _id: "b", name: "饭", imageFileId: "" },
      { _id: "c", name: "粥", imageFileId: "cloud://env.bucket/eatwhat/samples/c.jpg", is_system: true },
    ],
    updateItem: async (id, data) => updates.push({ id: id, data: data }),
    download: async () => Buffer.from("img"),
    upload: async (cloudPath) => "cloud://env.bucket/" + cloudPath,
    removeFiles: async (list) => removed.push.apply(removed, list),
    getStorageRule: async () => ({ AclTag: "PRIVATE", Rule: null }),
    setStorageRule: async (bucket, rule) => {
      stored = { bucket: bucket, rule: rule };
    },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.moved, 1);
  assert.strictEqual(result.removed, 1);
  assert.strictEqual(result.skipped, 1);
  assert.deepStrictEqual(removed, ["cloud://env.bucket/eatwhat/a.jpg"]);
  const imageUpdate = updates.find((item) => item.id === "a");
  assert.strictEqual(imageUpdate.data.imageFileId, "cloud://env.bucket/eatwhat/samples/a.jpg");
  assert.strictEqual(imageUpdate.data.is_system, true);
  assert.strictEqual(updates.find((item) => item.id === "b").data.is_system, true);
  assert.strictEqual(stored.bucket, "bucket");
  assert.ok(stored.rule.read.indexOf("eatwhat\\/samples") >= 0);
}

testPrepare()
  .then(() => {
    console.log("format checks passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

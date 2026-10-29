const cloudConfig = require("../config/cloud.js");
const { ensureCloud, getCloud } = require("./cloud.js");
const { deleteCloudFiles } = require("./image.js");

const COLLECTIONS = cloudConfig.collections.collections;
const ITEMS = cloudConfig.collections.items;
const USERS = cloudConfig.collections.users;
const PAGE_LIMIT = 100;
const MAX_ITEMS = 500;

let defaultSeed = null;
let defaultSeeded = false;

async function collection(name) {
  await ensureCloud();
  return getCloud().database().collection(name);
}

function byCreatedDesc(a, b) {
  return (b.createdAt || 0) - (a.createdAt || 0);
}

function isIndexError(err) {
  const msg = (err && (err.errMsg || err.message)) || "";
  return /index|索引/i.test(msg);
}

async function listCollections() {
  const col = await collection(COLLECTIONS);
  try {
    const res = await col.orderBy("createdAt", "desc").limit(100).get();
    return res.data || [];
  } catch (err) {
    if (!isIndexError(err)) throw err;
    const res = await col.limit(100).get();
    return (res.data || []).slice().sort(byCreatedDesc);
  }
}

function keepsCloudImage(item) {
  return !!(item && (item.sharedImage || item.is_system));
}

function cloudFilesToDelete(items) {
  const ids = [];
  (items || []).forEach((item) => {
    if (!item || !item.imageFileId || keepsCloudImage(item)) return;
    if (ids.indexOf(item.imageFileId) < 0) ids.push(item.imageFileId);
  });
  return ids;
}

function planDefaultSeed(collections, user) {
  const list = Array.isArray(collections) ? collections : [];
  if (user && user.seeded) {
    return { collections: list, seed: false, markSeeded: false };
  }
  const hasOwn = list.some((item) => item && !item.seedCopy);
  if (hasOwn) {
    return { collections: list, seed: false, markSeeded: true };
  }
  return { collections: list, seed: true, markSeeded: false };
}

async function ensureDefaultCollections() {
  if (defaultSeeded) return listCollections();
  if (!defaultSeed) {
    defaultSeed = seedDefaultCollection().finally(() => {
      defaultSeed = null;
    });
  }
  return defaultSeed;
}

async function seedDefaultCollection() {
  const [user, existing] = await Promise.all([getUser(), listCollections()]);
  const plan = planDefaultSeed(existing, user);
  if (plan.seed) {
    await seedFromExample();
    defaultSeeded = true;
    return listCollections();
  }
  if (plan.markSeeded) await saveUser({ seeded: true });
  defaultSeeded = true;
  return plan.collections;
}

async function seedFromExample() {
  await ensureCloud();
  const res = await getCloud().callFunction({
    name: cloudConfig.seedFunction,
    data: {},
  });
  const result = (res && res.result) || null;
  if (!result || result.ok === false) {
    throw new Error((result && result.message) || "示例清单复制失败");
  }
}

async function createCollection(name) {
  const now = Date.now();
  const data = { name, createdAt: now, updatedAt: now };
  const res = await (await collection(COLLECTIONS)).add({ data });
  return { _id: res._id, ...data };
}

async function renameCollection(id, name) {
  const updatedAt = Date.now();
  await (await collection(COLLECTIONS)).doc(id).update({
    data: { name, updatedAt },
  });
  return updatedAt;
}

async function listItems(collectionId) {
  try {
    return await pageItems(collectionId, true);
  } catch (err) {
    if (!isIndexError(err)) throw err;
    const rows = await pageItems(collectionId, false);
    rows.sort(byCreatedDesc);
    return rows;
  }
}

async function pageItems(collectionId, ordered) {
  const all = [];
  let skip = 0;
  const col = await collection(ITEMS);
  while (all.length < MAX_ITEMS) {
    const limit = Math.min(PAGE_LIMIT, MAX_ITEMS - all.length);
    let query = col.where({ collectionId });
    if (ordered) query = query.orderBy("createdAt", "desc");
    const res = await query.skip(skip).limit(limit).get();
    const batch = res.data || [];
    all.push.apply(all, batch);
    if (batch.length < limit) break;
    skip += batch.length;
  }
  return all;
}

async function createItem(collectionId, name, imageFileId) {
  const now = Date.now();
  const data = {
    collectionId,
    name,
    imageFileId: imageFileId || "",
    sharedImage: false,
    createdAt: now,
    updatedAt: now,
  };
  const res = await (await collection(ITEMS)).add({ data });
  return { _id: res._id, ...data };
}

async function updateItem(id, patch) {
  const data = {
    name: patch.name,
    imageFileId: patch.imageFileId || "",
    sharedImage: !!patch.sharedImage,
    updatedAt: Date.now(),
  };
  await (await collection(ITEMS)).doc(id).update({ data });
  return data;
}

async function removeItem(item) {
  if (!item || !item._id) return;
  const fileIds = cloudFilesToDelete([item]);
  if (fileIds.length) await deleteCloudFiles(fileIds);
  await (await collection(ITEMS)).doc(item._id).remove();
}

async function removeCollection(collectionId) {
  const cols = await collection(COLLECTIONS);
  const snap = await cols.doc(collectionId).get();
  if (snap && snap.data && snap.data.is_system) {
    throw new Error("示例清单不能删除");
  }
  const items = await collection(ITEMS);
  for (let guard = 0; guard < 40; guard += 1) {
    const res = await items.where({ collectionId }).limit(20).get();
    const batch = res.data || [];
    if (!batch.length) break;
    await deleteCloudFiles(cloudFilesToDelete(batch));
    await Promise.all(batch.map((item) => items.doc(item._id).remove()));
  }
  await cols.doc(collectionId).remove();
}

async function getUser() {
  const res = await (await collection(USERS)).limit(1).get();
  return (res.data && res.data[0]) || null;
}

async function saveUser(patch) {
  const now = Date.now();
  const existing = await getUser();
  if (existing) {
    const data = { updatedAt: now };
    if (patch.nickName != null) data.nickName = patch.nickName;
    if (patch.avatarFileId != null) data.avatarFileId = patch.avatarFileId;
    if (patch.seeded != null) data.seeded = !!patch.seeded;
    if (patch.guideDone != null) data.guideDone = !!patch.guideDone;
    await (await collection(USERS)).doc(existing._id).update({ data });
    return Object.assign({}, existing, data);
  }
  const data = {
    nickName: patch.nickName || "",
    avatarFileId: patch.avatarFileId || "",
    seeded: !!patch.seeded,
    guideDone: !!patch.guideDone,
    updatedAt: now,
  };
  const res = await (await collection(USERS)).add({ data });
  return Object.assign({ _id: res._id }, data);
}

module.exports = {
  keepsCloudImage,
  cloudFilesToDelete,
  planDefaultSeed,
  listCollections,
  ensureDefaultCollections,
  createCollection,
  renameCollection,
  listItems,
  createItem,
  updateItem,
  removeItem,
  removeCollection,
  getUser,
  saveUser,
};

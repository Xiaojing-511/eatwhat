const PAGE_SIZE = 9;
const COLLECTION_NAME_MAX = 20;
const ITEM_NAME_MAX = 40;

function normalizeName(name) {
  if (name == null) return "";
  return String(name).trim();
}

function charCount(text) {
  return Array.from(text).length;
}

function validateCollectionName(name, existingNames, ignoreName) {
  const trimmed = normalizeName(name);
  if (!trimmed) return { ok: false, message: "请填写清单名称" };
  if (charCount(trimmed) > COLLECTION_NAME_MAX) {
    return { ok: false, message: "清单名称最多 20 个字" };
  }
  const ignore = ignoreName == null ? null : normalizeName(ignoreName);
  const names = Array.isArray(existingNames) ? existingNames : [];
  const duplicated = names.some((item) => {
    const current = normalizeName(item);
    if (ignore != null && current === ignore) return false;
    return current === trimmed;
  });
  if (duplicated) return { ok: false, message: "已有同名清单" };
  return { ok: true, name: trimmed };
}

function validateItemName(name) {
  const trimmed = normalizeName(name);
  if (!trimmed) return { ok: false, message: "请填写名称" };
  if (charCount(trimmed) > ITEM_NAME_MAX) {
    return { ok: false, message: "名称最多 40 个字" };
  }
  return { ok: true, name: trimmed };
}

function chunkPages(items, pageSize) {
  const list = Array.isArray(items) ? items : [];
  const size = pageSize > 0 ? Math.floor(pageSize) : PAGE_SIZE;
  const pages = [];
  for (let i = 0; i < list.length; i += size) {
    pages.push(list.slice(i, i + size));
  }
  return pages;
}

function samePick(item, exclude) {
  if (item == null || exclude == null) return false;
  if (item === exclude) return true;
  if (typeof exclude === "string") return item._id === exclude;
  if (exclude._id != null && item._id != null) return item._id === exclude._id;
  return false;
}

function pickRandom(items, randomFn, exclude) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const filtered = exclude == null ? list : list.filter((item) => !samePick(item, exclude));
  const source = filtered.length ? filtered : list;
  const raw = typeof randomFn === "function" ? randomFn() : Math.random();
  const ratio = Number.isFinite(raw) ? raw : 0;
  const clamped = Math.min(Math.max(ratio, 0), 0.999999);
  const index = Math.min(source.length - 1, Math.floor(clamped * source.length));
  return source[index];
}

function nameAtTick(names, tick) {
  const list = Array.isArray(names) ? names : [];
  if (!list.length) return "";
  const size = list.length;
  const step = Number.isFinite(Number(tick)) ? Number(tick) : 0;
  const index = ((step % size) + size) % size;
  return list[index] == null ? "" : String(list[index]);
}

function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

function formatTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return (
    date.getMonth() +
    1 +
    "月" +
    date.getDate() +
    "日 " +
    pad2(date.getHours()) +
    ":" +
    pad2(date.getMinutes())
  );
}

module.exports = {
  PAGE_SIZE,
  COLLECTION_NAME_MAX,
  ITEM_NAME_MAX,
  normalizeName,
  validateCollectionName,
  validateItemName,
  chunkPages,
  pickRandom,
  nameAtTick,
  formatTime,
};

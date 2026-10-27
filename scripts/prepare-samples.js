const TEMPLATE_NAMES = ["做饭吃", "外卖", "午餐"];
const TEMPLATE_NAME = TEMPLATE_NAMES[0];
const SAMPLE_PREFIX = "eatwhat/samples/";
const SAMPLE_READ = "/^eatwhat\\/samples\\//.test(resource.path)";
const CREATOR_ACCESS = "resource.openid == auth.openid || resource.openid == auth.uid";

function cloudPathOf(fileID) {
  if (!fileID || fileID.indexOf("cloud://") !== 0) return "";
  const rest = fileID.slice("cloud://".length);
  const slash = rest.indexOf("/");
  if (slash < 0) return "";
  return rest.slice(slash + 1);
}

function bucketOf(fileID) {
  if (!fileID || fileID.indexOf("cloud://") !== 0) return "";
  const rest = fileID.slice("cloud://".length);
  const slash = rest.indexOf("/");
  const host = slash < 0 ? rest : rest.slice(0, slash);
  const dot = host.indexOf(".");
  if (dot < 0) return "";
  return host.slice(dot + 1);
}

function isSamplePath(cloudPath) {
  return !!cloudPath && cloudPath.indexOf(SAMPLE_PREFIX) === 0;
}

function canRetire(fileID) {
  const cloudPath = cloudPathOf(fileID);
  return cloudPath.indexOf("eatwhat/") === 0 && !isSamplePath(cloudPath);
}

function sampleCloudPath(itemId, cloudPath) {
  const matched = /\.[a-zA-Z0-9]+$/.exec(cloudPath || "");
  const ext = matched ? matched[0].toLowerCase() : ".jpg";
  return SAMPLE_PREFIX + itemId + ext;
}

function pickTemplates(collections) {
  const list = (Array.isArray(collections) ? collections : []).filter((item) => item && item.is_system);
  const named = [];
  TEMPLATE_NAMES.forEach((name) => {
    const found = list.find((item) => item.name === name);
    if (found && named.indexOf(found) < 0) named.push(found);
  });
  if (named.length) return named;
  return list.length ? [list[0]] : [];
}

function pickTemplate(collections) {
  const picked = pickTemplates(collections);
  return picked[0] || null;
}

function presetStorageRule(aclTag) {
  if (aclTag === "READONLY") return { read: true, write: CREATOR_ACCESS };
  if (aclTag === "ADMINWRITE") return { read: true, write: false };
  if (aclTag === "ADMINONLY") return { read: false, write: false };
  if (aclTag === "PRIVATE") return { read: CREATOR_ACCESS, write: CREATOR_ACCESS };
  return null;
}

function parseStorageRule(ruleText) {
  if (!ruleText) return null;
  if (typeof ruleText === "object") return ruleText;
  return JSON.parse(ruleText);
}

function opensSamples(read) {
  if (read === true || read === "true") return true;
  return typeof read === "string" && read.indexOf("eatwhat\\/samples") >= 0;
}

function mergeStorageRule(aclTag, ruleText) {
  let current = null;
  if (aclTag === "CUSTOM") current = parseStorageRule(ruleText);
  if (!current) current = presetStorageRule(aclTag) || { read: CREATOR_ACCESS, write: CREATOR_ACCESS };
  if (opensSamples(current.read)) return { changed: false, rule: current };
  const previous = current.read === false || current.read === "false" || !current.read ? CREATOR_ACCESS : current.read;
  return {
    changed: true,
    rule: Object.assign({}, current, { read: SAMPLE_READ + " || (" + previous + ")" }),
  };
}

function needsFlagOnly(item) {
  const fileID = (item && item.imageFileId) || "";
  const cloudPath = cloudPathOf(fileID);
  return !fileID || !cloudPath || isSamplePath(cloudPath);
}

async function runPrepare(io) {
  const templates = pickTemplates(await io.listCollections());
  if (!templates.length) return { ok: false, message: "没有系统示例清单" };

  const failures = [];
  let updated = 0;
  let moved = 0;
  let removed = 0;
  let skipped = 0;
  let knownFileID = "";
  const collectionIds = [];

  for (let t = 0; t < templates.length; t += 1) {
    const part = await prepareTemplate(io, templates[t]);
    updated += part.updated;
    moved += part.moved;
    removed += part.removed;
    skipped += part.skipped;
    if (part.knownFileID) knownFileID = part.knownFileID;
    failures.push.apply(failures, part.failures);
    collectionIds.push(templates[t]._id);
  }

  const storage = await applyStorageRule(io, knownFileID);
  return {
    ok: failures.length === 0 && storage.ok,
    collectionId: collectionIds[0],
    collectionIds: collectionIds,
    updated: updated,
    moved: moved,
    removed: removed,
    skipped: skipped,
    failures: failures,
    storage: storage,
    message: storage.ok ? "" : storage.message,
  };
}

async function prepareTemplate(io, template) {
  const items = (await io.listItems(template._id)) || [];
  const now = Date.now();
  const failures = [];
  let updated = 0;
  let moved = 0;
  let removed = 0;
  let skipped = 0;
  const groups = {};
  const plain = [];
  let knownFileID = "";

  items.forEach((item) => {
    if (!item || !item._id) return;
    const fileID = item.imageFileId || "";
    if (fileID && cloudPathOf(fileID)) knownFileID = fileID;
    if (needsFlagOnly(item)) plain.push(item);
    else if (groups[fileID]) groups[fileID].push(item);
    else groups[fileID] = [item];
  });

  for (let i = 0; i < plain.length; i += 1) {
    const item = plain[i];
    if (item.is_system) {
      skipped += 1;
      continue;
    }
    try {
      await io.updateItem(item._id, { is_system: true, updatedAt: now });
      updated += 1;
    } catch (err) {
      failures.push({ id: item._id, message: (err && err.message) || "更新失败" });
    }
  }

  const fileIDs = Object.keys(groups);
  for (let i = 0; i < fileIDs.length; i += 1) {
    const fileID = fileIDs[i];
    const group = groups[fileID];
    try {
      const content = await io.download(fileID);
      if (!content) throw new Error("下载示例图片失败");
      const cloudPath = sampleCloudPath(group[0]._id, cloudPathOf(fileID));
      const newFileID = await io.upload(cloudPath, content);
      if (!newFileID) throw new Error("上传示例图片失败");
      knownFileID = newFileID;
      for (let j = 0; j < group.length; j += 1) {
        await io.updateItem(group[j]._id, {
          is_system: true,
          imageFileId: newFileID,
          updatedAt: now,
        });
        updated += 1;
      }
      moved += 1;
      if (canRetire(fileID)) {
        await io.removeFiles([fileID]);
        removed += 1;
      }
    } catch (err) {
      const message = (err && err.message) || "搬运图片失败";
      group.forEach((item) => failures.push({ id: item._id, message: message }));
    }
  }

  return {
    updated: updated,
    moved: moved,
    removed: removed,
    skipped: skipped,
    failures: failures,
    knownFileID: knownFileID,
  };
}

async function applyStorageRule(io, fileID) {
  if (!io.getStorageRule || !io.setStorageRule) {
    return { ok: false, changed: false, message: "没有存储权限接口" };
  }
  let bucket = bucketOf(fileID);
  try {
    if (!bucket && io.getBucket) bucket = await io.getBucket();
    if (!bucket) return { ok: false, changed: false, message: "没有示例图片，无法确定存储桶" };
    const current = await io.getStorageRule(bucket);
    const merged = mergeStorageRule(current && current.AclTag, current && current.Rule);
    if (!merged.changed) {
      return { ok: true, changed: false, bucket: bucket, aclTag: current.AclTag };
    }
    await io.setStorageRule(bucket, merged.rule);
    return { ok: true, changed: true, bucket: bucket };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      bucket: bucket,
      message: (err && err.message) || "存储权限更新失败",
    };
  }
}

module.exports = {
  TEMPLATE_NAME,
  TEMPLATE_NAMES,
  SAMPLE_PREFIX,
  SAMPLE_READ,
  cloudPathOf,
  bucketOf,
  isSamplePath,
  canRetire,
  sampleCloudPath,
  pickTemplate,
  pickTemplates,
  mergeStorageRule,
  runPrepare,
};

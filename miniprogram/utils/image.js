const cloudConfig = require("../config/cloud.js");
const { ensureCloud, getCloud } = require("./cloud.js");

function isCancel(err) {
  const msg = (err && (err.errMsg || err.message)) || "";
  return /cancel/i.test(msg);
}

function chooseImage() {
  return new Promise((resolve, reject) => {
    const fail = (err) => {
      if (isCancel(err)) {
        const cancelErr = new Error("cancel");
        cancelErr.cancel = true;
        reject(cancelErr);
        return;
      }
      reject(err || new Error("选择图片失败"));
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success(res) {
          const file = res.tempFiles && res.tempFiles[0];
          if (!file || !file.tempFilePath) {
            fail(new Error("未选择图片"));
            return;
          }
          resolve(file.tempFilePath);
        },
        fail,
      });
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) {
        const path = res.tempFilePaths && res.tempFilePaths[0];
        if (!path) {
          fail(new Error("未选择图片"));
          return;
        }
        resolve(path);
      },
      fail,
    });
  });
}

function compressOnce(src, options) {
  const payload = { src: src, quality: options.quality };
  if (options.compressedWidth) payload.compressedWidth = options.compressedWidth;
  return new Promise((resolve, reject) => {
    payload.success = (res) => resolve((res && res.tempFilePath) || src);
    payload.fail = reject;
    wx.compressImage(payload);
  });
}

function compressImage(src) {
  if (!src) return Promise.resolve(src);
  return compressOnce(src, { quality: 60, compressedWidth: 1080 })
    .catch(() => compressOnce(src, { quality: 60 }))
    .catch(() => src);
}

async function uploadImage(filePath, prefix) {
  await ensureCloud();
  const folder = prefix || cloudConfig.storagePrefix;
  const cloudPath = folder + Date.now() + "-" + Math.floor(Math.random() * 1000000) + ".jpg";
  const res = await getCloud().uploadFile({ cloudPath, filePath });
  if (!res || !res.fileID) throw new Error("上传失败");
  return res.fileID;
}

async function deleteCloudFiles(fileList) {
  const ids = [];
  (fileList || []).forEach((id) => {
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) return;
  await ensureCloud();
  const instance = getCloud();
  const tasks = [];
  for (let i = 0; i < ids.length; i += 50) {
    const fileListSlice = ids.slice(i, i + 50);
    tasks.push(instance.deleteFile({ fileList: fileListSlice }).catch(() => null));
  }
  await Promise.all(tasks);
}

async function tempUrlMap(fileIds) {
  const ids = [];
  (fileIds || []).forEach((id) => {
    if (typeof id === "string" && id.indexOf("cloud://") === 0 && ids.indexOf(id) < 0) ids.push(id);
  });
  const map = {};
  if (!ids.length) return map;
  await ensureCloud();
  const instance = getCloud();
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    let res;
    try {
      res = await instance.getTempFileURL({
        fileList: slice.map((fileID) => ({ fileID, maxAge: 86400 })),
      });
    } catch (err) {
      console.error(err);
      continue;
    }
    (res.fileList || []).forEach((row) => {
      if (row && row.fileID && row.tempFileURL) map[row.fileID] = row.tempFileURL;
    });
  }
  return map;
}

async function withImageUrls(items) {
  const list = items || [];
  const map = await tempUrlMap(list.map((item) => item && item.imageFileId));
  return list.map((item) => Object.assign({}, item, { imageUrl: map[item.imageFileId] || "" }));
}

module.exports = {
  chooseImage,
  compressImage,
  uploadImage,
  deleteCloudFiles,
  tempUrlMap,
  withImageUrls,
};

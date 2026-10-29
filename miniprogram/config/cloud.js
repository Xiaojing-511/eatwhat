// 环境属于 travel-cat。跨账号共享必须用 resourceAppid + resourceEnv，
// 直接 wx.cloud.init({ env }) 会在当前小程序下找不到环境，报 -501000 Environment not found。
// 资源方需把该环境共享给本小程序 AppID，并部署 cloudbase_auth 和 eatwhatSeed。
// eatwhatSeed 把 is_system 的「做饭吃」「外卖」「午餐」复制到新用户名下。
// 「做饭吃」的清单名是「做饭吃清单示例」，「外卖」和「午餐」清单名保持不变。
// 复制条目共用示例图片的 imageFileId，并写 sharedImage。删除这类记录时不删云存储文件。
// 示例图片放在 eatwhat/samples/，该目录需所有用户可读。用户自己上传的图仍在 eatwhat/。
// 清单名和存储目录都带 eatwhat 前缀，避免碰到 users / players / cards / travel-cards / audio。
// 清单 eatwhat_collections、eatwhat_items、eatwhat_users 权限为「仅创建者可读写」。
// 新用户引导完成后，eatwhat_users.guideDone 为 true，本地同时记下 eatwhat_guide_done。
// 若按创建时间排序失败，按控制台提示为 createdAt、collectionId+createdAt 建索引。
// 云函数按 is_system 查示例清单，数据变多后按控制台提示为 is_system 建索引。
module.exports = {
  resourceAppid: "wx879169840e8c5030",
  env: "cloud1-4grqnt5f5b5d8f20",
  collections: {
    collections: "eatwhat_collections",
    items: "eatwhat_items",
    users: "eatwhat_users",
  },
  storagePrefix: "eatwhat/",
  samplePrefix: "eatwhat/samples/",
  avatarPrefix: "eatwhat/avatars/",
  currentCollectionKey: "eatwhat_current_collection_id",
  guideDoneKey: "eatwhat_guide_done",
  seedFunction: "eatwhatSeed",
};

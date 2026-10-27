# 吃什么

微信小程序。把想吃的记成一张张卡片，纠结的时候从当前清单里抽一个。

## 功能

- 清单：切换、新建、重命名、删除。新用户会复制「做饭吃」「外卖」「午餐」三份示例
- 记录：一条名称，图片可选，九宫格翻页
- 抽一个：名字滚动约一秒，配点击和翻牌音效，抽出后可以再抽
- 我的：微信头像和昵称

## 本地运行

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开本仓库
2. 云环境挂在资源方小程序上（见 `miniprogram/config/cloud.js`）。资源方需把该环境共享给本小程序，并部署 `cloudbase_auth` 和 `eatwhatSeed`
3. 编译预览。首次进入会登录，并把示例清单复制到当前用户名下

示例图放在云存储 `eatwhat/samples/`，该目录需所有用户可读。用户自己上传的图在 `eatwhat/`。删掉自己的记录不会删除示例图。

## 目录

```
miniprogram/                 小程序
  pages/home/                清单、卡片、抽取
  pages/mine/                头像和昵称
  components/draw-overlay/   抽取和详情
  components/bottom-sheet/   新建、编辑、删除
  config/cloud.js            云环境与集合名
  utils/                     数据库、图片、音效
scripts/                     示例图整理与格式校验
```

清单、记录、用户分别存在 `eatwhat_collections`、`eatwhat_items`、`eatwhat_users`，权限为仅创建者可读写。
